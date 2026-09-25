// Stealth-level engine: tap-to-move, ladders, hiding, guards with vision, items, noise.
import { IMG, drawSprite, spriteSize } from './assets.js';
import { sfx } from './audio.js';

export const W = 1920, H = 1080;

const CHAR = {
  pip: { scale: 0.46 },
  deckhand: { scale: 0.62 },
  cook: { scale: 0.52 },
  captain: { scale: 0.56 },
};
const PIP_SPEED = 270, CLIMB_SPEED = 230;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);

export class StealthGame {
  constructor(level, hooks) {
    this.L = level;
    this.hooks = hooks;
    this.t = 0;
    this.flags = {};
    this.items = [...(level.startItems || [])];
    this.found = [];            // treasures collected
    this.seen = false;          // for the "ghost" star
    this.over = false;
    this.particles = [];
    this.bubbles = [];
    this.shake = 0;
    this.hintT = 0;
    this.hover = null;
    this.ripples = [];
    this.msgCooldown = 0;
    this.keys = {};
    this.near = null;

    this.objects = level.objects.map(o => ({ ...o, done: false, spark: rand(0.5, 2.5) }));
    this.ladders = level.ladders.map(l => ({ ...l }));
    this.enemies = level.enemies.map(e => this.makeEnemy(e));

    const s = level.start;
    this.pl = {
      floor: s.floor, x: s.x, y: this.fy(s.floor), face: s.face || 1,
      state: 'idle', route: [], pending: null, hideObj: null, act: null,
      animT: 0, stepT: 0, squash: 0, climbFrom: null,
    };
    level.init && level.init(this);
  }

  // ---------- helpers ----------
  fy(f) { return this.L.floors[f].y; }
  has(item) { return this.items.includes(item); }
  give(item, fromX, fromY) {
    if (!this.items.includes(item)) this.items.push(item);
    this.burst(fromX ?? this.pl.x, fromY ?? this.pl.y - 120, '#ffe79a', 16);
    this.hooks.hud(this);
  }
  take(item) { this.items = this.items.filter(i => i !== item); this.hooks.hud(this); }
  say(text, time = 2.8) { this.hooks.message(text, time); }
  objective() { return this.L.objective(this); }

  makeEnemy(e) {
    const en = { ...e, sus: 0, bubble: null, animT: rand(0, 1), mode: 'idle', waitT: 0, pi: 0, lookT: 0, noiseX: null, zT: 0 };
    if (e.type === 'deckhand' || e.type === 'cook' || e.type === 'captain') {
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

  // ---------- input ----------
  objAt(x, y) {
    let best = null, bestA = Infinity;
    for (const o of this.objects) {
      if (!this.isActive(o)) continue;
      const b = this.objBox(o);
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        const a = b.w * b.h;
        if (a < bestA) { best = o; bestA = a; }
      }
    }
    return best;
  }
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
    if (o.done && (o.type === 'pickup')) return false;
    return true;
  }

  pointerMove(x, y) {
    const o = this.over ? null : this.objAt(x, y);
    this.hover = o;
    return o ? (o.label || null) : null;
  }

  tap(x, y) {
    if (this.over) return;
    const p = this.pl;
    if (p.state === 'act') return;
    const o = this.objAt(x, y);
    let target;
    if (o) {
      target = { floor: o.floor, x: clamp(o.standX ?? o.x, this.L.floors[o.floor].x1, this.L.floors[o.floor].x2), obj: o };
    } else {
      target = this.floorAt(x, y);
      if (!target) return;
    }
    this.ripples.push({ x: target.obj ? x : target.x, y: target.obj ? y : this.fy(target.floor), t: 0 });
    sfx.tap();
    if (p.state === 'hide') { this.unhide(); if (target.obj === p.hideObj) return; }
    if (p.state === 'climb') { p.retarget = target; return; }
    this.goTo(target);
  }

