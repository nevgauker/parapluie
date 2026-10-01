/** Solid obstacles for the runners. */

export interface Box { x: number; y: number; w: number; h: number }
/** Where a walker is allowed to stand: the road, and the visible stretch of it. */
export interface Bounds { left: number; right: number; top: number; bottom: number }

/**
 * Where a walker of radius r has to stand to clear a box, or null if they
 * already do. Takes the shortest way out that stays inside `b`, so nobody
 * gets shoved off the bottom edge and then clamped straight back inside.
 */
export function pushOut(x: number, y: number, r: number, o: Box, b: Bounds) {
  const cx = Math.max(o.x, Math.min(x, o.x + o.w));
  const cy = Math.max(o.y, Math.min(y, o.y + o.h));
  if (Math.hypot(x - cx, y - cy) >= r) return null;
  const exits = [
    { x: o.x - r, y }, { x: o.x + o.w + r, y },
    { x, y: o.y - r }, { x, y: o.y + o.h + r },
  ].filter(p => p.x >= b.left + r && p.x <= b.right - r && p.y >= b.top && p.y <= b.bottom);
  if (!exits.length) return null;
  return exits.reduce((a, c) => Math.hypot(a.x - x, a.y - y) <= Math.hypot(c.x - x, c.y - y) ? a : c);
}
