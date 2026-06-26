'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

interface Drop { x: number; y: number; len: number; spd: number; a: number; }
interface Goal { x: number; y: number; emoji: string; pts: number; dur: number; pause: number; age: number; pulse: number; reached: boolean; pauseLeft: number; }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; emoji: string; }

type GameState = 'menu' | 'playing' | 'dead';

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
    let fx = W / 2 + 30, fy = H / 2 + 30, fTargetX = fx, fTargetY = fy;
    const drops: Drop[] = [];
    let goals: Goal[] = [];
    let sparks: Spark[] = [];
    let activeGoal = 0;
    let difficulty = 1;
    let diffTimer = 0;
    let bgOff = 0;

    function newDrop(anywhere = false): Drop {
      return { x: Math.random() * W, y: anywhere ? Math.random() * H : -18, len: 10 + Math.random() * 14, spd: 4 + Math.random() * 3, a: 0.1 + Math.random() * 0.12 };
    }
    for (let i = 0; i < 90; i++) drops.push(newDrop(true));

    function spawnGoal() {
      const type = GOAL_TYPES[Math.floor(Math.random() * GOAL_TYPES.length)];
      let gx = 0, gy = 0, tries = 0;
      do { gx = 50 + Math.random() * (W - 100); gy = 50 + Math.random() * (H - 100); tries++; }
      while (tries < 20 && Math.hypot(gx - wx, gy - wy) < 90);
      goals.push({ ...type, x: gx, y: gy, age: 0, pulse: 0, reached: false, pauseLeft: 0 });
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

      for (const d of drops) { d.y += d.spd * (1 + difficulty * 0.25); if (d.y > H) Object.assign(d, newDrop()); }

      // woman AI
      const ag = goals.find(g => !g.reached);
      if (ag && ag.pauseLeft <= 0) {
        const dx = ag.x - wx, dy = ag.y - wy, dist = Math.hypot(dx, dy);
        if (dist > 8) { const spd = 1.4 * (1 + difficulty * 0.3); wvx += (dx / dist) * spd * 0.18; wvy += (dy / dist) * spd * 0.18; }
        else {
          ag.reached = true; ag.pauseLeft = ag.pause; score += Math.round(ag.pts * difficulty);
          sparks.push(...Array.from({ length: 5 }, () => ({ x: wx, y: wy, vx: (Math.random() - .5) * 3, vy: (Math.random() - .5) * 3, life: 1, emoji: ag.emoji })));
          spawnGoal();
          if (goals.filter(g => !g.reached).length < 2) spawnGoal();
        }
      } else if (ag && ag.pauseLeft > 0) { ag.pauseLeft -= dt; wvx *= 0.8; wvy *= 0.8; }

      wvx += (Math.random() - .5) * 0.06; wvy += (Math.random() - .5) * 0.06;
      wvx *= 0.86; wvy *= 0.86; wx += wvx; wy += wvy;
      wx = Math.max(20, Math.min(W - 20, wx)); wy = Math.max(20, Math.min(H - 20, wy));

      for (const g of goals) { g.age += dt; g.pulse = (g.pulse + dt * 3) % (Math.PI * 2); }
      goals = goals.filter(g => g.reached || g.age < g.dur);

      // follower
      fx += (fTargetX - fx) * 0.12;
      fy += (fTargetY - fy) * 0.12;

      // wetness
      const sep = Math.hypot(fx - wx, fy - wy);
      if (sep > 72) wet = Math.min(1, wet + dt * 0.18); else wet = Math.max(0, wet - dt * 0.05);

      sparks.forEach(s => { s.x += s.vx; s.y += s.vy; s.life -= dt * 1.5; });
      sparks = sparks.filter(s => s.life > 0);

      if (wet >= 1) {
        running = false;
        setEndStats({ score: Math.round(score), time: Math.round(elapsed) });
        setGameState('dead');
      }
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#1a2416'; ctx.fillRect(0, 0, W, H);

      // grid
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

      // rain
      ctx.lineCap = 'round';
      for (const d of drops) {
        ctx.strokeStyle = `rgba(55,138,221,${d.a})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 5, d.y + d.len); ctx.stroke();
      }

      // goals
      for (const g of goals) {
        if (g.reached) continue;
        const a = Math.min(1, g.age);
        const pr = 18 + Math.sin(g.pulse) * 5;
        ctx.beginPath(); ctx.arc(g.x, g.y, pr, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255,220,80,${0.3 * (1 - g.age / g.dur) * a})`; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.save(); ctx.globalAlpha = a;
        ctx.font = '20px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(g.emoji, g.x, g.y);
        const prog = 1 - g.age / g.dur;
        ctx.beginPath(); ctx.arc(g.x, g.y, 14, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
        ctx.strokeStyle = `rgba(255,220,80,0.55)`; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
      }

      // umbrella zone
      ctx.beginPath(); ctx.arc(wx, wy, 72, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.setLineDash([3, 6]);
      ctx.beginPath(); ctx.arc(wx, wy, 24, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.setLineDash([]);

      // woman
      ctx.beginPath(); ctx.arc(wx, wy, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#4ade80'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(wx, wy - 10); ctx.lineTo(wx, wy - 22);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(wx, wy - 22, 7, Math.PI, Math.PI * 2); ctx.stroke();

      // follower
      ctx.beginPath(); ctx.arc(fx, fy, 8, 0, Math.PI * 2);
      ctx.fillStyle = Math.hypot(fx - wx, fy - wy) > 72 ? '#ef4444' : '#fb923c'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5; ctx.stroke();

      // sparks
      for (const s of sparks) {
        ctx.save(); ctx.globalAlpha = s.life;
        ctx.font = '14px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(s.emoji, s.x, s.y); ctx.restore();
      }

      // wetness vignette
      if (wet > 0.15) {
        const g = ctx.createRadialGradient(W / 2, H / 2, W * .12, W / 2, H / 2, W * .75);
        g.addColorStop(0, 'rgba(20,50,110,0)');
        g.addColorStop(1, `rgba(20,50,110,${(wet - .15) * .55})`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }

      // hud
      ctx.font = '500 11px Inter,sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillText('score', 14, 14);
      ctx.font = '500 20px Inter,sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(Math.round(score).toString(), 14, 28);
      // wet bar
      ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(W - 114, 16, 100, 5); ctx.beginPath(); ctx.arc(W - 114, 18.5, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(W - 14, 18.5, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = wet > .65 ? '#ef4444' : wet > .3 ? '#EF9F27' : '#378ADD';
      ctx.fillRect(W - 114, 16, wet * 100, 5);
      ctx.font = '10px Inter,sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.textAlign = 'right';
      ctx.fillText('wetness', W - 14, 26);

      if (!running) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
        ctx.font = '500 15px Inter,sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
        ctx.fillText(isTouchRef.current ? 'tap to start' : 'click to start', W / 2, H / 2);
        ctx.font = '12px Inter,sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText(
          isTouchRef.current ? 'drag finger to control the follower' : 'move your mouse to control the follower',
          W / 2, H / 2 + 24
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
          <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 700, color: '#e8f4e2', marginBottom: 4 }}>
            {endStats.time > 30 ? 'Not bad.' : 'Soaked.'}
          </p>
          <p style={{ fontSize: 12, color: 'rgba(232,244,226,0.35)', marginBottom: 24 }}>
            {endStats.time > 60 ? 'Great run!' : endStats.time > 30 ? 'Keep practicing' : 'Stay closer to the umbrella!'}
          </p>
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
            <Link href="/" style={{ padding: '10px 24px', borderRadius: 24, background: 'transparent', color: 'rgba(232,244,226,0.55)', border: '.5px solid rgba(232,244,226,0.2)', fontSize: 13, cursor: 'pointer', fontFamily: 'Inter,sans-serif', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>Back home</Link>
          </div>
        </div>
      )}
    </div>
  );
}
