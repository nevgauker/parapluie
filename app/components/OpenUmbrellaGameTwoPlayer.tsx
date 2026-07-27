'use client';
import { useEffect, useRef, useState } from 'react';
import VirtualDPad from './VirtualDPad';
import {
  PALETTE, drawGround, drawProps, drawRainField, drawRipples, tickRipples, drawWalker,
  drawDryZone, drawGoalMarker, drawWetOverlay, drawHud, drawPrompt, walkWidth,
  type StreetView, type DryZone, type Ripple,
} from '../_lib/street';

interface Drop { x: number; y: number; len: number; spd: number; a: number; }
interface Goal { x: number; y: number; emoji: string; pts: number; dur: number; pause: number; age: number; pulse: number; reached: boolean; pauseLeft: number; }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; emoji: string; }

type GameState = 'menu' | 'playing' | 'dead';

/** How far P2 can stray before the rain reaches them. */
const COVER_R = 72;
/** Drawn size of the canopy itself — the shelter circle is wider. */
const CANOPY_R = 25;
/** Pavement strip left either side of the open square. */
const KERB_INSET = 66;

const GOAL_TYPES = [
  { emoji: '🐕', pts: 120, dur: 9, pause: 2.0 },
  { emoji: '🍊', pts: 80,  dur: 7, pause: 1.5 },
  { emoji: '🌸', pts: 60,  dur: 11, pause: 1.0 },
  { emoji: '☕', pts: 70,  dur: 9, pause: 2.0 },
  { emoji: '🚌', pts: 150, dur: 5, pause: 0.5 },
  { emoji: '📬', pts: 50,  dur: 12, pause: 1.5 },
];

