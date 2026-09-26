// Stealth-level engine: WASD movement, ladders & lifts, animated hiding, guards with vision,
// darkness & lanterns, noise, dogs that sniff, pickpocketing, items, secret kittens.
import { IMG, drawSprite, spriteSize } from './assets.js';
import { sfx } from './audio.js';

export const W = 1920, H = 1080;

const CHAR = {
  pip: { scale: 0.46 },
  deckhand: { scale: 0.62 },
  cook: { scale: 0.52 },
  captain: { scale: 0.56 },
  mate: { scale: 0.54 },
  jailer: { scale: 0.6 },
  dog: { scale: 0.5 },
};
const PIP_SPEED = 270, CLIMB_SPEED = 230, LIFT_SPEED = 150;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const HIDDEN = ['hiding', 'hide'];

// Which Pip outfit is worn (sprite prefix). Set from the wardrobe.
let PIP = 'pip_';
export function setOutfit(name) { PIP = !name || name === 'classic' ? 'pip_' : `outfit_${name}_`; }

export class StealthGame {
  constructor(level, hooks) {
    this.L = level;
    this.hooks = hooks;
    this.t = 0;
    this.flags = {};
    this.items = [...(level.startItems || [])];
    this.found = [];            // treasures collected
    this.kitten = false;        // secret kitten found
    this.seen = false;          // for the "ghost" star
    this.over = false;
    this.particles = [];
    this.shake = 0;
    this.freeze = 0;
    this.cam = { z: 1, x: W / 2, y: H / 2, tz: 1, tx: W / 2, ty: H / 2 };
    this.hintT = 0;
    this.hover = null;
    this.keys = {};
    this.near = null;

    this.objects = level.objects.map(o => ({ ...o, done: false, spark: rand(0.5, 2.5), sq: 0 }));
    this.ladders = level.ladders.map(l => ({ ...l, restY: this.L.floors[l.bottom].y }));
    this.lamps = {};
    for (const l of level.lights || []) if (l.id) this.lamps[l.id] = { ...l, lit: true };
    this.enemies = level.enemies.map(e => this.makeEnemy(e));

    const s = level.start;
    this.pl = {
      floor: s.floor, x: s.x, y: this.fy(s.floor), face: s.face || 1,
      state: 'idle', route: [], pending: null, hideObj: null, act: null,
      animT: 0, stepT: 0, squash: 0, hk: 0, peekT: 2,
    };
    level.init && level.init(this);
  }

  // ---------- helpers ----------
  fy(f) { return this.L.floors[f].y; }
  has(item) { return this.items.includes(item); }
  take(item) { this.items = this.items.filter(i => i !== item); this.hooks.hud(this); }
  say(text, time = 2.8) { this.hooks.message(text, time); }
  objective() { return this.L.objective(this); }
  enemy(id) { return this.enemies.find(e => e.id === id); }
  obj(id) { return this.objects.find(o => o.id === id); }
  isHidden() { const p = this.pl; return HIDDEN.includes(p.state) || (p.state === 'unhiding' && p.hk < 0.5); }

  makeEnemy(e) {
    const en = { ...e, sus: 0, bubble: null, animT: rand(0, 1), mode: 'idle', waitT: 0, pi: 0, lookT: 0, noiseX: null, zT: 0 };
    if (e.patrol) {
      en.face = e.face || 1;
      en.pi = 0;
      this.beginPatrolStep(en);
    } else if (e.type === 'sleeper') {
      en.cycleT = e.offset || 0;
    } else if (e.type === 'parrot') {
      en.face = e.face || 1; en.turnT = e.turn; en.covered = false;
    } else if (e.type === 'beam') {
      en.bx = e.x1; en.dir = 1; en.pauseT = 0;
    }
    return en;
  }

  // ---------- objects ----------
  objBox(o) {
    const fy = this.fy(o.floor) + (o.dy || 0);
    if (o.hit) return { x: o.x - o.hit.w / 2, y: fy + (o.hit.dy || 0) - o.hit.h, w: o.hit.w, h: o.hit.h };
    const s = spriteSize(o.sprite, o.scale || 1);
    const pad = 18;
    return { x: o.x - s.w / 2 - pad, y: fy - s.h - pad, w: s.w + pad * 2, h: s.h + pad * 2 };
  }
  isActive(o) {
    if (o.done) return false;
    if (o.activeIf && !o.activeIf(this)) return false;
    if (o.type === 'deco') return false;
    return true;
  }
  isVisible(o) {
    if (o.visibleIf && !o.visibleIf(this)) return false;
    if (o.done && o.type === 'pickup') return false;
    return true;
  }
  hideStyle(o) {
    if (o.hideStyle) return o.hideStyle;
    if (o.sprite === 'barrel') return 'barrel';
    if (o.sprite) return 'sprite';
    if (o.rect) return 'under';
    return 'cover';
  }

