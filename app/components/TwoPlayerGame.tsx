'use client';
import { useEffect, useRef, useState } from 'react';
import VirtualDPad from './VirtualDPad';
import {
  PALETTE, drawGround, drawProps, drawRainField, drawRipples, tickRipples, drawWalker,
  drawDryZone, drawGoalMarker, drawWetOverlay, walkWidth, drawFloatTexts, tickFloatTexts, drawPrompt,
  type StreetView, type DryZone, type Ripple, type FloatText,
} from '../_lib/street';
import { newDryStreak, tickDryStreak, streakCallouts } from '../_lib/dryStreak';
import {
  SQUARE_W, SQUARE_H, SQUARE_INSET, SQUARE_COVER_R, SQUARE_GOALS, TOGETHER_GRACE, ALONE_SHARE,
  pickGoalSpot, type SquareGoalType,
} from '../_lib/rules';
import { makeRng, newSeed, type Rng } from '../_lib/rng';
import { padPress, readStick, PAD_START } from '../_lib/input';
import { PLAYERS, PLAYER_IDS, other, tag, drawTag, type Player } from '../_lib/players';
import { padFor } from '../_lib/seats';
import { watchFocus, PAUSE_KEYS } from '../_lib/focus';
import Seats from './Seats';

// ── types ──────────────────────────────────────────────────────────────────
interface Drop  { x:number; y:number; len:number; spd:number; a:number }
interface Goal extends SquareGoalType { x:number; y:number; age:number; pulse:number; reached:boolean; pauseLeft:number }
interface Spark { x:number; y:number; vx:number; vy:number; life:number; emoji:string }

type Screen = 'menu' | 'playing' | 'between' | 'end';

/** One round of the match: who held the umbrella, what each side scored, how it ended. */
interface RoundResult { woman:Player; wScore:number; fScore:number; time:number; end:'soaked'|'home' }

// A match is two rounds with the roles swapped, so each player holds the
// umbrella once and follows once: whichever role is stronger, both get it.
const ROUND_TIME = 60;
/** Follower points per second under cover, before difficulty and streak. */
const COVER_PTS = 6;
/** Round-ending bonuses, × difficulty: the woman for shaking the follower off, the follower for making it home. */
const SHAKE_BONUS = 250;
const HOME_BONUS = 250;

// Each player keeps their keys, gamepad and colour all match; only the role swaps.
/** Velocity kept each 60 Hz frame. */
const DAMP = 0.82;

/** Totals per player across finished rounds plus the live one. */
function totals(rounds: RoundResult[], live?: { woman:Player; wScore:number; fScore:number }) {
  const t = { p1:0, p2:0 };
  for (const r of live ? [...rounds, { ...live, time:0, end:'home' as const }] : rounds) {
    t[r.woman] += r.wScore;
    t[other(r.woman)] += r.fScore;
  }
  return { p1:Math.round(t.p1), p2:Math.round(t.p2) };
}

