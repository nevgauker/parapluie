/**
 * Each city's signature hazard, shared by the solo and two-player runners.
 *
 * - New York: a taxi honks, then races down one kerb lane. A follower near
 *   that kerb when it passes gets splashed.
 * - Tokyo: petals stream sideways, then a gust shoves both walkers and blows
 *   the rain so the dry spot slides downwind.
 * - Paris: café awnings overhang the kerb. Under one the follower stays dry
 *   even outside the umbrella.
 *
 * Everything is in world space except Tokyo's petals, which are in the air
 * and so live on screen.
 */

import { PALETTE, rand, type DryZone } from './street';
import type { CityId } from './cities';

export interface CityScene {
  worldY: number; W: number; H: number;
  /** Screen x of the two kerbs. */
  left: number; right: number;
  difficulty: number;
  /** Follower position, world space. */
  fx: number; fy: number;
}

export interface CityEffect {
  /** Wetness to add to the follower right now. */
  splash: number;
  /** Sideways shove on both walkers, px per 60 Hz frame. */
  wind: number;
  /** How far downwind the umbrella's dry spot sits, px. */
  dryShift: number;
  /** The follower is under a fixed shelter. */
  sheltered: boolean;
  callouts: { text: string; color: string }[];
}

export interface CityEvents {
  tick(dt: number, s: CityScene): CityEffect;
  /** Drawn on the road, under the walkers. */
  drawUnder(ctx: CanvasRenderingContext2D, project: (y: number) => number): void;
  /** Drawn over the rain. */
  drawOver(ctx: CanvasRenderingContext2D, project: (y: number) => number): void;
  /** Fixed shelters, world space, for the rain mask. */
  shelters(): DryZone[];
}

const TAU = Math.PI * 2;
const calm = (): CityEffect => ({ splash: 0, wind: 0, dryShift: 0, sheltered: false, callouts: [] });
type Rng = () => number;

/** Hazards come round faster as the run heats up, but not linearly. */
const every = (rng: Rng, lo: number, hi: number, difficulty: number) => (lo + rng() * (hi - lo)) / Math.sqrt(difficulty);

/**
 * @param rng drives everything that changes play (when hazards come, which
 *   side, which way the wind blows); pass a seeded one so a seed replays the
 *   same run. Spray and petals stay on Math.random, they're only looks.
 */
export function cityEvents(id: CityId, rng: Rng = Math.random): CityEvents {
  if (id === 'newyork') return taxis(rng);
  if (id === 'tokyo') return gusts(rng);
  return awnings(rng);
}

// ── New York: taxis ────────────────────────────────────────────────────────

const TAXI_WARN = 1.2;
/** Taxi speed against the street, px per 60 Hz frame. */
const TAXI_SPEED = 14;
/** How close to the taxi's line the follower has to be to get wet. */
const SPLASH_REACH = 52;
const SPLASH_WET = 0.3;

interface Spray { x: number; y: number; vx: number; vy: number; life: number }

