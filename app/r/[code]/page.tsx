import Link from 'next/link';
import SoundToggle from '../../components/SoundToggle';
import { normalizeCode, isCode, type OnlineMode, type CityId } from '../../_lib/online/protocol';
import LobbyLoader from './LobbyLoader';

export const metadata = {
  title: 'Online - Parapluie',
  description: 'Walk under one umbrella with a friend online',
};

const MODES: OnlineMode[] = ['open-world', 'runner', 'duel'];
const CITIES: CityId[] = ['newyork', 'tokyo', 'paris'];

/**
 * /r/ABCD joins room ABCD. /r/ABCD?new=runner&city=tokyo opens it, which is
 * what the "With a friend online" buttons link to.
 */
export default async function RoomPage({ params, searchParams }: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const code = normalizeCode((await params).code);
  const q = await searchParams;
  const mode = MODES.find(m => m === q.new);
  const city = CITIES.find(c => c === q.city) ?? 'newyork';

  return (
    <main style={{ width: '100vw', height: '100dvh', overflow: 'hidden', background: 'var(--asphalt)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(240,236,224,0.12)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(240,236,224,0.025)' }}>
        <Link href="/" style={{ textDecoration: 'none', color: 'rgba(240,236,224,0.6)', fontSize: 8, fontWeight: 700, fontFamily: 'var(--pixel)', textTransform: 'uppercase', letterSpacing: 1 }}>
          ◀ EXIT
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--fog)', margin: 0, fontFamily: "'Space Grotesk',sans-serif" }}>Online</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SoundToggle />
          <div style={{ fontSize: 8, fontFamily: 'var(--pixel)', color: 'rgba(240,236,224,0.45)', textTransform: 'uppercase', letterSpacing: 1 }}>
          {isCode(code) ? `ROOM ${code}` : 'ONLINE'}
        </div>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', minHeight: 0 }}>
        {isCode(code)
          ? <LobbyLoader code={code} create={mode ? { mode, city } : undefined} />
          : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--fog)' }}>
              <p style={{ fontSize: 18, fontWeight: 700 }}>That isn&apos;t a room code</p>
              <p style={{ fontSize: 12, color: 'rgba(240,236,224,0.5)' }}>Codes are four letters, like TAXW.</p>
              <Link href="/" style={{ color: 'var(--fog)', fontSize: 13 }}>Home</Link>
            </div>
          )}
      </div>
    </main>
  );
}
