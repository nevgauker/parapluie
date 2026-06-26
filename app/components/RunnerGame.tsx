'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

type City = 'osaka' | 'tokyo' | 'paris';

const CITIES: Record<City, { umbR: number; spd0: number; acc: number; oFreq: number; cFreq: number; wFreq: number; rainN: number; rainA: number; road: string; label: string; hint: string }> = {
  osaka: { umbR: 70, spd0: 1.7, acc: 0.00022, oFreq: 0.014, cFreq: 0.006, wFreq: 0, rainN: 80, rainA: 0.13, road: '#1e2e14', label: 'Osaka', hint: 'Gentle intro. Wide umbrella.' },
  tokyo: { umbR: 62, spd0: 2.1, acc: 0.00032, oFreq: 0.020, cFreq: 0.013, wFreq: 0.004, rainN: 110, rainA: 0.16, road: '#161b26', label: 'Tokyo', hint: 'Fast & windy. Wind gusts hit hard.' },
  paris: { umbR: 52, spd0: 1.4, acc: 0.00018, oFreq: 0.012, cFreq: 0.004, wFreq: 0.005, rainN: 140, rainA: 0.24, road: '#1b1728', label: 'Paris', hint: 'Tightest radius. Heavy rain.' },
};

interface Drop { x: number; y: number; len: number; spd: number; a: number; }
interface Obst { t: string; x: number; y: number; w: number; h: number; d: number; n?: number; }
interface Bonus { x: number; y: number; tp: 'towel' | 'awning'; taken: boolean; age: number; }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; col: string; }

type GameState = 'menu' | 'playing' | 'dead';

