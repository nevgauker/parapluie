/**
 * Scoring for how well the follower plays the edge of the umbrella.
 *
 * Staying dry builds a multiplier; skimming the rim of the dry zone pays a
 * close-call bonus. Hugging her is safe but slow, the rim is where points are.
 */

import { PALETTE, type FloatText } from './street';

/** Inner edge of the close-call band, as a share of the cover radius. */
export const EDGE_BAND = 0.75;
/** Points per second spent in the band, before difficulty and multiplier. */
export const EDGE_PTS = 20;
/** Seconds of unbroken cover per multiplier step. */
export const STREAK_STEP = 5;
export const STREAK_MAX = 4;
/**
 * Seconds outside cover before the streak breaks. A follower clipping the rim
 * for a frame keeps it, and so will a follower whose partner is a few frames
 * stale over a network.
 */
export const STREAK_GRACE = 0.25;

export interface DryStreak { dryTime: number; edgeTime: number; mult: number; outTime: number }

export type StreakEvent =
  | { kind: 'close'; pts: number }
  | { kind: 'up'; mult: number }
  | { kind: 'lost'; mult: number };

export function newDryStreak(): DryStreak {
  return { dryTime: 0, edgeTime: 0, mult: 1, outTime: 0 };
}

/**
 * Advance the streak by dt seconds. `sep` is the follower's distance from her.
 * Returns the close-call points earned and anything worth calling out.
 */
export function tickDryStreak(s: DryStreak, sep: number, coverR: number, dt: number, difficulty: number) {
  const events: StreakEvent[] = [];
  let pts = 0;

  if (sep > coverR) {
    s.outTime += dt;
    s.edgeTime = 0;
    if (s.outTime < STREAK_GRACE) return { pts, events };
    if (s.mult > 1) events.push({ kind: 'lost', mult: s.mult });
    s.dryTime = 0; s.mult = 1;
    return { pts, events };
  }
  s.outTime = 0;

  s.dryTime += dt;
  const mult = Math.min(STREAK_MAX, 1 + Math.floor(s.dryTime / STREAK_STEP));
  if (mult > s.mult) events.push({ kind: 'up', mult });
  s.mult = mult;

  if (sep > coverR * EDGE_BAND) {
    s.edgeTime += dt;
    if (s.edgeTime >= 1) {
      s.edgeTime -= 1;
      pts = Math.round(EDGE_PTS * difficulty * s.mult);
      events.push({ kind: 'close', pts });
    }
  }
  return { pts, events };
}

/** Turn streak events into callouts floating up from the follower at (x, y). */
export function streakCallouts(events: StreakEvent[], x: number, y: number): FloatText[] {
  return events.map((e, i) => {
    const at = { x, y: y - 22 - i * 14, life: 1 };
    if (e.kind === 'close') return { ...at, text: `+${e.pts} close!`, color: PALETTE.amber };
    if (e.kind === 'up') return { ...at, text: `x${e.mult} DRY`, color: PALETTE.umbrellaLit };
    return { ...at, text: `x${e.mult} streak lost`, color: '#ef5844' };
  });
}
