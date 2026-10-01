/**
 * City dressing for the runner streets, after art/insp.png: New York's subway
 * stairs and hot-dog carts, Tokyo's lanterns and neon, Paris's cafés and
 * bollards. Plugs into street.ts through drawProps's `furnish` hook, plus a
 * road layer for crosswalks and coloured reflections.
 */

import {
  rand, drawLamp, drawBush, drawSignBoard,
  type Furnish, type PropSlot, type StreetView,
} from './street';
import type { CityId } from './cities';

const TAU = Math.PI * 2;

/** Soft coloured light pool; `rgb` is "r,g,b". */
function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, a: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/** A long coloured smear on wet asphalt below a light source. */
function reflection(ctx: CanvasRenderingContext2D, x: number, y: number, rgb: string, a: number) {
  const g = ctx.createLinearGradient(0, y - 50, 0, y + 70);
  g.addColorStop(0, `rgba(${rgb},0)`);
  g.addColorStop(0.45, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y + 10, 9, 60, 0, 0, TAU);
  ctx.fill();
}

/** A small label plate. */
function plate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, bg: string, fg: string, text: string, font: string) {
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(x - w / 2 + 2, y - h / 2 + 2, w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.fillStyle = fg;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
}

// ── New York ───────────────────────────────────────────────────────────────

function subwayStairs(ctx: CanvasRenderingContext2D, s: PropSlot) {
  const w = Math.min(s.usable * 0.8, 46), h = 74;
  const x = s.cx - w / 2, y = s.y - h / 2;
  ctx.fillStyle = '#15191c';
  ctx.fillRect(x, y, w, h);
  // steps going down, darker with depth
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = `rgba(150,160,166,${0.16 - i * 0.015})`;
    ctx.fillRect(x + 4, y + 6 + i * 7, w - 8, 3);
  }
  ctx.strokeStyle = '#2f5a3e';
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(160,220,170,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  // the green globes either side of the entrance
  for (const gy of [y + 4, y + h - 4]) {
    glow(ctx, x + (s.side < 0 ? w : 0), gy, 30, '120,220,140', 0.25);
    ctx.fillStyle = '#9ff0a8';
    ctx.beginPath();
    ctx.arc(x + (s.side < 0 ? w : 0), gy, 4.5, 0, TAU);
    ctx.fill();
  }
  if (w > 34) plate(ctx, s.cx, y - 8, 36, 10, '#111', '#eee', 'Subway', '600 6px Inter,sans-serif');
}

function newsBoxes(ctx: CanvasRenderingContext2D, s: PropSlot) {
  const n = s.usable > 46 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const x = s.cx - (n - 1) * 10 + i * 20, y = s.y + i * 4;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x - 7, y - 9, 16, 21);
    ctx.fillStyle = i ? '#b4302a' : '#2c5aa0';
    ctx.fillRect(x - 8, y - 10, 16, 20);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(x - 6, y - 8, 12, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x - 8, y - 10, 16, 1.5);
  }
}

function hotDogCart(ctx: CanvasRenderingContext2D, s: PropSlot) {
  const r = Math.min(s.usable * 0.42, 22);
  ctx.fillStyle = '#8c8f93';
  ctx.fillRect(s.cx - r * 0.7, s.y - r * 0.4 + 6, r * 1.4, r * 0.9);
  // striped parasol, yellow and blue like the reference
  ctx.fillStyle = 'rgba(6,9,12,0.4)';
  ctx.beginPath();
  ctx.arc(s.cx + 3, s.y + 4, r, 0, TAU);
  ctx.fill();
  const gores = 8;
  for (let i = 0; i < gores; i++) {
    ctx.fillStyle = i % 2 ? '#2a58a8' : '#f2c230';
    ctx.beginPath();
    ctx.moveTo(s.cx, s.y);
    ctx.arc(s.cx, s.y, r, (i / gores) * TAU, ((i + 1) / gores) * TAU);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,250,230,0.18)';
  ctx.beginPath();
  ctx.ellipse(s.cx - r * 0.3, s.y - r * 0.35, r * 0.35, r * 0.18, -0.7, 0, TAU);
  ctx.fill();
}

