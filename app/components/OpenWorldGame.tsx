'use client';
import dynamic from 'next/dynamic';
import ModeSelector from './ModeSelector';
import { controlsLine } from '../_lib/players';
import type { Play } from '../_lib/play';

const OpenUmbrellaGame = dynamic(() => import('./OpenUmbrellaGame'), { ssr: false });
const OpenUmbrellaGameTwoPlayer = dynamic(() => import('./OpenUmbrellaGameTwoPlayer'), { ssr: false });

export default function OpenWorldGame({ play }: { play?: Play }) {
  return (
    <ModeSelector
      base="/open-world"
      title="Open World"
      blurb={<>Follow the woman with the umbrella.<br />Chase goals. Don&apos;t get wet.</>}
      play={play}
      online="open-world"
      solo={{
        title: 'Solo',
        desc: 'Mouse or touch\nYou follow; she chases goals',
        color: 'var(--foliage)',
        game: <OpenUmbrellaGame />,
      }}
      local={{
        title: 'Two players, one screen',
        desc: `Cooperative\n${controlsLine('p1')} (umbrella)\n${controlsLine('p2')} (follower)`,
        color: 'var(--brick)',
        game: <OpenUmbrellaGameTwoPlayer />,
      }}
    />
  );
}
