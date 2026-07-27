'use client';

import { StreetBackdrop, AnimatedTitle } from './components/HeroClient';
import Link from 'next/link';

/**
 * Modes share the game's palette: foliage green for the open square, the
 * yellow umbrella for the endless run, awning red for the local duel.
 */
const MODES = [
  {
    href: '/open-world',
    kicker: '● SOLO',
    players: '1P',
    title: 'Open world',
    body: 'She wanders freely, chasing goals. Move your cursor to control the follower.',
    stars: '★★★',
    tags: ['— GOALS', '— RAIN', '— UMBRELLA —'],
    accent: 'var(--foliage)',
    glow: 'var(--glow-foliage)',
    rgb: '106,168,69',
  },
  {
    href: '/runner',
    kicker: '● ENDLESS',
    players: '1P',
    title: 'Runner',
    body: 'The street always moves forward. Dodge obstacles, survive the scroll.',
    stars: '★★☆',
    tags: ['— DODGE', '— SCROLL', '— SURVIVE —'],
    accent: 'var(--umbrella)',
    glow: 'var(--glow-umbrella)',
    rgb: '245,197,24',
  },
  {
    href: '/two-player',
    kicker: '● LOCAL',
    players: '2P',
    title: 'Two Player',
    body: 'One keyboard. One umbrella. Two players compete and cooperate.',
    stars: '★★★',
    tags: ['— COMPETE', '— COOPERATE'],
    accent: 'var(--brick)',
    glow: 'var(--glow-brick)',
    rgb: '176,86,77',
  },
];

