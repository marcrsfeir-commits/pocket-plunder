// Screen flow, HUD, saving, wardrobe, story panels, input (keyboard + touch) and the main loop.
import { loadAll, IMG, drawSprite } from './assets.js';
import { initAudio, sfx, playMusic, setAmbience, setMuted, isMuted } from './audio.js';
import { StealthGame, W, H, setOutfit } from './game.js';
import { SailGame } from './sail.js';
import { LEVELS, FINALE, MAP_NODES } from './levels.js';

const $ = id => document.getElementById(id);
const stage = $('stage'), cv = $('cv'), ctx = cv.getContext('2d');
const ALL = [...LEVELS, FINALE];
const TREASURES = {
  harbor: ['coin', 'ruby', 'pearl'], below: ['coin', 'ruby', 'pearl'], hold: ['pearl', 'ruby', 'coin'], brig: ['coin', 'ruby', 'pearl'],
  cabin: ['crown', 'ruby', 'coin'], rigging: ['coin', 'pearl', 'ruby'], deck: ['ruby', 'crown', 'coin'],
};
const KITTEN_LEVELS = LEVELS.map(l => l.id);
const OUTFITS = [
  { id: 'classic', name: 'Raincoat', need: 0 },
  { id: 'pirate', name: 'Little Captain', need: 8 },
  { id: 'ninja', name: 'Shadow Thief', need: 14 },
  { id: 'frog', name: 'Froggy', need: 20 },
  { id: 'kitty', name: 'Whiskers Hood', kittens: true },
];
const PANELS = {
  panel1: 'The night the lighthouse went dark, the pirates took the Great Crystal... and Grandpa with it. Pip grabbed her raincoat and followed them to the harbor.',
  panel2: 'Grandpa was safe! "Now let\'s get that crystal back," he whispered, "and teach those pirates a lesson."',
};

// ---------- save ----------
let save = { unlocked: 1, stars: {}, kittens: {}, best: {}, outfit: 'classic' };
try { const s = JSON.parse(localStorage.getItem('pp_save')); if (s && s.stars) save = { ...save, ...s }; } catch (e) { /* first run or blocked */ }
function persist() { try { localStorage.setItem('pp_save', JSON.stringify(save)); } catch (e) { /* ignore */ } }
// levels were inserted between old ones: unlock everything up to the first unbeaten level
function recomputeUnlocked() { let i = 0; while (i < ALL.length - 1 && save.stars[ALL[i].id]) i++; save.unlocked = Math.max(1, i + 1); }
recomputeUnlocked();
const starCount = () => Object.values(save.stars).reduce((a, s) => a + s.filter(Boolean).length, 0);
const kittenCount = () => KITTEN_LEVELS.filter(id => save.kittens[id]).length;
const outfitUnlocked = o => o.kittens ? kittenCount() >= KITTEN_LEVELS.length : starCount() >= o.need;
if (!OUTFITS.some(o => o.id === save.outfit && outfitUnlocked(o))) save.outfit = 'classic';
setOutfit(save.outfit);

// ---------- layout ----------
function layout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const w = Math.min(vw, vh * 16 / 9), h = w * 9 / 16;
  stage.style.width = w + 'px'; stage.style.height = h + 'px';
  stage.style.setProperty('--u', (w / 1920) + 'px');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
}
window.addEventListener('resize', layout);
layout();

// ---------- state ----------
let screen = 'loading', scene = null, levelIdx = 0, paused = false, t = 0, testSpeed = 1;
let iris = null;
let panelBg = null, panelNext = null;
const show = (id, on = true) => $(id).classList.toggle('show', on);
function only(...ids) {
  for (const s of ['title', 'map', 'intro', 'hud', 'pause', 'result', 'ending', 'loading', 'panel', 'wardrobe']) show(s, ids.includes(s));
  if (!ids.includes('hud')) { iris = null; $('toast').classList.remove('show'); $('tooltip').classList.remove('show'); }
  $('touch').classList.toggle('show', ids.includes('hud') && isTouch);
}

function irisTo(to, dur = 0.6, cx = W / 2, cy = H / 2) {
  return new Promise(res => { iris = { from: iris ? iris.cur : (to ? 0 : 1), to, t: 0, dur, cx, cy, res, cur: to ? 0 : 1 }; });
}

