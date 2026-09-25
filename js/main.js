// Screen flow, HUD, saving, input and the main loop.
import { loadAll, IMG, drawSprite } from './assets.js';
import { initAudio, sfx, playMusic, setAmbience, setMuted, isMuted } from './audio.js';
import { StealthGame, W, H } from './game.js';
import { SailGame } from './sail.js';
import { LEVELS, FINALE, MAP_NODES } from './levels.js';

const $ = id => document.getElementById(id);
const stage = $('stage'), cv = $('cv'), ctx = cv.getContext('2d');
const ALL = [...LEVELS, FINALE];
const TREASURES = {
  harbor: ['coin', 'ruby', 'pearl'], below: ['coin', 'ruby', 'pearl'], cabin: ['crown', 'ruby', 'coin'], deck: ['ruby', 'crown', 'coin'],
};

// ---------- save ----------
let save = { unlocked: 1, stars: {} };
try { const s = JSON.parse(localStorage.getItem('pp_save')); if (s && s.unlocked) save = s; } catch (e) { /* first run or blocked */ }
function persist() { try { localStorage.setItem('pp_save', JSON.stringify(save)); } catch (e) { /* ignore */ } }
const starCount = () => Object.values(save.stars).reduce((a, s) => a + s.filter(Boolean).length, 0);

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
let iris = null; // {from,to,t,dur,cx,cy,resolve}
const show = (id, on = true) => $(id).classList.toggle('show', on);
function only(...ids) {
  for (const s of ['title', 'map', 'intro', 'hud', 'pause', 'result', 'ending', 'loading']) show(s, ids.includes(s));
  if (!ids.includes('hud')) iris = null; // menus always draw unobstructed
}

function irisTo(to, dur = 0.6, cx = W / 2, cy = H / 2) {
  return new Promise(res => { iris = { from: iris ? iris.cur : (to ? 0 : 1), to, t: 0, dur, cx, cy, res, cur: to ? 0 : 1 }; });
}

// ---------- toast / tooltip / bigtext ----------
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

// ---------- HUD ----------
function itemImg(name) { return `assets/img/${name === 'map' ? 'map_item' : name}.png`; }
let lastObj = '';
function renderHud(g) {
  if (g instanceof SailGame) {
    $('hearts').innerHTML = [0, 1, 2].map(i => `<b class="${i < g.hearts ? '' : 'off'}">&#10084;</b>`).join('');
    $('treasures').innerHTML = `<div class="slot ${g.gems ? 'got' : ''}" style="width:auto;padding:0 calc(var(--u)*22);gap:calc(var(--u)*8);display:flex;align-items:center;font-size:calc(var(--u)*50);font-weight:700;color:#ffe9a0"><img src="assets/img/coin.png" style="height:calc(var(--u)*70);filter:none">${g.gems}</div>`;
    return;
  }
  const list = TREASURES[g.L.id];
  $('treasures').innerHTML = list.map(n => `<div class="slot ${g.found.includes(n) ? 'got' : ''}" data-t="${n}"><img src="${itemImg(n)}" alt=""></div>`).join('');
  $('inv').innerHTML = g.items.map(n => `<div class="slot" data-i="${n}"><img src="${itemImg(n)}" alt=""></div>`).join('');
  const obj = g.objective();
  $('hudObj').textContent = obj;
  if (obj !== lastObj) { lastObj = obj; const o = document.querySelector('.objective'); o.classList.remove('flash'); void o.offsetWidth; o.classList.add('flash'); }
}

function fly(item, x, y, kind) {
  const r = stage.getBoundingClientRect(), u = r.width / W;
  const im = document.createElement('img');
  im.src = itemImg(item); im.className = 'flyer';
  im.style.left = (x * u - 40 * u) + 'px'; im.style.top = (y * u - 40 * u) + 'px'; im.style.width = (100 * u) + 'px';
  stage.appendChild(im);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const target = kind === 'treasure' ? document.querySelector(`.treasures [data-t="${item}"]`) : document.querySelector(`.inv [data-i="${item}"]`) || $('inv');
    const tr = target ? target.getBoundingClientRect() : { left: r.left + 40, top: r.bottom - 120, width: 100 };
    im.style.left = (tr.left - r.left + 10 * u) + 'px'; im.style.top = (tr.top - r.top + 10 * u) + 'px'; im.style.width = (90 * u) + 'px';
    im.style.transform = 'rotate(360deg)';
    setTimeout(() => { im.remove(); if (target) { target.classList.remove('pop'); void target.offsetWidth; target.classList.add('pop'); } }, 720);
  }));
}

