'use client';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { RoomClient, relayUrl, playerName, savePlayerName, newCode, type Status } from '../../_lib/online/client';
import type { RoomState, Match, Seat, OnlineMode, CityId } from '../../_lib/online/protocol';
import { PLAYERS } from '../../_lib/players';
import { CITIES, CITY_IDS } from '../../_lib/cities';
import { GIVE_UP_MS, type OnlineResult } from './common';

const OnlineSquare = dynamic(() => import('./OnlineSquare'), { ssr: false });
const OnlineRunner = dynamic(() => import('./OnlineRunner'), { ssr: false });

const MODE_NAMES: Record<OnlineMode, string> = { 'open-world': 'Open world', runner: 'Runner', duel: 'Duel' };
const MODE_HINTS: Record<OnlineMode, string> = {
  'open-world': 'Co-op on the open square. One holds the umbrella, one follows.',
  runner: 'Co-op down a scrolling street. Pick a city.',
  duel: 'Two rounds. Each of you holds the umbrella once; higher total wins.',
};

const pill = (on: boolean): React.CSSProperties => ({
  padding: '6px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
  border: '.5px solid', borderColor: on ? 'rgba(240,236,224,0.5)' : 'rgba(240,236,224,0.15)',
  background: on ? 'rgba(240,236,224,0.12)' : 'transparent', color: on ? 'var(--fog)' : 'rgba(240,236,224,0.5)',
});
const primary: React.CSSProperties = {
  padding: '12px 36px', borderRadius: 26, background: 'var(--fog)', color: '#0d110b', border: 'none',
  fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
};
const quiet: React.CSSProperties = {
  padding: '8px 18px', borderRadius: 20, background: 'transparent', color: 'rgba(240,236,224,0.6)',
  border: '.5px solid rgba(240,236,224,0.25)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none',
};

/**
 * An online room: invite, lobby, the match itself, results and rematch.
 * `create` is set for whoever opened the room (from a mode menu); everyone
 * else just joins by code.
 */