// ---------- toast / bigtext ----------
let toastT = null;
function toast(text, time = 2.8) {
  const el = $('toast');
  el.innerHTML = `<span class="who">Pip:</span>${text}`;
  el.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), time * 1000);
}
function bigText(text, good = false, time = 1.3) {
  const el = $('bigtext'); el.textContent = text; el.classList.toggle('good', good); el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), time * 1000);
}
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------- HUD ----------
function itemImg(name) { return `assets/img/${name === 'map' || name === 'chart' ? 'map_item' : name === 'keys' ? 'keyring' : name}.png`; }
let lastObj = '';
function renderHud(g) {
  if (g instanceof SailGame) {
    $('hearts').innerHTML = [0, 1, 2].map(i => `<b class="${i < g.hearts ? '' : 'off'}">&#10084;</b>`).join('');
    $('treasures').innerHTML = `<div class="slot wide ${g.gems ? 'got' : ''}"><img src="assets/img/coin.png">${g.gems}</div>`;
    return;
  }
  const list = TREASURES[g.L.id];
  $('treasures').innerHTML = list.map(n => `<div class="slot ${g.found.includes(n) ? 'got' : ''}" data-t="${n}"><img src="${itemImg(n)}" alt=""></div>`).join('')
    + `<div class="slot kit ${g.kitten ? 'got' : ''}" data-k="1" title="Secret kitten"><img src="assets/img/kitten_sit.png" alt=""></div>`;
  $('inv').innerHTML = g.items.map(n => `<div class="slot" data-i="${n}"><img src="${itemImg(n)}" alt=""></div>`).join('');
  const obj = g.objective();
  $('hudObj').textContent = obj;
  if (obj !== lastObj) { lastObj = obj; const o = document.querySelector('.objective'); o.classList.remove('flash'); void o.offsetWidth; o.classList.add('flash'); }
}

function fly(item, x, y, kind) {
  const r = stage.getBoundingClientRect(), u = r.width / W;
  const c = scene && scene.cam;
  if (c && c.z > 1.001) { x = (x - c.x) * c.z + W / 2; y = (y - c.y) * c.z + H / 2; }
  const im = document.createElement('img');
  im.src = kind === 'kitten' ? 'assets/img/kitten_leap.png' : itemImg(item); im.className = 'flyer';
  im.style.left = (x * u - 40 * u) + 'px'; im.style.top = (y * u - 40 * u) + 'px'; im.style.width = (100 * u) + 'px';
  stage.appendChild(im);
  setTimeout(() => {
    const target = kind === 'treasure' ? document.querySelector(`.treasures [data-t="${item}"]`)
      : kind === 'kitten' ? document.querySelector('.treasures [data-k]')
      : document.querySelector(`.inv [data-i="${item}"]`) || $('inv');
    const tr = target ? target.getBoundingClientRect() : { left: r.left + 40, top: r.bottom - 120 };
    im.style.left = (tr.left - r.left + 10 * u) + 'px'; im.style.top = (tr.top - r.top + 10 * u) + 'px'; im.style.width = (90 * u) + 'px';
    im.style.transform = kind === 'kitten' ? 'rotate(-20deg)' : 'rotate(360deg)';
    setTimeout(() => { im.remove(); if (target) { target.classList.remove('pop'); void target.offsetWidth; target.classList.add('pop'); } }, 720);
  }, 40);
}

// ---------- screens ----------
function goTitle() {
  screen = 'title'; scene = null; only('title'); playMusic('title'); setAmbience(0.45);
}

