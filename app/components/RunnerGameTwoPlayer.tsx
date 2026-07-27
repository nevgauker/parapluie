'use client';
import { useEffect, useRef, useState } from 'react';
import VirtualDPad from './VirtualDPad';
import {
  PALETTE, drawGround, drawProps, drawRainField, drawRipples, tickRipples, drawWalker,
  drawDryZone, drawGoalMarker, drawObstacle, drawWetOverlay, drawHud,
  drawPrompt, walkWidth,
  type StreetView, type DryZone, type Ripple,
} from '../_lib/street';

interface Drop { x: number; y: number; len: number; spd: number; a: number }
interface Goal { x: number; y: number; emoji: string; pts: number; dur: number; pause: number; age: number; pulse: number; reached: boolean; pauseLeft: number }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; emoji: string }
interface Obstacle { id: number; y: number; x: number; w: number; h: number; emoji: string }

type GameState = 'menu' | 'playing' | 'dead';

const CITIES = {
  osaka: { name: 'Osaka', obstacles: [{ emoji: '🏗️', w: 60, h: 40 }, { emoji: '🚗', w: 80, h: 50 }, { emoji: '⚙️', w: 50, h: 50 }] },
  tokyo: { name: 'Tokyo', obstacles: [{ emoji: '🏢', w: 70, h: 60 }, { emoji: '🤖', w: 55, h: 55 }, { emoji: '📡', w: 40, h: 70 }] },
  paris: { name: 'Paris', obstacles: [{ emoji: '🎨', w: 50, h: 50 }, { emoji: '🚴', w: 65, h: 45 }, { emoji: '🥖', w: 60, h: 40 }] },
};
type City = keyof typeof CITIES;

const GOAL_TYPES = [
  { emoji: '🐕', pts: 120, dur: 9, pause: 2.0 },
  { emoji: '🍊', pts: 80, dur: 7, pause: 1.5 },
  { emoji: '🌸', pts: 60, dur: 11, pause: 1.0 },
  { emoji: '☕', pts: 70, dur: 9, pause: 2.0 },
  { emoji: '🚌', pts: 150, dur: 5, pause: 0.5 },
  { emoji: '📬', pts: 50, dur: 12, pause: 1.5 },
];

const STREET_WIDTH = 320;
/** How far P2 can stray before the rain reaches them. */
const COVER_R = 72;
/** Drawn size of the canopy itself — the shelter circle is wider. */
const CANOPY_R = 25;

