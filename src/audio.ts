/**
 * All game audio, synthesised with the Web Audio API (no sample files).
 *
 * - Background music: a procedural four-on-the-floor house loop (~124 BPM).
 * - Engine: a pair of detuned oscillators whose pitch follows the rear wheel
 *   and whose volume/brightness follows the throttle, plus a "pop" on sputter.
 * - Crash: thump + metal clang + rattling bits.
 * - Finish: "Happy Birthday" (the melody is public domain).
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
let sfxBus: GainNode;
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

  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.8;
  sfxBus.connect(master);

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
  /** False while a bad engine is stalled. */
  running: boolean;
  /** Kick-start taps so far while stalled. */
  kicks: number;
}

/** One running engine sound. Create when a race starts, `stop()` when it ends. */
export class EngineSound {
  private readonly nodes: { osc: OscillatorNode[]; gain: GainNode; filter: BiquadFilterNode; chop: GainNode } | null;
  private wasSputtering = false;
  private lastKicks = 0;
  private wasRunning = true;
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
    this.update({ throttle: 0, rpm: 0, sputtering: false, running: true, kicks: 0 });
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
    // Quiet idle, loud on the gas, silent when stalled.
    const vol = s.running ? 0.06 + 0.34 * s.throttle : 0;
    this.nodes.gain.gain.setTargetAtTime(vol, t, s.running ? 0.04 : 0.15);