function goMap() {
  screen = 'map'; scene = null; only('map'); playMusic('title'); setAmbience(0.2);
  $('starTotal').textContent = `${starCount()} / ${ALL.length * 3}`;
  $('kitTotal').textContent = `${kittenCount()} / ${KITTEN_LEVELS.length}`;
  const nodes = $('nodes'); nodes.innerHTML = '';
  ALL.forEach((lv, i) => {
    const p = MAP_NODES[i], locked = i >= save.unlocked;
    const b = document.createElement('button');
    b.className = 'node' + (locked ? ' locked' : '') + (i === save.unlocked - 1 && !save.stars[lv.id] ? ' current' : '');
    b.style.left = (p.x / W * 100) + '%'; b.style.top = (p.y / H * 100) + '%';
    b.style.animationDelay = (i * 0.06) + 's';
    b.innerHTML = locked ? '<svg class="lock" viewBox="0 0 24 24" fill="none" stroke="#5a5048" stroke-width="3"><rect x="5" y="11" width="14" height="10" rx="2" fill="#5a5048"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>' : (i === ALL.length - 1 ? '&#9973;' : i + 1);
    if (!locked) b.onclick = () => { sfx.click(); openIntro(i); };
    if (save.kittens[lv.id]) b.innerHTML += '<img class="npaw" src="assets/img/kitten_peek.png" alt="">';
    nodes.appendChild(b);
    const lab = document.createElement('div'); lab.className = 'nlabel'; lab.textContent = lv.name;
    lab.style.left = b.style.left;
    lab.style.top = p.above ? `calc(${b.style.top} - calc(var(--u) * 118))` : `calc(${b.style.top} + calc(var(--u) * 74))`;
    nodes.appendChild(lab);
    if (save.stars[lv.id]) {
      const st = document.createElement('div'); st.className = 'nstars';
      st.innerHTML = save.stars[lv.id].map(s => `<b class="${s ? 'on' : ''}">&#9733;</b>`).join('');
      st.style.left = b.style.left;
      st.style.top = p.above ? `calc(${b.style.top} + calc(var(--u) * 66))` : `calc(${b.style.top} - calc(var(--u) * 112))`;
      nodes.appendChild(st);
    }
  });
  const newOutfit = OUTFITS.find(o => outfitUnlocked(o) && !(save.seenOutfits || []).includes(o.id) && o.id !== 'classic');
  $('btnWardrobe').classList.toggle('new', !!newOutfit);
}

function showPanel(img, text, next) {
  screen = 'panel'; only('panel');
  panelBg = img; panelNext = next;
  $('panelText').textContent = text;
  playMusic('title');
}

function openIntro(i) {
  levelIdx = i;
  const lv = ALL[i];
  if (i === 0 && !save.sawPrologue) { save.sawPrologue = true; persist(); showPanel('panel1', PANELS.panel1, () => openIntro(0)); return; }
  screen = 'intro'; only('intro');
  $('introNum').textContent = i === ALL.length - 1 ? 'Finale' : `Chapter ${i + 1}`;
  $('introName').textContent = lv.name;
  $('introText').textContent = lv.intro || "Grandpa's at the wheel with you and the crystal is safe in your pocket! Sail to the lighthouse before the pirates catch up. Hold W / S to steer around rocks and cannonballs — and scoop up floating gold!";
  $('introTip').textContent = lv.tip || 'Three hits and the ship goes under!';
  const tr = TREASURES[lv.id];
  const best = save.best[lv.id] ? `<span class="best">Best ${fmt(save.best[lv.id])}</span>` : '';
  $('introStars').innerHTML = tr ? tr.map(n => `<img class="${save.stars[lv.id] && save.stars[lv.id][1] ? 'got' : ''}" src="${itemImg(n)}" alt="">`).join('')
    + `<img class="kit ${save.kittens[lv.id] ? 'got' : ''}" src="assets/img/kitten_sit.png" alt="" title="A secret kitten hides in every level">` + best : best;
}

async function startLevel(i, fromCaught = false) {
  levelIdx = i;
  document.querySelectorAll('.flyer').forEach(f => f.remove());
  const lv = ALL[i];
  only('hud');
  $('hud').classList.toggle('sailmode', lv.id === 'sail');
  paused = false;
  if (lv.id === 'sail') {
    scene = new SailGame({
      hud: renderHud,
      progress: d => { $('progress').firstElementChild.style.width = (d * 100) + '%'; },
      lose: async (g) => { if (g !== scene) return; bigText('Shipwrecked!', false, 1.6); await irisTo(0, 0.8, 360, 800); startLevel(levelIdx, true); },
      lit: () => { bigText('The light returns!', true, 2.5); },
      win: g => { if (g === scene) finishSail(g); },
    });
    $('hudName').textContent = lv.name;
    playMusic('sail'); setAmbience(0.7);
    screen = 'play';
    renderHud(scene);
    if (!fromCaught) toast('Hold W / S to steer!', 3.5);
    await irisTo(1, 0.8, 360, 820);
    return;
  }
  lastObj = '';
  scene = new StealthGame(lv, {
    hud: renderHud,
    message: toast,
    fly,
    win: g => { if (g === scene) finishLevel(g); },
    caught: async g => {
      if (g !== scene) return;
      bigText('Caught!', false, 1.2);
      await irisTo(0, 0.7, W / 2, H / 2);
      startLevel(levelIdx, true);
    },
  });
  $('hudName').textContent = lv.name;
  playMusic('sneak'); setAmbience(lv.ambience ?? 0.4);
  screen = 'play';
  renderHud(scene);
  await irisTo(1, 0.7, scene.pl.x, scene.pl.y - 70);
  if (!fromCaught) setTimeout(() => scene && scene.L === lv && toast(lv.tip, 4.5), 300);
  else toast(["Let's try that again... quietly.", 'Sneakier this time!', 'Okay, okay. Watch their eyes!'][Math.floor(Math.random() * 3)], 2.5);
}

