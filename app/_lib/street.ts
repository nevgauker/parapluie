/**
 * Shared street renderer for the Parapluie canvas games.
 *
 * Art direction reference: `art/ChatGPT Image Jul 26, 2026, 01_12_58 PM.png` —
 * a top-down cel-shaded rainy street. Wet mottled asphalt, cream lane lines,
 * cobbled sidewalks, warm pools of lamplight, green foliage, pale rain,
 * puddle ripples, and one saturated yellow umbrella as the single hero colour.
 *
 * Everything here is pure canvas drawing: no game state, no React.
 */

export const PALETTE = {
  night: '#14181c',
  asphalt: '#363c42',
  gutter: '#23282d',
  curb: '#645d51',
  curbLit: '#8b8474',
  pavement: '#736b5f',
  pavementAlt: '#655e53',
  seam: '#2b2721',
  lane: '#dfe3dc',
  lampGlow: '255,214,130',
  lampPost: '#181b1e',
  umbrella: '#f5c518',
  umbrellaLit: '#ffdf5c',
  umbrellaShade: '#c9990d',
  umbrellaRib: '#8a6708',
  foliage: '#54873c',
  foliageDark: '#345f2b',
  foliageLit: '#77a854',
  jacketBlue: '#41718f',
  jacketOlive: '#66783a',
  hair: '#3d2b20',
  shoes: '#cfc9bb',
  soaked: '#2f4653',
  awningGreen: '#2c5a45',
  awningCream: '#e4dfd0',
  board: '#221f1b',
  cream: '#f0ece0',
  amber: '#f0b34a',
  rain: '214,228,238',
} as const;

const TAU = Math.PI * 2;

/**
 * Deterministic pseudo-random in [0,1) — lets props sit at stable world rows.
 * Two rounds, because a single sine correlates badly for small integer seeds
 * and lines up identical shopfronts down a whole block.
 */
function rand(seed: number): number {
  let x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  x -= Math.floor(x);
  const y = Math.sin((x + seed) * 39.3468 + 11.135) * 24634.6345;
  return y - Math.floor(y);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Blend two hex colours; t=0 → a, t=1 → b. */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const k = Math.max(0, Math.min(1, t));
  return `rgb(${Math.round(r1 + (r2 - r1) * k)},${Math.round(g1 + (g2 - g1) * k)},${Math.round(b1 + (b2 - b1) * k)})`;
}

// ── ground textures ────────────────────────────────────────────────────────
// Both surfaces are baked once into small tiles and reused as patterns, so the
// per-frame cost is two fillRect calls instead of a few hundred paths.

const WRAP = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const ASPHALT_TILE = 128;
// Deliberately coprime-ish with ASPHALT_TILE: two layers at different periods
// hide the repeat that a single tile makes obvious over a large area.
const MACRO_TILE = 176;
const PAVE_TILE = 48;

/** Soft wrapping blotches, used for both asphalt layers. */
function blotches(
  g: CanvasRenderingContext2D, T: number, count: number, seed: number,
  minR: number, maxR: number, light: string, dark: string,
) {
  for (let i = 0; i < count; i++) {
    const bx = rand(i * 3.1 + seed) * T;
    const by = rand(i * 5.7 + seed) * T;
    const br = minR + rand(i * 7.3 + seed) * (maxR - minR);
    const col = rand(i * 9.1 + seed) > 0.45 ? light : dark;
    for (const [ox, oy] of WRAP) {
      const cx = bx + ox * T;
      const cy = by + oy * T;
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, br);
      grad.addColorStop(0, col);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(cx, cy, br, 0, TAU);
      g.fill();
    }
  }
}

function buildAsphaltTile(): HTMLCanvasElement {
  const T = ASPHALT_TILE;
  const c = document.createElement('canvas');
  c.width = c.height = T;
  const g = c.getContext('2d')!;
  g.fillStyle = PALETTE.asphalt;
  g.fillRect(0, 0, T, T);
  blotches(g, T, 14, 0, 14, 30, 'rgba(104,116,128,0.13)', 'rgba(26,30,34,0.16)');

  // Grit.
  for (let i = 0; i < 620; i++) {
    g.fillStyle = rand(i * 13.7) > 0.5 ? 'rgba(158,170,180,0.05)' : 'rgba(9,11,13,0.09)';
    g.fillRect(Math.floor(rand(i * 2.3) * T), Math.floor(rand(i * 4.9) * T), 1, 1);
  }
  return c;
}

/** Large, very soft damp patches laid over the base asphalt. */
function buildMacroTile(): HTMLCanvasElement {
  const T = MACRO_TILE;
  const c = document.createElement('canvas');
  c.width = c.height = T;
  const g = c.getContext('2d')!;
  blotches(g, T, 9, 21.7, 40, 78, 'rgba(112,126,138,0.11)', 'rgba(20,24,28,0.15)');
  return c;
}

