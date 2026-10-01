'use client';
import { useState, useEffect } from 'react';

export default function Controls() {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => { setIsTouch(navigator.maxTouchPoints > 0); }, []);
  return (
    <span>{isTouch ? '🟢 P1 D-pad left · 🟠 P2 D-pad right' : '🟢 P1 WASD · 🟠 P2 arrows'} · roles swap after round 1</span>
  );
}
