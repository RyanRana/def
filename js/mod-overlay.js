/**
 * ModOverlay: shared live mod framework.
 * Renders a gear icon that opens a settings panel with sliders to tweak
 * game parameters mid-round.
 *
 * Usage:
 *   ModOverlay.create([
 *     { label: 'Gravity', get: () => gravity, set: v => gravity = v,
 *       min: 0.5, max: 5, step: 0.1, default: 2 },
 *     ...
 *   ]);
 */
(function (global) {
  'use strict';

  var panel = null;
  var gearBtn = null;
  var isOpen = false;
  var params = [];
  var sliders = [];

  function createGear() {
    if (gearBtn) return gearBtn;
    gearBtn = document.createElement('button');
    gearBtn.textContent = '\u2699';
    gearBtn.style.cssText = [
      'position:fixed;top:8px;right:8px;z-index:10001;',
      'width:36px;height:36px;border-radius:50%;border:none;',
      'background:rgba(0,0,0,0.6);color:#0f0;font-size:22px;',
      'cursor:pointer;touch-action:manipulation;',
      'display:flex;align-items:center;justify-content:center;',
      'line-height:1;padding:0;'
    ].join('');
    gearBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggle();
    });
    document.body.appendChild(gearBtn);
    return gearBtn;
  }

  function createPanel() {
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'mod-overlay-panel';
    panel.style.cssText = [
      'position:fixed;top:48px;right:8px;z-index:10001;',
      'width:260px;max-height:70vh;overflow-y:auto;',
      'background:rgba(0,0,0,0.85);color:#0f0;',
      'font:12px/1.5 monospace;padding:12px;border-radius:8px;',
      'border:1px solid #0f0;display:none;',
      'touch-action:auto;'
    ].join('');

    // Header
    var header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
    var title = document.createElement('span');
    title.textContent = 'Game Mods';
    title.style.fontWeight = 'bold';
    var resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset All';
    resetBtn.style.cssText = 'background:#333;color:#0f0;border:1px solid #0f0;border-radius:4px;padding:2px 8px;cursor:pointer;font:10px monospace;';
    resetBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      resetAll();
    });
    header.appendChild(title);
    header.appendChild(resetBtn);
    panel.appendChild(header);

    document.body.appendChild(panel);
    return panel;
  }

  function addSlider(param, index) {
    var row = document.createElement('div');
    row.style.cssText = 'margin-bottom:8px;';

    var label = document.createElement('div');
    label.style.cssText = 'display:flex;justify-content:space-between;font-size:11px;';
    var nameSpan = document.createElement('span');
    nameSpan.textContent = param.label;
    var valSpan = document.createElement('span');
    valSpan.id = 'mod-val-' + index;
    valSpan.textContent = formatVal(param.get());
    label.appendChild(nameSpan);
    label.appendChild(valSpan);

    var slider = document.createElement('input');
    slider.type = 'range';
    slider.min = param.min;
    slider.max = param.max;
    slider.step = param.step;
    slider.value = param.get();
    slider.style.cssText = 'width:100%;accent-color:#0f0;margin-top:2px;';
    slider.addEventListener('input', function () {
      var v = parseFloat(this.value);
      param.set(v);
      valSpan.textContent = formatVal(v);
    });

    row.appendChild(label);
    row.appendChild(slider);
    panel.appendChild(row);
    sliders.push({ slider: slider, valSpan: valSpan, param: param });
  }

  function formatVal(v) {
    return v % 1 === 0 ? String(v) : v.toFixed(2);
  }

  function toggle() {
    isOpen = !isOpen;
    if (panel) {
      panel.style.display = isOpen ? 'block' : 'none';
      // Refresh slider values when opening
      if (isOpen) refreshSliders();
    }
  }

  function refreshSliders() {
    for (var i = 0; i < sliders.length; i++) {
      var s = sliders[i];
      var v = s.param.get();
      s.slider.value = v;
      s.valSpan.textContent = formatVal(v);
    }
  }

  function resetAll() {
    for (var i = 0; i < params.length; i++) {
      var p = params[i];
      if (p.default !== undefined) {
        p.set(p.default);
      }
    }
    refreshSliders();
  }

  function create(paramDefs) {
    params = paramDefs || [];
    sliders = [];
    createPanel();
    // Clear old sliders (keep header)
    while (panel.children.length > 1) {
      panel.removeChild(panel.lastChild);
    }
    sliders = [];
    for (var i = 0; i < params.length; i++) {
      addSlider(params[i], i);
    }
  }

  global.ModOverlay = { create: create, toggle: toggle, reset: resetAll };
})(typeof window !== 'undefined' ? window : globalThis);
