/**
 * One room: two seats, a lobby, and a pipe between the players.
 *
 * Connect with ws(s)://<relay>/room/CODE?v=<PROTOCOL>&sid=<session>&name=<name>
 * and, to open a new room, &create=1&mode=<mode>&city=<city>. A player who
 * drops can come back with the same sid within RECLAIM_MS and keeps their seat.
 *
 * State lives in memory: the object stays alive while a socket is open, and a
 * room nobody is in has nothing worth keeping.
 */

import {
  PROTOCOL, RESUME_MS,
  type ClientMsg, type ServerMsg, type RoomState, type Seat, type Match,
  type OnlineMode, type CityId,
} from '../../app/_lib/online/protocol';

/** How long a dropped player's seat is held for them. */
const RECLAIM_MS = 60_000;
/** The 3-2-1 before play: long enough for both screens to show it. */
const COUNTDOWN_MS = 3_500;

const MODES: OnlineMode[] = ['open-world', 'runner', 'duel'];
const CITIES: CityId[] = ['newyork', 'tokyo', 'paris'];
const other = (s: Seat): Seat => (s === 'p1' ? 'p2' : 'p1');
const UNPAUSED = { pausedMs: 0, pausedSince: null, resumeAt: null, pausedBy: null } as const;

interface Occupant { sid: string; ws: WebSocket | null; over: boolean; releaseAt: number }

export class Room implements DurableObject {
  private room: RoomState | null = null;
  private occupants = new Map<Seat, Occupant>();
  /** the last finished match, so a duel's round 2 reuses round 1's seed */
  private lastMatch: Match | null = null;
  private releaseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const code = url.pathname.split('/').pop()!.toUpperCase();
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    const refuse = (err: Extract<ServerMsg, { t: 'error' }>) => {
      server.send(JSON.stringify(err));
      server.close(4000, err.code);
      return new Response(null, { status: 101, webSocket: client });
    };

    if (Number(url.searchParams.get('v')) !== PROTOCOL) {
      return refuse({ t: 'error', code: 'version', message: 'This room runs a different version of Parapluie. Refresh to update.' });
    }

    this.releaseExpired();
    const sid = (url.searchParams.get('sid') ?? '').slice(0, 64) || crypto.randomUUID();
    const name = cleanName(url.searchParams.get('name'));

    if (!this.room) {
      if (url.searchParams.get('create') !== '1') {
        return refuse({ t: 'error', code: 'missing', message: `No room called ${code}. Check the letters?` });
      }
      const mode = url.searchParams.get('mode') as OnlineMode;
      const city = url.searchParams.get('city') as CityId;
      this.room = {
        code,
        mode: MODES.includes(mode) ? mode : 'open-world',
        city: CITIES.includes(city) ? city : 'newyork',
        host: 'p1', umbrella: 'p1', seats: {}, match: null,
      };
      this.lastMatch = null;
    }

    // Same session coming back keeps its seat; otherwise take a free one.
    let seat = ([...this.occupants.entries()].find(([, o]) => o.sid === sid)?.[0]);
    if (!seat) {
      seat = (['p1', 'p2'] as Seat[]).find(s => !this.occupants.has(s));
      if (!seat) return refuse({ t: 'error', code: 'full', message: 'That room already has two players.' });
    }

    const prev = this.occupants.get(seat);
    if (prev?.ws) { try { prev.ws.close(4001, 'replaced'); } catch { /* already gone */ } }
    this.occupants.set(seat, { sid, ws: server, over: false, releaseAt: 0 });
    const info = this.room.seats[seat];
    this.room.seats[seat] = { name: name || info?.name || defaultName(seat), connected: true, ready: false };
    if (!this.room.seats[this.room.host]) this.room.host = seat;

    const you = seat;
    server.addEventListener('message', ev => this.onMessage(you, server, ev.data));
    server.addEventListener('close', () => this.onClose(you, server));
    server.addEventListener('error', () => this.onClose(you, server));

    // back from a drop: count down and carry on
    const m = this.room.match;
    if (m?.pausedBy === 'net' && m.resumeAt === null && this.everyoneHere()) m.resumeAt = Date.now() + RESUME_MS;

