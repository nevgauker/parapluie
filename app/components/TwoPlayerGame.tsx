'use client';
import { useEffect, useRef, useState } from 'react';
import VirtualDPad from './VirtualDPad';
import {
  PALETTE, drawGround, drawProps, drawRainField, drawRipples, tickRipples, drawWalker,
  drawDryZone, drawGoalMarker, drawWetOverlay, walkWidth,
  type StreetView, type DryZone, type Ripple,
} from '../_lib/street';

// ── types ──────────────────────────────────────────────────────────────────
interface Drop  { x:number; y:number; len:number; spd:number; a:number }
interface Goal  { x:number; y:number; emoji:string; pts:number; dur:number; pause:number; label:string; age:number; pulse:number; reached:boolean; pauseLeft:number }
interface Spark { x:number; y:number; vx:number; vy:number; life:number; emoji:string }

type Screen = 'menu' | 'playing' | 'end';

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

// ── component ──────────────────────────────────────────────────────────────
export default function TwoPlayerGame() {
  const bgRef   = useRef<HTMLCanvasElement>(null);
  const cvRef   = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const keysRef = useRef<Record<string, boolean>>({});

  const [screen,    setScreen]    = useState<Screen>('menu');
  const [endData,   setEndData]   = useState({ wScore:0, fScore:0, time:0, wet:0 });
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  // live refs so canvas loop can read without stale closure
  const screenRef = useRef<Screen>('menu');
  screenRef.current = screen;

  useEffect(() => { setIsTouchDevice(navigator.maxTouchPoints > 0); }, []);

  useEffect(() => {
    const bgc = bgRef.current!;
    const cv  = cvRef.current!;
    const bx  = bgc.getContext('2d')!;
    const ctx = cv.getContext('2d')!;
    const W = 480, H = 620;

    // ── mutable game state (lives entirely in this effect) ──
    let wx=W/2, wy=H*.42, wvx=0, wvy=0;
    let fx=W/2+40, fy=H*.56, fvx=0, fvy=0;
    let wet=0, wScore=0, fScore=0, elapsed=0;
    let difficulty=1, diffTimer=0, goalTimer=0, bgOff=0;
    let goals:Goal[]=[], drops:Drop[]=[], sparks:Spark[]=[];
    let ripples:Ripple[]=[];
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

    function initRound() {
      wx=W/2; wy=H*.42; wvx=0; wvy=0;
      fx=W/2+40; fy=H*.56; fvx=0; fvy=0;
      wet=0; wScore=0; fScore=0; elapsed=0;
      difficulty=1; diffTimer=0; goalTimer=0; bgOff=0;
      goals=[]; sparks=[]; ripples=[];
      wAngle=0; fAngle=0; wPhase=0; fPhase=0;
      drops = Array.from({length:100}, ()=>newDrop(true));
      spawnGoal(); spawnGoal(); spawnGoal();
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

      // P2 — woman (arrow keys)
      const wspd = (3.8+difficulty*.4)*dt*60;
      if (KEYS['ArrowLeft'])  wvx -= wspd*.18;
      if (KEYS['ArrowRight']) wvx += wspd*.18;
      if (KEYS['ArrowUp'])    wvy -= wspd*.18;
      if (KEYS['ArrowDown'])  wvy += wspd*.18;
      wvx*=.82; wvy*=.82;
      wx+=wvx; wy+=wvy;
      wx=Math.max(16,Math.min(W-16,wx));
      wy=Math.max(16,Math.min(H-16,wy));

      // goals
      goalTimer+=dt;
      if (goalTimer>4-difficulty*.5) { goalTimer=0; if(goals.filter(g=>!g.reached).length<3) spawnGoal(); }
      for (const g of goals) {
        g.age+=dt; g.pulse=(g.pulse+dt*3)%(Math.PI*2);
        if (!g.reached && g.pauseLeft<=0 && Math.hypot(wx-g.x, wy-g.y)<20) {
          g.reached=true; g.pauseLeft=g.pause;
          wScore+=Math.round(g.pts*difficulty);
          sparks.push(...Array.from({length:6}, ()=>({ x:wx, y:wy, vx:(Math.random()-.5)*4, vy:(Math.random()-.5)*4, life:1, emoji:g.emoji })));
          if (goals.filter(g2=>!g2.reached).length<2) spawnGoal();
        }
        if (g.pauseLeft>0) { g.pauseLeft-=dt; wvx*=.9; wvy*=.9; }
      }
      goals = goals.filter(g=>g.reached||g.age<g.dur);

      // P1 — follower (WASD)
      const fspd = (3.4+difficulty*.3)*dt*60;
      if (KEYS['a']||KEYS['A']) fvx -= fspd*.18;
      if (KEYS['d']||KEYS['D']) fvx += fspd*.18;
      if (KEYS['w']||KEYS['W']) fvy -= fspd*.18;
      if (KEYS['s']||KEYS['S']) fvy += fspd*.18;
      fvx*=.82; fvy*=.82;
      fx+=fvx; fy+=fvy;
      fx=Math.max(10,Math.min(W-10,fx));
      fy=Math.max(10,Math.min(H-10,fy));

      // facing + stride
      const wStep = Math.hypot(wx-pwx, wy-pwy);
      const fStep = Math.hypot(fx-pfx, fy-pfy);
      if (wStep>.35) wAngle = Math.atan2(wy-pwy, wx-pwx) + Math.PI/2;
      if (fStep>.35) fAngle = Math.atan2(fy-pfy, fx-pfx) + Math.PI/2;
      wPhase += (.6+wStep*6)*dt*5;
      fPhase += (.6+fStep*6)*dt*5;

      // wetness
      const R = 76+(difficulty>2?-8:0);
      const sep = Math.hypot(fx-wx, fy-wy);
      if (sep>R) { wet=Math.min(1, wet+dt*(.18+(sep-R)/R*.35)); }
      else { wet=Math.max(0, wet-dt*.055); fScore+=dt*(8+difficulty*4); }

      // sparks
      for (const s of sparks) { s.x+=s.vx; s.y+=s.vy; s.vy+=.1; s.life-=dt*1.4; }
      sparks = sparks.filter(s=>s.life>0);

      if (wet>=1) {
        active=false;
        setEndData({ wScore:Math.round(wScore), fScore:Math.round(fScore), time:Math.round(elapsed), wet });
        setScreen('end');
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

      drawDryZone(ctx, wx, wy, R, sep/R);

      // P1 follower — bare-headed, soaks when they stray
      drawWalker(ctx, fx, fy, { jacket: PALETTE.jacketOlive, accent:'#e08a3c' }, {
        angle: fAngle, phase: fPhase, wet,
      });
      // P2 woman — under the canopy
      drawWalker(ctx, wx, wy, { jacket: PALETTE.jacketBlue, accent:'#7cc24f' }, {
        angle: wAngle, phase: wPhase, umbrella: 24, spin: Math.sin(elapsed*.7)*.06,
      });

      ctx.font='500 9px Inter,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='bottom';
      ctx.fillStyle='rgba(224,138,60,.6)'; ctx.fillText('WASD',fx,fy-16);
      ctx.fillStyle='rgba(124,194,79,.6)'; ctx.fillText('↑↓←→',wx,wy-36);

      drawRainField(ctx, drops, H, undefined, dry);

      // sparks
      for (const s of sparks) {
        ctx.save(); ctx.globalAlpha=s.life;
        ctx.font='14px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(s.emoji,s.x,s.y); ctx.restore();
      }

      drawWetOverlay(ctx, W, H, fx, fy, wet);

      // in-game scores
      ctx.font='500 10px Inter,sans-serif'; ctx.textBaseline='bottom';
      ctx.textAlign='left';  ctx.fillStyle='rgba(224,138,60,.55)';  ctx.fillText('P1: '+Math.round(fScore),14,H-14);
      ctx.textAlign='right'; ctx.fillStyle='rgba(124,194,79,.55)';  ctx.fillText('P2: '+Math.round(wScore),W-14,H-14);
      if (difficulty>1.5) {
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

    // expose start/stop to React handlers via refs
    (cv as any)._startGame = () => {
      initRound();
      active=true; lt=performance.now();
      if (!raf) raf=requestAnimationFrame(loop);
      wrapRef.current?.focus();
    };
    (cv as any)._stopGame = () => { active=false; };

    // initial menu bg + start loop for idle rain
    drawMenuBg();
    lt=performance.now();
    raf=requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup',   onUp);
    };
  }, []);

  // ── React handlers ──
  const handleStart = () => {
    (cvRef.current as any)?._startGame();
    setScreen('playing');
  };
  const handleRestart = () => {
    (cvRef.current as any)?._startGame();
    setScreen('playing');
  };
  const handleMenu = () => {
    (cvRef.current as any)?._stopGame();
    setScreen('menu');
  };

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
        color="#e08a3c"
        label="P1"
      />
      <VirtualDPad
        keysRef={keysRef}
        keyMap={{ up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }}
        position="right"
        color="#7cc24f"
        label="P2"
      />

      {/* ── HUD ── */}
      {screen==='playing' && (
        <div className="absolute top-0 left-0 w-full pointer-events-none" style={{ padding:'12px 16px' }}>
          <div className="flex justify-between items-start">
            <div>
              <div style={{ fontSize:10, fontWeight:500, letterSpacing:'.05em', textTransform:'uppercase', color:'#7cc24f' }}>P2 — Woman</div>
              <div style={{ fontSize:22, fontWeight:700, color:'var(--fog)', lineHeight:1, fontFamily:"'Space Grotesk',sans-serif" }}>{Math.round(endData.wScore)}</div>
              <div style={{ fontSize:10, color:'rgba(240,236,224,.3)' }}>{isTouchDevice ? 'goals · D-pad' : 'goals · arrows'}</div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:10, color:'rgba(240,236,224,.35)', marginBottom:3 }}>wetness</div>
              <div style={{ width:80, height:5, background:'rgba(255,255,255,.1)', borderRadius:3, overflow:'hidden', margin:'0 auto' }}>
                <div style={{ height:'100%', borderRadius:3, transition:'width .1s, background .2s', width:`${endData.wet*100}%`, background: endData.wet>.65?'#ef4444':endData.wet>.3?'#EF9F27':'#378ADD' }} />
              </div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:10, fontWeight:500, letterSpacing:'.05em', textTransform:'uppercase', color:'#e08a3c' }}>P1 — Follower</div>
              <div style={{ fontSize:22, fontWeight:700, color:'var(--fog)', lineHeight:1, fontFamily:"'Space Grotesk',sans-serif" }}>{Math.round(endData.fScore)}</div>
              <div style={{ fontSize:10, color:'rgba(240,236,224,.3)' }}>{isTouchDevice ? 'survive · D-pad' : 'survive · WASD'}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── MENU ── */}
      {screen==='menu' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background:'rgba(0,0,0,.8)' }}>
          <p style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:32, fontWeight:700, color:'var(--fog)', letterSpacing:'-.01em', marginBottom:6 }}>Parapluie</p>
          <p style={{ fontSize:13, color:'rgba(240,236,224,.38)', marginBottom:36, textAlign:'center', lineHeight:1.8 }}>
            Two players. One umbrella.
            <br />
            {isTouchDevice ? 'Use D-pads.' : 'One keyboard.'}
          </p>
          <div className="flex gap-8 mb-8">
            {[
              { color:'#7cc24f', name:'P2 — Woman',   keys:'↑ ↓ ← → to move', score:'collect goals' },
              { color:'#e08a3c', name:'P1 — Follower', keys:'W A S D to move', score:'stay under umbrella' },
            ].map(p=>(
              <div key={p.name} style={{ textAlign:'center' }}>
                <div style={{ width:16, height:16, borderRadius:'50%', background:p.color, margin:'0 auto 8px', border:'2px solid rgba(255,255,255,.8)' }} />
                <div style={{ fontSize:12, fontWeight:500, color:p.color, marginBottom:6 }}>{p.name}</div>
                <div style={{ fontSize:11, color:'rgba(240,236,224,.4)', lineHeight:1.9 }}>{p.keys}<br />{p.score}</div>
              </div>
            ))}
          </div>
          <button onClick={handleStart} style={{ padding:'13px 44px', borderRadius:28, background:'var(--fog)', color:'#0d110b', border:'none', fontSize:15, fontWeight:500, cursor:'pointer', fontFamily:'inherit', marginBottom:10 }}>
            Start
          </button>
          <p style={{ fontSize:11, color:'rgba(240,236,224,.2)' }}>click here first, then use keyboard</p>
        </div>
      )}

      {/* ── END ── */}
      {screen==='end' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background:'rgba(0,0,0,.82)' }}>
          <p style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:26, fontWeight:700, color:'var(--fog)', marginBottom:4 }}>
            {endData.fScore > endData.wScore ? 'P1 wins!' : 'P2 wins!'}
          </p>
          <p style={{ fontSize:12, color:'rgba(240,236,224,.35)', marginBottom:28 }}>
            {endData.time > 45 ? 'Great run! Swap roles next round.' : 'Stay closer next time!'}
          </p>
          <div className="flex gap-6 mb-7">
            {[
              { label:'P2 goals', val: endData.wScore },
              { label:'P1 survival', val: endData.fScore },
              { label:'lasted', val: endData.time+'s' },
            ].map(s=>(
              <div key={s.label} style={{ textAlign:'center' }}>
                <span style={{ display:'block', fontSize:22, fontWeight:700, color:'var(--fog)', fontFamily:"'Space Grotesk',sans-serif" }}>{s.val}</span>
                <span style={{ fontSize:10, color:'rgba(240,236,224,.38)' }}>{s.label}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={handleRestart} style={{ padding:'10px 28px', borderRadius:24, background:'var(--fog)', color:'#0d110b', border:'none', fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:'inherit' }}>Play again</button>
            <button onClick={handleMenu}   style={{ padding:'10px 24px', borderRadius:24, background:'transparent', color:'rgba(240,236,224,.5)', border:'.5px solid rgba(240,236,224,.2)', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>Menu</button>
          </div>
        </div>
      )}
    </div>
  );
}
