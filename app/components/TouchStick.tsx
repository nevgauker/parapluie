'use client';
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { Stick } from '../_lib/input';

/** How far the thumb travels from where it landed to full speed, px. */
const RADIUS = 56;
/** Thumb wobble near the centre reads as resting, like a gamepad's deadzone. */
const DEADZONE = 0.12;

export interface TouchButton { label: string; aria: string; onPress: () => void }

/**
 * A floating thumbstick: put a thumb down anywhere in the zone and the stick
 * appears under it; push to walk, further to go faster; lift to stop. It
 * writes the same kind of value a gamepad stick gives (`stickRef`), so touch
 * players move exactly like keyboard and pad players.
 *
 * It listens on its parent element rather than covering it, so mouse clicks
 * and taps on buttons still reach what's underneath, and it only draws itself
 * once the device has actually been touched.
 */
export default function TouchStick({ stickRef, zone = 'all', color = '#f0ece0', hint = 'drag to walk', buttons = [] }: {
  stickRef: MutableRefObject<Stick>;
  /** which part of the parent starts this stick: all of it, or its left or right half */
  zone?: 'all' | 'left' | 'right';
  color?: string;
  hint?: string;
  buttons?: TouchButton[];
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [drag, setDrag] = useState<{ ox: number; oy: number; kx: number; ky: number } | null>(null);

  useEffect(() => {
    const layer = layerRef.current;
    const host = layer?.parentElement;
    if (!layer || !host) return;
    let pointer: number | null = null;
    let origin = { x: 0, y: 0 };

    const local = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width };
    };
    const inZone = (x: number, w: number) => zone === 'all' || (zone === 'left' ? x < w / 2 : x >= w / 2);

    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || pointer !== null) return;
      // taps on menu buttons and fields are theirs, not the stick's
      if ((e.target as Element).closest('button, a, input, select, textarea')) return;
      const p = local(e);
      if (!inZone(p.x, p.w)) return;
      setShown(true);
      pointer = e.pointerId;
      origin = { x: p.x, y: p.y };
      host.setPointerCapture?.(e.pointerId);
      setDrag({ ox: p.x, oy: p.y, kx: p.x, ky: p.y });
      stickRef.current = { x: 0, y: 0 };
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      const p = local(e);
      let dx = p.x - origin.x, dy = p.y - origin.y;
      const len = Math.hypot(dx, dy);
      if (len > RADIUS) { dx *= RADIUS / len; dy *= RADIUS / len; }
      setDrag({ ox: origin.x, oy: origin.y, kx: origin.x + dx, ky: origin.y + dy });
      const m = Math.min(1, len / RADIUS);
      if (m < DEADZONE) { stickRef.current = { x: 0, y: 0 }; return; }
      const k = (m - DEADZONE) / (1 - DEADZONE) / (Math.hypot(dx, dy) || 1);
      stickRef.current = { x: dx * k, y: dy * k };
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      pointer = null;
      stickRef.current = { x: 0, y: 0 };
      setDrag(null);
    };

    host.addEventListener('pointerdown', down);
    host.addEventListener('pointermove', move);
    host.addEventListener('pointerup', up);
    host.addEventListener('pointercancel', up);
    return () => {
      host.removeEventListener('pointerdown', down);
      host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerup', up);
      host.removeEventListener('pointercancel', up);
      stickRef.current = { x: 0, y: 0 };
    };
  }, [stickRef, zone]);

  const ring = (x: number, y: number, r: number, style: React.CSSProperties) => (
    <div style={{ position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: '50%', ...style }} />
  );

  return (
    <div ref={layerRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 30 }}>
      {shown && !drag && (
        // a resting stick in the zone's corner, so it's clear what to do
        <div style={{
          position: 'absolute', bottom: 'calc(28px + env(safe-area-inset-bottom))',
          ...(zone === 'right' ? { right: 28 } : { left: 28 }),
          width: RADIUS * 2, height: RADIUS * 2, borderRadius: '50%',
          border: `1.5px dashed ${color}`, opacity: 0.35,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, color, textAlign: 'center',
        }}>{hint}</div>
      )}
      {drag && (
        <>
          {ring(drag.ox, drag.oy, RADIUS, { border: `2px solid ${color}`, opacity: 0.35, background: 'rgba(0,0,0,0.15)' })}
          {ring(drag.kx, drag.ky, 24, { background: color, opacity: 0.55 })}
        </>
      )}
      {shown && buttons.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 'calc(28px + env(safe-area-inset-bottom))',
          ...(zone === 'left' ? { left: 28 } : { right: 28 }),
          display: 'flex', flexDirection: 'column', gap: 12, pointerEvents: 'auto',
        }}>
          {buttons.map(b => (
            <button
              key={b.label}
              aria-label={b.aria}
              onPointerDown={e => { e.stopPropagation(); b.onPress(); }}
              style={{
                width: 56, height: 56, borderRadius: '50%', border: '1px solid rgba(240,236,224,0.35)',
                background: 'rgba(16,20,22,0.55)', color: '#f0ece0', fontSize: 20, touchAction: 'none',
              }}
            >{b.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