    this.send(server, { t: 'welcome', seat, room: this.room, now: Date.now() });
    this.broadcastRoom();
    return new Response(null, { status: 101, webSocket: client });
  }

  private onMessage(seat: Seat, ws: WebSocket, data: unknown) {
    if (this.occupants.get(seat)?.ws !== ws || !this.room) return;
    let msg: ClientMsg;
    try { msg = JSON.parse(typeof data === 'string' ? data : '') as ClientMsg; } catch { return; }
    const room = this.room;
    const lobby = !room.match;

    switch (msg.t) {
      case 'ping':
        this.send(ws, { t: 'pong', c: msg.c, s: Date.now() });
        return;
      case 'relay': {
        const peer = this.occupants.get(other(seat))?.ws;
        if (peer) this.send(peer, { t: 'relay', m: msg.m });
        return;
      }
      case 'name':
        if (room.seats[seat]) room.seats[seat]!.name = cleanName(msg.name) || room.seats[seat]!.name;
        break;
      case 'settings':
        if (seat !== room.host || !lobby) return;
        if (msg.mode && MODES.includes(msg.mode) && msg.mode !== room.mode) { room.mode = msg.mode; this.lastMatch = null; }
        if (msg.city && CITIES.includes(msg.city)) room.city = msg.city;
        this.unready();
        break;
      case 'swap':
        if (!lobby) return;
        room.umbrella = other(room.umbrella);
        this.lastMatch = null;
        this.unready();
        break;
      case 'pause': {
        const m = room.match;
        if (!m) return;
        if (msg.paused) this.pause(seat);
        else if (m.pausedSince !== null && m.resumeAt === null && this.everyoneHere()) m.resumeAt = Date.now() + RESUME_MS;
        else return;
        break;
      }
      case 'ready':
        if (!lobby || !room.seats[seat]) return;
        room.seats[seat]!.ready = msg.ready;
        if (this.bothReady()) { this.start(); return; }
        break;
      case 'over': {
        const me = this.occupants.get(seat);
        if (me) me.over = true;
        this.maybeEndMatch();
        break;
      }
      default:
        return;
    }
    this.broadcastRoom();
  }

  private onClose(seat: Seat, ws: WebSocket) {
    const occ = this.occupants.get(seat);
    if (!occ || occ.ws !== ws || !this.room) return;
    occ.ws = null;
    occ.releaseAt = Date.now() + RECLAIM_MS;
    const info = this.room.seats[seat];
    if (info) { info.connected = false; info.ready = false; }
    // mid-match, a drop freezes the clock for both until they're back
    if (this.room.match) this.pause('net');
    this.maybeEndMatch();
    this.broadcastRoom();
    this.scheduleRelease();
  }

  /** Freeze the match clock (or keep it frozen, restarting any resume countdown). */
  private pause(by: Seat | 'net') {
    const m = this.room?.match;
    if (!m) return;
    const now = Date.now();
    if (m.pausedSince !== null && m.resumeAt !== null && m.resumeAt <= now) {
      // the previous pause is over: fold it into the total
      m.pausedMs += m.resumeAt - m.pausedSince;
      m.pausedSince = null;
    }
    if (m.pausedSince === null) m.pausedSince = now;
    // paused again during a 3-2-1: the clock never restarted, so just drop the countdown
    m.resumeAt = null;
    m.pausedBy = by;
  }

  private everyoneHere() {
    const s = this.room!.seats;
    return !!(s.p1?.connected && s.p2?.connected);
  }

  private bothReady() {
    const s = this.room!.seats;
    return !!(s.p1?.connected && s.p1.ready && s.p2?.connected && s.p2.ready);
  }

  private start() {
    const room = this.room!;
    const last = this.lastMatch;
    let match: Match;
    if (room.mode === 'duel' && last?.mode === 'duel' && last.round === 1) {
      // round 2: same goals, roles swapped
      match = { ...last, round: 2, umbrella: other(last.umbrella), startAt: Date.now() + COUNTDOWN_MS, ...UNPAUSED };
    } else {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0];
      // the duel's first umbrella is a coin flip; co-op uses the roles from the lobby
      const umbrella = room.mode === 'duel' ? (seed & 1 ? 'p1' : 'p2') : room.umbrella;
      match = { seed, startAt: Date.now() + COUNTDOWN_MS, mode: room.mode, city: room.city, umbrella, round: 1, ...UNPAUSED };
    }
    room.match = match;
    for (const occ of this.occupants.values()) occ.over = false;
    this.unready();
    for (const occ of this.occupants.values()) if (occ.ws) this.send(occ.ws, { t: 'start', match });
    this.broadcastRoom();
  }

  /** A match ends when every connected player has reported it over, or nobody is left in it. */
  private maybeEndMatch() {
    const room = this.room;
    if (!room?.match) return;
    const live = [...this.occupants.values()].filter(o => o.ws);
    if (live.length && !live.every(o => o.over)) return;
    // a duel cut short by a disconnect doesn't count as round 1 of anything
    const finished = live.length === 2 || (live.length === 1 && [...this.occupants.values()].every(o => o.over));
    this.lastMatch = finished ? room.match : null;
    room.match = null;
  }

  private unready() {
    for (const s of Object.values(this.room!.seats)) if (s) s.ready = false;
  }

  private scheduleRelease() {
    if (this.releaseTimer) return;
    this.releaseTimer = setTimeout(() => {
      this.releaseTimer = null;
      this.releaseExpired();
      this.broadcastRoom();
      if ([...this.occupants.values()].some(o => !o.ws)) this.scheduleRelease();
    }, RECLAIM_MS + 1_000);
  }

  /** Free seats whose players have been gone too long; forget an empty room. */
  private releaseExpired() {
    if (!this.room) return;
    const now = Date.now();
    for (const [seat, occ] of this.occupants) {
      if (!occ.ws && occ.releaseAt && occ.releaseAt <= now) {
        this.occupants.delete(seat);
        delete this.room.seats[seat];
      }
    }
    if (!this.occupants.size) { this.room = null; this.lastMatch = null; return; }
    if (!this.room.seats[this.room.host]) this.room.host = [...this.occupants.keys()][0];
  }

  private broadcastRoom() {
    if (!this.room) return;
    for (const occ of this.occupants.values()) if (occ.ws) this.send(occ.ws, { t: 'room', room: this.room });
  }

  private send(ws: WebSocket, msg: ServerMsg) {
    try { ws.send(JSON.stringify(msg)); } catch { /* the close handler will tidy up */ }
  }
}

function cleanName(raw: string | null | undefined): string {
  return (raw ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
}

function defaultName(seat: Seat): string {
  return seat === 'p1' ? 'Drizzle' : 'Puddle';
}
