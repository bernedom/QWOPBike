/**
 * Race simulation (planck.js / Box2D). No DOM in here so it can be unit-tested
 * and driven by a bot for tuning.
 *
 * Coordinates: metres, y up, bike rides to the right (+x).
 */
import {
  BoxShape,
  ChainShape,
  CircleShape,
  PolygonShape,
  WheelJoint,
  World,
  type Body,
  type Contact,
} from "planck";
import type { BikeStats } from "../bike";
import { buildTrack, type Track } from "./track";

export interface RaceInput {
  /** Q */
  throttle: boolean;
  /** W */
  brake: boolean;
  /** O */
  leanBack: boolean;
  /** P */
  leanForward: boolean;
}

export const NO_INPUT: RaceInput = {
  throttle: false,
  brake: false,
  leanBack: false,
  leanForward: false,
};

export type RaceStatus = "racing" | "crashed" | "finished";
export type CrashReason = "head" | "flipped" | "fell";

export const DT = 1 / 60;
export const WHEEL_RADIUS = 0.38;
const WHEEL_BASE = 1.5;

const BRAKE_TORQUE = 14;
const COAST_TORQUE = 0.25;
const FLIP_ANGLE = 2.1; // ~120°
const FLIP_TIME = 0.35;

type Tag = "ground" | "frame" | "rider" | "wheel";

