import { describe, expect, it } from "vitest";
import fixture from "./fixtures/historical-marksmanship-confirmation.json";
import {
  evaluateApprovedSimulatorConfirmation,
  type ApprovedSimulatorConfirmationPlan,
} from "./forever-simulator-approved-confirmation";

function plan(): ApprovedSimulatorConfirmationPlan {
  return {
    schema: "kfc-approved-first-pass-frozen-confirmation.v1",
    approvalPolicy: {
      schema: "kfc-owner-approved-first-pass-margin.v1",
      maximumRetainedGapFraction: 0.02,
      originalMaximumRetainedGapFraction: 0.01,
      selectionFromHoldoutsAllowed: false,
      scope:
        "Historical math control under the explicitly approved2% policy; not a corrected-model delivery.",
    },
    originalPlan: structuredClone(fixture.plan),
  };
}

describe("owner-approved practical confirmation math", () => {
  it("independently reproduces the actual historical1% failure while qualifying its unchanged math at2%", () => {
    const before = JSON.stringify(fixture);
    const result = evaluateApprovedSimulatorConfirmation(plan(), fixture.records);
    expect(result.originalAssessment).toEqual(fixture.expected);
    expect(result.originalAssessment.accepted).toBe(false);
    expect(result.originalAssessment.maximumRetainedGapFraction).toBe(0.01);
    expect(result.accepted).toBe(true);
    expect(result.maximumRetainedGapFraction).toBe(0.02);
    expect(result.selectedDps).toBe(849.0660376744213);
    expect(result.selectedIterations).toBe(40000);
    expect(result.selectedArm).toBe("selected");
    expect(result.selectionChanged).toBe(false);
    expect(result.globalOptimalityProven).toBe(false);
    expect(JSON.stringify(fixture)).toBe(before);
  });

  it("still refuses an excessive gain or uncertainty in either retained range", () => {
    for (const mode of ["gain", "uncertainty"]) {
      const records = structuredClone(fixture.records);
      const selected = records[0];
      const contender = records[1];
      if (!selected || !contender) throw new Error("Missing historical fixture ranges");
      if (mode === "gain") contender.metric.dps = selected.metric.dps * 1.03;
      else contender.metric.stdev = 20000;
      const result = evaluateApprovedSimulatorConfirmation(plan(), records);
      expect(result.accepted).toBe(false);
      expect(result.selectedDps).toBe(fixture.expected.selectedDps);
      expect(result.selectedArm).toBe("selected");
    }
  });

  it("refuses policy changes instead of weakening or rewriting the strict assessment", () => {
    const changes: readonly ((value: ApprovedSimulatorConfirmationPlan) => void)[] = [
      (value) => {
        Object.assign(value.approvalPolicy, { maximumRetainedGapFraction: 0.03 });
      },
      (value) => {
        Object.assign(value.approvalPolicy, { originalMaximumRetainedGapFraction: 0.02 });
      },
      (value) => {
        Object.assign(value.approvalPolicy, { selectionFromHoldoutsAllowed: true });
      },
      (value) => {
        Object.assign(value.approvalPolicy, { extraOverride: true });
      },
      (value) => {
        Object.assign(value.originalPlan.policy, { maximumRetainedGapFraction: 0.02 });
      },
    ];
    for (const change of changes) {
      const value = plan();
      change(value);
      expect(() => evaluateApprovedSimulatorConfirmation(value, fixture.records)).toThrow();
    }
  });

  it("preserves exact20k samples, the frozen incumbent, record identities and RNG independence", () => {
    for (const mode of ["precision", "identity", "order", "selected", "rng"]) {
      const value = plan();
      const records = structuredClone(fixture.records);
      const first = records[0];
      if (!first) throw new Error("Missing original control");
      if (mode === "precision") first.metric.iterations = 100000;
      if (mode === "identity") first.metric.id = "0".repeat(64);
      if (mode === "order") records.reverse();
      if (mode === "selected")
        Object.assign(value.originalPlan.arms[0] ?? {}, { category: "talent" });
      if (mode === "rng") Object.assign(value.originalPlan, { seeds: [77191, 77191] });
      expect(() => evaluateApprovedSimulatorConfirmation(value, records)).toThrow();
    }
  });
});
