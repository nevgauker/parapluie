'use client';
import { useEffect, useRef, useState } from 'react';

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

export default function RunnerGameSolo() {
  const [gameState, setGameState] = useState<GameState>('menu');
  const [city, setCity] = useState<City>('tokyo');
  const [endStats, setEndStats] = useState({ score: 0, time: 0 });
  const ref = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ gameState });
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
    let worldY = 0;
    let wx = W / 2, wy = 0, wvx = 0, wvy = 0;
    let fx = W / 2, fy = 80;
    let fTargetX = fx, fTargetY = fy;
    const drops: Drop[] = [];
    let goals: Goal[] = [];
    let sparks: Spark[] = [];
    let obstacles: Obstacle[] = [];
    let obstacleId = 0;
    let difficulty = 1, diffTimer = 0, obstacleTimer = 0, goalTimer = 0;

    const cityConfig = CITIES[city];

    function newDrop(): Drop {
      return { x: Math.random() * W, y: Math.random() * H, len: 10 + Math.random() * 14, spd: 4 + Math.random() * 3, a: 0.1 + Math.random() * 0.12 };
    }
    for (let i = 0; i < 90; i++) drops.push(newDrop());

    function spawnGoal() {
      const type = GOAL_TYPES[Math.floor(Math.random() * GOAL_TYPES.length)];
      const streetLeft = W / 2 - STREET_WIDTH / 2;
      const gx = streetLeft + 40 + Math.random() * (STREET_WIDTH - 80);
      const gy = worldY - 150 - Math.random() * 200;
      goals.push({ ...type, x: gx, y: gy, age: 0, pulse: 0, reached: false, pauseLeft: 0 });
    }
    spawnGoal(); spawnGoal();

    function spawnObstacle() {
      const obs = cityConfig.obstacles[Math.floor(Math.random() * cityConfig.obstacles.length)];
      const streetLeft = W / 2 - STREET_WIDTH / 2;
      const ox = streetLeft + Math.random() * (STREET_WIDTH - obs.w);
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

      const streetLeft = W / 2 - STREET_WIDTH / 2;
      const streetRight = W / 2 + STREET_WIDTH / 2;

      // Woman AI - attracted to nearest goal like Open World
      const nearestGoal = goals.find(g => !g.reached);
      if (nearestGoal) {
        const dx = nearestGoal.x - wx;
        const dy = nearestGoal.y - wy;
        const dist = Math.hypot(dx, dy);
        if (dist > 15) {
          wvx += (dx / dist) * 0.08;
          wvy += (dy / dist) * 0.08;
        }
      } else {
        wvx *= 0.9;
        wvy *= 0.9;
      }

      // Obstacle avoidance - steer away from nearby obstacles
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

      // Follower - player controlled via mouse (just follows)
      fx += (fTargetX - fx) * 0.12;
      fy += (fTargetY - fy) * 0.12;
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
        if (circleToRect(fx, fy, 15)) {
          fx -= (fTargetX - fx) * 0.3;
          fy -= (fTargetY - fy) * 0.3;
        }
      });

      // Goals - ONLY woman collects them
      for (const g of goals) {
        g.age += dt;
        g.pulse = (g.pulse + dt * 3) % (Math.PI * 2);
        const dw = Math.hypot(wx - g.x, wy - g.y);
        if (!g.reached && g.pauseLeft <= 0 && dw < 20) {
          g.reached = true;
          g.pauseLeft = g.pause;
          score += Math.round(g.pts * difficulty);
          sparks.push(...Array.from({ length: 5 }, () => ({ x: wx, y: wy, vx: (Math.random() - .5) * 3, vy: (Math.random() - .5) * 3, life: 1, emoji: g.emoji })));
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

      // Wetness - increased safe radius to 100px
      const sep = Math.hypot(fx - wx, fy - wy);
      if (sep > 100) wet = Math.min(1, wet + dt * 0.15);
      else wet = Math.max(0, wet - dt * 0.08);

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
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#1a2416';
      ctx.fillRect(0, 0, W, H);

      const streetLeft = W / 2 - STREET_WIDTH / 2;
      const streetRight = W / 2 + STREET_WIDTH / 2;

      ctx.fillStyle = 'rgba(100,120,80,0.15)';
      ctx.fillRect(streetLeft, 0, STREET_WIDTH, H);

      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(streetLeft, 0); ctx.lineTo(streetLeft, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(streetRight, 0); ctx.lineTo(streetRight, H); ctx.stroke();

      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      const markOffset = worldY % 40;
      for (let y = -markOffset; y < H; y += 40) {
        ctx.beginPath();
        ctx.moveTo(W / 2 - 25, y);
        ctx.lineTo(W / 2 + 25, y);
        ctx.stroke();
      }

      ctx.lineCap = 'round';
      for (const d of drops) {
        const screenY = d.y - worldY + H / 2;
        if (screenY > -20 && screenY < H + 20) {
          ctx.strokeStyle = `rgba(55,138,221,${d.a})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(d.x, screenY);
          ctx.lineTo(d.x - 5, screenY + d.len);
          ctx.stroke();
        }
      }

      obstacles.forEach((obs) => {
        const screenY = obs.y - worldY + H / 2;
        if (screenY > -100 && screenY < H + 100) {
          ctx.fillStyle = 'rgba(255,100,100,0.25)';
          ctx.fillRect(obs.x, screenY, obs.w, obs.h);
          ctx.strokeStyle = 'rgba(255,100,100,0.5)';
          ctx.lineWidth = 2;
          ctx.strokeRect(obs.x, screenY, obs.w, obs.h);
          ctx.font = '32px serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(obs.emoji, obs.x + obs.w / 2, screenY + obs.h / 2);
        }
      });

      for (const g of goals) {
        if (g.reached) continue;
        const screenY = g.y - worldY + H / 2;
        if (screenY > -50 && screenY < H + 50) {
          const a = Math.min(1, g.age);
          const pr = 18 + Math.sin(g.pulse) * 5;
          ctx.beginPath();
          ctx.arc(g.x, screenY, pr, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,220,80,${0.3 * (1 - g.age / g.dur) * a})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.save();
          ctx.globalAlpha = a;
          ctx.font = '20px serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(g.emoji, g.x, screenY);
          const prog = 1 - g.age / g.dur;
          ctx.beginPath();
          ctx.arc(g.x, screenY, 14, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
          ctx.strokeStyle = `rgba(255,220,80,0.55)`;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
        }
      }

      const wScreenY = wy - worldY + H / 2;
      const fScreenY = fy - worldY + H / 2;

      // Umbrella zone - increased radius to 100px
      ctx.beginPath();
      ctx.arc(wx, wScreenY, 100, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Woman
      ctx.beginPath();
      ctx.arc(wx, wScreenY, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#4ade80';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(fx, fScreenY, 8, 0, Math.PI * 2);
      const sep = Math.hypot(fx - wx, fy - wy);
      ctx.fillStyle = sep > 100 ? '#ef4444' : '#fb923c';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      for (const s of sparks) {
        const screenY = s.y - worldY + H / 2;
        ctx.save();
        ctx.globalAlpha = s.life;
        ctx.font = '14px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.emoji, s.x, screenY);
        ctx.restore();
      }

      if (wet > 0.15) {
        const g = ctx.createRadialGradient(W / 2, wScreenY, W * 0.12, W / 2, wScreenY, W * 0.75);
        g.addColorStop(0, 'rgba(20,50,110,0)');
        g.addColorStop(1, `rgba(20,50,110,${(wet - 0.15) * 0.55})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      ctx.font = '500 11px Inter,sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillText('score', 14, 14);
      ctx.font = '500 20px Inter,sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(Math.round(score).toString(), 14, 28);

      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(W - 114, 16, 100, 5);
      ctx.beginPath();
      ctx.arc(W - 114, 18.5, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(W - 14, 18.5, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = wet > 0.65 ? '#ef4444' : wet > 0.3 ? '#EF9F27' : '#378ADD';
      ctx.fillRect(W - 114, 16, wet * 100, 5);
      ctx.font = '10px Inter,sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.textAlign = 'right';
      ctx.fillText('wetness', W - 14, 26);

      if (!running) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, W, H);
        ctx.font = '500 15px Inter,sans-serif';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(isTouchRef.current ? 'tap to start' : 'click to start', W / 2, H / 2);
        ctx.font = '12px Inter,sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText('drag to follow · stay under umbrella', W / 2, H / 2 + 24);
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
    const handleMouseMove = (e: MouseEvent) => {
      if (!running) return;
      const rect = canvas.getBoundingClientRect();
      fTargetX = (e.clientX - rect.left) / (rect.width / W);
      fTargetY = worldY - H / 2 + (e.clientY - rect.top) / (rect.height / H);
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (!running) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      fTargetX = (e.touches[0].clientX - rect.left) / (rect.width / W);
      fTargetY = worldY - H / 2 + (e.touches[0].clientY - rect.top) / (rect.height / H);
    };

    window.addEventListener('resize', handleResize);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('click', () => { running = true; });
    canvas.addEventListener('touchstart', () => { running = true; }, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('touchmove', handleTouchMove);
    };
  }, [gameState, city]);

  const handleRestart = () => { setGameState('playing'); };
  const handleMenu = () => { setGameState('menu'); };

  return (
    <div className="relative w-full h-full">
      <canvas ref={ref} className="block w-full h-full" style={{ cursor: 'default', display: 'block', touchAction: 'none' }} />
      {gameState === 'menu' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: 'rgba(0,0,0,0.78)', borderRadius: 16 }}>
          <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 28, fontWeight: 700, color: '#e8f4e2', marginBottom: 6 }}>Runner</p>
          <p style={{ fontSize: 12, color: 'rgba(232,244,226,0.4)', marginBottom: 28, textAlign: 'center', lineHeight: 1.7 }}>Walk forward together.<br />Collect goals. Stay dry.</p>
          <div className="flex gap-2 mb-6">
            {(Object.keys(CITIES) as City[]).map(c => (
              <button key={c} onClick={() => setCity(c)} style={{ padding: '6px 16px', borderRadius: 20, border: '.5px solid', borderColor: city === c ? 'rgba(232,244,226,0.45)' : 'rgba(232,244,226,0.15)', background: city === c ? 'rgba(232,244,226,0.12)' : 'transparent', color: city === c ? '#e8f4e2' : 'rgba(232,244,226,0.45)', fontSize: 13, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>{CITIES[c].name}</button>
            ))}
          </div>
          <button onClick={handleRestart} style={{ padding: '10px 28px', borderRadius: 24, background: '#fb923c', color: '#0d110b', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Start Game</button>
        </div>
      )}
      {gameState === 'dead' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: 'rgba(0,0,0,0.82)' }}>
          <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 700, color: '#e8f4e2', marginBottom: 4 }}>{endStats.time > 30 ? 'Not bad.' : 'Soaked.'}</p>
          <p style={{ fontSize: 12, color: 'rgba(232,244,226,0.35)', marginBottom: 24 }}>{endStats.time > 60 ? 'Great distance!' : endStats.time > 30 ? 'Keep going' : 'Stay together!'}</p>
          <div className="flex gap-6 mb-7">
            {[['score', endStats.score], ['time', endStats.time + 's']].map(([l, v]) => (
              <div key={l as string} style={{ textAlign: 'center' }}>
                <span style={{ display: 'block', fontSize: 22, fontWeight: 500, color: '#e8f4e2', fontFamily: "'Space Grotesk',sans-serif" }}>{v}</span>
                <span style={{ fontSize: 10, color: 'rgba(232,244,226,0.38)' }}>{l}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={handleRestart} style={{ padding: '10px 24px', borderRadius: 24, background: '#e8f4e2', color: '#0d110b', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>Play again</button>
            <button onClick={handleMenu} style={{ padding: '10px 24px', borderRadius: 24, background: 'transparent', color: 'rgba(232,244,226,0.55)', border: '.5px solid rgba(232,244,226,0.2)', fontSize: 13, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>Menu</button>
          </div>
        </div>
      )}
    </div>
  );
}
