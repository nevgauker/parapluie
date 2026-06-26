import { OpenWorldGame } from '../components/GameSection';
import Link from 'next/link';

export const metadata = {
  title: 'Open World - Parapluie',
  description: 'Follow the umbrella in open world mode - solo or multiplayer',
};

export default function OpenWorldPage() {
  return (
    <main style={{ width: '100vw', height: '100dvh', overflow: 'hidden', background: '#0d110b', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(74,222,128,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(232,244,226,0.02)' }}>
        <Link href="/" style={{ textDecoration: 'none', color: 'rgba(74,222,128,0.6)', fontSize: 8, fontWeight: 700, fontFamily: 'var(--pixel)', textTransform: 'uppercase', letterSpacing: 1, transition: 'color 0.2s ease' }}>
          ◀ EXIT
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#e8f4e2', margin: 0, fontFamily: "'Space Grotesk',sans-serif", textShadow: '0 0 12px rgba(74,222,128,0.6), 0 0 30px rgba(74,222,128,0.25)' }}>Open World</h1>
        <div style={{ fontSize: 8, fontFamily: 'var(--pixel)', color: 'rgba(232,244,226,0.4)', textTransform: 'uppercase', letterSpacing: 1 }}>SOLO</div>
      </div>

      {/* Game Container */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <OpenWorldGame />
      </div>
    </main>
  );
}