function buildPavementTile(): HTMLCanvasElement {
  const T = PAVE_TILE;
  const c = document.createElement('canvas');
  c.width = c.height = T;
  const g = c.getContext('2d')!;
  g.fillStyle = PALETTE.seam;
  g.fillRect(0, 0, T, T);

  const bw = 16, bh = 8;
  for (let row = 0; row < T / bh; row++) {
    const offset = row % 2 ? bw / 2 : 0;
    for (let x = -bw; x < T + bw; x += bw) {
      const px = x + offset;
      const py = row * bh;
      const v = rand(row * 17.3 + x * 0.37);
      g.fillStyle = mix(PALETTE.pavement, PALETTE.pavementAlt, v);
      g.fillRect(px + 0.6, py + 0.6, bw - 1.2, bh - 1.2);
      // cel highlight on the lamp-facing edge, shade opposite
      g.fillStyle = 'rgba(255,248,230,0.05)';
      g.fillRect(px + 0.6, py + 0.6, bw - 1.2, 1);
      g.fillStyle = 'rgba(20,17,13,0.10)';
      g.fillRect(px + 0.6, py + bh - 1.8, bw - 1.2, 1.2);
    }
  }
  return c;
}

interface Patterns { asphalt: CanvasPattern; macro: CanvasPattern; pave: CanvasPattern }
const patternCache = new WeakMap<CanvasRenderingContext2D, Patterns>();

function patterns(ctx: CanvasRenderingContext2D): Patterns {
  let p = patternCache.get(ctx);
  if (!p) {
    p = {
      asphalt: ctx.createPattern(buildAsphaltTile(), 'repeat')!,
      macro: ctx.createPattern(buildMacroTile(), 'repeat')!,
      pave: ctx.createPattern(buildPavementTile(), 'repeat')!,
    };
    patternCache.set(ctx, p);
  }
  return p;
}

function shiftPattern(p: CanvasPattern, dy: number) {
  if (typeof DOMMatrix === 'undefined' || !p.setTransform) return;
  p.setTransform(new DOMMatrix().translate(0, dy));
}

// ── the street ─────────────────────────────────────────────────────────────

export interface StreetView {
  W: number;
  H: number;
  /** Screen x of the street's left kerb. */
  left: number;
  /** Screen x of the street's right kerb. */
  right: number;
  /** Screen-space scroll offset in px; ground textures slide by this much. */
  scroll: number;
  /** Width of the cobbled sidewalk outside each kerb; rooftops fill the rest. */
  walk: number;
}

/** Sidewalk width for a given canvas, clamped so wide screens keep their scale. */
export function walkWidth(W: number, street: number): number {
  return Math.max(0, Math.min(112, (W - street) / 2));
}