// ---------- screens ----------
function goTitle() {
  screen = 'title'; scene = null; only('title'); playMusic('title'); setAmbience(0.45);
}

function goMap() {
  screen = 'map'; scene = null; only('map'); playMusic('title'); setAmbience(0.2);
  $('starTotal').textContent = `${starCount()} / ${ALL.length * 3}`;
  const nodes = $('nodes'); nodes.innerHTML = '';
  ALL.forEach((lv, i) => {
    const p = MAP_NODES[i], locked = i >= save.unlocked;
    const b = document.createElement('button');
    b.className = 'node' + (locked ? ' locked' : '') + (i === save.unlocked - 1 && !save.stars[lv.id] ? ' current' : '');
    b.style.left = (p.x / W * 100) + '%'; b.style.top = (p.y / H * 100) + '%';
    b.style.animationDelay = (i * 0.08) + 's';
    b.innerHTML = locked ? '<svg class="lock" viewBox="0 0 24 24" fill="none" stroke="#5a5048" stroke-width="3"><rect x="5" y="11" width="14" height="10" rx="2" fill="#5a5048"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>' : (i === ALL.length - 1 ? '&#9973;' : i + 1);
    if (!locked) b.onclick = () => { sfx.click(); openIntro(i); };
    nodes.appendChild(b);
    const lab = document.createElement('div'); lab.className = 'nlabel'; lab.textContent = lv.name;
    lab.style.left = b.style.left; lab.style.top = `calc(${b.style.top} + calc(var(--u) * 78))`;
    nodes.appendChild(lab);
    if (save.stars[lv.id]) {
      const st = document.createElement('div'); st.className = 'nstars';
      st.innerHTML = save.stars[lv.id].map(s => `<b class="${s ? 'on' : ''}">&#9733;</b>`).join('');
      st.style.left = b.style.left; st.style.top = `calc(${b.style.top} - calc(var(--u) * 122))`;
      nodes.appendChild(st);
    }
  });
}

function openIntro(i) {
  levelIdx = i;
  const lv = ALL[i];
  screen = 'intro'; only('intro');
  $('introNum').textContent = i === ALL.length - 1 ? 'Finale' : `Chapter ${i + 1}`;
  $('introName').textContent = lv.name;
  $('introText').textContent = lv.intro || "The ship is ours! Sail her to the lighthouse before the pirates catch up. Hold W / S to steer around rocks and cannonballs — and scoop up floating gold!";
  $('introTip').textContent = lv.tip || 'Three hits and the ship goes under!';
  $('introTip').style.display = '';
  const tr = TREASURES[lv.id];
  $('introStars').innerHTML = tr ? tr.map(n => `<img src="${itemImg(n)}" alt="">`).join('') : '';
}

async function startLevel(i, fromCaught = false) {
  levelIdx = i;
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
    win: (g) => { if (g === scene) finishLevel(g); },
    caught: async (g) => {
      if (g !== scene) return;
      bigText('Caught!', false, 1.2);
      await irisTo(0, 0.7, g.pl.x, g.pl.y - 70);
      startLevel(levelIdx, true);
    },
  });
  $('hudName').textContent = lv.name;
  playMusic('sneak'); setAmbience(lv.ambience ?? 0.4);
  screen = 'play';
  renderHud(scene);
  await irisTo(1, 0.7, scene.pl.x, scene.pl.y - 70);
  if (!fromCaught) setTimeout(() => scene && scene.L === lv && toast(lv.tip, 4.5), 300);
  else toast(['Let\'s try that again... quietly.', 'Sneakier this time!', 'Okay, okay. Watch their eyes!'][Math.floor(Math.random() * 3)], 2.5);
}

async function finishLevel(g) {
  const stars = [true, g.found.length >= 3, !g.seen];
  await irisTo(0, 0.7, g.pl.x, g.pl.y - 70);
  record(g.L.id, stars);
  showResult(stars, ['Escaped', 'All 3 treasures', 'Never spotted']);
}

async function finishSail(g) {
  const stars = [true, g.hits <= 1, g.gems >= 5];
  record('sail', stars);
  await irisTo(0, 1.0, W / 2, H / 2);
  scene = null;
  screen = 'ending'; only('ending');
  playMusic('title');
  const tot = starCount();
  $('endStars').innerHTML = `<div style="font-size:calc(var(--u)*44);font-weight:700;color:#4a2a0c">&#9733; ${tot} / ${ALL.length * 3} stars</div>`;
  sfx.win();
}

function record(id, stars) {
  const prev = save.stars[id] || [false, false, false];
  save.stars[id] = prev.map((s, i) => s || stars[i]);
  save.unlocked = Math.max(save.unlocked, Math.min(ALL.length, levelIdx + 2));
  persist();
}

