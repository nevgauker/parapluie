/**
 * The partner's walker, drawn a little in the past so there are always two
 * real snapshots to blend between. Snapshots arrive about every 50 ms;
 * drawing 100 ms behind rides out a late one without the partner stuttering.
 */

import type { WalkerSnap } from './protocol';

export const SNAP_EVERY_MS = 50;
export const INTERP_DELAY_MS = 100;
/** Past the newest snapshot, keep sliding along its velocity for at most this long. */
const MAX_EXTRAPOLATE_MS = 150;

export class SnapBuffer {
  private snaps: WalkerSnap[] = [];

  push(s: WalkerSnap) {
    // out-of-order arrivals are dropped; WebSockets keep order, but be safe
    const last = this.snaps[this.snaps.length - 1];
    if (last && s.at <= last.at) return;
    this.snaps.push(s);
    if (this.snaps.length > 30) this.snaps.shift();
  }

  get latest(): WalkerSnap | undefined {
    return this.snaps[this.snaps.length - 1];
  }

  /** Where the partner was at relay time `at`. */
  sample(at: number): { x: number; y: number; angle: number } | null {
    const s = this.snaps;
    if (!s.length) return null;
    if (at <= s[0].at) return s[0];
    for (let i = s.length - 1; i > 0; i--) {
      const a = s[i - 1], b = s[i];
      if (at >= a.at && at <= b.at) {
        const k = (at - a.at) / Math.max(1, b.at - a.at);
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, angle: lerpAngle(a.angle, b.angle, k) };
      }
    }
    const last = s[s.length - 1];
    // velocities are per 60 Hz frame; ahead of the newest snapshot, coast briefly
    const ahead = Math.min(at - last.at, MAX_EXTRAPOLATE_MS) / (1000 / 60);
    return { x: last.x + last.vx * ahead, y: last.y + last.vy * ahead, angle: last.angle };
  }
}

function lerpAngle(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}