  floorAt(x, y) {
    let best = null, bd = Infinity;
    for (const [id, f] of Object.entries(this.L.floors)) {
      if (f.enabled && !f.enabled(this)) continue;
      if (x < f.x1 - 60 || x > f.x2 + 60) continue;
      // prefer the floor the tap is standing "on": slightly above it counts most
      const d = y <= f.y + 60 ? (f.y - y) : (y - f.y) * 3;
      const dd = d < -60 ? 9999 : Math.abs(d);
      if (dd < bd) { bd = dd; best = id; }
    }
    if (!best) return null;
    const f = this.L.floors[best];
    return { floor: best, x: clamp(x, f.x1, f.x2) };
  }

  goTo(target) {
    const p = this.pl;
    const route = this.plan(p.floor, p.x, target.floor, target.x);
    if (!route) { this.say("I can't get there from here..."); return; }
    p.route = route;
    p.pending = target.obj ? target : null;
    p.state = 'walk';
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

  // ---------- player ----------
  unhide() {
    const p = this.pl;
    p.state = 'idle'; p.hideObj = null; p.squash = 0.25;
    sfx.unhide();
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

  tryClimb(dir) {
    const p = this.pl;
    if (!['idle', 'walk', 'hide'].includes(p.state)) return false;
    const n = this.nearLadder(dir);
    if (!n) return false;
    if (p.state === 'hide') this.unhide();
    p.kb = false; p.pending = null;
    p.route = [{ t: 'climb', ladder: n.l, to: n.to }];
    p.x = n.l.x; p.state = 'climb';
    p.climbFrom = p.floor; p.climbTo = n.to; p.climbX = n.l.x;
    return true;
  }

  nearestObj() {
    const p = this.pl;
    if (!['idle', 'walk', 'hide'].includes(p.state)) return null;
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
    if (p.state === 'hide') { this.unhide(); return; }
    if (!['idle', 'walk'].includes(p.state)) return;
    const o = this.nearestObj();
    if (!o) return;
    p.route = []; p.pending = null; p.kb = false; p.state = 'idle';
    this.interact(o);
  }

  updatePlayer(dt) {
    const p = this.pl;
    p.animT += dt;
    p.squash *= Math.pow(0.001, dt);
    const dir = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    if (!this.over && ['idle', 'walk', 'hide'].includes(p.state)) {
      if (dir) {
        if (p.state === 'hide') this.unhide();
        p.route = []; p.pending = null; p.state = 'walk'; p.kb = true;
        const f = this.L.floors[p.floor];
        p.face = dir;
        p.x = clamp(p.x + dir * PIP_SPEED * dt, f.x1, f.x2);
        p.stepT -= dt;
        if (p.stepT <= 0) { p.stepT = 0.26; sfx.step(); }
        return;
      }
      if (p.kb && p.state === 'walk') { p.kb = false; p.state = 'idle'; p.squash = 0.12; return; }
      // holding W/S at a ladder climbs it
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
        p.state = 'climb';
        p.climbFrom = p.floor; p.climbTo = st.to; p.climbX = st.ladder.x;
      }
    } else if (p.state === 'climb') {
      const ty = this.fy(p.climbTo);
      const dy = ty - p.y;
      p.stepT -= dt;
      if (p.stepT <= 0) { p.stepT = 0.2; sfx.climb(); }
      if (Math.abs(dy) < 3) {
        p.y = ty; p.floor = p.climbTo; p.route.shift(); p.squash = 0.3;
        if (p.retarget) { const t = p.retarget; p.retarget = null; this.goTo(t); return; }
        if (p.route.length) p.state = 'walk'; else this.arrive();
      } else {
        p.y += Math.sign(dy) * Math.min(Math.abs(dy), CLIMB_SPEED * dt);
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

    switch (o.type) {
      case 'hide':
        p.state = 'hide'; p.hideObj = o; p.x = o.x; sfx.hide();
        if (!this.flags._hidTip) { this.flags._hidTip = true; }
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
    if (o.treasure) {
      this.found.push(item);
      sfx.treasure();
      this.burst(x, y, '#ffd84a', 26);
      this.hooks.fly(item, x, y, 'treasure');
    } else {
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
      if (!e.patrol) continue;
      if (Math.abs(e.x - x) > radius) continue;
      e.mode = 'investigate'; e.noiseX = x; e.investT = time;
      e.bubble = { text: '?', t: 1.4 };
    }
  }

  win(o) {
    if (this.over) return;
    this.over = true;
    const p = this.pl;
    p.state = 'cheer'; p.animT = 0;
    sfx.win();
    this.burst(p.x, p.y - 100, '#ffe79a', 40);
    setTimeout(() => this.hooks.win(this, o), 1300);
  }

  caught(e) {
    if (this.over) return;
    this.over = true;
    const p = this.pl;
    e.mode = 'alert';
    if (e.face !== undefined && e.type !== 'beam') e.face = p.x >= e.x ? 1 : -1;
    e.bubble = { text: '!', t: 99 };
    if (e.type === 'parrot') { sfx.squawk(); this.say('SQUAWK! INTRUDER! INTRUDER!', 2); }
    else sfx.alert();
    sfx.caught();
    p.state = 'caught'; p.animT = 0;
    this.shake = 22;
    setTimeout(() => this.hooks.caught(this, e), 1500);
  }

  // ---------- enemies ----------
  beginPatrolStep(e) {
    const s = e.patrol[e.pi];
    if (Math.abs(s.x - e.x) < 3) { e.mode = 'wait'; e.waitT = s.wait || 1; e.lookT = 0; if (s.face) e.face = s.face; }
    else e.mode = 'walk';
  }

  canSee(e) {
    const p = this.pl;
    if (p.state === 'hide' || p.state === 'caught' || this.over) return 0;
    // on ladders you only count as "on" a floor when your feet are near it
    if (p.state === 'climb') { if (Math.abs(p.y - this.fy(e.floor)) > 70) return 0; }
    else if (p.floor !== e.floor) return 0;
    const dx = p.x - e.x;
    if (e.type === 'sleeper') {
      if (e.phase !== 'awake') return 0;
      return Math.abs(dx) < e.range ? 1 - Math.abs(dx) / e.range : 0;
    }
    if (e.type === 'beam') {
      return Math.abs(p.x - e.bx) < e.width / 2 ? 1 : 0;
    }
    if (e.type === 'parrot' && e.covered) return 0;
    const r = this.range(e);
    if (r <= 0) return 0;
    if (dx * e.face < -30) return 0;
    if (Math.abs(dx) > r) return 0;
    return 1 - Math.abs(dx) / r;
  }

  range(e) {
    if (e.type === 'parrot') return e.covered ? 0 : e.range;
    if (e.mode === 'wait' && e.patrol) { const s = e.patrol[e.pi]; if (s.range !== undefined) return s.range; }
    if (e.mode === 'alert') return 0;
    return e.range;
  }

  pose(e) {
    if (e.mode === 'alert') return 'alert';
    if (e.mode === 'walk' || e.mode === 'investigate') {
      const f = Math.floor(e.animT * 7) % 4;
      return ['walk1', 'idle', 'walk2', 'idle'][f];
    }
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
        if (Math.abs(dx) < 3) {
          e.x = tx;
          if (e.mode === 'investigate') { e.mode = 'search'; e.waitT = e.investT; e.lookT = 0; }
          else { e.mode = 'wait'; const s = e.patrol[e.pi]; e.waitT = s.wait || 1; e.lookT = 0; if (s.face) e.face = s.face; }
        } else {
          e.face = Math.sign(dx);
          e.x += Math.sign(dx) * Math.min(Math.abs(dx), speed * dt);
        }
      } else if (e.mode === 'wait' || e.mode === 'search') {
        e.waitT -= dt; e.lookT += dt;
        const s = e.patrol[e.pi];
        if (e.mode === 'search' && e.lookT > 1.1) { e.lookT = 0; e.face *= -1; }
        if (e.mode === 'wait' && s.look && e.lookT > (s.wait || 1) * 0.5 && !e.looked) { e.looked = true; e.face *= -1; }
        if (e.mode === 'wait' && s.pose === 'sleep') { e.zT -= dt; if (e.zT <= 0) { e.zT = 0.7; this.zzz(e.x + 30 * e.face, this.fy(e.floor) - 200); } }
        if (e.waitT <= 0) {
          e.looked = false;
          if (e.mode === 'wait') e.pi = (e.pi + 1) % e.patrol.length;
          e.mode = 'walk';
          if (s.pose === 'sleep' && e.mode === 'walk') { e.bubble = { text: '...', t: 0.8 }; }
        }
      }
    } else if (e.type === 'sleeper') {
      const total = e.sleep + e.stir + e.awake;
      e.cycleT = (e.cycleT + dt) % total;
      const ph = e.cycleT < e.sleep ? 'sleep' : e.cycleT < e.sleep + e.stir ? 'stir' : 'awake';
      if (ph !== e.phase) {
        if (ph === 'awake') { e.bubble = { text: '?', t: e.awake }; }
        if (ph === 'stir') { e.bubble = { text: '~', t: e.stir }; }
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

    // detection
    const v = this.canSee(e);
    if (v > 0) {
      const before = e.sus;
      e.sus += dt * (e.type === 'beam' ? 3.2 : 2.3 + 7 * v * v);
      if (before === 0) { sfx.suspicious(); e.bubble = { text: '?', t: 0.8 }; }
      if (e.sus > 0.25) this.seen = true;
      if (e.sus >= 1) this.caught(e);
    } else {
      e.sus = Math.max(0, e.sus - dt * 1.4);
    }
  }

  // ---------- fx ----------
  burst(x, y, color, n = 14) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(80, 320);
      this.particles.push({ k: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, life: rand(0.5, 1), max: 1, color, r: rand(3, 7) });
    }
  }
  zzz(x, y) { this.particles.push({ k: 'z', x, y, vx: rand(10, 30), vy: -40, life: 2, max: 2, r: rand(20, 28) }); }
  popText(text, x, y) { this.particles.push({ k: 'text', text, x, y, vx: 0, vy: -60, life: 1.2, max: 1.2 }); }

  update(dt) {
    this.t += dt;
    if (!this.over || this.pl.state === 'cheer') this.updatePlayer(dt);
    for (const e of this.enemies) this.updateEnemy(e, dt);
    for (const o of this.objects) {
      if (o.cool) o.cool = Math.max(0, o.cool - dt);
      if (!this.isActive(o) || o.type === 'hide' && !this.hintT) continue;
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
    }
    this.particles = this.particles.filter(q => q.life > 0);
    this.near = this.over ? null : this.nearestObj();
    for (const r of this.ripples) r.t += dt;
    this.ripples = this.ripples.filter(r => r.t < 0.5);
    this.shake *= Math.pow(0.002, dt);
    if (this.hintT > 0) this.hintT -= dt;
    this.L.update && this.L.update(this, dt);
  }

  // ---------- drawing ----------
  draw(ctx) {
    const L = this.L;
    ctx.save();
    if (this.shake > 0.5) ctx.translate(rand(-1, 1) * this.shake, rand(-1, 1) * this.shake);
    ctx.drawImage(IMG[L.bg], 0, 0, W, H);
    L.drawBack && L.drawBack(ctx, this);

    // vision cones & beams under characters
    for (const e of this.enemies) this.drawVision(ctx, e);

    for (const l of this.ladders) this.drawLadder(ctx, l);

    const p = this.pl;
    // objects: back layer, then player if hidden, then hide objects, then the rest
    const hiddenObj = p.state === 'hide' ? p.hideObj : null;
    for (const o of this.objects) if (o.z === 'back') this.drawObj(ctx, o);
    if (hiddenObj) this.drawPip(ctx);
    for (const o of this.objects) if (o.z !== 'back' && o.z !== 'front') this.drawObj(ctx, o);
    // enemies & player sorted by feet
    const actors = this.enemies.filter(e => e.type !== 'beam').map(e => ({ y: this.fy(e.floor) + (e.dy || 0) + (e.type === 'sleeper' ? -1 : 0), d: () => this.drawEnemy(ctx, e) }));
    if (!hiddenObj) actors.push({ y: p.y + 0.5, d: () => this.drawPip(ctx) });
    actors.sort((a, b) => a.y - b.y).forEach(a => a.d());
    for (const o of this.objects) if (o.z === 'front') this.drawObj(ctx, o);
    L.drawFront && L.drawFront(ctx, this);

    this.drawLights(ctx);
    for (const e of this.enemies) this.drawBubble(ctx, e);
    this.drawParticles(ctx);
    this.drawHighlights(ctx);
    this.drawPrompts(ctx);
    for (const r of this.ripples) {
      ctx.strokeStyle = `rgba(255,240,200,${0.7 * (1 - r.t / 0.5)})`; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, 20 + r.t * 90, 6 + r.t * 26, 0, 0, Math.PI * 2); ctx.stroke();
    }
    // vignette
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.05);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(8,4,20,0.55)');
    ctx.fillStyle = g; ctx.fillRect(-40, -40, W + 80, H + 80);
    ctx.restore();
  }

