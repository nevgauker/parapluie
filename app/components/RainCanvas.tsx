'use client';
import { useEffect, useRef } from 'react';

interface Drop {
  x: number; y: number; len: number; spd: number; a: number;
}

export default function RainCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    let W = 0, H = 0, raf = 0;
    const drops: Drop[] = [];

    function resize() {
      W = canvas!.width  = window.innerWidth;
      H = canvas!.height = window.innerHeight;
      drops.length = 0;
      for (let i = 0; i < 160; i++) drops.push(newDrop(true));
    }

    function newDrop(anywhere = false): Drop {
      return {
        x: Math.random() * W,
        y: anywhere ? Math.random() * H : -20,
        len: 10 + Math.random() * 16,
        spd: 4 + Math.random() * 4,
        a: 0.06 + Math.random() * 0.1,
      };
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.lineCap = 'round';
      for (const d of drops) {
        d.y += d.spd;
        if (d.y > H + d.len) Object.assign(d, newDrop());
        ctx.strokeStyle = `rgba(55, 138, 221, ${d.a})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - 2, d.y + d.len);
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    }

    resize();
    draw();
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  return (
    <canvas
      ref={ref}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 0.55 }}
    />
  );
}
