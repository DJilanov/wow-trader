import { describe, expect, it } from "vitest";
import fixture from "./fixtures/practical-subtlety-confirmation.json";
import { evaluatePracticalSimulatorConfirmation } from "./forever-simulator-practical-confirmation";

type Fixture = typeof fixture;

function firstRecord(value: Fixture): Fixture["records"][number] {
  const record = value.records[0];
  if (!record) throw new Error("Missing actual fixture record");
  return record;
}

function changeTalentDifference(value: Fixture, difference: number, oneRange = false): void {
  for (const row of value.records) {
    if (row.arm !== "talent-best" || (oneRange && row.seed !== value.plan.seeds[0])) continue;
    const selected = value.records.find(
      (candidate) => candidate.seed === row.seed && candidate.arm === "selected",
    );
    if (!selected) throw new Error("Missing actual selected range");
    row.metric.dps = selected.metric.dps + difference;
  }
}

describe("practical simulator confirmation math", () => {
  it("reproduces every actual Subtlety comparison,40k mean and acceptance without modifying the evidence", () => {
    const before = JSON.stringify(fixture);
    expect(evaluatePracticalSimulatorConfirmation(fixture.plan, fixture.records)).toEqual(
      fixture.expected,
    );
    expect(JSON.stringify(fixture)).toBe(before);
    expect(fixture.source.resultSha256).toBe(
      "0dd0f3624a4856f6eedb6e678df313f746815e37def26c11cacb3834b7744c6a",
    );
  });

  it("discloses a statistically better tiny contender while retaining the preselected incumbent", () => {
    const value = structuredClone(fixture);
    changeTalentDifference(value, 1);
    const result = evaluatePracticalSimulatorConfirmation(value.plan, value.records);
    expect(result.accepted).toBe(true);
    expect(result.strictRetainedDominancePassed).toBe(false);
    expect(result.status).toBe("accepted-with-disclosed-nearby-gains");
    expect(result.selectedArm).toBe("selected");
    expect(result.selectedDps).toBe(fixture.expected.selectedDps);
  });

  it("refuses a material gap without changing the incumbent or hiding an adverse range in the average", () => {
    const value = structuredClone(fixture);
    changeTalentDifference(value, 10, true);
    const result = evaluatePracticalSimulatorConfirmation(value.plan, value.records);
    expect(result.accepted).toBe(false);
    expect(result.status).toBe("material-challenger-or-uncertainty-needs-correction");
    expect(result.largestConservativeRetainedGapFraction).toBeGreaterThan(0.01);
    expect(
      result.comparisons.find((row) => row.arm === "talent-best")?.averageChallengerDpsDifference,
    ).toBeLessThan(result.selectedDps * 0.01);
    expect(result.selectedDps).toBe(fixture.expected.selectedDps);
  });

  it("refuses excessive uncertainty instead of treating an inconclusive contender as a passing result", () => {
    const value = structuredClone(fixture);
    for (const row of value.records) if (row.arm === "talent-best") row.metric.stdev = 20000;
    expect(evaluatePracticalSimulatorConfirmation(value.plan, value.records).accepted).toBe(false);
  });

  it("rejects changed precision/policy, missing/reordered/duplicate records and invalid metric identities", () => {
    const changes: readonly ((value: Fixture) => void)[] = [
      (value) => {
        value.plan.policy.iterations = 100000;
      },
      (value) => {
        value.plan.policy.standardErrorMultiplier = 0;
      },
      (value) => {
        Object.assign(value.plan.policy, { legacyPrecision: true });
      },
      (value) => {
        firstRecord(value).metric.iterations = 100000;
      },
      (value) => {
        value.records.pop();
      },
      (value) => {
        value.records.reverse();
      },
      (value) => {
        value.plan.arms.reverse();
      },
      (value) => {
        firstRecord(value).metric.id = "0".repeat(64);
      },
      (value) => {
        firstRecord(value).seed++;
      },
      (value) => {
        value.plan.requestIds.fill("0".repeat(64));
      },
      (value) => {
        firstRecord(value).metric.dps = 0;
      },
      (value) => {
        firstRecord(value).metric.stdev = Number.POSITIVE_INFINITY;
      },
      (value) => {
        firstRecord(value).metric.dps = Number.NaN;
      },
    ];
    for (const change of changes) {
      const value = structuredClone(fixture);
      change(value);
      expect(() => evaluatePracticalSimulatorConfirmation(value.plan, value.records)).toThrow();
    }
  });

  it("rejects overlapping or unsafe RNG ranges, including a claimed fresh range in an inspected arena", () => {
    for (const seed of [1337, Number.MAX_SAFE_INTEGER, -1, 1.5]) {
      const value = structuredClone(fixture);
      value.plan.seeds[0] = seed;
      expect(() => evaluatePracticalSimulatorConfirmation(value.plan, value.records)).toThrow(
        /RNG/,
      );
    }
    const value = structuredClone(fixture),
      firstSeed = value.plan.seeds[0];
    if (firstSeed === undefined) throw new Error("Missing actual seed");
    value.plan.seeds[1] = firstSeed;
    expect(() => evaluatePracticalSimulatorConfirmation(value.plan, value.records)).toThrow(/RNG/);
  });

  it("does not manufacture source authentication, publication approval or global-optimality claims", () => {
    const result = evaluatePracticalSimulatorConfirmation(fixture.plan, fixture.records);
    expect(result).not.toHaveProperty("independentFinalValidation");
    expect(result).not.toHaveProperty("publicationAllowed");
    expect(result).not.toHaveProperty("globalOptimalityProven");
  });

  it("rejects finite inputs whose derived errors, relative gaps or means overflow", () => {
    const changes: readonly ((value: Fixture) => void)[] = [
      (value) => {
        firstRecord(value).metric.dps = Number.MIN_VALUE;
      },
      (value) => {
        for (const row of value.records) row.metric.dps = Number.MAX_VALUE;
      },
      (value) => {
        for (const row of value.records) {
          if (row.arm === "selected") row.metric.dps = 1;
          if (row.arm === "talent-best") row.metric.dps = 1e308;
        }
      },
      (value) => {
        for (const row of value.records) row.metric.stdev = Number.MAX_VALUE;
      },
    ];
    for (const change of changes) {
      const value = structuredClone(fixture);
      change(value);
      expect(() => evaluatePracticalSimulatorConfirmation(value.plan, value.records)).toThrow(
        /arithmetic|relative|mean/,
      );
    }
  });
});
