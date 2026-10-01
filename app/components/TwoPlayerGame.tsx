'use client';
import { useEffect, useRef, useState } from 'react';
import VirtualDPad from './VirtualDPad';
import {
  PALETTE, drawGround, drawProps, drawRainField, drawRipples, tickRipples, drawWalker,
  drawDryZone, drawGoalMarker, drawWetOverlay, walkWidth, drawFloatTexts, tickFloatTexts,
  type StreetView, type DryZone, type Ripple, type FloatText,
} from '../_lib/street';
import { newDryStreak, tickDryStreak, streakCallouts } from '../_lib/dryStreak';

// ── types ──────────────────────────────────────────────────────────────────
interface Drop  { x:number; y:number; len:number; spd:number; a:number }
interface Goal  { x:number; y:number; emoji:string; pts:number; dur:number; pause:number; label:string; age:number; pulse:number; reached:boolean; pauseLeft:number }
interface Spark { x:number; y:number; vx:number; vy:number; life:number; emoji:string }

type Screen = 'menu' | 'playing' | 'between' | 'end';
type Player = 'p1' | 'p2';

/** One round of the match: who held the umbrella, what each side scored, how it ended. */
interface RoundResult { woman:Player; wScore:number; fScore:number; time:number; end:'soaked'|'home' }

const GOAL_TYPES: Omit<Goal,'x'|'y'|'age'|'pulse'|'reached'|'pauseLeft'>[] = [
  { emoji:'🐕', pts:120, dur:9,  pause:2.0, label:'pet the dog'    },
  { emoji:'🍊', pts:80,  dur:7,  pause:1.5, label:'fruit stand'    },
  { emoji:'🌸', pts:60,  dur:11, pause:1.0, label:'flower shop'    },
  { emoji:'☕', pts:70,  dur:9,  pause:2.0, label:'coffee stop'    },
  { emoji:'🚌', pts:150, dur:5,  pause:0.5, label:'catch the bus'  },
  { emoji:'📬', pts:50,  dur:12, pause:1.5, label:'post a letter'  },
  { emoji:'🐈', pts:90,  dur:8,  pause:1.8, label:'pet the cat'    },
  { emoji:'🎵', pts:80,  dur:7,  pause:1.2, label:'street music'   },
];

// A match is two rounds with the roles swapped, so each player holds the
// umbrella once and follows once: whichever role is stronger, both get it.
const ROUND_TIME = 60;
/** Goals collected while the follower is out in the rain pay this share. */
const ALONE_SHARE = 0.5;
/** Follower points per second under cover, before difficulty and streak. */
const COVER_PTS = 6;
/** Round-ending bonuses, × difficulty: the woman for shaking the follower off, the follower for making it home. */
const SHAKE_BONUS = 250;
const HOME_BONUS = 250;

