import { describe, expect, it } from "vitest";
import { buildBike, CRASH_DAMAGE, damageBike, isWrecked, PARTS, type PartScores } from "./bike";

const uniform = (v: number) => Object.fromEntries(PARTS.map((p) => [p, v])) as PartScores;

describe("crash damage", () => {
  it("lowers exactly one part", () => {
    const bike = buildBike(uniform(0.9));
    const d = damageBike(bike, () => 0);
    expect(d.part).toBe(PARTS[0]);
    expect(d.after).toBeCloseTo(0.9 - CRASH_DAMAGE);
    expect(PARTS.filter((p) => d.bike.scores[p] !== 0.9)).toEqual([PARTS[0]]);
    expect(d.bike.quality).toBeLessThan(bike.quality);
  });

  it("only picks parts that still have something to lose", () => {
    const bike = buildBike({ ...uniform(0), chain: 0.1 });
    const d = damageBike(bike, () => 0.99);
    expect(d.part).toBe("chain");
    expect(d.after).toBe(0);
    expect(isWrecked(d.bike)).toBe(true);
  });

  it("wrecks a perfect bike eventually", () => {
    let bike = buildBike(uniform(1));
    let crashes = 0;
    while (!isWrecked(bike)) {
      bike = damageBike(bike).bike;
      crashes++;
    }
    expect(crashes).toBe(PARTS.length * Math.ceil(1 / CRASH_DAMAGE));
    expect(damageBike(bike).part).toBeNull();
  });
});
