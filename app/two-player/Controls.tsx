'use client';
import { useState, useEffect } from 'react';
import { controlsText } from '../_lib/players';

export default function Controls() {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => { setIsTouch(navigator.maxTouchPoints > 0); }, []);
  return (
    <span>{controlsText(isTouch)} · roles swap after round 1 · Esc, P or Start pauses</span>
  );
}
