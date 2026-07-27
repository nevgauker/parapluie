'use client';
import dynamic from 'next/dynamic';

const StreetBackdrop = dynamic(() => import('./StreetBackdrop'), { ssr: false });
const AnimatedTitle  = dynamic(() => import('./AnimatedTitle'),  { ssr: false });

export { StreetBackdrop, AnimatedTitle };
