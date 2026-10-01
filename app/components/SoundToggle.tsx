'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { sound } from '../_lib/sound';

const subscribe = (cb: () => void) => sound.onMute(cb);
const mutedNow = () => sound.isMuted;
const mutedOnServer = () => false;

/** 🔊 / 🔇 in a game page's header. M toggles it too; the choice is remembered. */
export default function SoundToggle() {
  const muted = useSyncExternalStore(subscribe, mutedNow, mutedOnServer);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'm' || e.key === 'M') && !(e.target as Element).closest('input, textarea')) sound.setMuted(!sound.isMuted);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <button
      onClick={() => sound.setMuted(!muted)}
      aria-label={muted ? 'Sound off. Turn sound on (M)' : 'Sound on. Turn sound off (M)'}
      aria-pressed={!muted}
      title={muted ? 'Sound off (M)' : 'Sound on (M)'}
      style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, padding: '2px 6px', lineHeight: 1, opacity: muted ? 0.5 : 0.85 }}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}
