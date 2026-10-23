import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/demonology-closed-feedback-evidence.json";
import {
  readDemonologyClosedFeedbackEvidence,
  type DemonologyFeedbackEvidenceOptions,
} from "./forever-simulator-demonology-feedback-evidence";

type EvidenceFixture = typeof fixture.evidence;

function read(
  raw: unknown = fixture.evidence,
  options: DemonologyFeedbackEvidenceOptions = fixture.options,
): ReturnType<typeof readDemonologyClosedFeedbackEvidence> {
  return readDemonologyClosedFeedbackEvidence(raw, options);
}

function rebind(raw: unknown): DemonologyFeedbackEvidenceOptions {
  const sha256 = createHash("sha256").update(JSON.stringify(raw)).digest("hex");
  return {
    ...fixture.options,
    summaryReference: {
      path: `artifacts/forever-simulator/optimization/warlock-demonology-full-raid-v1/feedback-evidence-${sha256.slice(0, 16)}.json`,
      sha256,
    },
  };
}

describe("actual compact Demonology closure evidence", (): void => {
  it("binds the genuine closed research snapshot without loading the full trace or granting numerical qualification", (): void => {
    const evidence = read();
    expect(Buffer.byteLength(JSON.stringify(fixture.evidence))).toBe(2125);
    expect(evidence.closed).toBe(true);
    expect(evidence.cycles).toBe(1);
    expect(evidence.sourceResult.sha256).toBe(
      "479cafd568bb22b0aea072581d82f78759c6efc354a207cd5ce2306d50ef478f",
    );
    expect(evidence.independentFinalValidation).toBe(false);
    expect(evidence.numericalQualification).toBe(false);
    expect(evidence).not.toHaveProperty("referenceDps");
    expect(evidence).not.toHaveProperty("selectedDps");
  });

  it("rejects altered evidence against its original reviewed reference", (): void => {
    const changed = structuredClone(fixture.evidence);
    changed.scope += " changed";
    expect(() => read(changed)).toThrow(/checksum/);
  });

  it("does not accept false closure or relabel it as qualification even when a caller reflects a new checksum", (): void => {
    const mutations: Array<(value: EvidenceFixture) => void> = [
      (value): void => {
        value.closed = false;
      },
      (value): void => {
        value.gearApplicabilityRequired = true;
      },
      (value): void => {
        value.independentFinalValidation = true;
      },
      (value): void => {
        value.numericalQualification = true;
      },
      (value): void => {
        value.previousModelNumericalReuse = true;
      },
      (value): void => {
        value.cycles = 0;
      },
      (value): void => {
        value.cycles = 4;
      },
      (value): void => {
        value.finalCycle.gearStoppedForSmallGain = false;
      },
      (value): void => {
        value.finalCycle.stateChanged = true;
      },
      (value): void => {
        value.finalCycle.stateMaterialChange = true;
      },
      (value): void => {
        value.finalCycle.finalConsumesChanged = true;
      },
      (value): void => {
        value.finalCycle.finalConsumesStoppedForSmallGain = false;
      },
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(fixture.evidence);
      mutate(changed);
      expect(() => read(changed, rebind(changed))).toThrow();
    }
  });

  it("rejects a different backend, release, settings, state or gear against independently expected inputs", (): void => {
    const mutations: Array<(value: EvidenceFixture) => void> = [
      (value): void => {
        value.sourceRelease = "0".repeat(24);
      },
      (value): void => {
        value.backend.binarySha256 = "0".repeat(64);
      },
      (value): void => {
        value.backend.compiledDatabaseSha256 = "0".repeat(64);
      },
      (value): void => {
        value.backend.runnerSourceSha256 = "0".repeat(64);
      },
      (value): void => {
        value.backend.codecSha256 = "0".repeat(64);
      },
      (value): void => {
        value.settingsSha256 = "0".repeat(64);
      },
      (value): void => {
        value.stateSha256 = "0".repeat(64);
      },
      (value): void => {
        value.gearSha256 = "0".repeat(64);
      },
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(fixture.evidence);
      mutate(changed);
      expect(() => read(changed, rebind(changed))).toThrow(/model|inputs/);
    }
  });

  it("keeps canonical completion and result references linked even if both supplied options are changed", (): void => {
    const changed = structuredClone(fixture.evidence);
    changed.sourceResult.sha256 = "0".repeat(64);
    changed.sourceResult.path = changed.sourceResult.path.replace(
      /result-[a-f0-9]{16}/,
      "result-" + "0".repeat(16),
    );
    const options = { ...rebind(changed), sourceResult: changed.sourceResult };
    expect(() => read(changed, options)).toThrow(/references differ/);
  });

  it("rejects stale final-gear or consume hashes", (): void => {
    for (const field of ["recheckSettingsSha256", "finalConsumeSettingsSha256"] as const) {
      const changed = structuredClone(fixture.evidence);
      changed.finalCycle[field] = "0".repeat(64);
      expect(() => read(changed, rebind(changed))).toThrow(/stale/);
    }
  });

  it("rejects noncanonical reference paths and unknown metadata instead of widening trust", (): void => {
    expect(() =>
      read(fixture.evidence, {
        ...fixture.options,
        summaryReference: { ...fixture.options.summaryReference, path: "../../feedback.json" },
      }),
    ).toThrow(/Unexpected/);
    for (const changed of [
      { ...fixture.evidence, selectedDps: 9999 },
      { ...fixture.evidence, backend: { ...fixture.evidence.backend, unreviewed: true } },
      {
        ...fixture.evidence,
        sourceCompletion: { ...fixture.evidence.sourceCompletion, path: "/tmp/completed.json" },
      },
    ])
      expect(() => read(changed, rebind(changed))).toThrow();
  });
});