function taxis(rng: Rng): CityEvents {
  let phase: 'idle' | 'warn' | 'drive' = 'idle';
  let timer = 5;
  let side = 1;
  let lane = 0, y = 0;
  let spray: Spray[] = [];

  return {
    tick(dt, s) {
      const fx = calm();
      const f = dt * 60;
      lane = side < 0 ? s.left + 24 : s.right - 24;
      timer -= dt;

      if (phase === 'idle' && timer <= 0) {
        phase = 'warn'; timer = TAXI_WARN;
        side = rng() < 0.5 ? -1 : 1;
        fx.callouts.push({ text: side < 0 ? '🚕 taxi! ← kerb' : '🚕 taxi! kerb →', color: PALETTE.amber });
      } else if (phase === 'warn' && timer <= 0) {
        phase = 'drive';
        y = s.worldY - s.H / 2 - 90;
      } else if (phase === 'drive') {
        const before = y;
        y += TAXI_SPEED * f;
        if (before < s.fy && y >= s.fy && Math.abs(s.fx - lane) < SPLASH_REACH) {
          fx.splash = SPLASH_WET;
          fx.callouts.push({ text: 'SPLASH!', color: '#8fc4ea' });
          for (let i = 0; i < 14; i++) {
            spray.push({ x: lane, y: s.fy, vx: -side * (1 + Math.random() * 3), vy: (Math.random() - 0.7) * 2.5, life: 1 });
          }
        }
        if (y > s.worldY + s.H / 2 + 120) { phase = 'idle'; timer = every(rng, 7, 11, s.difficulty); }
      }

      for (const p of spray) { p.x += p.vx * f; p.y += p.vy * f; p.vy += 0.15 * f; p.life -= dt * 1.8; }
      spray = spray.filter(p => p.life > 0);
      return fx;
    },

    drawUnder(ctx, project) {
      if (phase === 'warn') {
        // headlights sweeping down the lane from beyond the top of the frame
        const pulse = 0.5 + 0.5 * Math.sin(timer * 18);
        const g = ctx.createLinearGradient(0, 0, 0, 260);
        g.addColorStop(0, `rgba(255,236,170,${0.32 + pulse * 0.2})`);
        g.addColorStop(1, 'rgba(255,236,170,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(lane - 16, 0); ctx.lineTo(lane + 16, 0);
        ctx.lineTo(lane + 46, 260); ctx.lineTo(lane - 46, 260);
        ctx.closePath();
        ctx.fill();
      }
      if (phase === 'drive') drawTaxi(ctx, lane, project(y));
    },

    drawOver(ctx, project) {
      ctx.fillStyle = `rgba(${PALETTE.rain},0.8)`;
      for (const p of spray) {
        ctx.globalAlpha = p.life;
        ctx.beginPath();
        ctx.arc(p.x, project(p.y), 1.8, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },

    shelters: () => [],
  };
}

/** A yellow cab from above, nose down: it is coming toward the walkers. */
function drawTaxi(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const w = 34, h = 62;
  // headlight throw ahead of it
  const beam = ctx.createLinearGradient(0, y + h / 2, 0, y + h / 2 + 120);
  beam.addColorStop(0, 'rgba(255,236,170,0.35)');
  beam.addColorStop(1, 'rgba(255,236,170,0)');
  ctx.fillStyle = beam;
  ctx.fillRect(x - w / 2 - 8, y + h / 2, w + 16, 120);

  ctx.fillStyle = 'rgba(6,8,10,0.45)';
  ctx.beginPath();
  ctx.roundRect(x - w / 2 + 3, y - h / 2 + 4, w, h, 7);
  ctx.fill();
  ctx.fillStyle = '#f2c230';
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, 7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(70,50,4,0.7)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  // windscreens and roof
  ctx.fillStyle = '#1d2630';
  ctx.fillRect(x - w / 2 + 4, y + 6, w - 8, 12);
  ctx.fillRect(x - w / 2 + 5, y - h / 2 + 8, w - 10, 9);
  ctx.fillStyle = '#e3b322';
  ctx.fillRect(x - w / 2 + 4, y - 12, w - 8, 18);
  // TAXI roof sign
  ctx.fillStyle = '#20242a';
  ctx.fillRect(x - 10, y - 7, 20, 8);
  ctx.fillStyle = '#ffe9a8';
  ctx.font = '700 6px Inter,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TAXI', x, y - 3);
  // headlights
  ctx.fillStyle = '#fff6d8';
  for (const hx of [x - w / 2 + 6, x + w / 2 - 6]) {
    ctx.beginPath();
    ctx.arc(hx, y + h / 2 - 3, 3, 0, TAU);
    ctx.fill();
  }
}

// ── Tokyo: gusts ───────────────────────────────────────────────────────────

const GUST_WARN = 1.0;
const GUST_TIME = 1.8;
/** Peak shove, px per 60 Hz frame. */
const GUST_PUSH = 1.1;
/** Peak downwind shift of the dry spot, px. */
const GUST_SHIFT = 28;

interface Petal { x: number; y: number; vx: number; vy: number; rot: number; life: number }

function gusts(rng: Rng): CityEvents {
  let phase: 'idle' | 'warn' | 'blow' = 'idle';
  let timer = 6;
  let dir = 1;
  let petals: Petal[] = [];

  function petal(W: number, H: number, fromEdge: boolean): Petal {
    return {
      x: fromEdge ? (dir > 0 ? -10 : W + 10) : Math.random() * W,
      y: Math.random() * H,
      vx: 0, vy: 0.4 + Math.random() * 0.5,
      rot: Math.random() * TAU, life: 1,
    };
  }

  return {
    tick(dt, s) {
      const fx = calm();
      const f = dt * 60;
      timer -= dt;
      let strength = 0;

      if (phase === 'idle' && timer <= 0) {
        phase = 'warn'; timer = GUST_WARN;
        dir = rng() < 0.5 ? -1 : 1;
        fx.callouts.push({ text: dir > 0 ? '🌸 gust →' : '← gust 🌸', color: '#f7a8c8' });
      } else if (phase === 'warn' && timer <= 0) {
        phase = 'blow'; timer = GUST_TIME;
      } else if (phase === 'blow') {
        if (timer <= 0) { phase = 'idle'; timer = every(rng, 7, 11, s.difficulty); }
        else strength = Math.sin(Math.PI * (1 - timer / GUST_TIME));
      }
      fx.wind = dir * GUST_PUSH * strength;
      fx.dryShift = dir * GUST_SHIFT * strength;

      // A few petals always drift down the alley; a warning sends a stream.
      const rate = phase === 'idle' ? 2 : phase === 'warn' ? 26 : 34;
      if (Math.random() < rate * dt) petals.push(petal(s.W, s.H, phase !== 'idle'));
      const drift = phase === 'idle' ? 0.3 : phase === 'warn' ? 2.5 : 2.5 + strength * 4;
      for (const p of petals) {
        p.vx += (dir * drift - p.vx) * 0.08 * f;
        p.x += p.vx * f; p.y += p.vy * f;
        p.rot += 0.08 * f;
        if (p.x < -20 || p.x > s.W + 20 || p.y > s.H + 10) p.life = 0;
      }
      petals = petals.filter(p => p.life > 0);
      return fx;
    },

    drawUnder() {},

    drawOver(ctx) {
      for (const p of petals) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = 'rgba(247,178,204,0.85)';
        ctx.beginPath();
        ctx.ellipse(0, 0, 3.2, 1.8, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    },

    shelters: () => [],
  };
}

// ── Paris: café awnings ────────────────────────────────────────────────────

const AWNING_R = 48;

interface Awning { x: number; y: number; side: number; seed: number }

function awnings(rng: Rng): CityEvents {
  let list: Awning[] = [];
  let timer = 2;
  let wasSheltered = false;

  return {
    tick(dt, s) {
      const fx = calm();
      timer -= dt;
      if (timer <= 0) {
        const side = rng() < 0.5 ? -1 : 1;
        list.push({ x: side < 0 ? s.left : s.right, y: s.worldY - s.H / 2 - AWNING_R - 20, side, seed: rng() * 100 });
        timer = 4 + rng() * 3;
      }
      // keep awnings on the kerb if the road width changes with a resize
      for (const a of list) a.x = a.side < 0 ? s.left : s.right;
      list = list.filter(a => a.y < s.worldY + s.H / 2 + AWNING_R + 40);

      fx.sheltered = list.some(a => Math.hypot(s.fx - a.x, s.fy - a.y) < AWNING_R - 6);
      if (fx.sheltered && !wasSheltered) fx.callouts.push({ text: 'café awning ☕', color: PALETTE.cream });
      wasSheltered = fx.sheltered;
      return fx;
    },

    drawUnder(ctx, project) {
      for (const a of list) drawCafeAwning(ctx, a.x, project(a.y), a.side, a.seed);
    },

    drawOver() {},

    shelters: () => list.map(a => ({ x: a.x, y: a.y, r: AWNING_R })),
  };
}

/** A burgundy half-dome awning hanging over the kerb, scalloped at the edge. */
function drawCafeAwning(ctx: CanvasRenderingContext2D, x: number, y: number, side: number, seed: number) {
  const r = AWNING_R;
  // the dry patch beneath it
  ctx.fillStyle = 'rgba(16,18,20,0.35)';
  ctx.beginPath();
  ctx.ellipse(x - side * 4, y + 6, r * 0.95, r * 0.9, 0, 0, TAU);
  ctx.fill();

  // half disc reaching into the road; start and end on the kerb line
  const a0 = side < 0 ? -Math.PI / 2 : Math.PI / 2;
  const folds = 7;
  ctx.beginPath();
  ctx.moveTo(x, y + (side < 0 ? -r : r));
  for (let i = 0; i < folds; i++) {
    const s0 = a0 + (i / folds) * Math.PI;
    const s1 = a0 + ((i + 1) / folds) * Math.PI;
    const sm = (s0 + s1) / 2;
    ctx.quadraticCurveTo(x + Math.cos(sm) * r * 1.08, y + Math.sin(sm) * r * 1.08, x + Math.cos(s1) * r, y + Math.sin(s1) * r);
  }
  ctx.closePath();
  ctx.fillStyle = '#7a1f26';
  ctx.fill();
  ctx.strokeStyle = 'rgba(30,6,8,0.7)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // fold lines, lit on the lamp side
  ctx.save();
  ctx.clip();
  for (let i = 1; i < folds; i++) {
    const a = a0 + (i / folds) * Math.PI;
    ctx.strokeStyle = i % 2 ? 'rgba(255,220,200,0.10)' : 'rgba(20,4,6,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * r * 1.1, y + Math.sin(a) * r * 1.1);
    ctx.stroke();
  }
  const sheen = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, 0, x, y, r);
  sheen.addColorStop(0, 'rgba(255,214,190,0.18)');
  sheen.addColorStop(1, 'rgba(255,214,190,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(x - r * 1.2, y - r * 1.2, r * 2.4, r * 2.4);
  ctx.restore();

  ctx.save();
  ctx.translate(x - side * r * 0.5, y);
  ctx.rotate(-side * Math.PI / 2);
  ctx.fillStyle = 'rgba(240,214,160,0.9)';
  ctx.font = '600 10px Georgia,serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(rand(seed) > 0.5 ? 'CAFÉ' : 'BISTRO', 0, 0);
  ctx.restore();
}
