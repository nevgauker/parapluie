'use client';
import { useEffect, useState } from 'react';

const WORD = 'Parapluie';

export default function AnimatedTitle() {
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    if (revealed >= WORD.length) return;
    const t = setTimeout(() => setRevealed(r => r + 1), 80 + revealed * 12);
    return () => clearTimeout(t);
  }, [revealed]);

  return (
    <h1
      className="font-display select-none"
      style={{
        fontSize: 'clamp(52px, 12vw, 112px)',
        fontWeight: 700,
        letterSpacing: '-0.02em',
        lineHeight: 1,
        fontFamily: "'Space Grotesk', sans-serif",
      }}
    >
      {WORD.split('').map((ch, i) => (
        <span
          key={i}
          className={i < revealed ? 'letter-anim' : ''}
          style={{
            display: 'inline-block',
            opacity: i < revealed ? undefined : 0,
            animationDelay: `${i * 0.04}s`,
          }}
        >
          {ch}
        </span>
      ))}
    </h1>
  );
}