export default function RunnerGame() {
  const [city, setCity] = useState<City>('osaka');
  const [gameState, setGameState] = useState<GameState>('menu');
  const [endStats, setEndStats] = useState({ dist: 0, score: 0, time: 0 });
  const ref = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ city, gameState });
  const gameRef = useRef<{ start: (c: City) => void; stop: () => void } | null>(null);

  useEffect(() => { stateRef.current = { city, gameState }; }, [city, gameState]);

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
    let raf = 0, lt = 0;
    let wx = 0, wy = 0, wvx = 0, wTargetX = 0;
    let fx = 0, fy = 0, fvx = 0, fvy = 0;
    let wet = 0, score = 0, dist = 0, elapsed = 0, spd = 0;
    let obsts: Obst[] = [], drops: Drop[] = [], sparks: Spark[] = [], bonuses: Bonus[] = [];
    let bgOff = 0, oTimer = 0, cTimer = 0;
    let wind = 0, windT = 0, windClock = 0, shake = 0;
    let lastOX = -999;
    let cfg = CITIES.osaka;
    let active = false;

    function newDrop(a = false): Drop {
      return { x: Math.random() * W, y: a ? Math.random() * H : -18, len: 10 + Math.random() * 14, spd: 4 + Math.random() * 3, a: cfg.rainA * (.6 + Math.random() * .8) };
    }

    function spawnO() {
      const r = Math.random();
      const tp = r < .5 ? 'puddle' : r < .78 ? 'bollard' : 'scaffolding';
      const w = tp === 'puddle' ? 56 : tp === 'bollard' ? 14 : 320;
      const h = tp === 'puddle' ? 20 : tp === 'bollard' ? 30 : 34;
      const d = tp === 'puddle' ? 62 : tp === 'bollard' ? 42 : 100;
      let ox = W / 2;
      if (tp !== 'scaffolding') {
        let tries = 0;
        do { ox = 50 + Math.random() * (W - 100); tries++; } while (tries < 15 && Math.abs(ox - lastOX) < 90);
        lastOX = ox;
      }
      obsts.push({ t: tp, x: ox, y: -50, w, h, d });
    }

    function spawnC() {
      obsts.push({ t: 'crowd', x: 60 + Math.random() * (W - 120), y: -60, w: 60, h: 50, d: 72, n: 2 + Math.floor(Math.random() * 3) });
    }

    function spawnB() {
      bonuses.push({ x: 40 + Math.random() * (W - 80), y: -20, tp: Math.random() < .5 ? 'towel' : 'awning', taken: false, age: 0 });
    }

    const start = (c: City) => {
      cfg = CITIES[c];
      wx = W / 2; wy = H * .36; wvx = 0; wTargetX = W / 2;
      fx = W / 2; fy = H * .54; fvx = 0; fvy = 0;
      wet = 0; score = 0; dist = 0; elapsed = 0; spd = cfg.spd0;
      obsts = []; sparks = []; bonuses = []; bgOff = 0; oTimer = 0; cTimer = 0;
      wind = 0; windT = 0; windClock = 0; shake = 0; lastOX = -999;
      drops = Array.from({ length: cfg.rainN }, () => newDrop(true));
      active = true;
    };

    const stop = () => { active = false; };

    gameRef.current = { start, stop };

    canvas.addEventListener('mousemove', e => {
      if (!active) return;
      const r = canvas.getBoundingClientRect();
      wTargetX = (e.clientX - r.left) * (W / r.width);
    });
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      if (!active) return;
      const r = canvas.getBoundingClientRect();
      wTargetX = (e.touches[0].clientX - r.left) * (W / r.width);
    }, { passive: false });
    canvas.addEventListener('touchstart', e => {
      if (!active) return;
      const r = canvas.getBoundingClientRect();
      wTargetX = (e.touches[0].clientX - r.left) * (W / r.width);
    }, { passive: false });

    function update(dt: number) {
      elapsed += dt; spd = Math.min(cfg.spd0 * 4.5, cfg.spd0 + cfg.acc * elapsed * 1000);
      dist += spd * dt * 18; bgOff = (bgOff + spd) % 80;

      if (cfg.wFreq > 0) {
        windClock += dt;
        if (windClock > 1 / cfg.wFreq * (.5 + Math.random())) { windClock = 0; windT = (Math.random() - .5) * 80; shake = 4; }
      }
      wind += (windT - wind) * .05; if (Math.abs(wind - windT) < .5) windT *= .3; shake *= .86;

      wvx += (wTargetX - wx) * .13;
      let best: Obst | null = null, bd = 999;
      for (const o of obsts) {
        if (o.y > wy - 120 && o.y < wy + 20) { const ddd = Math.abs(o.x - wx); if (ddd < bd) { bd = ddd; best = o; } }
      }
      if (best && bd < (best.d || 60) + 28) { wvx += (wx <= best.x ? -1 : 1) * 5.5 * dt * 60; }
      wvx += wind * .005; wvx *= .78; wx += wvx; wx = Math.max(18, Math.min(W - 18, wx));

      const fdx = wx - fx, fdy = wy - fy, fd = Math.hypot(fdx, fdy);
      const fs = fd > 40 ? .10 : fd > 12 ? .065 : .035;
      fvx += fdx * fs + Math.sin(elapsed * 2.3) * .4 * dt * 60;
      fvy += fdy * fs * .28; fvx *= .80; fvy *= .80;
      fx += fvx; fy += fvy;
      fx = Math.max(8, Math.min(W - 8, fx));
      fy = Math.min(H * .78, fy + spd * .17 * dt * 60); fy = Math.max(H * .12, fy);

      const ur = cfg.umbR + wind * .12;
      const sep = Math.hypot(fx - wx, fy - wy);
      const out = Math.max(0, (sep - ur) / ur);
      if (out > 0) wet = Math.min(1, wet + dt * (.16 + out * .32)); else wet = Math.max(0, wet - dt * .042);
      score += dt * (12 + spd * 6);

      oTimer += dt; if (oTimer > 1 / cfg.oFreq) { oTimer = 0; spawnO(); if (Math.random() < .13) spawnB(); }
      cTimer += dt; if (cTimer > 1 / cfg.cFreq) { cTimer = 0; spawnC(); }

      for (const o of obsts) o.y += spd * 1.85;
      for (const b of bonuses) {
        b.y += spd * 1.85; b.age += dt;
        if (!b.taken && Math.hypot(fx - b.x, fy - b.y) < 26) {
          b.taken = true; if (b.tp === 'towel') wet = Math.max(0, wet - .32);
          sparks.push(...Array.from({ length: 5 }, () => ({ x: b.x, y: b.y, vx: (Math.random() - .5) * 3, vy: -2 - Math.random() * 2, life: 1, col: b.tp === 'towel' ? '#FAC775' : '#9FE1CB' })));
        }
      }
      for (const d of drops) { d.y += d.spd + spd * .55; if (d.y > H) Object.assign(d, newDrop()); }
      obsts = obsts.filter(o => o.y < H + 100); bonuses = bonuses.filter(b => b.y < H + 60 && !b.taken && b.age < 7);
      sparks.forEach(s => { s.x += s.vx; s.y += s.vy; s.vy += .14; s.life -= dt * 1.7; });
      sparks = sparks.filter(s => s.life > 0);

      if (wet >= 1) {
        active = false;
        setEndStats({ dist: Math.round(dist), score: Math.round(score), time: Math.round(elapsed) });
        setGameState('dead');
      }
    }

    function drawBg() {
      ctx.fillStyle = cfg.road; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
      const sp = 80;
      for (let y = -(sp - (bgOff % sp)); y < H + sp; y += sp) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      for (let x = 0; x <= W; x += W / 4) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    }

    function drawScene() {
      ctx.clearRect(0, 0, W, H);
      const sx = shake ? (Math.random() - .5) * shake * 1.5 : 0;
      ctx.save(); if (sx) ctx.translate(sx, 0);

      ctx.lineCap = 'round';
      for (const d of drops) {
        ctx.strokeStyle = `rgba(55,138,221,${d.a})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x, d.y + d.len); ctx.stroke();
      }

      ctx.font = '16px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const b of bonuses) {
        if (b.taken) continue;
        const p = Math.sin(elapsed * 4 + b.x) * 3;
        ctx.beginPath(); ctx.arc(b.x, b.y, 14 + p, 0, Math.PI * 2);
        ctx.strokeStyle = b.tp === 'towel' ? 'rgba(250,199,117,.35)' : 'rgba(159,225,203,.35)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillText(b.tp === 'towel' ? '🧣' : '🏠', b.x, b.y);
      }

      for (const o of obsts) {
        ctx.save();
        if (o.t === 'puddle') {
          ctx.beginPath(); ctx.ellipse(o.x, o.y, o.w / 2, o.h / 2, 0, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(30,90,190,.4)'; ctx.fill();
          ctx.strokeStyle = 'rgba(80,160,255,.5)'; ctx.lineWidth = 1; ctx.stroke();
        } else if (o.t === 'bollard') {
          ctx.fillStyle = '#7a6a4a'; ctx.fillRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
          ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1; ctx.strokeRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
        } else if (o.t === 'scaffolding') {
          ctx.fillStyle = 'rgba(160,120,50,.22)'; ctx.fillRect(0, o.y - o.h / 2, W, o.h);
          ctx.strokeStyle = 'rgba(200,160,70,.45)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(0, o.y - o.h / 2); ctx.lineTo(W, o.y - o.h / 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, o.y + o.h / 2); ctx.lineTo(W, o.y + o.h / 2); ctx.stroke();
          ctx.font = '11px sans-serif'; ctx.fillStyle = 'rgba(200,160,70,.5)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('— scaffolding —', W / 2, o.y);
        } else if (o.t === 'crowd') {
          for (let i = 0; i < (o.n || 3); i++) {
            const cx = o.x + (i - ((o.n || 3) - 1) / 2) * 22, cy = o.y + Math.sin(elapsed * 2 + i) * 3;
            ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(195,175,135,${.45 + i * .08})`; ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 1; ctx.stroke();
          }
        }
        ctx.restore();
      }

      const ur = cfg.umbR + wind * .12, sep = Math.hypot(fx - wx, fy - wy);
      const edge = sep > ur * .72 ? Math.min(1, (sep - ur * .72) / (ur * .28)) : 0;
      ctx.beginPath(); ctx.arc(wx, wy, ur, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.04)'; ctx.fill();
      ctx.strokeStyle = edge > 0 ? `rgba(251,146,60,${.5 + edge * .4})` : 'rgba(255,255,255,.14)';
      ctx.lineWidth = 1.5; ctx.stroke();
      ctx.setLineDash([3, 6]);
      ctx.beginPath(); ctx.arc(wx, wy, ur * .33, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath(); ctx.arc(wx, wy, 10, 0, Math.PI * 2); ctx.fillStyle = '#4ade80'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(wx, wy - 10); ctx.lineTo(wx, wy - 22);
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(wx, wy - 22, 7, Math.PI, Math.PI * 2); ctx.stroke();

      ctx.beginPath(); ctx.arc(fx, fy, 8, 0, Math.PI * 2);
      ctx.fillStyle = sep > ur ? '#ef4444' : '#fb923c'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5; ctx.stroke();

      for (const s of sparks) {
        ctx.save(); ctx.globalAlpha = s.life;
        ctx.beginPath(); ctx.arc(s.x, s.y, 3 * s.life, 0, Math.PI * 2);
        ctx.fillStyle = s.col; ctx.fill(); ctx.restore();
      }

      if (wet > .12) {
        const g = ctx.createRadialGradient(W / 2, H / 2, W * .12, W / 2, H / 2, W * .72);
        g.addColorStop(0, 'rgba(15,45,110,0)'); g.addColorStop(1, `rgba(15,45,110,${(wet - .12) * .58})`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }

      // speed line at bottom
      const dz = wy + ur;
      if (dz < H) {
        ctx.fillStyle = 'rgba(220,60,60,.05)'; ctx.fillRect(0, dz, W, H - dz);
        ctx.strokeStyle = 'rgba(220,60,60,.18)'; ctx.lineWidth = 1; ctx.setLineDash([5, 8]);
        ctx.beginPath(); ctx.moveTo(0, dz); ctx.lineTo(W, dz); ctx.stroke(); ctx.setLineDash([]);
      }

      // hud
      ctx.font = '500 11px Inter,sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillText('score', 14, 14);
      ctx.font = '500 20px Inter,sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(Math.round(score).toString(), 14, 28);
      ctx.font = '10px Inter,sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillText(Math.round(dist) + 'm', 14, 52);
      ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(W - 114, 16, 100, 5);
      ctx.fillStyle = wet > .65 ? '#ef4444' : wet > .3 ? '#EF9F27' : '#378ADD';
      ctx.fillRect(W - 114, 16, wet * 100, 5);
      ctx.font = '10px Inter,sans-serif'; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,.3)';
      ctx.fillText('wetness', W - 14, 26);
      ctx.fillStyle = 'rgba(255,255,255,.18)';
      ctx.fillText('spd +' + Math.round(Math.min(100, ((spd - cfg.spd0) / (cfg.spd0 * 3)) * 100)) + '%', W - 14, H - 14);

      if (elapsed < 6) {
        ctx.fillStyle = `rgba(255,255,255,${Math.max(0, 1 - elapsed / 6) * .25})`;
        ctx.font = '11px Inter,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText('▼  street scrolls forward  ▼', W / 2, H - 28);
      }

      ctx.restore();
    }

    function loop(ts: number) {
      const dt = Math.min((ts - lt) / 1000, 0.05); lt = ts;
      drawBg(); drawScene();
      if (active) update(dt);
      raf = requestAnimationFrame(loop);
    }
    lt = performance.now();
    raf = requestAnimationFrame(loop);

    const handleResize = () => {
      setCanvasSize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const handleStart = () => {
    setGameState('playing');
    gameRef.current?.start(city);
  };

  const handleRestart = () => {
    setGameState('playing');
    gameRef.current?.start(city);
  };

  const handleMenu = () => {
    setGameState('menu');
    gameRef.current?.stop();
  };

  return (
    <div className="relative w-full h-full">
      <canvas ref={ref} className="block w-full h-full" style={{ cursor: 'crosshair', display: 'block', touchAction: 'none' }} />

      {/* Menu */}
      {gameState === 'menu' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: 'rgba(0,0,0,0.78)', borderRadius: 16 }}>
          <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 28, fontWeight: 700, color: '#e8f4e2', marginBottom: 6 }}>Runner mode</p>
          <p style={{ fontSize: 12, color: 'rgba(232,244,226,0.4)', marginBottom: 28, textAlign: 'center', lineHeight: 1.7 }}>The street never stops.<br />Stay under the umbrella.</p>
          <div className="flex gap-2 mb-6">
            {(Object.keys(CITIES) as City[]).map(c => (
              <button
                key={c}
                onClick={() => setCity(c)}
                style={{
                  padding: '6px 16px', borderRadius: 20, border: '.5px solid',
                  borderColor: city === c ? 'rgba(232,244,226,0.45)' : 'rgba(232,244,226,0.15)',
                  background: city === c ? 'rgba(232,244,226,0.12)' : 'transparent',
                  color: city === c ? '#e8f4e2' : 'rgba(232,244,226,0.45)',
                  fontSize: 13, cursor: 'pointer', fontFamily: 'Inter,sans-serif',
                }}
              >
                {CITIES[c].label}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 11, color: 'rgba(232,244,226,0.3)', marginBottom: 20 }}>{CITIES[city].hint}</p>
          <button onClick={handleStart} style={{ padding: '12px 40px', borderRadius: 28, background: '#e8f4e2', color: '#0d110b', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
            Run
          </button>
          <p style={{ fontSize: 11, color: 'rgba(232,244,226,0.2)', marginTop: 10 }}>move mouse or drag finger</p>
        </div>
      )}

      {/* End screen */}
      {gameState === 'dead' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: 'rgba(0,0,0,0.82)', borderRadius: 16 }}>
          <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 700, color: '#e8f4e2', marginBottom: 4 }}>
            {endStats.time > 30 ? 'Not bad.' : 'Soaked.'}
          </p>
          <p style={{ fontSize: 12, color: 'rgba(232,244,226,0.35)', marginBottom: 24 }}>
            {endStats.time > 60 ? 'Impressive run!' : endStats.time > 30 ? 'Keep practicing' : 'Watch the umbrella!'}
          </p>
          <div className="flex gap-6 mb-7">
            {[['dist', endStats.dist + 'm'], ['score', endStats.score], ['time', endStats.time + 's']].map(([l, v]) => (
              <div key={l as string} style={{ textAlign: 'center' }}>
                <span style={{ display: 'block', fontSize: 22, fontWeight: 500, color: '#e8f4e2', fontFamily: "'Space Grotesk',sans-serif" }}>{v}</span>
                <span style={{ fontSize: 10, color: 'rgba(232,244,226,0.38)' }}>{l}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-3 flex-wrap justify-center">
            <button onClick={handleRestart} style={{ padding: '10px 24px', borderRadius: 24, background: '#e8f4e2', color: '#0d110b', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>Play again</button>
            <button onClick={handleMenu} style={{ padding: '10px 24px', borderRadius: 24, background: 'transparent', color: 'rgba(232,244,226,0.55)', border: '.5px solid rgba(232,244,226,0.2)', fontSize: 13, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>Change city</button>
            <Link href="/" style={{ padding: '10px 24px', borderRadius: 24, background: 'transparent', color: 'rgba(232,244,226,0.55)', border: '.5px solid rgba(232,244,226,0.2)', fontSize: 13, fontFamily: 'Inter,sans-serif', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>Back home</Link>
          </div>
        </div>
      )}
    </div>
  );
}
