/**
 * Inference Vitals: in-browser HR/BR from webcam.
 * Uses VitalLens (vitallens.js) when available for local rPPG (pos/chrom/g); otherwise falls back to
 * OpenCV.js face ROI + bandpass FFT. Sets window.__inferenceVitals for the engage tracker.
 */
(function (global) {
  'use strict';

  var SAMPLE_FPS = 15;
  var BUFFER_SEC = 14;
  var BUFFER_LEN = SAMPLE_FPS * BUFFER_SEC;
  var UPDATE_HZ = 1;
  var HR_MIN = 48, HR_MAX = 140;
  var BR_MIN = 8, BR_MAX = 28;
  var SMOOTH_ALPHA = 0.28;

  var greenSignal = [];
  var timestamps = [];
  var video = null;
  var canvas = null;
  var ctx = null;
  var cameraWrapper = null;
  var animId = null;
  var emitInterval = null;
  var running = false;
  var vitalLensInstance = null;
  var roi = { x: 0.28, y: 0.12, w: 0.44, h: 0.28 };
  var useOpenCV = false;
  var faceCascade = null;
  var cvReady = false;
  var lastHr = 72;
  var lastBr = 15;

  // Lightweight emotion signals (no extra model needed)
  var prevFacePixels = null;
  var faceMovement = 0;        // 0-1 arousal proxy from frame diff
  var emotionValence = 0;      // -1 to 1 from simple heuristics
  var mouthHistory = [];       // recent mouth-region brightness for smile detection
  var FACE_SMOOTH = 0.3;

  var OPENCV_JS_URL = 'https://docs.opencv.org/4.8.0/opencv.js';
  var CASCADE_URL = 'https://cdn.jsdelivr.net/gh/opencv/opencv@master/data/haarcascades/haarcascade_frontalface_default.xml';
  var CASCADE_VFS_PATH = 'haarcascade_frontalface_default.xml';

  function loadOpenCV(cb) {
    if (global.cv && global.cv.Mat) {
      cvReady = true;
      loadCascade(cb);
      return;
    }
    var script = document.createElement('script');
    script.async = true;
    script.src = OPENCV_JS_URL;
    script.onload = function () {
      function onCvReady() {
        cvReady = true;
        loadCascade(cb);
      }
      if (global.cv && global.cv.Mat) {
        onCvReady();
        return;
      }
      if (global.cv && global.cv.onRuntimeInitialized) {
        var orig = global.cv.onRuntimeInitialized;
        global.cv.onRuntimeInitialized = function () {
          if (orig) orig();
          onCvReady();
        };
        return;
      }
      if (global.Module && typeof global.Module.onRuntimeInitialized === 'function') {
        var orig = global.Module.onRuntimeInitialized;
        global.Module.onRuntimeInitialized = function () {
          if (orig) orig();
          onCvReady();
        };
        return;
      }
      setTimeout(onCvReady, 500);
    };
    script.onerror = function () { cb(); };
    document.head.appendChild(script);
  }

  function loadCascade(cb) {
    if (!cvReady || !global.cv) { cb(); return; }
    try {
      faceCascade = new global.cv.CascadeClassifier();
      if (global.cv.FS_createDataFile) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', CASCADE_URL, true);
        xhr.responseType = 'arraybuffer';
        xhr.onload = function () {
          if (xhr.status === 200 && xhr.response) {
            try {
              global.cv.FS_createDataFile('/', CASCADE_VFS_PATH, new Uint8Array(xhr.response), true, false, false);
              if (faceCascade.load('/' + CASCADE_VFS_PATH)) {
                useOpenCV = true;
                console.log('[Inference] OpenCV face model loaded — using face ROI for vitals.');
              }
            } catch (e) {}
          }
          cb();
        };
        xhr.onerror = function () { cb(); };
        xhr.send();
      } else {
        if (faceCascade.load && faceCascade.load(CASCADE_URL)) {
          useOpenCV = true;
          console.log('[Inference] OpenCV face model loaded — using face ROI for vitals.');
        }
        cb();
      }
    } catch (e) {
      cb();
    }
  }

  function getFaceROI() {
    if (!cvReady || !faceCascade || !global.cv || !canvas) return null;
    try {
      var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      var src = global.cv.matFromImageData(imageData);
      var gray = new global.cv.Mat();
      global.cv.cvtColor(src, gray, global.cv.COLOR_RGBA2GRAY);
      var faces = new global.cv.RectVector();
      var faceCascadeObj = faceCascade;
      faceCascadeObj.detectMultiScale(gray, faces, 1.2, 3);
      src.delete();
      gray.delete();
      if (faces.size() === 0) {
        faces.delete();
        return null;
      }
      var face = faces.get(0);
      var x = face.x;
      var y = face.y;
      var w = face.width;
      var h = face.height;
      faces.delete();
      var foreheadH = Math.max(20, Math.floor(h * 0.35));
      var foreheadY = y + Math.floor(h * 0.05);
      var foreheadX = x + Math.floor(w * 0.2);
      var foreheadW = Math.floor(w * 0.6);
      return { x: foreheadX, y: foreheadY, w: foreheadW, h: foreheadH };
    } catch (e) {
      return null;
    }
  }

  function sampleGreenFromROI(r) {
    if (!r) return null;
    var imageData = ctx.getImageData(r.x, r.y, r.w, r.h);
    var pixels = imageData.data;
    var sumG = 0, sumR = 0, n = 0;
    for (var i = 0; i < pixels.length; i += 4) {
      sumR += pixels[i];
      sumG += pixels[i + 1];
      n++;
    }
    var avgR = sumR / n;
    var avgG = sumG / n;
    if (avgR > 50 && avgG > 35 && avgR > avgG * 0.7) {
      return avgG;
    }
    return null;
  }

  function computeFaceSignals(faceROI) {
    if (!ctx || !canvas || !faceROI) return;
    try {
      var data = ctx.getImageData(faceROI.x, faceROI.y, faceROI.w, faceROI.h).data;
      // Frame-to-frame movement: mean absolute pixel difference
      if (prevFacePixels && prevFacePixels.length === data.length) {
        var diff = 0;
        for (var i = 0; i < data.length; i += 4) {
          diff += Math.abs(data[i] - prevFacePixels[i]) + Math.abs(data[i + 1] - prevFacePixels[i + 1]) + Math.abs(data[i + 2] - prevFacePixels[i + 2]);
        }
        var maxDiff = (data.length / 4) * 765; // 255*3 per pixel
        var rawMove = diff / maxDiff;
        faceMovement = FACE_SMOOTH * rawMove + (1 - FACE_SMOOTH) * faceMovement;
      }
      prevFacePixels = new Uint8Array(data);

      // Simple valence: lower face brightness variance as smile proxy
      // Mouth region = bottom 40% of face ROI
      var mouthY = Math.floor(faceROI.h * 0.6);
      var mouthData = ctx.getImageData(faceROI.x, faceROI.y + mouthY, faceROI.w, faceROI.h - mouthY).data;
      var sumBright = 0, sumSq = 0, mN = mouthData.length / 4;
      for (var i = 0; i < mouthData.length; i += 4) {
        var b = (mouthData[i] + mouthData[i + 1] + mouthData[i + 2]) / 3;
        sumBright += b;
        sumSq += b * b;
      }
      var meanBright = sumBright / mN;
      var varianceBright = sumSq / mN - meanBright * meanBright;
      mouthHistory.push(varianceBright);
      if (mouthHistory.length > 30) mouthHistory.shift();

      // Higher mouth variance + movement → positive valence (engaged/smiling)
      // Low variance + low movement → negative (bored/flat)
      var avgVar = 0;
      for (var i = 0; i < mouthHistory.length; i++) avgVar += mouthHistory[i];
      avgVar /= mouthHistory.length;
      var normVar = Math.min(1, avgVar / 2000);
      var raw = (normVar * 0.6 + faceMovement * 0.4) * 2 - 1;
      emotionValence = FACE_SMOOTH * raw + (1 - FACE_SMOOTH) * emotionValence;
      emotionValence = Math.max(-1, Math.min(1, emotionValence));
    } catch (e) {}
  }

  function startInference() {
    if (running) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.log('[Inference] getUserMedia not available');
      return;
    }

    loadOpenCV(function () {});

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } }
    }).then(function (stream) {
      running = true;

      video = document.createElement('video');
      video.srcObject = stream;
      video.setAttribute('playsinline', '');
      video.muted = true;
      video.play();

      canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      ctx = canvas.getContext('2d', { willReadFrequently: true });

      video.style.cssText = 'display:block;width:100%;height:auto;vertical-align:top;';
      cameraWrapper = document.createElement('div');
      cameraWrapper.className = 'engage-camera-visual';
      cameraWrapper.style.cssText = 'position:relative;display:inline-block;max-width:100%;max-height:100%;';
      cameraWrapper.appendChild(video);
      try {
        global.__engageCameraVideo = video;
        global.__engageCameraWrapper = cameraWrapper;
      } catch (e) {}
      var cameraPane = document.getElementById('engage-pane-camera');
      if (cameraPane) {
        cameraPane.innerHTML = '';
        cameraPane.appendChild(cameraWrapper);
      }

      function startFallback() {
        console.log('[Inference] Webcam active — OpenCV face ROI + bandpass for HR & BR.');
        sampleLoop();
        emitInterval = setInterval(function () {
          var vitals = estimateVitals();
          global.__inferenceVitals = vitals;
        }, 1000 / UPDATE_HZ);
      }

      function tryVitalLens(done) {
        var VL = global.VitalLens;
        if (!VL) { if (done) done(false); return; }
        try {
          vitalLensInstance = new VL({ method: 'pos' });
          vitalLensInstance.addEventListener('vitals', function (result) {
            if (!result || !result.vital_signs) return;
            var vs = result.vital_signs;
            var hr = vs.heart_rate && vs.heart_rate.value != null ? vs.heart_rate.value : 0;
            var br = vs.respiratory_rate && vs.respiratory_rate.value != null ? vs.respiratory_rate.value : null;
            if (global.__inferenceVitals) {
              global.__inferenceVitals.heartRate = hr;
              if (br != null) global.__inferenceVitals.breathingRate = br;
            } else {
              global.__inferenceVitals = { heartRate: hr, breathingRate: br != null ? br : 0, expression: 'neutral', faceMovement: faceMovement, emotionValence: emotionValence };
            }
          });
          vitalLensInstance.setVideoStream(stream, video).then(function () {
            vitalLensInstance.startVideoStream();
            console.log('[Inference] Using VitalLens (pos) for HR; BR from local FFT.');
            if (done) done(true);
          }).catch(function () {
            vitalLensInstance = null;
            if (done) done(false);
          });
        } catch (e) {
          vitalLensInstance = null;
          if (done) done(false);
        }
      }

      startFallback();
      if (global.__vitallensReady) {
        tryVitalLens(function (ok) {});
        return;
      }
      setTimeout(function () {
        if (vitalLensInstance) return;
        if (global.__vitallensReady) tryVitalLens(function () {});
      }, 600);
    }).catch(function (err) {
      console.log('[Inference] Camera denied or error:', err.message);
    });
  }

  var frameCount = 0;
  var currentROI = null;

  var _lastSampleTime = 0;
  var _sampleIntervalMs = 1000 / SAMPLE_FPS;

  function sampleLoop() {
    if (!running) return;
    animId = requestAnimationFrame(sampleLoop);

    var now = performance.now();
    if (now - _lastSampleTime < _sampleIntervalMs) return;
    _lastSampleTime = now;

    if (video.readyState < 2) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    var r = null;
    if (useOpenCV && faceCascade && (frameCount % 6 === 0)) {
      r = getFaceROI();
      if (r) currentROI = r;
    }
    if (!r && currentROI) r = currentROI;
    if (!r) {
      r = {
        x: Math.floor(canvas.width * roi.x),
        y: Math.floor(canvas.height * roi.y),
        w: Math.floor(canvas.width * roi.w),
        h: Math.floor(canvas.height * roi.h)
      };
    }

    var avgG = sampleGreenFromROI(r);
    if (avgG != null) {
      greenSignal.push(avgG);
      timestamps.push(now);
    }

    if (frameCount % 6 === 0) computeFaceSignals(r);

    while (greenSignal.length > BUFFER_LEN) {
      greenSignal.shift();
      timestamps.shift();
    }
    frameCount++;
  }

  function detrend(sig, windowSize) {
    var out = new Array(sig.length);
    var half = Math.floor(windowSize / 2);
    for (var i = 0; i < sig.length; i++) {
      var start = Math.max(0, i - half);
      var end = Math.min(sig.length, i + half + 1);
      var sum = 0;
      for (var j = start; j < end; j++) sum += sig[j];
      out[i] = sig[i] - sum / (end - start);
    }
    return out;
  }

  function bandpassFFT(signal, fs, fLow, fHigh) {
    var n = signal.length;
    var N = 256;
    while (N < n) N *= 2;
    if (N > 4096) N = 4096;
    var pad = [];
    for (var i = 0; i < N; i++) pad[i] = i < n ? signal[i] : 0;
    var mag = fftMagnitude(pad, N);
    var binLow = Math.max(1, Math.floor(fLow * N / fs));
    var binHigh = Math.min(N / 2 - 1, Math.ceil(fHigh * N / fs));
    var bestBin = binLow;
    var bestVal = 0;
    for (var k = binLow; k <= binHigh; k++) {
      if (mag[k] > bestVal) {
        bestVal = mag[k];
        bestBin = k;
      }
    }
    return (bestBin + 0.5) * fs / N;
  }

  function fftMagnitude(signal, N) {
    var re = new Float64Array(N);
    var im = new Float64Array(N);
    for (var i = 0; i < N; i++) { re[i] = signal[i] || 0; im[i] = 0; }
    // Cooley-Tukey in-place radix-2 FFT
    for (var i = 1, j = 0; i < N; i++) {
      var bit = N >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        var tmp = re[i]; re[i] = re[j]; re[j] = tmp;
        tmp = im[i]; im[i] = im[j]; im[j] = tmp;
      }
    }
    for (var len = 2; len <= N; len <<= 1) {
      var ang = -2 * Math.PI / len;
      var wRe = Math.cos(ang), wIm = Math.sin(ang);
      for (var i = 0; i < N; i += len) {
        var curRe = 1, curIm = 0;
        for (var j = 0; j < (len >> 1); j++) {
          var uRe = re[i + j], uIm = im[i + j];
          var vRe = re[i + j + (len >> 1)] * curRe - im[i + j + (len >> 1)] * curIm;
          var vIm = re[i + j + (len >> 1)] * curIm + im[i + j + (len >> 1)] * curRe;
          re[i + j] = uRe + vRe; im[i + j] = uIm + vIm;
          re[i + j + (len >> 1)] = uRe - vRe; im[i + j + (len >> 1)] = uIm - vIm;
          var nRe = curRe * wRe - curIm * wIm;
          curIm = curRe * wIm + curIm * wRe;
          curRe = nRe;
        }
      }
    }
    var mag = new Float64Array(N);
    for (var k = 0; k < N; k++) mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]) / N;
    return mag;
  }

  function estimateVitals() {
    var minSamples = SAMPLE_FPS * 6;
    if (greenSignal.length < minSamples) {
      return { heartRate: 0, breathingRate: 0, expression: 'neutral' };
    }

    var signal = detrend(greenSignal, Math.floor(SAMPLE_FPS * 1.5));
    var dt = (timestamps[timestamps.length - 1] - timestamps[0]) / (timestamps.length - 1);
    var fs = 1000 / dt;
    if (fs < 10) return { heartRate: 0, breathingRate: 0, expression: 'neutral' };

    var hrHz = bandpassFFT(signal, fs, HR_MIN / 60, HR_MAX / 60);
    var brHz = bandpassFFT(signal, fs, BR_MIN / 60, BR_MAX / 60);
    var rawHr = Math.round(hrHz * 60 * 10) / 10;
    var rawBr = Math.round(brHz * 60 * 10) / 10;

    rawHr = Math.max(HR_MIN, Math.min(HR_MAX, rawHr));
    rawBr = Math.max(BR_MIN, Math.min(BR_MAX, rawBr));
    if (rawBr <= 0 || isNaN(rawBr)) rawBr = lastBr;

    lastHr = SMOOTH_ALPHA * rawHr + (1 - SMOOTH_ALPHA) * lastHr;
    lastBr = SMOOTH_ALPHA * rawBr + (1 - SMOOTH_ALPHA) * lastBr;

    return {
      heartRate: Math.round(lastHr * 10) / 10,
      breathingRate: Math.round(lastBr * 10) / 10,
      expression: 'neutral',
      faceMovement: faceMovement,
      emotionValence: emotionValence
    };
  }

  global.__startInferenceVitals = startInference;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startInference);
    } else {
      startInference();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
