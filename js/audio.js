// All sound is synthesized with WebAudio — zero audio files, zero credits.
// Voices are soft plucks / music-box tones through a small room reverb; noise is used
// only for short, heavily-filtered transients (no constant hiss).
let ac = null, master, sfxBus, musicBus, ambBus, reverb, noiseBuf;
let muted = false;
try { muted = localStorage.getItem('pp_muted') === '1'; } catch (e) { /* storage blocked */ }

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  ac = new (window.AudioContext || window.webkitAudioContext)();

  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.2;
  comp.connect(ac.destination);
  master = ac.createGain(); master.gain.value = muted ? 0 : 0.85; master.connect(comp);

  // small warm room reverb from a generated impulse
  reverb = ac.createConvolver();
  const len = ac.sampleRate * 2.2, ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  reverb.buffer = ir;
  const wet = ac.createGain(); wet.gain.value = 0.28;
  const tone = ac.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 3200;
  reverb.connect(tone); tone.connect(wet); wet.connect(master);

  sfxBus = ac.createGain(); sfxBus.gain.value = 0.7; sfxBus.connect(master);
  musicBus = ac.createGain(); musicBus.gain.value = 0.5; musicBus.connect(master);
  const sfxSend = ac.createGain(); sfxSend.gain.value = 0.25; sfxBus.connect(sfxSend); sfxSend.connect(reverb);
  const musSend = ac.createGain(); musSend.gain.value = 0.55; musicBus.connect(musSend); musSend.connect(reverb);
  ambBus = ac.createGain(); ambBus.gain.value = 0; ambBus.connect(master);

  noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  startWaves();
}

export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('pp_muted', m ? '1' : '0'); } catch (e) { /* ignore */ }
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.85, ac.currentTime, 0.05);
}

const now = () => ac.currentTime;

// ---------- voices ----------
function env(g, t, peak, attack, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}
function osc(type, freq, t, dur, dest, peak, attack = 0.005, detune = 0) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
  env(g, t, peak, attack, dur);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + attack + dur + 0.05);
  return o;
}
function lp(freq, dest) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; f.connect(dest); return f; }

/** Warm pluck (harp / pizzicato): triangle + soft octave, fast decay, lowpassed. */
function pluck(freq, when = 0, vol = 0.2, decay = 0.5, bus = sfxBus) {
  if (!ac) return;
  const t = now() + when, out = lp(Math.min(4000, freq * 6), bus);
  osc('triangle', freq, t, decay, out, vol);
  osc('sine', freq * 2, t, decay * 0.5, out, vol * 0.35);
}
/** Music-box / celesta tone: pure sine with a quiet bell partial. */
function chime(freq, when = 0, vol = 0.15, decay = 1.2, bus = sfxBus) {
  if (!ac) return;
  const t = now() + when;
  osc('sine', freq, t, decay, bus, vol);
  osc('sine', freq * 3, t, decay * 0.3, bus, vol * 0.18);
  osc('sine', freq * 5.4, t, decay * 0.12, bus, vol * 0.06);
}
/** Soft marimba: sine with a quick 4th-harmonic knock. */
function marimba(freq, when = 0, vol = 0.18, decay = 0.6, bus = sfxBus) {
  if (!ac) return;
  const t = now() + when;
  osc('sine', freq, t, decay, bus, vol, 0.003);
  osc('sine', freq * 4, t, 0.06, bus, vol * 0.25, 0.002);
}
/** Round bass note. */
function bass(freq, when = 0, vol = 0.22, decay = 0.45, bus = musicBus) {
  if (!ac) return;
  const t = now() + when, out = lp(600, bus);
  osc('sine', freq, t, decay, out, vol, 0.01);
  osc('triangle', freq, t, decay * 0.6, out, vol * 0.4, 0.01);
}
/** Filtered noise transient — always short and band-limited (no hiss). */
function puff(dur, { vol = 0.1, when = 0, freq = 800, q = 1.2, sweep = null, type = 'bandpass', bus = sfxBus } = {}) {
  if (!ac) return;
  const t = now() + when;
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + Math.min(0.02, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(bus);
  s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
function thud(freq, dur, vol, when = 0) {
  if (!ac) return;
  const t = now() + when, o = ac.createOscillator(), g = ac.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + dur);
  env(g, t, vol, 0.004, dur); o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur + 0.05);
}
const hz = semis => 440 * 2 ** (semis / 12);

