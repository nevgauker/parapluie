'use client';
import { useEffect, useRef } from 'react';
import {
  PALETTE, drawGround, drawProps, drawRainField, drawRipples, tickRipples, drawWalker,
  drawDryZone, drawGoalMarker, drawObstacle, drawWetOverlay, drawHud, drawPrompt, walkWidth,
  drawFloatTexts, tickFloatTexts,
  type StreetView, type DryZone, type Ripple, type FloatText,
} from '../../_lib/street';
import { newDryStreak, tickDryStreak, streakCallouts } from '../../_lib/dryStreak';
import { TOGETHER_GRACE, ALONE_SHARE } from '../../_lib/rules';
import { makeRng } from '../../_lib/rng';
import { CITIES } from '../../_lib/cities';
import { cityEvents, type CityEffect } from '../../_lib/cityEvents';
import { cityFurnish, drawCityRoad } from '../../_lib/cityStreet';
import { pushOut } from '../../_lib/collide';
import { padPress, PAD_START } from '../../_lib/input';
import { PLAYERS, drawTag } from '../../_lib/players';
import { watchFocus, PAUSE_KEYS } from '../../_lib/focus';
import { playTime, isPaused, type Match, type Seat, type GameMsg, type FollowerReport } from '../../_lib/online/protocol';
import type { RoomClient } from '../../_lib/online/client';
import { SnapBuffer, SNAP_EVERY_MS, INTERP_DELAY_MS } from '../../_lib/online/snaps';
import { onlineStick, overlayText, SHAKY_MS, type OnlineResult } from './common';

/**
 * Online runner co-op. The street, obstacles, goal spawns and city hazards
 * run in lockstep: both devices step the same world in fixed 1/60 s steps,
 * from the match seed, up to the relay's play clock. Walkers are each
 * device's own, sent relative to the camera so the partner never trails
 * behind the scroll.
 *
 * Who decides what: the follower's device decides cover, splashes, awnings
 * and soaking; the umbrella's device rules on goal pickups.
 */

const W = 480, H = 720;
const COVER_R = 72;
const CANOPY_R = 25;
const WALK_PUSH = 0.6;
const DAMP = 0.82;
const STEP = 1 / 60;
/** Most world steps taken in one frame while catching up (10 s). */
const MAX_STEPS = 600;
const FINAL_WAIT_MS = 2_000;

interface Goal { id: number; x: number; y: number; emoji: string; pts: number; dur: number; pause: number; age: number; pulse: number; claimed: boolean }
interface Obstacle { x: number; y: number; w: number; h: number; emoji: string }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; emoji: string }