export default function RunnerGameTwoPlayer() {
  const [gameState, setGameState] = useState<GameState>('menu');
  const [city, setCity] = useState<City>('tokyo');
  const [endStats, setEndStats] = useState({ score: 0, time: 0 });
  const ref = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ gameState });
  const keysRef = useRef<Record<string, boolean>>({});
  const isTouchRef = useRef(false);

  useEffect(() => { stateRef.current = { gameState }; }, [gameState]);
  useEffect(() => { isTouchRef.current = navigator.maxTouchPoints > 0; }, []);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;

    let W = 360, H = 540;
    const setCanvasSize = () => {
      const container = canvas.parentElement;
      if (container) {
        W = Math.max(container.clientWidth, 1);
        H = Math.max(container.clientHeight, 1);
        canvas.width = W;
        canvas.height = H;
      }
    };
    setCanvasSize();
    window.addEventListener('resize', setCanvasSize);

    let raf = 0, t = 0, lastTs = 0;
    let score = 0, wet = 0, elapsed = 0, running = stateRef.current.gameState === 'playing';
    let worldY = 0;
    let wx = W / 2, wy = 0, wvx = 0, wvy = 0;
    let fx = W / 2, fy = 80, fvx = 0, fvy = 0;
    const drops: Drop[] = [];
    let goals: Goal[] = [];
    let sparks: Spark[] = [];
    let obstacles: Obstacle[] = [];
    const ripples: Ripple[] = [];
    let obstacleId = 0;
    let difficulty = 1, diffTimer = 0, obstacleTimer = 0, goalTimer = 0;
    // facing + walk-cycle state for the two figures
    let wAngle = 0, fAngle = 0, wPhase = 0, fPhase = 0;

    const cityConfig = CITIES[city];
    const KEYS = keysRef.current;

    // The roadway narrows on small screens so the sidewalks stay visible.
    const roadW = () => Math.max(180, Math.min(STREET_WIDTH, W - 56));
    const edges = () => { const w = roadW(); return { left: (W - w) / 2, right: (W + w) / 2 }; };
    const project = (y: number) => y - worldY + H / 2;

    const onDown = (e: KeyboardEvent) => { KEYS[e.key] = true; };
    const onUp = (e: KeyboardEvent) => { KEYS[e.key] = false; };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);

    function newDrop(): Drop {
      return { x: Math.random() * W, y: Math.random() * H, len: 10 + Math.random() * 14, spd: 4 + Math.random() * 3, a: 0.1 + Math.random() * 0.12 };
    }
    for (let i = 0; i < 90; i++) drops.push(newDrop());

    function spawnGoal() {
      const type = GOAL_TYPES[Math.floor(Math.random() * GOAL_TYPES.length)];
      const { left, right } = edges();
      const gx = left + 40 + Math.random() * Math.max(20, right - left - 80);
      const gy = worldY - 150 - Math.random() * 200;
      goals.push({ ...type, x: gx, y: gy, age: 0, pulse: 0, reached: false, pauseLeft: 0 });
    }
    spawnGoal(); spawnGoal();

    function spawnObstacle() {
      const obs = cityConfig.obstacles[Math.floor(Math.random() * cityConfig.obstacles.length)];
      const { left, right } = edges();
      const ox = left + Math.random() * Math.max(10, right - left - obs.w);
      const oy = worldY - 200 - Math.random() * 150;
      obstacles.push({ id: obstacleId++, x: ox, y: oy, w: obs.w, h: obs.h, emoji: obs.emoji });
    }

    function update(dt: number) {
      t += dt; elapsed += dt; diffTimer += dt;
      if (diffTimer > 12) { diffTimer = 0; difficulty = Math.min(3, difficulty + 0.2); }

      worldY -= (1.5 + difficulty * 0.4) * dt * 60;

      for (const d of drops) {
        d.y += d.spd * (1 + difficulty * 0.2);
        if (d.y > H) Object.assign(d, newDrop());
      }

      const { left: streetLeft, right: streetRight } = edges();
      const pwx = wx, pwy = wy, pfx = fx, pfy = fy;
      const spd = 2.8 * dt * 60;

      // Rain hitting the road, in world space so the rings scroll with it.
      tickRipples(ripples, dt, 11, () => ({
        x: streetLeft + Math.random() * (streetRight - streetLeft),
        y: worldY - H / 2 + Math.random() * H,
      }));

      // P1 (woman) - free movement with WASD
      if (KEYS['a'] || KEYS['A']) wvx -= spd;
      if (KEYS['d'] || KEYS['D']) wvx += spd;
      if (KEYS['w'] || KEYS['W']) wvy -= spd;
      if (KEYS['s'] || KEYS['S']) wvy += spd;

      // Obstacle avoidance for woman
      obstacles.forEach((obs) => {
        const closestX = Math.max(obs.x, Math.min(wx, obs.x + obs.w));
        const closestY = Math.max(obs.y, Math.min(wy, obs.y + obs.h));
        const dx = wx - closestX;
        const dy = wy - closestY;
        const dist = Math.hypot(dx, dy);
        const avoidDist = 80;
        if (dist < avoidDist && dist > 0) {
          const repel = (avoidDist - dist) / avoidDist * 0.12;
          wvx += (dx / dist) * repel;
          wvy += (dy / dist) * repel;
        }
      });

      wvx *= 0.88; wvy *= 0.88;
      wx += wvx; wy += wvy;
      wx = Math.max(streetLeft + 20, Math.min(streetRight - 20, wx));
      wy = Math.max(worldY - H / 2 + 40, Math.min(worldY + H / 2 - 40, wy));

      // P2 (follower) - free movement with Arrow keys
      if (KEYS['ArrowLeft']) fvx -= spd;
      if (KEYS['ArrowRight']) fvx += spd;
      if (KEYS['ArrowUp']) fvy -= spd;
      if (KEYS['ArrowDown']) fvy += spd;
      fvx *= 0.88; fvy *= 0.88;
      fx += fvx; fy += fvy;
      fx = Math.max(streetLeft + 15, Math.min(streetRight - 15, fx));
      fy = Math.max(worldY - H / 2 + 40, Math.min(worldY + H / 2 - 40, fy));

      // Obstacle collision - accurate circle-to-rectangle
      obstacles.forEach((obs) => {
        const circleToRect = (cx: number, cy: number, radius: number): boolean => {
          const closestX = Math.max(obs.x, Math.min(cx, obs.x + obs.w));
          const closestY = Math.max(obs.y, Math.min(cy, obs.y + obs.h));
          const dx = cx - closestX;
          const dy = cy - closestY;
          return dx * dx + dy * dy < radius * radius;
        };

        if (circleToRect(wx, wy, 20)) {
          wx -= wvx * 0.8; wy -= wvy * 0.8;
          wvx *= -0.5; wvy *= -0.5;
        }
        if (circleToRect(fx, fy, 20)) {
          fx -= fvx * 0.8; fy -= fvy * 0.8;
          fvx *= -0.5; fvy *= -0.5;
        }
      });

      // Facing and stride: the street itself is moving, so both figures keep
      // walking even when the players hold still.
      const wStep = Math.hypot(wx - pwx, wy - pwy);
      const fStep = Math.hypot(fx - pfx, fy - pfy);
      if (wStep > 0.35) wAngle = Math.atan2(wy - pwy, wx - pwx) + Math.PI / 2;
      if (fStep > 0.35) fAngle = Math.atan2(fy - pfy, fx - pfx) + Math.PI / 2;
      wPhase += (2 + wStep * 6) * dt * 5;
      fPhase += (2 + fStep * 6) * dt * 5;

      // Goals - BOTH players can collect
      for (const g of goals) {
        g.age += dt;
        g.pulse = (g.pulse + dt * 3) % (Math.PI * 2);
        const dw = Math.hypot(wx - g.x, wy - g.y);
        const df = Math.hypot(fx - g.x, fy - g.y);
        if (!g.reached && g.pauseLeft <= 0 && (dw < 20 || df < 20)) {
          g.reached = true;
          g.pauseLeft = g.pause;
          score += Math.round(g.pts * difficulty);
          const collector = dw < df ? { x: wx, y: wy } : { x: fx, y: fy };
          sparks.push(...Array.from({ length: 5 }, () => ({ x: collector.x, y: collector.y, vx: (Math.random() - .5) * 3, vy: (Math.random() - .5) * 3, life: 1, emoji: g.emoji })));
          if (goals.filter(g => !g.reached).length < 3) spawnGoal();
        }
        if (g.pauseLeft > 0) g.pauseLeft -= dt;
      }
      goals = goals.filter(g => !g.reached && g.age < g.dur);

      goalTimer -= dt;
      if (goalTimer <= 0) {
        spawnGoal();
        goalTimer = 3 / difficulty;
      }

      obstacleTimer -= dt;
      if (obstacleTimer <= 0) {
        spawnObstacle();
        obstacleTimer = 4 / difficulty;
      }
      obstacles = obstacles.filter(o => o.y > worldY - H - 100);

      // Wetness
      const sep = Math.hypot(fx - wx, fy - wy);
      if (sep > COVER_R) wet = Math.min(1, wet + dt * 0.18);
      else wet = Math.max(0, wet - dt * 0.05);

      sparks.forEach(s => {
        s.x += s.vx; s.y += s.vy; s.life -= dt * 1.5;
      });
      sparks = sparks.filter(s => s.life > 0);

      if (wet >= 1) {
        running = false;
        setEndStats({ score: Math.round(score), time: Math.round(elapsed) });
        setGameState('dead');
      }
    }

    function draw() {
      const { left, right } = edges();
      const view: StreetView = { W, H, left, right, scroll: -worldY, walk: walkWidth(W, right - left) };

      ctx.clearRect(0, 0, W, H);
      drawGround(ctx, view);
      drawProps(ctx, view, worldY, t);

      const wScreenY = project(wy);
      const fScreenY = project(fy);
      const sep = Math.hypot(fx - wx, fy - wy);
      const dry: DryZone[] = [{ x: wx, y: wScreenY, r: COVER_R }];

      drawRipples(ctx, ripples, project, dry);

      obstacles.forEach((obs) => {
        const screenY = project(obs.y);
        if (screenY > -140 && screenY < H + 140) drawObstacle(ctx, obs.x, screenY, obs.w, obs.h, obs.emoji);
      });

      for (const g of goals) {
        if (g.reached) continue;
        const screenY = project(g.y);
        if (screenY > -60 && screenY < H + 60) {
          drawGoalMarker(ctx, g.x, screenY, g.emoji, 1 - g.age / g.dur, g.pulse, g.age * 2);
        }
      }

      drawDryZone(ctx, wx, wScreenY, COVER_R, sep / COVER_R);

      // P2 walks bare-headed; P1 is hidden under the canopy.
      drawWalker(ctx, fx, fScreenY, { jacket: PALETTE.jacketOlive, accent: '#e08a3c' }, {
        angle: fAngle, phase: fPhase, wet,
      });
      drawWalker(ctx, wx, wScreenY, { jacket: PALETTE.jacketBlue, accent: '#7cc24f' }, {
        angle: wAngle, phase: wPhase, umbrella: CANOPY_R, spin: Math.sin(t * 0.7) * 0.06,
      });

      drawRainField(ctx, drops, H, undefined, dry);

      for (const s of sparks) {
        ctx.save();
        ctx.globalAlpha = s.life;
        ctx.font = '14px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.emoji, s.x, project(s.y));
        ctx.restore();
      }

      drawWetOverlay(ctx, W, H, fx, fScreenY, wet);
      drawHud(ctx, W, score, wet, 54);

      if (!running) {
        drawPrompt(
          ctx, W, H,
          isTouchRef.current ? 'tap to start' : 'click to start',
          'P1: WASD · P2: Arrows — collect together',
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

    const handleResize = () => { setCanvasSize(); };
    window.addEventListener('resize', handleResize);
    canvas.addEventListener('click', () => { running = true; });
    canvas.addEventListener('touchstart', () => { running = true; }, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [gameState, city]);

  const handleRestart = () => { setGameState('playing'); };
  const handleMenu = () => { setGameState('menu'); };

  return (
    <div className="relative w-full h-full">
      <canvas ref={ref} className="block w-full h-full" style={{ cursor: 'default', display: 'block', touchAction: 'none' }} />
      <VirtualDPad keysRef={keysRef} keyMap={{ up: 'w', down: 's', left: 'a', right: 'd' }} position="left" color="#7cc24f" label="P1" />
      <VirtualDPad keysRef={keysRef} keyMap={{ up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }} position="right" color="#e08a3c" label="P2" />

      {gameState === 'menu' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: 'rgba(0,0,0,0.78)', borderRadius: 16 }}>
          <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 28, fontWeight: 700, color: 'var(--fog)', marginBottom: 6 }}>Runner</p>
          <p style={{ fontSize: 12, color: 'rgba(240,236,224,0.4)', marginBottom: 28, textAlign: 'center', lineHeight: 1.7 }}>Walk forward together.<br />Collect goals. Stay dry.</p>
          <div className="flex gap-2 mb-6">
            {(Object.keys(CITIES) as City[]).map(c => (
              <button key={c} onClick={() => setCity(c)} style={{ padding: '6px 16px', borderRadius: 20, border: '.5px solid', borderColor: city === c ? 'rgba(240,236,224,0.45)' : 'rgba(240,236,224,0.15)', background: city === c ? 'rgba(240,236,224,0.12)' : 'transparent', color: city === c ? 'var(--fog)' : 'rgba(240,236,224,0.45)', fontSize: 13, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>{CITIES[c].name}</button>
            ))}
          </div>
          <button onClick={handleRestart} style={{ padding: '10px 28px', borderRadius: 24, background: 'var(--brick)', color: '#1a1408', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Start Game</button>
        </div>
      )}

      {gameState === 'dead' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: 'rgba(0,0,0,0.82)' }}>
          <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 700, color: 'var(--fog)', marginBottom: 4 }}>{endStats.time > 30 ? 'Not bad.' : 'Soaked.'}</p>
          <p style={{ fontSize: 12, color: 'rgba(240,236,224,0.35)', marginBottom: 24 }}>{endStats.time > 60 ? 'Great teamwork!' : endStats.time > 30 ? 'Keep going' : 'Stay together!'}</p>
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
