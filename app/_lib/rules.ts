/**
 * Rules shared by the two-player modes on the open square (co-op open world
 * and the duel), so moving between them, and later between local and online,
 * never changes the game underneath.
 */

/** The square is a fixed logical size, letterboxed on screen, so every device plays the same arena. */
export const SQUARE_W = 480;
export const SQUARE_H = 620;
/** Pavement strip either side of the square. */
export const SQUARE_INSET = 58;

/** How far the follower can stray before the rain reaches them. */
export const SQUARE_COVER_R = 76;

/**
 * A goal counts as collected together if the follower was under cover at any
 * point this recently, so a follower crossing the rim at the wrong instant,
 * or a little network lag later, doesn't cost the umbrella half the points.
 */
export const TOGETHER_GRACE = 0.3;
/** Goals collected with the follower out in the rain pay this share. */
export const ALONE_SHARE = 0.5;

export interface SquareGoalType { emoji: string; pts: number; dur: number; pause: number; label: string }

export const SQUARE_GOALS: readonly SquareGoalType[] = [
  { emoji: '🐕', pts: 120, dur: 9,  pause: 2.0, label: 'pet the dog'   },
  { emoji: '🍊', pts: 80,  dur: 7,  pause: 1.5, label: 'fruit stand'   },
  { emoji: '🌸', pts: 60,  dur: 11, pause: 1.0, label: 'flower shop'   },
  { emoji: '☕', pts: 70,  dur: 9,  pause: 2.0, label: 'coffee stop'   },
  { emoji: '🚌', pts: 150, dur: 5,  pause: 0.5, label: 'catch the bus' },
  { emoji: '📬', pts: 50,  dur: 12, pause: 1.5, label: 'post a letter' },
  { emoji: '🐈', pts: 90,  dur: 8,  pause: 1.8, label: 'pet the cat'   },
  { emoji: '🎵', pts: 80,  dur: 7,  pause: 1.2, label: 'street music'  },
];

/**
 * Where to put the next goal: three candidate spots are always drawn, and the
 * first one far enough from `avoid` wins. Drawing a fixed count keeps the
 * random stream in step whatever the players do, so the n-th goal of a seed
 * is the same goal every time.
 */
export function pickGoalSpot(rng: () => number, avoid: { x: number; y: number }, minDist: number) {
  const spots = [0, 1, 2].map(() => ({
    x: 60 + rng() * (SQUARE_W - 120),
    y: 70 + rng() * (SQUARE_H - 140),
  }));
  return spots.find(s => Math.hypot(s.x - avoid.x, s.y - avoid.y) >= minDist) ?? spots[0];
}
