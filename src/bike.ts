/**
 * The assembled bike: one quality score per part (0 = disaster, 1 = perfect),
 * and the derived handling stats the race physics actually uses.
 *
 * Design rule: even a perfect bike is awkward (QWOP!), but a badly assembled
 * one adds lag, sputter, wobble and — in the worst case — swapped keys.
 */

export const PARTS = ["wheels", "engine", "chain", "suspension", "handlebar"] as const;
export type PartId = (typeof PARTS)[number];

export type PartScores = Record<PartId, number>;

export interface PartInfo {
  name: string;
  /** What a bad score does, shown to the player after assembly. */
  effect: string;
}

export const PART_INFO: Record<PartId, PartInfo> = {
  wheels: { name: "Wheels", effect: "grip & wobble" },
  engine: { name: "Engine", effect: "power & top speed" },
  chain: { name: "Chain", effect: "throttle lag & sputter" },
  suspension: { name: "Suspension", effect: "bounce & landing" },
  handlebar: { name: "Handlebar", effect: "lean precision & input delay" },
};

export interface BikeStats {
  /** Max rear wheel angular speed (rad/s). */
  maxWheelSpeed: number;
  /** Max rear wheel motor torque. */
  motorTorque: number;
  /** Time constant (s) for throttle to follow the key. */
  throttleLag: number;
  /** Chance per second that the engine sputters (throttle cut briefly). */
  sputterRate: number;
  /** Wheel joint spring frequency (Hz). */
  springHz: number;
  /** Wheel joint damping ratio. */
  springDamping: number;
  /** Tyre friction coefficient. */
  grip: number;
  /** Random torque kicks on the chassis (wobbly wheels). */
  wobble: number;
  /** Torque applied to the chassis when leaning. */
  leanTorque: number;
  /** Input delay for the lean keys (ms). */
  inputDelayMs: number;
  /** Handlebar mounted backwards: O and P are swapped. */
  leanSwapped: boolean;
}

export interface Bike {
  scores: PartScores;
  stats: BikeStats;
  /** 0..1 average quality. */
  quality: number;
  grade: string;
  builtAt: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Score below which the handlebar ends up mounted backwards. */
export const HANDLEBAR_SWAP_THRESHOLD = 0.2;

export function deriveStats(raw: PartScores): BikeStats {
  const s = Object.fromEntries(PARTS.map((p) => [p, clamp01(raw[p])])) as PartScores;
  const bad = (p: PartId) => 1 - s[p];
  return {
    maxWheelSpeed: lerp(28, 45, s.engine),
    motorTorque: lerp(9, 15, s.engine),
    throttleLag: lerp(0.6, 0.06, s.chain),
    sputterRate: 2.5 * bad("chain") ** 2,
    springHz: lerp(1.6, 4.5, s.suspension),
    springDamping: lerp(0.08, 0.7, s.suspension),
    grip: lerp(0.45, 1.0, s.wheels),
    wobble: 4 * bad("wheels") ** 1.5,
    leanTorque: lerp(15, 10, s.handlebar),
    inputDelayMs: lerp(220, 0, s.handlebar),
    leanSwapped: s.handlebar < HANDLEBAR_SWAP_THRESHOLD,
  };
}

export function gradeFor(quality: number): string {
  if (quality >= 0.95) return "S";
  if (quality >= 0.85) return "A";
  if (quality >= 0.7) return "B";
  if (quality >= 0.5) return "C";
  if (quality >= 0.3) return "D";
  return "F";
}

export function buildBike(scores: PartScores): Bike {
  const quality = PARTS.reduce((sum, p) => sum + clamp01(scores[p]), 0) / PARTS.length;
  return {
    scores,
    stats: deriveStats(scores),
    quality,
    grade: gradeFor(quality),
    builtAt: Date.now(),
  };
}

export function verdict(score: number): string {
  if (score >= 0.95) return "Perfect!";
  if (score >= 0.8) return "Solid";
  if (score >= 0.6) return "Okay-ish";
  if (score >= 0.35) return "Wobbly";
  if (score >= HANDLEBAR_SWAP_THRESHOLD) return "Yikes";
  return "Disaster";
}
