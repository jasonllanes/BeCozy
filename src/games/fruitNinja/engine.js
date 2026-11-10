import { PLAYERS } from '../../lib/players.js';

const FONT = 'Fredoka, "Trebuchet MS", "Segoe UI", sans-serif';
const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
const INK = '#3B2418';
const CREAM = '#FFF1DC';

const FRUITS = [
  { e: '🍉', c: '#ff5d73' },
  { e: '🍊', c: '#ffa23a' },
  { e: '🍎', c: '#ff4d4d' },
  { e: '🍋', c: '#ffe14d' },
  { e: '🍇', c: '#9a63d9' },
  { e: '🍓', c: '#ff6b81' },
  { e: '🍍', c: '#ffd23f' },
  { e: '🥝', c: '#9ccc65' },
  { e: '🍑', c: '#ffab91' },
];

export const POWERS = {
  slow: { e: '❄️', c: '#7CC8FF', label: 'SLOW-MO!', dur: 6, weight: 0.32 },
  x2: { e: '⭐', c: '#FFC83D', label: 'x2 SCORE!', dur: 8, mult: 2, weight: 0.34 },
  x3: { e: '🔥', c: '#FF7A3D', label: 'x3 SCORE!', dur: 8, mult: 3, weight: 0.12 },
  heal: { e: '💖', c: '#FF7BA9', label: '+1 LIFE!', weight: 0.22 },
};

const DIFFICULTY = {
  chill: { interval: 1.25, wave: [1, 2], bomb: 0.1, gravity: 1.05 },
  normal: { interval: 0.95, wave: [1, 3], bomb: 0.15, gravity: 1.25 },
  spicy: { interval: 0.7, wave: [2, 4], bomb: 0.2, gravity: 1.5 },
};