/** Each player keeps their keys and colour all match; only the role swaps. */
const PLAYERS: Record<Player, { name:string; color:string; rgb:string; keys:[string,string,string,string]; keyLabel:string; padLabel:string }> = {
  p1: { name:'P1', color:'#7cc24f', rgb:'124,194,79', keys:['a','d','w','s'], keyLabel:'WASD', padLabel:'left D-pad' },
  p2: { name:'P2', color:'#e08a3c', rgb:'224,138,60', keys:['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'], keyLabel:'arrows', padLabel:'right D-pad' },
};
const other = (p:Player): Player => p==='p1' ? 'p2' : 'p1';

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
  const gameRef = useRef<{ start(woman:Player): void; stop(): void } | null>(null);

  const [screen,    setScreen]    = useState<Screen>('menu');
  const [rounds,    setRounds]    = useState<RoundResult[]>([]);
  // Live round numbers for the HUD, pushed from the canvas loop at ~10 Hz.
  const [hud,       setHud]       = useState({ woman:'p1' as Player, wScore:0, fScore:0, wet:0, left:ROUND_TIME });
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => { setIsTouchDevice(navigator.maxTouchPoints > 0); }, []);

  useEffect(() => {
    const bgc = bgRef.current!;
    const cv  = cvRef.current!;
    const bx  = bgc.getContext('2d')!;
    const ctx = cv.getContext('2d')!;
    const W = 480, H = 620;

    // ── mutable game state (lives entirely in this effect) ──
    let woman: Player = 'p1';
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
    let raf=0, lt=0, active=false;

    // Street geometry: a wide roadway with cobbled pavement down both sides.
    const INSET = 58;
    const view: StreetView = {
      W, H, left: INSET, right: W - INSET, scroll: 0, walk: walkWidth(W, W - INSET * 2),
    };

    // ── keys ──
    const KEYS = keysRef.current;
    const onDown = (e:KeyboardEvent) => { KEYS[e.key]=true;  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault(); };
    const onUp   = (e:KeyboardEvent) => { KEYS[e.key]=false; };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup',   onUp);
    const held = (k:string) => KEYS[k] || KEYS[k.toUpperCase()];
    /** Direction a player is holding, as [x, y] in -1..1. */
    function stick(p:Player): [number, number] {
      const [l, r, u, d] = PLAYERS[p].keys;
      return [(held(r)?1:0) - (held(l)?1:0), (held(d)?1:0) - (held(u)?1:0)];
    }

    // ── helpers ──
    function newDrop(anywhere=false): Drop {
      return { x:Math.random()*W, y:anywhere?Math.random()*H:-18, len:10+Math.random()*14, spd:4+Math.random()*3, a:.10+Math.random()*.12 };
    }

    function spawnGoal() {
      let gx=0, gy=0, tries=0;
      do { gx=60+Math.random()*(W-120); gy=70+Math.random()*(H-140); tries++; }
      while (tries<20 && Math.hypot(gx-wx, gy-wy)<110);
      const tp = GOAL_TYPES[Math.floor(Math.random()*GOAL_TYPES.length)];
      goals.push({ ...tp, x:gx, y:gy, age:0, pulse:0, reached:false, pauseLeft:0 });
    }

    function initRound(w:Player) {
      woman = w;
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
      // P1 always holds the umbrella first, so P2 holding it means round 2
      setScreen(woman==='p2' ? 'end' : 'between');
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

      // the woman — a little faster, so shaking the follower off is possible
      const [wdx, wdy] = stick(woman);
      const wspd = (3.8+difficulty*.4)*dt*60;
      wvx += wdx*wspd*.18; wvy += wdy*wspd*.18;
      wvx*=.82; wvy*=.82;
      wx+=wvx; wy+=wvy;
      wx=Math.max(16,Math.min(W-16,wx));
      wy=Math.max(16,Math.min(H-16,wy));

      // the follower
      const [fdx, fdy] = stick(other(woman));
      const fspd = (3.4+difficulty*.3)*dt*60;
      fvx += fdx*fspd*.18; fvy += fdy*fspd*.18;
      fvx*=.82; fvy*=.82;
      fx+=fvx; fy+=fvy;
      fx=Math.max(10,Math.min(W-10,fx));
      fy=Math.max(10,Math.min(H-10,fy));

      const R = 76+(difficulty>2?-8:0);
      const sep = Math.hypot(fx-wx, fy-wy);

      // goals — full value only with the follower under the umbrella
      goalTimer+=dt;
      if (goalTimer>4-difficulty*.5) { goalTimer=0; if(goals.filter(g=>!g.reached).length<3) spawnGoal(); }
      for (const g of goals) {
        g.age+=dt; g.pulse=(g.pulse+dt*3)%(Math.PI*2);
        if (!g.reached && g.pauseLeft<=0 && Math.hypot(wx-g.x, wy-g.y)<20) {
          g.reached=true; g.pauseLeft=g.pause;
          const together = sep<=R;
          const pts = Math.round(g.pts*difficulty*(together ? streak.mult : ALONE_SHARE));
          wScore+=pts;
          floats.push({ x:wx, y:wy-34, text: together ? `+${pts} ${g.label}` : `+${pts} alone`, color: together ? PALETTE.cream : '#ef5844', life:1.2 });
          sparks.push(...Array.from({length:6}, ()=>({ x:wx, y:wy, vx:(Math.random()-.5)*4, vy:(Math.random()-.5)*4, life:1, emoji:g.emoji })));
          if (goals.filter(g2=>!g2.reached).length<2) spawnGoal();
        }
        if (g.pauseLeft>0) { g.pauseLeft-=dt; wvx*=.9; wvy*=.9; }
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

      const R = 76+(difficulty>2?-8:0);
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

      ctx.font='600 10px Inter,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='bottom';
      ctx.fillStyle=`rgba(${fp.rgb},.8)`; ctx.fillText(fp.name,fx,fy-16);
      ctx.fillStyle=`rgba(${wp.rgb},.8)`; ctx.fillText(wp.name,wx,wy-36);

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
    function loop(ts:number) {
      const dt = Math.min((ts-lt)/1000,.05); lt=ts;
      drawBg(); drawScene();
      if (active) update(dt);
      raf=requestAnimationFrame(loop);
    }

    gameRef.current = {
      start(w) {
        initRound(w);
        active=true; lt=performance.now();
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
    };
  }, []);

  // ── React handlers ──
  const startMatch = () => {
    setRounds([]);
    gameRef.current?.start('p1');
    setScreen('playing');
  };
  const nextRound = () => {
    gameRef.current?.start('p2');
    setScreen('playing');
  };
  const handleMenu = () => {
    gameRef.current?.stop();
    setRounds([]);
    setScreen('menu');
  };

  const live = screen==='playing' ? hud : undefined;
  const score = totals(rounds, live);
  const last = rounds[rounds.length-1];
  const winner = score.p1===score.p2 ? null : score.p1>score.p2 ? 'p1' : 'p2';
  const keysOf = (p:Player) => isTouchDevice ? PLAYERS[p].padLabel : PLAYERS[p].keyLabel;
  const roleOf = (p:Player) => (live?.woman ?? 'p1')===p ? 'umbrella' : 'follower';

  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      onClick={() => wrapRef.current?.focus()}
      className="relative w-full h-full outline-none"
      style={{ background: PALETTE.night, cursor:'default' }}
    >
      <canvas ref={bgRef} width={480} height={620} className="absolute inset-0 w-full h-full" style={{ objectFit: 'contain', touchAction: 'none' }} />
      <canvas ref={cvRef} width={480} height={620} className="absolute inset-0 w-full h-full" style={{ objectFit: 'contain', touchAction: 'none' }} />
      <VirtualDPad
        keysRef={keysRef}
        keyMap={{ up: 'w', down: 's', left: 'a', right: 'd' }}
        position="left"
        color={PLAYERS.p1.color}
        label="P1"
      />
      <VirtualDPad
        keysRef={keysRef}
        keyMap={{ up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }}
        position="right"
        color={PLAYERS.p2.color}
        label="P2"
      />

      {/* ── HUD ── */}
      {screen==='playing' && (
        <div className="absolute top-0 left-0 w-full pointer-events-none" style={{ padding:'12px 16px' }}>
          <div className="flex justify-between items-start">
            {(['p1','p2'] as Player[]).map((p, i) => (
              <div key={p} style={{ textAlign: i ? 'right' : 'left', order: i ? 3 : 1 }}>
                <div style={{ fontSize:10, fontWeight:500, letterSpacing:'.05em', textTransform:'uppercase', color:PLAYERS[p].color }}>{PLAYERS[p].name} · {roleOf(p)}</div>
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
          <div className="flex gap-6 mb-7">
            {(['p1','p2'] as Player[]).map(p=>(
              <div key={p} style={{ textAlign:'center' }}>
                <div style={{ width:14, height:14, borderRadius:'50%', background:PLAYERS[p].color, margin:'0 auto 6px', border:'2px solid rgba(255,255,255,.8)' }} />
                <div style={{ fontSize:12, fontWeight:500, color:PLAYERS[p].color }}>{PLAYERS[p].name} · {keysOf(p)}</div>
              </div>
            ))}
          </div>
          <button onClick={startMatch} style={{ padding:'13px 44px', borderRadius:28, background:'var(--fog)', color:'#0d110b', border:'none', fontSize:15, fontWeight:500, cursor:'pointer', fontFamily:'inherit', marginBottom:10 }}>
            Start — P1 holds the umbrella
          </button>
          <p style={{ fontSize:11, color:'rgba(240,236,224,.2)' }}>click here first, then use keyboard</p>
        </div>
      )}

      {/* ── BETWEEN ROUNDS / END ── */}
      {(screen==='between' || screen==='end') && last && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background:'rgba(0,0,0,.82)', padding:'0 20px' }}>
          <p style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:26, fontWeight:700, color: screen==='end' && winner ? PLAYERS[winner].color : 'var(--fog)', marginBottom:4 }}>
            {screen==='between' ? `Round 1 — ${last.end==='home' ? 'made it home' : 'soaked'}` : winner ? `${PLAYERS[winner].name} wins!` : 'Draw!'}
          </p>
          <p style={{ fontSize:12, color:'rgba(240,236,224,.4)', marginBottom:24, textAlign:'center' }}>
            {screen==='between'
              ? `Swap: ${PLAYERS[other(last.woman)].name} takes the umbrella.`
              : last.end==='home' ? 'The follower made it home dry.' : 'The follower got soaked.'}
          </p>
          <div style={{ display:'grid', gridTemplateColumns:'auto auto auto', gap:'6px 22px', marginBottom:26, alignItems:'baseline' }}>
            <span />
            {(['p1','p2'] as Player[]).map(p => (
              <span key={p} style={{ fontSize:11, fontWeight:600, color:PLAYERS[p].color, textAlign:'right' }}>{PLAYERS[p].name}</span>
            ))}
            {rounds.map((r, i) => (
              <RoundRow key={i} label={`round ${i+1}`} r={r} />
            ))}
            <span style={{ fontSize:11, color:'rgba(240,236,224,.5)', paddingTop:6 }}>total</span>
            {(['p1','p2'] as Player[]).map(p => (
              <span key={p} style={{ fontSize:22, fontWeight:700, color:'var(--fog)', fontFamily:"'Space Grotesk',sans-serif", textAlign:'right', paddingTop:6 }}>{score[p]}</span>
            ))}
          </div>
          <div className="flex gap-3">
            {screen==='between'
              ? <button onClick={nextRound} style={{ padding:'10px 28px', borderRadius:24, background:'var(--fog)', color:'#0d110b', border:'none', fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:'inherit' }}>Round 2 — {PLAYERS[other(last.woman)].name} holds the umbrella</button>
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
      {(['p1','p2'] as Player[]).map(p => (
        <span key={p} style={{ fontSize:14, color:'var(--fog)', textAlign:'right' }}>
          {pts(p)} <span style={{ fontSize:10, color:'rgba(240,236,224,.35)' }}>{r.woman===p ? '☂' : '🚶'}</span>
        </span>
      ))}
    </>
  );
}
