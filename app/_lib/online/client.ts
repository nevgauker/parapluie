/**
 * The browser's side of a room: one WebSocket to the relay, reconnecting on
 * its own after a drop, plus a clock synced to the relay's so both players
 * agree on when things happen.
 */

import {
  PROTOCOL, CODE_ALPHABET, CODE_LENGTH,
  type ClientMsg, type ServerMsg, type RoomState, type Seat, type Match, type GameMsg,
  type OnlineMode, type CityId,
} from './protocol';

export type Status = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface RoomEvents {
  status?: (s: Status) => void;
  room?: (room: RoomState) => void;
  start?: (match: Match) => void;
  game?: (msg: GameMsg) => void;
  error?: (code: Extract<ServerMsg, { t: 'error' }>['code'], message: string) => void;
}

/**
 * Where the relay lives. Set NEXT_PUBLIC_RELAY_URL (e.g.
 * wss://parapluie-relay.<you>.workers.dev) for a deployed site; on localhost
 * it defaults to `wrangler dev` on port 8787.
 */
export function relayUrl(): string | null {
  const env = process.env.NEXT_PUBLIC_RELAY_URL;
  if (env) return env.replace(/\/$/, '');
  if (typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname)) {
    return `ws://${location.hostname}:8787`;
  }
  return null;
}

export function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return [...bytes].map(b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

const RAIN_NAMES = ['Drizzle', 'Puddle', 'Mist', 'Squall', 'Downpour', 'Shower', 'Sprinkle', 'Monsoon', 'Dewdrop', 'Brolly'];

/** A remembered player name, or a fresh rain name the first time. */
export function playerName(): string {
  try {
    const saved = localStorage.getItem('parapluie:name');
    if (saved) return saved;
  } catch { /* storage blocked: fall through */ }
  return RAIN_NAMES[Math.floor(Math.random() * RAIN_NAMES.length)];
}

export function savePlayerName(name: string) {
  try { localStorage.setItem('parapluie:name', name); } catch { /* not remembered, fine */ }
}

/** One id per room per tab, so a reload or a dropped connection gets the same seat back. */
function sessionId(code: string): string {
  const key = `parapluie:sid:${code}`;
  try {
    const saved = sessionStorage.getItem(key);
    if (saved) return saved;
    const sid = crypto.randomUUID();
    sessionStorage.setItem(key, sid);
    return sid;
  } catch {
    return crypto.randomUUID();
  }
}

const PING_EVERY_MS = 2_000;
const RETRY_MS = [500, 1_000, 2_000, 4_000, 8_000];

export class RoomClient {
  seat: Seat | null = null;
  room: RoomState | null = null;
  status: Status = 'connecting';
  /** relay time minus local time, ms */
  private offset = 0;
  /** round trip of the best recent ping, ms */
  rtt = 0;
  private samples: { rtt: number; offset: number }[] = [];
  private ws: WebSocket | null = null;
  private closedByUs = false;
  private retries = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<RoomEvents>();

  constructor(
    private base: string,
    readonly code: string,
    private opts: { create?: { mode: OnlineMode; city: CityId }; name: string },
  ) {}

  on(events: RoomEvents): () => void {
    this.listeners.add(events);
    return () => this.listeners.delete(events);
  }

  connect() {
    this.closedByUs = false;
    const q = new URLSearchParams({ v: String(PROTOCOL), sid: sessionId(this.code), name: this.opts.name });
    // ask to create only on the very first connect; a reconnect just rejoins
    if (this.opts.create && !this.room) {
      q.set('create', '1');
      q.set('mode', this.opts.create.mode);
      q.set('city', this.opts.create.city);
    }
    const ws = new WebSocket(`${this.base}/room/${this.code}?${q}`);
    this.ws = ws;
    ws.onopen = () => {
      this.retries = 0;
      this.ping();
      this.pingTimer = setInterval(() => this.ping(), PING_EVERY_MS);
    };
    ws.onmessage = ev => this.onMessage(ev.data);
    ws.onclose = () => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.closedByUs || this.status === 'closed') return;
      this.setStatus('reconnecting');
      const wait = RETRY_MS[Math.min(this.retries++, RETRY_MS.length - 1)];
      this.retryTimer = setTimeout(() => this.connect(), wait);
    };
  }

  close() {
    this.closedByUs = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close();
    this.ws = null;
    this.setStatus('closed');
  }

  send(msg: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** Pass a message to the other player. */
  game(m: GameMsg) {
    this.send({ t: 'relay', m });
  }

  /** The relay's clock, ms. */
  now(): number {
    return Date.now() + this.offset;
  }

  private ping() {
    this.send({ t: 'ping', c: Date.now() });
  }

  private onMessage(data: unknown) {
    let msg: ServerMsg;
    try { msg = JSON.parse(String(data)) as ServerMsg; } catch { return; }
    switch (msg.t) {
      case 'pong': {
        const back = Date.now();
        const rtt = back - msg.c;
        // the relay read its clock about halfway through the round trip
        this.samples.push({ rtt, offset: msg.s - (msg.c + rtt / 2) });
        if (this.samples.length > 8) this.samples.shift();
        const best = this.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
        this.offset = best.offset;
        this.rtt = best.rtt;
        return;
      }
      case 'welcome':
        this.seat = msg.seat;
        if (!this.samples.length) this.offset = msg.now - Date.now();
        this.room = msg.room;
        this.setStatus('open');
        this.emit(l => l.room?.(msg.room));
        return;
      case 'room':
        this.room = msg.room;
        this.emit(l => l.room?.(msg.room));
        return;
      case 'start':
        this.emit(l => l.start?.(msg.match));
        return;
      case 'relay':
        this.emit(l => l.game?.(msg.m));
        return;
      case 'error':
        this.status = 'closed';
        this.closedByUs = true;
        this.emit(l => l.error?.(msg.code, msg.message));
        this.setStatus('closed');
        return;
    }
  }

  private setStatus(s: Status) {
    this.status = s;
    this.emit(l => l.status?.(s));
  }

  private emit(fn: (l: RoomEvents) => void) {
    for (const l of this.listeners) fn(l);
  }
}
