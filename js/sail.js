// Finale: sail the stolen ship to the lighthouse, dodging rocks and pirate rowboats.
import { IMG, drawSprite } from './assets.js';
import { sfx } from './audio.js';
import { W, H } from './game.js';

const rand = (a, b) => a + Math.random() * (b - a);
const TOP = 690, BOT = 1010;           // ship's waterline range
const LENGTH = 52;                      // seconds of sailing

export class SailGame {
  constructor(hooks) {
    this.hooks = hooks;
    this.t = 0; this.dist = 0;
    this.y = 860; this.ty = 860; this.vy = 0;
    this.hearts = 3; this.hits = 0; this.inv = 0;
    this.obs = []; this.parts = []; this.balls = [];
    this.spawnT = 1.5; this.boatT = 7;
    this.scroll = 0;
    this.phase = 'sail';               // sail -> arrive -> lit -> done | sunk
    this.phaseT = 0;
    this.lhX = W + 400;
    this.shipX = 360;
    this.shake = 0;
    this.keys = {};
    this.gems = 0;
    this.gemT = 4;
  }

  tap(x, y) { this.ty = Math.max(TOP, Math.min(BOT, y + 40)); }
  pointerMove() { return null; }
  key(k, down) { this.keys[k] = down; }

  hit(kind) {
    if (this.inv > 0 || this.phase !== 'sail') return;
    this.hearts--; this.hits++; this.inv = 1.6; this.shake = 26;
    sfx.hit(); if (kind === 'ball') sfx.splash();
    this.burst(360, this.y - 120, '#ffffff', 18);
    this.hooks.hud(this);
    if (this.hearts <= 0) { this.phase = 'sunk'; this.phaseT = 0; sfx.caught(); setTimeout(() => this.hooks.lose(this), 1700); }
  }

