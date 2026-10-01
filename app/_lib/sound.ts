/**
 * Every sound in the game, synthesized with the Web Audio API: no audio
 * files, like the art. One rain bed that tells you where you are (muffled
 * patter on the canopy under cover, the full downpour outside), and short
 * cues for the moments that matter.
 *
 * Browsers only allow sound after the player clicks, taps or presses a key,
 * so the audio context starts on the first such gesture. Everything here is
 * safe to call before that, or on the server: it just stays quiet.
 */

const MUTE_KEY = 'parapluie:muted';
const MASTER = 0.6;

type Listener = (muted: boolean) => void;

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  // the rain bed: an open, bright layer and a dull canopy layer, crossfaded
  private openGain: GainNode | null = null;
  private canopyGain: GainNode | null = null;
  private rainFilter: BiquadFilterNode | null = null;
  private muted = false;
  private listeners = new Set<Listener>();
  private lastDrip = 0;
  private lastThud = 0;
  /** when a game last asked for rain; it stops on its own once they stop asking */
  private lastRain = 0;

  constructor() {
    if (typeof window === 'undefined') return;
    try { this.muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* default: on */ }
    const start = () => this.start();
    window.addEventListener('pointerdown', start, { passive: true });
    window.addEventListener('keydown', start);
  }

  get isMuted() { return this.muted; }

  setMuted(m: boolean) {
    this.muted = m;
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* not remembered */ }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : MASTER, this.ctx.currentTime, 0.05);
    for (const l of this.listeners) l(m);
  }

  onMute(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** Create or wake the audio context; only works inside a user gesture. */
  private start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER;
    this.master.connect(ctx.destination);

    // two seconds of noise, looped for the rain and cut up for splashes
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    // pinkish noise (Paul Kellet's filter): softer than white, more like rain
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.0990460;
      b1 = 0.96300 * b1 + w * 0.2965164;
      b2 = 0.57000 * b2 + w * 1.0526913;
      data[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    // open rain: bright, airy
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300;
    this.rainFilter = ctx.createBiquadFilter(); this.rainFilter.type = 'lowpass'; this.rainFilter.frequency.value = 6000;
    this.openGain = ctx.createGain(); this.openGain.gain.value = 0;
    src.connect(hp).connect(this.rainFilter).connect(this.openGain).connect(this.master);
    // canopy: the same rain heard through fabric, a dull close drumming
    const canopy = ctx.createBiquadFilter(); canopy.type = 'bandpass'; canopy.frequency.value = 700; canopy.Q.value = 0.7;
    this.canopyGain = ctx.createGain(); this.canopyGain.gain.value = 0;
    src.connect(canopy).connect(this.canopyGain).connect(this.master);
    src.start();

    // A paused, ended or closed game simply stops calling rain(): fade it out.
    setInterval(() => {
      if (performance.now() - this.lastRain > 250) this.rain(null);
    }, 200);
  }

  private ready(): AudioContext | null {
    return this.ctx && this.ctx.state === 'running' && this.master ? this.ctx : null;
  }

  // ── the rain bed ─────────────────────────────────────────────────────────

  /**
   * Set every frame by a running game. `strain` is the follower's distance
   * from the umbrella as a share of its cover (0 under the middle, 1 at the
   * rim, more outside); pass `sheltered` for an awning. `null` silences the
   * rain: menus, pauses, the end of a game.
   */
  rain(strain: number | null, sheltered = false) {
    const ctx = this.ready();
    if (!ctx || !this.openGain || !this.canopyGain || !this.rainFilter) return;
    const t = ctx.currentTime;
    // a bad number from a game must never reach the audio graph (it throws)
    if (strain !== null && !Number.isFinite(strain)) return;
    if (strain !== null) this.lastRain = performance.now();
    if (strain === null) {
      this.openGain.gain.setTargetAtTime(0, t, 0.3);
      this.canopyGain.gain.setTargetAtTime(0, t, 0.3);
      return;
    }
    const out = sheltered ? 0 : Math.max(0, Math.min(1, (strain - 0.85) / 0.3));
    this.openGain.gain.setTargetAtTime(0.12 + out * 0.5, t, 0.15);
    this.canopyGain.gain.setTargetAtTime((1 - out) * 0.55, t, 0.15);
    this.rainFilter.frequency.setTargetAtTime(1200 + out * 6000, t, 0.15);
    // near the rim, water starts dripping off the edge onto you
    if (!sheltered && strain > 0.85 && strain <= 1.05 && t - this.lastDrip > 0.45) {
      this.lastDrip = t;
      this.drip();
    }
  }

  // ── cues ─────────────────────────────────────────────────────────────────

  private tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; at?: number; to?: number } = {}) {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + (opts.at ?? 0);
    const osc = ctx.createOscillator();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(opts.gain ?? 0.2, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private burst(dur: number, opts: { from: number; to: number; q?: number; gain?: number; at?: number }) {
    const ctx = this.ready();
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime + (opts.at ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = opts.q ?? 1;
    f.frequency.setValueAtTime(opts.from, t);
    f.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(opts.gain ?? 0.5, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  /** A goal collected: a bell that climbs with the dry streak. */
  goal(mult = 1, alone = false) {
    const base = alone ? 440 : 660 * Math.pow(2, (Math.min(4, mult) - 1) * 2 / 12);
    this.tone(base, 0.5, { gain: 0.18 });
    this.tone(base * 2.01, 0.35, { gain: 0.07 });
    if (!alone) this.tone(base * 1.5, 0.4, { gain: 0.08, at: 0.06 });
  }

  /** Skimming the rim paid off. */
  closeCall() {
    this.tone(1400, 0.06, { type: 'triangle', gain: 0.09 });
  }

  streakUp(mult: number) {
    const base = 520 * Math.pow(2, (mult - 2) * 3 / 12);
    [0, 4, 7].forEach((st, i) => this.tone(base * Math.pow(2, st / 12), 0.25, { gain: 0.11, at: i * 0.07 }));
  }

  streakLost() {
    this.tone(330, 0.22, { type: 'triangle', gain: 0.12 });
    this.tone(247, 0.3, { type: 'triangle', gain: 0.12, at: 0.12 });
  }

  /** A drop off the canopy's edge onto the follower. */
  drip() {
    this.tone(1700, 0.09, { gain: 0.07, to: 600 });
  }

  /** Walking into street furniture. */
  thud() {
    const ctx = this.ready();
    if (!ctx || ctx.currentTime - this.lastThud < 0.25) return;
    this.lastThud = ctx.currentTime;
    this.tone(95, 0.14, { gain: 0.25, to: 60 });
    this.burst(0.08, { from: 400, to: 150, gain: 0.25 });
  }

  /** New York: a cab leans on its horn before it comes. */
  honk() {
    for (const at of [0, 0.28]) {
      this.tone(370, 0.2, { type: 'square', gain: 0.05, at });
      this.tone(466, 0.2, { type: 'square', gain: 0.04, at });
    }
  }

  splash() {
    this.burst(0.5, { from: 2500, to: 400, q: 0.6, gain: 0.7 });
  }

  /** Tokyo: the gust arriving. */
  gust() {
    this.burst(1.4, { from: 250, to: 1600, q: 1.5, gain: 0.35 });
    this.burst(1.0, { from: 1600, to: 300, q: 1.5, gain: 0.25, at: 1.0 });
  }

  /** Paris: stepping under an awning. */
  awning() {
    this.tone(880, 0.12, { type: 'triangle', gain: 0.06 });
  }

  /** The follower has had it. */
  soaked() {
    this.burst(0.9, { from: 1800, to: 200, q: 0.5, gain: 0.6 });
    this.tone(392, 0.35, { type: 'triangle', gain: 0.1 });
    this.tone(294, 0.6, { type: 'triangle', gain: 0.1, at: 0.25 });
  }

  /** The duel's follower made it to the end dry. */
  home() {
    [0, 4, 7, 12].forEach((st, i) => this.tone(523 * Math.pow(2, st / 12), 0.35, { gain: 0.1, at: i * 0.09 }));
  }

  /** 3-2-1 (go = the last one). */
  count(go = false) {
    this.tone(go ? 1320 : 880, go ? 0.3 : 0.12, { type: 'triangle', gain: 0.12 });
  }

  /** The wordless calls: the umbrella rings, the follower whistles "Attends !". */
  call(byUmbrella: boolean) {
    if (byUmbrella) {
      this.tone(1568, 0.25, { gain: 0.1 });
      this.tone(1568, 0.25, { gain: 0.1, at: 0.16 });
    } else {
      this.tone(988, 0.12, { type: 'triangle', gain: 0.1, to: 1318 });
      this.tone(1318, 0.18, { type: 'triangle', gain: 0.1, at: 0.14, to: 988 });
    }
  }
}

import type { StreakEvent } from './dryStreak';

/** The one sound engine for the page. */
export const sound = new SoundEngine();

/** Sounds for what the dry streak just did. */
export function playStreak(events: StreakEvent[]) {
  for (const e of events) {
    if (e.kind === 'close') sound.closeCall();
    else if (e.kind === 'up') sound.streakUp(e.mult);
    else sound.streakLost();
  }
}

/** The cue for a city hazard callout, if it has one. */
export function playCue(cue: string | undefined) {
  if (cue === 'honk') sound.honk();
  else if (cue === 'splash') sound.splash();
  else if (cue === 'gust') sound.gust();
  else if (cue === 'awning') sound.awning();
}
