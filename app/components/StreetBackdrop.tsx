'use client';
import { useEffect, useRef } from 'react';
import {
  PALETTE, drawGround, drawProps, drawRainField, drawRipples, tickRipples, drawWalker,
  walkWidth,
  type StreetView, type DryZone, type Ripple, type RainDrop,
} from '../_lib/street';

/**
 * The hero background: the same street the games are played on, scrolling by
 * with the two figures walking up it. Purely decorative — no input, no state.
 */
export default function StreetBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let W = 0, H = 0, raf = 0, last = 0, t = 0, worldY = 0;
    let drops: RainDrop[] = [];
    const ripples: Ripple[] = [];

    const roadW = () => Math.max(220, Math.min(360, W * 0.34));
    const edges = () => { const w = roadW(); return { left: (W - w) / 2, right: (W + w) / 2 }; };
    const project = (y: number) => y - worldY + H / 2;

    function resize() {
      W = canvas!.width = window.innerWidth;
      H = canvas!.height = window.innerHeight;
      drops = Array.from({ length: 150 }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        len: 10 + Math.random() * 16,
        spd: 4 + Math.random() * 4,
        a: 0.06 + Math.random() * 0.1,
      }));
    }

    // Two figures strolling up the middle, the leader weaving a little.
    const COVER_R = 96;
    let wx = 0, fx = 0;

    function frame(ts: number) {
      const dt = Math.min((ts - last) / 1000, 0.05);
      last = ts;
      t += dt;
      worldY -= 34 * dt;

      const { left, right } = edges();
      const mid = (left + right) / 2;
      wx = mid + Math.sin(t * 0.34) * (right - left) * 0.17;
      fx = mid + Math.sin(t * 0.34 - 0.9) * (right - left) * 0.2;
      const wy = worldY - H * 0.06;
      const fy = worldY + H * 0.06;

      for (const d of drops) {
        d.y += d.spd;
        if (d.y > H + d.len) { d.y = -d.len; d.x = Math.random() * W; }
      }
      tickRipples(ripples, dt, 9, () => ({
        x: left + Math.random() * (right - left),
        y: worldY - H / 2 + Math.random() * H,
      }));

      const view: StreetView = {
        W, H, left, right, scroll: -worldY, walk: walkWidth(W, right - left),
      };
      const wScreenY = project(wy);
      const dry: DryZone[] = [{ x: wx, y: wScreenY, r: COVER_R }];

      ctx.clearRect(0, 0, W, H);
      drawGround(ctx, view);
      drawProps(ctx, view, worldY, t);
      drawRipples(ctx, ripples, project, dry);
      drawWalker(ctx, fx, project(fy), { jacket: PALETTE.jacketOlive }, {
        phase: t * 5.2, wet: 0.15,
      });
      drawWalker(ctx, wx, wScreenY, { jacket: PALETTE.jacketBlue }, {
        phase: t * 5.2 + 1.4, umbrella: 30, spin: Math.sin(t * 0.7) * 0.05,
      });
      drawRainField(ctx, drops, H, undefined, dry);

      if (!reduceMotion) raf = requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener('resize', resize);
    last = performance.now();
    raf = requestAnimationFrame(frame);

    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  return (
    <>
      <canvas ref={ref} className="absolute inset-0 w-full h-full pointer-events-none" />
      {/* Scrim so the hero type stays legible over the street. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(60% 50% at 50% 45%, rgba(20,24,28,0.88), rgba(20,24,28,0.55) 60%, rgba(20,24,28,0.85))',
        }}
      />
    </>
  );
}
