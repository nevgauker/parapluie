'use client';

import { RainCanvas, AnimatedTitle } from './components/HeroClient';
import Link from 'next/link';

export default function Home() {
  return (
    <main>
      {/* HERO */}
      <section
        className="relative flex flex-col items-center justify-center text-center overflow-hidden"
        style={{ minHeight: '100vh', padding: '0 24px' }}
      >
        <RainCanvas />

        {/* Floating color blobs for depth */}
        <div
          className="absolute"
          style={{
            width: 300,
            height: 300,
            bottom: 0,
            left: 0,
            background: '#4ade80',
            borderRadius: '50%',
            filter: 'blur(100px)',
            opacity: 0.08,
            zIndex: 1,
          }}
        />
        <div
          className="absolute"
          style={{
            width: 300,
            height: 300,
            top: 0,
            right: 0,
            background: '#fb923c',
            borderRadius: '50%',
            filter: 'blur(100px)',
            opacity: 0.08,
            zIndex: 1,
          }}
        />

        {/* Scanline overlay */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'repeating-linear-gradient(transparent, transparent 2px, rgba(0,0,0,0.05) 2px, rgba(0,0,0,0.05) 4px)',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />

        <div className="relative z-10 flex flex-col items-center gap-6">
          {/* PLAYER SELECT label */}
          <div style={{ fontFamily: 'var(--pixel)', fontSize: 8, color: 'var(--rain)', letterSpacing: 2, marginBottom: -8 }}>
            ☔ PLAYER SELECT
          </div>

          <AnimatedTitle />

          <p style={{ fontSize: 'clamp(14px,2vw,18px)', color: 'rgba(232,244,226,0.5)', lineHeight: 1.7, maxWidth: 400 }}>
            Follow the woman with the umbrella.<br />Stay close. Don&apos;t get wet.
          </p>

          {/* Umbrella with neon glow */}
          <div className="relative flex items-center justify-center" style={{ width: 64, height: 64 }}>
            <div className="pulse-ring absolute rounded-full" style={{ width: 64, height: 64, border: '1.5px solid rgba(74,222,128,0.5)', background: 'transparent', boxShadow: '0 0 20px rgba(74,222,128,0.4)' }} />
            <div className="relative rounded-full flex items-center justify-center" style={{ width: 36, height: 36, background: 'rgba(55,138,221,0.12)', border: '1px solid rgba(55,138,221,0.35)' }}>
              <span style={{ fontSize: 18 }}>☂</span>
            </div>
          </div>

          {/* Neon green CTA button */}
          <a href="#play" style={{
            padding: '13px 40px',
            borderRadius: 28,
            background: '#4ade80',
            color: '#0d110b',
            textDecoration: 'none',
            fontSize: 10,
            fontWeight: 700,
            fontFamily: 'var(--pixel)',
            cursor: 'pointer',
            textTransform: 'uppercase',
            letterSpacing: 1,
            boxShadow: 'var(--glow-green)',
            transition: 'all 0.2s ease',
          }}
            onMouseEnter={(e) => {
              const el = e.target as HTMLAnchorElement;
              el.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              const el = e.target as HTMLAnchorElement;
              el.style.transform = 'scale(1)';
            }}
          >
            ▶ PLAY NOW
          </a>

          {/* INSERT COIN blinking text */}
          <p style={{
            fontSize: 8,
            fontFamily: 'var(--pixel)',
            color: 'var(--rain)',
            marginTop: -4,
            animation: 'blink 1s infinite',
            letterSpacing: 1,
          }}>
            INSERT COIN ☔
          </p>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2" style={{ color: 'rgba(232,244,226,0.2)', fontSize: 11 }}>
          <span>scroll</span><span style={{ fontSize: 16 }}>↓</span>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ padding: '80px 24px', maxWidth: 800, margin: '0 auto' }}>
        <p style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--rain)', marginBottom: 32, fontFamily: 'var(--pixel)' }}>
          // THE GAME
        </p>
        <div className="grid gap-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          {[
            { icon: '☂', title: 'One umbrella', body: "She carries it. You chase it. The rain doesn't care who you are." },
            { icon: '🎯', title: 'Two roles', body: 'Play as the woman collecting goals — or as the follower trying not to drown.' },
            { icon: '🌍', title: 'Three cities', body: 'Osaka, Tokyo, Paris. Each city has its own pace, obstacles, and cruelty.' },
          ].map(({ icon, title, body }, idx) => (
            <div key={title} style={{ borderLeft: `4px solid ${['var(--green)', 'var(--orange)', 'var(--rain)'][idx]}`, paddingLeft: 16 }}>
              <div style={{ fontSize: 8, fontFamily: 'var(--pixel)', color: ['var(--green)', 'var(--orange)', 'var(--rain)'][idx], marginBottom: 8, letterSpacing: 1 }}>
                0{idx + 1}
              </div>
              <div style={{ fontSize: 24, marginBottom: 12 }}>{icon}</div>
              <p style={{ fontSize: 14, fontWeight: 500, color: '#e8f4e2', marginBottom: 8, fontFamily: "'Space Grotesk',sans-serif" }}>{title}</p>
              <p style={{ fontSize: 13, color: 'rgba(232,244,226,0.45)', lineHeight: 1.7 }}>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <div style={{ borderTop: '1px solid rgba(232,244,226,0.07)', margin: '0 24px' }} />

      {/* GAMES */}
      <section id="play" style={{ padding: '80px 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <p style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(232,244,226,0.3)', marginBottom: 40 }}>play</p>
          <div className="grid gap-12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))' }}>

            {/* Open world */}
            <Link href="/open-world" style={{ textDecoration: 'none', display: 'block' }}>
              <div
                className="group relative"
                style={{
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  padding: 2,
                }}
              >
                {/* Neon border with spinning animation */}
                <div
                  className="absolute inset-0 rounded-xl"
                  style={{
                    background: 'conic-gradient(from 0deg, #4ade80, #4ade80 90deg, transparent)',
                    borderRadius: 14,
                    zIndex: -1,
                    animation: 'border-spin 6s linear infinite',
                  }}
                />

                <div
                  style={{
                    cursor: 'pointer',
                    padding: '20px 20px 28px 20px',
                    borderRadius: 12,
                    background: 'rgba(13,17,11,0.95)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(74,222,128,0.2)',
                    transition: 'all 0.3s ease',
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget;
                    (el.style as any).borderColor = 'rgba(74,222,128,0.5)';
                    (el.style as any).boxShadow = '0 0 20px rgba(74,222,128,0.2)';
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget;
                    (el.style as any).borderColor = 'rgba(74,222,128,0.2)';
                    (el.style as any).boxShadow = 'none';
                  }}
                >
                  <div className="flex items-start justify-between mb-4" style={{ gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 8, fontFamily: 'var(--pixel)', color: '#4ade80', marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' }}>
                        ● SOLO
                      </div>
                      <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 700, color: '#e8f4e2', marginBottom: 4, textShadow: 'var(--glow-green)' }}>
                        Open world
                      </p>
                      <p style={{ fontSize: 13, color: 'rgba(232,244,226,0.4)', lineHeight: 1.6, maxWidth: 260 }}>
                        She wanders freely, chasing goals. Move your cursor to control the follower.
                      </p>
                    </div>
                    <div style={{ fontSize: 8, fontFamily: 'var(--pixel)', color: 'rgba(232,244,226,0.4)', marginTop: 2 }}>
                      1P
                    </div>
                  </div>

                  {/* Difficulty stars */}
                  <div style={{ fontSize: 14, color: '#4ade80', marginBottom: 12 }}>★★★</div>

                  <div style={{ marginTop: 12 }}>
                    <button
                      style={{
                        padding: '10px 24px',
                        borderRadius: 24,
                        background: '#4ade80',
                        color: '#0d110b',
                        border: 'none',
                        fontSize: 9,
                        fontWeight: 700,
                        fontFamily: 'var(--pixel)',
                        cursor: 'pointer',
                        textTransform: 'uppercase',
                        boxShadow: 'var(--glow-green)',
                        transition: 'all 0.2s ease',
                        letterSpacing: 1,
                      }}
                      onMouseEnter={(e) => {
                        (e.target as HTMLButtonElement).style.transform = 'scale(1.04)';
                      }}
                      onMouseLeave={(e) => {
                        (e.target as HTMLButtonElement).style.transform = 'scale(1)';
                      }}
                    >
                      ▶ SELECT
                    </button>
                  </div>
                  <div className="flex gap-2 flex-wrap" style={{ marginTop: 20, fontSize: 10, color: 'rgba(232,244,226,0.3)', fontFamily: 'var(--pixel)' }}>
                    <span>— GOALS</span><span>— RAIN</span><span>— UMBRELLA —</span>
                  </div>
                </div>
              </div>
            </Link>

            {/* Runner */}
            <Link href="/runner" style={{ textDecoration: 'none', display: 'block' }}>
              <div
                className="group relative"
                style={{
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  padding: 2,
                }}
              >
                {/* Neon border with spinning animation */}
                <div
                  className="absolute inset-0 rounded-xl"
                  style={{
                    background: 'conic-gradient(from 0deg, #fb923c, #fb923c 90deg, transparent)',
                    borderRadius: 14,
                    zIndex: -1,
                    animation: 'border-spin 6s linear infinite',
                  }}
                />

                <div
                  style={{
                    cursor: 'pointer',
                    padding: '20px 20px 28px 20px',
                    borderRadius: 12,
                    background: 'rgba(13,17,11,0.95)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(251,146,60,0.2)',
                    transition: 'all 0.3s ease',
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget;
                    (el.style as any).borderColor = 'rgba(251,146,60,0.5)';
                    (el.style as any).boxShadow = '0 0 20px rgba(251,146,60,0.2)';
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget;
                    (el.style as any).borderColor = 'rgba(251,146,60,0.2)';
                    (el.style as any).boxShadow = 'none';
                  }}
                >
                  <div className="flex items-start justify-between mb-4" style={{ gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 8, fontFamily: 'var(--pixel)', color: '#fb923c', marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' }}>
                        ● ENDLESS
                      </div>
                      <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 700, color: '#e8f4e2', marginBottom: 4, textShadow: 'var(--glow-orange)' }}>
                        Runner
                      </p>
                      <p style={{ fontSize: 13, color: 'rgba(232,244,226,0.4)', lineHeight: 1.6, maxWidth: 260 }}>
                        The street always moves forward. Dodge obstacles, survive the scroll.
                      </p>
                    </div>
                    <div style={{ fontSize: 8, fontFamily: 'var(--pixel)', color: 'rgba(232,244,226,0.4)', marginTop: 2 }}>
                      1P
                    </div>
                  </div>

                  {/* Difficulty stars */}
                  <div style={{ fontSize: 14, color: '#fb923c', marginBottom: 12 }}>★★☆</div>

                  <div style={{ marginTop: 12 }}>
                    <button
                      style={{
                        padding: '10px 24px',
                        borderRadius: 24,
                        background: '#fb923c',
                        color: '#0d110b',
                        border: 'none',
                        fontSize: 9,
                        fontWeight: 700,
                        fontFamily: 'var(--pixel)',
                        cursor: 'pointer',
                        textTransform: 'uppercase',
                        boxShadow: 'var(--glow-orange)',
                        transition: 'all 0.2s ease',
                        letterSpacing: 1,
                      }}
                      onMouseEnter={(e) => {
                        (e.target as HTMLButtonElement).style.transform = 'scale(1.04)';
                      }}
                      onMouseLeave={(e) => {
                        (e.target as HTMLButtonElement).style.transform = 'scale(1)';
                      }}
                    >
                      ▶ SELECT
                    </button>
                  </div>
                  <div className="flex gap-2 flex-wrap" style={{ marginTop: 20, fontSize: 10, color: 'rgba(232,244,226,0.3)', fontFamily: 'var(--pixel)' }}>
                    <span>— DODGE</span><span>— SCROLL</span><span>— SURVIVE —</span>
                  </div>
                </div>
              </div>
            </Link>

            {/* Two Player */}
            <Link href="/two-player" style={{ textDecoration: 'none', display: 'block' }}>
              <div
                className="group relative"
                style={{
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  padding: 2,
                }}
              >
                {/* Neon border with spinning animation */}
                <div
                  className="absolute inset-0 rounded-xl"
                  style={{
                    background: 'conic-gradient(from 0deg, #a855f7, #a855f7 90deg, transparent)',
                    borderRadius: 14,
                    zIndex: -1,
                    animation: 'border-spin 6s linear infinite',
                  }}
                />

                <div
                  style={{
                    cursor: 'pointer',
                    padding: '20px 20px 28px 20px',
                    borderRadius: 12,
                    background: 'rgba(13,17,11,0.95)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(168,85,247,0.2)',
                    transition: 'all 0.3s ease',
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget;
                    (el.style as any).borderColor = 'rgba(168,85,247,0.5)';
                    (el.style as any).boxShadow = '0 0 20px rgba(168,85,247,0.2)';
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget;
                    (el.style as any).borderColor = 'rgba(168,85,247,0.2)';
                    (el.style as any).boxShadow = 'none';
                  }}
                >
                  <div className="flex items-start justify-between mb-4" style={{ gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 8, fontFamily: 'var(--pixel)', color: '#a855f7', marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' }}>
                        ● LOCAL
                      </div>
                      <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 700, color: '#e8f4e2', marginBottom: 4, textShadow: 'var(--glow-purple)' }}>
                        Two Player
                      </p>
                      <p style={{ fontSize: 13, color: 'rgba(232,244,226,0.4)', lineHeight: 1.6, maxWidth: 260 }}>
                        One keyboard. One umbrella. Two players compete and cooperate.
                      </p>
                    </div>
                    <div style={{ fontSize: 8, fontFamily: 'var(--pixel)', color: 'rgba(232,244,226,0.4)', marginTop: 2 }}>
                      2P
                    </div>
                  </div>

                  {/* Difficulty stars */}
                  <div style={{ fontSize: 14, color: '#a855f7', marginBottom: 12 }}>★★★</div>

                  <div style={{ marginTop: 12 }}>
                    <button
                      style={{
                        padding: '10px 24px',
                        borderRadius: 24,
                        background: '#a855f7',
                        color: '#0d110b',
                        border: 'none',
                        fontSize: 9,
                        fontWeight: 700,
                        fontFamily: 'var(--pixel)',
                        cursor: 'pointer',
                        textTransform: 'uppercase',
                        boxShadow: 'var(--glow-purple)',
                        transition: 'all 0.2s ease',
                        letterSpacing: 1,
                      }}
                      onMouseEnter={(e) => {
                        (e.target as HTMLButtonElement).style.transform = 'scale(1.04)';
                      }}
                      onMouseLeave={(e) => {
                        (e.target as HTMLButtonElement).style.transform = 'scale(1)';
                      }}
                    >
                      ▶ SELECT
                    </button>
                  </div>
                  <div className="flex gap-2 flex-wrap" style={{ marginTop: 20, fontSize: 10, color: 'rgba(232,244,226,0.3)', fontFamily: 'var(--pixel)' }}>
                    <span>— COMPETE</span><span>— COOPERATE</span>
                  </div>
                </div>
              </div>
            </Link>

          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: '1px solid rgba(232,244,226,0.07)', padding: '32px 24px', textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--pixel)', fontSize: 7, color: 'rgba(232,244,226,0.25)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
          © PARAPLUIE GAMES 2025
        </p>
        <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 700, color: 'rgba(232,244,226,0.25)', textShadow: 'var(--glow-rain)' }}>
          Parapluie
        </p>
      </footer>
    </main>
  );
}
