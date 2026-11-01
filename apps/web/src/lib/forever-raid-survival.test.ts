import { describe, expect, it } from "vitest";
import { sampleTankSurvival } from "./forever-raid-survival";
import type { TankIncomingModel } from "./forever-raid-composition";

const model: TankIncomingModel = {
  health: 1_000,
  armor: 1_000,
  dtps: 250,
  rawDps: 250,
  swingSeconds: 2,
  outcomes: [{ kind: "normal", probability: 1, damage: 500 }],
};
const input = {
  model,
  rawBossDps: 250,
  healingHps: 0,
  healingIntervalSeconds: 2,
  durationSeconds: 10,
};

describe("bounded theoretical tank survival", () => {
  it("kills an unhealed tank after the required deterministic hits", () => {
    const result = sampleTankSurvival(input)!;
    expect(result.deaths).toBe(result.iterations);
    expect(result.probability).toBe(1);
    expect(result.lower95).toBeGreaterThan(0.99);
    expect(result.upper95).toBe(1);
  });
  it("models healing pulses capped at maximum health and never lets overhealing prevent a one-shot", () => {
    const healed = sampleTankSurvival({
      ...input,
      healingHps: 1_000,
      healingIntervalSeconds: 0.5,
    })!;
    expect(healed.deaths).toBe(0);
    expect(healed.upper95).toBeGreaterThan(0);
    expect(healed.upper95).toBeLessThan(0.002);
    const lethal = sampleTankSurvival({
      ...input,
      rawBossDps: 1_000,
      healingHps: 1_000_000,
      healingIntervalSeconds: 0.5,
    })!;
    expect(lethal.probability).toBe(1);
  });
  it("reproduces outcomes and is monotonic for increasing damage and healing with paired trial seeds", () => {
    const mixed = {
      ...input,
      model: {
        ...model,
        outcomes: [
          { kind: "avoided", probability: 0.5, damage: 0 },
          { kind: "crushing", probability: 0.5, damage: 700 },
        ],
      },
      healingHps: 250,
      healingIntervalSeconds: 5,
      durationSeconds: 30,
    };
    const result = sampleTankSurvival(mixed)!;
    expect(sampleTankSurvival(mixed)).toEqual(result);
    expect(result.probability).toBeGreaterThan(0);
    expect(result.probability).toBeLessThan(1);
    expect(sampleTankSurvival({ ...mixed, rawBossDps: 500 })!.probability).toBeGreaterThanOrEqual(
      result.probability,
    );
    expect(sampleTankSurvival({ ...mixed, healingHps: 1_000 })!.probability).toBeLessThanOrEqual(
      result.probability,
    );
    expect(result.lower95).toBeLessThanOrEqual(result.probability);
    expect(result.upper95).toBeGreaterThanOrEqual(result.probability);
  });
  it("returns no deaths at zero boss damage without claiming mathematical certainty from finite samples", () => {
    const result = sampleTankSurvival({ ...input, rawBossDps: 0 })!;
    expect(result.probability).toBe(0);
    expect(result.lower95).toBe(0);
    expect(result.upper95).toBeGreaterThan(0);
  });
  it.each([
    { durationSeconds: 0 },
    { durationSeconds: 3_601 },
    { healingIntervalSeconds: 0 },
    { healingHps: -1 },
    { rawBossDps: Number.NaN },
    { model: { ...model, outcomes: [{ kind: "normal", probability: 0.2, damage: 500 }] } },
    { model: { ...model, swingSeconds: 0.0001 } },
  ])("rejects unsupported/invalid inputs without an unbounded calculation: %j", (overrides) => {
    expect(sampleTankSurvival({ ...input, ...overrides })).toBeNull();
  });
  it("adapts the sample count to remain within the event budget on long supported fights", () => {
    const result = sampleTankSurvival({
      ...input,
      rawBossDps: 0,
      durationSeconds: 3_600,
      healingIntervalSeconds: 0.5,
    })!;
    expect(result.iterations).toBeGreaterThanOrEqual(128);
    expect(result.iterations).toBeLessThan(2048);
  });
});