export default function OpenUmbrellaGameTwoPlayer() {
  const [gameState, setGameState] = useState<GameState>('menu');
  const [endStats, setEndStats] = useState({ score: 0, time: 0 });
  const ref = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ gameState });
  const keysRef = useRef<Record<string, boolean>>({});
  const isTouchRef = useRef(false);

  useEffect(() => { stateRef.current = { gameState }; }, [gameState]);
  useEffect(() => { isTouchRef.current = navigator.maxTouchPoints > 0; }, []);

  const handleStart = () => { setGameState('playing'); };
  const handleRestart = () => { setGameState('playing'); };
  const handleMenu = () => { setGameState('menu'); };

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;

    let W = 360, H = 540;
    const setCanvasSize = () => {
      const container = canvas.parentElement;
      if (container) {
        const rect = container.getBoundingClientRect();
        W = Math.max(rect.width, 1);
        H = Math.max(rect.height, 1);
        canvas.width = W;
        canvas.height = H;
      }
    };
    setCanvasSize();
    let raf = 0, t = 0, lastTs = 0;
    let score = 0, wet = 0, elapsed = 0, running = stateRef.current.gameState === 'playing';
    let wx = W / 2, wy = H / 2, wvx = 0, wvy = 0;
    let fx = W / 2 + 30, fy = H / 2 + 30, fvx = 0, fvy = 0;
    const drops: Drop[] = [];
    let goals: Goal[] = [];
    let sparks: Spark[] = [];
    const ripples: Ripple[] = [];
    let difficulty = 1;
    let diffTimer = 0;
    let bgOff = 0;
    // facing + walk-cycle state for the two figures
    let wAngle = 0, fAngle = 0, wPhase = 0, fPhase = 0;

    // Keyboard input
    const KEYS = keysRef.current;
    const onDown = (e: KeyboardEvent) => { KEYS[e.key] = true; };
    const onUp = (e: KeyboardEvent) => { KEYS[e.key] = false; };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);

    function newDrop(anywhere = false): Drop {
      return { x: Math.random() * W, y: anywhere ? Math.random() * H : -18, len: 10 + Math.random() * 14, spd: 4 + Math.random() * 3, a: 0.1 + Math.random() * 0.12 };
    }
    for (let i = 0; i < 90; i++) drops.push(newDrop(true));

    function spawnGoal() {
      const type = GOAL_TYPES[Math.floor(Math.random() * GOAL_TYPES.length)];
      let gx = 0, gy = 0, tries = 0;
      do { gx = 50 + Math.random() * (W - 100); gy = 50 + Math.random() * (H - 100); tries++; }
      while (tries < 20 && Math.hypot(gx - wx, gy - wy) < 90 && Math.hypot(gx - fx, gy - fy) < 90);
      goals.push({ ...type, x: gx, y: gy, age: 0, pulse: 0, reached: false, pauseLeft: 0 });
    }
    spawnGoal(); spawnGoal();

    function update(dt: number) {
      t += dt; elapsed += dt; bgOff = (bgOff + 0.8) % 80;
      diffTimer += dt;
      if (diffTimer > 15) { diffTimer = 0; difficulty = Math.min(3, difficulty + 0.15); }
      const pwx = wx, pwy = wy, pfx = fx, pfy = fy;

      for (const d of drops) { d.y += d.spd * (1 + difficulty * 0.25); if (d.y > H) Object.assign(d, newDrop()); }

      tickRipples(ripples, dt, 12, () => ({ x: Math.random() * W, y: Math.random() * H }));

      // P1 (woman) - WASD
      const p1spd = (3.5 + difficulty * 0.3) * dt * 60;
      if (KEYS['a'] || KEYS['A']) wvx -= p1spd * 0.2;
      if (KEYS['d'] || KEYS['D']) wvx += p1spd * 0.2;
      if (KEYS['w'] || KEYS['W']) wvy -= p1spd * 0.2;
      if (KEYS['s'] || KEYS['S']) wvy += p1spd * 0.2;
      wvx *= 0.85; wvy *= 0.85; wx += wvx; wy += wvy;
      wx = Math.max(20, Math.min(W - 20, wx)); wy = Math.max(20, Math.min(H - 20, wy));

      // P2 (follower) - Arrow keys
      const p2spd = (3.5 + difficulty * 0.3) * dt * 60;
      if (KEYS['ArrowLeft']) fvx -= p2spd * 0.2;
      if (KEYS['ArrowRight']) fvx += p2spd * 0.2;
      if (KEYS['ArrowUp']) fvy -= p2spd * 0.2;
      if (KEYS['ArrowDown']) fvy += p2spd * 0.2;
      fvx *= 0.85; fvy *= 0.85; fx += fvx; fy += fvy;
      fx = Math.max(20, Math.min(W - 20, fx)); fy = Math.max(20, Math.min(H - 20, fy));

      // Goals - collect by either player
      for (const g of goals) {
        g.age += dt; g.pulse = (g.pulse + dt * 3) % (Math.PI * 2);
        const d1 = Math.hypot(wx - g.x, wy - g.y);
        const d2 = Math.hypot(fx - g.x, fy - g.y);
        if (!g.reached && g.pauseLeft <= 0 && (d1 < 20 || d2 < 20)) {
          g.reached = true; g.pauseLeft = g.pause; score += Math.round(g.pts * difficulty);
          const collector = d1 < d2 ? { x: wx, y: wy } : { x: fx, y: fy };
          sparks.push(...Array.from({ length: 5 }, () => ({ x: collector.x, y: collector.y, vx: (Math.random() - .5) * 3, vy: (Math.random() - .5) * 3, life: 1, emoji: g.emoji })));
          spawnGoal();
          if (goals.filter(g => !g.reached).length < 2) spawnGoal();
        }
        if (g.pauseLeft > 0) { g.pauseLeft -= dt; wvx *= 0.8; wvy *= 0.8; fvx *= 0.8; fvy *= 0.8; }
      }
      goals = goals.filter(g => g.reached || g.age < g.dur);

      // facing + stride
      const wStep = Math.hypot(wx - pwx, wy - pwy);
      const fStep = Math.hypot(fx - pfx, fy - pfy);
      if (wStep > 0.35) wAngle = Math.atan2(wy - pwy, wx - pwx) + Math.PI / 2;
      if (fStep > 0.35) fAngle = Math.atan2(fy - pfy, fx - pfx) + Math.PI / 2;
      wPhase += (0.6 + wStep * 6) * dt * 5;
      fPhase += (0.6 + fStep * 6) * dt * 5;

      // wetness - based on separation
      const sep = Math.hypot(fx - wx, fy - wy);
      if (sep > COVER_R) wet = Math.min(1, wet + dt * 0.18); else wet = Math.max(0, wet - dt * 0.05);

      sparks.forEach(s => { s.x += s.vx; s.y += s.vy; s.life -= dt * 1.5; });
      sparks = sparks.filter(s => s.life > 0);

      if (wet >= 1) {
        running = false;
        setEndStats({ score: Math.round(score), time: Math.round(elapsed) });
        setGameState('dead');
      }
    }

    function draw() {
      const inset = Math.min(KERB_INSET, W * 0.16);
      const view: StreetView = {
        W, H, left: inset, right: W - inset, scroll: 0,
        walk: walkWidth(W, W - inset * 2),
      };

      ctx.clearRect(0, 0, W, H);
      drawGround(ctx, view);
      drawProps(ctx, view, 0, t);

      const sep = Math.hypot(fx - wx, fy - wy);
      const dry: DryZone[] = [{ x: wx, y: wy, r: COVER_R }];

      drawRipples(ctx, ripples, undefined, dry);

      for (const g of goals) {
        if (g.reached) continue;
        drawGoalMarker(ctx, g.x, g.y, g.emoji, 1 - g.age / g.dur, g.pulse, g.age * 2);
      }

      drawDryZone(ctx, wx, wy, COVER_R, sep / COVER_R);

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

      drawWetOverlay(ctx, W, H, fx, fy, wet);
      drawHud(ctx, W, score, wet, 54);

      if (!running) {
        drawPrompt(
          ctx, W, H,
          isTouchRef.current ? 'tap to start' : 'click to start',
          isTouchRef.current ? 'use the D-pads to move' : 'P1: WASD · P2: Arrow keys',
        );
      }
    }

    function loop(ts: number) {
      const dt = Math.min((ts - lastTs) / 1000, 0.05);
      lastTs = ts;
      if (running) update(dt);
      draw();
      raf = requestAnimationFrame(loop);
    }
    lastTs = performance.now();
    raf = requestAnimationFrame(loop);

    const handleResize = () => {
      setCanvasSize();
    };
    window.addEventListener('resize', handleResize);
    canvas.addEventListener('click', () => { running = true; });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [gameState]);

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={ref}
        className="block w-full h-full"
        style={{ cursor: 'default', display: 'block', touchAction: 'none' }}
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