async function finishLevel(g) {
  const stars = [true, g.found.length >= 3, !g.seen];
  await irisTo(0, 0.7, W / 2, H / 2);
  const id = g.L.id, time = g.t;
  const prevBest = save.best[id];
  if (!prevBest || time < prevBest) save.best[id] = time;
  const newKitten = g.kitten && !save.kittens[id];
  if (g.kitten) save.kittens[id] = true;
  const before = OUTFITS.filter(outfitUnlocked).length;
  record(id, stars);
  const unlockedNow = OUTFITS.filter(outfitUnlocked).length > before;
  const res = () => showResult(stars, ['Escaped', 'All 3 treasures', 'Never spotted'], { time, best: save.best[id], newBest: prevBest && time < prevBest, kitten: g.kitten, newKitten, unlockedNow });
  if (g.L.panelAfter) showPanel(g.L.panelAfter, PANELS[g.L.panelAfter], res); else res();
}

async function finishSail(g) {
  const stars = [true, g.hits <= 1, g.gems >= 5];
  record('sail', stars);
  await irisTo(0, 1.0, W / 2, H / 2);
  scene = null;
  screen = 'ending'; only('ending');
  panelBg = 'panel3';
  playMusic('title');
  $('endStars').innerHTML = `<span>&#9733; ${starCount()} / ${ALL.length * 3} stars</span><span><img src="assets/img/kitten_sit.png" alt=""> ${kittenCount()} / ${KITTEN_LEVELS.length} kittens</span>`;
  sfx.win();
}

function record(id, stars) {
  const prev = save.stars[id] || [false, false, false];
  save.stars[id] = prev.map((s, i) => s || stars[i]);
  recomputeUnlocked();
  persist();
}

function showResult(stars, labels, info = {}) {
  screen = 'result'; only('result');
  scene = null;
  $('resTitle').textContent = ['Sneaky!', 'Great heist!', 'Master thief!'][stars.filter(Boolean).length - 1];
  const el = $('resStars'); el.innerHTML = '<b>&#9733;</b><b>&#9733;</b><b>&#9733;</b>';
  $('resLabels').innerHTML = labels.map((l, i) => `<span class="${stars[i] ? 'on' : ''}">${stars[i] ? '&#10003; ' : ''}${l}</span>`).join('');
  stars.forEach((s, i) => { if (s) setTimeout(() => { el.children[i].classList.add('on'); sfx.star(i); }, 350 + i * 380); });
  $('resExtra').innerHTML = info.time ? `
    <span class="pill">Time ${fmt(info.time)}${info.newBest ? ' <b>New best!</b>' : info.best ? ` · Best ${fmt(info.best)}` : ''}</span>
    <span class="pill ${info.kitten ? 'kit-on' : ''}"><img src="assets/img/kitten_sit.png" alt="">${info.kitten ? (info.newKitten ? 'Kitten rescued!' : 'Kitten found') : 'A kitten is hiding here...'}</span>
    ${info.unlockedNow ? '<span class="pill new">New outfit unlocked!</span>' : ''}` : '';
  $('btnNext').textContent = levelIdx + 1 < ALL.length ? 'Next' : 'Map';
  playMusic('title');
}

function openWardrobe() {
  screen = 'wardrobe'; only('wardrobe');
  save.seenOutfits = OUTFITS.filter(outfitUnlocked).map(o => o.id); persist();
  $('outfits').innerHTML = OUTFITS.map(o => {
    const ok = outfitUnlocked(o), sel = save.outfit === o.id;
    const img = o.id === 'classic' ? 'pip_cheer' : `outfit_${o.id}_cheer`;
    const need = o.kittens ? `Find all ${KITTEN_LEVELS.length} kittens (${kittenCount()}/${KITTEN_LEVELS.length})` : `${o.need} stars (${Math.min(starCount(), o.need)}/${o.need})`;
    return `<button class="outfit ${ok ? '' : 'locked'} ${sel ? 'sel' : ''}" data-o="${o.id}" ${ok ? '' : 'disabled'}>
      <img src="assets/img/${img}.png" alt=""><b>${o.name}</b><small>${ok ? (sel ? 'Wearing' : 'Wear') : need}</small></button>`;
  }).join('');
  for (const b of $('outfits').querySelectorAll('.outfit:not(.locked)')) b.onclick = () => {
    save.outfit = b.dataset.o; persist(); setOutfit(save.outfit); sfx.pick(); openWardrobe();
  };
}

