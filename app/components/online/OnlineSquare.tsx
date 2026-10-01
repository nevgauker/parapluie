'use client';
import { useEffect, useRef } from 'react';
import {
  PALETTE, drawGround, drawProps, drawRainField, drawRipples, tickRipples, drawWalker,
  drawDryZone, drawGoalMarker, drawWetOverlay, drawHud, drawPrompt, walkWidth,
  drawFloatTexts, tickFloatTexts,
  type StreetView, type DryZone, type Ripple, type FloatText,
} from '../../_lib/street';
import { newDryStreak, tickDryStreak, streakCallouts } from '../../_lib/dryStreak';
import {
  SQUARE_W, SQUARE_H, SQUARE_INSET, SQUARE_COVER_R, SQUARE_GOALS, TOGETHER_GRACE, ALONE_SHARE,
  pickGoalSpot,
} from '../../_lib/rules';
import { makeRng } from '../../_lib/rng';
import { padPress, PAD_START } from '../../_lib/input';
import { PLAYERS, drawTag } from '../../_lib/players';
import { watchFocus, PAUSE_KEYS } from '../../_lib/focus';
import { playTime, isPaused, type Match, type Seat, type GameMsg, type NetGoal, type FollowerReport } from '../../_lib/online/protocol';
import type { RoomClient } from '../../_lib/online/client';
import { SnapBuffer, SNAP_EVERY_MS, INTERP_DELAY_MS } from '../../_lib/online/snaps';
import { onlineStick, overlayText, SHAKY_MS, type OnlineResult } from './common';
import TouchStick from '../TouchStick';
import type { Stick } from '../../_lib/input';

/**
 * Online play on the open square: co-op ('open-world') and the duel.
 *
 * Who decides what, so lag never punishes the player who has to react:
 * - each device steers its own walker and sends snapshots;
 * - the follower's device decides cover, wetness, the streak, close calls,
 *   and how the round ends (soaked, or home when the duel clock runs out);
 * - the umbrella's device spawns goals and rules on who got each one;
 * - the relay's clock (playTime) drives difficulty and the duel's 60 s.
 */

interface Goal extends NetGoal { pulse: number; claimed: boolean }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; emoji: string }

const CANOPY_R = 25;
const ROUND_TIME = 60;
const COVER_PTS = 6;
const SHAKE_BONUS = 250;
const HOME_BONUS = 250;
/** If the umbrella's 'final' never comes, settle for its last reported score. */
const FINAL_WAIT_MS = 2_000;

/** Movement per mode and role: the duel's umbrella is a touch faster, so a shake-off is possible. */
function moveModel(duel: boolean, umbrella: boolean, difficulty: number) {
  if (!duel) return { push: 0.2 * (3.5 + difficulty * 0.3), damp: 0.85 };
  return umbrella
    ? { push: 0.18 * (3.8 + difficulty * 0.4), damp: 0.82 }
    : { push: 0.18 * (3.4 + difficulty * 0.3), damp: 0.82 };
}