export default function Lobby({ code, create }: { code: string; create?: { mode: OnlineMode; city: CityId } }) {
  const base = useMemo(() => relayUrl(), []);
  const [name, setName] = useState(playerName);
  const client = useMemo(() => (base ? new RoomClient(base, code, { create, name }) : null),
    // the client is made once per room; later name edits go over the wire
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, code]);
  const [status, setStatus] = useState<Status>('connecting');
  const [room, setRoom] = useState<RoomState | null>(null);
  const [seat, setSeat] = useState<Seat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [results, setResults] = useState<OnlineResult[]>([]);
  const [copied, setCopied] = useState(false);
  // matches this tab has already finished (by start time): the relay keeps
  // listing one until both players are done, and it must not be re-entered
  const finished = useRef(new Set<number>());
  const router = useRouter();
  // a once-a-second tick while a match runs, for the "give up waiting" button
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!match) return;
    const id = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, [match]);

  useEffect(() => {
    if (!client) return;
    const off = client.on({
      status: setStatus,
      room: r => {
        setRoom(r);
        setSeat(client.seat);
        // back in a room whose match is still running (a reload): rejoin it
        const running = r.match;
        if (running && !finished.current.has(running.startAt)) setMatch(m => m ?? running);
      },
      start: m => {
        setMatch(m);
        // a new duel, or any co-op run, starts a fresh result list
        if (m.round === 1) setResults([]);
      },
      error: (_code, message) => setError(message),
    });
    client.connect();
    return () => { off(); client.close(); };
  }, [client]);

  const onOver = useCallback((r: OnlineResult) => {
    setResults(rs => [...rs, r]);
    setMatch(m => { if (m) finished.current.add(m.startAt); return null; });
    client?.send({ t: 'over' });
  }, [client]);

  const link = typeof location !== 'undefined' ? `${location.origin}/r/${code}` : `/r/${code}`;
  const share = async () => {
    const text = `Walk with me under one umbrella. Room ${code}`;
    try {
      if (navigator.share) { await navigator.share({ title: 'Parapluie', text, url: link }); return; }
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* dismissed */ }
  };

  // ── screens ──
  if (!base) {
    return (
      <Centered>
        <Title>Online play isn&apos;t set up here</Title>
        <Note>This site has no relay configured (NEXT_PUBLIC_RELAY_URL). You can still play on one screen.</Note>
        <Link href="/" style={quiet}>Home</Link>
      </Centered>
    );
  }
  if (error) {
    return (
      <Centered>
        <Title>Can&apos;t join {code}</Title>
        <Note>{error}</Note>
        <div className="flex gap-3">
          <button onClick={() => router.push(`/r/${newCode()}?new=${room?.mode ?? create?.mode ?? 'open-world'}`)} style={primary}>Start your own room</button>
          <Link href="/" style={quiet}>Home</Link>
        </div>
      </Centered>
    );
  }
  if (!client || !room || !seat) {
    return (
      <Centered>
        <Title>{status === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}</Title>
        <Note>Room {code}</Note>
      </Centered>
    );
  }

  if (match) {
    const Game = match.mode === 'runner' ? OnlineRunner : OnlineSquare;
    // a partner who dropped and hasn't come back: offer to stop waiting
    const live = room.match;
    const other: Seat = seat === 'p1' ? 'p2' : 'p1';
    const waited = live?.pausedBy === 'net' && live.pausedSince !== null && !room.seats[other]?.connected
      ? client.now() - live.pausedSince : 0;
    const giveUp = waited > (match.mode === 'duel' ? GIVE_UP_MS.duel : GIVE_UP_MS.coop);
    const endNow = () => onOver({ mode: match.mode, round: match.round, umbrella: match.umbrella, end: 'left', wScore: 0, fScore: 0, time: 0, city: match.city });
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <Game key={`${match.seed}-${match.round}-${match.startAt}`} client={client} match={match} seat={seat} onOver={onOver} />
        {giveUp && (
          <div style={{ position: 'absolute', bottom: 40, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
            <button onClick={endNow} style={primary}>End match</button>
          </div>
        )}
        {status !== 'open' && (
          <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', fontSize: 12, color: 'var(--amber, #f0b34a)' }}>
            {status === 'reconnecting' ? 'Reconnecting…' : 'Disconnected'}
          </div>
        )}
      </div>
    );
  }

  const them: Seat = seat === 'p1' ? 'p2' : 'p1';
  const mine = room.seats[seat];
  const theirs = room.seats[them];
  const host = room.host === seat;
  const lastResult = results[results.length - 1];
  const duelMidway = room.mode === 'duel' && lastResult?.mode === 'duel' && lastResult.round === 1 && lastResult.end !== 'left';

  const rename = (n: string) => {
    const clean = n.trim().slice(0, 16);
    if (!clean) return;
    savePlayerName(clean);
    client.send({ t: 'name', name: clean });
  };

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', gap: 22 }}>
      {lastResult && <Results results={results} room={room} seat={seat} />}

      {/* invite */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(240,236,224,0.4)', marginBottom: 6 }}>Room</div>
        <div aria-label={`Room code ${code.split('').join(', ')}`} style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 40, fontWeight: 700, letterSpacing: '.18em', color: 'var(--fog)' }}>{code}</div>
        {!theirs && (
          <div style={{ marginTop: 10 }}>
            <button onClick={share} style={primary}>{copied ? 'Link copied ✓' : 'Invite a friend'}</button>
            <Note>Send the link, or tell them the code: they open Parapluie and type it in.</Note>
          </div>
        )}
      </div>

      {/* seats: you first */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }} aria-live="polite">
        <SeatCard seat={seat} you info={mine} umbrella={room.mode !== 'duel' && room.umbrella === seat}>
          <input
            defaultValue={mine?.name ?? name}
            maxLength={16}
            aria-label="Your name"
            onChange={e => setName(e.target.value)}
            onBlur={e => rename(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            style={{ width: 120, background: 'transparent', border: 'none', borderBottom: '1px solid rgba(240,236,224,0.25)', color: 'var(--fog)', fontSize: 14, fontWeight: 600, textAlign: 'center', fontFamily: 'inherit', outline: 'none' }}
          />
        </SeatCard>
        <SeatCard seat={them} info={theirs} umbrella={room.mode !== 'duel' && room.umbrella === them}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fog)' }}>{theirs?.name ?? 'Waiting for a friend…'}</span>
        </SeatCard>
      </div>

      {/* what to play */}
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
        <div className="flex gap-2 flex-wrap justify-center">
          {(Object.keys(MODE_NAMES) as OnlineMode[]).map(m => (
            <button key={m} disabled={!host || duelMidway} onClick={() => client.send({ t: 'settings', mode: m })} style={{ ...pill(room.mode === m), cursor: host ? 'pointer' : 'default' }}>{MODE_NAMES[m]}</button>
          ))}
        </div>
        {room.mode === 'runner' && (
          <div className="flex gap-2 flex-wrap justify-center">
            {CITY_IDS.map(c => (
              <button key={c} disabled={!host} onClick={() => client.send({ t: 'settings', city: c })} style={{ ...pill(room.city === c), cursor: host ? 'pointer' : 'default' }}>{CITIES[c].name}</button>
            ))}
          </div>
        )}
        <Note>
          {room.mode === 'runner' ? CITIES[room.city].hint : MODE_HINTS[room.mode]}
          {!host && ` ${room.seats[room.host]?.name ?? 'The host'} picks.`}
        </Note>
        {room.mode !== 'duel' && (
          <button onClick={() => client.send({ t: 'swap' })} style={quiet}>
            ⇄ Swap: {room.umbrella === seat ? `${theirs?.name ?? 'your friend'} holds the umbrella` : 'you hold the umbrella'}
          </button>
        )}
        {duelMidway && <Note>Round 2: {lastResult.umbrella === seat ? `${theirs?.name} holds the umbrella` : 'your turn with the umbrella'}.</Note>}
      </div>

      {/* ready */}
      <div style={{ textAlign: 'center' }}>
        <button
          disabled={!theirs?.connected}
          onClick={() => client.send({ t: 'ready', ready: !mine?.ready })}
          style={{ ...primary, opacity: theirs?.connected ? 1 : 0.4 }}
        >
          {mine?.ready ? `Ready ✓ · waiting for ${theirs?.name ?? 'them'}` : duelMidway ? 'Ready for round 2' : lastResult ? 'Ready: play again' : 'Ready'}
        </button>
        {theirs?.ready && !mine?.ready && <Note>{theirs.name} is ready.</Note>}
        {theirs && !theirs.connected && <Note>{theirs.name} dropped out; waiting for them to come back.</Note>}
        <Note>Your controls: WASD, arrows or a gamepad · Space calls your partner · Esc pauses</Note>
      </div>

      <Link href="/" onClick={() => client.close()} style={quiet}>Leave room</Link>
    </div>
  );
}

