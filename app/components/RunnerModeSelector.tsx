'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';

const RunnerGameSolo = dynamic(() => import('./RunnerGameSolo'), { ssr: false });
const RunnerGameTwoPlayer = dynamic(() => import('./RunnerGameTwoPlayer'), { ssr: false });

type GameMode = 'menu' | 'solo' | 'multiplayer';

export default function RunnerModeSelector() {
  const [gameMode, setGameMode] = useState<GameMode>('menu');

  return (
    // Fill the page's game area rather than forcing a full viewport height —
    // the header and footer already take their share of it.
    <div style={{ width: '100%', height: '100%' }}>
      {gameMode === 'menu' && (
        <div style={{ width: '100%', height: '100%', overflowY: 'auto', background: 'var(--asphalt)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', gap: '32px' }}>
          <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 'clamp(24px, 6vw, 32px)', fontWeight: 700, color: 'var(--fog)', marginBottom: 6 }}>Runner</p>
          <p style={{ fontSize: 'clamp(12px, 3vw, 13px)', color: 'rgba(240,236,224,.38)', marginBottom: 0, textAlign: 'center', lineHeight: 1.8, maxWidth: 300 }}>
            The street scrolls up.<br />Dodge obstacles. Stay dry.
          </p>

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            width: '100%',
            maxWidth: 340,
            alignItems: 'stretch',
          }}>
            {[
              {
                mode: 'solo',
                title: 'Solo',
                desc: 'One player\nMouse or touch\n\nMove horizontally to dodge\nCollect bonuses for power-ups',
                color: 'var(--umbrella)'
              },
              {
                mode: 'multiplayer',
                title: 'Two Players',
                desc: 'One keyboard\nCooperative\n\nP1: WASD to move left/right\nP2: Arrow keys to move left/right',
                color: 'var(--brick)'
              },
            ].map(option => (
              <button
                key={option.mode}
                onClick={() => setGameMode(option.mode as GameMode)}
                style={{
                  padding: 'clamp(16px, 4vw, 24px) clamp(20px, 5vw, 28px)',
                  paddingBottom: 'clamp(20px, 5vw, 32px)',
                  borderRadius: 12,
                  background: 'rgba(240,236,224,0.05)',
                  border: '1px solid rgba(240,236,224,0.1)',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  textAlign: 'center',
                  width: '100%',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(240,236,224,0.1)';
                  e.currentTarget.style.borderColor = 'rgba(240,236,224,0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(240,236,224,0.05)';
                  e.currentTarget.style.borderColor = 'rgba(240,236,224,0.1)';
                }}
              >
                <div style={{ width: 'clamp(12px, 3vw, 16px)', height: 'clamp(12px, 3vw, 16px)', borderRadius: '50%', background: option.color, margin: '0 auto clamp(8px, 2vw, 12px)', border: '2px solid rgba(255,255,255,.8)' }} />
                <div style={{ fontSize: 'clamp(14px, 4vw, 16px)', fontWeight: 600, color: 'var(--fog)', marginBottom: 8, fontFamily: "'Space Grotesk',sans-serif" }}>{option.title}</div>
                <div style={{ fontSize: 'clamp(9px, 2.5vw, 10px)', color: 'rgba(240,236,224,.4)', lineHeight: 1.7, whiteSpace: 'pre-line', marginTop: 8 }}>{option.desc}</div>
              </button>
            ))}
          </div>

          <p style={{ fontSize: 11, color: 'rgba(240,236,224,.2)' }}>choose your game mode</p>
        </div>
      )}

      {gameMode === 'solo' && (
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
          <button
            onClick={() => setGameMode('menu')}
            style={{
              position: 'absolute',
              top: 16,
              left: 16,
              padding: '8px 16px',
              borderRadius: 20,
              background: 'rgba(240,236,224,0.1)',
              border: '1px solid rgba(240,236,224,0.2)',
              color: 'var(--fog)',
              fontSize: 13,
              cursor: 'pointer',
              zIndex: 10,
              fontFamily: 'inherit',
            }}
          >
            ← Back to menu
          </button>
          <RunnerGameSolo />
        </div>
      )}

      {gameMode === 'multiplayer' && (
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
          <button
            onClick={() => setGameMode('menu')}
            style={{
              position: 'absolute',
              top: 16,
              left: 16,
              padding: '8px 16px',
              borderRadius: 20,
              background: 'rgba(240,236,224,0.1)',
              border: '1px solid rgba(240,236,224,0.2)',
              color: 'var(--fog)',
              fontSize: 13,
              cursor: 'pointer',
              zIndex: 10,
              fontFamily: 'inherit',
            }}
          >
            ← Back to menu
          </button>
          <RunnerGameTwoPlayer />
        </div>
      )}
    </div>
  );
}
