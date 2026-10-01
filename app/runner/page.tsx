import { RunnerModeSelector } from '../components/GameSection';
import Link from 'next/link';
import { parsePlay, playLabel } from '../_lib/play';
import { controlsText } from '../_lib/players';

export const metadata = {
  title: 'Runner - Parapluie',
  description: 'Endless runner mode across three cities',
};

export default async function RunnerPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const play = parsePlay((await searchParams).play);
  return (
    <main style={{ width: '100vw', height: '100dvh', overflow: 'hidden', background: 'var(--asphalt)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(245,197,24,0.22)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(240,236,224,0.025)' }}>
        <Link href="/" style={{ textDecoration: 'none', color: 'rgba(245,197,24,0.7)', fontSize: 8, fontWeight: 700, fontFamily: 'var(--pixel)', textTransform: 'uppercase', letterSpacing: 1, transition: 'color 0.2s ease' }}>
          ◀ EXIT
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--fog)', margin: 0, fontFamily: "'Space Grotesk',sans-serif", textShadow: 'var(--glow-umbrella)' }}>Runner</h1>
        <div style={{ fontSize: 8, fontFamily: 'var(--pixel)', color: 'rgba(240,236,224,0.45)', textTransform: 'uppercase', letterSpacing: 1 }}>{playLabel(play, 'ENDLESS')}</div>
      </div>

      {/* Game Container */}
      <div style={{ flex: 1, overflow: 'auto', position: 'relative', minHeight: 0 }}>
        <RunnerModeSelector play={play} />
      </div>

      {/* Instructions */}
      <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(240,236,224,0.1)', fontSize: 12, color: 'rgba(240,236,224,0.45)', textAlign: 'center' }}>
        <span>{play === 'local' ? controlsText() : play === 'solo' ? 'Move the mouse to follow · stay under the umbrella' : 'New York, Tokyo, Paris: each city has its own hazard'}</span>
      </div>
    </main>
  );
}
