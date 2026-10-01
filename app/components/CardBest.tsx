'use client';
import { useSyncExternalStore } from 'react';
import { topBest, type BestMode } from '../_lib/bests';

// another tab finishing a run updates the card through the storage event
const subscribe = (cb: () => void) => {
  window.addEventListener('storage', cb);
  return () => window.removeEventListener('storage', cb);
};

/** "BEST 1240" on a homepage mode card, once there is one. Nothing on the server. */
export default function CardBest({ mode }: { mode: BestMode }) {
  const best = useSyncExternalStore(subscribe, () => topBest(mode), () => null);
  if (best === null) return null;
  return (
    <div style={{ fontSize: 8, fontFamily: 'var(--pixel)', color: 'var(--umbrella)', marginTop: 6, letterSpacing: 1, textAlign: 'right' }}>
      BEST {best}
    </div>
  );
}
