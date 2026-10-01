'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  PALETTE, drawGround, drawProps, drawRainField, drawRipples, tickRipples, drawWalker,
  drawDryZone, drawGoalMarker, drawWetOverlay, drawHud, drawPrompt, walkWidth,
  drawFloatTexts, tickFloatTexts,
  type StreetView, type DryZone, type Ripple, type FloatText,
} from '../_lib/street';
import { newDryStreak, tickDryStreak, streakCallouts } from '../_lib/dryStreak';

interface Drop { x: number; y: number; len: number; spd: number; a: number; }
interface Goal { x: number; y: number; emoji: string; pts: number; dur: number; pause: number; age: number; pulse: number; reached: boolean; }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; emoji: string; }

type GameState = 'menu' | 'playing' | 'dead';

/** How far the follower can stray before the rain reaches them. */
const COVER_R = 72;
/** Drawn size of the canopy itself — the shelter circle is wider. */
const CANOPY_R = 25;
/** Pavement strip left either side of the open square. */
const KERB_INSET = 66;

/** After lingering at a goal she sprints to the next one, this much faster... */
const DASH_BOOST = 1.6;
/** ...for this many seconds. */
const DASH_TIME = 0.6;
/** Follower top speed as a share of her dash: a dash you didn't see coming opens a gap. */
const FOLLOW_MAX = 0.9;
/** Her top speed in px per 60 Hz frame for each unit of walk speed (push 0.18, damping 0.86). */
const TOP_SPEED = 0.18 * 0.86 / 0.14;

const GOAL_TYPES = [
  { emoji: '🐕', pts: 120, dur: 9, pause: 2.0 },
  { emoji: '🍊', pts: 80,  dur: 7, pause: 1.5 },
  { emoji: '🌸', pts: 60,  dur: 11, pause: 1.0 },
  { emoji: '☕', pts: 70,  dur: 9, pause: 2.0 },
  { emoji: '🚌', pts: 150, dur: 5, pause: 0.5 },
  { emoji: '📬', pts: 50,  dur: 12, pause: 1.5 },
];