  pointerMove(x, y) {
    let best = null, bestA = Infinity;
    if (!this.over) for (const o of this.objects) {
      if (!this.isActive(o)) continue;
      const b = this.objBox(o);
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h && b.w * b.h < bestA) { best = o; bestA = b.w * b.h; }
    }
    this.hover = best;
    return best ? (best.label || null) : null;
  }

  // ---------- route planning (used by the playtest bot) ----------
  goTo(target) {
    const p = this.pl;
    if (p.state === 'hide') this.unhide();
    const route = this.plan(p.floor, p.x, target.floor, target.x);
    if (!route) return;
    p.route = route;
    p.pending = target.obj ? target : null;
    if (p.state !== 'unhiding') p.state = 'walk';
  }
  plan(ff, fx, tf, tx) {
    let best = null;
    const walk = (floor, x, cost, path, visited) => {
      if (floor === tf) {
        const c = cost + Math.abs(x - tx);
        if (!best || c < best.c) best = { c, path: [...path, { t: 'walk', x: tx }] };
        return;
      }
      for (const l of this.ladders) {
        if (l.enabled && !l.enabled(this)) continue;
        const other = l.top === floor ? l.bottom : l.bottom === floor ? l.top : null;
        if (!other || visited.has(other)) continue;
        const c = cost + Math.abs(x - l.x) + Math.abs(this.fy(floor) - this.fy(other));
        walk(other, l.x, c, [...path, { t: 'walk', x: l.x }, { t: 'climb', ladder: l, to: other }], new Set([...visited, other]));
      }
    };
    walk(ff, fx, 0, [], new Set([ff]));
    return best && best.path;
  }

  // ---------- keyboard (WASD) ----------
  key(k, down) {
    const was = this.keys[k];
    this.keys[k] = down;
    if (!down || was || this.over) return;
    if (k === 'act') this.actKey();
    if (k === 'up' || k === 'down') this.tryClimb(k === 'up' ? -1 : 1);
  }

  nearLadder(dir) {
    const p = this.pl;
    for (const l of this.ladders) {
      if (l.enabled && !l.enabled(this)) continue;
      if (Math.abs(l.x - p.x) > 60) continue;
      if (dir < 0 && l.bottom === p.floor) return { l, to: l.top };
      if (dir > 0 && l.top === p.floor) return { l, to: l.bottom };
    }
    return null;
  }

  startClimb(l, to) {
    const p = this.pl;
    p.state = 'climb'; p.climbTo = to; p.climbL = l; p.x = l.x;
    if (l.style === 'lift') {
      sfx.lift();
      if (l.noise) this.makeNoise(l.bottom, l.x, l.noise, 3);
    }
  }

  tryClimb(dir) {
    const p = this.pl;
    if (!['idle', 'walk'].includes(p.state)) return false;
    const n = this.nearLadder(dir);
    if (!n) return false;
    p.kb = false; p.pending = null;
    p.route = [{ t: 'climb', ladder: n.l, to: n.to }];
    this.startClimb(n.l, n.to);
    return true;
  }

  nearestObj() {
    const p = this.pl;
    if (!['idle', 'walk'].includes(p.state)) return null;
    let best = null, bd = Infinity;
    for (const o of this.objects) {
      if (!this.isActive(o) || o.floor !== p.floor) continue;
      const b = this.objBox(o);
      const reach = Math.max(80, b.w / 2 + 30);
      const d = Math.min(Math.abs((o.standX ?? o.x) - p.x), Math.abs(o.x - p.x));
      if (d < reach && d < bd) { bd = d; best = o; }
    }
    return best;
  }

  actKey() {
    const p = this.pl;
    if (p.state === 'hide' || p.state === 'hiding') { this.unhide(); return; }
    if (!['idle', 'walk'].includes(p.state)) return;
    const o = this.nearestObj();
    if (!o) return;
    p.route = []; p.pending = null; p.kb = false; p.state = 'idle';
    this.interact(o);
  }

  // ---------- hiding ----------
  enterHide(o) {
    const p = this.pl;
    p.hideObj = o; p.state = 'hiding'; p.hk = 0; p.fromX = p.x; p.x = o.x; p.peekT = 2.5;
    p.hideDur = this.hideStyle(o) === 'barrel' ? 0.55 : 0.42;
    if (this.hideStyle(o) === 'barrel') sfx.hop(); else sfx.hide();
  }
  unhide() {
    const p = this.pl;
    if (!p.hideObj) { p.state = 'idle'; return; }
    const o = p.hideObj, st = this.hideStyle(o);
    const dir = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0) || p.face || 1;
    p.face = dir;
    p.exitX = clamp(o.x + dir * (st === 'barrel' ? 85 : 30), this.L.floors[o.floor].x1, this.L.floors[o.floor].x2);
    p.state = 'unhiding'; p.hk = 0; p.fromX = p.exitX;
    p.hideDur = st === 'barrel' ? 0.42 : 0.32;
    if (st === 'barrel') sfx.hop(); else sfx.unhide();
  }

  // ---------- player ----------
  updatePlayer(dt) {
    const p = this.pl;
    p.animT += dt;
    p.squash *= Math.pow(0.001, dt);
    if (p.state === 'hiding') {
      p.hk += dt / p.hideDur;
      if (p.hk >= 1) {
        p.hk = 1; p.state = 'hide';
        const o = p.hideObj;
        if (this.hideStyle(o) === 'barrel') { o.sq = 0.35; sfx.hide(); }
        this.puff(o.x, this.fy(o.floor), 5);
      }
      return;
    }
    if (p.state === 'hide') {
      p.peekT -= dt;
      if (p.peekT < -1.4) p.peekT = rand(2.5, 4.5);
      if (p.route.length) this.unhide();
      return;
    }
    if (p.state === 'unhiding') {
      p.hk += dt / p.hideDur;
      if (p.hk >= 1) {
        const o = p.hideObj;
        p.state = 'idle'; p.x = p.exitX; p.hideObj = null; p.squash = 0.25;
        this.puff(p.x, p.y, 4);
        if (o && this.hideStyle(o) === 'barrel') o.sq = 0.25;
        if (p.route.length) p.state = 'walk';
      }
      return;
    }
    const dir = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    if (!this.over && ['idle', 'walk'].includes(p.state)) {
      if (dir) {
        if (p.state === 'idle') this.puff(p.x - dir * 20, p.y, 2);
        p.route = []; p.pending = null; p.state = 'walk'; p.kb = true;
        const f = this.L.floors[p.floor];
        p.face = dir;
        p.x = clamp(p.x + dir * PIP_SPEED * dt, f.x1, f.x2);
        p.stepT -= dt;
        if (p.stepT <= 0) { p.stepT = 0.26; sfx.step(); }
        return;
      }
      if (p.kb && p.state === 'walk') { p.kb = false; p.state = 'idle'; p.squash = 0.12; return; }
      if (p.state === 'idle' && (this.keys.up || this.keys.down) && this.tryClimb(this.keys.up ? -1 : 1)) return;
    }
    if (p.state === 'walk') {
      const st = p.route[0];
      if (!st) { this.arrive(); return; }
      if (st.t === 'walk') {
        const dx = st.x - p.x;
        if (Math.abs(dx) < 3) { p.x = st.x; p.route.shift(); if (!p.route.length) this.arrive(); return; }
        p.face = Math.sign(dx);
        p.x += Math.sign(dx) * Math.min(Math.abs(dx), PIP_SPEED * dt);
        p.stepT -= dt;
        if (p.stepT <= 0) { p.stepT = 0.26; sfx.step(); }
      } else if (st.t === 'climb') {
        this.startClimb(st.ladder, st.to);
      }
    } else if (p.state === 'climb') {
      const ty = this.fy(p.climbTo);
      const dy = ty - p.y;
      const lift = p.climbL.style === 'lift';
      p.stepT -= dt;
      if (p.stepT <= 0) { p.stepT = lift ? 0.35 : 0.2; lift ? sfx.creak() : sfx.climb(); }
      if (Math.abs(dy) < 3) {
        p.y = ty; p.floor = p.climbTo; p.route.shift(); p.squash = 0.3;
        if (lift) p.climbL.restY = ty;
        this.puff(p.x, p.y, 3);
        if (p.route.length) p.state = 'walk'; else this.arrive();
      } else {
        p.y += Math.sign(dy) * Math.min(Math.abs(dy), (lift ? LIFT_SPEED : CLIMB_SPEED) * dt);
      }
    } else if (p.state === 'act') {
      p.act.t -= dt;
      if (p.act.t <= 0) { const a = p.act; p.act = null; p.state = 'idle'; a.done(); }
    }
  }

  arrive() {
    const p = this.pl;
    p.state = 'idle'; p.squash = 0.18;
    const tgt = p.pending; p.pending = null;
    if (tgt && tgt.obj) this.interact(tgt.obj);
  }

  startAct(time, done, pose = 'sneak') {
    const p = this.pl;
    p.state = 'act'; p.act = { t: time, max: time, done, pose };
  }

  interact(o) {
    const p = this.pl;
    if (!this.isActive(o)) return;
    if (o.faceObj !== false) p.face = o.x >= p.x ? 1 : -1;
    const need = o.requires;
    if (need && !this.has(need)) { this.say(o.needMsg || 'I need something for this...'); return; }
    if (o.requiresFlag && !this.flags[o.requiresFlag]) { this.say(o.needMsg || 'Not yet...'); return; }
    if (o.follow) {
      const e = this.enemy(o.follow);
      if ((p.x - e.x) * e.face > -15 || e.mode === 'alert') { this.say(o.frontMsg || "He'd see me! I have to sneak up from behind."); return; }
    }

    switch (o.type) {
      case 'hide':
        this.enterHide(o);
        break;
      case 'pickup':
        this.startAct(o.act || 0.45, () => {
          o.done = true;
          const fy = this.fy(o.floor) + (o.dy || 0);
          this.collect(o, o.x, fy - 30);
        }, 'sneak');
        break;
      case 'search':
        sfx.search();
        this.startAct(o.act || 1.0, () => {
          o.done = true;
          const b = this.objBox(o);
          if (o.gives) this.collect(o, o.x, b.y + b.h / 2);
          else this.say(o.emptyMsg || 'Nothing here.');
        }, 'sneak');
        break;
      case 'use':
        this.startAct(o.act || 1.0, () => {
          if (o.consume && need) this.take(need);
          o.done = !o.repeat;
          if (o.lamp) { this.lamps[o.lamp].lit = false; sfx.snuff(); this.puff(this.lamps[o.lamp].x, this.lamps[o.lamp].y, 6, '#50505a'); }
          o.onDone && o.onDone(this, o);
          if (o.msg) this.say(o.msg);
        }, o.pose || 'sneak');
        break;
      case 'noise':
        this.startAct(o.act || 0.5, () => {
          o.cool = o.cooldown || 6;
          o.sound && sfx[o.sound]();
          this.makeNoise(o.noiseFloor || o.floor, o.noiseX ?? o.x, o.radius || 99999, o.investigate || 3.2);
          const b = this.objBox(o);
          this.popText(o.popText || '!', o.noiseX ?? o.x, o.noiseFloor ? this.fy(o.noiseFloor) - 120 : b.y);
          if (o.noiseFloor) this.burst(o.noiseX ?? o.x, this.fy(o.noiseFloor) - 10, '#cfe8c0', 12);
          if (o.msg) this.say(o.msg);
        });
        break;
      case 'exit':
        this.win(o);
        break;
    }
  }

  collect(o, x, y) {
    const item = o.gives;
    if (o.kitten) {
      this.kitten = true;
      sfx.meow();
      for (let i = 0; i < 8; i++) this.particles.push({ k: 'heart', x: x + rand(-40, 40), y: y + rand(-30, 10), vx: rand(-30, 30), vy: rand(-120, -60), life: 1.4, max: 1.4, r: rand(12, 20) });
      this.hooks.fly('kitten_sit', x, y, 'kitten');
    } else if (o.treasure) {
      this.found.push(item);
      sfx.treasure();
      this.burst(x, y, '#ffd84a', 26);
      this.hooks.fly(item, x, y, 'treasure');
    } else if (item) {
      sfx.pick();
      this.items.push(item);
      this.burst(x, y, '#bfe8ff', 18);
      this.hooks.fly(item, x, y, 'item');
    }
    if (o.flag) this.flags[o.flag] = true;
    o.onDone && o.onDone(this, o);
    if (o.msg) this.say(o.msg);
    this.hooks.hud(this);
  }

  makeNoise(floor, x, radius, time) {
    for (const e of this.enemies) {
      if (e.floor !== floor) continue;
      if (e.type === 'sleeper') { e.cycleT = e.sleep; continue; }
      if (!e.patrol || e.mode === 'eat') continue;
      if (Math.abs(e.x - x) > radius) continue;
      e.mode = 'investigate'; e.noiseX = x; e.investT = time;
      e.bubble = { text: '?', t: 1.4 };
    }
  }

  /** Send the dog to a bowl to eat. */
  feedDog(dogId, x, time = 10) {
    const d = this.enemy(dogId);
    d.mode = 'investigate'; d.noiseX = x; d.investT = 0; d.eatNext = time; d.sus = 0;
    d.bubble = { text: '!', t: 1 };
  }

  win(o) {
    if (this.over) return;
    this.over = true;
    const p = this.pl;
    p.state = 'cheer'; p.animT = 0;
    sfx.win();
    this.burst(p.x, p.y - 100, '#ffe79a', 40);
    this.cam.tz = 1.12; this.cam.tx = p.x; this.cam.ty = p.y - 120;
    setTimeout(() => this.hooks.win(this, o), 1400);
  }

  caught(e) {
    if (this.over) return;
    this.over = true;
    const p = this.pl;
    if (p.state === 'hide' || p.state === 'hiding' || p.state === 'unhiding') { p.state = 'idle'; p.x = p.hideObj ? p.hideObj.x : p.x; p.hideObj = null; }
    e.mode = 'alert'; e.animT = 0;
    if (e.face !== undefined && e.type !== 'beam') e.face = p.x >= e.x ? 1 : -1;
    e.bubble = { text: '!', t: 99 };
    if (e.type === 'parrot') { sfx.squawk(); this.say('SQUAWK! INTRUDER! INTRUDER!', 2); }
    else if (e.type === 'dog') { sfx.bark(); this.say('WOOF! WOOF!', 2); }
    else sfx.alert();
    sfx.caught();
    p.state = 'caught'; p.animT = 0;
    this.shake = 18; this.freeze = 0.22;
    this.cam.tz = 1.35; this.cam.tx = (p.x + (e.bx ?? e.x)) / 2; this.cam.ty = p.y - 110;
    setTimeout(() => this.hooks.caught(this, e), 1600);
  }

  // ---------- enemies ----------
  beginPatrolStep(e) {
    const s = e.patrol[e.pi];
    if (Math.abs(s.x - e.x) < 3) { e.mode = 'wait'; e.waitT = s.wait || 1; e.lookT = 0; if (s.face) e.face = s.face; }
    else e.mode = 'walk';
  }

  inLight(x, y) {
    for (const l of Object.values(this.lamps)) {
      if (!l.lit) continue;
      const dx = x - (l.lx ?? l.x), dy = (y - 70) - (l.ly ?? l.y), r = l.r * 0.9;
      if (dx * dx + dy * dy < r * r) return true;
    }
    for (const e of this.enemies) if (e.lantern && Math.abs(e.x - x) < 170 && e.floor === this.pl.floor) return true;
    return false;
  }

  canSee(e) {
    const p = this.pl;
    if (p.state === 'caught' || this.over) return 0;
    // dogs smell you, even hidden (but not while they're eating)
    if (e.type === 'dog' && (e.mode === 'eat' || e.eatNext)) return 0; // busy with dinner
    if (e.type === 'dog' && e.smell && p.floor === e.floor && p.state !== 'climb') {
      const d = Math.abs(p.x - e.x);
      if (d < e.smell) return 0.6 + 0.4 * (1 - d / e.smell);
    }
    if (this.isHidden()) return 0;
    if (p.state === 'climb') { if (Math.abs(p.y - this.fy(e.floor)) > 70) return 0; }
    else if (p.floor !== e.floor) return 0;
    const dx = p.x - e.x;
    if (e.type === 'sleeper') {
      if (e.phase !== 'awake') return 0;
      return Math.abs(dx) < e.range ? 1 - Math.abs(dx) / e.range : 0;
    }
    if (e.type === 'beam') return Math.abs(p.x - e.bx) < e.width / 2 ? 1 : 0;
    if (e.type === 'parrot' && e.covered) return 0;
    let r = this.range(e);
    if (r <= 0) return 0;
    if (this.L.dark && !this.inLight(p.x, p.y)) r *= 0.42;
    if (dx * e.face < -30) return 0;
    if (Math.abs(dx) > r) return 0;
    return 1 - Math.abs(dx) / r;
  }

  range(e) {
    if (e.type === 'parrot') return e.covered ? 0 : e.range;
    if (e.mode === 'eat' || e.mode === 'alert' || e.mode === 'relight') return e.mode === 'relight' ? e.range * 0.5 : 0;
    if (e.mode === 'wait' && e.patrol) { const s = e.patrol[e.pi]; if (s.range !== undefined) return s.range; }
    return e.range;
  }

  pose(e) {
    if (e.mode === 'alert') return e.type === 'dog' ? 'idle' : 'alert';
    if (e.mode === 'eat') return 'eat';
    if (e.mode === 'walk' || e.mode === 'investigate') {
      const f = Math.floor(e.animT * (e.type === 'dog' ? 9 : 7)) % 4;
      return ['walk1', 'idle', 'walk2', 'idle'][f];
    }
    if (e.mode === 'search' && e.type === 'dog') return 'sniff';
    if (e.mode === 'wait' && e.patrol) { const s = e.patrol[e.pi]; if (s.pose) return s.pose; }
    return 'idle';
  }

  updateEnemy(e, dt) {
    e.animT += dt;
    if (e.bubble) { e.bubble.t -= dt; if (e.bubble.t <= 0) e.bubble = null; }
    if (this.over && e.mode === 'alert') return;

    if (e.patrol) {
      const speed = e.mode === 'investigate' ? e.speed * 1.35 : e.speed;
      if (e.mode === 'walk' || e.mode === 'investigate') {
        const tx = e.mode === 'investigate' ? e.noiseX : e.patrol[e.pi].x;
        const dx = tx - e.x;
        // lantern-carriers relight any snuffed lamp they pass
        if (e.relights && e.mode === 'walk') {
          for (const l of Object.values(this.lamps)) {
            if (!l.lit && l.floor === e.floor && Math.abs(l.x - e.x) < 25) {
              e.mode = 'relight'; e.waitT = 1.8; e.relightLamp = l; e.bubble = { text: '?', t: 1.8 };
              return;
            }
          }
        }
        if (Math.abs(dx) < 3) {
          e.x = tx;
          if (e.mode === 'investigate') {
            if (e.eatNext) { e.mode = 'eat'; e.waitT = e.eatNext; e.eatNext = 0; }
            else { e.mode = 'search'; e.waitT = e.investT; e.lookT = 0; }
          } else { e.mode = 'wait'; const s = e.patrol[e.pi]; e.waitT = s.wait || 1; e.lookT = 0; if (s.face) e.face = s.face; }
        } else {
          e.face = Math.sign(dx);
          e.x += Math.sign(dx) * Math.min(Math.abs(dx), speed * dt);
        }
      } else {
        e.waitT -= dt; e.lookT += dt;
        const s = e.patrol[e.pi];
        if (e.mode === 'search' && e.lookT > 1.1) { e.lookT = 0; e.face *= -1; }
        if (e.mode === 'wait' && s.look && e.lookT > (s.wait || 1) * 0.5 && !e.looked) { e.looked = true; e.face *= -1; }
        if (e.mode === 'wait' && (s.pose === 'sleep' || s.doze)) { e.zT -= dt; if (e.zT <= 0) { e.zT = 0.7; this.zzz(e.x + 30 * e.face, this.fy(e.floor) - 200); } }
        if (e.mode === 'eat') { e.zT -= dt; if (e.zT <= 0) { e.zT = 0.5; this.popText('nom', e.x + e.face * 40, this.fy(e.floor) - 110, 28); } }
        if (e.waitT <= 0) {
          if (e.mode === 'relight') { e.relightLamp.lit = true; sfx.relight(); e.bubble = { text: 'hm', t: 1 }; this.hooks.message && this.say('Uh oh... he relit the lantern.', 2); }
          e.looked = false;
          if (e.mode === 'wait') e.pi = (e.pi + 1) % e.patrol.length;
          if (e.mode === 'wait' && s.pose === 'sleep') e.bubble = { text: '...', t: 0.8 };
          e.mode = 'walk';
        }
      }
    } else if (e.type === 'sleeper') {
      const total = e.sleep + e.stir + e.awake;
      e.cycleT = (e.cycleT + dt) % total;
      const ph = e.cycleT < e.sleep ? 'sleep' : e.cycleT < e.sleep + e.stir ? 'stir' : 'awake';
      if (ph !== e.phase) {
        if (ph === 'awake') e.bubble = { text: '?', t: e.awake };
        if (ph === 'stir') e.bubble = { text: '~', t: e.stir };
        e.phase = ph;
      }
      if (ph === 'sleep') { e.zT -= dt; if (e.zT <= 0) { e.zT = 0.8; this.zzz(e.x + 40, this.fy(e.floor) + (e.dy || 0) - 140); } }
    } else if (e.type === 'parrot') {
      if (!e.covered) { e.turnT -= dt; if (e.turnT <= 0) { e.turnT = e.turn; e.face *= -1; } }
    } else if (e.type === 'beam') {
      if (e.pauseT > 0) e.pauseT -= dt;
      else {
        e.bx += e.dir * e.speed * dt;
        if (e.bx > e.x2) { e.bx = e.x2; e.dir = -1; e.pauseT = e.pause; }
        if (e.bx < e.x1) { e.bx = e.x1; e.dir = 1; e.pauseT = e.pause; }
      }
    }

    const v = this.canSee(e);
    if (v > 0) {
      const before = e.sus;
      e.sus += dt * (e.type === 'beam' ? 3.2 : e.type === 'dog' && this.isHidden() ? 0.42 : 2.3 + 7 * v * v);
      if (before === 0) { e.type === 'dog' ? sfx.sniff() : sfx.suspicious(); e.bubble = { text: e.type === 'dog' ? '*sniff*' : '?', t: 0.9 }; }
      if (e.sus > 0.25) this.seen = true;
      if (e.sus >= 1) this.caught(e);
    } else {
      e.sus = Math.max(0, e.sus - dt * (e.type === 'dog' ? 0.5 : 1.4));
    }
  }

  // ---------- fx ----------
  burst(x, y, color, n = 14) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(80, 320);
      this.particles.push({ k: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, life: rand(0.5, 1), max: 1, color, r: rand(3, 7) });
    }
  }
  puff(x, y, n = 4, color = '#d8c7a8') {
    for (let i = 0; i < n; i++) this.particles.push({ k: 'puff', x: x + rand(-20, 20), y: y - rand(0, 10), vx: rand(-60, 60), vy: rand(-50, -10), life: rand(0.35, 0.6), max: 0.6, r: rand(8, 16), color });
  }
  zzz(x, y) { this.particles.push({ k: 'z', x, y, vx: rand(10, 30), vy: -40, life: 2, max: 2, r: rand(20, 28) }); }
  popText(text, x, y, size = 44) { this.particles.push({ k: 'text', text, x, y, vx: 0, vy: -60, life: 1.2, max: 1.2, r: size }); }

  update(dt) {
    this.t += dt;
    const c = this.cam, kk = Math.min(1, dt * 5);
    c.z = lerp(c.z, c.tz, kk); c.x = lerp(c.x, c.tx, kk); c.y = lerp(c.y, c.ty, kk);
    if (this.freeze > 0) { this.freeze -= dt; return; }
    if (!this.over || this.pl.state === 'cheer') this.updatePlayer(dt);
    for (const e of this.enemies) this.updateEnemy(e, dt);
    for (const o of this.objects) {
      if (o.follow) { const e = this.enemy(o.follow); o.x = e.x - e.face * 45; o.floor = e.floor; }
      if (o.cool) o.cool = Math.max(0, o.cool - dt);
      if (o.sq) o.sq *= Math.pow(0.004, dt);
      if (!this.isActive(o) || o.type === 'hide' && !this.hintT || o.kitten) continue;
      o.spark -= dt;
      if (o.spark <= 0) {
        o.spark = rand(1.6, 3.2);
        const b = this.objBox(o);
        this.particles.push({ k: 'twinkle', x: b.x + rand(0.2, 0.8) * b.w, y: b.y + rand(0.2, 0.8) * b.h, vx: 0, vy: 0, life: 0.9, max: 0.9, r: rand(10, 18) });
      }
    }
    for (const q of this.particles) {
      q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.k === 'spark') q.vy += 500 * dt;
      if (q.k === 'puff') { q.vx *= 0.92; q.r += 18 * dt; }
    }
    this.particles = this.particles.filter(q => q.life > 0);
    this.near = this.over ? null : this.nearestObj();
    this.shake *= Math.pow(0.002, dt);
    if (this.hintT > 0) this.hintT -= dt;
    this.L.update && this.L.update(this, dt);
  }

  // ---------- drawing ----------
  draw(ctx) {
    const L = this.L, c = this.cam;
    ctx.save();
    if (c.z > 1.001) {
      const hw = W / 2 / c.z, hh = H / 2 / c.z;
      const cx = clamp(c.x, hw, W - hw), cy = clamp(c.y, hh, H - hh);
      ctx.translate(W / 2, H / 2); ctx.scale(c.z, c.z); ctx.translate(-cx, -cy);
    }
    if (this.shake > 0.5) ctx.translate(rand(-1, 1) * this.shake, rand(-1, 1) * this.shake);
    ctx.drawImage(IMG[L.bg], 0, 0, W, H);
    L.drawBack && L.drawBack(ctx, this);

    for (const e of this.enemies) this.drawVision(ctx, e);
    for (const l of this.ladders) this.drawLadder(ctx, l);

    const p = this.pl;
    const hidingNow = ['hiding', 'hide', 'unhiding'].includes(p.state) && p.hideObj;
    for (const o of this.objects) if (o.z === 'back') this.drawObj(ctx, o);
    if (hidingNow) this.drawHiddenPip(ctx);
    for (const o of this.objects) if (o.z !== 'back' && o.z !== 'front') this.drawObj(ctx, o);
    const actors = this.enemies.filter(e => e.type !== 'beam').map(e => ({ y: this.fy(e.floor) + (e.dy || 0) + (e.type === 'sleeper' ? -1 : 0), d: () => this.drawEnemy(ctx, e) }));
    if (!hidingNow) actors.push({ y: p.y + 0.5, d: () => this.drawPip(ctx) });
    actors.sort((a, b) => a.y - b.y).forEach(a => a.d());
    for (const o of this.objects) if (o.z === 'front') this.drawObj(ctx, o);
    for (const poly of L.occluders || []) this.redrawBg(ctx, poly);
    L.drawFront && L.drawFront(ctx, this);

    if (L.dark) this.drawDarkness(ctx);
    this.drawLights(ctx);
    for (const e of this.enemies) this.drawBubble(ctx, e);
    this.drawParticles(ctx);
    this.drawHighlights(ctx);
    this.drawPrompts(ctx);
    ctx.restore();
    // vignette (screen space)
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.05);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(8,4,20,0.55)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  redrawBg(ctx, poly) {
    ctx.save();
    ctx.beginPath(); ctx.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
    ctx.closePath(); ctx.clip();
    ctx.drawImage(IMG[this.L.bg], 0, 0, W, H);
    ctx.restore();
  }

  drawDarkness(ctx) {
    if (!this.darkCv) { this.darkCv = document.createElement('canvas'); this.darkCv.width = W / 4; this.darkCv.height = H / 4; }
    const d = this.darkCv.getContext('2d'), s = 0.25;
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, W * s, H * s);
    d.fillStyle = `rgba(3,4,18,${this.L.dark})`; d.fillRect(0, 0, W * s, H * s);
    d.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r, a = 1) => {
      const g = d.createRadialGradient(x * s, y * s, 0, x * s, y * s, r * s);
      g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(0.55, `rgba(0,0,0,${a * 0.75})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = g; d.fillRect((x - r) * s, (y - r) * s, r * 2 * s, r * 2 * s);
    };
    for (const l of Object.values(this.lamps)) if (l.lit) { hole(l.lx ?? l.x, l.ly ?? l.y, l.r * 1.25 * (0.95 + 0.05 * Math.sin(this.t * 9 + l.x))); hole(l.x, l.y, 90); }
    for (const e of this.enemies) if (e.lantern) hole(e.x + e.face * 30, this.fy(e.floor) - 90, 210, 0.9);
    hole(this.pl.x, this.pl.y - 70, 120, 0.35);
    ctx.drawImage(this.darkCv, 0, 0, W, H);
  }

  drawLadder(ctx, l) {
    if (l.enabled && !l.enabled(this)) { if (l.style === 'lift') this.drawLift(ctx, l, true); return; }
    if (l.style === 'lift') { this.drawLift(ctx, l, false); return; }
    const top = this.fy(l.top) - (l.topExtra ?? 12), bot = this.fy(l.bottom) + 4;
    if (l.style === 'rope') {
      const sway = Math.sin(this.t * 1.5 + l.x) * 3;
      ctx.lineCap = 'round';
      for (const side of [-22, 22]) {
        ctx.strokeStyle = '#3a2410'; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(l.x + side, top); ctx.quadraticCurveTo(l.x + side + sway, (top + bot) / 2, l.x + side + sway * 1.5, bot); ctx.stroke();
        ctx.strokeStyle = '#b78b52'; ctx.lineWidth = 3.5; ctx.stroke();
      }
      for (let y = top + 22; y < bot - 8; y += 30) {
        const k = (y - top) / (bot - top), sx = sway * k * 1.5;
        ctx.strokeStyle = '#3a2410'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(l.x - 24 + sx, y); ctx.lineTo(l.x + 24 + sx, y); ctx.stroke();
        ctx.strokeStyle = '#9a6b3a'; ctx.lineWidth = 5; ctx.stroke();
      }
      if (l.hook) drawSprite(ctx, 'hook', l.x + 4, top + 26, 0.3, false, 1, 1, 1, Math.PI);
      return;
    }
    const im = IMG.ladder, sc = l.scale || 0.62;
    const w = im.width * sc, h = im.height * sc;
    ctx.save();
    ctx.beginPath(); ctx.rect(l.x - w, top, w * 2, bot - top); ctx.clip();
    for (let y = bot - h; y > top - h; y -= h * 0.93) ctx.drawImage(im, l.x - w / 2, y, w, h);
    ctx.restore();
  }

  drawLift(ctx, l, locked) {
    const p = this.pl;
    const riding = p.state === 'climb' && p.climbL === l;
    const py = riding ? p.y : l.restY;
    ctx.lineCap = 'round';
    for (const side of [-62, 62]) {
      ctx.strokeStyle = '#2a1a0a'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(l.x + side, l.ropeTop ?? 40); ctx.lineTo(l.x + side, py - 4); ctx.stroke();
      ctx.strokeStyle = '#a07a48'; ctx.lineWidth = 3; ctx.stroke();
    }
    drawSprite(ctx, 'pallet', l.x, py + 22, 0.5);
    if (locked && l.lockLabel) {
      ctx.fillStyle = 'rgba(40,22,8,0.6)'; ctx.beginPath(); ctx.arc(l.x, py - 30, 3, 0, 7); ctx.fill();
    }
  }

  drawObj(ctx, o) {
    if (!this.isVisible(o)) return;
    const fy = this.fy(o.floor) + (o.dy || 0);
    let y = fy;
    if (o.bob && !o.done) y += Math.sin(this.t * 2.4 + o.x) * 6;
    if (o.draw) { o.draw(ctx, this, o); return; }
    if (o.lamp) {
      const lamp = this.lamps[o.lamp];
      if (!lamp.lit) {
        ctx.fillStyle = 'rgba(8,8,16,0.82)';
        ctx.beginPath(); ctx.ellipse(lamp.x, lamp.y + 4, 20, 30, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (o.sprite) {
      const hl = (this.hover === o || this.near === o || this.hintT > 0) && this.isActive(o);
      if (o.glow && !o.done) {
        const g = ctx.createRadialGradient(o.x, y - 30, 4, o.x, y - 30, 90);
        g.addColorStop(0, 'rgba(255,230,140,0.45)'); g.addColorStop(1, 'rgba(255,230,140,0)');
        ctx.fillStyle = g; ctx.fillRect(o.x - 100, y - 130, 200, 200);
      }
      if (hl) { ctx.save(); ctx.shadowColor = 'rgba(255,225,120,0.95)'; ctx.shadowBlur = 26; }
      const sq = o.sq || 0;
      const peek = o.kitten ? Math.max(0, Math.sin(this.t * 1.3 + o.x)) * 6 : 0;
      drawSprite(ctx, o.sprite, o.x, y + peek, o.scale || 1, !!o.flip, 1, 1 + sq * 0.25, 1 - sq * 0.35);
      if (hl) ctx.restore();
    }
    if (o.type === 'exit') this.drawExit(ctx, o);
  }

  drawExit(ctx, o) {
    const ready = (!o.requires || this.has(o.requires)) && (!o.requiresFlag || this.flags[o.requiresFlag]);
    const b = this.objBox(o);
    const cx = o.x, cy = b.y + b.h * 0.45 + Math.sin(this.t * 3) * 8;
    ctx.save();
    ctx.globalAlpha = ready ? 1 : 0.35;
    const g = ctx.createRadialGradient(cx, cy, 5, cx, cy, 80);
    g.addColorStop(0, ready ? 'rgba(255,230,120,0.55)' : 'rgba(200,200,200,0.3)'); g.addColorStop(1, 'rgba(255,230,120,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 80, 0, Math.PI * 2); ctx.fill();
    ctx.translate(cx, cy);
    ctx.rotate({ down: Math.PI / 2, up: -Math.PI / 2, left: Math.PI, right: 0 }[o.arrow || 'right']);
    ctx.beginPath();
    ctx.moveTo(-26, -14); ctx.lineTo(4, -14); ctx.lineTo(4, -30); ctx.lineTo(34, 0); ctx.lineTo(4, 30); ctx.lineTo(4, 14); ctx.lineTo(-26, 14); ctx.closePath();
    ctx.fillStyle = ready ? '#ffd35a' : '#bbb'; ctx.strokeStyle = '#4a2a0c'; ctx.lineWidth = 5; ctx.lineJoin = 'round';
    ctx.stroke(); ctx.fill();
    ctx.restore();
  }

  pipFrame() {
    const p = this.pl;
    if (p.state === 'climb') return p.climbL && p.climbL.style === 'lift' ? 'idle' : 'climb';
    if (p.state === 'cheer') return 'cheer';
    if (p.state === 'caught') return 'idle';
    if (p.state === 'act') return p.act.pose === 'cheer' ? 'cheer' : (Math.floor(p.animT * 6) % 2 ? 'sneak' : 'idle');
    if (p.state === 'walk') {
      const near = this.enemies.some(e => e.patrol && e.floor === p.floor && Math.abs(e.x - p.x) < 520);
      const f = Math.floor(p.animT * 8) % 4;
      return near ? (['sneak', 'walk1', 'sneak', 'walk2'][f]) : (['walk1', 'idle', 'walk2', 'idle'][f]);
    }
    return 'idle';
  }

  drawPip(ctx) {
    const p = this.pl;
    const fr = this.pipFrame();
    let x = p.x, y = p.y, sx = 1, sy = 1;
    const sc = CHAR.pip.scale;
    if (p.state === 'walk') y -= Math.abs(Math.sin(p.animT * 12)) * 5;
    if (p.state === 'idle') { const b = Math.sin(this.t * 2.2) * 0.012; sy += b; sx -= b; }
    if (p.squash > 0.01) { sy -= p.squash; sx += p.squash * 0.8; }
    if (p.state === 'caught') { x += Math.sin(p.animT * 50) * 4 * Math.max(0, 1 - p.animT); sy += 0.05 * Math.sin(p.animT * 8); }
    if (p.state === 'cheer') y -= Math.abs(Math.sin(p.animT * 7)) * 30;
    let flip = p.face < 0;
    const lift = p.state === 'climb' && p.climbL && p.climbL.style === 'lift';
    if (fr === 'climb') { flip = Math.floor(p.animT * 5) % 2 === 1; x = p.climbL ? p.climbL.x : x; y += 50; }
    if (fr !== 'climb' && !lift) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, 34, 8, 0, 0, Math.PI * 2); ctx.fill();
    }
    drawSprite(ctx, PIP + fr, x, y, sc * (fr === 'climb' ? 0.9 : 1), flip, 1, sx, sy);
    if (p.state === 'act') {
      const k = 1 - p.act.t / p.act.max;
      const bx = p.x, by = p.y - 170;
      ctx.fillStyle = 'rgba(30,18,6,0.75)'; roundRect(ctx, bx - 42, by - 9, 84, 18, 9); ctx.fill();
      ctx.fillStyle = '#ffd35a'; roundRect(ctx, bx - 38, by - 5, 76 * k, 10, 5); ctx.fill();
    }
  }

  /** Pip hopping into a barrel, slipping behind scenery, or crouching under furniture. */
  drawHiddenPip(ctx) {
    const p = this.pl, o = p.hideObj, st = this.hideStyle(o);
    const fy = this.fy(o.floor), sc = CHAR.pip.scale;
    const k = p.state === 'hiding' ? p.hk : p.state === 'hide' ? 1 : 1 - p.hk;
    const startX = p.fromX ?? o.x;
    const peek = p.state === 'hide' ? clamp(Math.min(-p.peekT, 1.4 + p.peekT) * 3, 0, 1) : 0;
    const flip = p.face < 0;
    if (st === 'barrel') {
      const bh = spriteSize('barrel', o.scale || 0.7).h;
      const rim = fy - bh * 0.9;
      let x, bottom, fr;
      if (k < 0.55) {
        const t = k / 0.55;
        x = lerp(startX, o.x, t); bottom = lerp(fy, rim, t) - Math.sin(Math.PI * t) * 90; fr = 'walk2';
      } else {
        const t = (k - 0.55) / 0.45;
        x = o.x; bottom = lerp(rim, fy + 26, t * t); fr = 'sneak';
      }
      if (peek > 0) { bottom = fy + 26 - peek * 112; fr = 'idle'; }
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W, fy - 6); ctx.clip();
      drawSprite(ctx, PIP + fr, x, bottom, sc, flip);
      ctx.restore();
      return;
    }
    const bx = o.backX ?? o.x, by = o.backY ?? (fy - (st === 'sprite' ? 10 : 0));
    const s = sc * lerp(1, o.backScale ?? (st === 'sprite' ? 0.96 : 0.88), ease(k));
    const x = lerp(startX, bx, ease(k)) + peek * 42 * (o.peekDir || 1);
    const y = lerp(fy, by, ease(k));
    const fr = k < 1 ? (Math.floor(p.animT * 8) % 2 ? 'sneak' : 'walk1') : 'sneak';
    if (st === 'under') {
      ctx.save();
      if (k > 0.6 && o.rect) { const r = o.rect; ctx.beginPath(); ctx.rect(r[0], r[1], r[2] - r[0], r[3] - r[1]); ctx.clip(); }
      ctx.filter = `brightness(${lerp(1, 0.38, ease(k))})`;
      drawSprite(ctx, PIP + fr, x, y, s, flip);
      ctx.restore();
      if (k >= 1 && Math.sin(this.t * 1.7) > -0.9) {
        ctx.fillStyle = '#fff8dc';
        for (const dx of [-7, 7]) { ctx.beginPath(); ctx.ellipse(x + dx + (flip ? -8 : 8), y - 62 * (s / sc), 3.5, 4.5, 0, 0, Math.PI * 2); ctx.fill(); }
      }
      return;
    }
    drawSprite(ctx, PIP + fr, x, y, s, flip);
    if (st === 'cover' && o.poly) this.redrawBg(ctx, o.poly);
    // 'sprite' style: the object itself is drawn right after this, covering Pip
  }

  drawEnemy(ctx, e) {
    const fy = this.fy(e.floor) + (e.dy || 0);
    if (e.type === 'sleeper') {
      const wig = e.phase === 'stir' ? Math.sin(this.t * 30) * 0.03 : e.phase === 'awake' ? 0 : Math.sin(this.t * 1.6 + e.x) * 0.02;
      drawSprite(ctx, 'hammock_sleep', e.x, fy, e.scale || 0.75, !!e.flip, 1, 1, 1, wig);
      if (e.phase === 'awake') {
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2a1606'; ctx.lineWidth = 3;
        for (const dx of [-12, 12]) { ctx.beginPath(); ctx.ellipse(e.x + dx, fy - 108, 10, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#2a1606'; ctx.beginPath(); ctx.arc(e.x + dx + Math.sin(this.t * 2) * 4, fy - 106, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; }
      }
      return;
    }
    if (e.type === 'parrot') {
      drawSprite(ctx, 'parrot', e.x, fy, e.scale || 0.72, e.face < 0);
      if (e.covered) drawSprite(ctx, 'cloth', e.x, fy - 70, 0.52, false, 1, 0.8, 1.9);
      return;
    }
    const pose = this.pose(e);
    const sc = CHAR[e.type].scale;
    let y = fy, sx = 1, sy = 1;
    if (e.mode === 'walk' || e.mode === 'investigate') y -= Math.abs(Math.sin(e.animT * 11)) * 4;
    else { const b = Math.sin(e.animT * 2) * 0.015; sy += b; sx -= b; }
    if (e.mode === 'alert') { const j = Math.max(0, Math.sin(Math.min(1, e.animT * 3) * Math.PI)); y -= j * 26; }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(e.x, fy + 2, e.type === 'dog' ? 44 : 50, 11, 0, 0, Math.PI * 2); ctx.fill();
    drawSprite(ctx, e.type + '_' + pose, e.x, y, sc, e.face < 0, 1, sx, sy);
  }

  drawVision(ctx, e) {
    const fy = this.fy(e.floor);
    const hot = Math.min(1, e.sus);
    const col = (a) => `rgba(255,${Math.round(236 - 170 * hot)},${Math.round(140 - 100 * hot)},${a})`;
    if (e.type === 'beam') {
      const sx = e.src.x, sy = e.src.y, bx = e.bx, hw = e.width / 2;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(sx, sy, bx, fy);
      g.addColorStop(0, col(0.32)); g.addColorStop(1, col(0.16));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(sx - 8, sy); ctx.lineTo(bx - hw, fy); ctx.lineTo(bx + hw, fy); ctx.lineTo(sx + 8, sy); ctx.closePath(); ctx.fill();
      const eg = ctx.createRadialGradient(bx, fy, 5, bx, fy, hw);
      eg.addColorStop(0, col(0.5)); eg.addColorStop(1, col(0));
      ctx.fillStyle = eg; ctx.beginPath(); ctx.ellipse(bx, fy, hw, 26, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    if (e.type === 'sleeper') {
      if (e.phase !== 'awake' && e.phase !== 'stir') return;
      const a = e.phase === 'awake' ? 0.26 : 0.08 + 0.06 * Math.sin(this.t * 20);
      const g = ctx.createRadialGradient(e.x, fy, 10, e.x, fy, e.range);
      g.addColorStop(0, col(a)); g.addColorStop(1, col(0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(e.x, fy - 40, e.range, 110, 0, 0, Math.PI * 2); ctx.fill();
      return;
    }
    if (e.type === 'dog' && e.smell && e.mode !== 'eat' && e.mode !== 'alert') {
      // scent circle
      ctx.save(); ctx.setLineDash([8, 10]); ctx.lineDashOffset = -this.t * 30;
      ctx.strokeStyle = `rgba(190,240,150,${0.35 + 0.4 * hot})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(e.x, fy, e.smell, 20, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    let r = this.range(e);
    if (r <= 0) return;
    const dim = this.L.dark ? 0.6 : 1;
    const eyeY = fy - (e.type === 'parrot' ? 120 : e.type === 'dog' ? 70 : 150);
    const x0 = e.x + e.face * 20;
    const x1 = e.x + e.face * r;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, col(0.55 * dim)); g.addColorStop(0.75, col(0.28 * dim)); g.addColorStop(1, col(0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0, eyeY); ctx.lineTo(x1, fy - (e.type === 'dog' ? 120 : 210)); ctx.lineTo(x1, fy + 14); ctx.lineTo(x0, fy + 14);
    ctx.closePath(); ctx.fill();
    const fg = ctx.createLinearGradient(x0, 0, x1, 0);
    fg.addColorStop(0, col(0.5 * dim)); fg.addColorStop(1, col(0));
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.ellipse((x0 + x1) / 2, fy + 4, Math.abs(x1 - x0) / 2, 16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  drawBubble(ctx, e) {
    if (!e.bubble) return;
    const fy = this.fy(e.floor) + (e.dy || 0);
    let top;
    if (e.type === 'sleeper') top = fy - 190;
    else if (e.type === 'parrot') top = fy - 200;
    else if (e.type === 'beam') top = e.src.y - 60;
    else top = fy - spriteSize(e.type + '_idle', CHAR[e.type].scale).h - 40;
    const x = e.type === 'beam' ? e.src.x : e.x;
    const t = e.bubble.text;
    const big = t === '!';
    const long = t.length > 2;
    ctx.save();
    ctx.translate(x, top + Math.sin(this.t * 6) * 3);
    ctx.font = `900 ${big ? 50 : long ? 26 : 40}px Fredoka, "Trebuchet MS", sans-serif`;
    const rw = long ? ctx.measureText(t).width / 2 + 18 : big ? 34 : 28;
    ctx.fillStyle = big ? '#ff4a3a' : '#fffbe8';
    ctx.strokeStyle = '#2a1606'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(0, 0, rw, big ? 38 : 30, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-8, big ? 34 : 26); ctx.lineTo(0, big ? 52 : 42); ctx.lineTo(8, big ? 34 : 26); ctx.fill();
    ctx.fillStyle = big ? '#fff' : '#3a2410';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t, 0, 3);
    ctx.restore();
    if (e.sus > 0.02 && !this.over) {
      ctx.fillStyle = 'rgba(30,18,6,0.7)'; roundRect(ctx, x - 36, top - 58, 72, 12, 6); ctx.fill();
      ctx.fillStyle = '#ff6a3a'; roundRect(ctx, x - 33, top - 55, 66 * Math.min(1, e.sus), 6, 3); ctx.fill();
    }
  }

  drawLights(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const l0 of this.L.lights || []) {
      const l = l0.id ? this.lamps[l0.id] : l0;
      if (l.id && !l.lit) continue;
      const fl = l.flicker === false ? 1 : 0.9 + 0.1 * Math.sin(this.t * 9 + l.x) * Math.sin(this.t * 5.3 + l.y);
      const r = l.r * fl;
      const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
      const c = l.color || '255,170,70';
      g.addColorStop(0, `rgba(${c},${(l.a ?? 0.35) * fl})`); g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g; ctx.fillRect(l.x - r, l.y - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  keycap(ctx, x, y, letter, text) {
    const bob = Math.sin(this.t * 5) * 4;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.font = '700 30px Fredoka, "Trebuchet MS", sans-serif';
    ctx.textBaseline = 'middle';
    const tw = text ? ctx.measureText(text).width + 22 : 0;
    const w = 54 + tw;
    ctx.fillStyle = 'rgba(40,22,8,0.88)'; roundRect(ctx, -27, -27, w, 54, 14); ctx.fill();
    ctx.fillStyle = '#fff3cf'; roundRect(ctx, -22, -23, 44, 42, 10); ctx.fill();
    ctx.fillStyle = '#e3c68a'; roundRect(ctx, -22, 11, 44, 8, 4); ctx.fill();
    ctx.fillStyle = '#4a2a0c'; ctx.textAlign = 'center'; ctx.fillText(letter, 0, -2);
    if (text) { ctx.fillStyle = '#fff7dc'; ctx.textAlign = 'left'; ctx.fillText(text, 32, 1); }
    ctx.restore();
  }

  drawPrompts(ctx) {
    const p = this.pl;
    if (this.over) return;
    if (p.state === 'hide') { const o = p.hideObj; this.keycap(ctx, o.x - 20, this.objBox(o).y - 36, 'E', 'Leave'); return; }
    if (!['idle', 'walk'].includes(p.state)) return;
    const o = this.near;
    if (o) {
      const b = this.objBox(o);
      if (!o.sprite) {
        ctx.strokeStyle = `rgba(255,220,110,${0.6 + 0.3 * Math.sin(this.t * 6)})`; ctx.lineWidth = 4; ctx.setLineDash([12, 10]);
        roundRect(ctx, b.x, b.y, b.w, b.h, 18); ctx.stroke(); ctx.setLineDash([]);
      }
      const verb = o.verb || { hide: 'Hide', pickup: o.follow ? 'Pickpocket' : o.kitten ? 'Pet' : 'Grab', search: 'Search', use: 'Use', noise: 'Use', exit: 'Go' }[o.type];
      this.keycap(ctx, o.x - 20, Math.max(40, b.y - 36), 'E', verb);
    }
    const up = this.nearLadder(-1), down = this.nearLadder(1);
    const lbl = l => l.style === 'lift' ? 'Ride' : 'Climb';
    if (up) this.keycap(ctx, up.l.x + (o ? 70 : 0), p.y - 200, 'W', lbl(up.l));
    else if (down) this.keycap(ctx, down.l.x + (o ? 70 : 0), p.y - 200, 'S', lbl(down.l));
  }

  drawHighlights(ctx) {
    if (this.hintT <= 0) return;
    const a = Math.min(1, this.hintT) * (0.6 + 0.4 * Math.sin(this.t * 8));
    for (const o of this.objects) {
      if (!this.isActive(o) || o.kitten) continue;
      if (o.sprite && o.type !== 'exit') continue;
      const b = this.objBox(o);
      ctx.strokeStyle = `rgba(255,220,110,${a})`; ctx.lineWidth = 4; ctx.setLineDash([12, 10]);
      roundRect(ctx, b.x, b.y, b.w, b.h, 18); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  drawParticles(ctx) {
    for (const q of this.particles) {
      const k = q.life / q.max;
      if (q.k === 'spark') {
        ctx.fillStyle = q.color; ctx.globalAlpha = k;
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r * k + 1, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (q.k === 'puff') {
        ctx.fillStyle = q.color; ctx.globalAlpha = k * 0.45;
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (q.k === 'twinkle') {
        const s = q.r * Math.sin(k * Math.PI);
        ctx.save(); ctx.translate(q.x, q.y); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,240,180,0.9)';
        ctx.beginPath();
        ctx.moveTo(0, -s); ctx.quadraticCurveTo(0, 0, s, 0); ctx.quadraticCurveTo(0, 0, 0, s); ctx.quadraticCurveTo(0, 0, -s, 0); ctx.quadraticCurveTo(0, 0, 0, -s);
        ctx.fill(); ctx.restore();
      } else if (q.k === 'heart') {
        ctx.save(); ctx.globalAlpha = Math.min(1, k * 1.5); ctx.translate(q.x, q.y); ctx.scale(q.r / 20, q.r / 20);
        ctx.fillStyle = '#ff7aa2'; ctx.strokeStyle = '#5a1a2a'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(0, 8); ctx.bezierCurveTo(-22, -8, -10, -24, 0, -12); ctx.bezierCurveTo(10, -24, 22, -8, 0, 8); ctx.fill(); ctx.stroke();
        ctx.restore();
      } else if (q.k === 'z') {
        ctx.globalAlpha = Math.min(1, k * 1.5);
        ctx.fillStyle = '#e8f0ff'; ctx.strokeStyle = '#2a1606'; ctx.lineWidth = 4;
        ctx.font = `900 ${q.r}px Fredoka, "Trebuchet MS", sans-serif`; ctx.textAlign = 'center';
        ctx.strokeText('z', q.x + Math.sin(q.life * 4) * 8, q.y); ctx.fillText('z', q.x + Math.sin(q.life * 4) * 8, q.y);
        ctx.globalAlpha = 1;
      } else if (q.k === 'text') {
        ctx.globalAlpha = Math.min(1, k * 2);
        ctx.font = `900 ${q.r || 44}px Fredoka, "Trebuchet MS", sans-serif`; ctx.textAlign = 'center';
        ctx.lineWidth = 6; ctx.strokeStyle = '#2a1606'; ctx.fillStyle = '#ffe36a';
        ctx.strokeText(q.text, q.x, q.y); ctx.fillText(q.text, q.x, q.y);
        ctx.globalAlpha = 1;
      }
    }
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
