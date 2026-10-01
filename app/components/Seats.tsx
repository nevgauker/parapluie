'use client';
import { useEffect, useRef, useState } from 'react';
import { pads, PAD_A, PAD_START } from '../_lib/input';
import { PLAYERS, PLAYER_IDS, type Player } from '../_lib/players';
import { claimPad, claimedPad } from '../_lib/seats';

type Device = 'keys' | 'pad' | null;

/**
 * Two seats on a two-player menu. Press your keys, or a button on a gamepad,
 * to sit down: the seat lights up in your colour and shows what you're using.
 * The first gamepad pressed becomes P1's, the next P2's, whatever order they
 * were plugged in. Once a pad is seated, A or Start on it calls `onStart`.
 *
 * Seating is optional: the menu's start button works with empty seats.
 */
export default function Seats({ onStart }: { onStart: () => void }) {
  // only ever rendered client-side (the games load with ssr: false), so navigator is there
  const [touch] = useState(() => navigator.maxTouchPoints > 0);
  // pads claimed on an earlier menu are still seated
  const [seated, setSeated] = useState<Record<Player, Device>>(() => ({
    p1: claimedPad('p1') !== null ? 'pad' : null,
    p2: claimedPad('p2') !== null ? 'pad' : null,
  }));
  // the latest onStart, without re-subscribing (and forgetting held buttons) every render
  const startRef = useRef(onStart);
  useEffect(() => { startRef.current = onStart; });

  useEffect(() => {
    // who is sitting where, readable from the polling loop
    const now: Record<Player, Device> = {
      p1: claimedPad('p1') !== null ? 'pad' : null,
      p2: claimedPad('p2') !== null ? 'pad' : null,
    };
    const sit = (p: Player, d: Device) => { now[p] = d; setSeated({ ...now }); };

    const onKey = (e: KeyboardEvent) => {
      for (const p of PLAYER_IDS) {
        if (!now[p] && PLAYERS[p].keys.some(k => k === e.key || k.toUpperCase() === e.key)) sit(p, 'keys');
      }
    };
    window.addEventListener('keydown', onKey);

    // Gamepads have no events worth relying on: poll, and act on button-down edges.
    const held = new Map<number, boolean>();
    let raf = 0;
    const poll = () => {
      for (const pad of pads()) {
        const down = pad.buttons.some(b => b.pressed);
        if (down && !held.get(pad.index)) {
          const owner = PLAYER_IDS.find(p => claimedPad(p) === pad.index);
          if (owner) {
            if (pad.buttons[PAD_A]?.pressed || pad.buttons[PAD_START]?.pressed) startRef.current();
          } else {
            // an empty seat first; failing that, someone on keys picks the pad up
            const free = PLAYER_IDS.find(p => !now[p]) ?? PLAYER_IDS.find(p => claimedPad(p) === null);
            if (free) {
              claimPad(free, pad.index);
              sit(free, 'pad');
            }
          }
        }
        held.set(pad.index, down);
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);

    return () => {
      window.removeEventListener('keydown', onKey);
      cancelAnimationFrame(raf);
    };
  }, []);

  const status = (p: Player) => {
    const info = PLAYERS[p];
    if (touch) return `${info.padSide} D-pad`;
    if (seated[p] === 'pad') return '🎮 gamepad · A to start';
    if (seated[p] === 'keys') return `⌨ ${info.keyLabel}`;
    return `press ${info.keyLabel === 'WASD' ? 'W' : '↑'} or A on a pad`;
  };

  return (
    <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }} aria-live="polite">
      {PLAYER_IDS.map(p => {
        const info = PLAYERS[p];
        const on = touch || !!seated[p];
        return (
          <div key={p} style={{
            minWidth: 140, padding: '12px 16px', borderRadius: 12, textAlign: 'center',
            border: `1px solid ${on ? info.color : 'rgba(240,236,224,0.15)'}`,
            background: on ? `rgba(${info.rgb},0.12)` : 'rgba(240,236,224,0.03)',
            transition: 'background .2s, border-color .2s',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: info.color, marginBottom: 4 }}>{info.shape} {info.name}</div>
            <div style={{ fontSize: 11, color: on ? 'rgba(240,236,224,0.75)' : 'rgba(240,236,224,0.45)' }}>{status(p)}</div>
          </div>
        );
      })}
    </div>
  );
}
