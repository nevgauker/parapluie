'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';

const OpenUmbrellaGame = dynamic(() => import('./OpenUmbrellaGame'), { ssr: false });
const OpenUmbrellaGameTwoPlayer = dynamic(() => import('./OpenUmbrellaGameTwoPlayer'), { ssr: false });

type GameMode = 'menu' | 'solo' | 'multiplayer';

export default function OpenWorldGame() {
  const [gameMode, setGameMode] = useState<GameMode>('menu');

  return (
    <div style={{ width: '100%', height: '100%' }}>
      {gameMode === 'menu' && (
        <div style={{ width: '100%', height: '100%', background: 'var(--asphalt)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 32, fontWeight: 700, color: 'var(--fog)', marginBottom: 6 }}>Open World</p>
          <p style={{ fontSize: 13, color: 'rgba(240,236,224,.38)', marginBottom: 36, textAlign: 'center', lineHeight: 1.8, maxWidth: 300 }}>
            Follow the woman with the umbrella.<br />Chase goals. Don't get wet.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32, width: '100%', maxWidth: 320, alignItems: 'stretch' }}>
            {[
              {
                mode: 'solo',
                title: 'Solo',
                desc: 'One player\nMouse control\n\nYou: Move mouse to control follower\nWoman: AI chases goals',
                color: 'var(--foliage)'
              },
              {
                mode: 'multiplayer',
                title: 'Two Players',
                desc: 'One keyboard\nCooperative\n\nP1: WASD to move woman\nP2: Arrow keys to move follower',
                color: 'var(--brick)'
              },
            ].map(option => (
              <button
                key={option.mode}
                onClick={() => setGameMode(option.mode as GameMode)}
                style={{
                  padding: '24px 28px',
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
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: option.color, margin: '0 auto 12px', border: '2px solid rgba(255,255,255,.8)' }} />
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--fog)', marginBottom: 8, fontFamily: "'Space Grotesk',sans-serif" }}>{option.title}</div>
                <div style={{ fontSize: 10, color: 'rgba(240,236,224,.4)', lineHeight: 1.7, whiteSpace: 'pre-line', marginTop: 8 }}>{option.desc}</div>
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
          <OpenUmbrellaGame />
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
          <OpenUmbrellaGameTwoPlayer />
        </div>
      )}
    </div>
  );
}
