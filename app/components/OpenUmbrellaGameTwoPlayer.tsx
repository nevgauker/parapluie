'use client';
import { useEffect, useRef, useState } from 'react';
import VirtualDPad from './VirtualDPad';
import {
  PALETTE, drawGround, drawProps, drawRainField, drawRipples, tickRipples, drawWalker,
  drawDryZone, drawGoalMarker, drawWetOverlay, drawHud, drawPrompt, walkWidth,
  drawFloatTexts, tickFloatTexts,
  type StreetView, type DryZone, type Ripple, type FloatText,
} from '../_lib/street';
import { newDryStreak, tickDryStreak, streakCallouts } from '../_lib/dryStreak';
import {
  SQUARE_W, SQUARE_H, SQUARE_INSET, SQUARE_COVER_R, SQUARE_GOALS, TOGETHER_GRACE, ALONE_SHARE,
  pickGoalSpot, type SquareGoalType,
} from '../_lib/rules';
import { makeRng, newSeed } from '../_lib/rng';
import { WASD, ARROWS, pads, padPress, readStick } from '../_lib/input';

interface Drop { x: number; y: number; len: number; spd: number; a: number; }
interface Goal extends SquareGoalType { x: number; y: number; age: number; pulse: number; reached: boolean; pauseLeft: number; }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; emoji: string; }

type GameState = 'menu' | 'playing' | 'dead';

/** Drawn size of the canopy itself — the shelter circle is wider. */
const CANOPY_R = 25;
/** How hard a full stick pushes a walker, per 60 Hz frame, before difficulty. */
const WALK_PUSH = 0.2;
/** Velocity kept each 60 Hz frame. */
const DAMP = 0.85;

