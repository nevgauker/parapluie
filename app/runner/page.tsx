import { RunnerModeSelector } from '../components/GameSection';
import Link from 'next/link';

export const metadata = {
  title: 'Runner - Parapluie',
  description: 'Endless runner mode across three cities',
};

export default function RunnerPage() {
  return (
    <main style={{ width: '100vw', height: '100dvh', overflow: 'hidden', background: '#0d110b', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(251,146,60,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(232,244,226,0.02)' }}>
        <Link href="/" style={{ textDecoration: 'none', color: 'rgba(251,146,60,0.6)', fontSize: 8, fontWeight: 700, fontFamily: 'var(--pixel)', textTransform: 'uppercase', letterSpacing: 1, transition: 'color 0.2s ease' }}>
          ◀ EXIT
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#e8f4e2', margin: 0, fontFamily: "'Space Grotesk',sans-serif", textShadow: '0 0 12px rgba(251,146,60,0.6), 0 0 30px rgba(251,146,60,0.25)' }}>Runner</h1>
        <div style={{ fontSize: 8, fontFamily: 'var(--pixel)', color: 'rgba(232,244,226,0.4)', textTransform: 'uppercase', letterSpacing: 1 }}>ENDLESS</div>
      </div>

      {/* Game Container */}
      <div style={{ flex: 1, overflow: 'auto', position: 'relative', minHeight: 0 }}>
        <RunnerModeSelector />
      </div>

      {/* Instructions */}
      <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(232,244,226,0.1)', fontSize: 12, color: 'rgba(232,244,226,0.4)', textAlign: 'center' }}>
        <span>🧣 dries you · 🏠 expands zone · 💧 dodge it</span>
      </div>
    </main>
  );
}