/** Small deterministic PRNG so tests are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const normAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class RaceSim {
  readonly track: Track;
  readonly stats: BikeStats;
  readonly world: World;
  readonly chassis: Body;
  readonly rearWheel: Body;
  readonly frontWheel: Body;
  private readonly rearJoint: WheelJoint;
  private readonly frontJoint: WheelJoint;
  private readonly rng: () => number;

  status: RaceStatus = "racing";
  crashReason: CrashReason | null = null;
  time = 0;
  /** Smoothed throttle 0..1 actually reaching the wheel. */
  throttle = 0;
  /** Effective lean after delay/swap: -1 forward, 0, +1 back. */
  lean = 0;
  sputtering = false;

  private sputterLeft = 0;
  private flipTime = 0;
  private wobblePhase = 0;
  private leanBuffer: number[];
  private riderHit = false;

  constructor(stats: BikeStats, opts: { track?: Track; rng?: () => number } = {}) {
    this.stats = stats;
    this.track = opts.track ?? buildTrack();
    this.rng = opts.rng ?? Math.random;
    const delaySteps = Math.round(stats.inputDelayMs / 1000 / DT);
    this.leanBuffer = new Array(delaySteps).fill(0);

    this.world = new World({ gravity: { x: 0, y: -10 } });

    // Ground
    const ground = this.world.createBody();
    ground.createFixture({
      shape: new ChainShape(this.track.points, false),
      friction: 1,
      userData: "ground" satisfies Tag,
    });

    // Bike
    const x0 = this.track.startX;
    const axleY = WHEEL_RADIUS + 0.02;
    const chassisPos = { x: x0, y: axleY + 0.45 };
    this.chassis = this.world.createDynamicBody({ position: chassisPos, angularDamping: 0.4 });
    // Frame: a low trapezoid between the wheels.
    this.chassis.createFixture({
      shape: new PolygonShape([
        { x: -0.75, y: -0.12 },
        { x: 0.55, y: -0.18 },
        { x: 0.8, y: 0.28 },
        { x: -0.55, y: 0.22 },
      ]),
      density: 2.2,
      friction: 0.6,
      userData: "frame" satisfies Tag,
    });
    // Rider torso + head: sensors that end the run when they touch the ground.
    // They still add mass, which puts the centre of mass up high (= tippy).
    this.chassis.createFixture({
      shape: new BoxShape(0.13, 0.32, { x: -0.12, y: 0.62 }, -0.25),
      density: 2.5,
      isSensor: true,
      userData: "rider" satisfies Tag,
    });
    this.chassis.createFixture({
      shape: new CircleShape({ x: 0.02, y: 1.08 }, 0.17),
      density: 2.5,
      isSensor: true,
      userData: "rider" satisfies Tag,
    });

    const makeWheel = (x: number) => {
      const w = this.world.createDynamicBody({ position: { x, y: axleY } });
      w.createFixture({
        shape: new CircleShape(WHEEL_RADIUS),
        density: 1.2,
        friction: stats.grip,
        restitution: 0.05,
        userData: "wheel" satisfies Tag,
      });
      return w;
    };
    this.rearWheel = makeWheel(x0 - WHEEL_BASE / 2);
    this.frontWheel = makeWheel(x0 + WHEEL_BASE / 2);

    const suspension = {
      frequencyHz: stats.springHz,
      dampingRatio: stats.springDamping,
    };
    this.rearJoint = this.world.createJoint(
      new WheelJoint(
        { ...suspension, enableMotor: true, maxMotorTorque: COAST_TORQUE, motorSpeed: 0 },
        this.chassis,
        this.rearWheel,
        this.rearWheel.getPosition(),
        { x: 0, y: 1 },
      ),
    )!;
    // Front fork is raked slightly.
    const rake = { x: -0.3, y: 1 };
    const len = Math.hypot(rake.x, rake.y);
    this.frontJoint = this.world.createJoint(
      new WheelJoint(
        { ...suspension, enableMotor: false, maxMotorTorque: BRAKE_TORQUE, motorSpeed: 0 },
        this.chassis,
        this.frontWheel,
        this.frontWheel.getPosition(),
        { x: rake.x / len, y: rake.y / len },
      ),
    )!;

    this.world.on("begin-contact", (c: Contact) => this.onContact(c));
  }

  private onContact(c: Contact) {
    const a = c.getFixtureA().getUserData() as Tag;
    const b = c.getFixtureB().getUserData() as Tag;
    if ((a === "rider" && b === "ground") || (a === "ground" && b === "rider")) {
      this.riderHit = true;
    }
  }

  /** Distance travelled from the start line (m). */
  get distance(): number {
    return Math.max(0, this.chassis.getPosition().x - this.track.startX);
  }

  get trackLength(): number {
    return this.track.finishX - this.track.startX;
  }

  get speed(): number {
    return this.chassis.getLinearVelocity().length();
  }

  /** Chassis angle normalised to -π..π (0 = upright, + = nose up). */
  get angle(): number {
    return normAngle(this.chassis.getAngle());
  }

  step(input: RaceInput) {
    if (this.status !== "racing") {
      // Let the wreck tumble a little for drama, but no more control.
      this.rearJoint.setMaxMotorTorque(COAST_TORQUE);
      this.rearJoint.setMotorSpeed(0);
      this.world.step(DT, 8, 3);
      return;
    }
    const s = this.stats;
    this.time += DT;

    // --- Throttle with lag + sputter (chain quality) ---
    if (this.sputterLeft > 0) {
      this.sputterLeft -= DT;
    } else if (input.throttle && this.rng() < s.sputterRate * DT) {
      this.sputterLeft = 0.2 + this.rng() * 0.35;
    }
    this.sputtering = this.sputterLeft > 0;
    const target = input.throttle && !this.sputtering ? 1 : 0;
    this.throttle += (target - this.throttle) * (1 - Math.exp(-DT / s.throttleLag));

    // --- Brake / motor ---
    if (input.brake) {
      this.rearJoint.setMotorSpeed(0);
      this.rearJoint.setMaxMotorTorque(BRAKE_TORQUE);
      this.frontJoint.enableMotor(true);
    } else {
      this.frontJoint.enableMotor(false);
      if (this.throttle > 0.02) {
        // Clockwise wheel spin = forward, hence the minus sign.
        this.rearJoint.setMotorSpeed(-s.maxWheelSpeed);
        this.rearJoint.setMaxMotorTorque(s.motorTorque * this.throttle);
      } else {
        this.rearJoint.setMotorSpeed(0);
        this.rearJoint.setMaxMotorTorque(COAST_TORQUE);
      }
    }

    // --- Lean with input delay + possible swap (handlebar quality) ---
    let rawLean = (input.leanBack ? 1 : 0) - (input.leanForward ? 1 : 0);
    if (s.leanSwapped) rawLean = -rawLean;
    this.leanBuffer.push(rawLean);
    this.lean = this.leanBuffer.shift() ?? rawLean;
    if (this.lean !== 0) this.chassis.applyTorque(this.lean * s.leanTorque, true);

    // --- Wobble from out-of-true wheels (wheel quality) ---
    if (s.wobble > 0) {
      this.wobblePhase += Math.abs(this.rearWheel.getAngularVelocity()) * DT;
      const kick = Math.sin(this.wobblePhase * 1.3) + 0.5 * Math.sin(this.wobblePhase * 3.1);
      this.chassis.applyTorque(s.wobble * kick * 0.6, true);
    }

    this.world.step(DT, 8, 3);

    // --- Crash / finish checks ---
    if (this.riderHit) return this.crash("head");
    if (Math.abs(this.angle) > FLIP_ANGLE) {
      this.flipTime += DT;
      if (this.flipTime > FLIP_TIME) return this.crash("flipped");
    } else {
      this.flipTime = 0;
    }
    if (this.chassis.getPosition().y < -30) return this.crash("fell");
    if (this.chassis.getPosition().x >= this.track.finishX) this.status = "finished";
  }

  private crash(reason: CrashReason) {
    this.status = "crashed";
    this.crashReason = reason;
    this.throttle = 0;
    this.sputtering = false;
  }
}