function hydrant(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.arc(x + 1.5, y + 2, 6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#b8352c';
  ctx.beginPath();
  ctx.arc(x, y, 5.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#e0584a';
  ctx.beginPath();
  ctx.arc(x - 1, y - 1, 2.6, 0, TAU);
  ctx.fill();
}

const furnishNewYork: Furnish = (ctx, s) => {
  const kind = rand(s.k * 2.91);
  // lamplight smears on the road beside the kerb
  if (kind < 0.3) {
    reflection(ctx, s.kerb - s.side * 20, s.y, '255,214,130', 0.10);
    drawLamp(ctx, s.cx, s.y, Math.sin(s.t * 3 + s.k) * 0.5 + 0.5);
  } else if (kind < 0.5 && s.usable >= 36) {
    subwayStairs(ctx, s);
  } else if (kind < 0.68) {
    newsBoxes(ctx, s);
    hydrant(ctx, s.kerb + s.side * 10, s.y + 40);
  } else if (kind < 0.85) {
    hotDogCart(ctx, s);
  } else {
    hydrant(ctx, s.kerb + s.side * 10, s.y);
    newsBoxes(ctx, { ...s, y: s.y + 50 });
  }
};

// ── Tokyo ──────────────────────────────────────────────────────────────────

const BLOSSOM = ['#b8607e', '#e48aa8', '#f8c4d6'] as const;
const NEON = ['255,79,154', '79,184,255', '255,120,60'];

function lanterns(ctx: CanvasRenderingContext2D, s: PropSlot) {
  // hung along the building line, two to a doorway
  const x = s.outer - s.side * 10;
  for (const ly of [s.y - 18, s.y + 18]) {
    glow(ctx, x, ly, 42, '255,90,60', 0.22);
    ctx.fillStyle = '#d63a2a';
    ctx.beginPath();
    ctx.ellipse(x, ly, 8, 11, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,200,150,0.35)';
    ctx.beginPath();
    ctx.ellipse(x - 2, ly - 2, 3.5, 6, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1a1210';
    ctx.fillRect(x - 6, ly - 12, 12, 2.5);
    ctx.fillRect(x - 6, ly + 9.5, 12, 2.5);
  }
  reflection(ctx, s.kerb - s.side * 18, s.y, '255,90,60', 0.16);
}

function neonSign(ctx: CanvasRenderingContext2D, s: PropSlot) {
  const rgb = NEON[Math.floor(rand(s.k * 3.7) * NEON.length) % NEON.length];
  const x = s.outer - s.side * 9, w = 13, h = 48;
  glow(ctx, x, s.y, 46, rgb, 0.22);
  ctx.fillStyle = '#121419';
  ctx.fillRect(x - w / 2, s.y - h / 2, w, h);
  ctx.strokeStyle = `rgba(${rgb},0.95)`;
  ctx.lineWidth = 1.6;
  ctx.strokeRect(x - w / 2, s.y - h / 2, w, h);
  // glyph strokes standing in for the vertical lettering
  ctx.strokeStyle = 'rgba(255,245,240,0.85)';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 4; i++) {
    const gy = s.y - h / 2 + 7 + i * 11;
    ctx.beginPath();
    ctx.moveTo(x - 3.5, gy);
    ctx.lineTo(x + 3.5, gy);
    if (rand(s.k + i * 2.2) > 0.4) { ctx.moveTo(x, gy - 3); ctx.lineTo(x, gy + 4); }
    ctx.stroke();
  }
  reflection(ctx, s.kerb - s.side * 22, s.y, rgb, 0.2);
}

function cherryTree(ctx: CanvasRenderingContext2D, s: PropSlot) {
  const size = Math.min(s.usable * 0.85, 46);
  drawBush(ctx, s.cx, s.y, s.k * 4.7, size, BLOSSOM);
  // fallen petals on the pavement and into the gutter
  ctx.fillStyle = 'rgba(248,190,210,0.7)';
  for (let i = 0; i < 9; i++) {
    const px = s.cx + (rand(s.k * 5 + i) - 0.5) * s.usable;
    const py = s.y + 30 + rand(s.k * 7 + i) * 60;
    ctx.beginPath();
    ctx.ellipse(px, py, 2.4, 1.4, rand(i) * 3, 0, TAU);
    ctx.fill();
  }
}

function vendingMachine(ctx: CanvasRenderingContext2D, s: PropSlot) {
  const x = s.outer - s.side * 12, w = 18, h = 28;
  glow(ctx, x, s.y, 34, '200,230,255', 0.16);
  ctx.fillStyle = '#e8ecef';
  ctx.fillRect(x - w / 2, s.y - h / 2, w, h);
  ctx.fillStyle = '#2b6fd0';
  ctx.fillRect(x - w / 2, s.y - h / 2, w, 5);
  ctx.fillStyle = 'rgba(160,210,255,0.8)';
  ctx.fillRect(x - w / 2 + 3, s.y - h / 2 + 7, w - 6, 12);
  ctx.strokeStyle = 'rgba(20,24,28,0.7)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - w / 2, s.y - h / 2, w, h);
}

const furnishTokyo: Furnish = (ctx, s) => {
  const kind = rand(s.k * 2.91);
  if (kind < 0.35) lanterns(ctx, s);
  else if (kind < 0.6) cherryTree(ctx, s);
  else if (kind < 0.82) neonSign(ctx, s);
  else vendingMachine(ctx, s);
};

// ── Paris ──────────────────────────────────────────────────────────────────

const CHALK = ['CAFÉ', 'VIN', 'PAIN', 'CRÊPES'];

function cafe(ctx: CanvasRenderingContext2D, s: PropSlot) {
  const aw = Math.min(s.usable * 0.6, 42), x = s.side < 0 ? s.outer : s.outer - aw;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(x + 3, s.y - 41, aw, 88);
  ctx.fillStyle = '#7a1f26';
  ctx.fillRect(x, s.y - 44, aw, 88);
  ctx.fillStyle = 'rgba(255,220,200,0.08)';
  for (let i = 0; i < 88; i += 11) ctx.fillRect(x, s.y - 44 + i, aw, 5);
  // scalloped valance on the street side
  const ex = s.side < 0 ? x + aw : x;
  ctx.fillStyle = '#5e161c';
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.arc(ex, s.y - 44 + 5.5 + i * 11, 5.5, 0, TAU);
    ctx.fill();
  }
  ctx.save();
  ctx.translate(x + aw / 2, s.y);
  ctx.rotate(-s.side * Math.PI / 2);
  ctx.fillStyle = 'rgba(240,214,160,0.9)';
  ctx.font = '600 10px Georgia,serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CAFÉ', 0, 0);
  ctx.restore();
  if (rand(s.k * 16.1) > 0.3) {
    const label = CHALK[Math.floor(rand(s.k * 19.7) * CHALK.length) % CHALK.length];
    drawSignBoard(ctx, s.cx + s.side * 6, s.y + 62, label, (rand(s.k * 17.3) - 0.5) * 0.4);
  }
}

