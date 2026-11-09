import { describe, expect, it } from "vitest";
import { deriveStats, PARTS, type PartScores } from "../bike";
import { DT, mulberry32, NO_INPUT, RaceSim, type RaceInput } from "./sim";
import { groundY } from "./track";

const uniform = (v: number) => Object.fromEntries(PARTS.map((p) => [p, v])) as PartScores;

/** A simple "skilled player" bot: keep the bike parallel to the ground ahead. */
function bot(sim: RaceSim): RaceInput {
  const p = sim.chassis.getPosition();
  const look = 1.2;
  const slope = Math.atan2(groundY(sim.track, p.x + look) - groundY(sim.track, p.x - look), 2 * look);
  let err = sim.angle - slope;
  if (sim.stats.leanSwapped) err = -err; // the bot knows the handlebar is backwards
  return {
    throttle: err < 0.45 && sim.speed < 14,
    brake: false,
    leanForward: err > 0.1,
    leanBack: err < -0.15,
  };
}

function run(sim: RaceSim, ctrl: (s: RaceSim) => RaceInput, seconds: number) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps && sim.status === "racing"; i++) sim.step(ctrl(sim));
  return sim;
}

describe("RaceSim", () => {
  it("stays upright and still with no input", () => {
    const sim = run(new RaceSim(deriveStats(uniform(1))), () => NO_INPUT, 3);
    expect(sim.status).toBe("racing");
    expect(Math.abs(sim.angle)).toBeLessThan(0.1);
    expect(sim.distance).toBeLessThan(0.5);
  });

  it("drives forward on throttle", () => {
    const sim = run(new RaceSim(deriveStats(uniform(1))), () => ({ ...NO_INPUT, throttle: true }), 1);
    expect(sim.distance).toBeGreaterThan(1);
  });

  it("leaning back raises the nose", () => {
    const sim = run(new RaceSim(deriveStats(uniform(1))), () => ({ ...NO_INPUT, leanBack: true }), 0.5);
    expect(sim.angle).toBeGreaterThan(0.01);
  });

  it("flips over backwards with full throttle and lean back", () => {
    const sim = run(
      new RaceSim(deriveStats(uniform(1))),
      () => ({ ...NO_INPUT, throttle: true, leanBack: true }),
      10,
    );
    expect(sim.status).toBe("crashed");
  });

  it("a careful bot can finish the track on a perfect bike", () => {
    const sim = run(new RaceSim(deriveStats(uniform(1)), { rng: mulberry32(42) }), bot, 180);
    expect(sim.status).toBe("finished");
    expect(sim.time).toBeLessThan(60);
  });

  it("a backwards handlebar swaps the lean direction", () => {
    const stats = deriveStats({ ...uniform(1), handlebar: 0 });
    expect(stats.leanSwapped).toBe(true);
    const sim = new RaceSim(stats);
    const delay = Math.round(stats.inputDelayMs / 1000 / DT);
    run(sim, () => ({ ...NO_INPUT, leanBack: true }), (delay + 1) * DT);
    expect(sim.lean).toBe(-1);
  });
});
