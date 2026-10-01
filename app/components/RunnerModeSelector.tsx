'use client';
import dynamic from 'next/dynamic';
import ModeSelector from './ModeSelector';
import { controlsLine } from '../_lib/players';
import type { Play } from '../_lib/play';

const RunnerGameSolo = dynamic(() => import('./RunnerGameSolo'), { ssr: false });
const RunnerGameTwoPlayer = dynamic(() => import('./RunnerGameTwoPlayer'), { ssr: false });

export default function RunnerModeSelector({ play }: { play?: Play }) {
  return (
    <ModeSelector
      base="/runner"
      title="Runner"
      blurb={<>The street scrolls up.<br />Dodge obstacles. Stay dry.</>}
      play={play}
      online="runner"
      solo={{
        title: 'Solo',
        desc: 'Mouse or touch\nYou follow; she chases goals\nThree cities, three hazards',
        color: 'var(--umbrella)',
        game: <RunnerGameSolo />,
      }}
      local={{
        title: 'Two players, one screen',
        desc: `Cooperative\n${controlsLine('p1')} (umbrella)\n${controlsLine('p2')} (follower)`,
        color: 'var(--brick)',
        game: <RunnerGameTwoPlayer />,
      }}
    />
  );
}