function metroSign(ctx: CanvasRenderingContext2D, s: PropSlot) {
  glow(ctx, s.cx, s.y - 10, 60, '255,214,130', 0.16);
  ctx.fillStyle = '#2e4a36';
  ctx.beginPath();
  ctx.arc(s.cx, s.y + 8, 5, 0, TAU);
  ctx.fill();
  plate(ctx, s.cx, s.y - 6, 38, 12, '#9c2a26', '#f5e6c8', 'METRO', '700 7px Georgia,serif');
  ctx.strokeStyle = '#2e4a36';
  ctx.lineWidth = 2;
  ctx.strokeRect(s.cx - 19, s.y - 12, 38, 12);
}

function bicycle(ctx: CanvasRenderingContext2D, s: PropSlot) {
  const x = s.outer - s.side * 14;
  ctx.strokeStyle = 'rgba(20,24,28,0.9)';
  ctx.lineWidth = 2;
  for (const wy of [s.y - 13, s.y + 13]) {
    ctx.beginPath();
    ctx.ellipse(x, wy, 2.5, 10, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(x, s.y - 13); ctx.lineTo(x, s.y + 13);
  ctx.moveTo(x - 7, s.y - 10); ctx.lineTo(x + 7, s.y - 10);
  ctx.stroke();
  // wicker basket
  ctx.fillStyle = '#8a6a3c';
  ctx.fillRect(x - 6, s.y - 28, 12, 9);
}

function bollards(ctx: CanvasRenderingContext2D, s: PropSlot) {
  const x = s.kerb + s.side * 9;
  for (let i = -1; i <= 1; i++) {
    const by = s.y + i * 40 + 20;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.arc(x + 1.5, by + 2, 4.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1d2124';
    ctx.beginPath();
    ctx.arc(x, by, 4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,240,214,0.2)';
    ctx.beginPath();
    ctx.arc(x - 1.2, by - 1.2, 1.6, 0, TAU);
    ctx.fill();
  }
}

const furnishParis: Furnish = (ctx, s) => {
  const kind = rand(s.k * 2.91);
  bollards(ctx, s);
  if (kind < 0.35) {
    reflection(ctx, s.kerb - s.side * 20, s.y, '255,214,130', 0.12);
    drawLamp(ctx, s.cx, s.y, Math.sin(s.t * 3 + s.k) * 0.5 + 0.5);
  } else if (kind < 0.62 && s.usable >= 40) {
    cafe(ctx, s);
  } else if (kind < 0.78) {
    drawBush(ctx, s.cx, s.y, s.k * 4.7, Math.min(s.usable * 0.7, 36));
  } else if (kind < 0.9) {
    metroSign(ctx, s);
  } else {
    bicycle(ctx, s);
  }
};

const FURNISH: Record<CityId, Furnish> = { newyork: furnishNewYork, tokyo: furnishTokyo, paris: furnishParis };

export function cityFurnish(id: CityId): Furnish {
  return FURNISH[id];
}

// ── road layer ─────────────────────────────────────────────────────────────

const CROSSING_SPACING = 820;

/** Zebra crossings for New York and Paris, a neon wash for Tokyo. Call between drawGround and drawProps. */
export function drawCityRoad(ctx: CanvasRenderingContext2D, v: StreetView, worldY: number, id: CityId) {
  const { H, left, right } = v;

  if (id === 'tokyo') {
    // the whole alley picks up a faint pink-and-blue cast from the signs
    const g = ctx.createLinearGradient(left, 0, right, 0);
    g.addColorStop(0, 'rgba(255,79,154,0.05)');
    g.addColorStop(0.5, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(79,184,255,0.05)');
    ctx.fillStyle = g;
    ctx.fillRect(left, 0, right - left, H);
    return;
  }

  const kMin = Math.ceil(-(H / 2 + 80 + worldY) / CROSSING_SPACING);
  const kMax = Math.floor((80 - worldY + H / 2) / CROSSING_SPACING);
  for (let k = kMin; k <= kMax; k++) {
    if (rand(k * 31.7) < 0.35) continue;
    const y = -k * CROSSING_SPACING - worldY + H / 2;
    ctx.fillStyle = `rgba(223,227,220,${id === 'paris' ? 0.42 : 0.5})`;
    for (let x = left + 14; x < right - 26; x += 28) ctx.fillRect(x, y, 16, 58);
  }
}