export const sfx = {
  step() { thud(150 + Math.random() * 30, 0.07, 0.07); },
  climb() { thud(230 + Math.random() * 40, 0.06, 0.06); },
  click() { marimba(880, 0, 0.1, 0.15); },
  tap() { marimba(660, 0, 0.06, 0.1); },
  pick() { [0, 4, 7, 12].forEach((n, i) => chime(hz(3 + n), i * 0.06, 0.1, 0.7)); },
  treasure() { [0, 4, 7, 12, 16].forEach((n, i) => chime(hz(7 + n), i * 0.07, 0.11, 1.1)); },
  hide() { puff(0.22, { vol: 0.06, freq: 500, sweep: 220, q: 0.7, type: 'lowpass' }); thud(200, 0.12, 0.08); },
  unhide() { puff(0.18, { vol: 0.05, freq: 300, sweep: 700, q: 0.7, type: 'lowpass' }); },
  search() { for (let i = 0; i < 3; i++) { thud(260 + Math.random() * 120, 0.06, 0.06, i * 0.15); puff(0.06, { vol: 0.03, freq: 1200, q: 2, when: i * 0.15 }); } },
  suspicious() { marimba(hz(2), 0, 0.12, 0.25); marimba(hz(7), 0.12, 0.12, 0.35); },
  alert() { pluck(hz(14), 0, 0.2, 0.25); pluck(hz(19), 0.09, 0.22, 0.5); },
  caught() { [0, -2, -5, -9].forEach((n, i) => pluck(hz(-2 + n), 0.35 + i * 0.17, 0.18, 0.5)); },
  bell() { chime(hz(3), 0, 0.14, 2.2); },
  squeak() { chime(2400, 0, 0.05, 0.08); chime(2900, 0.1, 0.05, 0.08); },
  clatter() { [0, 0.16, 0.27, 0.34].forEach((w, i) => { chime(1400 + Math.random() * 600, w, 0.08 / (i + 1), 0.35); thud(300, 0.08, 0.06 / (i + 1), w); }); },
  squawk() { pluck(hz(12), 0, 0.2, 0.2); pluck(hz(8), 0.14, 0.2, 0.3); },
  unlock() { marimba(hz(10), 0, 0.12, 0.1); marimba(hz(5), 0.09, 0.12, 0.2); chime(hz(15), 0.22, 0.08, 0.6); },
  chain() {
    for (let i = 0; i < 12; i++) chime(1800 + Math.random() * 900, i * 0.07, 0.03, 0.12);
    thud(90, 0.7, 0.25, 0.9); puff(0.8, { vol: 0.08, freq: 350, sweep: 120, type: 'lowpass', when: 0.95 });
  },
  splash() { puff(0.5, { vol: 0.08, freq: 1400, sweep: 300, q: 0.7 }); },
  hit() { thud(110, 0.35, 0.3); puff(0.25, { vol: 0.06, freq: 500, type: 'lowpass' }); },
  cannon() { thud(70, 0.45, 0.28); puff(0.35, { vol: 0.07, freq: 400, sweep: 120, type: 'lowpass' }); },
  whoosh() { puff(0.3, { vol: 0.05, freq: 300, sweep: 1400, q: 0.8 }); },
  win() { [0, 4, 7, 12].forEach((n, i) => pluck(hz(3 + n), i * 0.11, 0.18, 0.6)); [12, 16, 19, 24].forEach((n, i) => chime(hz(3 + n), 0.5 + i * 0.06, 0.07, 1.4)); },
  star(i) { chime(hz(12 + i * 4), 0, 0.14, 1.0); },
  hop() { marimba(hz(-5), 0, 0.08, 0.12); marimba(hz(2), 0.07, 0.08, 0.14); },
  lift() { thud(120, 0.25, 0.12); for (let i = 0; i < 4; i++) marimba(hz(-14 + i), i * 0.08, 0.05, 0.1); },
  creak() { const t = Math.random() * 3; marimba(hz(-10 + t), 0, 0.05, 0.25); },
  snuff() { puff(0.35, { vol: 0.07, freq: 900, sweep: 200, q: 0.6 }); },
  relight() { puff(0.25, { vol: 0.06, freq: 2500, sweep: 800, q: 1 }); chime(hz(0), 0.05, 0.05, 0.4); },
  meow() {
    if (!ac) return;
    const t = now(), o = ac.createOscillator(), g = ac.createGain(), out = lp(2600, sfxBus);
    o.type = 'triangle'; o.frequency.setValueAtTime(700, t); o.frequency.linearRampToValueAtTime(1050, t + 0.12); o.frequency.linearRampToValueAtTime(620, t + 0.45);
    env(g, t, 0.12, 0.03, 0.45); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.55);
    [0, 4, 7].forEach((n, i) => chime(hz(12 + n), 0.3 + i * 0.07, 0.07, 0.8));
  },
  bark() { [0, 0.22].forEach(w => { thud(240, 0.12, 0.2, w); puff(0.1, { vol: 0.08, freq: 700, q: 1.5, when: w }); }); },
  sniff() { [0, 0.12, 0.24].forEach(w => puff(0.08, { vol: 0.05, freq: 2000, q: 2, when: w })); },
  lighthouse() { [0, 7, 12, 16, 19, 24].forEach((n, i) => chime(hz(-2 + n), i * 0.2, 0.1, 2.2)); },
};

