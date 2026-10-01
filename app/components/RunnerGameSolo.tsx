'use client';
import { useEffect, useRef, useState } from 'react';
import {
  PALETTE, drawGround, drawProps, drawRainField, drawRipples, tickRipples, drawWalker,
  drawDryZone, drawGoalMarker, drawObstacle, drawWetOverlay, drawHud,
  drawPrompt, walkWidth, drawFloatTexts, tickFloatTexts,
  type StreetView, type DryZone, type Ripple, type FloatText,
} from '../_lib/street';
import { newDryStreak, tickDryStreak, streakCallouts } from '../_lib/dryStreak';
import { sound, playStreak, playCue } from '../_lib/sound';
import { recordBest, bestKey, type BestResult } from '../_lib/bests';
import BestLine from './BestLine';
import { CITIES, CITY_IDS, type CityId } from '../_lib/cities';
import { cityEvents } from '../_lib/cityEvents';
import { cityFurnish, drawCityRoad } from '../_lib/cityStreet';
import { pushOut } from '../_lib/collide';

interface Drop { x: number; y: number; len: number; spd: number; a: number }
interface Goal { x: number; y: number; emoji: string; pts: number; dur: number; pause: number; age: number; pulse: number; reached: boolean }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; emoji: string }
interface Obstacle { id: number; y: number; x: number; w: number; h: number; emoji: string }

type GameState = 'menu' | 'playing' | 'dead';

/** How far the follower can stray before the rain reaches them, before the city's scaling. */
const COVER_R = 100;
/** Drawn size of the canopy itself — the shelter circle is much wider. */
const CANOPY_R = 26;

/** How hard she steers relative to the street each 60 Hz frame. */
const WALK_PUSH = 0.14;
/** After lingering at a goal she sprints to the next one, this much faster... */
const DASH_BOOST = 1.6;
/** ...for this many seconds. */
const DASH_TIME = 0.6;
/** Follower top speed as a share of her dash: a dash you didn't see coming opens a gap. */
const FOLLOW_MAX = 0.9;
/** Her top speed relative to the street, in px per 60 Hz frame (damping 0.88). */
const TOP_SPEED = WALK_PUSH * 0.88 / 0.12;

