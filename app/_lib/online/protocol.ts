/**
 * The wire format between the game and the relay (relay/src/room.ts imports
 * this file too, so both sides always agree). Messages are JSON.
 *
 * The relay is deliberately thin: it seats two players, keeps the lobby,
 * picks each match's seed and start time, answers clock pings, and passes
 * game messages from one player to the other. All gameplay runs in the
 * browsers; see app/components/online/ for who decides what.
 */

/** Bumped whenever the messages below change shape; mismatched clients are turned away. */
export const PROTOCOL = 1;

export type Seat = 'p1' | 'p2';
export type OnlineMode = 'open-world' | 'runner' | 'duel';
export type CityId = 'newyork' | 'tokyo' | 'paris';

/** Room codes: four letters with nothing that reads two ways (no I, L, O, 0, 1). */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LENGTH = 4;

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, CODE_LENGTH);
}

export function isCode(code: string): boolean {
  return code.length === CODE_LENGTH && [...code].every(c => CODE_ALPHABET.includes(c));
}

export interface SeatInfo {
  name: string;
  connected: boolean;
  ready: boolean;
}

export interface RoomState {
  code: string;
  mode: OnlineMode;
  city: CityId;
  /** who sets mode and city; the first player in */
  host: Seat;
  /** who holds the umbrella (co-op), or holds it first (duel) */
  umbrella: Seat;
  seats: Partial<Record<Seat, SeatInfo>>;
  /** set while a match is running */
  match: Match | null;
}

export interface Match {
  /** every spawn in the match comes from this */
  seed: number;
  /** relay clock, ms: the 3-2-1 ends and play begins here */
  startAt: number;
  mode: OnlineMode;
  city: CityId;
  umbrella: Seat;
  /** duel: 1 or 2. co-op: always 1 */
  round: number;
  /** play time lost to finished pauses, ms */
  pausedMs: number;
  /** relay time the current pause began, or null while playing */
  pausedSince: number | null;
  /** relay time the current pause ends (after a 3-2-1), or null until someone resumes */
  resumeAt: number | null;
  /** who paused: a player, or 'net' when someone dropped */
  pausedBy: Seat | 'net' | null;
}

/** How long a resume counts down before play continues. */
export const RESUME_MS = 3_000;

/**
 * Milliseconds of actual play at relay time `now`: the match clock, which
 * stands still while paused. Both devices compute it from the same numbers,
 * so their worlds stay in step through any pause.
 */
export function playTime(match: Match, now: number): number {
  let t = now - match.startAt - match.pausedMs;
  if (match.pausedSince !== null) {
    const end = match.resumeAt === null ? now : Math.min(now, match.resumeAt);
    t -= Math.max(0, end - match.pausedSince);
  }
  return t;
}

/** Is the match clock standing still at `now`? */
export function isPaused(match: Match, now: number): boolean {
  return match.pausedSince !== null && (match.resumeAt === null || now < match.resumeAt);
}

// ── client → relay ─────────────────────────────────────────────────────────

export type ClientMsg =
  | { t: 'ping'; c: number }
  | { t: 'name'; name: string }
  /** host only */
  | { t: 'settings'; mode?: OnlineMode; city?: CityId }
  | { t: 'swap' }
  | { t: 'ready'; ready: boolean }
  /** either player may pause or resume a running match */
  | { t: 'pause'; paused: boolean }
  /** the match on this client is over (both send it; the relay clears the match) */
  | { t: 'over' }
  /** passed through to the other player untouched */
  | { t: 'relay'; m: GameMsg };

// ── relay → client ─────────────────────────────────────────────────────────

export type ServerMsg =
  | { t: 'welcome'; seat: Seat; room: RoomState; now: number }
  | { t: 'room'; room: RoomState }
  | { t: 'pong'; c: number; s: number }
  | { t: 'start'; match: Match }
  | { t: 'relay'; m: GameMsg }
  | { t: 'error'; code: 'full' | 'version' | 'bad-code' | 'missing'; message: string };

// ── between the two players, via the relay ────────────────────────────────

/** A walker's state, sent about 20 times a second by the device that steers it. */
export interface WalkerSnap {
  /** relay clock, ms */
  at: number;
  x: number; y: number;
  vx: number; vy: number;
  angle: number;
}

export type GameMsg =
  /** my walker, plus whatever this device is the authority for */
  | { k: 'snap'; w: WalkerSnap; follower?: FollowerReport; score?: number }
  /** I touched this goal (sent to the goal authority, the umbrella's device) */
  | { k: 'claim'; id: number; by: Seat; at: number }
  /** the goal authority's verdict, sent to both */
  | { k: 'collected'; id: number; by: Seat; pts: number; together: boolean }
  /** goals spawned by the authority (open square modes; the runner spawns in lockstep) */
  | { k: 'goals'; spawn: NetGoal[] }
  /**
   * The follower's device ends the round: soaked, or home dry when the duel
   * clock runs out. It carries the follower's final points; the umbrella's
   * device answers with 'final'.
   */
  | { k: 'round-end'; end: 'soaked' | 'home'; fScore: number; time: number }
  | { k: 'final'; wScore: number }
  /** a wordless call: the umbrella rings, the follower shouts "Attends !" */
  | { k: 'ping-call'; by: Seat };

/** What only the follower's device knows: it decides cover, wetness and the streak. */
export interface FollowerReport {
  wet: number;
  mult: number;
  /** relay time the follower was last under cover, for the together grace */
  coveredAt: number;
  /** follower's own points so far: close calls and cover */
  pts: number;
}

export interface NetGoal {
  id: number;
  x: number; y: number;
  emoji: string; pts: number; dur: number; pause: number; label: string;
  /** match play time (see playTime) it appeared, ms; it fades at born + dur seconds */
  born: number;
}
