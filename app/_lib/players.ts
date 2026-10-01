/**
 * Who P1 and P2 are, in one place: colour, shape, keys, and how to describe
 * their controls. Shape as well as colour, so the players stay apart for
 * colour-blind eyes (the green and orange drift together for deuteranopes).
 */

import { WASD, ARROWS, type KeySet } from './input';

export type Player = 'p1' | 'p2';

export interface PlayerInfo {
  name: string;
  /** ● or ◆, drawn next to the name everywhere the player is labelled. */
  shape: string;
  color: string;
  /** colour as "r,g,b" for canvas rgba() */
  rgb: string;
  keys: KeySet;
  keyLabel: string;
  /** which side of the screen their touch D-pad sits on */
  padSide: 'left' | 'right';
}

export const PLAYERS: Record<Player, PlayerInfo> = {
  p1: { name: 'P1', shape: '●', color: '#7cc24f', rgb: '124,194,79', keys: WASD, keyLabel: 'WASD', padSide: 'left' },
  p2: { name: 'P2', shape: '◆', color: '#e08a3c', rgb: '224,138,60', keys: ARROWS, keyLabel: 'arrows', padSide: 'right' },
};

export const PLAYER_IDS: Player[] = ['p1', 'p2'];
export const other = (p: Player): Player => (p === 'p1' ? 'p2' : 'p1');

/** "● P1" */
export const tag = (p: Player) => `${PLAYERS[p].shape} ${PLAYERS[p].name}`;

/** One player's controls, e.g. "● P1: WASD or a gamepad". */
export function controlsLine(p: Player, touch = false) {
  const info = PLAYERS[p];
  return touch ? `${tag(p)}: ${info.padSide} D-pad` : `${tag(p)}: ${info.keyLabel} or a gamepad`;
}

/** Both players' controls on one line. */
export function controlsText(touch = false) {
  return `${controlsLine('p1', touch)} · ${controlsLine('p2', touch)}`;
}

/** Draw a player's tag above a walker on a canvas: bigger and opaque so it reads at a glance. */
export function drawTag(ctx: CanvasRenderingContext2D, p: Player, x: number, y: number) {
  ctx.save();
  ctx.font = '600 11px Inter,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(10,13,16,0.65)';
  ctx.strokeText(tag(p), x, y);
  ctx.fillStyle = PLAYERS[p].color;
  ctx.fillText(tag(p), x, y);
  ctx.restore();
}