    if (s.sputtering && !this.wasSputtering) backfire();
    this.wasSputtering = s.sputtering;
    // Each kick-start attempt coughs; starting up gives a bigger bang.
    if (s.kicks > this.lastKicks) crank(0.5);
    if (s.running && !this.wasRunning) {
      backfire();
      crank(1);
    }
    this.lastKicks = s.kicks;
    this.wasRunning = s.running;
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

/** The engine trying to turn over: a short, low, rough "chug". */
function crank(vol: number) {
  const c = ctx!;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(70, t);
  o.frequency.exponentialRampToValueAtTime(30, t + 0.18);
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 500;
  const g = c.createGain();
  g.gain.setValueAtTime(0.5 * vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  o.connect(f).connect(g).connect(engineBus);
  o.start(t);
  o.stop(t + 0.25);
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

// ---------------------------------------------------------------- crash

function noiseBurst(t: number, dur: number, vol: number, type: BiquadFilterType, freq: number, q = 1) {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(sfxBus);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

/** Metallic "clang": a few inharmonic partials ringing out. */
function clang(t: number, base: number, vol: number, dur: number) {
  const c = ctx!;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  g.connect(sfxBus);
  for (const ratio of [1, 2.76, 5.4, 8.93]) {
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.value = base * ratio;
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
}

export function playCrash() {
  const c = ensureContext();
  if (!c) return;
  const t = c.currentTime;
  // Body hitting the dirt.
  const thump = c.createOscillator();
  const tg = c.createGain();
  thump.frequency.setValueAtTime(110, t);
  thump.frequency.exponentialRampToValueAtTime(35, t + 0.25);
  tg.gain.setValueAtTime(1.2, t);
  tg.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  thump.connect(tg).connect(sfxBus);
  thump.start(t);
  thump.stop(t + 0.45);
  noiseBurst(t, 0.35, 0.9, "lowpass", 900);
  // Metal.
  clang(t + 0.01, 310 + Math.random() * 80, 0.35, 0.6);
  clang(t + 0.09, 520 + Math.random() * 120, 0.2, 0.4);
  // Bits and bolts bouncing away.
  for (let i = 0; i < 7; i++) {
    const dt = 0.15 + i * 0.07 + Math.random() * 0.06;
    noiseBurst(t + dt, 0.04, 0.35 * (1 - i / 9), "bandpass", 3000 + Math.random() * 3000, 4);
    if (i % 2 === 0) clang(t + dt, 1200 + Math.random() * 900, 0.06, 0.12);
  }
}

// ---------------------------------------------------------------- happy birthday

const NOTE: Record<string, number> = {
  F3: 174.61, G3: 196, A3: 220, B3: 246.94, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23,
  G4: 392, A4: 440, "A#4": 466.16, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99,
};

/** [note, beats, chord that starts on this note]. */
const MELODY: [string, number, string[]?][] = [
  ["G4", 0.75], ["G4", 0.25], ["A4", 1, ["C4", "E4", "G4"]], ["G4", 1], ["C5", 1], ["B4", 2, ["G3", "B3", "D4"]],
  ["G4", 0.75], ["G4", 0.25], ["A4", 1, ["G3", "B3", "F4"]], ["G4", 1], ["D5", 1], ["C5", 2, ["C4", "E4", "G4"]],
  ["G4", 0.75], ["G4", 0.25], ["G5", 1, ["C4", "E4", "A#4"]], ["E5", 1], ["C5", 1, ["F3", "A3", "C4"]], ["B4", 1],
  ["A4", 2],
  ["F5", 0.75], ["F5", 0.25], ["E5", 1, ["C4", "E4", "G4"]], ["C5", 1], ["D5", 1, ["G3", "B3", "F4"]],
  ["C5", 3, ["C4", "E4", "G4"]],
];
const SONG_BEAT = 60 / 112;

function songNote(freq: number, t: number, dur: number, vol: number, type: OscillatorType, out: AudioNode) {
  const c = ctx!;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.015);
  g.gain.setTargetAtTime(vol * 0.6, t + 0.05, 0.1);
  g.gain.setTargetAtTime(0.0001, t + dur * 0.9, 0.05);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.3);
}

/** "Almost!" jingle for a finish outside the time limit. */
export function playTooSlow() {
  const c = ensureContext();
  if (!c) return;
  const t = c.currentTime + 0.05;
  ["E5", "D5", "C5"].forEach((n, i) => songNote(NOTE[n], t + i * 0.18, 0.16, 0.18, "square", sfxBus));
  songNote(NOTE["G4"], t + 0.6, 0.5, 0.18, "square", sfxBus);
  songNote(NOTE["C4"] / 2, t + 0.6, 0.5, 0.3, "triangle", sfxBus);
}

let songPlaying = false;

/** Plays "Happy Birthday" once, ducking the background music meanwhile. */
export function playHappyBirthday() {
  const c = ensureContext();
  if (!c || songPlaying) return;
  songPlaying = true;
  const t0 = c.currentTime + 0.3;
  const total = MELODY.reduce((sum, [, b]) => sum + b, 0) * SONG_BEAT;

  musicBus.gain.setTargetAtTime(0, c.currentTime, 0.1);
  musicBus.gain.setTargetAtTime(MUSIC_VOLUME, t0 + total + 0.5, 0.8);

  const lead = c.createBiquadFilter();
  lead.type = "lowpass";
  lead.frequency.value = 3000;
  lead.connect(sfxBus);

  // Find how long each chord lasts (until the next chord, or the end).
  const starts: { t: number; chord: string[] }[] = [];
  let t = t0;
  for (const [n, beats, chord] of MELODY) {
    const dur = beats * SONG_BEAT;
    songNote(NOTE[n], t, dur, 0.22, "square", lead);
    songNote(NOTE[n] * 2, t, dur, 0.06, "triangle", sfxBus); // sparkle an octave up
    if (chord) starts.push({ t, chord });
    t += dur;
  }
  // Accompaniment: bass on the chord change, then chord "oom-pah-pah" on each beat.
  starts.forEach(({ t: ts, chord }, i) => {
    const end = starts[i + 1]?.t ?? t0 + total;
    songNote(NOTE[chord[0]] / 2, ts, SONG_BEAT * 0.9, 0.3, "triangle", sfxBus);
    for (let tb = ts + SONG_BEAT; tb < end - 0.01; tb += SONG_BEAT) {
      for (const n of chord) songNote(NOTE[n], tb, SONG_BEAT * 0.6, 0.05, "triangle", sfxBus);
    }
  });
  window.setTimeout(() => (songPlaying = false), (total + 1) * 1000);
}
