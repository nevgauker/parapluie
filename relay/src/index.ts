/**
 * Parapluie relay: pairs two players online.
 *
 *   GET /room/ABCD   (WebSocket upgrade)  → the Room durable object for that code
 *   GET /health                           → "ok"
 *
 * One durable object per room code holds the lobby and passes messages
 * between the two players. See room.ts and app/_lib/online/protocol.ts.
 */

import { isCode } from '../../app/_lib/online/protocol';
export { Room } from './room';

export interface Env {
  ROOMS: DurableObjectNamespace;
  /** comma-separated origins allowed to connect, e.g. "https://parapluie.example"; empty allows any */
  ALLOWED_ORIGINS?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') return new Response('ok');

    const match = url.pathname.match(/^\/room\/([A-Za-z]+)$/);
    if (!match) return new Response('not found', { status: 404 });

    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('expected a WebSocket upgrade', { status: 426 });
    }

    const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);
    const origin = request.headers.get('Origin') ?? '';
    if (allowed.length && !allowed.includes(origin)) {
      return new Response('origin not allowed', { status: 403 });
    }

    const code = match[1].toUpperCase();
    if (!isCode(code)) return new Response('bad room code', { status: 400 });

    const room = env.ROOMS.get(env.ROOMS.idFromName(code));
    return room.fetch(request);
  },
};
