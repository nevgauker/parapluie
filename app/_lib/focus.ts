/**
 * Losing focus mid-game: alt-tab, a notification, a phone locking. The
 * browser never sends the keyup for keys held at that moment, so walkers
 * kept running; and the round played on unattended. This clears held keys
 * and tells the game to pause.
 *
 * @returns a cleanup function that removes the listeners
 */
export function watchFocus(keys: Record<string, boolean>, onAway: () => void): () => void {
  const away = () => {
    for (const k of Object.keys(keys)) keys[k] = false;
    onAway();
  };
  const onVisibility = () => { if (document.hidden) away(); };
  window.addEventListener('blur', away);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    window.removeEventListener('blur', away);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

/** Keys that pause or resume a round. */
export const PAUSE_KEYS = ['Escape', 'p', 'P'];