function showResult(stars, labels) {
  screen = 'result'; only('result');
  scene = null;
  $('resTitle').textContent = ['Sneaky!', 'Great heist!', 'Master thief!'][stars.filter(Boolean).length - 1];
  const el = $('resStars'); el.innerHTML = '<b>&#9733;</b><b>&#9733;</b><b>&#9733;</b>';
  $('resLabels').innerHTML = labels.map((l, i) => `<span class="${stars[i] ? 'on' : ''}">${stars[i] ? '&#10003; ' : ''}${l}</span>`).join('');
  stars.forEach((s, i) => { if (s) setTimeout(() => { el.children[i].classList.add('on'); sfx.star(i); }, 350 + i * 380); });
  $('btnNext').textContent = levelIdx + 1 < ALL.length ? 'Next' : 'Map';
  playMusic('title');
}

// ---------- buttons ----------
$('btnPlay').onclick = () => { initAudio(); sfx.click(); goMap(); };
$('btnMapBack').onclick = () => { sfx.click(); goTitle(); };
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
}

// ---------- input ----------
function toLogical(e) {
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
}
let pointerDown = false;
cv.addEventListener('pointerdown', e => {
  initAudio();
  pointerDown = true;
  if (screen === 'title') { goMap(); sfx.click(); return; }
  // movement is keyboard-only (WASD); clicks on the canvas do nothing in-game
});
window.addEventListener('pointerup', () => { pointerDown = false; });
cv.addEventListener('pointermove', e => {
  if (screen !== 'play' || !scene) { $('tooltip').classList.remove('show'); return; }
  const p = toLogical(e);
  const label = scene.pointerMove(p.x, p.y, pointerDown);
  const tt = $('tooltip');
  if (label && e.pointerType === 'mouse') {
    const r = stage.getBoundingClientRect();
    tt.textContent = label; tt.style.left = (e.clientX - r.left) + 'px'; tt.style.top = (e.clientY - r.top) + 'px'; tt.classList.add('show');
    cv.style.cursor = 'pointer';
  } else { tt.classList.remove('show'); }
});
cv.addEventListener('pointerleave', () => $('tooltip').classList.remove('show'));
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
  if (screen === 'title' && k === 'act') { goMap(); return; }
  if (screen === 'intro' && k === 'act' && !e.repeat) { $('btnGo').click(); return; }
  if (screen === 'play' && !paused && scene && !(iris && iris.to === 0)) scene.key(k, true);
});
window.addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k && scene) scene.key(k, false); });
window.addEventListener('blur', () => { if (scene && scene.keys) for (const k in scene.keys) scene.key(k, false); });
document.addEventListener('visibilitychange', () => { if (document.hidden && screen === 'play') setPause(true); });

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
  // Pip peeking from behind a crate, the watchman strolling by
  const px = 300 + Math.sin(t * 0.7) * 6;
  drawSprite(ctx, 'pip_sneak', px, 676, 0.5, false);
  drawSprite(ctx, 'barrel', 390, 680, 0.7);
  const wx = 1100 + Math.sin(t * 0.25) * 420, wf = Math.cos(t * 0.25) < 0;
  drawSprite(ctx, 'deckhand_' + (['walk1', 'idle', 'walk2', 'idle'][Math.floor(t * 6) % 4]), wx, 676 - Math.abs(Math.sin(t * 9)) * 4, 0.62, wf);
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H);
  g.addColorStop(0, 'rgba(0,0,0,0.1)'); g.addColorStop(1, 'rgba(5,3,15,0.75)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
  ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
  ctx.imageSmoothingQuality = 'high';
  if (screen === 'title') drawTitleScene();
  else if (screen === 'map') { ctx.drawImage(IMG.map, 0, 0, W, H); }
  else if (scene) {
    if (!paused && screen === 'play') for (let i = 0; i < testSpeed; i++) scene.update(dt);
    scene.draw(ctx);
  } else if (screen === 'intro' || screen === 'result' || screen === 'ending') {
    ctx.drawImage(IMG.map, 0, 0, W, H);
  }
  // iris wipe
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
  requestAnimationFrame(frame);
}

loadAll(p => { $('loadbar').style.width = (p * 100) + '%'; }).then(() => {
  document.fonts && document.fonts.load('700 40px Fredoka').catch(() => {});
  goTitle();
  requestAnimationFrame(frame);
  // debug/test hooks (used by automated playtests)
  window.__pp = { get scene() { return scene; }, startLevel, openIntro, goMap, save, get screen() { return screen; }, set speed(v) { testSpeed = v; } };
});