/** Wet asphalt, kerbs, cobbled sidewalks and lane markings. */
export function drawGround(ctx: CanvasRenderingContext2D, v: StreetView) {
  const { W, H, left, right, scroll, walk } = v;
  const { asphalt, macro, pave } = patterns(ctx);

  // rooftops beyond the sidewalks
  ctx.fillStyle = PALETTE.night;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  const roofGap = 96;
  for (let y = (scroll * 0.9 % roofGap) - roofGap; y < H + roofGap; y += roofGap) {
    ctx.fillRect(0, y, Math.max(0, left - walk), 2);
    ctx.fillRect(Math.min(W, right + walk), y, W, 2);
  }

  shiftPattern(pave, scroll % PAVE_TILE);
  ctx.fillStyle = pave;
  ctx.fillRect(left - walk, 0, walk, H);
  ctx.fillRect(right, 0, walk, H);

  // eaves shadow where the buildings meet the pavement
  for (const [x, dir] of [[left - walk, -1], [right + walk, 1]] as [number, number][]) {
    const g = ctx.createLinearGradient(x, 0, x - dir * 16, 0);
    g.addColorStop(0, 'rgba(6,8,10,0.55)');
    g.addColorStop(1, 'rgba(6,8,10,0)');
    ctx.fillStyle = g;
    ctx.fillRect(dir < 0 ? x : x - 16, 0, 16, H);
  }

  shiftPattern(asphalt, scroll % ASPHALT_TILE);
  ctx.fillStyle = asphalt;
  ctx.fillRect(left, 0, right - left, H);
  shiftPattern(macro, scroll % MACRO_TILE);
  ctx.fillStyle = macro;
  ctx.fillRect(left, 0, right - left, H);

  // Kerb stones: a lit cap on the pavement side, a dark gutter inside the road.
  for (const [x, dir] of [[left, -1], [right, 1]] as [number, number][]) {
    ctx.fillStyle = PALETTE.curb;
    ctx.fillRect(x + (dir < 0 ? -7 : 0), 0, 7, H);
    ctx.fillStyle = 'rgba(255,246,224,0.10)';
    ctx.fillRect(x + (dir < 0 ? -7 : 6), 0, 1.2, H);
    const gut = ctx.createLinearGradient(x, 0, x + dir * -14, 0);
    gut.addColorStop(0, 'rgba(14,17,20,0.55)');
    gut.addColorStop(1, 'rgba(14,17,20,0)');
    ctx.fillStyle = gut;
    ctx.fillRect(dir < 0 ? x : x - 14, 0, 14, H);
  }

  // Tar seams across the road — the main cue that the ground is moving.
  ctx.strokeStyle = 'rgba(20,23,26,0.35)';
  ctx.lineWidth = 1.5;
  const seamGap = 150;
  for (let y = (scroll % seamGap) - seamGap; y < H + seamGap; y += seamGap) {
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  }

  // Solid cream lines just inside the asphalt, with a wet bleed around them.
  for (const x of [left + 12, right - 12]) {
    ctx.strokeStyle = 'rgba(223,227,220,0.07)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(223,227,220,0.72)';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }

  // Faint centre dashes.
  const mid = (left + right) / 2;
  ctx.strokeStyle = 'rgba(223,227,220,0.13)';
  ctx.lineWidth = 3;
  const dashGap = 76;
  for (let y = (scroll % dashGap) - dashGap; y < H + dashGap; y += dashGap) {
    ctx.beginPath();
    ctx.moveTo(mid, y);
    ctx.lineTo(mid, y + 26);
    ctx.stroke();
  }

  // Cold sheen down the wet crown of the road.
  const sheen = ctx.createLinearGradient(left, 0, right, 0);
  sheen.addColorStop(0, 'rgba(150,180,200,0)');
  sheen.addColorStop(0.5, 'rgba(150,180,200,0.045)');
  sheen.addColorStop(1, 'rgba(150,180,200,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(left, 0, right - left, H);

  // Overhead-shot falloff: the frame edges sit outside the lamplight.
  const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34, W / 2, H / 2, Math.max(W, H) * 0.72);
  vig.addColorStop(0, 'rgba(6,8,10,0)');
  vig.addColorStop(1, 'rgba(6,8,10,0.42)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}

// ── street furniture ───────────────────────────────────────────────────────

const PROP_SPACING = 165;
const SIGNS = ['COFFEE', 'PAIN', 'FLEURS', 'RAMEN', 'LIVRES'];

function lampGlow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, strength = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${PALETTE.lampGlow},${0.34 * strength})`);
  g.addColorStop(0.4, `rgba(${PALETTE.lampGlow},${0.13 * strength})`);
  g.addColorStop(1, `rgba(${PALETTE.lampGlow},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

function drawLamp(ctx: CanvasRenderingContext2D, x: number, y: number, flicker: number) {
  lampGlow(ctx, x, y, 140, 0.9 + flicker * 0.1);
  // base + fluted post, seen from above
  ctx.fillStyle = PALETTE.lampPost;
  ctx.beginPath();
  ctx.ellipse(x, y + 2, 13, 11, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,238,205,0.06)';
  ctx.beginPath();
  ctx.ellipse(x - 3, y - 2, 8, 6, 0, 0, TAU);
  ctx.fill();
  // lantern head
  ctx.fillStyle = '#22262a';
  ctx.beginPath();
  ctx.ellipse(x, y, 9, 9, 0, 0, TAU);
  ctx.fill();
  const core = ctx.createRadialGradient(x, y, 0, x, y, 9);
  core.addColorStop(0, 'rgba(255,244,210,0.95)');
  core.addColorStop(0.6, `rgba(${PALETTE.lampGlow},0.55)`);
  core.addColorStop(1, `rgba(${PALETTE.lampGlow},0.05)`);
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(10,12,14,0.85)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, TAU);
  ctx.stroke();
}

function drawBush(ctx: CanvasRenderingContext2D, x: number, y: number, seed: number, size: number) {
  const blobs = 6 + Math.floor(rand(seed) * 4);
  // dark mass first, then mid tone, then lit scallops on the lamp side
  for (const [pass, col, shrink, off] of [
    [0, PALETTE.foliageDark, 1, 0],
    [1, PALETTE.foliage, 0.78, -1.5],
    [2, PALETTE.foliageLit, 0.42, -3.5],
  ] as [number, string, number, number][]) {
    ctx.fillStyle = col;
    for (let i = 0; i < blobs; i++) {
      const a = (i / blobs) * TAU + rand(seed + i * 1.7 + pass) * 0.7;
      const d = size * (0.32 + rand(seed + i * 2.3) * 0.45);
      const r = size * 0.42 * shrink * (0.7 + rand(seed + i * 3.1) * 0.6);
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * d + off, y + Math.sin(a) * d * 0.85 + off, r, r * 0.86, a, 0, TAU);
      ctx.fill();
    }
  }
}

