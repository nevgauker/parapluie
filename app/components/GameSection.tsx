'use client';
import dynamic from 'next/dynamic';

const OpenUmbrellaGame = dynamic(() => import('./OpenUmbrellaGame'), { ssr: false });
const OpenWorldGame    = dynamic(() => import('./OpenWorldGame'),    { ssr: false });
const RunnerGame       = dynamic(() => import('./RunnerGame'),       { ssr: false });
const RunnerModeSelector = dynamic(() => import('./RunnerModeSelector'), { ssr: false });
const RunnerGameSolo   = dynamic(() => import('./RunnerGameSolo'),   { ssr: false });
const RunnerGameTwoPlayer = dynamic(() => import('./RunnerGameTwoPlayer'), { ssr: false });
const TwoPlayerGame    = dynamic(() => import('./TwoPlayerGame'),    { ssr: false });

export { OpenUmbrellaGame, OpenWorldGame, RunnerGame, RunnerModeSelector, RunnerGameSolo, RunnerGameTwoPlayer, TwoPlayerGame };