  drawLadder(ctx, l) {
    if (l.enabled && !l.enabled(this)) return;
    const top = this.fy(l.top) - (l.topExtra ?? 12), bot = this.fy(l.bottom) + 4;
    if (l.style === 'rope') {
      const sway = Math.sin(this.t * 1.5) * 3;
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
      drawSprite(ctx, 'hook', l.x + 4, top + 26, 0.3, false, 1, 1, 1, Math.PI);
      return;
    }
    // wooden ladder: tile the sprite vertically
    const im = IMG.ladder, sc = l.scale || 0.62;
    const w = im.width * sc, h = im.height * sc;
    ctx.save();
    ctx.beginPath(); ctx.rect(l.x - w, top, w * 2, bot - top); ctx.clip();
    for (let y = bot - h; y > top - h; y -= h * 0.93) ctx.drawImage(im, l.x - w / 2, y, w, h);
    ctx.restore();
  }

  drawObj(ctx, o) {
    if (!this.isVisible(o)) return;
    const fy = this.fy(o.floor) + (o.dy || 0);
    let y = fy, alpha = 1;
    if (o.bob && !o.done) y += Math.sin(this.t * 2.4 + o.x) * 6;
    if (o.draw) { o.draw(ctx, this, o); return; }
    if (o.sprite) {
      const hl = (this.hover === o || this.near === o || this.hintT > 0) && this.isActive(o);
      if (o.glow && !o.done) {
        const g = ctx.createRadialGradient(o.x, y - 30, 4, o.x, y - 30, 90);
        g.addColorStop(0, 'rgba(255,230,140,0.45)'); g.addColorStop(1, 'rgba(255,230,140,0)');
        ctx.fillStyle = g; ctx.fillRect(o.x - 100, y - 130, 200, 200);
      }
      if (hl) { ctx.save(); ctx.shadowColor = 'rgba(255,225,120,0.95)'; ctx.shadowBlur = 26; }
      drawSprite(ctx, o.sprite, o.x, y, o.scale || 1, !!o.flip, alpha);
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
    if (p.state === 'climb') return 'climb';
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
    let x = p.x, y = p.y, sx = 1, sy = 1, alpha = 1;
    const sc = CHAR.pip.scale;
    if (p.state === 'walk') y -= Math.abs(Math.sin(p.animT * 12)) * 5;
    if (p.state === 'idle') { const b = Math.sin(this.t * 2.2) * 0.012; sy += b; sx -= b; }
    if (p.squash > 0.01) { sy -= p.squash; sx += p.squash * 0.8; }
    if (p.state === 'hide') { alpha = 0.55; }
    if (p.state === 'caught') { x += Math.sin(p.animT * 50) * 4 * Math.max(0, 1 - p.animT); sy += 0.05 * Math.sin(p.animT * 8); }
    if (p.state === 'cheer') y -= Math.abs(Math.sin(p.animT * 7)) * 30;
    let flip = p.face < 0;
    if (fr === 'climb') { flip = Math.floor(p.animT * 5) % 2 === 1; x = p.climbX; y += 50; }
    // soft contact shadow
    if (fr !== 'climb') {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, 34, 8, 0, 0, Math.PI * 2); ctx.fill();
    }
    drawSprite(ctx, 'pip_' + fr, x, y, sc * (fr === 'climb' ? 0.9 : 1), flip, alpha, sx, sy);
    if (p.state === 'act') {
      const k = 1 - p.act.t / p.act.max;
      const bx = p.x, by = p.y - 170;
      ctx.fillStyle = 'rgba(30,18,6,0.75)'; roundRect(ctx, bx - 42, by - 9, 84, 18, 9); ctx.fill();
      ctx.fillStyle = '#ffd35a'; roundRect(ctx, bx - 38, by - 5, 76 * k, 10, 5); ctx.fill();
    }
  }

