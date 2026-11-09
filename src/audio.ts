/**
 * All game audio, synthesised with the Web Audio API (no sample files).
 *
 * - Background music: a procedural four-on-the-floor house loop (~124 BPM).
 * - Engine: a pair of detuned oscillators whose pitch follows the rear wheel
 *   and whose volume/brightness follows the throttle, plus a "pop" on sputter.
 *
 * Browsers only allow audio after a user gesture, so the context is created
 * lazily on the first key press / tap (see `installAudioUnlock`).
 */

const MUTE_KEY = "qwop-bike:muted";
const BPM = 124;
const STEP = 60 / BPM / 4; // one 16th note in seconds
const LOOKAHEAD = 0.12; // seconds scheduled ahead of the clock

const MUSIC_VOLUME = 0.32;
const ENGINE_VOLUME = 0.55;

// A-minor house progression, one chord per bar: Am7 · Fmaj7 · C · G
const BASS_ROOTS = [55, 43.65, 65.41, 49]; // A1 F1 C2 G1 (Hz)
const CHORDS = [
  [220, 261.63, 329.63, 392], // A3 C4 E4 G4
  [174.61, 220, 261.63, 329.63], // F3 A3 C4 E4
  [196, 261.63, 329.63, 392], // G3 C4 E4 G4
  [196, 246.94, 293.66, 392], // G3 B3 D4 G4
];
/** 16th-note positions in a bar where the chord stab hits. */
const STAB_STEPS = new Set([2, 5, 10, 13]);

let ctx: AudioContext | null = null;
let master: GainNode;
let musicBus: GainNode;
let engineBus: GainNode;
let noise: AudioBuffer;
let muted = readMuted();
const listeners = new Set<(muted: boolean) => void>();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.ratio.value = 8;
  limiter.connect(ctx.destination);

  master = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(limiter);

  musicBus = ctx.createGain();
  musicBus.gain.value = MUSIC_VOLUME;
  musicBus.connect(master);

  engineBus = ctx.createGain();
  engineBus.gain.value = ENGINE_VOLUME;
  engineBus.connect(master);

  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  return ctx;
}

/** Call once at startup: the first user gesture starts the audio + music. */
export function installAudioUnlock() {
  const unlock = () => {
    const c = ensureContext();
    if (!c) return;
    void c.resume();
    startMusic();
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
}

// ---------------------------------------------------------------- mute

export function isMuted() {
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem(MUTE_KEY, m ? "1" : "0");
  } catch {
    /* storage unavailable: mute just won't persist */
  }
  if (ctx) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.03);
  for (const l of listeners) l(m);
}

