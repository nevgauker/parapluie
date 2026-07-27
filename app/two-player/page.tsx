import { TwoPlayerGame } from '../components/GameSection';
import Link from 'next/link';
import Controls from './Controls';

export const metadata = {
  title: 'Two Player - Parapluie',
  description: 'Two players, one umbrella, one keyboard',
};

export default function TwoPlayerPage() {
  return (
    <main style={{ width: '100vw', height: '100dvh', overflow: 'hidden', background: 'var(--asphalt)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(176,86,77,0.25)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(240,236,224,0.025)' }}>
        <Link href="/" style={{ textDecoration: 'none', color: 'rgba(176,86,77,0.85)', fontSize: 8, fontWeight: 700, fontFamily: 'var(--pixel)', textTransform: 'uppercase', letterSpacing: 1, transition: 'color 0.2s ease' }}>
          ◀ EXIT
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--fog)', margin: 0, fontFamily: "'Space Grotesk',sans-serif", textShadow: 'var(--glow-brick)' }}>Two Player</h1>
        <div style={{ fontSize: 8, fontFamily: 'var(--pixel)', color: 'rgba(240,236,224,0.45)', textTransform: 'uppercase', letterSpacing: 1 }}>LOCAL</div>
      </div>

      {/* Game Container */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <TwoPlayerGame />
      </div>

      {/* Instructions */}
      <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(240,236,224,0.1)', fontSize: 12, color: 'rgba(240,236,224,0.45)', textAlign: 'center' }}>
        <Controls />
      </div>
    </main>
  );
}
