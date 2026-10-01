'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { type Play } from '../_lib/play';
import { newCode } from '../_lib/online/client';
import type { OnlineMode } from '../_lib/online/protocol';

interface Option { title: string; desc: string; color: string; game: ReactNode }

/**
 * Solo or two players on one screen, as links: the choice lives in the URL
 * (?play=solo / ?play=local), so Back returns to this menu, a refresh keeps
 * your game, and a link can open a mode directly.
 */
export default function ModeSelector({ base, title, blurb, play, solo, local, online }: {
  /** the page's own path, for the back link */
  base: string;
  title: string;
  blurb: ReactNode;
  play: Play | undefined;
  solo: Option;
  local: Option;
  /** the online mode a fresh room opens in */
  online: OnlineMode;
}) {
  const router = useRouter();
  const chosen = play === 'solo' ? solo : play === 'local' ? local : null;

  if (chosen) {
    return (
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        <Link
          href={base}
          style={{
            position: 'absolute', top: 16, left: 16, zIndex: 10,
            padding: '8px 16px', borderRadius: 20,
            background: 'rgba(240,236,224,0.1)', border: '1px solid rgba(240,236,224,0.2)',
            color: 'var(--fog)', fontSize: 13, textDecoration: 'none',
          }}
        >
          ← Back to menu
        </Link>
        {chosen.game}
      </div>
    );
  }

  return (
    // Fill the page's game area rather than forcing a full viewport height —
    // the header and footer already take their share of it.
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', background: 'var(--asphalt)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', gap: '32px' }}>
      <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 'clamp(24px, 6vw, 32px)', fontWeight: 700, color: 'var(--fog)', marginBottom: 6 }}>{title}</p>
      <p style={{ fontSize: 'clamp(12px, 3vw, 13px)', color: 'rgba(240,236,224,.38)', marginBottom: 0, textAlign: 'center', lineHeight: 1.8, maxWidth: 300 }}>
        {blurb}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 340, alignItems: 'stretch' }}>
        {([['solo', solo], ['local', local]] as const).map(([key, option]) => (
          <Link
            key={key}
            href={`${base}?play=${key}`}
            className="mode-option"
            style={{
              display: 'block',
              padding: 'clamp(16px, 4vw, 24px) clamp(20px, 5vw, 28px)',
              paddingBottom: 'clamp(20px, 5vw, 32px)',
              borderRadius: 12,
              background: 'rgba(240,236,224,0.05)',
              border: '1px solid rgba(240,236,224,0.1)',
              transition: 'all 0.3s ease',
              textAlign: 'center',
              textDecoration: 'none',
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
            <div style={{ fontSize: 'clamp(10px, 2.5vw, 11px)', color: 'rgba(240,236,224,.5)', lineHeight: 1.7, whiteSpace: 'pre-line', marginTop: 8 }}>{option.desc}</div>
          </Link>
        ))}
        <button
          onClick={() => router.push(`/r/${newCode()}?new=${online}`)}
          style={{
            padding: 'clamp(14px, 3.5vw, 20px) clamp(20px, 5vw, 28px)', borderRadius: 12, cursor: 'pointer',
            background: 'rgba(240,236,224,0.05)', border: '1px dashed rgba(240,236,224,0.25)', textAlign: 'center', fontFamily: 'inherit',
          }}
        >
          <div style={{ fontSize: 'clamp(14px, 4vw, 16px)', fontWeight: 600, color: 'var(--fog)', marginBottom: 6, fontFamily: "'Space Grotesk',sans-serif" }}>With a friend online</div>
          <div style={{ fontSize: 'clamp(10px, 2.5vw, 11px)', color: 'rgba(240,236,224,.5)', lineHeight: 1.7 }}>Send a link. They play on their own device.</div>
        </button>
      </div>

      <p style={{ fontSize: 11, color: 'rgba(240,236,224,.3)' }}>choose how to play</p>
    </div>
  );
}
