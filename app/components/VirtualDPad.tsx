'use client';
import { useState, useEffect } from 'react';
import React from 'react';

interface DPadProps {
  keysRef: React.MutableRefObject<Record<string, boolean>>;
  keyMap: { up: string; down: string; left: string; right: string };
  position: 'left' | 'right';
  color: string;
  label: string;
}

export default function VirtualDPad({ keysRef, keyMap, position, color, label }: DPadProps) {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    setIsTouch(navigator.maxTouchPoints > 0);
  }, []);

  if (!isTouch) return null;

  const handlePointerDown = (key: string) => (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    keysRef.current[key] = true;
  };

  const handlePointerUp = (key: string) => () => {
    keysRef.current[key] = false;
  };

  const handlePointerCancel = (key: string) => () => {
    keysRef.current[key] = false;
  };

  const buttonSize = 52;
  const gap = 4;
  const positionStyle = position === 'left'
    ? { bottom: 24, left: 16 }
    : { bottom: 24, right: 16 };

  return (
    <div
      style={{
        position: 'absolute',
        ...positionStyle,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: gap,
        zIndex: 50,
      }}
    >
      {/* Up */}
      <button
        onPointerDown={handlePointerDown(keyMap.up)}
        onPointerUp={handlePointerUp(keyMap.up)}
        onPointerCancel={handlePointerCancel(keyMap.up)}
        style={{
          width: buttonSize,
          height: buttonSize,
          borderRadius: '50%',
          background: color,
          border: 'none',
          cursor: 'pointer',
          opacity: 0.6,
          fontSize: 18,
          touchAction: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'opacity 0.1s',
        }}
        onMouseDown={(e) => (e.currentTarget.style.opacity = '0.9')}
        onMouseUp={(e) => (e.currentTarget.style.opacity = '0.6')}
      >
        ▲
      </button>

      {/* Left, Center, Right row */}
      <div style={{ display: 'flex', gap, alignItems: 'center' }}>
        {/* Left */}
        <button
          onPointerDown={handlePointerDown(keyMap.left)}
          onPointerUp={handlePointerUp(keyMap.left)}
          onPointerCancel={handlePointerCancel(keyMap.left)}
          style={{
            width: buttonSize,
            height: buttonSize,
            borderRadius: '50%',
            background: color,
            border: 'none',
            cursor: 'pointer',
            opacity: 0.6,
            fontSize: 18,
            touchAction: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'opacity 0.1s',
          }}
          onMouseDown={(e) => (e.currentTarget.style.opacity = '0.9')}
          onMouseUp={(e) => (e.currentTarget.style.opacity = '0.6')}
        >
          ◄
        </button>

        {/* Center dot */}
        <div
          style={{
            width: buttonSize,
            height: buttonSize,
            borderRadius: '50%',
            background: 'rgba(232, 244, 226, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            color: 'rgba(232, 244, 226, 0.3)',
            fontWeight: 600,
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        >
          {label}
        </div>

        {/* Right */}
        <button
          onPointerDown={handlePointerDown(keyMap.right)}
          onPointerUp={handlePointerUp(keyMap.right)}
          onPointerCancel={handlePointerCancel(keyMap.right)}
          style={{
            width: buttonSize,
            height: buttonSize,
            borderRadius: '50%',
            background: color,
            border: 'none',
            cursor: 'pointer',
            opacity: 0.6,
            fontSize: 18,
            touchAction: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'opacity 0.1s',
          }}
          onMouseDown={(e) => (e.currentTarget.style.opacity = '0.9')}
          onMouseUp={(e) => (e.currentTarget.style.opacity = '0.6')}
        >
          ►
        </button>
      </div>

      {/* Down */}
      <button
        onPointerDown={handlePointerDown(keyMap.down)}
        onPointerUp={handlePointerUp(keyMap.down)}
        onPointerCancel={handlePointerCancel(keyMap.down)}
        style={{
          width: buttonSize,
          height: buttonSize,
          borderRadius: '50%',
          background: color,
          border: 'none',
          cursor: 'pointer',
          opacity: 0.6,
          fontSize: 18,
          touchAction: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'opacity 0.1s',
        }}
        onMouseDown={(e) => (e.currentTarget.style.opacity = '0.9')}
        onMouseUp={(e) => (e.currentTarget.style.opacity = '0.6')}
      >
        ▼
      </button>
    </div>
  );
}
