# Parapluie relay

A Cloudflare Worker with one Durable Object per room code. It pairs two
players for online play: it seats them, keeps the lobby (mode, city, roles,
ready), picks each match's seed and start time, keeps the match clock
(including pauses and reconnects), answers clock pings, and passes game
messages between the two browsers. All gameplay runs in the browsers; the
relay never simulates the game.

The message format lives in `../app/_lib/online/protocol.ts` and is shared
with the site, so both always agree.

## Run it locally

```bash
cd relay
npm install
npm run dev        # wrangler dev on http://localhost:8787
```

The site, when opened on `localhost`, connects to `ws://localhost:8787`
automatically. Open two browsers (or a normal and a private window), pick
**With a friend online** in one, and join with the code in the other.

## Deploy

You need a Cloudflare account. Durable Objects with SQLite storage, which this
uses, are available on the free plan.

```bash
cd relay
npm install
npx wrangler login     # once
npm run deploy         # wrangler deploy
```

Wrangler prints the Worker's address, e.g.
`https://parapluie-relay.<your-subdomain>.workers.dev`. Then:

1. Set the site's environment variable to the WebSocket form of that address,
   wherever the site is built (Vercel, Cloudflare Pages, etc.):

   ```
   NEXT_PUBLIC_RELAY_URL=wss://parapluie-relay.<your-subdomain>.workers.dev
   ```

   It is read at build time, so rebuild the site after setting it.

2. Optional but recommended: lock the relay to your site's origin by setting
   `ALLOWED_ORIGINS` in `wrangler.toml` (comma-separated, e.g.
   `"https://parapluie.example"`) and deploying again. Left empty, any site
   can connect.

Check it's up: `https://parapluie-relay.<your-subdomain>.workers.dev/health`
answers `ok`.

## How it behaves

- `GET /room/ABCD` with a WebSocket upgrade joins room `ABCD`. Codes are four
  letters from an alphabet without I, L, O.
- The first player in creates the room (`create=1`) and is the host: they pick
  the mode and city. Anyone joining a code nobody has opened gets "No room
  called …".
- A third player is turned away ("room full"); a client on an older protocol
  version is told to refresh.
- A player who drops keeps their seat for 60 s and gets it back by
  reconnecting with the same session id (the site does this on its own). While
  someone is gone mid-match, the match clock stops for both players and
  restarts with a 3-2-1 when they're back.
- Rooms live in memory: once both players have left, the room is forgotten.

## Changing the protocol

Bump `PROTOCOL` in `app/_lib/online/protocol.ts` whenever messages change
shape, and deploy the relay and the site together. Clients on the old version
are refused with a "refresh to update" message.