// ---------- buttons ----------
$('btnPlay').onclick = () => { initAudio(); sfx.click(); goMap(); };
$('btnMapBack').onclick = () => { sfx.click(); goTitle(); };
$('btnWardrobe').onclick = () => { sfx.click(); openWardrobe(); };
$('btnWardrobeBack').onclick = () => { sfx.click(); goMap(); };
$('btnPanel').onclick = () => { sfx.click(); const n = panelNext; panelNext = null; n && n(); };
$('btnGo').onclick = () => { initAudio(); sfx.click(); startLevel(levelIdx); };
$('btnPause').onclick = () => { sfx.click(); setPause(true); };
$('btnResume').onclick = () => { sfx.click(); setPause(false); };
$('btnRestart').onclick = () => { sfx.click(); setPause(false); startLevel(levelIdx, true); };
$('btnToMap').onclick = () => { sfx.click(); setPause(false); scene = null; goMap(); };
$('btnReplay').onclick = () => { sfx.click(); startLevel(levelIdx); };
$('btnNext').onclick = () => { sfx.click(); if (levelIdx + 1 < ALL.length) openIntro(levelIdx + 1); else goMap(); };
$('btnEndMap').onclick = () => { sfx.click(); goMap(); };
$('btnEndTitle').onclick = () => { sfx.click(); goTitle(); };
$('btnHint').onclick = () => {
  sfx.click();
  if (scene instanceof StealthGame) { scene.hintT = 4; toast(scene.L.hint(scene), 6); }
};
function syncSoundBtn() { $('btnSound').classList.toggle('muted', isMuted()); }
$('btnSound').onclick = () => { initAudio(); setMuted(!isMuted()); syncSoundBtn(); sfx.click(); };
syncSoundBtn();

function setPause(p) {
  if (screen !== 'play') return;
  paused = p; show('pause', p);
  if (p && scene && scene.keys) for (const k in scene.keys) scene.key(k, false);
}

// ---------- input: mouse hover labels ----------
function toLogical(e) {
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
}
cv.addEventListener('pointerdown', () => {
  initAudio();
  if (screen === 'title') { goMap(); sfx.click(); }
});
cv.addEventListener('pointermove', e => {
  if (screen !== 'play' || !scene) { $('tooltip').classList.remove('show'); return; }
  const p = toLogical(e);
  const label = scene.pointerMove(p.x, p.y);
  const tt = $('tooltip');
  if (label && e.pointerType === 'mouse') {
    const r = stage.getBoundingClientRect();
    tt.textContent = label; tt.style.left = (e.clientX - r.left) + 'px'; tt.style.top = (e.clientY - r.top) + 'px'; tt.classList.add('show');
  } else tt.classList.remove('show');
});
cv.addEventListener('pointerleave', () => $('tooltip').classList.remove('show'));

// ---------- input: keyboard ----------
const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  KeyE: 'act', Space: 'act', Enter: 'act',
};
window.addEventListener('keydown', e => {
  if (e.code === 'Escape' || e.code === 'KeyP') { if (screen === 'play') setPause(!paused); }
  if (e.code === 'KeyH' && screen === 'play') $('btnHint').click();
  const k = KEYMAP[e.code];
  if (!k) return;
  e.preventDefault();
  initAudio();
  if (e.repeat && k === 'act') return;
  if (screen === 'title' && k === 'act') { goMap(); return; }
  if (screen === 'intro' && k === 'act') { $('btnGo').click(); return; }
  if (screen === 'panel' && k === 'act') { $('btnPanel').click(); return; }
  if (screen === 'play' && !paused && scene && !(iris && iris.to === 0)) scene.key(k, true);
});
window.addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k && scene) scene.key(k, false); });
window.addEventListener('blur', () => { if (scene && scene.keys) for (const k in scene.keys) scene.key(k, false); });
document.addEventListener('visibilitychange', () => { if (document.hidden && screen === 'play') setPause(true); });