function drawAwning(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, flip: number, color: string) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = PALETTE.awningCream;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  const stripe = 15;
  for (let sy = -w; sy < h + w; sy += stripe * 2) {
    ctx.beginPath();
    ctx.moveTo(x, y + sy);
    ctx.lineTo(x + w, y + sy + w * flip);
    ctx.lineTo(x + w, y + sy + stripe + w * flip);
    ctx.lineTo(x, y + sy + stripe);
    ctx.closePath();
    ctx.fill();
  }
  // fabric shading away from the lamp
  const sh = ctx.createLinearGradient(x, y, x + w, y);
  sh.addColorStop(0, 'rgba(255,248,228,0.12)');
  sh.addColorStop(1, 'rgba(12,16,14,0.35)');
  ctx.fillStyle = sh;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
  ctx.strokeStyle = 'rgba(10,14,12,0.6)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w, h);
}

function drawSignBoard(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, tilt: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(-15, -10, 32, 24);
  ctx.fillStyle = '#5a4632';
  ctx.fillRect(-17, -12, 34, 26);
  ctx.fillStyle = PALETTE.board;
  ctx.fillRect(-14, -9, 28, 20);
  ctx.fillStyle = 'rgba(236,232,220,0.8)';
  ctx.font = '600 7px Inter,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, -3);
  ctx.strokeStyle = 'rgba(236,232,220,0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-8, 4);
  ctx.lineTo(8, 4);
  ctx.moveTo(-8, 7.5);
  ctx.lineTo(4, 7.5);
  ctx.stroke();
  ctx.restore();
}

function drawDrain(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = 'rgba(10,12,14,0.75)';
  ctx.fillRect(x - 7, y - 11, 14, 22);
  ctx.fillStyle = '#4b5259';
  ctx.fillRect(x - 6, y - 10, 12, 20);
  ctx.fillStyle = 'rgba(8,10,12,0.9)';
  for (let i = 0; i < 4; i++) ctx.fillRect(x - 4.5, y - 7.5 + i * 4.6, 9, 2.4);
  ctx.strokeStyle = 'rgba(230,240,246,0.10)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 6, y - 10, 12, 20);
}