export function onMuteChange(l: (muted: boolean) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

// ---------------------------------------------------------------- music

let musicTimer = 0;
let nextStepTime = 0;
let stepIndex = 0;

function startMusic() {
  if (!ctx || musicTimer) return;
  nextStepTime = ctx.currentTime + 0.05;
  stepIndex = 0;
  musicTimer = window.setInterval(scheduleMusic, 25);
}

function scheduleMusic() {
  if (!ctx) return;
  // If the tab was in the background, don't try to catch up on missed notes.
  if (nextStepTime < ctx.currentTime - 0.2) nextStepTime = ctx.currentTime + 0.02;
  while (nextStepTime < ctx.currentTime + LOOKAHEAD) {
    playStep(stepIndex, nextStepTime);
    nextStepTime += STEP;
    stepIndex++;
  }
}

function playStep(i: number, t: number) {
  const step = i % 16;
  const bar = Math.floor(i / 16);
  const chord = bar % 4;
  // 16-bar arrangement: drums only for the intro, then bass, then everything.
  const section = Math.floor(bar / 4) % 4;
  const withBass = section >= 1;
  const withStabs = section >= 2;
  const breakdown = section === 3 && bar % 4 === 3; // drop the kick for one bar

  if (step % 4 === 0 && !breakdown) kick(t);
  if (step === 4 || step === 12) clap(t);
  if (step % 4 === 2) hat(t, 0.16, 0.22); // open hat on the off-beat
  else if (step % 2 === 1) hat(t, 0.03, 0.08);
  if (withBass && step % 4 === 2) bass(BASS_ROOTS[chord], t);
  if (withBass && step === 15) bass(BASS_ROOTS[chord] * 2, t, 0.08);
  if (withStabs && STAB_STEPS.has(step)) stab(CHORDS[chord], t);
}

function kick(t: number) {
  const c = ctx!;
  const o = c.createOscillator();
  const g = c.createGain();
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  g.gain.setValueAtTime(1, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  o.connect(g).connect(musicBus);
  o.start(t);
  o.stop(t + 0.45);
}

function noiseHit(t: number, dur: number, vol: number, filter: BiquadFilterNode, offset = 0) {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noise;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter).connect(g).connect(musicBus);
  src.start(t, offset);
  src.stop(t + dur + 0.02);
}

function hat(t: number, dur: number, vol: number) {
  const f = ctx!.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = 7500;
  noiseHit(t, dur, vol, f, Math.random() * 0.5);
}

function clap(t: number) {
  // A few quick bursts make it sound like hands rather than a snare.
  for (let k = 0; k < 3; k++) {
    const f = ctx!.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 1400;
    f.Q.value = 0.8;
    noiseHit(t + k * 0.011, k === 2 ? 0.18 : 0.02, 0.5, f, Math.random() * 0.5);
  }
}

function bass(freq: number, t: number, dur = 0.16) {
  const c = ctx!;
  const o = c.createOscillator();
  o.type = "sawtooth";
  o.frequency.value = freq;
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.Q.value = 6;
  f.frequency.setValueAtTime(900, t);
  f.frequency.exponentialRampToValueAtTime(180, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.45, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(f).connect(g).connect(musicBus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function stab(freqs: number[], t: number) {
  const c = ctx!;
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.Q.value = 3;
  f.frequency.setValueAtTime(2600, t);
  f.frequency.exponentialRampToValueAtTime(500, t + 0.18);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.09, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  f.connect(g).connect(musicBus);
  for (const freq of freqs) {
    for (const detune of [-8, 8]) {
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = freq;
      o.detune.value = detune;
      o.connect(f);
      o.start(t);
      o.stop(t + 0.25);
    }
  }
}

// ---------------------------------------------------------------- engine

export interface EngineState {
  /** 0..1 smoothed throttle actually reaching the wheel. */
  throttle: number;
  /** 0..1 rear wheel speed relative to the bike's top speed. */
  rpm: number;
  sputtering: boolean;
}

/** One running engine sound. Create when a race starts, `stop()` when it ends. */
export class EngineSound {
  private readonly nodes: { osc: OscillatorNode[]; gain: GainNode; filter: BiquadFilterNode; chop: GainNode } | null;
  private wasSputtering = false;
  private stopped = false;

  constructor() {
    const c = ensureContext();
    if (!c) {
      this.nodes = null;
      return;
    }
    const t = c.currentTime;
    const gain = c.createGain();
    gain.gain.value = 0;
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 4;
    filter.frequency.value = 400;
    // "chop" is amplitude-modulated at the firing rate for a chuggy texture.
    const chop = c.createGain();
    chop.gain.value = 0.7;

    const main = c.createOscillator();
    main.type = "sawtooth";
    const sub = c.createOscillator();
    sub.type = "square";
    const firing = c.createOscillator();
    firing.type = "square";
    const firingDepth = c.createGain();
    firingDepth.gain.value = 0.3;
    firing.connect(firingDepth).connect(chop.gain);

    main.connect(chop);
    sub.connect(chop);
    chop.connect(filter).connect(gain).connect(engineBus);
    for (const o of [main, sub, firing]) o.start(t);
    this.nodes = { osc: [main, sub, firing], gain, filter, chop };
    this.update({ throttle: 0, rpm: 0, sputtering: false });
  }

  update(s: EngineState) {
    if (!ctx || !this.nodes || this.stopped) return;
    const t = ctx.currentTime;
    const [main, sub, firing] = this.nodes.osc;
    const base = 38 + 120 * Math.min(1, s.rpm) + 25 * s.throttle;
    main.frequency.setTargetAtTime(base, t, 0.05);
    sub.frequency.setTargetAtTime(base * 0.5, t, 0.05);
    firing.frequency.setTargetAtTime(base * 0.25, t, 0.05);
    this.nodes.filter.frequency.setTargetAtTime(350 + 2200 * s.throttle + 600 * s.rpm, t, 0.04);
    // Quiet idle, loud on the gas.
    this.nodes.gain.gain.setTargetAtTime(0.06 + 0.34 * s.throttle, t, 0.04);

    if (s.sputtering && !this.wasSputtering) backfire();
    this.wasSputtering = s.sputtering;
  }

  stop() {
    if (!ctx || !this.nodes || this.stopped) return;
    this.stopped = true;
    const t = ctx.currentTime;
    this.nodes.gain.gain.cancelScheduledValues(t);
    this.nodes.gain.gain.setTargetAtTime(0, t, 0.15);
    for (const o of this.nodes.osc) o.stop(t + 1);
  }
}

/** A short low "pop" when the chain/engine sputters. */
function backfire() {
  const c = ctx!;
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 600;
  const g = c.createGain();
  g.gain.setValueAtTime(0.9, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  src.connect(f).connect(g).connect(engineBus);
  src.start(t, Math.random() * 0.5);
  src.stop(t + 0.15);
}