// ── component ──────────────────────────────────────────────────────────────
export default function TwoPlayerGame() {
  const bgRef   = useRef<HTMLCanvasElement>(null);
  const cvRef   = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const keysRef = useRef<Record<string, boolean>>({});
  // start/stop handles into the canvas loop, set up by the effect below
  const gameRef = useRef<{ start(woman:Player, seed:number, round:number): void; stop(): void } | null>(null);
  // what A / Start on a gamepad does on the current overlay
  const padActionRef = useRef<(() => void) | null>(null);

  const [screen,    setScreen]    = useState<Screen>('menu');
  const [rounds,    setRounds]    = useState<RoundResult[]>([]);
  // Live round numbers for the HUD, pushed from the canvas loop at ~10 Hz.
  const [hud,       setHud]       = useState({ woman:'p1' as Player, wScore:0, fScore:0, wet:0, left:ROUND_TIME });
  // only ever rendered client-side (loaded with ssr: false), so navigator is there
  const [isTouchDevice] = useState(() => navigator.maxTouchPoints > 0);


  useEffect(() => {
    const bgc = bgRef.current!;
    const cv  = cvRef.current!;
    const bx  = bgc.getContext('2d')!;
    const ctx = cv.getContext('2d')!;
    const W = SQUARE_W, H = SQUARE_H;
    const R = SQUARE_COVER_R;

    // ── mutable game state (lives entirely in this effect) ──
    let woman: Player = 'p1';
    let round = 1;
    // goals for this round: both rounds share a seed, so each player holds the umbrella over the same goals
    let rng: Rng = makeRng(0);
    // last time the follower was under cover, for the together grace
    let coveredAt = 0;
    let wx=W/2, wy=H*.42, wvx=0, wvy=0;
    // the follower starts inside cover, so nobody can win by standing still
    let fx=W/2+30, fy=H*.42+40, fvx=0, fvy=0;
    let wet=0, wScore=0, fScore=0, elapsed=0;
    let difficulty=1, diffTimer=0, goalTimer=0, bgOff=0, hudTimer=0;
    let goals:Goal[]=[], drops:Drop[]=[], sparks:Spark[]=[];
    let ripples:Ripple[]=[];
    let floats:FloatText[]=[];
    let streak = newDryStreak();
    let wAngle=0, fAngle=0, wPhase=0, fPhase=0;
    let raf=0, lt=0, active=false, paused=false;

    // Street geometry: a wide roadway with cobbled pavement down both sides.
    const INSET = SQUARE_INSET;
    const view: StreetView = {
      W, H, left: INSET, right: W - INSET, scroll: 0, walk: walkWidth(W, W - INSET * 2),
    };

    // ── keys ──
    const KEYS = keysRef.current;
    const onDown = (e:KeyboardEvent) => {
      KEYS[e.key]=true;
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
      if (active && !e.repeat && PAUSE_KEYS.includes(e.key)) paused = !paused;
    };
    const onUp   = (e:KeyboardEvent) => { KEYS[e.key]=false; };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup',   onUp);
    /** A player's keys or gamepad, as a stick. */
    const stick = (p:Player) => readStick(KEYS, PLAYERS[p].keys, padFor(p));
    // Losing focus mid-round pauses it and lets go of every held key.
    const stopWatching = watchFocus(KEYS, () => { if (active) paused = true; });

    // ── helpers ──
    function newDrop(anywhere=false): Drop {
      return { x:Math.random()*W, y:anywhere?Math.random()*H:-18, len:10+Math.random()*14, spd:4+Math.random()*3, a:.10+Math.random()*.12 };
    }

    function spawnGoal() {
      const tp = SQUARE_GOALS[Math.floor(rng()*SQUARE_GOALS.length)];
      const at = pickGoalSpot(rng, { x:wx, y:wy }, 110);
      goals.push({ ...tp, x:at.x, y:at.y, age:0, pulse:0, reached:false, pauseLeft:0 });
    }

    function initRound(w:Player, seed:number, n:number) {
      woman = w; round = n;
      rng = makeRng(seed); coveredAt = 0;
      wx=W/2; wy=H*.42; wvx=0; wvy=0;
      fx=W/2+30; fy=H*.42+40; fvx=0; fvy=0;
      wet=0; wScore=0; fScore=0; elapsed=0;
      difficulty=1; diffTimer=0; goalTimer=0; bgOff=0; hudTimer=0;
      setHud({ woman:w, wScore:0, fScore:0, wet:0, left:ROUND_TIME });
      goals=[]; sparks=[]; ripples=[]; floats=[];
      streak = newDryStreak();
      wAngle=0; fAngle=0; wPhase=0; fPhase=0;
      drops = Array.from({length:100}, ()=>newDrop(true));
      spawnGoal(); spawnGoal(); spawnGoal();
    }

    function endRound(end:'soaked'|'home') {
      active=false;
      const result: RoundResult = { woman, wScore:Math.round(wScore), fScore:Math.round(fScore), time:Math.round(elapsed), end };
      setRounds(rs => [...rs, result]);
      setScreen(round>=2 ? 'end' : 'between');
    }

    // ── update ──
    function update(dt:number) {
      elapsed+=dt; bgOff=(bgOff+.5)%80;
      diffTimer+=dt;
      if (diffTimer>20) { diffTimer=0; difficulty=Math.min(3.5, difficulty+.1); }
      const pwx=wx, pwy=wy, pfx=fx, pfy=fy;

      // rain
      for (const d of drops) { d.y+=d.spd*(1+difficulty*.2); if(d.y>H) Object.assign(d,newDrop()); }
      tickRipples(ripples, dt, 12, () => ({ x: Math.random()*W, y: Math.random()*H }));

      // Movement scales with frame time, so a 144 Hz screen turns no sharper than a 60 Hz one.
      const f = dt*60, keep = Math.pow(DAMP, f);

      // the woman — a little faster, so shaking the follower off is possible
      const ws = stick(woman);
      const wspd = (3.8+difficulty*.4)*.18;
      wvx = (wvx + ws.x*wspd*f)*keep; wvy = (wvy + ws.y*wspd*f)*keep;
      wx+=wvx*f; wy+=wvy*f;
      wx=Math.max(16,Math.min(W-16,wx));
      wy=Math.max(16,Math.min(H-16,wy));

      // the follower
      const fs = stick(other(woman));
      const fspd = (3.4+difficulty*.3)*.18;
      fvx = (fvx + fs.x*fspd*f)*keep; fvy = (fvy + fs.y*fspd*f)*keep;
      fx+=fvx*f; fy+=fvy*f;
      fx=Math.max(10,Math.min(W-10,fx));
      fy=Math.max(10,Math.min(H-10,fy));

      const sep = Math.hypot(fx-wx, fy-wy);
      if (sep<=R) coveredAt = elapsed;

      // goals — full value only with the follower under the umbrella
      goalTimer+=dt;
      if (goalTimer>4-difficulty*.5) { goalTimer=0; if(goals.filter(g=>!g.reached).length<3) spawnGoal(); }
      for (const g of goals) {
        g.age+=dt; g.pulse=(g.pulse+dt*3)%(Math.PI*2);
        if (!g.reached && g.pauseLeft<=0 && Math.hypot(wx-g.x, wy-g.y)<20) {
          g.reached=true; g.pauseLeft=g.pause;
          const together = elapsed-coveredAt <= TOGETHER_GRACE;
          const pts = Math.round(g.pts*difficulty*(together ? streak.mult : ALONE_SHARE));
          wScore+=pts;
          floats.push({ x:wx, y:wy-34, text: together ? `+${pts} ${g.label}` : `+${pts} alone`, color: together ? PALETTE.cream : '#ef5844', life:1.2 });
          sparks.push(...Array.from({length:6}, ()=>({ x:wx, y:wy, vx:(Math.random()-.5)*4, vy:(Math.random()-.5)*4, life:1, emoji:g.emoji })));
          if (goals.filter(g2=>!g2.reached).length<2) spawnGoal();
        }
        if (g.pauseLeft>0) { g.pauseLeft-=dt; wvx*=Math.pow(.9, f); wvy*=Math.pow(.9, f); }
      }
      goals = goals.filter(g=>g.reached||g.age<g.dur);

      // facing + stride
      const wStep = Math.hypot(wx-pwx, wy-pwy);
      const fStep = Math.hypot(fx-pfx, fy-pfy);
      if (wStep>.35) wAngle = Math.atan2(wy-pwy, wx-pwx) + Math.PI/2;
      if (fStep>.35) fAngle = Math.atan2(fy-pfy, fx-pfx) + Math.PI/2;
      wPhase += (.6+wStep*6)*dt*5;
      fPhase += (.6+fStep*6)*dt*5;

      // the follower scores for staying dry, more on the rim and on a streak
      const edge = tickDryStreak(streak, sep, R, dt, difficulty);
      fScore += edge.pts;
      floats.push(...streakCallouts(edge.events, fx, fy));
      if (sep>R) { wet=Math.min(1, wet+dt*(.18+(sep-R)/R*.35)); }
      else { wet=Math.max(0, wet-dt*.055); fScore+=dt*COVER_PTS*difficulty*streak.mult; }

      // sparks + callouts
      for (const s of sparks) { s.x+=s.vx; s.y+=s.vy; s.vy+=.1; s.life-=dt*1.4; }
      sparks = sparks.filter(s=>s.life>0);
      floats = tickFloatTexts(floats, dt);

      hudTimer+=dt;
      if (hudTimer>.1) { hudTimer=0; setHud({ woman, wScore, fScore, wet, left:Math.max(0, ROUND_TIME-elapsed) }); }

      if (wet>=1) {
        wScore += SHAKE_BONUS*difficulty;
        endRound('soaked');
      } else if (elapsed>=ROUND_TIME) {
        fScore += HOME_BONUS*difficulty;
        endRound('home');
      }
    }

    // ── draw background ──
    // The street itself: painted on the lower canvas so the scene layer above
    // only has to clear moving objects.
    function drawBg() {
      drawGround(bx, view);
      drawProps(bx, view, 0, elapsed);
    }

    // ── draw scene ──
    function drawScene() {
      ctx.clearRect(0,0,W,H);
      ctx.lineCap='round';

      const sep = Math.hypot(fx-wx,fy-wy);
      const dry: DryZone[] = [{ x: wx, y: wy, r: R }];

      drawRipples(ctx, ripples, undefined, dry);

      // goals
      for (const g of goals) {
        if (g.reached) continue;
        const urgency = g.age/g.dur;
        drawGoalMarker(ctx, g.x, g.y, g.emoji, 1-urgency, g.pulse, g.age*.8);
        if (urgency>.6) {
          ctx.font='10px Inter,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='top';
          ctx.fillStyle=`rgba(239,88,68,${(urgency-.6)*2.5})`;
          ctx.fillText('fading',g.x,g.y+20);
        }
      }

      drawDryZone(ctx, wx, wy, R, sep/R, streak.mult);

      // Jackets follow the role, collar trim follows the player.
      const fp = PLAYERS[other(woman)], wp = PLAYERS[woman];

      drawWalker(ctx, fx, fy, { jacket: PALETTE.jacketOlive, accent: fp.color }, {
        angle: fAngle, phase: fPhase, wet,
      });
      drawWalker(ctx, wx, wy, { jacket: PALETTE.jacketBlue, accent: wp.color }, {
        angle: wAngle, phase: wPhase, umbrella: 24, spin: Math.sin(elapsed*.7)*.06,
      });

      drawTag(ctx, other(woman), fx, fy-16);
      drawTag(ctx, woman, wx, wy-36);

      drawRainField(ctx, drops, H, undefined, dry);

      // sparks
      for (const s of sparks) {
        ctx.save(); ctx.globalAlpha=s.life;
        ctx.font='14px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(s.emoji,s.x,s.y); ctx.restore();
      }

      drawFloatTexts(ctx, floats);
      drawWetOverlay(ctx, W, H, fx, fy, wet);

      if (difficulty>1.5) {
        ctx.font='500 10px Inter,sans-serif'; ctx.textBaseline='bottom';
        ctx.textAlign='center'; ctx.fillStyle=`rgba(239,88,68,${(difficulty-1.5)/2*.5})`;
        ctx.fillText('difficulty '+difficulty.toFixed(1)+'×',W/2,H-14);
      }
    }

    // ── menu background ──
    function drawMenuBg() {
      drawGround(bx, view);
      drawProps(bx, view, 0, 0);
      ctx.clearRect(0,0,W,H); ctx.lineCap='round';
      for(let i=0;i<120;i++){
        const rx=Math.random()*W, ry=Math.random()*H;
        ctx.strokeStyle=`rgba(${PALETTE.rain},${.06+Math.random()*.12})`; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(rx,ry); ctx.lineTo(rx-3,ry+13); ctx.stroke();
      }
    }

    // ── loop ──
    const pressedStart = padPress();
    const pressedPause = padPress([PAD_START]);
    function loop(ts:number) {
      const dt = Math.min((ts-lt)/1000,.05); lt=ts;
      const start = pressedStart(), pause = pressedPause();
      if (!active && start) padActionRef.current?.();
      else if (active && (pause || (paused && start))) paused = !paused;
      drawBg(); drawScene();
      if (active && !paused) update(dt);
      if (active && paused) drawPrompt(ctx, W, H, 'paused', 'Esc, P or Start to resume');
      raf=requestAnimationFrame(loop);
    }

    gameRef.current = {
      start(w, seed, n) {
        initRound(w, seed, n);
        active=true; paused=false; lt=performance.now();
        wrapRef.current?.focus();
      },
      stop() { active=false; },
    };

    // initial menu bg + start loop for idle rain
    drawMenuBg();
    lt=performance.now();
    raf=requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      gameRef.current = null;
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup',   onUp);
      stopWatching();
    };
  }, []);

  // ── React handlers ──
  const [seed, setSeed] = useState(0);
  const startMatch = () => {
    // a coin flip decides who holds the umbrella first; both rounds share a seed
    const first: Player = Math.random()<.5 ? 'p1' : 'p2';
    const s = newSeed();
    setSeed(s);
    setRounds([]);
    gameRef.current?.start(first, s, 1);
    setScreen('playing');
  };
  const nextRound = () => {
    gameRef.current?.start(other(rounds[0].woman), seed, 2);
    setScreen('playing');
  };
  const handleMenu = () => {
    gameRef.current?.stop();
    setRounds([]);
    setScreen('menu');
  };

  // A / Start on a gamepad presses the overlay's main button.
  useEffect(() => {
    // the menu's seats handle the pad themselves: A there takes a seat first
    padActionRef.current = screen==='end' ? startMatch : screen==='between' ? nextRound : null;
  });

  const live = screen==='playing' ? hud : undefined;
  const score = totals(rounds, live);
  const last = rounds[rounds.length-1];
  const winner = score.p1===score.p2 ? null : score.p1>score.p2 ? 'p1' : 'p2';
  const keysOf = (p:Player) => isTouchDevice ? `${PLAYERS[p].padSide} D-pad` : `${PLAYERS[p].keyLabel} or pad`;
  const roleOf = (p:Player) => live?.woman===p ? 'umbrella' : 'follower';

  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      onClick={() => wrapRef.current?.focus()}
      className="relative w-full h-full outline-none"
      style={{ background: PALETTE.night, cursor:'default' }}
    >
      <canvas ref={bgRef} width={SQUARE_W} height={SQUARE_H} className="absolute inset-0 w-full h-full" style={{ objectFit: 'contain', touchAction: 'none' }} />
      <canvas ref={cvRef} width={SQUARE_W} height={SQUARE_H} className="absolute inset-0 w-full h-full" style={{ objectFit: 'contain', touchAction: 'none' }} />
      <VirtualDPad
        keysRef={keysRef}
        keyMap={{ up: 'w', down: 's', left: 'a', right: 'd' }}
        position="left"
        color={PLAYERS.p1.color}
        label={tag('p1')}
      />
      <VirtualDPad
        keysRef={keysRef}
        keyMap={{ up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }}
        position="right"
        color={PLAYERS.p2.color}
        label={tag('p2')}
      />

      {/* ── HUD ── */}
      {screen==='playing' && (
        <div className="absolute top-0 left-0 w-full pointer-events-none" style={{ padding:'12px 16px' }}>
          <div className="flex justify-between items-start">
            {PLAYER_IDS.map((p, i) => (
              <div key={p} style={{ textAlign: i ? 'right' : 'left', order: i ? 3 : 1 }}>
                <div style={{ fontSize:10, fontWeight:500, letterSpacing:'.05em', textTransform:'uppercase', color:PLAYERS[p].color }}>{tag(p)} · {roleOf(p)}</div>
                <div style={{ fontSize:22, fontWeight:700, color:'var(--fog)', lineHeight:1, fontFamily:"'Space Grotesk',sans-serif" }}>{score[p]}</div>
                <div style={{ fontSize:10, color:'rgba(240,236,224,.3)' }}>{roleOf(p)==='umbrella' ? 'goals' : 'stay dry'} · {keysOf(p)}</div>
              </div>
            ))}
            <div style={{ textAlign:'center', order:2 }}>
              <div style={{ fontSize:10, color:'rgba(240,236,224,.45)', marginBottom:3 }}>round {rounds.length+1}/2 · {Math.ceil(hud.left)}s</div>
              <div style={{ width:80, height:5, background:'rgba(255,255,255,.1)', borderRadius:3, overflow:'hidden', margin:'0 auto' }}>
                <div style={{ height:'100%', borderRadius:3, transition:'width .1s, background .2s', width:`${hud.wet*100}%`, background: hud.wet>.65?'#ef4444':hud.wet>.3?'#EF9F27':'#378ADD' }} />
              </div>
              <div style={{ fontSize:10, color:'rgba(240,236,224,.3)', marginTop:3 }}>wetness</div>
            </div>
          </div>
        </div>
      )}

      {/* ── MENU ── */}
      {screen==='menu' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background:'rgba(0,0,0,.8)', padding:'0 20px' }}>
          <p style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:32, fontWeight:700, color:'var(--fog)', letterSpacing:'-.01em', marginBottom:6 }}>Parapluie</p>
          <p style={{ fontSize:13, color:'rgba(240,236,224,.38)', marginBottom:28, textAlign:'center', lineHeight:1.8 }}>
            Two players. One umbrella. Two rounds.
            <br />
            You each hold the umbrella once, and follow once.
          </p>
          <div className="flex gap-8 mb-6">
            {[
              { name:'Umbrella', score:'collect goals', note:'full points only if your follower is dry' },
              { name:'Follower', score:'stay under cover', note:'more on the rim, more on a streak' },
            ].map(r=>(
              <div key={r.name} style={{ textAlign:'center', maxWidth:150 }}>
                <div style={{ fontSize:12, fontWeight:500, color:'var(--fog)', marginBottom:6 }}>{r.name}</div>
                <div style={{ fontSize:11, color:'rgba(240,236,224,.4)', lineHeight:1.7 }}>{r.score}<br />{r.note}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize:11, color:'rgba(240,236,224,.4)', marginBottom:26, textAlign:'center', lineHeight:1.7 }}>
            Rounds last {ROUND_TIME}s. Make it to the end dry for a bonus,
            <br />
            or soak your follower to steal one.
          </p>
          <div style={{ marginBottom:24 }}>
            <Seats onStart={startMatch} />
          </div>
          <button onClick={startMatch} style={{ padding:'13px 44px', borderRadius:28, background:'var(--fog)', color:'#0d110b', border:'none', fontSize:15, fontWeight:500, cursor:'pointer', fontFamily:'inherit', marginBottom:10 }}>
            Start — coin flip for the umbrella
          </button>
          <p style={{ fontSize:11, color:'rgba(240,236,224,.3)' }}>or press A on a gamepad</p>
        </div>
      )}

      {/* ── BETWEEN ROUNDS / END ── */}
      {(screen==='between' || screen==='end') && last && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background:'rgba(0,0,0,.82)', padding:'0 20px' }}>
          <p style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:26, fontWeight:700, color: screen==='end' && winner ? PLAYERS[winner].color : 'var(--fog)', marginBottom:4 }}>
            {screen==='between' ? `Round 1 — ${last.end==='home' ? 'made it home' : 'soaked'}` : winner ? `${tag(winner)} wins!` : 'Draw!'}
          </p>
          <p style={{ fontSize:12, color:'rgba(240,236,224,.4)', marginBottom:24, textAlign:'center' }}>
            {screen==='between'
              ? `Swap: ${tag(other(last.woman))} takes the umbrella.`
              : last.end==='home' ? 'The follower made it home dry.' : 'The follower got soaked.'}
          </p>
          <div style={{ display:'grid', gridTemplateColumns:'auto auto auto', gap:'6px 22px', marginBottom:26, alignItems:'baseline' }}>
            <span />
            {PLAYER_IDS.map(p => (
              <span key={p} style={{ fontSize:11, fontWeight:600, color:PLAYERS[p].color, textAlign:'right' }}>{tag(p)}</span>
            ))}
            {rounds.map((r, i) => (
              <RoundRow key={i} label={`round ${i+1}`} r={r} />
            ))}
            <span style={{ fontSize:11, color:'rgba(240,236,224,.5)', paddingTop:6 }}>total</span>
            {PLAYER_IDS.map(p => (
              <span key={p} style={{ fontSize:22, fontWeight:700, color:'var(--fog)', fontFamily:"'Space Grotesk',sans-serif", textAlign:'right', paddingTop:6 }}>{score[p]}</span>
            ))}
          </div>
          <div className="flex gap-3">
            {screen==='between'
              ? <button onClick={nextRound} style={{ padding:'10px 28px', borderRadius:24, background:'var(--fog)', color:'#0d110b', border:'none', fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:'inherit' }}>Round 2 — {tag(other(last.woman))} holds the umbrella</button>
              : <button onClick={startMatch} style={{ padding:'10px 28px', borderRadius:24, background:'var(--fog)', color:'#0d110b', border:'none', fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:'inherit' }}>Rematch</button>}
            <button onClick={handleMenu} style={{ padding:'10px 24px', borderRadius:24, background:'transparent', color:'rgba(240,236,224,.5)', border:'.5px solid rgba(240,236,224,.2)', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>Menu</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** One line of the score table: each player's points that round, with the role they played. */
function RoundRow({ label, r }: { label:string; r:RoundResult }) {
  const pts = (p:Player) => r.woman===p ? r.wScore : r.fScore;
  return (
    <>
      <span style={{ fontSize:11, color:'rgba(240,236,224,.4)' }}>{label} · {r.time}s</span>
      {PLAYER_IDS.map(p => (
        <span key={p} style={{ fontSize:14, color:'var(--fog)', textAlign:'right' }}>
          {pts(p)} <span style={{ fontSize:10, color:'rgba(240,236,224,.35)' }}>{r.woman===p ? '☂' : '🚶'}</span>
        </span>
      ))}
    </>
  );
}