export const MAX_HP = 3;
const BOMB_PENALTY = 25; // classic mode
const POWER_CHANCE = 0.08;
const SLOW_FACTOR = 0.4;
const INVULN = 1.0; // survival: grace period after a bomb hit
const TRAIL_LIFE = 0.28;

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---- emoji sprite cache (crisp + fast) -------------------------------------
const sprites = new Map();
function sprite(emoji, size) {
  size = Math.round(size);
  const key = emoji + size;
  let c = sprites.get(key);
  if (!c) {
    const pad = Math.round(size * 0.3);
    c = document.createElement('canvas');
    c.width = c.height = size + pad * 2;
    const g = c.getContext('2d');
    g.font = `${size * 0.9}px ${EMOJI_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(emoji, c.width / 2, c.height / 2 + size * 0.06);
    sprites.set(key, c);
  }
  return c;
}

// distance from point p to segment a→b
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function bubble(ctx, x, y, w, h, fill, s) {
  const r = Math.min(h / 2, 22 * s);
  ctx.fillStyle = INK;
  roundRect(ctx, x + 4 * s, y + 5 * s, w, h, r);
  ctx.fill();
  ctx.fillStyle = fill;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4 * s;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.stroke();
}

function outlinedText(ctx, text, x, y, size, fill, weight = 700, strokeW = 0.16) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * strokeW;
  ctx.strokeStyle = INK;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class FruitNinjaEngine {
  /**
   * settings: { mode: 'classic'|'survival', difficulty, duration, bombs, powerups, trail }
   * gesture:  decorated gesture def (prompt / hint / cheer / speed)
   */
  constructor({ players, settings, gesture, onSound }) {
    this.settings = settings;
    this.gesture = gesture;
    this.survival = settings.mode === 'survival';
    this.bombsOn = this.survival || settings.bombs;
    this.cfg = DIFFICULTY[settings.difficulty] || DIFFICULTY.normal;
    this.onSound = onSound || (() => {});
    this.phase = 'lobby'; // lobby → countdown → playing → done
    this.phaseTime = 0;
    this.t = 0;
    this.playTime = 0;
    this.countdown = 3;
    this.lastTick = 4;
    this.timeLeft = settings.duration;
    this.zs = Array.from({ length: players }, () => ({
      score: 0,
      sliced: 0,
      missed: 0,
      bombs: 0,
      bestCombo: 0,
      powerups: 0,
      maxMult: 1,
      fruitCounts: {},
      hp: MAX_HP,
      dead: false,
      survived: null,
      invuln: 0,
      slow: 0,
      mult: { v: 1, left: 0 },
      clock: 0,
      items: [],
      pieces: [],
      particles: [],
      floaters: [],
      pending: [],
      spawnIn: 0.6,
      tip: null,
      prev: null,
      present: false,
      active: false,
      lastSeen: -99,
      trail: [],
      swipe: { n: 0, last: -99 },
      shake: 0,
      flash: 0,
    }));
  }

  begin() {
    this.phase = 'countdown';
    this.phaseTime = 0;
    this.countdown = 3;
    this.lastTick = 4;
  }

  _setPhase(p) {
    this.phase = p;
    this.phaseTime = 0;
  }

  summary() {
    return this.zs.map((z, i) => {
      const top = Object.entries(z.fruitCounts).sort((a, b) => b[1] - a[1])[0];
      const total = z.sliced + z.missed;
      return {
        ...PLAYERS[i],
        score: z.score,
        sliced: z.sliced,
        missed: z.missed,
        accuracy: total ? Math.round((z.sliced / total) * 100) : 0,
        bombs: z.bombs,
        bestCombo: z.bestCombo,
        powerups: z.powerups,
        maxMult: z.maxMult,
        hp: z.hp,
        dead: z.dead,
        survived: z.survived ?? this.playTime,
        topFruit: top ? top[0] : null,
      };
    });
  }

  // ---- update -------------------------------------------------------------
  update(dt, zones, inputs) {
    dt = Math.min(dt, 0.05);
    this.t += dt;
    this.phaseTime += dt;

    if (this.phase === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n < this.lastTick && n > 0) this.onSound('tick');
      this.lastTick = n;
      if (this.countdown <= 0) {
        this._setPhase('playing');
        this.onSound('go');
      }
    } else if (this.phase === 'playing') {
      this.playTime += dt;
      if (this.survival) {
        if (this.zs.every((z) => z.dead)) this._finish('over');
      } else {
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) {
          this.timeLeft = 0;
          this._finish('end');
        }
      }
    }

    const playing = this.phase === 'playing';
    this.zs.forEach((z, i) => {
      const zone = zones[i];
      if (!zone) return;
      const ts = z.slow > 0 ? SLOW_FACTOR : 1; // slow-mo only affects the world, not your hand
      z.clock += dt * ts;
      this._input(z, zone, z.dead ? null : inputs[i], dt);
      if (playing && !z.dead) this._spawn(z, zone, dt * ts);
      this._physics(z, zone, dt, dt * ts);
      if (playing && !z.dead) this._slice(z, zone, dt);
      if (playing) {
        z.slow = Math.max(0, z.slow - dt);
        z.mult.left = Math.max(0, z.mult.left - dt);
        if (z.mult.left <= 0) z.mult.v = 1;
        z.invuln = Math.max(0, z.invuln - dt);
      }
    });
  }

  _finish(sound) {
    this.zs.forEach((z) => {
      if (z.survived == null) z.survived = this.playTime;
    });
    this._setPhase('done');
    this.onSound(sound === 'over' ? 'over' : 'end');
  }

  _input(z, zone, input, dt) {
    if (input) {
      const raw = { x: input.x - zone.x, y: input.y - zone.y };
      const wasPresent = z.present;
      z.prev = wasPresent ? z.tip : null;
      z.tip = wasPresent
        ? { x: z.tip.x + (raw.x - z.tip.x) * 0.7, y: z.tip.y + (raw.y - z.tip.y) * 0.7 }
        : raw;
      z.present = true;
      z.active = input.active;
      z.lastSeen = this.t;
      if (z.active) z.trail.push({ x: z.tip.x, y: z.tip.y, t: this.t });
    } else if (this.t - z.lastSeen > 0.18 || z.dead) {
      z.present = false;
      z.active = false;
      z.tip = null;
      z.prev = null;
    } else {
      z.prev = z.tip; // brief tracking blip: hold still
    }
    while (z.trail.length && this.t - z.trail[0].t > TRAIL_LIFE) z.trail.shift();
    if (!z.present) z.trail.length = 0;
    z.shake = Math.max(0, z.shake - dt);
    z.flash = Math.max(0, z.flash - dt * 2.2);
  }

  _pickPower(z) {
    const entries = Object.entries(POWERS).filter(([k]) => k !== 'heal' || (this.survival && z.hp < MAX_HP));
    let r = Math.random() * entries.reduce((s, [, p]) => s + p.weight, 0);
    for (const [k, p] of entries) {
      r -= p.weight;
      if (r <= 0) return k;
    }
    return entries[0][0];
  }

  _spawn(z, zone, tdt) {
    z.spawnIn -= tdt;
    if (z.spawnIn <= 0) {
      const { interval, wave, bomb } = this.cfg;
      z.spawnIn = interval * rand(0.8, 1.3);
      const count = Math.floor(rand(wave[0], wave[1] + 1));
      const bombP = this.survival ? bomb * 1.25 : bomb;
      for (let i = 0; i < count; i++) {
        let kind = 'fruit';
        let power = null;
        if (this.bombsOn && Math.random() < bombP) kind = 'bomb';
        else if (this.settings.powerups && Math.random() < POWER_CHANCE) {
          kind = 'power';
          power = this._pickPower(z);
        }
        z.pending.push({ at: z.clock + i * 0.13, kind, power });
      }
    }
    z.pending = z.pending.filter((p) => {
      if (p.at > z.clock) return true;
      this._launch(z, zone, p.kind, p.power);
      return false;
    });
  }

  _radius(zone) {
    return clamp(Math.min(zone.w, zone.h) * 0.085, 30, 92);
  }

  _launch(z, zone, kind, power) {
    const r = this._radius(zone);
    const g = zone.h * this.cfg.gravity;
    const apex = zone.h * rand(0.5, 0.88);
    const vy = -Math.sqrt(2 * g * (apex + r));
    const flight = (2 * -vy) / g;
    const x0 = zone.w * rand(0.14, 0.86);
    const xt = zone.w * rand(0.12, 0.88);
    z.items.push({
      x: x0,
      y: zone.h + r,
      vx: (xt - x0) / flight,
      vy,
      r,
      rot: rand(0, Math.PI * 2),
      vr: kind === 'fruit' ? rand(-4, 4) : rand(-1.5, 1.5),
      kind,
      power,
      fruit: FRUITS[Math.floor(Math.random() * FRUITS.length)],
    });
  }

  _physics(z, zone, dt, tdt) {
    const g = zone.h * this.cfg.gravity;
    const step = (o) => {
      o.vy += g * tdt;
      o.x += o.vx * tdt;
      o.y += o.vy * tdt;
      o.rot += o.vr * tdt;
    };
    z.items.forEach(step);
    z.items = z.items.filter((o) => {
      const gone = o.vy > 0 && o.y > zone.h + o.r * 2;
      if (gone && o.kind === 'fruit' && this.phase === 'playing' && !z.dead) z.missed++;
      return !gone;
    });
    z.pieces.forEach(step);
    z.pieces = z.pieces.filter((o) => o.y < zone.h + o.r * 2);
    z.particles.forEach((p) => {
      p.vy += g * 0.7 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    });
    z.particles = z.particles.filter((p) => p.life > 0);
    z.floaters.forEach((f) => {
      f.life -= dt;
      f.y -= zone.h * 0.08 * dt;
    });
    z.floaters = z.floaters.filter((f) => f.life > 0);
  }

  _slice(z, zone, dt) {
    if (!z.active || !z.prev || !z.tip) return;
    const len = Math.hypot(z.tip.x - z.prev.x, z.tip.y - z.prev.y);
    const minSpeed = zone.h * 0.7 * (this.gesture?.speed ?? 1);
    if (len / dt < minSpeed || len > zone.h * 0.9) return;
    const ang = Math.atan2(z.tip.y - z.prev.y, z.tip.x - z.prev.x);
    for (const o of z.items.slice()) {
      if (z.dead) break;
      if (segDist(o.x, o.y, z.prev.x, z.prev.y, z.tip.x, z.tip.y) < o.r * 1.05 + 8) {
        z.items.splice(z.items.indexOf(o), 1);
        if (o.kind === 'bomb') this._hitBomb(z, o);
        else if (o.kind === 'power') this._hitPower(z, o);
        else this._hitFruit(z, o, ang);
      }
    }
  }

  _burst(z, x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(speed * 0.3, speed);
      z.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, r: rand(3, 8), life: rand(0.35, 0.8), max: 0.8, color });
    }
  }

  _float(z, x, y, text, color, size = 1, life = 0.9) {
    z.floaters.push({ x, y, text, life, max: life, size, color });
  }

  _hitFruit(z, o, ang) {
    z.sliced++;
    z.fruitCounts[o.fruit.e] = (z.fruitCounts[o.fruit.e] || 0) + 1;
    const s = z.swipe;
    s.n = this.t - s.last < 0.4 ? s.n + 1 : 1;
    s.last = this.t;
    z.bestCombo = Math.max(z.bestCombo, s.n);

    let pts = 10;
    if (s.n >= 3) {
      pts += 5 * (s.n - 2);
      if (s.n === 3) this.onSound('combo');
    }
    const m = z.mult.left > 0 ? z.mult.v : 1;
    pts *= m;
    z.maxMult = Math.max(z.maxMult, m);
    z.score += pts;
    this.onSound('slice');

    let text = `+${pts}`;
    if (s.n >= 3) text = `COMBO x${s.n}! ${text}`;
    if (m > 1) text += ` (x${m})`;

    const perp = ang + Math.PI / 2;
    const push = o.r * 2.2;
    [1, -1].forEach((side) => {
      z.pieces.push({
        x: o.x,
        y: o.y,
        vx: o.vx * 0.6 + Math.cos(perp) * push * side,
        vy: o.vy * 0.5 + Math.sin(perp) * push * side - o.r,
        vr: o.vr + side * rand(1, 3),
        rot: o.rot,
        cut: ang - o.rot,
        side,
        r: o.r,
        fruit: o.fruit,
      });
    });
    this._burst(z, o.x, o.y, o.fruit.c, 14, o.r * 5);
    this._float(z, o.x, o.y - o.r, text, s.n >= 3 || m > 1 ? '#FFC83D' : '#FFFFFF', s.n >= 3 ? 1.25 : 1);
  }

  _hitPower(z, o) {
    const p = POWERS[o.power];
    z.powerups++;
    this._burst(z, o.x, o.y, p.c, 20, o.r * 6);
    this._float(z, o.x, o.y - o.r, `${p.e} ${p.label}`, p.c, 1.3, 1.2);
    this.onSound(o.power === 'heal' ? 'heal' : 'power');
    if (o.power === 'slow') z.slow = p.dur;
    else if (o.power === 'heal') z.hp = Math.min(MAX_HP, z.hp + 1);
    else {
      // multipliers: a higher one replaces a lower one; the same one refreshes
      if (p.mult >= (z.mult.left > 0 ? z.mult.v : 1)) z.mult = { v: p.mult, left: p.dur };
    }
  }

  _hitBomb(z, o) {
    z.swipe.n = 0;
    this._burst(z, o.x, o.y, '#FF8A3D', 22, o.r * 7);
    this._burst(z, o.x, o.y, '#4a3b36', 14, o.r * 5);
    if (this.survival) {
      if (z.invuln > 0) {
        this._float(z, o.x, o.y - o.r, 'phew!', '#FFFFFF', 1, 0.8);
        return;
      }
      z.bombs++;
      z.hp = Math.max(0, z.hp - 1);
      z.invuln = INVULN;
      z.shake = 0.5;
      z.flash = 1;
      this.onSound('bomb');
      this._float(z, o.x, o.y - o.r, '💔 -1 life', '#FF6B5B', 1.3, 1.1);
      if (z.hp <= 0) {
        z.dead = true;
        z.survived = this.playTime;
        z.slow = 0;
        z.mult = { v: 1, left: 0 };
        z.pending.length = 0;
      }
    } else {
      z.bombs++;
      z.score = Math.max(0, z.score - BOMB_PENALTY);
      z.shake = 0.5;
      z.flash = 1;
      this.onSound('bomb');
      this._float(z, o.x, o.y - o.r, `💥 -${BOMB_PENALTY}`, '#FF6B5B', 1.3, 1.1);
    }
  }

  // ---- draw ---------------------------------------------------------------
  draw(ctx, zones, W, H) {
    ctx.clearRect(0, 0, W, H);
    this.zs.forEach((z, i) => zones[i] && this._drawZone(ctx, z, zones[i], i));
    this._drawFrames(ctx, zones);
    this._drawTimer(ctx, W);
    this._drawOverlay(ctx, W, H);
  }

  _scale(zone) {
    return clamp(Math.min(zone.w, zone.h) / 520, 0.62, 1.25);
  }

  _drawZone(ctx, z, zone, i) {
    const P = PLAYERS[i];
    const s = this._scale(zone);
    ctx.save();
    ctx.beginPath();
    ctx.rect(zone.x, zone.y, zone.w, zone.h);
    ctx.clip();

    // warm tint so fruit pops over the camera feed (icy when slowed)
    ctx.fillStyle = z.slow > 0 ? 'rgba(130, 200, 255, 0.28)' : 'rgba(255, 196, 140, 0.16)';
    ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
    if (z.flash > 0) {
      ctx.fillStyle = `rgba(255, 90, 70, ${z.flash * 0.35})`;
      ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
    }

    const sh = z.shake > 0 ? (Math.random() - 0.5) * 18 * (z.shake / 0.5) : 0;
    ctx.translate(zone.x + sh, zone.y + (z.shake > 0 ? (Math.random() - 0.5) * 10 : 0));

    z.particles.forEach((p) => {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * s, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    z.items.forEach((o) => this._drawItem(ctx, o, s));

    z.pieces.forEach((p) => {
      const sp = sprite(p.fruit.e, p.r * 2);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.rotate(p.cut);
      ctx.beginPath();
      p.side > 0 ? ctx.rect(-p.r * 3, -p.r * 3, p.r * 6, p.r * 3) : ctx.rect(-p.r * 3, 0, p.r * 6, p.r * 3);
      ctx.clip();
      ctx.rotate(-p.cut);
      ctx.drawImage(sp, -sp.width / 2, -sp.height / 2);
      ctx.restore();
    });

    // blade trail
    if (this.settings.trail && z.trail.length > 1) {
      const color = z.mult.left > 0 ? POWERS[z.mult.v >= 3 ? 'x3' : 'x2'].c : P.color;
      for (let k = 1; k < z.trail.length; k++) {
        const a = z.trail[k - 1];
        const b = z.trail[k];
        const age = 1 - (this.t - b.t) / TRAIL_LIFE;
        const w = clamp(age, 0, 1) * 16 * s;
        ctx.lineCap = 'round';
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.55 * age;
        ctx.lineWidth = w * 1.9;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.globalAlpha = 0.95 * age;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = w * 0.8;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    z.floaters.forEach((f) => {
      ctx.globalAlpha = clamp(f.life / (f.max * 0.5), 0, 1);
      outlinedText(ctx, f.text, f.x, f.y, 30 * s * f.size, f.color);
    });
    ctx.globalAlpha = 1;

    // cursor
    if (z.present && z.tip && !z.dead) {
      if (z.active) {
        ctx.fillStyle = P.color;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 4 * s;
        ctx.beginPath();
        ctx.arc(z.tip.x, z.tip.y, 14 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(z.tip.x, z.tip.y, 5 * s, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.setLineDash([8 * s, 7 * s]);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 4 * s;
        ctx.beginPath();
        ctx.arc(z.tip.x, z.tip.y, 16 * s, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        outlinedText(ctx, this.gesture.hint, z.tip.x, z.tip.y + 40 * s, 18 * s, '#fff', 600);
      }
    }

    ctx.restore();

    if (z.dead) this._drawDead(ctx, z, zone, P, s);
    if (this.phase !== 'done' || this.survival) this._drawHud(ctx, z, zone, P, s);
    if (!z.present && !z.dead && this.phase !== 'done') this._drawPrompt(ctx, zone, P, s);
  }

  _drawItem(ctx, o, s) {
    const size = o.r * 2;
    ctx.save();
    ctx.translate(o.x, o.y);
    if (o.kind === 'bomb') {
      const pulse = 1 + Math.sin(this.t * 10) * 0.05;
      ctx.rotate(Math.sin(this.t * 5 + o.rot) * 0.2);
      ctx.scale(pulse, pulse);
      ctx.strokeStyle = '#FF4B3A';
      ctx.lineWidth = 5 * s;
      ctx.beginPath();
      ctx.arc(0, 0, o.r * 1.12, 0, Math.PI * 2);
      ctx.stroke();
      const sp = sprite('💣', size);
      ctx.drawImage(sp, -sp.width / 2, -sp.height / 2);
    } else if (o.kind === 'power') {
      const p = POWERS[o.power];
      const pulse = 1 + Math.sin(this.t * 8 + o.rot) * 0.07;
      ctx.scale(pulse, pulse);
      // glowing badge so power-ups are unmistakable
      ctx.fillStyle = p.c;
      ctx.globalAlpha = 0.38;
      ctx.beginPath();
      ctx.arc(0, 0, o.r * 1.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = p.c;
      ctx.lineWidth = 6 * s;
      ctx.beginPath();
      ctx.arc(0, 0, o.r * 1.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3 * s;
      ctx.beginPath();
      ctx.arc(0, 0, o.r * 1.12 + 3 * s, 0, Math.PI * 2);
      ctx.stroke();
      const sp = sprite(p.e, size * 0.95);
      ctx.drawImage(sp, -sp.width / 2, -sp.height / 2);
    } else {
      ctx.rotate(o.rot);
      const sp = sprite(o.fruit.e, size);
      ctx.drawImage(sp, -sp.width / 2, -sp.height / 2);
    }
    ctx.restore();
  }

  _drawHud(ctx, z, zone, P, s) {
    const x = zone.x + 18 * s;
    let y = zone.y + (zone.y < 1 ? 70 * s : 18 * s);
    const w = Math.min(230 * s, zone.w - 36 * s);
    const h = 64 * s;
    bubble(ctx, x, y, w, h, P.color, s);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = `${30 * s}px ${EMOJI_FONT}`;
    ctx.fillStyle = '#000';
    ctx.fillText(P.emoji, x + 12 * s, y + h / 2 + 2 * s);
    ctx.textAlign = 'right';
    outlinedText(ctx, String(z.score), x + w - 16 * s, y + h / 2 + 2 * s, 38 * s, '#fff');
    ctx.textAlign = 'left';
    outlinedText(ctx, P.name, x + 54 * s, y + h / 2 + 2 * s, Math.min(22 * s, (w - 130 * s) / 3), '#fff', 600, 0.2);
    y += h + 12 * s;

    if (this.survival) {
      const hh = 40 * s;
      const hw = MAX_HP * 36 * s + 18 * s;
      bubble(ctx, x, y, hw, hh, CREAM, s * 0.8);
      ctx.textAlign = 'center';
      ctx.font = `${24 * s}px ${EMOJI_FONT}`;
      const blink = z.invuln > 0 && Math.floor(this.t * 10) % 2;
      for (let k = 0; k < MAX_HP; k++) {
        ctx.globalAlpha = blink && k === z.hp ? 0.3 : 1;
        ctx.fillStyle = '#000';
        ctx.fillText(k < z.hp ? '❤️' : '🖤', x + 9 * s + 18 * s + k * 36 * s, y + hh / 2 + 2 * s);
      }
      ctx.globalAlpha = 1;
      y += hh + 10 * s;
    }

    const chips = [];
    if (z.mult.left > 0) chips.push({ p: POWERS[z.mult.v >= 3 ? 'x3' : 'x2'], t: z.mult.left, text: `x${z.mult.v}` });
    if (z.slow > 0) chips.push({ p: POWERS.slow, t: z.slow, text: 'SLOW' });
    chips.forEach((c) => {
      const cw = 128 * s;
      const ch = 38 * s;
      bubble(ctx, x, y, cw, ch, c.p.c, s * 0.8);
      ctx.textAlign = 'left';
      ctx.font = `${22 * s}px ${EMOJI_FONT}`;
      ctx.fillStyle = '#000';
      ctx.fillText(c.p.e, x + 10 * s, y + ch / 2 + 2 * s);
      outlinedText(ctx, `${c.text}  ${Math.ceil(c.t)}s`, x + 42 * s, y + ch / 2 + 2 * s, 19 * s, '#fff', 700, 0.2);
      // time-left bar
      ctx.fillStyle = INK;
      ctx.fillRect(x + 8 * s, y + ch - 6 * s, (cw - 16 * s) * clamp(c.t / (c.p.dur || 1), 0, 1), 3 * s);
      y += ch + 8 * s;
    });
  }

  _drawDead(ctx, z, zone, P, s) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(zone.x, zone.y, zone.w, zone.h);
    ctx.clip();
    ctx.fillStyle = 'rgba(40, 22, 14, 0.62)';
    ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
    const cx = zone.x + zone.w / 2;
    const cy = zone.y + zone.h * 0.55;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${80 * s}px ${EMOJI_FONT}`;
    ctx.fillText('💀', cx, cy - 56 * s);
    outlinedText(ctx, 'OUT!', cx, cy + 14 * s, 54 * s, '#FF6B5B');
    const label = `${P.name} · ${z.score} pts · ${fmtTime(z.survived ?? this.playTime)}`;
    ctx.font = `700 ${22 * s}px ${FONT}`;
    const w = Math.min(ctx.measureText(label).width + 40 * s, zone.w - 24 * s);
    bubble(ctx, cx - w / 2, cy + 48 * s, w, 46 * s, P.color, s);
    outlinedText(ctx, label, cx, cy + 71 * s, Math.min(22 * s, (w - 20 * s) / (label.length * 0.55)), '#fff', 700, 0.2);
    ctx.restore();
  }

  _drawPrompt(ctx, zone, P, s) {
    const cx = zone.x + zone.w / 2;
    const cy = zone.y + zone.h * 0.55;
    const bob = Math.sin(this.t * 4) * 8 * s;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${80 * s}px ${EMOJI_FONT}`;
    ctx.fillStyle = '#000';
    ctx.fillText(this.gesture.emoji, cx, cy - 50 * s + bob);
    const label = `${P.name}, ${this.gesture.prompt}`;
    ctx.font = `700 ${26 * s}px ${FONT}`;
    const w = Math.min(ctx.measureText(label).width + 44 * s, zone.w - 24 * s);
    bubble(ctx, cx - w / 2, cy + 6 * s, w, 54 * s, P.color, s);
    ctx.textAlign = 'center';
    outlinedText(ctx, label, cx, cy + 34 * s, Math.min(26 * s, (w - 20 * s) / (label.length * 0.52)), '#fff');
  }

  _drawFrames(ctx, zones) {
    zones.forEach((zn, i) => {
      if (!this.zs[i]) return;
      const P = PLAYERS[i];
      const s = this._scale(zn);
      const inset = 5 * s;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 12 * s;
      ctx.strokeRect(zn.x + inset, zn.y + inset, zn.w - inset * 2, zn.h - inset * 2);
      ctx.strokeStyle = this.zs[i].dead ? '#6b5448' : P.color;
      ctx.lineWidth = 6 * s;
      ctx.strokeRect(zn.x + inset, zn.y + inset, zn.w - inset * 2, zn.h - inset * 2);
    });
  }

  _drawTimer(ctx, W) {
    if (this.phase === 'lobby') return;
    const w = 150;
    const x = W / 2 - w / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this.survival) {
      bubble(ctx, x, 12, w, 48, CREAM, 1);
      outlinedText(ctx, `⏱ ${fmtTime(this.playTime)}`, W / 2, 38, 28, '#FFC83D');
      return;
    }
    const secs = Math.ceil(this.timeLeft);
    const urgent = this.phase === 'playing' && secs <= 10;
    bubble(ctx, x, 12, w, 48, urgent && Math.floor(this.t * 3) % 2 ? '#FF6B5B' : CREAM, 1);
    outlinedText(ctx, `⏱ ${secs}s`, W / 2, 38, 28, urgent ? '#fff' : '#FFC83D');
  }

  _drawOverlay(ctx, W, H) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this.phase === 'countdown') {
      const n = Math.ceil(this.countdown);
      const frac = this.countdown - Math.floor(this.countdown);
      const size = Math.min(W, H) * (0.26 + (1 - frac) * 0.06);
      ctx.globalAlpha = clamp(frac * 3 + 0.3, 0, 1);
      outlinedText(ctx, String(n), W / 2, H / 2, size, '#FFC83D', 700, 0.12);
      ctx.globalAlpha = 1;
      outlinedText(ctx, this.gesture.cheer, W / 2, H / 2 + size * 0.62, Math.min(W, H) * 0.05, '#fff');
      if (this.survival) {
        outlinedText(ctx, '❤️❤️❤️  3 lives – dodge the bombs!', W / 2, H / 2 + size * 0.62 + Math.min(W, H) * 0.07, Math.min(W, H) * 0.035, '#FFD9D0');
      }
    } else if (this.phase === 'playing' && this.phaseTime < 0.8) {
      ctx.globalAlpha = 1 - this.phaseTime / 0.8;
      outlinedText(ctx, 'GO!', W / 2, H / 2, Math.min(W, H) * (0.3 + this.phaseTime * 0.2), '#4FC48A', 700, 0.12);
      ctx.globalAlpha = 1;
    } else if (this.phase === 'done') {
      outlinedText(ctx, this.survival ? 'GAME OVER' : "TIME'S UP!", W / 2, H / 2, Math.min(W, H) * 0.16, '#FFC83D', 700, 0.12);
    }
  }
}