function drawPuddle(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, seed: number) {
  // Shallow standing water: mostly a soft sky reflection, not a dark hole.
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rand(seed) * 0.6 - 0.3, 0, TAU);
  const g = ctx.createRadialGradient(x - rx * 0.3, y - ry * 0.35, 0, x, y, rx);
  g.addColorStop(0, 'rgba(112,132,148,0.20)');
  g.addColorStop(0.65, 'rgba(30,36,42,0.20)');
  g.addColorStop(1, 'rgba(24,29,34,0.10)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(198,216,228,0.10)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

/**
 * Lamps, hedges, awnings, drains and puddles, placed on stable world rows so
 * they scroll with the street instead of flickering.
 *
 * @param worldY camera position in world space (0 for non-scrolling games)
 * @param t      elapsed seconds, used for lamp flicker
 */
export function drawProps(ctx: CanvasRenderingContext2D, v: StreetView, worldY: number, t = 0) {
  const { H, left, right, walk } = v;
  const usable = walk - 8;
  const kMin = Math.ceil(-(H / 2 + 160 + worldY) / PROP_SPACING);
  const kMax = Math.floor((160 - worldY + H / 2) / PROP_SPACING);

  for (let k = kMin; k <= kMax; k++) {
    const y = -k * PROP_SPACING - worldY + H / 2;
    // Alternate sides so neither pavement goes dark for long.
    const side = (k % 2 === 0) === (rand(k * 1.73) > 0.15) ? -1 : 1;
    const outer = side < 0 ? left - walk : right + walk;
    const cx = side < 0 ? left - walk / 2 - 2 : right + walk / 2 + 2;
    const kind = rand(k * 2.91);

    // Gutter furniture always fits, even on a narrow phone screen.
    if (rand(k * 5.13) > 0.55) drawDrain(ctx, side < 0 ? left + 13 : right - 13, y + 60);
    if (rand(k * 6.37) > 0.45) {
      const px = left + 26 + rand(k * 7.11) * (right - left - 52);
      drawPuddle(ctx, px, y + 95, 26 + rand(k * 8.3) * 22, 17 + rand(k * 9.7) * 12, k);
    }

    // Rooftop vents and skylights, so the blocks beyond the pavement read as
    // buildings rather than empty margin.
    const band = side < 0 ? left - walk : v.W - (right + walk);
    if (band > 26) {
      const bx = side < 0 ? rand(k * 11.3) * (band - 22) + 6 : right + walk + 8 + rand(k * 11.3) * (band - 24);
      if (rand(k * 12.7) > 0.5) {
        // dim skylight
        ctx.fillStyle = 'rgba(255,208,130,0.07)';
        ctx.fillRect(bx, y - 14, 16, 26);
        ctx.strokeStyle = 'rgba(255,208,130,0.13)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, y - 14, 16, 26);
      } else {
        ctx.fillStyle = 'rgba(8,10,12,0.55)';
        ctx.fillRect(bx, y - 9, 20, 18);
        ctx.fillStyle = 'rgba(255,246,224,0.04)';
        ctx.fillRect(bx, y - 9, 20, 2);
      }
    }

    if (usable < 24) continue;

    if (kind < 0.44) {
      drawLamp(ctx, cx, y, Math.sin(t * 3 + k) * 0.5 + 0.5);
    } else if (kind < 0.78) {
      drawBush(ctx, cx, y, k * 4.7, Math.min(usable * 0.9, 52));
    } else if (usable >= 40) {
      // shopfront awning hugging the building line, chalkboard on the pavement
      const aw = Math.min(usable * 0.62, 44);
      const shop = rand(k * 14.9);
      drawAwning(ctx, side < 0 ? outer : outer - aw, y - 44, aw, 88, side, shop > 0.5 ? PALETTE.awningGreen : '#6d3d3a');
      if (rand(k * 16.1) > 0.4) {
        const label = SIGNS[Math.floor(rand(k * 19.7) * SIGNS.length) % SIGNS.length];
        drawSignBoard(ctx, cx + side * 6, y + 58, label, (rand(k * 17.3) - 0.5) * 0.4);
      }
    } else {
      drawBush(ctx, cx, y, k * 4.7, Math.min(usable * 0.8, 38));
    }
  }
}

// ── rain ───────────────────────────────────────────────────────────────────

export interface RainDrop { x: number; y: number; len: number; spd: number; a: number }
/** A circle the rain does not fall inside — i.e. umbrella cover. */
export interface DryZone { x: number; y: number; r: number }

function covered(x: number, y: number, zones: DryZone[]): boolean {
  for (const z of zones) {
    const dx = x - z.x, dy = y - z.y;
    if (dx * dx + dy * dy < z.r * z.r) return true;
  }
  return false;
}

/**
 * Pale slanted rain. `project` maps a drop's stored y to screen y, so the same
 * function serves world-space (scrolling) and screen-space games. Drops inside
 * a dry zone are skipped, which makes umbrella cover directly visible.
 */
export function drawRainField(
  ctx: CanvasRenderingContext2D,
  drops: RainDrop[],
  H: number,
  project: (y: number) => number = (y) => y,
  dry: DryZone[] = [],
) {
  ctx.lineCap = 'round';
  for (const d of drops) {
    const sy = project(d.y);
    if (sy < -28 || sy > H + 28) continue;
    if (covered(d.x, sy, dry)) continue;
    const near = d.len > 19;
    ctx.strokeStyle = `rgba(${PALETTE.rain},${Math.min(0.7, d.a * (near ? 2.4 : 1.7))})`;
    ctx.lineWidth = near ? 1.7 : 1;
    ctx.beginPath();
    ctx.moveTo(d.x, sy);
    ctx.lineTo(d.x - 4, sy + d.len * (near ? 1.15 : 1));
    ctx.stroke();
  }
}

export interface Ripple { x: number; y: number; t: number; dur: number; size: number }

/** Age the ripple list and occasionally spawn a new impact ring. */
export function tickRipples(
  ripples: Ripple[],
  dt: number,
  perSecond: number,
  pick: () => { x: number; y: number },
) {
  for (const r of ripples) r.t += dt;
  for (let i = ripples.length - 1; i >= 0; i--) if (ripples[i].t >= ripples[i].dur) ripples.splice(i, 1);
  if (Math.random() < perSecond * dt) {
    const p = pick();
    ripples.push({ x: p.x, y: p.y, t: 0, dur: 0.85 + Math.random() * 0.7, size: 9 + Math.random() * 17 });
  }
}

export function drawRipples(
  ctx: CanvasRenderingContext2D,
  ripples: Ripple[],
  project: (y: number) => number = (y) => y,
  dry: DryZone[] = [],
) {
  ctx.lineWidth = 1;
  for (const r of ripples) {
    const sy = project(r.y);
    if (covered(r.x, sy, dry)) continue;
    const k = r.t / r.dur;
    const rad = r.size * (0.2 + k * 1.0);
    ctx.strokeStyle = `rgba(${PALETTE.rain},${(1 - k) * 0.22})`;
    ctx.beginPath();
    ctx.ellipse(r.x, sy, rad, rad * 0.62, 0, 0, TAU);
    ctx.stroke();
    if (k > 0.3) {
      ctx.strokeStyle = `rgba(${PALETTE.rain},${(1 - k) * 0.11})`;
      ctx.beginPath();
      ctx.ellipse(r.x, sy, rad * 0.55, rad * 0.34, 0, 0, TAU);
      ctx.stroke();
    }
  }
}

// ── characters ─────────────────────────────────────────────────────────────

/**
 * Figures are drawn a bit over life-size relative to the roadway so they read
 * at a glance, matching the reference's proportions.
 */
export const WALKER_SCALE = 1.45;

export interface WalkerLook {
  jacket: string;
  hair?: string;
  /** Player-identity trim on the collar, keeps P1/P2 readable. */
  accent?: string;
}

/**
 * A person from directly overhead: shoes, coat, shoulders, hair. Light comes
 * from the upper-left, matching the reference's street lamp.
 */
export function drawWalker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  look: WalkerLook,
  opts: {
    angle?: number; phase?: number; scale?: number; wet?: number; hideHead?: boolean;
    /** Canopy radius; when set, the figure carries it over their head. */
    umbrella?: number;
    spin?: number;
  } = {},
) {
  const { angle = 0, phase = 0, scale = WALKER_SCALE, wet = 0, umbrella, spin = 0 } = opts;
  const hideHead = opts.hideHead ?? false;
  const jacket = wet > 0 ? mix(look.jacket, PALETTE.soaked, wet * 0.6) : look.jacket;
  const hair = look.hair ?? PALETTE.hair;

  ctx.save();
  ctx.translate(x, y);

  // contact shadow, always cast away from the lamp
  const sh = ctx.createRadialGradient(2, 3, 1, 2, 3, 15 * scale);
  sh.addColorStop(0, 'rgba(6,8,10,0.5)');
  sh.addColorStop(1, 'rgba(6,8,10,0)');
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.arc(2, 3, 15 * scale, 0, TAU);
  ctx.fill();

  ctx.rotate(angle);
  ctx.scale(scale, scale);

  // shoes, stepping
  const swing = Math.sin(phase) * 3.4;
  ctx.fillStyle = PALETTE.shoes;
  for (const [fx, fs] of [[-3.6, swing], [3.6, -swing]] as [number, number][]) {
    ctx.beginPath();
    ctx.ellipse(fx, 6.5 + fs, 2.1, 3.4, 0, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(8,10,12,0.35)';
  for (const [fx, fs] of [[-3.6, swing], [3.6, -swing]] as [number, number][]) {
    ctx.beginPath();
    ctx.ellipse(fx, 8.2 + fs, 2.1, 1.4, 0, 0, TAU);
    ctx.fill();
  }

  // coat
  ctx.beginPath();
  ctx.ellipse(0, 0, 8.4, 10.2, 0, 0, TAU);
  ctx.fillStyle = jacket;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // cel shading in world space, so the lit side stays upper-left as they turn
  ctx.rotate(-angle);
  const lit = ctx.createLinearGradient(-11, -11, 9, 9);
  lit.addColorStop(0, 'rgba(255,244,222,0.22)');
  lit.addColorStop(0.5, 'rgba(255,244,222,0)');
  lit.addColorStop(0.55, 'rgba(10,14,18,0)');
  lit.addColorStop(1, 'rgba(10,14,18,0.34)');
  ctx.fillStyle = lit;
  ctx.fillRect(-14, -14, 28, 28);
  ctx.restore();
  ctx.strokeStyle = 'rgba(10,13,16,0.55)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 8.4, 10.2, 0, 0, TAU);
  ctx.stroke();

  // arms tucked at the sides
  ctx.fillStyle = mix(jacket, '#0e1216', 0.22);
  for (const ax of [-7.4, 7.4]) {
    ctx.beginPath();
    ctx.ellipse(ax, 1.5, 2.4, 5, 0, 0, TAU);
    ctx.fill();
  }

  if (look.accent) {
    ctx.strokeStyle = look.accent;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, -1.5, 7, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }

  if (!hideHead) {
    // head shadow on the shoulders, then hair
    ctx.fillStyle = 'rgba(8,11,14,0.35)';
    ctx.beginPath();
    ctx.ellipse(1, -3.5, 6.6, 6.6, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.arc(0, -4, 6.1, 0, TAU);
    ctx.fill();
    // messy tufts
    ctx.strokeStyle = hair;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI * 0.15 + (i / 6) * Math.PI * 1.3 + rand(i * 3.3) * 0.3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 4.6, -4 + Math.sin(a) * 4.6);
      ctx.lineTo(Math.cos(a) * 7.6, -4 + Math.sin(a) * 7.6);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,240,214,0.16)';
    ctx.beginPath();
    ctx.ellipse(-2, -6, 3, 2.2, -0.6, 0, TAU);
    ctx.fill();
  }

  ctx.restore();

  // Held out ahead and to one side, as in the reference: the canopy clips the
  // top of the head while the coat, legs and shoes stay in view.
  if (umbrella !== undefined) {
    const fwd = umbrella * 1.0;
    const off = umbrella * 0.55;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const ux = x + off * cos + fwd * sin;
    const uy = y + off * sin - fwd * cos;
    // raised arm on the canopy side
    const sx = x + 5 * scale * cos + 2 * scale * sin;
    const sy = y + 5 * scale * sin - 2 * scale * cos;
    ctx.strokeStyle = mix(jacket, '#0e1216', 0.2);
    ctx.lineWidth = 3.4 * scale * 0.7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + (ux - sx) * 0.7, sy + (uy - sy) * 0.7);
    ctx.stroke();
    drawUmbrella(ctx, ux, uy, umbrella, spin);
  }

  // drips once they are soaked through
  if (wet > 0.35) {
    ctx.fillStyle = `rgba(${PALETTE.rain},${(wet - 0.35) * 0.5})`;
    for (let i = 0; i < 3; i++) {
      const a = rand(i * 7.7 + Math.floor(performance.now() / 120)) * TAU;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * 11 * scale, y + Math.sin(a) * 11 * scale, 1.3, 0, TAU);
      ctx.fill();
    }
  }
}

