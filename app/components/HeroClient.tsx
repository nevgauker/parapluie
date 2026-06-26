'use client';
import dynamic from 'next/dynamic';

const RainCanvas    = dynamic(() => import('./RainCanvas'),    { ssr: false });
const AnimatedTitle = dynamic(() => import('./AnimatedTitle'), { ssr: false });

export { RainCanvas, AnimatedTitle };