// ---------- ambience: occasional soft wave swells (not a constant hiss) ----------
let waveTimer = null, ambLevel = 0;
function startWaves() {
  const swell = () => {
    if (ambLevel > 0.01 && !muted) {
      const t = now(), dur = 3 + Math.random() * 2;
      const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.3;
      f.frequency.setValueAtTime(180, t); f.frequency.linearRampToValueAtTime(520, t + dur * 0.45); f.frequency.linearRampToValueAtTime(160, t + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05 * ambLevel, t + dur * 0.45); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(master);
      s.start(t); s.stop(t + dur + 0.1);
    }
    waveTimer = setTimeout(swell, 4500 + Math.random() * 4000);
  };
  swell();
}
export function setAmbience(level) { ambLevel = level; }

// ---------- music: tiny step sequencer ----------
const N = n => { if (!n) return 0; const m = n.match(/^([A-G])(#|b)?(\d)$/); const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); return 440 * 2 ** ((base + (+m[3] + 1) * 12 - 69) / 12); };

const SONGS = {
  // tiptoe pizzicato in D minor — for sneaking
  sneak: {
    bpm: 96, voice: 'marimba', melVol: 0.13, bassVol: 0.2, bassDecay: 0.3, melDecay: 0.55,
    bass: ['D3', '', 'A2', '', 'D3', '', 'F3', '', 'C3', '', 'G2', '', 'C3', '', 'E3', '', 'Bb2', '', 'F2', '', 'Bb2', '', 'D3', '', 'A2', '', 'E3', '', 'A2', '', 'C#3', ''],
    mel: ['', '', '', '', 'A4', '', 'F4', '', '', '', '', '', 'G4', '', 'E4', '', '', '', '', '', 'F4', '', 'D4', '', '', '', 'E4', '', 'C#4', '', '', 'A3'],
  },
  // "Drunken Sailor" (traditional, public domain) — for the escape
  sail: {
    bpm: 152, voice: 'pluck', melVol: 0.16, bassVol: 0.2, bassDecay: 0.3, melDecay: 0.4,
    mel: ['A4', '', 'A4', 'A4', 'A4', '', 'A4', 'A4', 'A4', '', 'D4', '', 'F4', '', 'A4', '', 'G4', '', 'G4', 'G4', 'G4', '', 'G4', 'G4', 'G4', '', 'C4', '', 'E4', '', 'G4', '',
      'A4', '', 'A4', 'A4', 'A4', '', 'A4', 'A4', 'A4', '', 'B4', '', 'C#5', '', 'D5', '', 'C5', '', 'A4', '', 'G4', '', 'E4', '', 'D4', '', '', '', 'D4', '', '', ''],
    bass: ['D3', '', 'A2', '', 'D3', '', 'A2', '', 'D3', '', 'A2', '', 'D3', '', 'A2', '', 'C3', '', 'G2', '', 'C3', '', 'G2', '', 'C3', '', 'G2', '', 'C3', '', 'G2', '',
      'D3', '', 'A2', '', 'D3', '', 'A2', '', 'D3', '', 'A2', '', 'D3', '', 'A2', '', 'A2', '', 'E3', '', 'A2', '', 'C#3', '', 'D3', '', 'A2', '', 'D3', '', '', ''],
  },
  // gentle music-box for menus
  title: {
    bpm: 80, voice: 'chime', melVol: 0.12, bassVol: 0.16, bassDecay: 1.4, melDecay: 1.6,
    mel: ['D5', '', 'A4', '', 'F4', '', 'A4', '', 'E5', '', 'C5', '', 'A4', '', 'C5', '', 'F5', '', 'D5', '', 'Bb4', '', 'D5', '', 'E5', '', 'C#5', '', 'A4', '', '', ''],
    bass: ['D3', '', '', '', '', '', '', '', 'A2', '', '', '', '', '', '', '', 'Bb2', '', '', '', '', '', '', '', 'A2', '', '', '', '', '', '', ''],
  },
};

let cur = null, stepIdx = 0, nextT = 0, timer = null;
export function playMusic(name) {
  if (!ac) return;
  if (cur === name) return;
  cur = name; stepIdx = 0; nextT = now() + 0.15;
  if (!timer) timer = setInterval(schedule, 50);
}
export function stopMusic() { cur = null; }

function schedule() {
  if (!cur || !ac) return;
  const s = SONGS[cur];
  const dt = 60 / s.bpm / 2;
  while (nextT < now() + 0.2) {
    const when = nextT - now();
    const b = s.bass[stepIdx % s.bass.length], m = s.mel[stepIdx % s.mel.length];
    if (b) bass(N(b), when, s.bassVol, s.bassDecay);
    if (m) {
      const f = N(m);
      if (s.voice === 'chime') chime(f, when, s.melVol, s.melDecay, musicBus);
      else if (s.voice === 'marimba') marimba(f, when, s.melVol, s.melDecay, musicBus);
      else pluck(f, when, s.melVol, s.melDecay, musicBus);
    }
    stepIdx++; nextT += dt;
  }
}