export default function OpenUmbrellaGame() {
  const [gameState, setGameState] = useState<GameState>('menu');
  const [endStats, setEndStats] = useState({ score: 0, time: 0 });
  const ref = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ gameState });
  const isTouchRef = useRef(false);

  useEffect(() => { stateRef.current = { gameState }; }, [gameState]);
  useEffect(() => { isTouchRef.current = navigator.maxTouchPoints > 0; }, []);

  const handleRestart = () => { setGameState('playing'); };

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
    let fx = W / 2 + 30, fy = H / 2 + 30, fTargetX = fx, fTargetY = fy;
    const drops: Drop[] = [];
    let goals: Goal[] = [];
    let sparks: Spark[] = [];
    const ripples: Ripple[] = [];
    let difficulty = 1;
    let diffTimer = 0;
    let bgOff = 0;
    // facing + walk-cycle state for the two figures
    let wAngle = 0, fAngle = 0, wPhase = 0, fPhase = 0;
    // her rhythm: walk to `target`, linger for pauseLeft, then dash for dashLeft
    let target: Goal | null = null;
    let pauseLeft = 0, dashLeft = 0;
    // the follower's reward for playing the rim: multiplier + close-call bonus
    const streak = newDryStreak();
    let floats: FloatText[] = [];

    function newDrop(anywhere = false): Drop {
      return { x: Math.random() * W, y: anywhere ? Math.random() * H : -18, len: 10 + Math.random() * 14, spd: 4 + Math.random() * 3, a: 0.1 + Math.random() * 0.12 };
    }
    for (let i = 0; i < 90; i++) drops.push(newDrop(true));

    function spawnGoal() {
      const type = GOAL_TYPES[Math.floor(Math.random() * GOAL_TYPES.length)];
      let gx = 0, gy = 0, tries = 0;
      do { gx = 50 + Math.random() * (W - 100); gy = 50 + Math.random() * (H - 100); tries++; }
      while (tries < 20 && Math.hypot(gx - wx, gy - wy) < 90);
      goals.push({ ...type, x: gx, y: gy, age: 0, pulse: 0, reached: false });
    }
    spawnGoal(); spawnGoal();

    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      fTargetX = (e.clientX - r.left) * (W / r.width);
      fTargetY = (e.clientY - r.top) * (H / r.height);
    });
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      fTargetX = (e.touches[0].clientX - r.left) * (W / r.width);
      fTargetY = (e.touches[0].clientY - r.top) * (H / r.height);
    }, { passive: false });
    canvas.addEventListener('touchstart', e => {
      const r = canvas.getBoundingClientRect();
      fTargetX = (e.touches[0].clientX - r.left) * (W / r.width);
      fTargetY = (e.touches[0].clientY - r.top) * (H / r.height);
      if (!running) { running = true; }
    }, { passive: false });
    canvas.addEventListener('click', () => { running = true; });

    function update(dt: number) {
      t += dt; elapsed += dt; bgOff = (bgOff + 0.8) % 80;
      diffTimer += dt;
      if (diffTimer > 15) { diffTimer = 0; difficulty = Math.min(3, difficulty + 0.15); }
      const pwx = wx, pwy = wy, pfx = fx, pfy = fy;

      for (const d of drops) { d.y += d.spd * (1 + difficulty * 0.25); if (d.y > H) Object.assign(d, newDrop()); }

      tickRipples(ripples, dt, 12, () => ({ x: Math.random() * W, y: Math.random() * H }));

      // woman AI: walk to a goal, linger there, then dash to the next one
      const f = dt * 60;
      const walk = 1.4 * (1 + difficulty * 0.3);
      if (target && !goals.includes(target)) target = null;
      if (!target) target = goals.find(g => !g.reached) ?? null;
      if (pauseLeft > 0) {
        pauseLeft -= dt;
        if (pauseLeft <= 0) dashLeft = DASH_TIME;
        wvx *= Math.pow(0.8, f); wvy *= Math.pow(0.8, f);
      } else if (target) {
        const dx = target.x - wx, dy = target.y - wy, dist = Math.hypot(dx, dy);
        if (dist > 8) {
          const spd = walk * (dashLeft > 0 ? DASH_BOOST : 1);
          wvx += (dx / dist) * spd * 0.18 * f; wvy += (dy / dist) * spd * 0.18 * f;
        } else {
          target.reached = true; pauseLeft = target.pause; dashLeft = 0;
          const pts = Math.round(target.pts * difficulty * streak.mult);
          score += pts;
          floats.push({ x: wx, y: wy - 30, text: `+${pts}`, color: PALETTE.cream, life: 1 });
          const emoji = target.emoji;
          sparks.push(...Array.from({ length: 5 }, () => ({ x: wx, y: wy, vx: (Math.random() - .5) * 3, vy: (Math.random() - .5) * 3, life: 1, emoji })));
          target = null;
        }
      }
      if (pauseLeft <= 0) dashLeft = Math.max(0, dashLeft - dt);

      wvx += (Math.random() - .5) * 0.06 * f; wvy += (Math.random() - .5) * 0.06 * f;
      wvx *= Math.pow(0.86, f); wvy *= Math.pow(0.86, f); wx += wvx * f; wy += wvy * f;
      wx = Math.max(20, Math.min(W - 20, wx)); wy = Math.max(20, Math.min(H - 20, wy));

      for (const g of goals) { g.age += dt; g.pulse = (g.pulse + dt * 3) % (Math.PI * 2); }
      goals = goals.filter(g => !g.reached && g.age < g.dur);
      // Top up after both reaching and expiry, or a run where every goal
      // fades unreached leaves her nothing to walk to.
      while (goals.length < 2) spawnGoal();

      // follower: eases toward the pointer, but no faster than FOLLOW_MAX of her dash
      const fMax = FOLLOW_MAX * walk * DASH_BOOST * TOP_SPEED * f;
      const ease = 1 - Math.pow(0.88, f);
      let mx = (fTargetX - fx) * ease, my = (fTargetY - fy) * ease;
      const m = Math.hypot(mx, my);
      if (m > fMax) { mx *= fMax / m; my *= fMax / m; }
      fx += mx; fy += my;

      // facing + stride
      const wStep = Math.hypot(wx - pwx, wy - pwy);
      const fStep = Math.hypot(fx - pfx, fy - pfy);
      if (wStep > 0.35) wAngle = Math.atan2(wy - pwy, wx - pwx) + Math.PI / 2;
      // The tell: near the end of a pause she turns toward where she'll dash.
      if (pauseLeft > 0 && pauseLeft < 0.5 && target) wAngle = Math.atan2(target.y - wy, target.x - wx) + Math.PI / 2;
      if (fStep > 0.35) fAngle = Math.atan2(fy - pfy, fx - pfx) + Math.PI / 2;
      wPhase += (0.6 + wStep * 6) * dt * 5;
      fPhase += (0.6 + fStep * 6) * dt * 5;

      // wetness
      const sep = Math.hypot(fx - wx, fy - wy);
      const edge = tickDryStreak(streak, sep, COVER_R, dt, difficulty);
      score += edge.pts;
      floats.push(...streakCallouts(edge.events, fx, fy));
      floats = tickFloatTexts(floats, dt);
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

      drawDryZone(ctx, wx, wy, COVER_R, sep / COVER_R, streak.mult);

      drawWalker(ctx, fx, fy, { jacket: PALETTE.jacketOlive, accent: '#e08a3c' }, {
        angle: fAngle, phase: fPhase, wet,
      });
      drawWalker(ctx, wx, wy, { jacket: PALETTE.jacketBlue, accent: '#7cc24f' }, {
        angle: wAngle, phase: wPhase, umbrella: CANOPY_R, spin: Math.sin(t * 0.7) * 0.06,
      });

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
        drawPrompt(
          ctx, W, H,
          isTouchRef.current ? 'tap to start' : 'click to start',
          isTouchRef.current ? 'drag to control the follower' : 'move your mouse to control the follower',
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

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleResize);
    };
  }, [gameState]);

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={ref}
        className="block w-full h-full"
        style={{ cursor: 'crosshair', display: 'block', touchAction: 'none' }}
      />

      {gameState === 'dead' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: 'rgba(0,0,0,0.82)' }}>
          <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 700, color: 'var(--fog)', marginBottom: 4 }}>
            {endStats.time > 30 ? 'Not bad.' : 'Soaked.'}
          </p>
          <p style={{ fontSize: 12, color: 'rgba(240,236,224,0.35)', marginBottom: 24 }}>
            {endStats.time > 60 ? 'Great run!' : endStats.time > 30 ? 'Keep practicing' : 'Stay closer to the umbrella!'}
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
            <Link href="/" style={{ padding: '10px 24px', borderRadius: 24, background: 'transparent', color: 'rgba(240,236,224,0.55)', border: '.5px solid rgba(240,236,224,0.2)', fontSize: 13, cursor: 'pointer', fontFamily: 'Inter,sans-serif', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>Back home</Link>
          </div>
        </div>
      )}
    </div>
  );
}
