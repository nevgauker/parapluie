/**
 * How a mode is being played, carried in the URL as ?play=. Online joins
 * this list in a later phase.
 */
export type Play = 'solo' | 'local';

export function parsePlay(v: string | string[] | undefined): Play | undefined {
  return v === 'solo' || v === 'local' ? v : undefined;
}

/** The label in a mode page's header, e.g. SAME SCREEN. */
export function playLabel(play: Play | undefined, fallback: string): string {
  return play === 'solo' ? 'SOLO' : play === 'local' ? 'SAME SCREEN' : fallback;
}