/** The hero prop: a yellow canopy seen from above. */
export function drawUmbrella(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin = 0) {
  // warm bounce light off the fabric
  const halo = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 2.1);
  halo.addColorStop(0, 'rgba(245,200,60,0.13)');
  halo.addColorStop(1, 'rgba(245,200,60,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.1, 0, TAU);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y);
  // cast shadow, offset away from the lamp
  ctx.fillStyle = 'rgba(6,9,12,0.4)';
  ctx.beginPath();
  ctx.ellipse(4, 5, r, r * 0.97, 0, 0, TAU);
  ctx.fill();
  ctx.rotate(spin);

  const gores = 8;
  // One flat canopy with a scalloped rim, then thin ribs on top — a strong
  // gore-by-gore gradient reads as a cut fruit rather than fabric.
  ctx.beginPath();
  for (let i = 0; i < gores; i++) {
    const a0 = (i / gores) * TAU - Math.PI / 2;
    const a1 = ((i + 1) / gores) * TAU - Math.PI / 2;
    const am = (a0 + a1) / 2;
    if (i === 0) ctx.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
    ctx.quadraticCurveTo(Math.cos(am) * r * 1.06, Math.sin(am) * r * 1.06, Math.cos(a1) * r, Math.sin(a1) * r);
  }
  ctx.closePath();
  ctx.fillStyle = PALETTE.umbrella;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // gentle dome shading, lamp side up-left — kept shallow so it stays fabric
  ctx.rotate(-spin);
  const dome = ctx.createLinearGradient(-r * 0.8, -r * 0.8, r * 0.8, r * 0.8);
  dome.addColorStop(0, PALETTE.umbrellaLit);
  dome.addColorStop(0.5, PALETTE.umbrella);
  dome.addColorStop(1, PALETTE.umbrellaShade);
  ctx.fillStyle = dome;
  ctx.fillRect(-r * 1.2, -r * 1.2, r * 2.4, r * 2.4);
  // wet sheen on the lit shoulder
  ctx.fillStyle = 'rgba(255,252,232,0.28)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.33, -r * 0.38, r * 0.3, r * 0.16, -0.7, 0, TAU);
  ctx.fill();
  ctx.restore();

  // ribs, clearly drawn — they are what makes the shape read as an umbrella
  ctx.strokeStyle = 'rgba(126,90,6,0.55)';
  ctx.lineWidth = Math.max(1.2, r * 0.055);
  ctx.lineCap = 'round';
  for (let i = 0; i < gores; i++) {
    const a = (i / gores) * TAU - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.14, Math.sin(a) * r * 0.14);
    ctx.lineTo(Math.cos(a) * r * 0.99, Math.sin(a) * r * 0.99);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(108,78,4,0.6)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = 0; i < gores; i++) {
    const a0 = (i / gores) * TAU - Math.PI / 2;
    const a1 = ((i + 1) / gores) * TAU - Math.PI / 2;
    const am = (a0 + a1) / 2;
    if (i === 0) ctx.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
    ctx.quadraticCurveTo(Math.cos(am) * r * 1.06, Math.sin(am) * r * 1.06, Math.cos(a1) * r, Math.sin(a1) * r);
  }
  ctx.closePath();
  ctx.stroke();

  // ferrule
  ctx.fillStyle = '#4a3a12';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.09, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,246,214,0.45)';
  ctx.beginPath();
  ctx.arc(-r * 0.03, -r * 0.03, r * 0.035, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/**
 * The sheltered circle. `strain` (0..1) is how close the follower is to falling
 * out of cover; the rim warms to amber and then to red.
 */
export function drawDryZone(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, strain = 0) {
  const pool = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
  pool.addColorStop(0, 'rgba(255,236,190,0.055)');
  pool.addColorStop(0.7, 'rgba(255,236,190,0.022)');
  pool.addColorStop(1, 'rgba(255,236,190,0)');
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();

  const rim = strain > 0.88
    ? `rgba(239,88,68,${0.30 + Math.min(1, strain) * 0.25})`
    : strain > 0.6
      ? `rgba(240,179,74,${0.16 + strain * 0.18})`
      : 'rgba(240,236,224,0.13)';
  ctx.strokeStyle = rim;
  ctx.lineWidth = strain > 0.88 ? 1.8 : 1.2;
  ctx.setLineDash([9, 9]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
}

// ── pickups, hazards, overlays ─────────────────────────────────────────────

/** A goal as a warm pool of light on the wet road, with a countdown ring. */
export function drawGoalMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  emoji: string,
  remaining: number,
  pulse: number,
  appear = 1,
) {
  const a = Math.min(1, appear);
  const r = 26 + Math.sin(pulse) * 3;
  const pool = ctx.createRadialGradient(x, y, 0, x, y, r);
  pool.addColorStop(0, `rgba(255,206,120,${0.20 * a})`);
  pool.addColorStop(1, 'rgba(255,206,120,0)');
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();

  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(16,20,22,0.45)';
  ctx.beginPath();
  ctx.arc(x, y, 13, 0, TAU);
  ctx.fill();
  ctx.font = '19px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, x, y + 0.5);
  ctx.strokeStyle = remaining < 0.3 ? 'rgba(239,88,68,0.85)' : `rgba(240,179,74,${0.7})`;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(x, y, 15, -Math.PI / 2, -Math.PI / 2 + remaining * TAU);
  ctx.stroke();
  ctx.restore();
}

/** A hazard as a wet block of street furniture rather than a red box. */
export function drawObstacle(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, emoji: string) {
  const r = 6;
  // wet reflection smeared below it
  const refl = ctx.createLinearGradient(0, y + h, 0, y + h + 22);
  refl.addColorStop(0, 'rgba(12,15,18,0.4)');
  refl.addColorStop(1, 'rgba(12,15,18,0)');
  ctx.fillStyle = refl;
  ctx.fillRect(x, y + h, w, 22);

  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  const body = ctx.createLinearGradient(x, y, x + w, y + h);
  body.addColorStop(0, '#33393f');
  body.addColorStop(1, '#22272b');
  ctx.fillStyle = body;
  ctx.fill();
  ctx.strokeStyle = 'rgba(9,11,13,0.85)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // lamp-side rim light + amber hazard edge
  ctx.strokeStyle = 'rgba(255,244,220,0.14)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + r, y + 0.8);
  ctx.lineTo(x + w - r, y + 0.8);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(240,179,74,0.5)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(x + 3, y + h - 2);
  ctx.lineTo(x + w - 3, y + h - 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.font = `${Math.min(30, Math.min(w, h) * 0.7)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, x + w / 2, y + h / 2);
  ctx.restore();
}

/** Cold vignette plus water beading on the lens as the follower soaks. */
export function drawWetOverlay(ctx: CanvasRenderingContext2D, W: number, H: number, cx: number, cy: number, wet: number) {
  if (wet <= 0.12) return;
  const g = ctx.createRadialGradient(cx, cy, W * 0.12, cx, cy, W * 0.78);
  g.addColorStop(0, 'rgba(22,50,79,0)');
  g.addColorStop(1, `rgba(22,50,79,${(wet - 0.12) * 0.68})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  if (wet > 0.45) {
    const beads = Math.floor((wet - 0.45) * 34);
    for (let i = 0; i < beads; i++) {
      const bx = rand(i * 12.9) * W;
      const by = rand(i * 4.3) * H;
      const br = 3 + rand(i * 8.1) * 6;
      const b = ctx.createRadialGradient(bx - br * 0.3, by - br * 0.3, 0, bx, by, br);
      b.addColorStop(0, 'rgba(226,240,248,0.16)');
      b.addColorStop(0.7, 'rgba(160,190,210,0.06)');
      b.addColorStop(1, 'rgba(160,190,210,0)');
      ctx.fillStyle = b;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, TAU);
      ctx.fill();
    }
  }
}

/**
 * Score on the left, wetness meter on the right — cream on wet stone.
 * `top` pushes it below any overlay chrome the page draws over the canvas.
 */
export function drawHud(ctx: CanvasRenderingContext2D, W: number, score: number, wet: number, top = 14) {
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = '500 10px Inter,sans-serif';
  ctx.fillStyle = 'rgba(240,236,224,0.45)';
  ctx.fillText('SCORE', 14, top);
  ctx.font = '600 21px Inter,sans-serif';
  ctx.fillStyle = PALETTE.cream;
  ctx.fillText(Math.round(score).toString(), 14, top + 13);

  const bw = 100, bx = W - 14 - bw, by = top + 3;
  ctx.fillStyle = 'rgba(10,13,16,0.55)';
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, 6, 3);
  ctx.fill();
  ctx.fillStyle = wet > 0.65 ? '#ef5844' : wet > 0.3 ? PALETTE.amber : '#7fb2d8';
  ctx.beginPath();
  ctx.roundRect(bx, by, Math.max(3, wet * bw), 6, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(240,236,224,0.20)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, 6, 3);
  ctx.stroke();
  ctx.font = '500 10px Inter,sans-serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(240,236,224,0.4)';
  ctx.fillText('WETNESS', W - 14, top + 13);
}

/** Centred prompt over a darkened street, used by every game's idle state. */
export function drawPrompt(ctx: CanvasRenderingContext2D, W: number, H: number, title: string, hint: string) {
  ctx.fillStyle = 'rgba(8,11,14,0.6)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '500 15px Inter,sans-serif';
  ctx.fillStyle = PALETTE.cream;
  ctx.fillText(title, W / 2, H / 2);
  ctx.font = '12px Inter,sans-serif';
  ctx.fillStyle = 'rgba(240,236,224,0.45)';
  ctx.fillText(hint, W / 2, H / 2 + 24);
}