export default function OpenUmbrellaGameTwoPlayer() {
  const [gameState, setGameState] = useState<GameState>('menu');
  const [endStats, setEndStats] = useState({ score: 0, time: 0 });
  const ref = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ gameState });
  const keysRef = useRef<Record<string, boolean>>({});
  const isTouchRef = useRef(false);

  useEffect(() => { stateRef.current = { gameState }; }, [gameState]);
  useEffect(() => { isTouchRef.current = navigator.maxTouchPoints > 0; }, []);

  const handleRestart = () => { setGameState('playing'); };
  const handleMenu = () => { setGameState('menu'); };

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    // A fixed logical arena, letterboxed by CSS: every screen plays the same square.
    const W = SQUARE_W, H = SQUARE_H;
    const R = SQUARE_COVER_R;

    let raf = 0, t = 0, lastTs = 0;
    let score = 0, wet = 0, elapsed = 0, running = stateRef.current.gameState === 'playing';
    let wx = W / 2, wy = H / 2, wvx = 0, wvy = 0;
    let fx = W / 2 + 30, fy = H / 2 + 30, fvx = 0, fvy = 0;
    const drops: Drop[] = [];
    let goals: Goal[] = [];
    let sparks: Spark[] = [];
    let floats: FloatText[] = [];
    const ripples: Ripple[] = [];
    let difficulty = 1;
    let diffTimer = 0;
    // facing + walk-cycle state for the two figures
    let wAngle = 0, fAngle = 0, wPhase = 0, fPhase = 0;
    // shared co-op scoring: the follower's streak multiplies goals collected together
    const streak = newDryStreak();
    let coveredAt = 0;
    // every goal comes from this run's seed
    const rng = makeRng(newSeed());

    // Keyboard input
    const KEYS = keysRef.current;
    const onDown = (e: KeyboardEvent) => {
      KEYS[e.key] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    };
    const onUp = (e: KeyboardEvent) => { KEYS[e.key] = false; };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);

    function newDrop(anywhere = false): Drop {
      return { x: Math.random() * W, y: anywhere ? Math.random() * H : -18, len: 10 + Math.random() * 14, spd: 4 + Math.random() * 3, a: 0.1 + Math.random() * 0.12 };
    }
    for (let i = 0; i < 90; i++) drops.push(newDrop(true));

    function spawnGoal() {
      const type = SQUARE_GOALS[Math.floor(rng() * SQUARE_GOALS.length)];
      const at = pickGoalSpot(rng, { x: wx, y: wy }, 110);
      goals.push({ ...type, x: at.x, y: at.y, age: 0, pulse: 0, reached: false, pauseLeft: 0 });
    }
    spawnGoal(); spawnGoal();

    function update(dt: number) {
      t += dt; elapsed += dt;
      diffTimer += dt;
      if (diffTimer > 15) { diffTimer = 0; difficulty = Math.min(3, difficulty + 0.15); }
      const pwx = wx, pwy = wy, pfx = fx, pfy = fy;

      for (const d of drops) { d.y += d.spd * (1 + difficulty * 0.25); if (d.y > H) Object.assign(d, newDrop()); }

      tickRipples(ripples, dt, 12, () => ({ x: Math.random() * W, y: Math.random() * H }));

      // Movement scales with frame time, so a 144 Hz screen turns no sharper than a 60 Hz one.
      const f = dt * 60, keep = Math.pow(DAMP, f);
      const push = WALK_PUSH * (3.5 + difficulty * 0.3) * f;
      const [pad1, pad2] = pads();

      // P1 (woman) - WASD or the first gamepad
      const p1 = readStick(KEYS, WASD, pad1);
      wvx = (wvx + p1.x * push) * keep; wvy = (wvy + p1.y * push) * keep;
      wx += wvx * f; wy += wvy * f;
      wx = Math.max(20, Math.min(W - 20, wx)); wy = Math.max(20, Math.min(H - 20, wy));

      // P2 (follower) - arrow keys or the second gamepad
      const p2 = readStick(KEYS, ARROWS, pad2);
      fvx = (fvx + p2.x * push) * keep; fvy = (fvy + p2.y * push) * keep;
      fx += fvx * f; fy += fvy * f;
      fx = Math.max(20, Math.min(W - 20, fx)); fy = Math.max(20, Math.min(H - 20, fy));

      const sep = Math.hypot(fx - wx, fy - wy);
      if (sep <= R) coveredAt = elapsed;

      // Goals - either player collects; full value, times the streak, only together
      for (const g of goals) {
        g.age += dt; g.pulse = (g.pulse + dt * 3) % (Math.PI * 2);
        const d1 = Math.hypot(wx - g.x, wy - g.y);
        const d2 = Math.hypot(fx - g.x, fy - g.y);
        if (!g.reached && g.pauseLeft <= 0 && (d1 < 20 || d2 < 20)) {
          g.reached = true; g.pauseLeft = g.pause;
          const together = elapsed - coveredAt <= TOGETHER_GRACE;
          const pts = Math.round(g.pts * difficulty * (together ? streak.mult : ALONE_SHARE));
          score += pts;
          const collector = d1 < d2 ? { x: wx, y: wy } : { x: fx, y: fy };
          floats.push({ x: collector.x, y: collector.y - 34, text: together ? `+${pts} ${g.label}` : `+${pts} alone`, color: together ? PALETTE.cream : '#ef5844', life: 1.2 });
          sparks.push(...Array.from({ length: 5 }, () => ({ x: collector.x, y: collector.y, vx: (Math.random() - .5) * 3, vy: (Math.random() - .5) * 3, life: 1, emoji: g.emoji })));
        }
        // she lingers at a goal; the follower is never slowed, only she is
        if (g.pauseLeft > 0) { g.pauseLeft -= dt; wvx *= Math.pow(0.8, f); wvy *= Math.pow(0.8, f); }
      }
      goals = goals.filter(g => g.reached || g.age < g.dur);
      // Top up after both collection and expiry, or a run where every goal
      // fades uncollected leaves nothing on the board.
      while (goals.filter(g => !g.reached).length < 2) spawnGoal();

      // facing + stride
      const wStep = Math.hypot(wx - pwx, wy - pwy);
      const fStep = Math.hypot(fx - pfx, fy - pfy);
      if (wStep > 0.35) wAngle = Math.atan2(wy - pwy, wx - pwx) + Math.PI / 2;
      if (fStep > 0.35) fAngle = Math.atan2(fy - pfy, fx - pfx) + Math.PI / 2;
      wPhase += (0.6 + wStep * 6) * dt * 5;
      fPhase += (0.6 + fStep * 6) * dt * 5;

      // the follower's streak and close calls feed the shared score
      const edge = tickDryStreak(streak, sep, R, dt, difficulty);
      score += edge.pts;
      floats.push(...streakCallouts(edge.events, fx, fy));
      floats = tickFloatTexts(floats, dt);

      // wetness - based on separation
      if (sep > R) wet = Math.min(1, wet + dt * 0.18); else wet = Math.max(0, wet - dt * 0.05);

      sparks.forEach(s => { s.x += s.vx; s.y += s.vy; s.life -= dt * 1.5; });
      sparks = sparks.filter(s => s.life > 0);

      if (wet >= 1) {
        running = false;
        setEndStats({ score: Math.round(score), time: Math.round(elapsed) });
        setGameState('dead');
      }
    }

    const view: StreetView = {
      W, H, left: SQUARE_INSET, right: W - SQUARE_INSET, scroll: 0,
      walk: walkWidth(W, W - SQUARE_INSET * 2),
    };

    function draw() {
      ctx.clearRect(0, 0, W, H);
      drawGround(ctx, view);
      drawProps(ctx, view, 0, t);

      const sep = Math.hypot(fx - wx, fy - wy);
      const dry: DryZone[] = [{ x: wx, y: wy, r: R }];

      drawRipples(ctx, ripples, undefined, dry);

      for (const g of goals) {
        if (g.reached) continue;
        drawGoalMarker(ctx, g.x, g.y, g.emoji, 1 - g.age / g.dur, g.pulse, g.age * 2);
      }

      drawDryZone(ctx, wx, wy, R, sep / R, streak.mult);

      drawWalker(ctx, fx, fy, { jacket: PALETTE.jacketOlive, accent: '#e08a3c' }, {
        angle: fAngle, phase: fPhase, wet,
      });
      drawWalker(ctx, wx, wy, { jacket: PALETTE.jacketBlue, accent: '#7cc24f' }, {
        angle: wAngle, phase: wPhase, umbrella: CANOPY_R, spin: Math.sin(t * 0.7) * 0.06,
      });

      // player tags, kept clear of the canopy
      ctx.font = '500 9px Inter,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(124,194,79,.6)'; ctx.fillText('P1', wx, wy - CANOPY_R - 6);
      ctx.fillStyle = 'rgba(224,138,60,.6)'; ctx.fillText('P2', fx, fy - 16);

      drawRainField(ctx, drops, H, undefined, dry);

      // sparks
      for (const s of sparks) {
        ctx.save(); ctx.globalAlpha = s.life;
        ctx.font = '14px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(s.emoji, s.x, s.y); ctx.restore();
      }

      drawFloatTexts(ctx, floats);
      drawWetOverlay(ctx, W, H, fx, fy, wet);
      drawHud(ctx, W, score, wet, 54, streak.mult);

      if (!running) {
        const n = pads().length;
        drawPrompt(
          ctx, W, H,
          n ? 'press A to start' : isTouchRef.current ? 'tap to start' : 'click to start',
          isTouchRef.current && !n ? 'use the D-pads to move'
            : `P1: WASD${n > 0 ? ' or 🎮 1' : ''} · P2: arrows${n > 1 ? ' or 🎮 2' : ''}`,
        );
      }
    }

    // A or Start on any pad: start the run, or play again from the end screen.
    const pressedStart = padPress();

    function loop(ts: number) {
      const dt = Math.min((ts - lastTs) / 1000, 0.05);
      lastTs = ts;
      if (pressedStart()) {
        if (stateRef.current.gameState === 'dead') setGameState('playing');
        else running = true;
      }
      if (running) update(dt);
      draw();
      raf = requestAnimationFrame(loop);
    }
    lastTs = performance.now();
    raf = requestAnimationFrame(loop);

    canvas.addEventListener('click', () => { running = true; });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [gameState]);

  return (
    <div className="relative w-full h-full" style={{ background: PALETTE.night }}>
      <canvas
        ref={ref}
        width={SQUARE_W}
        height={SQUARE_H}
        className="block w-full h-full"
        style={{ cursor: 'default', display: 'block', touchAction: 'none', objectFit: 'contain' }}
      />
      <VirtualDPad
        keysRef={keysRef}
        keyMap={{ up: 'w', down: 's', left: 'a', right: 'd' }}
        position="left"
        color="#7cc24f"
        label="P1"
      />
      <VirtualDPad
        keysRef={keysRef}
        keyMap={{ up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }}
        position="right"
        color="#e08a3c"
        label="P2"
      />

      {gameState === 'dead' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: 'rgba(0,0,0,0.82)' }}>
          <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 700, color: 'var(--fog)', marginBottom: 4 }}>
            {endStats.time > 30 ? 'Not bad.' : 'Soaked.'}
          </p>
          <p style={{ fontSize: 12, color: 'rgba(240,236,224,0.35)', marginBottom: 24 }}>
            {endStats.time > 60 ? 'Great teamwork!' : endStats.time > 30 ? 'Keep practicing' : 'Stay together!'}
          </p>
          <div className="flex gap-6 mb-7">
            {[['score', endStats.score], ['time', endStats.time + 's']].map(([l, v]) => (
              <div key={l as string} style={{ textAlign: 'center' }}>
                <span style={{ display: 'block', fontSize: 22, fontWeight: 500, color: 'var(--fog)', fontFamily: "'Space Grotesk',sans-serif" }}>{v}</span>
                <span style={{ fontSize: 10, color: 'rgba(240,236,224,0.38)' }}>{l}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={handleRestart} style={{ padding: '10px 24px', borderRadius: 24, background: 'var(--fog)', color: '#1a1408', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>Play again</button>
            <button onClick={handleMenu} style={{ padding: '10px 24px', borderRadius: 24, background: 'transparent', color: 'rgba(240,236,224,0.55)', border: '.5px solid rgba(240,236,224,0.2)', fontSize: 13, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>Menu</button>
          </div>
        </div>
      )}
    </div>
  );
}
