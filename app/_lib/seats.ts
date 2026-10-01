/**
 * Which gamepad belongs to which player. A pad is claimed by pressing one of
 * its buttons on a seats screen; until then, unclaimed pads fall to the
 * players in the order they connected. Claims live for the page session, so
 * they carry from the menu into the game and across rematches.
 */

import { pads } from './input';
import type { Player } from './players';

/** Gamepad.index per player, once claimed. */
const claimed: Record<Player, number | null> = { p1: null, p2: null };

export function claimPad(p: Player, index: number) {
  // a pad belongs to one player at a time
  for (const q of ['p1', 'p2'] as Player[]) if (claimed[q] === index) claimed[q] = null;
  claimed[p] = index;
}

export function claimedPad(p: Player): number | null {
  return claimed[p];
}

/** The pad a player steers with: their claimed one, else the next unclaimed pad in connection order. */
export function padFor(p: Player): Gamepad | undefined {
  const all = pads();
  const mine = claimed[p];
  if (mine !== null) return all.find(g => g.index === mine);
  const free = all.filter(g => g.index !== claimed.p1 && g.index !== claimed.p2);
  const otherHasClaim = claimed[p === 'p1' ? 'p2' : 'p1'] !== null;
  // with no claims at all, P1 takes the first free pad and P2 the second
  return free[p === 'p1' || otherHasClaim ? 0 : 1];
}
