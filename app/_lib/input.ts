/**
 * Player input as an analog stick, from the keyboard or a gamepad.
 *
 * Keys come from a shared held-keys map, which the touch D-pads also write
 * to. Gamepads come from the Gamepad API, which has no move events and has
 * to be polled every frame. Pads are assigned in the order they connected:
 * the first is P1, the second P2.
 */

export interface Stick { x: number; y: number }
export type KeySet = readonly [left: string, right: string, up: string, down: string];

export const WASD: KeySet = ['a', 'd', 'w', 's'];
export const ARROWS: KeySet = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

/** Stick tilt below this is treated as resting; cheap pads drift. */
const DEADZONE = 0.18;
const STILL: Stick = { x: 0, y: 0 };

export function pads(): Gamepad[] {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
  return [...navigator.getGamepads()].filter((p): p is Gamepad => !!p && p.connected);
}

function keyStick(keys: Record<string, boolean>, set: KeySet): Stick {
  const held = (k: string) => !!(keys[k] || keys[k.toUpperCase()]);
  const x = (held(set[1]) ? 1 : 0) - (held(set[0]) ? 1 : 0);
  const y = (held(set[3]) ? 1 : 0) - (held(set[2]) ? 1 : 0);
  // diagonals are no faster than straight lines
  const m = Math.hypot(x, y);
  return m > 1 ? { x: x / m, y: y / m } : { x, y };
}

function padStick(pad: Gamepad | undefined): Stick {
  if (!pad) return STILL;
  // The d-pad (standard mapping buttons 12-15) wins over the left stick.
  const b = (i: number) => !!pad.buttons[i]?.pressed;
  let x = (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
  let y = (b(13) ? 1 : 0) - (b(12) ? 1 : 0);
  if (!x && !y) { x = pad.axes[0] ?? 0; y = pad.axes[1] ?? 0; }
  const m = Math.hypot(x, y);
  if (m < DEADZONE) return STILL;
  // rescale past the deadzone so a light tilt still starts from zero
  const k = Math.min(1, (m - DEADZONE) / (1 - DEADZONE)) / m;
  return { x: x * k, y: y * k };
}

/** A player's input: whichever of their keys or their pad is pushed harder. */
export function readStick(keys: Record<string, boolean>, set: KeySet, pad?: Gamepad): Stick {
  const k = keyStick(keys, set), p = padStick(pad);
  return Math.hypot(p.x, p.y) > Math.hypot(k.x, k.y) ? p : k;
}

/** Standard-mapping button numbers. */
export const PAD_A = 0;
export const PAD_START = 9;

/**
 * A detector for "one of these buttons was just pressed on any pad" (A or
 * Start by default). Call it once per frame; it is true only on the frame
 * the button goes down.
 */
export function padPress(buttons: number[] = [PAD_A, PAD_START]): () => boolean {
  let was = false;
  return () => {
    const now = pads().some(p => buttons.some(b => p.buttons[b]?.pressed));
    const edge = now && !was;
    was = now;
    return edge;
  };
}
