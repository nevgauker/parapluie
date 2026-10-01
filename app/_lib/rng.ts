/**
 * Seeded random numbers. Everything that changes how a match plays (goals,
 * obstacles, hazard timing) draws from one of these, so the same seed gives
 * the same match: both rounds of a duel, and later both machines online.
 * Purely visual noise (rain, ripples, sparks) can keep using Math.random.
 */

export type Rng = () => number;

/** mulberry32: tiny, fast, and good enough for gameplay. Returns [0, 1). */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newSeed(): number {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}