export default function Home() {
  return (
    <main>
      {/* HERO — the street itself, scrolling behind the type */}
      <section
        className="relative flex flex-col items-center justify-center text-center overflow-hidden"
        style={{ minHeight: '100vh', padding: '0 24px' }}
      >
        <StreetBackdrop />

        {/* Lamplight spilling in from the corners */}
        <div
          className="absolute"
          style={{
            width: 420, height: 420, bottom: -80, left: -80,
            background: 'var(--lamp)', borderRadius: '50%',
            filter: 'blur(110px)', opacity: 0.1, zIndex: 1,
          }}
        />
        <div
          className="absolute"
          style={{
            width: 380, height: 380, top: -60, right: -60,
            background: 'var(--umbrella)', borderRadius: '50%',
            filter: 'blur(110px)', opacity: 0.08, zIndex: 1,
          }}
        />

        <div className="relative z-10 flex flex-col items-center gap-6">
          <div style={{ fontFamily: 'var(--pixel)', fontSize: 8, color: 'var(--lamp)', letterSpacing: 2, marginBottom: -8, opacity: 0.75 }}>
            ☔ PLAYER SELECT
          </div>

          <AnimatedTitle />

          <p style={{ fontSize: 'clamp(14px,2vw,18px)', color: 'rgba(240,236,224,0.6)', lineHeight: 1.7, maxWidth: 400 }}>
            Follow the woman with the umbrella.<br />Stay close. Don&apos;t get wet.
          </p>

          {/* The umbrella, lit like the one in the game */}
          <div className="relative flex items-center justify-center" style={{ width: 64, height: 64 }}>
            <div className="pulse-ring absolute rounded-full" style={{ width: 64, height: 64, border: '1px solid rgba(245,197,24,0.35)', background: 'transparent', boxShadow: 'var(--glow-umbrella)' }} />
            <div className="relative rounded-full flex items-center justify-center" style={{ width: 36, height: 36, background: 'rgba(245,197,24,0.14)', border: '1px solid rgba(245,197,24,0.4)' }}>
              <span style={{ fontSize: 18 }}>☂</span>
            </div>
          </div>

          <a href="#play" style={{
            padding: '13px 40px',
            borderRadius: 28,
            background: 'var(--umbrella)',
            color: '#241d05',
            textDecoration: 'none',
            fontSize: 10,
            fontWeight: 700,
            fontFamily: 'var(--pixel)',
            cursor: 'pointer',
            textTransform: 'uppercase',
            letterSpacing: 1,
            boxShadow: 'var(--glow-umbrella)',
            transition: 'all 0.2s ease',
          }}
            onMouseEnter={(e) => { (e.target as HTMLAnchorElement).style.transform = 'scale(1.05)'; }}
            onMouseLeave={(e) => { (e.target as HTMLAnchorElement).style.transform = 'scale(1)'; }}
          >
            ▶ PLAY NOW
          </a>

          <p style={{
            fontSize: 8,
            fontFamily: 'var(--pixel)',
            color: 'var(--lamp)',
            marginTop: -4,
            opacity: 0.6,
            animation: 'blink 1.6s infinite',
            letterSpacing: 1,
          }}>
            INSERT COIN ☔
          </p>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-10" style={{ color: 'rgba(240,236,224,0.28)', fontSize: 11 }}>
          <span>scroll</span><span style={{ fontSize: 16 }}>↓</span>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ padding: '80px 24px', maxWidth: 800, margin: '0 auto' }}>
        <p style={{ fontFamily: 'var(--pixel)', fontSize: 8, letterSpacing: '.1em', color: 'var(--lamp)', marginBottom: 32, opacity: 0.7 }}>
          // THE GAME
        </p>
        <div className="grid gap-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          {[
            { icon: '☂', title: 'One umbrella', body: "She carries it. You chase it. The rain doesn't care who you are.", accent: 'var(--umbrella)' },
            { icon: '🎯', title: 'Two roles', body: 'Play as the woman collecting goals — or as the follower trying not to drown.', accent: 'var(--foliage)' },
            { icon: '🌍', title: 'Three cities', body: 'Osaka, Tokyo, Paris. Each city has its own pace, obstacles, and cruelty.', accent: 'var(--rain)' },
          ].map(({ icon, title, body, accent }, idx) => (
            <div key={title} style={{ borderLeft: `3px solid ${accent}`, paddingLeft: 16 }}>
              <div style={{ fontSize: 8, fontFamily: 'var(--pixel)', color: accent, marginBottom: 8, letterSpacing: 1, opacity: 0.8 }}>
                0{idx + 1}
              </div>
              <div style={{ fontSize: 24, marginBottom: 12 }}>{icon}</div>
              <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--fog)', marginBottom: 8, fontFamily: "'Space Grotesk',sans-serif" }}>{title}</p>
              <p style={{ fontSize: 13, color: 'rgba(240,236,224,0.5)', lineHeight: 1.7 }}>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <div style={{ borderTop: '1px solid var(--border)', margin: '0 24px' }} />

      {/* GAMES */}
      <section id="play" style={{ padding: '80px 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <p style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(240,236,224,0.35)', marginBottom: 40 }}>play</p>
          <div className="grid gap-10" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))' }}>

            {MODES.map((m) => (
              <Link key={m.href} href={m.href} style={{ textDecoration: 'none', display: 'block' }}>
                <div
                  className="stone-panel"
                  style={{ cursor: 'pointer', padding: '20px 20px 28px 20px' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = `inset 0 1px 0 rgba(255,246,224,0.12), 0 16px 36px rgba(0,0,0,0.5), 0 0 0 1px rgba(${m.rgb},0.35)`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = '';
                  }}
                >
                  <div className="flex items-start justify-between mb-4" style={{ gap: 12, position: 'relative', zIndex: 1 }}>
                    <div>
                      <div style={{ fontSize: 8, fontFamily: 'var(--pixel)', color: m.accent, marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' }}>
                        {m.kicker}
                      </div>
                      <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 700, color: 'var(--fog)', marginBottom: 4, textShadow: m.glow }}>
                        {m.title}
                      </p>
                      <p style={{ fontSize: 13, color: 'rgba(240,236,224,0.45)', lineHeight: 1.6, maxWidth: 260 }}>
                        {m.body}
                      </p>
                    </div>
                    <div style={{ fontSize: 8, fontFamily: 'var(--pixel)', color: 'rgba(240,236,224,0.4)', marginTop: 2 }}>
                      {m.players}
                    </div>
                  </div>

                  <div style={{ fontSize: 14, color: m.accent, marginBottom: 12, position: 'relative', zIndex: 1 }}>{m.stars}</div>

                  <div style={{ marginTop: 12, position: 'relative', zIndex: 1 }}>
                    <button
                      style={{
                        padding: '10px 24px',
                        borderRadius: 24,
                        background: m.accent,
                        color: '#1a1408',
                        border: 'none',
                        fontSize: 9,
                        fontWeight: 700,
                        fontFamily: 'var(--pixel)',
                        cursor: 'pointer',
                        textTransform: 'uppercase',
                        boxShadow: m.glow,
                        transition: 'transform 0.2s ease',
                        letterSpacing: 1,
                      }}
                      onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.transform = 'scale(1.04)'; }}
                      onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.transform = 'scale(1)'; }}
                    >
                      ▶ SELECT
                    </button>
                  </div>
                  <div className="flex gap-2 flex-wrap" style={{ marginTop: 20, fontSize: 10, color: 'rgba(240,236,224,0.28)', fontFamily: 'var(--pixel)', position: 'relative', zIndex: 1 }}>
                    {m.tags.map(tag => <span key={tag}>{tag}</span>)}
                  </div>
                </div>
              </Link>
            ))}

          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '32px 24px', textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--pixel)', fontSize: 7, color: 'rgba(240,236,224,0.25)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
          © PARAPLUIE GAMES 2025
        </p>
        <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 700, color: 'rgba(240,236,224,0.3)', textShadow: 'var(--glow-lamp)' }}>
          Parapluie
        </p>
      </footer>
    </main>
  );
}
