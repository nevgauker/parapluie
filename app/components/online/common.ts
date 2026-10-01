/**
 * Bits both online games share. Online, each device has one player, so the
 * whole keyboard (WASD and arrows) and any gamepad steer that one walker.
 */

import { WASD, ARROWS, pads, readStick, strongest, type Stick } from '../../_lib/input';
import { isPaused, playTime, type Match, type RoomState, type Seat } from '../../_lib/online/protocol';

/** Keys, the first gamepad, or the on-screen thumbstick: whichever is pushed hardest. */
export function onlineStick(keys: Record<string, boolean>, touch: Stick): Stick {
  return strongest(readStick(keys, WASD, pads()[0]), readStick(keys, ARROWS), touch);
}

/** What a finished round hands back to the lobby. */
export interface OnlineResult {
  mode: Match['mode'];
  round: number;
  umbrella: Seat;
  /** how it ended; 'left' when a partner never came back */
  end: 'soaked' | 'home' | 'left';
  /** the umbrella's points and the follower's */
  wScore: number;
  fScore: number;
  /** seconds played */
  time: number;
  city: Match['city'];
}

/** After this long without a snapshot, the partner's connection reads as shaky. */
export const SHAKY_MS = 600;
/** How long to wait for a dropped partner before offering to end the match. */
export const GIVE_UP_MS = { coop: 30_000, duel: 20_000 };

/**
 * What to say over a frozen or counting-down game, or null while playing.
 * `partner` is the other player's name.
 */
export function overlayText(match: Match, room: RoomState | null, me: Seat, partner: string, now: number):
  { title: string; hint: string } | null {
  const t = playTime(match, now);
  if (t < 0) return { title: String(Math.ceil(-t / 1000)), hint: 'get ready' };
  if (!match.pausedSince) return null;
  const otherSeat: Seat = me === 'p1' ? 'p2' : 'p1';
  const gone = room && !room.seats[otherSeat]?.connected;
  if (isPaused(match, now)) {
    if (match.resumeAt !== null) return { title: String(Math.ceil((match.resumeAt - now) / 1000)), hint: 'resuming' };
    if (match.pausedBy === 'net' || gone) {
      const secs = Math.floor((now - match.pausedSince) / 1000);
      return { title: `Waiting for ${partner}…`, hint: `reconnecting · ${secs}s` };
    }
    const who = match.pausedBy === me ? 'you' : partner;
    return { title: 'paused', hint: `paused by ${who} · Esc, P or Start to resume` };
  }
  return null;
}