export default function RunnerGameSolo() {
  const [gameState, setGameState] = useState<GameState>('menu');
  const [city, setCity] = useState<CityId>('newyork');
  const [endStats, setEndStats] = useState<{ score: number; time: number; cause: string; best: BestResult | null }>({ score: 0, time: 0, cause: '', best: null });
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
    // start well inside even Paris's small cover
    let fx = W / 2, fy = 50;
    // The pointer target lives in screen space: the street keeps scrolling
    // under a still mouse, and the follower should keep walking with it.
    let fTargetX = fx, fTargetSY = fy + H / 2;
    const drops: Drop[] = [];
    let goals: Goal[] = [];
    let sparks: Spark[] = [];
    let obstacles: Obstacle[] = [];
    const ripples: Ripple[] = [];
    let obstacleId = 0;
    let difficulty = 1, diffTimer = 0, obstacleTimer = 0, goalTimer = 0;
    // facing + walk-cycle state for the two figures
    let wAngle = 0, fAngle = 0, wPhase = 0, fPhase = 0;
    // her rhythm: walk to `target`, linger for pauseLeft, then dash for dashLeft
    let target: Goal | null = null;
    let pauseLeft = 0, dashLeft = 0;
    // was the follower already pressed against an obstacle last frame
    let bumping = false;
    let lastSplash = -99, lastGust = -99;
    // the follower's reward for playing the rim: multiplier + close-call bonus
    const streak = newDryStreak();
    // callouts live in screen space so they rise instead of scrolling away
    let floats: FloatText[] = [];

    const cityConfig = CITIES[city];
    const coverR = COVER_R * cityConfig.cover;
    const events = cityEvents(city);
    const furnish = cityFurnish(city);
    // the umbrella's dry spot, blown downwind by Tokyo's gusts
    let dryShift = 0;

    // The roadway narrows on small screens so the sidewalks stay visible.
    const roadW = () => Math.max(180, Math.min(cityConfig.road, W - 56));
    const edges = () => { const w = roadW(); return { left: (W - w) / 2, right: (W + w) / 2 }; };
    const project = (y: number) => y - worldY + H / 2;

    function newDrop(): Drop {
      return { x: Math.random() * W, y: Math.random() * H, len: 10 + Math.random() * 14, spd: 4 + Math.random() * 3, a: 0.1 + Math.random() * 0.12 };
    }
    for (let i = 0; i < cityConfig.rain; i++) drops.push(newDrop());

    function spawnGoal() {
      const type = cityConfig.goals[Math.floor(Math.random() * cityConfig.goals.length)];
      const { left, right } = edges();
      const gx = left + 40 + Math.random() * Math.max(20, right - left - 80);
      const gy = worldY - 150 - Math.random() * 200;
      goals.push({ ...type, x: gx, y: gy, age: 0, pulse: 0, reached: false });
    }
    spawnGoal(); spawnGoal();

    function spawnObstacle() {
      const obs = cityConfig.obstacles[Math.floor(Math.random() * cityConfig.obstacles.length)];
      const { left, right } = edges();
      const ox = left + Math.random() * Math.max(10, right - left - obs.w);
      const oy = worldY - 200 - Math.random() * 150;
      obstacles.push({ id: obstacleId++, x: ox, y: oy, w: obs.w, h: obs.h, emoji: obs.emoji });
    }

    /** The road, and the stretch of it on screen: where walkers may stand. */
    const bounds = () => ({ ...edges(), top: worldY - H / 2 + 40, bottom: worldY + H / 2 - 40 });

    function update(dt: number) {
      t += dt; elapsed += dt; diffTimer += dt;
      if (diffTimer > 12) { diffTimer = 0; difficulty = Math.min(3, difficulty + 0.2); }

      const scroll = (1.5 + difficulty * 0.4) * cityConfig.pace * dt * 60;
      worldY -= scroll;
      // Both walkers move forward with the street; their own velocities only
      // steer them around the frame.
      wy -= scroll;
      fy -= scroll;

      for (const d of drops) {
        d.y += d.spd * (1 + difficulty * 0.2);
        if (d.y > H) Object.assign(d, newDrop());
      }

      const { left: streetLeft, right: streetRight } = edges();
      const pwx = wx, pwy = wy, pfx = fx, pfy = fy;

      // Rain hitting the road, in world space so the rings scroll with it.
      tickRipples(ripples, dt, 11, () => ({
        x: streetLeft + Math.random() * (streetRight - streetLeft),
        y: worldY - H / 2 + Math.random() * H,
      }));

      // The city's hazard: taxi splashes, gusts, café awnings.
      const weather = events.tick(dt, { worldY, W, H, left: streetLeft, right: streetRight, difficulty, fx, fy });
      dryShift = weather.dryShift;

      // Woman AI: walk to a goal, linger there, then dash to the next one.
      // She prefers goals still ahead of her; ones she has passed are lost.
      const f = dt * 60;
      if (target && (!goals.includes(target) || target.y > wy + 40)) target = null;
      if (!target) target = goals.find(g => g.y < wy + 20) ?? null;
      if (pauseLeft > 0) {
        pauseLeft -= dt;
        if (pauseLeft <= 0) dashLeft = DASH_TIME;
        wvx *= Math.pow(0.8, f); wvy *= Math.pow(0.8, f);
      } else if (target) {
        const dx = target.x - wx;
        const dy = target.y - wy;
        const dist = Math.hypot(dx, dy);
        if (dist > 15) {
          const push = WALK_PUSH * (dashLeft > 0 ? DASH_BOOST : 1) * f;
          wvx += (dx / dist) * push;
          wvy += (dy / dist) * push;
        }
        dashLeft = Math.max(0, dashLeft - dt);
      } else {
        wvx *= Math.pow(0.9, f);
        wvy *= Math.pow(0.9, f);
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
          const repel = (avoidDist - dist) / avoidDist * 0.12 * f;
          wvx += (dx / dist) * repel;
          wvy += (dy / dist) * repel;
          // Straight behind it the repel only pushes her back; sidestep instead.
          if (dy > 0 && Math.abs(dx) < 1) wvx += (wx < obs.x + obs.w / 2 ? -1 : 1) * repel;
        }
      });

      wvx *= Math.pow(0.88, f); wvy *= Math.pow(0.88, f);
      wx += (wvx + weather.wind) * f; wy += wvy * f;
      wx = Math.max(streetLeft + 20, Math.min(streetRight - 20, wx));
      wy = Math.max(worldY - H / 2 + 40, Math.min(worldY + H / 2 - 40, wy));

      // Follower: eases toward the pointer, but no faster than FOLLOW_MAX of her dash
      const fTargetY = worldY - H / 2 + fTargetSY;
      const fMax = FOLLOW_MAX * DASH_BOOST * TOP_SPEED * f;
      const ease = 1 - Math.pow(0.88, f);
      let mx = (fTargetX - fx) * ease, my = (fTargetY - fy) * ease;
      const m = Math.hypot(mx, my);
      if (m > fMax) { mx *= fMax / m; my *= fMax / m; }
      fx += mx + weather.wind * f; fy += my;
      fx = Math.max(streetLeft + 15, Math.min(streetRight - 15, fx));
      fy = Math.max(worldY - H / 2 + 40, Math.min(worldY + H / 2 - 40, fy));

      // Obstacles are solid: step both walkers back out of any they overlap.
      const b = bounds();
      let hit = false;
      for (const obs of obstacles) {
        const w = pushOut(wx, wy, 20, obs, b);
        if (w) { wx = w.x; wy = w.y; wvx *= 0.5; wvy *= 0.5; }
        const p = pushOut(fx, fy, 15, obs, b);
        if (p) { fx = p.x; fy = p.y; hit = true; }
      }
      // a thud on first contact, not every frame spent leaning on it
      if (hit && !bumping) sound.thud();
      bumping = hit;

      // Facing and stride: the street itself is moving, so both figures keep
      // walking even when the player holds still.
      const wStep = Math.hypot(wx - pwx, wy - pwy);
      const fStep = Math.hypot(fx - pfx, fy - pfy);
      if (wStep > 0.35) wAngle = Math.atan2(wy - pwy, wx - pwx) + Math.PI / 2;
      // The tell: near the end of a pause she turns toward where she'll dash.
      if (pauseLeft > 0 && pauseLeft < 0.5 && target) wAngle = Math.atan2(target.y - wy, target.x - wx) + Math.PI / 2;
      if (fStep > 0.35) fAngle = Math.atan2(fy - pfy, fx - pfx) + Math.PI / 2;
      wPhase += (2 + wStep * 6) * dt * 5;
      fPhase += (2 + fStep * 6) * dt * 5;

      // Goals - ONLY woman collects them
      for (const g of goals) {
        g.age += dt;
        g.pulse = (g.pulse + dt * 3) % (Math.PI * 2);
        const dw = Math.hypot(wx - g.x, wy - g.y);
        if (!g.reached && dw < 20) {
          g.reached = true;
          pauseLeft = g.pause; dashLeft = 0; target = null;
          const pts = Math.round(g.pts * difficulty * streak.mult);
          score += pts;
          sound.goal(streak.mult);
          floats.push({ x: wx, y: project(wy) - 30, text: `+${pts}`, color: PALETTE.cream, life: 1 });
          sparks.push(...Array.from({ length: 5 }, () => ({ x: wx, y: wy, vx: (Math.random() - .5) * 3, vy: (Math.random() - .5) * 3, life: 1, emoji: g.emoji })));
          if (goals.filter(g => !g.reached).length < 3) spawnGoal();
        }
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
      // Drop obstacles once they've scrolled off the bottom.
      obstacles = obstacles.filter(o => o.y < worldY + H / 2 + 100);

      // Wetness - safe while inside the umbrella's cover or under an awning
      const sep = Math.hypot(fx - (wx + dryShift), fy - wy);
      const edge = tickDryStreak(streak, weather.sheltered ? 0 : sep, coverR, dt, difficulty);
      score += edge.pts;
      floats.push(...streakCallouts(edge.events, fx, project(fy)));
      floats.push(...weather.callouts.map(c => ({ ...c, x: fx, y: project(fy) - 44, life: 1.4 })));
      playStreak(edge.events);
      for (const c of weather.callouts) playCue(c.cue);
      sound.rain(sep / coverR, weather.sheltered);
      floats = tickFloatTexts(floats, dt);
      if (sep > coverR && !weather.sheltered) wet = Math.min(1, wet + dt * 0.15 * cityConfig.soak);
      else wet = Math.max(0, wet - dt * 0.08);
      wet = Math.min(1, wet + weather.splash);
      // remembered for the end screen: what finally got you
      if (weather.splash > 0) lastSplash = elapsed;
      if (weather.wind !== 0) lastGust = elapsed;

      sparks.forEach(s => {
        s.x += s.vx; s.y += s.vy; s.life -= dt * 1.5;
      });
      sparks = sparks.filter(s => s.life > 0);

      if (wet >= 1) {
        sound.soaked();
        running = false;
        const final = Math.round(score);
        setEndStats({ score: final, time: Math.round(elapsed), cause: elapsed - lastSplash < 2 ? 'A taxi soaked you.' : elapsed - lastGust < 1.5 ? 'The gust blew you out of cover.' : `Soaked in ${cityConfig.name} after ${Math.round(elapsed)}s.`, best: recordBest(bestKey('runner', 'solo', city), final, Math.round(elapsed)) });
        setGameState('dead');
      }
    }

    function draw() {
      const { left, right } = edges();
      const view: StreetView = { W, H, left, right, scroll: -worldY, walk: walkWidth(W, right - left) };

      ctx.clearRect(0, 0, W, H);
      drawGround(ctx, view);
      drawCityRoad(ctx, view, worldY, city);
      drawProps(ctx, view, worldY, t, furnish);

      const wScreenY = project(wy);
      const fScreenY = project(fy);
      const sep = Math.hypot(fx - (wx + dryShift), fy - wy);
      const dry: DryZone[] = [
        { x: wx + dryShift, y: wScreenY, r: coverR },
        ...events.shelters().map(z => ({ ...z, y: project(z.y) })),
      ];

      drawRipples(ctx, ripples, project, dry);
      events.drawUnder(ctx, project);

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

      drawDryZone(ctx, wx + dryShift, wScreenY, coverR, sep / coverR, streak.mult);

      // The follower walks bare-headed; she is hidden under the canopy.
      drawWalker(ctx, fx, fScreenY, { jacket: PALETTE.jacketOlive, accent: '#e08a3c' }, {
        angle: fAngle, phase: fPhase, wet,
      });
      drawWalker(ctx, wx, wScreenY, { jacket: PALETTE.jacketBlue, accent: '#7cc24f' }, {
        angle: wAngle, phase: wPhase, umbrella: CANOPY_R, spin: Math.sin(t * 0.7) * 0.06, canopy: cityConfig.canopy,
      });

      drawRainField(ctx, drops, H, undefined, dry);
      events.drawOver(ctx, project);

      for (const s of sparks) {
        ctx.save();
        ctx.globalAlpha = s.life;
        ctx.font = '14px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.emoji, s.x, project(s.y));
        ctx.restore();
      }

      drawFloatTexts(ctx, floats);
      drawWetOverlay(ctx, W, H, fx, fScreenY, wet);
      drawHud(ctx, W, score, wet, 54, streak.mult);

      if (!running) {
        drawPrompt(
          ctx, W, H,
          isTouchRef.current ? 'tap to start' : 'click to start',
          'drag to follow · stay under the umbrella',
        );
      }
    }

    function loop(ts: number) {
      // rAF's timestamp can predate the time a game (re)started: never step backwards
      const dt = Math.max(0, Math.min((ts - lastTs) / 1000, 0.05));
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
      fTargetSY = (e.clientY - rect.top) / (rect.height / H);
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (!running) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      fTargetX = (e.touches[0].clientX - rect.left) / (rect.width / W);
      fTargetSY = (e.touches[0].clientY - rect.top) / (rect.height / H);
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
          <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 28, fontWeight: 700, color: 'var(--fog)', marginBottom: 6 }}>Runner</p>
          <p style={{ fontSize: 12, color: 'rgba(240,236,224,0.4)', marginBottom: 28, textAlign: 'center', lineHeight: 1.7 }}>Walk forward together.<br />Collect goals. Stay dry.</p>
          <div className="flex gap-2 mb-3">
            {CITY_IDS.map(c => (
              <button key={c} onClick={() => setCity(c)} style={{ padding: '6px 16px', borderRadius: 20, border: '.5px solid', borderColor: city === c ? 'rgba(240,236,224,0.45)' : 'rgba(240,236,224,0.15)', background: city === c ? 'rgba(240,236,224,0.12)' : 'transparent', color: city === c ? 'var(--fog)' : 'rgba(240,236,224,0.45)', fontSize: 13, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>{CITIES[c].name}</button>
            ))}
          </div>
          <p style={{ fontSize: 11, color: 'rgba(240,236,224,0.45)', marginBottom: 22, textAlign: 'center', maxWidth: 260, lineHeight: 1.6, minHeight: 36 }}>{CITIES[city].hint}</p>
          <button onClick={handleRestart} style={{ padding: '10px 28px', borderRadius: 24, background: 'var(--umbrella)', color: '#1a1408', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Start Game</button>
        </div>
      )}
      {gameState === 'dead' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: 'rgba(0,0,0,0.82)' }}>
          <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 700, color: 'var(--fog)', marginBottom: 4 }}>{endStats.time > 30 ? 'Not bad.' : 'Soaked.'}</p>
          <p style={{ fontSize: 12, color: 'rgba(240,236,224,0.35)', marginBottom: 24 }}>{endStats.cause}</p>
          <div className="flex gap-6 mb-7">
            {[['score', endStats.score], ['time', endStats.time + 's']].map(([l, v]) => (
              <div key={l as string} style={{ textAlign: 'center' }}>
                <span style={{ display: 'block', fontSize: 22, fontWeight: 500, color: 'var(--fog)', fontFamily: "'Space Grotesk',sans-serif" }}>{v}</span>
                <span style={{ fontSize: 10, color: 'rgba(240,236,224,0.38)' }}>{l}</span>
              </div>
            ))}
          </div>
          <BestLine result={endStats.best} score={endStats.score} />
          <div className="flex gap-3">
            <button onClick={handleRestart} style={{ padding: '10px 24px', borderRadius: 24, background: 'var(--fog)', color: '#1a1408', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>Play again</button>
            <button onClick={handleMenu} style={{ padding: '10px 24px', borderRadius: 24, background: 'transparent', color: 'rgba(240,236,224,0.55)', border: '.5px solid rgba(240,236,224,0.2)', fontSize: 13, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>Menu</button>
          </div>
        </div>
      )}
    </div>
  );
}
