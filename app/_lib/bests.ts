/**
 * Best scores, kept in this browser. One per mode, way of playing and (for
 * the runner) city, so a Paris best isn't buried under easier New York runs.
 * The duel keeps none: it's a contest between two people, not a score.
 */

import type { CityId } from './cities';

export type BestMode = 'open' | 'runner';
export type BestPlay = 'solo' | 'local' | 'online';

export interface Best { score: number; time: number; at: number }
export interface BestResult { best: Best; previous: Best | null; isNew: boolean }

const PREFIX = 'parapluie:best:';

export function bestKey(mode: BestMode, play: BestPlay, city?: CityId): string {
  return mode === 'runner' ? `${mode}-${play}-${city ?? 'newyork'}` : `${mode}-${play}`;
}

export function readBest(key: string): Best | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as Best) : null;
  } catch {
    return null;
  }
}

/** Compare a finished run with the best so far, and keep it if it beats it. */
export function recordBest(key: string, score: number, time: number): BestResult {
  const previous = readBest(key);
  const isNew = score > 0 && (!previous || score > previous.score);
  const best = isNew ? { score, time, at: Date.now() } : previous ?? { score, time, at: Date.now() };
  if (isNew) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(best)); } catch { /* not kept; still shown */ }
  }
  return { best, previous, isNew };
}

/** The highest best in a mode, across every way of playing and city: for the homepage. */
export function topBest(mode: BestMode): number | null {
  let top: number | null = null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(`${PREFIX}${mode}-`)) continue;
      const b = readBest(k.slice(PREFIX.length));
      if (b && (top === null || b.score > top)) top = b.score;
    }
  } catch { /* storage blocked: no bests to show */ }
  return top;
}