// ---------- input: touch buttons (phones / iPad) ----------
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
for (const b of document.querySelectorAll('#touch [data-k]')) {
  const k = b.dataset.k;
  const down = e => { e.preventDefault(); initAudio(); b.classList.add('on'); if (screen === 'play' && !paused && scene) scene.key(k, true); };
  const up = e => { e.preventDefault(); b.classList.remove('on'); if (scene) scene.key(k, false); };
  b.addEventListener('pointerdown', down);
  b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
}

// ---------- render loop ----------
let last = performance.now();
const titleStars = Array.from({ length: 40 }, () => ({ x: Math.random() * W, y: Math.random() * 480, p: Math.random() * 6 }));

function drawTitleScene() {
  const pan = Math.sin(t * 0.08) * 30;
  ctx.drawImage(IMG.bg_harbor, -40 + pan, -20, W + 80, H + 45);
  for (const s of titleStars) {
    const a = 0.5 + 0.5 * Math.sin(t * 2 + s.p);
    ctx.fillStyle = `rgba(255,250,220,${a * 0.8})`; ctx.beginPath(); ctx.arc(s.x, s.y, 2 * a + 0.5, 0, Math.PI * 2); ctx.fill();
  }
  const pre = save.outfit === 'classic' ? 'pip_' : `outfit_${save.outfit}_`;
  const px = 300 + Math.sin(t * 0.7) * 6;
  drawSprite(ctx, pre + 'sneak', px, 676, 0.5, false);
  drawSprite(ctx, 'barrel', 390, 680, 0.7);
  drawSprite(ctx, 'kitten_peek', 385, 548 + Math.max(0, Math.sin(t * 0.9)) * 30, 0.34);
  const wx = 1100 + Math.sin(t * 0.25) * 420, wf = Math.cos(t * 0.25) < 0;
  drawSprite(ctx, 'deckhand_' + (['walk1', 'idle', 'walk2', 'idle'][Math.floor(t * 6) % 4]), wx, 676 - Math.abs(Math.sin(t * 9)) * 4, 0.62, wf);
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H);
  g.addColorStop(0, 'rgba(0,0,0,0.1)'); g.addColorStop(1, 'rgba(5,3,15,0.75)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function drawPanelBg(name) {
  // slow Ken Burns drift over the story painting
  const z = 1.06 + Math.sin(t * 0.12) * 0.03;
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2 + Math.sin(t * 0.09) * 20, -H / 2);
  ctx.drawImage(IMG[name], 0, 0, W, H); ctx.restore();
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  render(dt);
  requestAnimationFrame(frame);
}

function render(dt) {
  t += dt;
  ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
  ctx.imageSmoothingQuality = 'high';
  if (screen === 'title') drawTitleScene();
  else if (screen === 'map' || screen === 'wardrobe') ctx.drawImage(IMG.map, 0, 0, W, H);
  else if (screen === 'panel' || screen === 'ending') drawPanelBg(panelBg || 'panel1');
  else if (scene) {
    if (!paused && screen === 'play') for (let i = 0; i < testSpeed; i++) scene.update(dt);
    scene.draw(ctx);
  } else ctx.drawImage(IMG.map, 0, 0, W, H);
  if (iris) {
    iris.t += dt;
    const k = Math.min(1, iris.t / iris.dur);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    iris.cur = iris.from + (iris.to - iris.from) * e;
    const R = Math.hypot(W, H) * iris.cur;
    ctx.fillStyle = '#07060f';
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(iris.cx, iris.cy, Math.max(0.1, R), 0, Math.PI * 2, true); ctx.fill();
    if (k >= 1) { const r = iris.res; if (iris.to === 1) iris = null; else iris.t = iris.dur; r && r(); if (iris) iris.res = null; }
  }
}

loadAll(p => { $('loadbar').style.width = (p * 100) + '%'; }).then(() => {
  document.fonts && document.fonts.load('700 40px Fredoka').catch(() => {});
  goTitle();
  requestAnimationFrame(frame);
  // debug/test hooks (used by automated playtests)
  window.__pp = { get scene() { return scene; }, startLevel, openIntro, goMap, save, get screen() { return screen; }, set speed(v) { testSpeed = v; }, ALL, tick: (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) render(dt); } };
});