  drawEnemy(ctx, e) {
    const fy = this.fy(e.floor) + (e.dy || 0);
    if (e.type === 'sleeper') {
      const wig = e.phase === 'stir' ? Math.sin(this.t * 30) * 0.03 : e.phase === 'awake' ? 0 : Math.sin(this.t * 1.6 + e.x) * 0.02;
      drawSprite(ctx, 'hammock_sleep', e.x, fy, e.scale || 0.75, !!e.flip, 1, 1, 1, wig);
      if (e.phase === 'awake') {
        // a pair of open eyes glinting over the hammock
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2a1606'; ctx.lineWidth = 3;
        for (const dx of [-12, 12]) { ctx.beginPath(); ctx.ellipse(e.x + dx + (e.eyeDx || 0), fy - 108, 10, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#2a1606'; ctx.beginPath(); ctx.arc(e.x + dx + (e.eyeDx || 0) + Math.sin(this.t * 2) * 4, fy - 106, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; }
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
    if (e.mode === 'alert') { y -= Math.max(0, Math.sin(Math.min(1, e.animT) * Math.PI)) * 0; }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(e.x, fy + 2, 50, 11, 0, 0, Math.PI * 2); ctx.fill();
    drawSprite(ctx, e.type + '_' + pose, e.x, y, sc, e.face < 0, 1, sx, sy);
  }

  drawVision(ctx, e) {
    if (this.over && e.mode !== 'alert') { /* keep drawing */ }
    const fy = this.fy(e.floor);
    const hot = Math.min(1, e.sus);
    const col = (a) => `rgba(${Math.round(255)},${Math.round(236 - 170 * hot)},${Math.round(140 - 100 * hot)},${a})`;
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
      const base = this.fy(e.floor);
      const g = ctx.createRadialGradient(e.x, base, 10, e.x, base, e.range);
      g.addColorStop(0, col(a)); g.addColorStop(1, col(0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(e.x, base - 40, e.range, 110, 0, 0, Math.PI * 2); ctx.fill();
      return;
    }
    const r = this.range(e);
    if (r <= 0) return;
    const eyeY = fy - (e.type === 'parrot' ? 120 : 150);
    const x0 = e.x + e.face * 20;
    const x1 = e.x + e.face * r;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, col(0.55)); g.addColorStop(0.75, col(0.28)); g.addColorStop(1, col(0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0, eyeY);
    ctx.lineTo(x1, fy - 210);
    ctx.lineTo(x1, fy + 14);
    ctx.lineTo(x0, fy + 14);
    ctx.closePath(); ctx.fill();
    // bright pool where the gaze hits the floor
    const fg = ctx.createLinearGradient(x0, 0, x1, 0);
    fg.addColorStop(0, col(0.5)); fg.addColorStop(1, col(0));
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
    else if (e.type === 'beam') { top = e.src.y - 60; }
    else top = fy - spriteSize(e.type + '_idle', CHAR[e.type].scale).h - 40;
    const x = e.type === 'beam' ? e.src.x : e.x;
    const t = e.bubble.text;
    const big = t === '!';
    const pop = 1 + Math.max(0, 0.3 - (this.t % 10) * 0) ;
    ctx.save();
    ctx.translate(x, top + Math.sin(this.t * 6) * 3);
    ctx.scale(pop, pop);
    ctx.fillStyle = big ? '#ff4a3a' : '#fffbe8';
    ctx.strokeStyle = '#2a1606'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(0, 0, big ? 34 : 28, big ? 38 : 30, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-8, big ? 34 : 26); ctx.lineTo(0, big ? 52 : 42); ctx.lineTo(8, big ? 34 : 26); ctx.fill();
    ctx.fillStyle = big ? '#fff' : '#3a2410';
    ctx.font = `900 ${big ? 50 : 40}px Fredoka, "Trebuchet MS", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t, 0, 3);
    ctx.restore();
    // suspicion meter under the bubble
    if (e.sus > 0.02 && !this.over) {
      ctx.fillStyle = 'rgba(30,18,6,0.7)'; roundRect(ctx, x - 36, top - 58, 72, 12, 6); ctx.fill();
      ctx.fillStyle = '#ff6a3a'; roundRect(ctx, x - 33, top - 55, 66 * Math.min(1, e.sus), 6, 3); ctx.fill();
    }
  }

  drawLights(ctx) {
    const lights = this.L.lights || [];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const l of lights) {
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
    if (this.over || !['idle', 'walk', 'hide'].includes(p.state)) return;
    if (p.state === 'hide') { this.keycap(ctx, p.x, p.y - 190, 'E', 'Leave'); return; }
    const o = this.near;
    if (o) {
      const b = this.objBox(o);
      if (!o.sprite) {
        ctx.strokeStyle = `rgba(255,220,110,${0.6 + 0.3 * Math.sin(this.t * 6)})`; ctx.lineWidth = 4; ctx.setLineDash([12, 10]);
        roundRect(ctx, b.x, b.y, b.w, b.h, 18); ctx.stroke(); ctx.setLineDash([]);
      }
      const verb = { hide: 'Hide', pickup: 'Grab', search: 'Search', use: 'Use', noise: 'Use', exit: 'Go' }[o.type];
      this.keycap(ctx, o.x - 20, Math.max(40, b.y - 36), 'E', verb);
    }
    const up = this.nearLadder(-1), down = this.nearLadder(1);
    if (up) this.keycap(ctx, up.l.x + (o ? 70 : 0), p.y - 200, 'W', 'Climb');
    else if (down) this.keycap(ctx, down.l.x + (o ? 70 : 0), p.y - 200, 'S', 'Climb');
  }

  drawHighlights(ctx) {
    if (this.hintT <= 0) return;
    const a = Math.min(1, this.hintT) * (0.6 + 0.4 * Math.sin(this.t * 8));
    for (const o of this.objects) {
      if (!this.isActive(o)) continue;
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
      } else if (q.k === 'twinkle') {
        const s = q.r * Math.sin(k * Math.PI);
        ctx.save(); ctx.translate(q.x, q.y); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,240,180,0.9)';
        ctx.beginPath();
        ctx.moveTo(0, -s); ctx.quadraticCurveTo(0, 0, s, 0); ctx.quadraticCurveTo(0, 0, 0, s); ctx.quadraticCurveTo(0, 0, -s, 0); ctx.quadraticCurveTo(0, 0, 0, -s);
        ctx.fill(); ctx.restore();
      } else if (q.k === 'z') {
        ctx.globalAlpha = Math.min(1, k * 1.5);
        ctx.fillStyle = '#e8f0ff'; ctx.strokeStyle = '#2a1606'; ctx.lineWidth = 4;
        ctx.font = `900 ${q.r}px Fredoka, "Trebuchet MS", sans-serif`; ctx.textAlign = 'center';
        ctx.strokeText('z', q.x + Math.sin(q.life * 4) * 8, q.y); ctx.fillText('z', q.x + Math.sin(q.life * 4) * 8, q.y);
        ctx.globalAlpha = 1;
      } else if (q.k === 'text') {
        ctx.globalAlpha = Math.min(1, k * 2);
        ctx.font = '900 44px Fredoka, "Trebuchet MS", sans-serif'; ctx.textAlign = 'center';
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
