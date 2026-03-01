#!/usr/bin/env node
/**
 * Build pipeline: assembles www/ for web deploy.
 * Copies games, mod overlay, engage tracker, inference vitals. Run: npm run build
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WWW = path.join(ROOT, 'www');

function rmrf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copy(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn('  SKIP (not found):', src);
    return;
  }
  fs.copyFileSync(src, dest);
  console.log('  COPY:', path.relative(ROOT, dest));
}

// 1. Clean & recreate www/
console.log('Cleaning www/ ...');
rmrf(WWW);
mkdirp(path.join(WWW, 'games'));
mkdirp(path.join(WWW, 'js'));

// 2. Copy game HTML files
const gameFiles = ['snake.html', 'bird.html', 'dino.html'];
for (const f of gameFiles) {
  copy(path.join(ROOT, 'games', f), path.join(WWW, 'games', f));
}

// 3. Copy mod_*.js and game_state_*.js (mod creator + state capture for time-series)
const gameJsFiles = fs.readdirSync(path.join(ROOT, 'games')).filter(f =>
  (f.startsWith('mod_') || f.startsWith('game_state_') || f.startsWith('game_mods_')) && f.endsWith('.js'));
for (const f of gameJsFiles) {
  copy(path.join(ROOT, 'games', f), path.join(WWW, 'games', f));
}

// 4. Copy pipeline JS: engage tracker, inference vitals, camera consent, mod overlay
const jsFiles = [
  'engage-tracker.js',
  'engage-logger.js',
  'engage-tracker-ui.js',
  'inference-vitals.js',
  'camera-consent.js',
  'mod-overlay.js',
  'engage-bootstrap.js',
  'engage-adapter.js',
  'engage-stimulus.js',
  'engage-rl.js',
];
for (const f of jsFiles) {
  copy(path.join(ROOT, 'js', f), path.join(WWW, 'js', f));
}

// 5. Copy index.html (slideshow landing) from root
copy(path.join(ROOT, 'index.html'), path.join(WWW, 'index.html'));

console.log('\nBuild complete! www/ ready (web pipeline + mod creator).');