function SeatCard({ seat, info, you, umbrella, children }: {
  seat: Seat; info?: { connected: boolean; ready: boolean }; you?: boolean; umbrella: boolean; children: React.ReactNode;
}) {
  const p = PLAYERS[seat];
  const on = !!info?.connected;
  return (
    <div style={{
      minWidth: 170, padding: '14px 18px', borderRadius: 14, textAlign: 'center',
      border: `1px solid ${on ? p.color : 'rgba(240,236,224,0.15)'}`,
      background: on ? `rgba(${p.rgb},0.1)` : 'rgba(240,236,224,0.03)',
    }}>
      <div style={{ fontSize: 11, color: p.color, marginBottom: 6, fontWeight: 600 }}>{p.shape} {you ? 'You' : 'Friend'}{umbrella ? ' · ☂ umbrella' : ''}</div>
      {children}
      <div style={{ fontSize: 11, color: 'rgba(240,236,224,0.5)', marginTop: 6 }}>
        {!info ? 'empty seat' : !info.connected ? 'reconnecting…' : info.ready ? 'ready ✓' : 'not ready'}
      </div>
    </div>
  );
}

function Results({ results, room, seat }: { results: OnlineResult[]; room: RoomState; seat: Seat }) {
  const last = results[results.length - 1];
  const nameOf = (s: Seat) => (s === seat ? 'You' : room.seats[s]?.name ?? PLAYERS[s].name);
  const pts = (r: OnlineResult, s: Seat) => (r.umbrella === s ? r.wScore : r.fScore);

  if (last.mode !== 'duel') {
    const place = last.mode === 'runner' ? ` through ${CITIES[last.city].name}` : '';
    const partner = nameOf(seat === 'p1' ? 'p2' : 'p1');
    if (last.end === 'left') {
      return <div style={{ textAlign: 'center' }}><Title>Run ended: {partner} left</Title></div>;
    }
    return (
      <div style={{ textAlign: 'center' }}>
        <Title>{`You and ${partner} lasted ${last.time}s${place}`}</Title>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 32, fontWeight: 700, color: 'var(--fog)' }}>{last.wScore + last.fScore}</div>
        <Note>goals {last.wScore} · staying dry {last.fScore}</Note>
      </div>
    );
  }

  const both: Seat[] = ['p1', 'p2'];
  const total = (s: Seat) => results.reduce((a, r) => a + pts(r, s), 0);
  const done = results.length >= 2 || last.end === 'left';
  const winner = done && total('p1') !== total('p2') ? (total('p1') > total('p2') ? 'p1' : 'p2') : null;
  return (
    <div style={{ textAlign: 'center' }}>
      <Title>
        {last.end === 'left' ? 'Match ended: no winner'
          : !done ? `Round 1: ${last.end === 'home' ? 'made it home' : 'soaked'}`
            : winner ? `${winner === seat ? 'You win' : `${nameOf(winner)} wins`}!` : 'Draw!'}
      </Title>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto auto auto', gap: '4px 20px', justifyContent: 'center', alignItems: 'baseline' }}>
        <span />
        {both.map(s => <span key={s} style={{ fontSize: 11, fontWeight: 600, color: PLAYERS[s].color }}>{PLAYERS[s].shape} {nameOf(s)}</span>)}
        {results.map((r, i) => (
          <Row key={i} label={`round ${i + 1}`} values={both.map(s => `${pts(r, s)} ${r.umbrella === s ? '☂' : '🚶'}`)} />
        ))}
        {results.length > 1 && <Row label="total" values={both.map(s => String(total(s)))} strong />}
      </div>
    </div>
  );
}

function Row({ label, values, strong }: { label: string; values: string[]; strong?: boolean }) {
  return (
    <>
      <span style={{ fontSize: 11, color: 'rgba(240,236,224,0.45)', textAlign: 'left' }}>{label}</span>
      {values.map((v, i) => <span key={i} style={{ fontSize: strong ? 20 : 14, fontWeight: strong ? 700 : 400, color: 'var(--fog)' }}>{v}</span>)}
    </>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center' }}>{children}</div>;
}
function Title({ children }: { children: React.ReactNode }) {
  return <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 22, fontWeight: 700, color: 'var(--fog)', margin: '0 0 6px' }}>{children}</p>;
}
function Note({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 12, color: 'rgba(240,236,224,0.5)', margin: '6px 0 0', lineHeight: 1.6, maxWidth: 360 }}>{children}</p>;
}
