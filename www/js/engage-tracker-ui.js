/**
 * EngageTracker UI: full bottom-panel console (terminal, mods, state, engagement graph).
 * One-line values-only logs; mod lines in red with what+why. Terminal-style CSS.
 */
(function (global) {
  'use strict';

  var FIELDS = ['hr', 'br', 'expr', 'sess', 'score', 'deaths', 'taps', 'touchMs', 'dScore', 'dHr', 'dBr', 'dDeath', 'touchR', 'death60', 'keyVel', 'keyRhy', 'faceM', 'emo'];
  var isMobile = typeof window !== 'undefined' && 'ontouchstart' in window;
  var maxTerminalLines = isMobile ? 30 : 80;
  var engagementHistory = [];
  var displayHistory = [];   // lerps toward engagementHistory for smooth animation
  var maxEngagementHistory = 180;
  var graphAnimId = null;
  var LERP_SPEED = 0.12;     // per frame, how fast display catches up to target

  function formatRow(vector) {
    return vector.map(function (v) { return typeof v === 'number' ? (v % 1 === 0 ? String(v) : v.toFixed(2)) : (v == null ? '' : v); }).join('\t');
  }

  function stateValuesOnly(gameState) {
    if (!gameState || typeof gameState !== 'object') return [];
    var out = [];
    for (var k in gameState) { if (gameState.hasOwnProperty(k)) out.push(gameState[k]); }
    return out;
  }

  function getSourceLabel() {
    var v = window.__inferenceVitals;
    if (v && (v.heartRate > 0 || v.breathingRate > 0)) return 'Inference';
    if (v) return 'Inference…';
    return 'No camera';
  }

  function ensurePanel() {
    if (window.__engagePanel) return window.__engagePanel;

    var wrap = document.createElement('div');
    wrap.id = 'engage-console';
    wrap.innerHTML = '<style>#engage-console{--bg:#0d1117;--fg:#7ee787;--dim:#8b949e;--red:#f85149;--border:#30363d;--tab-bg:#161b22;} #engage-console,.engage-console-tabs,.engage-console-tab,.engage-console-pane,.engage-terminal,.engage-mods-tbl,.engage-state-tbl,.engage-graph{box-sizing:border-box;} #engage-console{position:fixed;bottom:0;left:0;right:0;height:38vh;max-height:38vh;min-height:120px;background:var(--bg);color:var(--fg);font:11px/1.35 "SF Mono",Menlo,Consolas,monospace;z-index:9999;border-top:1px solid var(--border);display:flex;flex-direction:column;touch-action:auto;transition:height 0.2s ease, max-height 0.2s ease, min-height 0.2s ease;} #engage-console.minimized{height:40px!important;max-height:40px!important;min-height:40px!important;} #engage-console.minimized .engage-console-body{display:none;} #engage-console.minimized .engage-console-resize{display:none;} .engage-console-resize{flex-shrink:0;height:6px;cursor:ns-resize;background:var(--border);border-bottom:1px solid var(--border);} .engage-console-resize:hover{background:var(--dim);} #engage-console.resizing{transition:none;} .engage-console-tabs{display:flex;flex-shrink:0;border-bottom:1px solid var(--border);background:var(--tab-bg);align-items:center;} .engage-console-tab{padding:6px 12px;cursor:pointer;border:none;background:transparent;color:var(--dim);font:inherit;} .engage-console-tab:hover{color:var(--fg);} .engage-console-tab.active{color:var(--fg);border-bottom:2px solid var(--fg);margin-bottom:-1px;} .engage-console-toggle{margin-left:4px;padding:4px 8px;cursor:pointer;border:1px solid var(--border);background:var(--bg);color:var(--dim);font:inherit;border-radius:4px;} .engage-console-toggle:hover{color:var(--fg);} .engage-console-body{display:flex;flex:1;flex-direction:column;min-height:0;overflow:hidden;} .engage-console-pane{display:none;flex:1;overflow:auto;padding:8px;min-height:0;} .engage-console-pane.active{display:flex;flex-direction:column;min-height:0;} .engage-live-data-header{flex-shrink:0;padding:4px 0;color:var(--dim);font-size:10px;white-space:pre-wrap;word-break:break-all;border-bottom:1px solid var(--border);margin-bottom:4px;} .engage-terminal{white-space:pre-wrap;word-break:break-all;flex:1;min-height:0;overflow:auto;} .engage-terminal-line{padding:1px 0;border-bottom:1px solid rgba(48,54,61,0.5);} .engage-terminal-line.mod{color:var(--red);font-weight:bold;} .engage-mods-tbl,.engage-state-tbl{width:100%;border-collapse:collapse;font-size:10px;} .engage-mods-tbl th,.engage-state-tbl th{text-align:left;padding:4px 8px;color:var(--dim);border-bottom:1px solid var(--border);} .engage-mods-tbl td,.engage-state-tbl td{padding:2px 8px;border-bottom:1px solid rgba(48,54,61,0.5);} .engage-graph-wrap{flex-shrink:0;background:rgba(0,0,0,0.25);border-radius:6px;padding:8px;max-width:520px;} .engage-graph-wrap .engage-graph-label{font-size:10px;color:var(--dim);margin-bottom:4px;} .engage-graph-wrap .engage-graph-legend{display:flex;flex-wrap:wrap;gap:10px 16px;margin-bottom:6px;font-size:10px;} .engage-graph-wrap .engage-graph-legend span{display:inline-flex;align-items:center;gap:4px;} .engage-graph-wrap .engage-graph-legend .dot{width:6px;height:6px;border-radius:50%;} .engage-graph-wrap .engage-graph-value{color:var(--fg);font-weight:600;} .engage-graph{display:block;width:520px;height:140px;max-width:100%;} .engage-camera-pane{align-items:center;justify-content:center;min-height:0;flex:1;background:#000;} #engage-pane-camera:not(.active) video{display:none!important;} .engage-camera-pane video{max-width:100%;max-height:100%;object-fit:contain;border:1px solid var(--border);border-radius:4px;}</style>';
    wrap.style.cssText = '';

    var tabs = document.createElement('div');
    tabs.className = 'engage-console-tabs';
    var tabTerminal = document.createElement('button');
    tabTerminal.className = 'engage-console-tab active';
    tabTerminal.textContent = 'Live Data';
    var tabMods = document.createElement('button');
    tabMods.className = 'engage-console-tab';
    tabMods.textContent = 'Mods';
    var tabState = document.createElement('button');
    tabState.className = 'engage-console-tab';
    tabState.textContent = 'State';
    var tabGraph = document.createElement('button');
    tabGraph.className = 'engage-console-tab';
    tabGraph.textContent = 'Engagement';
    var tabCamera = document.createElement('button');
    tabCamera.className = 'engage-console-tab';
    tabCamera.textContent = 'Camera';
    var tabSource = document.createElement('span');
    tabSource.style.cssText = 'margin-left:auto;padding:6px 10px;color:var(--dim);font-size:10px;';
    var toggleBtn = document.createElement('button');
    toggleBtn.className = 'engage-console-toggle';
    toggleBtn.title = 'Minimize / Maximize';
    toggleBtn.textContent = '\u2212';
    toggleBtn.setAttribute('aria-label', 'Minimize panel');
    tabs.appendChild(tabTerminal);
    tabs.appendChild(tabMods);
    tabs.appendChild(tabState);
    tabs.appendChild(tabGraph);
    tabs.appendChild(tabCamera);
    tabs.appendChild(tabSource);
    tabs.appendChild(toggleBtn);

    var MIN_PANE_PX = 120;
    var MAX_PANE_VH = 0.85;
    var panelHeightPx = Math.round(window.innerHeight * 0.38);

    var resizeHandle = document.createElement('div');
    resizeHandle.className = 'engage-console-resize';
    resizeHandle.title = 'Drag to resize panel';
    resizeHandle.setAttribute('aria-label', 'Resize panel');

    function applyPanelHeight(px) {
      if (wrap.classList.contains('minimized')) return;
      var h = Math.max(MIN_PANE_PX, Math.min(px, Math.round(window.innerHeight * MAX_PANE_VH)));
      wrap.style.height = h + 'px';
      wrap.style.maxHeight = h + 'px';
      panelHeightPx = h;
    }

    function onResizePointerDown(e) {
      if (wrap.classList.contains('minimized')) return;
      e.preventDefault();
      var startY = e.clientY;
      var startH = wrap.offsetHeight;
      wrap.classList.add('resizing');
      function onMove(e) {
        var dy = startY - e.clientY;
        applyPanelHeight(startH + dy);
      }
      function onUp() {
        wrap.classList.remove('resizing');
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
      }
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    }
    resizeHandle.addEventListener('pointerdown', onResizePointerDown);

    var consoleBody = document.createElement('div');
    consoleBody.className = 'engage-console-body';

    var paneTerminal = document.createElement('div');
    paneTerminal.className = 'engage-console-pane active';
    paneTerminal.id = 'engage-pane-terminal';
    var liveDataHeader = document.createElement('div');
    liveDataHeader.className = 'engage-live-data-header';
    liveDataHeader.textContent = FIELDS.join('\t') + '\t|\t(state values)';
    var terminalEl = document.createElement('div');
    terminalEl.className = 'engage-terminal';
    paneTerminal.appendChild(liveDataHeader);
    paneTerminal.appendChild(terminalEl);

    var paneMods = document.createElement('div');
    paneMods.className = 'engage-console-pane';
    paneMods.id = 'engage-pane-mods';
    var modsTable = document.createElement('table');
    modsTable.className = 'engage-mods-tbl';
    modsTable.innerHTML = '<thead><tr><th>mod</th><th>category</th><th>value</th><th>min</th><th>max</th></tr></thead><tbody></tbody>';
    paneMods.appendChild(modsTable);

    var paneState = document.createElement('div');
    paneState.className = 'engage-console-pane';
    paneState.id = 'engage-pane-state';
    var stateTable = document.createElement('table');
    stateTable.className = 'engage-state-tbl';
    stateTable.innerHTML = '<thead><tr><th>key</th><th>value</th></tr></thead><tbody></tbody>';
    paneState.appendChild(stateTable);

    var paneGraph = document.createElement('div');
    paneGraph.className = 'engage-console-pane';
    paneGraph.id = 'engage-pane-graph';
    var graphWrap = document.createElement('div');
    graphWrap.className = 'engage-graph-wrap';
    var graphLabel = document.createElement('div');
    graphLabel.className = 'engage-graph-label';
    graphLabel.innerHTML = 'Signals over time';
    graphWrap.appendChild(graphLabel);
    var graphLegend = document.createElement('div');
    graphLegend.className = 'engage-graph-legend';
    graphLegend.innerHTML = '<span><i class="dot" style="background:#7ee787;"></i>Engage</span><span><i class="dot" style="background:#f85149;"></i>HR</span><span><i class="dot" style="background:#79c0ff;"></i>BR</span><span><i class="dot" style="background:#d29922;"></i>Touch</span><span><i class="dot" style="background:#bc8cff;"></i>Face</span><span><i class="dot" style="background:#f778ba;"></i>Emotion</span>';
    graphWrap.appendChild(graphLegend);
    var GRAPH_W = 520;
    var GRAPH_H = 140;
    var graphCanvas = document.createElement('canvas');
    graphCanvas.className = 'engage-graph';
    graphCanvas.width = GRAPH_W;
    graphCanvas.height = GRAPH_H;
    graphWrap.appendChild(graphCanvas);
    paneGraph.appendChild(graphWrap);

    var paneCamera = document.createElement('div');
    paneCamera.className = 'engage-console-pane engage-camera-pane';
    paneCamera.id = 'engage-pane-camera';
    paneCamera.innerHTML = '<span style="color:var(--dim);">Camera preview will appear here when allowed.</span>';

    window.addEventListener('resize', function () {
      applyPanelHeight(panelHeightPx);
      var p = window.__engagePanel;
      if (p && p.graphCanvas) { drawEngagementGraph(p); }
    });

    consoleBody.appendChild(paneTerminal);
    consoleBody.appendChild(paneMods);
    consoleBody.appendChild(paneState);
    consoleBody.appendChild(paneGraph);
    consoleBody.appendChild(paneCamera);
    wrap.appendChild(resizeHandle);
    wrap.appendChild(tabs);
    wrap.appendChild(consoleBody);

    toggleBtn.addEventListener('click', function () {
      wrap.classList.toggle('minimized');
      toggleBtn.textContent = wrap.classList.contains('minimized') ? '\u25A1' : '\u2212';
      toggleBtn.setAttribute('aria-label', wrap.classList.contains('minimized') ? 'Maximize panel' : 'Minimize panel');
    });

    function showPane(id) {
      paneTerminal.classList.toggle('active', id === 'engage-pane-terminal');
      paneMods.classList.toggle('active', id === 'engage-pane-mods');
      paneState.classList.toggle('active', id === 'engage-pane-state');
      paneGraph.classList.toggle('active', id === 'engage-pane-graph');
      paneCamera.classList.toggle('active', id === 'engage-pane-camera');
      tabTerminal.classList.toggle('active', id === 'engage-pane-terminal');
      tabMods.classList.toggle('active', id === 'engage-pane-mods');
      tabState.classList.toggle('active', id === 'engage-pane-state');
      tabGraph.classList.toggle('active', id === 'engage-pane-graph');
      tabCamera.classList.toggle('active', id === 'engage-pane-camera');
      var camWrapper = global.__engageCameraWrapper;
      var camVideo = global.__engageCameraVideo || paneCamera.querySelector('video');
      var camEl = camWrapper || camVideo;
      if (camEl) camEl.style.display = (id === 'engage-pane-camera') ? '' : 'none';
    }
    tabTerminal.addEventListener('click', function () { showPane('engage-pane-terminal'); });
    tabMods.addEventListener('click', function () { showPane('engage-pane-mods'); });
    tabState.addEventListener('click', function () { showPane('engage-pane-state'); });
    tabGraph.addEventListener('click', function () { showPane('engage-pane-graph'); });
    tabCamera.addEventListener('click', function () {
      showPane('engage-pane-camera');
      moveCameraIntoPane();
    });

    function moveCameraIntoPane() {
      var wrapper = global.__engageCameraWrapper;
      var v = global.__engageCameraVideo;
      if (!paneCamera) return;
      if (wrapper && wrapper.parentNode === paneCamera) {
        wrapper.style.display = paneCamera.classList.contains('active') ? '' : 'none';
        return;
      }
      if (v && v.parentNode === paneCamera) {
        v.style.display = paneCamera.classList.contains('active') ? '' : 'none';
        return;
      }
      paneCamera.innerHTML = '';
      if (wrapper) {
        wrapper.style.display = paneCamera.classList.contains('active') ? '' : 'none';
        paneCamera.appendChild(wrapper);
      } else if (v) {
        v.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;border:1px solid var(--border);border-radius:4px;';
        v.style.display = paneCamera.classList.contains('active') ? '' : 'none';
        paneCamera.appendChild(v);
      }
    }
    var cameraCheck = setInterval(function () {
      if (global.__engageCameraVideo && paneCamera) {
        moveCameraIntoPane();
        clearInterval(cameraCheck);
      }
    }, 500);
    setTimeout(function () { clearInterval(cameraCheck); }, 30000);

    document.body.appendChild(wrap);
    window.__engagePanel = {
      wrap: wrap,
      terminal: terminalEl,
      liveDataHeader: liveDataHeader,
      modsTbody: modsTable.querySelector('tbody'),
      stateTbody: stateTable.querySelector('tbody'),
      graphCanvas: graphCanvas,
      paneCamera: paneCamera,
      tabSource: tabSource
    };
    return window.__engagePanel;
  }

  function addTerminalLine(text, isMod) {
    var panel = window.__engagePanel;
    if (!panel || !panel.terminal) return;
    var div = document.createElement('div');
    div.className = 'engage-terminal-line' + (isMod ? ' mod' : '');
    div.textContent = text;
    panel.terminal.appendChild(div);
    while (panel.terminal.children.length > maxTerminalLines) panel.terminal.removeChild(panel.terminal.firstChild);
    panel.terminal.scrollTop = panel.terminal.scrollHeight;
  }

  function tickLine(vector, gameState) {
    var parts = [];
    if (vector && vector.length) {
      for (var i = 0; i < vector.length; i++) {
        var v = vector[i];
        parts.push(typeof v === 'number' ? (v % 1 === 0 ? String(v) : v.toFixed(2)) : (v == null ? '' : v));
      }
    }
    if (gameState && typeof gameState === 'object') {
      var flat = stateValuesOnly(gameState);
      if (flat.length) parts.push('|\t' + flat.map(function (x) { return x != null && typeof x === 'number' && x % 1 !== 0 ? x.toFixed(2) : x; }).join('\t'));
    }
    return parts.join('\t');
  }

  function updateSourceLabel(panel) {
    if (!panel || !panel.tabSource) return;
    panel.tabSource.textContent = getSourceLabel();
  }

  function updateModsTable(panel) {
    var mods = global.__gameMods;
    var tbody = panel && panel.modsTbody;
    if (!tbody) return;
    if (!mods || !mods.length) {
      tbody.innerHTML = '<tr><td colspan="5">No mods</td></tr>';
      return;
    }
    tbody.innerHTML = '';
    for (var i = 0; i < mods.length; i++) {
      var m = mods[i];
      var val = '';
      try { val = m.get(); } catch (e) { val = '—'; }
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>' + (m.key || '') + '</td><td>' + (m.category || '') + '</td><td>' + val + '</td><td>' + (m.min != null ? m.min : '') + '</td><td>' + (m.max != null ? m.max : '') + '</td>';
      tbody.appendChild(tr);
    }
  }

  function updateStateTable(panel, gameState) {
    var tbody = panel && panel.stateTbody;
    if (!tbody) return;
    if (!gameState || typeof gameState !== 'object') {
      tbody.innerHTML = '<tr><td colspan="2">No state</td></tr>';
      return;
    }
    tbody.innerHTML = '';
    for (var k in gameState) {
      if (!gameState.hasOwnProperty(k)) continue;
      var tr = document.createElement('tr');
      var v = gameState[k];
      tr.innerHTML = '<td>' + k + '</td><td>' + (v != null && typeof v === 'number' && v % 1 !== 0 ? v.toFixed(2) : v) + '</td>';
      tbody.appendChild(tr);
    }
  }

  var HR_RANGE = [40, 120];
  var BR_RANGE = [6, 24];

  function norm(v, min, max) {
    if (v == null || isNaN(v)) return 0.5;
    return Math.max(0, Math.min(1, (v - min) / (max - min)));
  }

  function lerpVal(a, b, t) {
    if (a == null || isNaN(a)) return b != null && !isNaN(b) ? b : 0.5;
    if (b == null || isNaN(b)) return a;
    return a + (b - a) * t;
  }

  function lerpDisplayTowardTarget() {
    var n = engagementHistory.length;
    if (n === 0 || displayHistory.length !== n) return;
    var last = n - 1;
    var d = displayHistory[last];
    var t = engagementHistory[last];
    d.score = lerpVal(d.score, t.score != null ? t.score : 0.5, LERP_SPEED);
    d.hr = lerpVal(d.hr, t.hr, LERP_SPEED);
    d.br = lerpVal(d.br, t.br, LERP_SPEED);
    d.touch = lerpVal(d.touch, t.touch != null ? t.touch : 0, LERP_SPEED);
    d.faceMove = lerpVal(d.faceMove, t.faceMove, LERP_SPEED);
    d.emotion = lerpVal(d.emotion, t.emotion, LERP_SPEED);
    d.mod = t.mod;
    d.gameOver = t.gameOver;
  }

  function drawEngagementGraph(panel) {
    var canvas = panel && panel.graphCanvas;
    if (!canvas) return;
    lerpDisplayTowardTarget();
    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    var n = displayHistory.length;
    var LEFT = 28;   // y-axis label space
    var BOTTOM = 16; // x-axis label space
    var TOP = 4;
    var RIGHT = 4;
    var chartW = w - LEFT - RIGHT;
    var chartH = h - TOP - BOTTOM;

    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, w, h);

    // Y-axis labels and gridlines
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    var yLevels = [0, 0.25, 0.5, 0.75, 1.0];
    for (var yi = 0; yi < yLevels.length; yi++) {
      var yy = TOP + chartH - yLevels[yi] * chartH;
      ctx.fillStyle = '#8b949e';
      ctx.fillText(yLevels[yi].toFixed(1 + (yLevels[yi] === 1 ? 0 : 0)), LEFT - 4, yy + 3);
      ctx.strokeStyle = 'rgba(48,54,61,0.5)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(LEFT, yy);
      ctx.lineTo(w - RIGHT, yy);
      ctx.stroke();
    }

    if (n < 2) {
      ctx.fillStyle = '#8b949e';
      ctx.textAlign = 'center';
      ctx.font = '11px monospace';
      ctx.fillText('Collecting data...', w / 2, h / 2);
      return;
    }

    function yPos(normVal) {
      var v = normVal != null && !isNaN(normVal) ? normVal : 0.5;
      v = Math.max(0, Math.min(1, v));
      return TOP + chartH - v * chartH;
    }
    function xPos(i) { return LEFT + (i / (n - 1)) * chartW; }

    // X-axis time labels (every ~30s)
    ctx.fillStyle = '#8b949e';
    ctx.textAlign = 'center';
    ctx.font = '9px monospace';
    var interval = Math.max(1, Math.floor(n / 5));
    for (var ti = 0; ti < n; ti += interval) {
      var secs = n - 1 - ti;
      var label = secs === 0 ? 'now' : '-' + secs + 's';
      ctx.fillText(label, xPos(ti), h - 2);
    }

    // Game over markers first (behind lines)
    for (var i = 0; i < n; i++) {
      if (displayHistory[i].gameOver) {
        ctx.fillStyle = 'rgba(248,81,73,0.08)';
        ctx.fillRect(xPos(i) - 1, TOP, 2, chartH);
        ctx.strokeStyle = 'rgba(248,81,73,0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(xPos(i), TOP);
        ctx.lineTo(xPos(i), TOP + chartH);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Draw series
    var series = [
      { key: 'score', color: '#7ee787', lw: 2 },
      { key: 'hr', color: '#f85149', lw: 1.2 },
      { key: 'br', color: '#79c0ff', lw: 1.2 },
      { key: 'touch', color: '#d29922', lw: 1 },
      { key: 'faceMove', color: '#bc8cff', lw: 1 },
      { key: 'emotion', color: '#f778ba', lw: 1 }
    ];

    for (var s = 0; s < series.length; s++) {
      var ser = series[s];
      ctx.strokeStyle = ser.color;
      ctx.lineWidth = ser.lw;
      ctx.beginPath();
      var started = false;
      for (var i = 0; i < n; i++) {
        var d = displayHistory[i];
        var v;
        if (ser.key === 'score') v = d.score != null ? d.score : 0.5;
        else if (ser.key === 'hr') v = norm(d.hr, HR_RANGE[0], HR_RANGE[1]);
        else if (ser.key === 'br') v = norm(d.br, BR_RANGE[0], BR_RANGE[1]);
        else if (ser.key === 'touch') v = d.touch != null ? d.touch : 0;
        else if (ser.key === 'faceMove') v = d.faceMove != null ? d.faceMove : 0;
        else if (ser.key === 'emotion') v = d.emotion != null ? (d.emotion + 1) / 2 : 0.5;
        else v = 0.5;
        if (!started) { ctx.moveTo(xPos(i), yPos(v)); started = true; }
        else ctx.lineTo(xPos(i), yPos(v));
      }
      ctx.stroke();
    }

    // Mod event dots on engagement line
    for (var i = 0; i < n; i++) {
      if (displayHistory[i].mod) {
        var sv = displayHistory[i].score != null ? displayHistory[i].score : 0.5;
        ctx.fillStyle = '#ff6b6b';
        ctx.beginPath();
        ctx.arc(xPos(i), yPos(sv), 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }

    // State label in top-right
    var rl = global.__engageRLAction;
    if (rl && rl.engagementState) {
      ctx.fillStyle = '#8b949e';
      ctx.textAlign = 'right';
      ctx.font = '10px monospace';
      ctx.fillText(rl.engagementState.toUpperCase(), w - RIGHT - 4, TOP + 12);
    }
  }

  function startGraphAnimationLoop(panel) {
    if (graphAnimId != null) return;
    function tick() {
      if (!panel || !panel.graphCanvas) {
        graphAnimId = null;
        return;
      }
      drawEngagementGraph(panel);
      graphAnimId = requestAnimationFrame(tick);
    }
    graphAnimId = requestAnimationFrame(tick);
  }

  function updateLiveDataHeader(panel, gameState) {
    if (!panel || !panel.liveDataHeader) return;
    var label = FIELDS.join('\t') + '\t|';
    if (gameState && typeof gameState === 'object' && Object.keys(gameState).length) {
      label += '\t' + Object.keys(gameState).join('\t');
    } else {
      label += '\t(state values)';
    }
    panel.liveDataHeader.textContent = label;
  }

  function updateTable(panel, vector, tickIndex, gameState) {
    var line = tickLine(vector, gameState);
    addTerminalLine(line, false);
    updateLiveDataHeader(panel, gameState);
    updateStateTable(panel, gameState);
    updateModsTable(panel);

    var rl = global.__engageRLAction;
    var score = rl && rl.engagementScore != null ? rl.engagementScore : 0.5;
    var gs = global.getEngageGameState;
    var state = typeof gs === 'function' ? (function () { try { return gs(); } catch (e) { return null; } })() : null;
    var gameOver = state && (state.crashed || state.lost || state.game_over);
    var hr = vector && vector[0] != null ? vector[0] : null;
    var br = vector && vector[1] != null ? vector[1] : null;
    var touch = vector && vector[12] != null ? vector[12] : null;
    var faceMove = vector && vector[16] != null ? vector[16] : null;
    var emotion = vector && vector[17] != null ? vector[17] : null;
    var newPoint = { score: score, mod: false, gameOver: !!gameOver, hr: hr, br: br, touch: touch, faceMove: faceMove, emotion: emotion };
    engagementHistory.push(newPoint);
    var prev = displayHistory.length ? displayHistory[displayHistory.length - 1] : null;
    displayHistory.push(prev ? { score: prev.score, hr: prev.hr, br: prev.br, touch: prev.touch, faceMove: prev.faceMove, emotion: prev.emotion, mod: newPoint.mod, gameOver: newPoint.gameOver } : { score: score, hr: hr, br: br, touch: touch, faceMove: faceMove, emotion: emotion, mod: newPoint.mod, gameOver: newPoint.gameOver });
    if (engagementHistory.length > maxEngagementHistory) {
      engagementHistory.shift();
      displayHistory.shift();
    }
    if (graphAnimId == null) startGraphAnimationLoop(panel);
  }

  function postRow(row) {
    var url = global.ENGAGE_LOG_URL || (global.window && global.window.ENGAGE_LOG_URL);
    if (!url) return;
    try {
      var payload = row && row.vector ? { vector: row.vector, gameState: row.gameState || null } : row;
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(function () {});
    } catch (e) {}
  }

  function onModApplied(label, fromVal, toVal, why) {
    var fromStr = typeof fromVal === 'number' ? (fromVal % 1 === 0 ? String(fromVal) : fromVal.toFixed(2)) : fromVal;
    var toStr = typeof toVal === 'number' ? (toVal % 1 === 0 ? String(toVal) : toVal.toFixed(2)) : toVal;
    addTerminalLine('MOD\t' + label + '\t' + fromStr + ' → ' + toStr + '\tWhy: ' + why, true);
    if (engagementHistory.length) engagementHistory[engagementHistory.length - 1].mod = true;
  }

  function startEngageTrackerUI(opts) {
    opts = opts || {};
    var getScore = opts.getScore || function () { return (global.getEngageScore && global.getEngageScore()) || (global.gameScore != null ? global.gameScore : 0); };
    var getDeaths = opts.getDeaths || function () { return (global.getEngageDeaths && global.getEngageDeaths()) || (global.gameDeaths != null ? global.gameDeaths : 0); };
    if (opts.logUrl) global.ENGAGE_LOG_URL = opts.logUrl;
    if (typeof location !== 'undefined' && location.search.indexOf('logToServer=1') !== -1) {
      global.ENGAGE_LOG_URL = (location.origin || '') + '/log';
      if (global.EngageLogger) global.EngageLogger.setLogUrl(global.ENGAGE_LOG_URL);
    }

    var panel = ensurePanel();
    var tickIndex = 0;

    if (global.EngageLogger && Object.defineProperty) {
      try { global.EngageLogger.onMod = onModApplied; } catch (e) {}
    }

    var tracker = new global.EngageTracker({
      intervalMs: 1000,
      getScore: getScore,
      getDeaths: getDeaths,
      onTick: function (row) {
        if (!row) return;
        var vector = row && row.vector ? row.vector : row;
        var gameState = row && row.gameState;
        updateSourceLabel(panel);
        if (global.EngageLogger) global.EngageLogger.logTick(vector, gameState);
        else addTerminalLine(tickLine(vector, gameState), false);
        updateTable(panel, vector, tickIndex, gameState);
        postRow(row);
        tickIndex++;
      },
    });

    tracker.start();
    window.engageTracker = tracker;
    return tracker;
  }

  global.startEngageTrackerUI = startEngageTrackerUI;
})(typeof window !== 'undefined' ? window : globalThis);
