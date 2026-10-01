# Parapluie

*Stay dry, stay close.*

A small rain game in the browser. A woman walks the city under her umbrella.
Someone has to follow her and stay underneath it. She chases whatever catches
her eye, and the rain doesn't care who you are.

Everything is drawn on a `<canvas>` from code: wet asphalt, lamplight, and
rain that stops at the edge of the umbrella's dry circle. The game uses no
sprite sheets or image files; emoji mark the goals and obstacles.

## Play

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and pick a mode.

## Modes

| Mode | Route | Players | Controls |
|---|---|---|---|
| **Open world** | `/open-world` | 1 or 2 | Solo: mouse or touch. Two players: ● P1 (umbrella) WASD or a gamepad, ◆ P2 (follower) arrows or a gamepad |
| **Runner** | `/runner` | 1 or 2 | Same as open world |
| **Two Player duel** | `/two-player` | 2 | ● P1 WASD or a gamepad, ◆ P2 arrows or a gamepad. Roles swap between rounds |

The choice between solo and two players is part of the URL, for example
`/runner?play=local`, so the browser's Back button returns to the mode menu
and a link can open a mode directly.

On touch devices, the two-player modes show an on-screen D-pad for each
player. **Esc**, **P** or a gamepad's **Start** pauses any two-player game,
and switching to another window or tab pauses it too.

### Open world

She wanders an open square. In solo, the game walks her: when she reaches a
goal (a dog, a coffee, a bus), she lingers for a moment and then dashes to the
next one, turning toward it just before she goes. You follow, but you can't
quite match her dash, so you have to see it coming. The solo runner works the
same way. With two players, P1 walks her instead.

### Runner

The street scrolls forward and never stops. Obstacles are solid. Pick a city
before you start:

| City | Feel | Hazard |
|---|---|---|
| **New York** | Fast, wide street, full umbrella | A taxi honks, then races down one kerb lane. Stand near that kerb and you get splashed |
| **Tokyo** | Narrow alley | Petals blow sideways before a gust. The gust shoves you, and the dry spot slides downwind |
| **Paris** | Slow stroll, small umbrella, heavy rain | Café awnings over the kerb keep you dry, even outside the umbrella |

Each city has its own umbrella color, its own street furniture, and its own
things for her to stop at.

### Two Player duel

A match is two rounds. Each player holds the umbrella once and follows once,
and the higher total wins. A coin flip decides who holds it first, and both
rounds start with the same goals, so neither player gets luckier spawns.

- **Umbrella:** collect goals. They pay full points only while your follower
  is under cover, and half if you leave them in the rain.
- **Follower:** score for every second under cover, with more for staying
  near the rim.
- **Round end:** a round lasts 60 seconds. A follower who makes it to the end
  dry gets a bonus. If the follower soaks first, the umbrella gets that bonus
  instead.

### Scoring

The follower's play drives the score in every mode:

- Staying under cover builds a **dry streak** multiplier, up to x4. Stepping
  into the rain breaks it, though a quarter of a second of grace forgives
  clipping the rim.
- Skimming the outer edge of the dry circle pays a **close-call** bonus.
  Hugging her is safe; the rim is where the points are.
- In the two-player modes, a goal pays full points, times the streak, only
  if the follower was under cover when it was collected (with 0.3 s of
  grace). Collected with the follower out in the rain, it pays half.

## Two players on one screen

Every two-player menu has a seat for each player. Press your keys (W or ↑) or
any button on a gamepad to sit down; your seat lights up in your color and
shows what you're playing with. The first gamepad pressed takes the first
empty seat, the next one the other, whatever order they were plugged in.
Once your pad is seated, **A** starts the game. Seating is optional: the
start button works with empty seats.

Players are told apart by shape as well as color (● P1, ◆ P2), on the street,
in the HUD and in the score tables.

## Gamepads

Every two-player mode reads gamepads through the browser's Gamepad API.
Steer with the left stick or the d-pad, press **A** to start or play again,
and **Start** to pause. Browsers only expose a pad after you press one of its
buttons on the page, which is what the seats screen asks you to do.

## Project layout

```
app/
  page.tsx               homepage and mode picker
  open-world/            /open-world (solo or two-player)
  runner/                /runner (solo or two-player)
  two-player/            /two-player (duel)
  components/            one component per game mode, plus:
    ModeSelector.tsx     the solo / two-player menu, driven by ?play=
    Seats.tsx            take-a-seat widget for two-player menus
  _lib/
    street.ts            the renderer: street, props, walkers, umbrella, rain, HUD
    cities.ts            per-city rules: pace, cover, rain, goals, obstacles, colors
    cityEvents.ts        per-city hazards: taxis, gusts, café awnings
    cityStreet.ts        per-city street furniture and road markings
    rules.ts             rules shared by the two-player modes: arena, cover, goals, grace
    dryStreak.ts         follower scoring: streak multiplier and close calls
    rng.ts               seeded random numbers, so a seed replays the same match
    players.ts           who P1 and P2 are: color, shape, keys, controls text
    seats.ts             which gamepad belongs to which player
    input.ts             keyboard and gamepad input as an analog stick
    focus.ts             pause on lost focus, release held keys
    play.ts              the ?play= mode in the URL
    collide.ts           solid obstacles
art/                     reference images the look is based on
.claude/agents/          game-designer and UX reviewer agents for Claude Code
```

The two-player modes play in a fixed-size arena that is scaled to fit the
screen, so every device sees the same street. Movement scales with frame
time, so a 144 Hz screen plays like a 60 Hz one. Tuning values, such as
speeds, bonuses and hazard strength, are named constants at the top of the
file that uses them.

## Development

```bash
npm run dev      # dev server with hot reload
npm run build    # production build
npm run lint     # ESLint
npx tsc --noEmit # typecheck
```

Built with Next.js 16 (App Router, Turbopack), React 19, TypeScript and
Tailwind CSS 4. This Next.js version has breaking changes from earlier
releases, so check `node_modules/next/dist/docs/` before relying on older
APIs. `next.config.ts` pins `turbopack.root` to this folder, because an
unrelated lockfile higher up the directory tree would otherwise be picked as
the workspace root.