export default function OnlineSquare({ client, match, seat, onOver }: {
  client: RoomClient;
  match: Match;
  seat: Seat;
  onOver: (r: OnlineResult) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef<Record<string, boolean>>({});
  // the on-screen thumbstick, and the on-screen call / pause buttons' actions
  const touchRef = useRef<Stick>({ x: 0, y: 0 });
  const actionsRef = useRef<{ call(): void; pause(): void }>({ call() {}, pause() {} });
  const overRef = useRef(onOver);
  useEffect(() => { overRef.current = onOver; });

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const W = SQUARE_W, H = SQUARE_H, R = SQUARE_COVER_R;
    const duel = match.mode === 'duel';
    const umb = match.umbrella;
    const iHold = seat === umb;
    const them: Seat = seat === 'p1' ? 'p2' : 'p1';
    const name = (s: Seat) => client.room?.seats[s]?.name ?? PLAYERS[s].name;

    // ── my walker ──
    const start = iHold ? { x: W / 2, y: H * 0.42 } : { x: W / 2 + 30, y: H * 0.42 + 40 };
    let mx = start.x, my = start.y, mvx = 0, mvy = 0, mAngle = 0, mPhase = 0;
    // ── their walker, as last seen ──
    const remote = new SnapBuffer();
    const rStart = iHold ? { x: W / 2 + 30, y: H * 0.42 + 40 } : { x: W / 2, y: H * 0.42 };
    let rx = rStart.x, ry = rStart.y, rAngle = 0, rPhase = 0;

    // ── shared world ──
    const goals = new Map<number, Goal>();
    let nextGoalId = 1;
    const rng = makeRng(match.seed);
    let goalTimer = 0;
    let pauseLeft = 0;
    // the umbrella's points (goals, shake-off) and the follower's report
    let wScore = 0;
    let report: FollowerReport = { wet: 0, mult: 1, coveredAt: -1e9, pts: 0 };
    const streak = newDryStreak();
    let lastTheirSnap = 0;

    // ── ending ──
    let ended = false;
    let endInfo: { end: 'soaked' | 'home'; fScore: number; time: number } | null = null;
    let finalTimer: ReturnType<typeof setTimeout> | null = null;

    let sparks: Spark[] = [];
    let floats: FloatText[] = [];
    const drops = Array.from({ length: 90 }, () => newDrop(true));
    const ripples: Ripple[] = [];
    let raf = 0, last = performance.now(), sinceSnap = 0, t = 0;

    function newDrop(anywhere = false) {
      return { x: Math.random() * W, y: anywhere ? Math.random() * H : -18, len: 10 + Math.random() * 14, spd: 4 + Math.random() * 3, a: 0.1 + Math.random() * 0.12 };
    }
    const pt = () => playTime(match, client.now()) / 1000;
    const difficultyAt = (s: number) => duel
      ? Math.min(3.5, 1 + 0.1 * Math.floor(Math.max(0, s) / 20))
      : Math.min(3, 1 + 0.15 * Math.floor(Math.max(0, s) / 15));
    // the live match (pauses change it), read through the client's room
    const live = () => client.room?.match ?? match;

    // ── goals (spawned only on the umbrella's device) ──
    function spawnGoal() {
      const type = SQUARE_GOALS[Math.floor(rng() * SQUARE_GOALS.length)];
      const at = pickGoalSpot(rng, { x: mx, y: my }, 110);
      const g: NetGoal = { id: nextGoalId++, ...type, x: at.x, y: at.y, born: Math.max(0, playTime(live(), client.now())) };
      goals.set(g.id, { ...g, pulse: 0, claimed: false });
      client.game({ k: 'goals', spawn: [g] });
    }
    const liveGoals = () => [...goals.values()].filter(g => !g.claimed).length;

    /** The umbrella's device rules on a pickup, by either player. */
    function collect(id: number, by: Seat) {
      const g = goals.get(id);
      if (!g || g.claimed) return;
      const d = difficultyAt(pt());
      const together = client.now() - report.coveredAt <= TOGETHER_GRACE * 1000 + client.rtt;
      const pts = Math.round(g.pts * d * (together ? report.mult : ALONE_SHARE));
      wScore += pts;
      client.game({ k: 'collected', id, by, pts, together });
      collected(id, by, pts, together);
      if (duel && liveGoals() < 2) spawnGoal();
    }

    function collected(id: number, by: Seat, pts: number, together: boolean) {
      const g = goals.get(id);
      if (!g) return;
      goals.delete(id);
      const at = by === seat ? { x: mx, y: my } : { x: rx, y: ry };
      floats.push({ x: at.x, y: at.y - 34, text: together ? `+${pts} ${g.label}` : `+${pts} alone`, color: together ? PALETTE.cream : '#ef5844', life: 1.2 });
      sparks.push(...Array.from({ length: 6 }, () => ({ x: at.x, y: at.y, vx: (Math.random() - .5) * 4, vy: (Math.random() - .5) * 4, life: 1, emoji: g.emoji })));
      if (by === umb && iHold) pauseLeft = g.pause;
    }

    // ── ending the round ──
    function finish(end: 'soaked' | 'home', fScore: number, time: number, w: number) {
      if (endInfo === null) endInfo = { end, fScore, time };
      if (finalTimer) clearTimeout(finalTimer);
      overRef.current({ mode: match.mode, round: match.round, umbrella: umb, end, wScore: Math.round(w), fScore: Math.round(fScore), time: Math.round(time), city: match.city });
    }

    /** Follower's device: the round is over. */
    function endRound(end: 'soaked' | 'home') {
      if (ended) return;
      ended = true;
      const time = Math.max(0, pt());
      const fScore = report.pts + (duel && end === 'home' ? HOME_BONUS * difficultyAt(time) : 0);
      report = { ...report, pts: fScore };
      endInfo = { end, fScore, time };
      client.game({ k: 'round-end', end, fScore, time });
      // wait briefly for the umbrella's final score
      finalTimer = setTimeout(() => finish(end, fScore, time, wScore), FINAL_WAIT_MS);
    }

    // ── messages from the partner ──
    const off = client.on({
      game(m: GameMsg) {
        switch (m.k) {
          case 'snap':
            remote.push(m.w);
            lastTheirSnap = client.now();
            if (m.follower && iHold) report = m.follower;
            if (m.score !== undefined && !iHold) wScore = m.score;
            break;
          case 'goals':
            for (const g of m.spawn) if (!goals.has(g.id)) goals.set(g.id, { ...g, pulse: 0, claimed: false });
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
              if (duel && m.end === 'soaked') wScore += SHAKE_BONUS * difficultyAt(m.time);
              client.game({ k: 'final', wScore: Math.round(wScore) });
              finish(m.end, m.fScore, m.time, wScore);
            }
            break;
          case 'final':
            if (endInfo) finish(endInfo.end, endInfo.fScore, endInfo.time, m.wScore);
            break;
          case 'ping-call':
            floats.push({ x: rx, y: ry - 44, text: m.by === umb ? '☂ ring ring!' : 'Attends !', color: PLAYERS[m.by].color, life: 1.6 });
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
      floats.push({ x: mx, y: my - 44, text: iHold ? '☂ ring ring!' : 'Attends !', color: PLAYERS[seat].color, life: 1.6 });
    };
    actionsRef.current = {
      call: () => { if (!ended) call(); },
      pause: () => { if (!ended) togglePause(); },
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
    // tabbing away pauses the match for both of you
    const stopWatching = watchFocus(KEYS, () => {
      const m = live();
      if (!ended && playTime(m, client.now()) > 0 && m.pausedSince === null) client.send({ t: 'pause', paused: true });
    });
    const pressedPause = padPress([PAD_START]);
    const pressedCall = padPress([3]); // Y

    const view: StreetView = { W, H, left: SQUARE_INSET, right: W - SQUARE_INSET, scroll: 0, walk: walkWidth(W, W - SQUARE_INSET * 2) };

    function update(dt: number, now: number, secs: number) {
      const f = dt * 60;
      const d = difficultyAt(secs);
      const pmx = mx, pmy = my;

      // my walker
      const s = onlineStick(KEYS, touchRef.current);
      const { push, damp } = moveModel(duel, iHold, d);
      const keep = Math.pow(damp, f);
      mvx = (mvx + s.x * push * f) * keep;
      mvy = (mvy + s.y * push * f) * keep;
      if (pauseLeft > 0) { pauseLeft -= dt; mvx *= Math.pow(0.85, f); mvy *= Math.pow(0.85, f); }
      mx = Math.max(16, Math.min(W - 16, mx + mvx * f));
      my = Math.max(16, Math.min(H - 16, my + mvy * f));
      const step = Math.hypot(mx - pmx, my - pmy);
      if (step > 0.35) mAngle = Math.atan2(my - pmy, mx - pmx) + Math.PI / 2;
      mPhase += (0.6 + step * 6) * dt * 5;

      // goals age out on both devices by the shared clock
      for (const g of goals.values()) {
        g.pulse = (g.pulse + dt * 3) % (Math.PI * 2);
        if (secs * 1000 > g.born + g.dur * 1000) goals.delete(g.id);
      }

      if (iHold) {
        // the umbrella's device keeps the board stocked and rules on pickups
        if (duel) {
          goalTimer += dt;
          if (goals.size === 0) { spawnGoal(); spawnGoal(); spawnGoal(); }
          if (goalTimer > 4 - d * 0.5) { goalTimer = 0; if (liveGoals() < 3) spawnGoal(); }
        } else {
          while (liveGoals() < 2) spawnGoal();
        }
        for (const g of goals.values()) if (!g.claimed && Math.hypot(mx - g.x, my - g.y) < 20) collect(g.id, seat);
      } else if (!duel) {
        // co-op: the follower can pick goals up too; the umbrella's device decides
        for (const g of goals.values()) {
          if (!g.claimed && Math.hypot(mx - g.x, my - g.y) < 20) {
            g.claimed = true;
            client.game({ k: 'claim', id: g.id, by: seat, at: now });
          }
        }
      }

      if (!iHold) {
        // the follower's device decides cover, against the umbrella as it sees her
        const sep = Math.hypot(mx - rx, my - ry);
        if (sep <= R) report.coveredAt = now;
        const edge = tickDryStreak(streak, sep, R, dt, d);
        let pts = report.pts + edge.pts;
        if (sep <= R && duel) pts += dt * COVER_PTS * d * streak.mult;
        floats.push(...streakCallouts(edge.events, mx, my));
        let wet = report.wet;
        if (sep > R) wet = Math.min(1, wet + dt * (0.18 + (duel ? (sep - R) / R * 0.35 : 0)));
        else wet = Math.max(0, wet - dt * (duel ? 0.055 : 0.05));
        report = { wet, mult: streak.mult, coveredAt: report.coveredAt, pts };
        if (wet >= 1) endRound('soaked');
        else if (duel && secs >= ROUND_TIME) endRound('home');
      }

      for (const sp of sparks) { sp.x += sp.vx; sp.y += sp.vy; sp.vy += 0.1; sp.life -= dt * 1.4; }
      sparks = sparks.filter(sp => sp.life > 0);
    }

    function draw(now: number, secs: number) {
      const m = live();
      ctx.clearRect(0, 0, W, H);
      drawGround(ctx, view);
      drawProps(ctx, view, 0, t);

      const umbX = iHold ? mx : rx, umbY = iHold ? my : ry;
      const folX = iHold ? rx : mx, folY = iHold ? ry : my;
      const sep = Math.hypot(folX - umbX, folY - umbY);
      const dry: DryZone[] = [{ x: umbX, y: umbY, r: R }];
      drawRipples(ctx, ripples, undefined, dry);
      for (const g of goals.values()) {
        const rem = 1 - (secs * 1000 - g.born) / (g.dur * 1000);
        drawGoalMarker(ctx, g.x, g.y, g.emoji, Math.max(0, Math.min(1, rem)), g.pulse, 1);
      }
      drawDryZone(ctx, umbX, umbY, R, sep / R, report.mult);

      const folSeat: Seat = iHold ? them : seat;
      drawWalker(ctx, folX, folY, { jacket: PALETTE.jacketOlive, accent: PLAYERS[folSeat].color }, {
        angle: iHold ? rAngle : mAngle, phase: iHold ? rPhase : mPhase, wet: report.wet,
      });
      drawWalker(ctx, umbX, umbY, { jacket: PALETTE.jacketBlue, accent: PLAYERS[umb].color }, {
        angle: iHold ? mAngle : rAngle, phase: iHold ? mPhase : rPhase, umbrella: CANOPY_R, spin: Math.sin(t * 0.7) * 0.06,
      });
      drawTag(ctx, folSeat, folX, folY - 16, folSeat === seat ? 'You' : name(folSeat));
      drawTag(ctx, umb, umbX, umbY - CANOPY_R - 12, umb === seat ? 'You' : name(umb));

      drawRainField(ctx, drops, H, undefined, dry);
      for (const sp of sparks) {
        ctx.save(); ctx.globalAlpha = Math.max(0, sp.life);
        ctx.font = '14px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(sp.emoji, sp.x, sp.y); ctx.restore();
      }
      drawFloatTexts(ctx, floats);
      drawWetOverlay(ctx, W, H, folX, folY, report.wet);

      if (duel) {
        // each player's own score, and the clock
        const fScore = report.pts;
        ctx.save();
        ctx.textBaseline = 'top';
        ctx.font = '600 12px Inter,sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = PLAYERS[umb].color;
        ctx.fillText(`${PLAYERS[umb].shape} ${umb === seat ? 'You' : name(umb)} ☂ ${Math.round(wScore)}`, 14, 14);
        ctx.textAlign = 'right';
        ctx.fillStyle = PLAYERS[folSeat].color;
        ctx.fillText(`${PLAYERS[folSeat].shape} ${folSeat === seat ? 'You' : name(folSeat)} ${Math.round(fScore)}`, W - 14, 14);
        ctx.textAlign = 'center';
        ctx.fillStyle = PALETTE.cream;
        ctx.fillText(`round ${match.round}/2 · ${Math.max(0, Math.ceil(ROUND_TIME - Math.max(0, secs)))}s`, W / 2, 14);
        ctx.restore();
      } else {
        drawHud(ctx, W, wScore + report.pts, report.wet, 14, report.mult);
      }

      const ov = overlayText(m, client.room, seat, name(them), now);
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
      const secs = playTime(live(), now) / 1000;
      const running = secs >= 0 && !isPaused(live(), now);

      if (pressedPause() && !ended && secs >= 0) togglePause();
      if (pressedCall() && !ended && running) call();

      // their walker, a little in the past
      const r = remote.sample(now - INTERP_DELAY_MS);
      if (r) {
        const step = Math.hypot(r.x - rx, r.y - ry);
        rPhase += (0.6 + step * 6) * dt * 5;
        rx = r.x; ry = r.y; rAngle = r.angle;
      }

      for (const dr of drops) { dr.y += dr.spd * 1.3 * dt * 60; if (dr.y > H) Object.assign(dr, newDrop()); }
      tickRipples(ripples, dt, 12, () => ({ x: Math.random() * W, y: Math.random() * H }));
      floats = tickFloatTexts(floats, dt);

      if (running && !ended) update(dt, now, secs);

      sinceSnap += dt * 1000;
      if (sinceSnap >= SNAP_EVERY_MS && !ended) {
        sinceSnap = 0;
        client.game({
          k: 'snap',
          w: { at: now, x: mx, y: my, vx: mvx, vy: mvy, angle: mAngle },
          follower: iHold ? undefined : report,
          score: iHold ? Math.round(wScore) : undefined,
        });
      }

      draw(now, secs);
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
    <div style={{ position: 'relative', width: '100%', height: '100%', touchAction: 'none' }}>
      <canvas
        ref={ref}
        width={SQUARE_W}
        height={SQUARE_H}
        className="block w-full h-full"
        style={{ display: 'block', touchAction: 'none', objectFit: 'contain', background: PALETTE.night }}
      />
      <TouchStick
        stickRef={touchRef}
        buttons={[
          { label: '📣', aria: 'Call your partner', onPress: () => actionsRef.current.call() },
          { label: '⏸', aria: 'Pause', onPress: () => actionsRef.current.pause() },
        ]}
      />
    </div>
  );
}