export default function OnlineRunner({ client, match, seat, onOver }: {
  client: RoomClient;
  match: Match;
  seat: Seat;
  onOver: (r: OnlineResult) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef<Record<string, boolean>>({});
  const overRef = useRef(onOver);
  useEffect(() => { overRef.current = onOver; });

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const city = CITIES[match.city];
    const coverR = COVER_R * city.cover;
    const left = (W - city.road) / 2, right = (W + city.road) / 2;
    const umb = match.umbrella;
    const iHold = seat === umb;
    const them: Seat = seat === 'p1' ? 'p2' : 'p1';
    const name = (s: Seat) => client.room?.seats[s]?.name ?? PLAYERS[s].name;
    const live = () => client.room?.match ?? match;
    const furnish = cityFurnish(match.city);

    // ── the lockstep world ──
    const rng = makeRng(match.seed);
    const events = cityEvents(match.city, rng);
    let steps = 0;
    let worldY = 0, difficulty = 1, diffTimer = 0, goalTimer = 0, obstacleTimer = 0;
    let goalId = 1;
    const goals = new Map<number, Goal>();
    let obstacles: Obstacle[] = [];

    function spawnGoal() {
      const type = city.goals[Math.floor(rng() * city.goals.length)];
      const x = left + 40 + rng() * Math.max(20, right - left - 80);
      const y = worldY - 150 - rng() * 200;
      const id = goalId++;
      goals.set(id, { id, ...type, x, y, age: 0, pulse: 0, claimed: false });
    }
    function spawnObstacle() {
      const o = city.obstacles[Math.floor(rng() * city.obstacles.length)];
      const x = left + rng() * Math.max(10, right - left - o.w);
      const y = worldY - 200 - rng() * 150;
      obstacles.push({ x, y, w: o.w, h: o.h, emoji: o.emoji });
    }
    spawnGoal(); spawnGoal();

    // ── walkers: mine, and theirs relative to the camera ──
    let mx = W / 2, my = iHold ? 0 : 45, mvx = 0, mvy = 0, mAngle = 0, mPhase = 0;
    const remote = new SnapBuffer();
    let rx = W / 2, ry = iHold ? 45 : 0, rAngle = 0, rPhase = 0;

    // ── authority state ──
    let wScore = 0;
    let report: FollowerReport = { wet: 0, mult: 1, coveredAt: -1e9, pts: 0 };
    const streak = newDryStreak();
    let lastTheirSnap = 0;
    let ended = false;
    let endInfo: { end: 'soaked' | 'home'; fScore: number; time: number } | null = null;
    let finalTimer: ReturnType<typeof setTimeout> | null = null;
    let weather: CityEffect = { splash: 0, wind: 0, dryShift: 0, sheltered: false, callouts: [] };

    let sparks: Spark[] = [];
    let floats: FloatText[] = [];
    const drops = Array.from({ length: city.rain }, () => newDrop());
    const ripples: Ripple[] = [];
    let raf = 0, last = performance.now(), sinceSnap = 0, t = 0;

    function newDrop() {
      return { x: Math.random() * W, y: Math.random() * H, len: 10 + Math.random() * 14, spd: 4 + Math.random() * 3, a: 0.1 + Math.random() * 0.12 };
    }
    const project = (y: number) => y - worldY + H / 2;
    const folPos = () => (iHold ? { x: rx, y: ry } : { x: mx, y: my });

    /** One fixed world step. Identical on both devices for the same seed and step count. */
    function step() {
      diffTimer += STEP;
      if (diffTimer > 12) { diffTimer = 0; difficulty = Math.min(3, difficulty + 0.2); }
      worldY -= (1.5 + difficulty * 0.4) * city.pace;
      // hazards evolve the same everywhere; what they do to the follower is read from the follower's position
      const f = folPos();
      const e = events.tick(STEP, { worldY, W, H, left, right, difficulty, fx: f.x, fy: f.y });
      weather = { splash: weather.splash + e.splash, wind: e.wind, dryShift: e.dryShift, sheltered: e.sheltered, callouts: [...weather.callouts, ...e.callouts] };
      goalTimer -= STEP;
      if (goalTimer <= 0) { spawnGoal(); goalTimer = 3 / difficulty; }
      obstacleTimer -= STEP;
      if (obstacleTimer <= 0) { spawnObstacle(); obstacleTimer = 4 / difficulty; }
      for (const g of goals.values()) { g.age += STEP; if (g.age >= g.dur) goals.delete(g.id); }
      obstacles = obstacles.filter(o => o.y < worldY + H / 2 + 100);
      steps++;
    }

    // ── goals ──
    function collect(id: number, by: Seat) {
      const g = goals.get(id);
      if (!g) return;
      const together = client.now() - report.coveredAt <= TOGETHER_GRACE * 1000 + client.rtt;
      const pts = Math.round(g.pts * difficulty * (together ? report.mult : ALONE_SHARE));
      wScore += pts;
      client.game({ k: 'collected', id, by, pts, together });
      collected(id, by, pts, together);
    }
    function collected(id: number, by: Seat, pts: number, together: boolean) {
      const g = goals.get(id);
      if (!g) return;
      goals.delete(id);
      const at = by === seat ? { x: mx, y: my } : { x: rx, y: ry };
      floats.push({ x: at.x, y: project(at.y) - 34, text: together ? `+${pts}` : `+${pts} alone`, color: together ? PALETTE.cream : '#ef5844', life: 1.2 });
      sparks.push(...Array.from({ length: 5 }, () => ({ x: at.x, y: at.y, vx: (Math.random() - .5) * 3, vy: (Math.random() - .5) * 3, life: 1, emoji: g.emoji })));
    }

    // ── ending ──
    function finish(end: 'soaked' | 'home', fScore: number, time: number, w: number) {
      if (finalTimer) clearTimeout(finalTimer);
      overRef.current({ mode: 'runner', round: 1, umbrella: umb, end, wScore: Math.round(w), fScore: Math.round(fScore), time: Math.round(time), city: match.city });
    }
    function endRound() {
      if (ended) return;
      ended = true;
      const time = Math.max(0, playTime(live(), client.now()) / 1000);
      endInfo = { end: 'soaked', fScore: report.pts, time };
      client.game({ k: 'round-end', end: 'soaked', fScore: report.pts, time });
      finalTimer = setTimeout(() => finish('soaked', report.pts, time, wScore), FINAL_WAIT_MS);
    }

    const off = client.on({
      game(m: GameMsg) {
        switch (m.k) {
          case 'snap':
            remote.push(m.w);
            lastTheirSnap = client.now();
            if (m.follower && iHold) report = m.follower;
            if (m.score !== undefined && !iHold) wScore = m.score;
            break;
          case 'claim':
            if (iHold && !ended) collect(m.id, m.by);
            break;
          case 'collected':
            if (!iHold) { wScore += m.pts; collected(m.id, m.by, m.pts, m.together); }
            break;
          case 'round-end':
            if (iHold && !ended) {
              ended = true;
              client.game({ k: 'final', wScore: Math.round(wScore) });
              finish(m.end, m.fScore, m.time, wScore);
            }
            break;
          case 'final':
            if (endInfo) finish(endInfo.end, endInfo.fScore, endInfo.time, m.wScore);
            break;
          case 'ping-call':
            floats.push({ x: rx, y: project(ry) - 44, text: m.by === umb ? '☂ ring ring!' : 'Attends !', color: PLAYERS[m.by].color, life: 1.6 });
            break;
        }
      },
    });

    // ── input ──
    const KEYS = keysRef.current;
    const togglePause = () => {
      const m = live();
      client.send({ t: 'pause', paused: !(m.pausedSince !== null && m.resumeAt === null) });
    };
    const call = () => {
      client.game({ k: 'ping-call', by: seat });
      floats.push({ x: mx, y: project(my) - 44, text: iHold ? '☂ ring ring!' : 'Attends !', color: PLAYERS[seat].color, life: 1.6 });
    };
    const onDown = (e: KeyboardEvent) => {
      KEYS[e.key] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (e.repeat || ended) return;
      if (PAUSE_KEYS.includes(e.key)) togglePause();
      if (e.key === ' ' || e.key === 'e' || e.key === 'E') call();
    };
    const onUp = (e: KeyboardEvent) => { KEYS[e.key] = false; };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    const stopWatching = watchFocus(KEYS, () => {
      const m = live();
      if (!ended && playTime(m, client.now()) > 0 && m.pausedSince === null) client.send({ t: 'pause', paused: true });
    });
    const pressedPause = padPress([PAD_START]);
    const pressedCall = padPress([3]);

    function moveMe(dt: number, scrolled: number, now: number) {
      const f = dt * 60;
      const pmx = mx, pmy = my;
      my -= scrolled;
      const s = onlineStick(KEYS);
      const keep = Math.pow(DAMP, f);
      mvx = (mvx + s.x * WALK_PUSH * f) * keep;
      mvy = (mvy + s.y * WALK_PUSH * f) * keep;
      mx += (mvx + weather.wind) * f;
      my += mvy * f;
      const r = iHold ? 20 : 15;
      mx = Math.max(left + r, Math.min(right - r, mx));
      my = Math.max(worldY - H / 2 + 40, Math.min(worldY + H / 2 - 40, my));
      const bounds = { left, right, top: worldY - H / 2 + 40, bottom: worldY + H / 2 - 40 };
      for (const o of obstacles) {
        const p = pushOut(mx, my, r, o, bounds);
        if (p) { mx = p.x; my = p.y; mvx *= 0.5; mvy *= 0.5; }
      }
      const stepLen = Math.hypot(mx - pmx, my - pmy + scrolled);
      if (stepLen > 0.35) mAngle = Math.atan2(my - pmy, mx - pmx) + Math.PI / 2;
      mPhase += (2 + stepLen * 6) * dt * 5;

      // goal touches: the umbrella's device decides, the follower claims
      for (const g of goals.values()) {
        if (g.claimed || Math.hypot(mx - g.x, my - g.y) >= 20) continue;
        if (iHold) collect(g.id, seat);
        else { g.claimed = true; client.game({ k: 'claim', id: g.id, by: seat, at: now }); }
      }
    }

    function judgeCover(dt: number, now: number) {
      // the follower's device: against the umbrella as it sees her
      const sep = Math.hypot(mx - (rx + weather.dryShift), my - ry);
      const covered = sep <= coverR || weather.sheltered;
      if (covered) report.coveredAt = now;
      const edge = tickDryStreak(streak, weather.sheltered ? 0 : sep, coverR, dt, difficulty);
      floats.push(...streakCallouts(edge.events, mx, project(my)));
      let wet = report.wet;
      if (!covered) wet = Math.min(1, wet + dt * 0.18 * city.soak);
      else wet = Math.max(0, wet - dt * 0.05);
      wet = Math.min(1, wet + weather.splash);
      report = { wet, mult: streak.mult, coveredAt: report.coveredAt, pts: report.pts + edge.pts };
      if (wet >= 1) endRound();
    }

    function draw(now: number) {
      const view: StreetView = { W, H, left, right, scroll: -worldY, walk: walkWidth(W, right - left) };
      ctx.clearRect(0, 0, W, H);
      drawGround(ctx, view);
      drawCityRoad(ctx, view, worldY, match.city);
      drawProps(ctx, view, worldY, t, furnish);

      const umbX = iHold ? mx : rx, umbY = iHold ? my : ry;
      const folX = iHold ? rx : mx, folY = iHold ? ry : my;
      const sep = Math.hypot(folX - (umbX + weather.dryShift), folY - umbY);
      const dry: DryZone[] = [
        { x: umbX + weather.dryShift, y: project(umbY), r: coverR },
        ...events.shelters().map(z => ({ ...z, y: project(z.y) })),
      ];
      drawRipples(ctx, ripples, project, dry);
      events.drawUnder(ctx, project);
      for (const o of obstacles) {
        const sy = project(o.y);
        if (sy > -140 && sy < H + 140) drawObstacle(ctx, o.x, sy, o.w, o.h, o.emoji);
      }
      for (const g of goals.values()) {
        const sy = project(g.y);
        if (sy > -60 && sy < H + 60) drawGoalMarker(ctx, g.x, sy, g.emoji, 1 - g.age / g.dur, g.pulse, g.age * 2);
      }
      drawDryZone(ctx, umbX + weather.dryShift, project(umbY), coverR, sep / coverR, report.mult);

      const folSeat: Seat = iHold ? them : seat;
      drawWalker(ctx, folX, project(folY), { jacket: PALETTE.jacketOlive, accent: PLAYERS[folSeat].color }, {
        angle: iHold ? rAngle : mAngle, phase: iHold ? rPhase : mPhase, wet: report.wet,
      });
      drawWalker(ctx, umbX, project(umbY), { jacket: PALETTE.jacketBlue, accent: PLAYERS[umb].color }, {
        angle: iHold ? mAngle : rAngle, phase: iHold ? mPhase : rPhase, umbrella: CANOPY_R, spin: Math.sin(t * 0.7) * 0.06, canopy: city.canopy,
      });
      drawTag(ctx, folSeat, folX, project(folY) - 16, folSeat === seat ? 'You' : name(folSeat));
      drawTag(ctx, umb, umbX, project(umbY) - CANOPY_R - 12, umb === seat ? 'You' : name(umb));

      drawRainField(ctx, drops, H, undefined, dry);
      events.drawOver(ctx, project);
      for (const sp of sparks) {
        ctx.save(); ctx.globalAlpha = Math.max(0, sp.life);
        ctx.font = '14px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(sp.emoji, sp.x, project(sp.y)); ctx.restore();
      }
      drawFloatTexts(ctx, floats);
      drawWetOverlay(ctx, W, H, folX, project(folY), report.wet);
      drawHud(ctx, W, wScore + report.pts, report.wet, 14, report.mult);

      const ov = overlayText(live(), client.room, seat, name(them), now);
      if (ov) drawPrompt(ctx, W, H, ov.title, ov.hint);
      else if (!ended && lastTheirSnap && now - lastTheirSnap > SHAKY_MS) {
        ctx.save();
        ctx.font = '500 11px Inter,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillStyle = PALETTE.amber;
        ctx.fillText(`${name(them)}'s connection is shaky`, W / 2, H - 14);
        ctx.restore();
      }
    }

    function loop(ts: number) {
      const dt = Math.min((ts - last) / 1000, 0.05);
      last = ts; t += dt;
      const now = client.now();
      const m = live();
      const ms = playTime(m, now);
      const running = ms >= 0 && !isPaused(m, now) && !ended;

      if (pressedPause() && !ended && ms >= 0) togglePause();
      if (pressedCall() && running) call();

      // step the shared world up to the play clock
      const before = worldY;
      weather = { splash: 0, wind: weather.wind, dryShift: weather.dryShift, sheltered: weather.sheltered, callouts: [] };
      const target = Math.floor(Math.max(0, ms) / (STEP * 1000));
      let n = 0;
      while (steps < target && n++ < MAX_STEPS) step();
      const scrolled = before - worldY;
      if (!iHold) floats.push(...weather.callouts.map(c => ({ ...c, x: mx, y: project(my) - 44, life: 1.4 })));

      // their walker, a little in the past, carried along with the street
      const r = remote.sample(now - INTERP_DELAY_MS);
      if (r) {
        const nx = r.x, ny = r.y + worldY;
        rPhase += (2 + Math.hypot(nx - rx, ny - ry + scrolled) * 6) * dt * 5;
        rx = nx; ry = ny; rAngle = r.angle;
      } else {
        ry -= scrolled;
      }

      for (const g of goals.values()) g.pulse = (g.pulse + dt * 3) % (Math.PI * 2);
      for (const dr of drops) { dr.y += dr.spd * (1 + difficulty * 0.2) * dt * 60; if (dr.y > H) Object.assign(dr, newDrop()); }
      tickRipples(ripples, dt, 11, () => ({ x: left + Math.random() * (right - left), y: worldY - H / 2 + Math.random() * H }));
      floats = tickFloatTexts(floats, dt);
      for (const sp of sparks) { sp.x += sp.vx; sp.y += sp.vy; sp.life -= dt * 1.5; }
      sparks = sparks.filter(sp => sp.life > 0);

      if (running) {
        moveMe(dt, scrolled, now);
        if (!iHold) judgeCover(dt, now);
      } else {
        my -= scrolled;
      }

      sinceSnap += dt * 1000;
      if (sinceSnap >= SNAP_EVERY_MS && !ended) {
        sinceSnap = 0;
        // y relative to the camera, so the partner draws it on their own street
        client.game({
          k: 'snap',
          w: { at: now, x: mx, y: my - worldY, vx: mvx, vy: mvy, angle: mAngle },
          follower: iHold ? undefined : report,
          score: iHold ? Math.round(wScore) : undefined,
        });
      }

      draw(now);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      if (finalTimer) clearTimeout(finalTimer);
      off();
      stopWatching();
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [client, match, seat]);

  return (
    <canvas
      ref={ref}
      width={W}
      height={H}
      className="block w-full h-full"
      style={{ display: 'block', touchAction: 'none', objectFit: 'contain', background: PALETTE.night }}
    />
  );
}