  burst(x, y, color, n) {
    for (let i = 0; i < n; i++) { const a = rand(0, Math.PI * 2), s = rand(80, 360); this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 150, life: rand(0.5, 1.1), max: 1.1, color, r: rand(3, 8) }); }
  }

  update(dt) {
    this.t += dt; this.phaseT += dt;
    const speed = this.phase === 'sail' ? 420 : this.phase === 'arrive' ? 420 * Math.max(0, 1 - this.phaseT / 3) : 0;
    this.scroll += speed * dt;

    if (this.keys.up) this.ty = Math.max(TOP, this.ty - 520 * dt);
    if (this.keys.down) this.ty = Math.min(BOT, this.ty + 520 * dt);
    // springy steering
    this.vy += ((this.ty - this.y) * 34 - this.vy * 10) * dt;
    this.y += this.vy * dt;
    this.inv = Math.max(0, this.inv - dt);
    this.shake *= Math.pow(0.003, dt);

    if (this.phase === 'sail') {
      this.dist = Math.min(1, this.dist + dt / LENGTH);
      this.hooks.progress(this.dist);
      const late = this.dist;
      this.spawnT -= dt;
      if (this.spawnT <= 0 && this.dist < 0.93) {
        this.spawnT = rand(1.5, 2.5) - late * 0.6;
        this.obs.push({ k: 'rock', x: W + 200, y: rand(TOP + 10, BOT), s: rand(0.42, 0.6) });
      }
      this.boatT -= dt;
      if (this.boatT <= 0 && this.dist > 0.12 && this.dist < 0.9) {
        this.boatT = rand(5.5, 8) - late * 2;
        this.obs.push({ k: 'boat', x: W + 250, y: rand(TOP + 20, BOT), s: 0.55, fireT: rand(0.8, 1.6), vx: -140 });
      }
      this.gemT -= dt;
      if (this.gemT <= 0 && this.dist < 0.9) { this.gemT = rand(5, 8); this.obs.push({ k: 'gem', x: W + 100, y: rand(TOP + 10, BOT - 30), s: 0.27 }); }
      if (this.dist >= 1) { this.phase = 'arrive'; this.phaseT = 0; }
    }

    for (const o of this.obs) {
      o.x -= (speed + (o.vx ? -o.vx : 0)) * dt;
      if (o.k === 'boat' && this.phase === 'sail') {
        o.fireT -= dt;
        if (o.fireT <= 0 && o.x < W - 50 && o.x > 700) {
          o.fireT = rand(2.2, 3.2);
          this.balls.push({ x: o.x - 90, y: o.y - 60, vx: -760, vy: -260, gy: o.y - 30 });
          sfx.cannon(); this.parts.push({ x: o.x - 100, y: o.y - 60, vx: -60, vy: -40, life: 0.6, max: 0.6, color: 'rgba(230,230,230,0.8)', r: 26, smoke: true });
        }
      }
      // collisions (ship hull ≈ box around x=360)
      if (!o.hitDone && Math.abs(o.x - 360) < (o.k === 'gem' ? 120 : o.k === 'rock' ? 100 : 140) && Math.abs(o.y - this.y) < (o.k === 'gem' ? 120 : 54)) {
        o.hitDone = true;
        if (o.k === 'gem') { this.gems++; sfx.treasure(); this.burst(o.x, o.y - 40, '#ffd84a', 20); o.gone = true; this.hooks.hud(this); }
        else this.hit(o.k);
      }
    }
    this.obs = this.obs.filter(o => o.x > -300 && !o.gone);

    for (const b of this.balls) {
      b.x += b.vx * dt; b.vy += 900 * dt; b.y += b.vy * dt;
      if (b.y > b.gy) { b.y = b.gy; b.vy = -Math.abs(b.vy) * 0.25; b.bounces = (b.bounces || 0) + 1; if (b.bounces === 1) { this.splash(b.x, b.gy); } }
      if (!b.done && Math.abs(b.x - 380) < 100 && Math.abs(b.gy - this.y) < 60 && b.y > this.y - 220) { b.done = true; this.hit('ball'); }
    }
    this.balls = this.balls.filter(b => b.x > -100 && (b.bounces || 0) < 3);

    for (const q of this.parts) { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; if (!q.smoke) q.vy += 600 * dt; else q.r += 30 * dt; }
    this.parts = this.parts.filter(q => q.life > 0);

    // lighthouse slides in near the end
    if (this.dist > 0.86) this.lhX = Math.max(1480, W + 400 - (this.dist - 0.86) / 0.14 * (W + 400 - 1480) - (this.phase === 'arrive' ? this.phaseT * 60 : 0));
    if (this.phase === 'arrive' || this.phase === 'lit') this.shipX += (this.lhX - 420 - this.shipX) * Math.min(1, dt * 0.9);
    if (this.phase === 'arrive') {
      this.ty = 900;
      if (this.phaseT > 3.2) { this.phase = 'lit'; this.phaseT = 0; sfx.lighthouse(); this.burst(this.lhX, 380, '#fff3b0', 60); this.hooks.lit && this.hooks.lit(); }
    }
    if (this.phase === 'lit' && this.phaseT > 4.5 && !this.doneFired) { this.doneFired = true; this.hooks.win(this); }
    // wake spray
    if (Math.random() < dt * 30 && speed > 50) this.parts.push({ x: this.shipX - 110, y: this.y - 10, vx: -speed * 0.6 + rand(-40, 40), vy: rand(-160, -40), life: 0.6, max: 0.6, color: 'rgba(220,240,255,0.9)', r: rand(3, 6) });
  }

  splash(x, y) { sfx.splash(); for (let i = 0; i < 12; i++) this.parts.push({ x, y, vx: rand(-120, 120), vy: rand(-380, -120), life: 0.8, max: 0.8, color: 'rgba(220,240,255,0.9)', r: rand(3, 7) }); }

  drawWaves(ctx, baseY, amp, len, speed, color, off) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 20; x += 20) {
      const s = (x + this.scroll * speed + off);
      ctx.lineTo(x, baseY + Math.sin(s / len) * amp + Math.sin(s / (len * 0.43) + this.t * 1.3) * amp * 0.4);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  }

  draw(ctx) {
    ctx.save();
    if (this.shake > 0.5) ctx.translate(rand(-1, 1) * this.shake, rand(-1, 1) * this.shake);
    // tiling sky/sea panorama, mirrored every other tile so seams match
    const bg = IMG.bg_sea, bw = bg.width * (H / bg.height);
    const off = (this.scroll * 0.25) % (bw * 2);
    for (let i = -1; i < 3; i++) {
      const x = i * bw - off;
      ctx.save();
      if (((i % 2) + 2) % 2 === 1) { ctx.translate(x + bw, 0); ctx.scale(-1, 1); ctx.drawImage(bg, 0, 0, bw, H); }
      else ctx.drawImage(bg, x, 0, bw, H);
      ctx.restore();
    }
    // lighthouse beam when lit
    if (this.phase === 'lit') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const a = Math.min(1, this.phaseT / 1.2);
      const ang = Math.sin(this.phaseT * 0.9) * 0.5 + Math.PI;
      const cx = this.lhX, cy = 300;
      const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, 1400);
      g.addColorStop(0, `rgba(255,240,170,${0.55 * a})`); g.addColorStop(1, 'rgba(255,240,170,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 1400, ang - 0.13, ang + 0.13); ctx.closePath(); ctx.fill();
      const halo = ctx.createRadialGradient(cx, cy, 5, cx, cy, 380);
      halo.addColorStop(0, `rgba(255,245,200,${0.8 * a})`); halo.addColorStop(1, 'rgba(255,230,150,0)');
      ctx.fillStyle = halo; ctx.fillRect(cx - 400, cy - 400, 800, 800);
      ctx.restore();
    }
    this.drawWaves(ctx, 660, 8, 90, 0.5, 'rgba(20,40,90,0.55)', 0);
    if (this.lhX < W + 300) drawSprite(ctx, this.phase === 'lit' ? 'lighthouse_lit' : 'lighthouse_dark', this.lhX, 760, 1.25);
    this.drawWaves(ctx, 700, 10, 120, 0.7, 'rgba(16,34,80,0.6)', 300);

    // sort things by waterline
    const things = [];
    for (const o of this.obs) things.push({ y: o.y, d: () => this.drawObs(ctx, o) });
    things.push({ y: this.y, d: () => this.drawShip(ctx) });
    things.sort((a, b) => a.y - b.y).forEach(t => t.d());
    for (const b of this.balls) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(b.x, b.gy, 20, 6, 0, 0, Math.PI * 2); ctx.fill();
      drawSprite(ctx, 'cannonball', b.x, b.y + 18, 0.24);
    }
    this.drawWaves(ctx, 1030, 14, 140, 1.2, 'rgba(10,24,62,0.85)', 900);

    for (const q of this.parts) {
      ctx.globalAlpha = Math.max(0, q.life / q.max);
      ctx.fillStyle = q.color; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.05);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(8,4,20,0.5)');
    ctx.fillStyle = vg; ctx.fillRect(-40, -40, W + 80, H + 80);
    ctx.restore();
  }

  drawObs(ctx, o) {
    const bob = Math.sin(this.t * 2 + o.x * 0.01) * 5;
    if (o.k === 'rock') drawSprite(ctx, 'rock', o.x, o.y + 30, o.s);
    else if (o.k === 'boat') drawSprite(ctx, 'rowboat', o.x, o.y + 20 + bob, o.s, true, 1, 1, 1, Math.sin(this.t * 2.5 + o.x) * 0.04);
    else if (o.k === 'gem') {
      const g = ctx.createRadialGradient(o.x, o.y - 30, 5, o.x, o.y - 30, 70);
      g.addColorStop(0, 'rgba(255,230,120,0.6)'); g.addColorStop(1, 'rgba(255,230,120,0)');
      ctx.fillStyle = g; ctx.fillRect(o.x - 80, o.y - 110, 160, 160);
      drawSprite(ctx, 'coin', o.x, o.y + bob, o.s);
    }
  }

  drawShip(ctx) {
    const bob = Math.sin(this.t * 2.2) * 7;
    const tilt = Math.max(-0.12, Math.min(0.12, this.vy / 2400)) + Math.sin(this.t * 1.7) * 0.03;
    if (this.inv > 0 && Math.floor(this.inv * 12) % 2) return;
    let a = 1;
    if (this.phase === 'sunk') { a = Math.max(0, 1 - this.phaseT / 1.5); }
    ctx.fillStyle = 'rgba(0,10,30,0.3)'; ctx.beginPath(); ctx.ellipse(this.shipX, this.y + 4, 150, 16, 0, 0, Math.PI * 2); ctx.fill();
    drawSprite(ctx, 'ship', this.shipX, this.y + 34 + bob + (this.phase === 'sunk' ? this.phaseT * 80 : 0), 0.62, false, a, 1, 1, tilt);
  }
}
