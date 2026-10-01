'use client';
import dynamic from 'next/dynamic';
import type { CityId, OnlineMode } from '../../_lib/online/protocol';

// The lobby reads remembered names and opens sockets: browser only.
const Lobby = dynamic(() => import('../../components/online/Lobby'), { ssr: false });

export default function LobbyLoader(props: { code: string; create?: { mode: OnlineMode; city: CityId } }) {
  return <Lobby {...props} />;
}
