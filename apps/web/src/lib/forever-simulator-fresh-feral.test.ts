import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { feralSimulatorGuidanceText } from "./forever-simulator-feral-guidance";
import {
  readSimulatorModelFirstPassBuild,
  simulatorModelFirstPassEntrySchema,
  type ModelFirstPassReference,
  type SimulatorModelFirstPassEntry,
} from "./forever-simulator-model-first-pass";

const rawSaved: unknown = JSON.parse(
  gunzipSync(readFileSync(new URL("./fixtures/model-first-pass-feral.json.gz", import.meta.url)), {
    maxOutputLength: 34_000_000,
  }).toString("utf8"),
);
const saved = z
  .object({
    schema: z.literal("kfc-model-first-pass-reader-fixture.v1"),
    sourceRelease: z.string(),
    revision: z.string(),
    databaseSha256: z.string(),
    entry: simulatorModelFirstPassEntrySchema,
    documents: z.record(z.string(), z.unknown()),
  })
  .passthrough()
  .parse(rawSaved);
interface Fixture {
  sourceRelease: string;
  revision: string;
  databaseSha256: string;
  entry: SimulatorModelFirstPassEntry;
  documents: Record<string, unknown>;
}
function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected actual fixture object");
  return value as Record<string, unknown>;
}
function fixture(): Fixture {
  return structuredClone({
    sourceRelease: saved.sourceRelease,
    revision: saved.revision,
    databaseSha256: saved.databaseSha256,
    entry: saved.entry,
    documents: saved.documents,
  });
}
function read(value: Fixture): ReturnType<typeof readSimulatorModelFirstPassBuild> {
  return readSimulatorModelFirstPassBuild(value.entry, {
    sourceRelease: value.sourceRelease,
    revision: value.revision,
    databaseSha256: value.databaseSha256,
    reference: async (ref: ModelFirstPassReference): Promise<unknown> => {
      if (!Object.hasOwn(value.documents, ref.path))
        throw new Error("Missing genuine source: " + ref.path);
      return value.documents[ref.path];
    },
  });
}
function reseal(value: Fixture, change: (build: Record<string, unknown>) => void): void {
  const build = object(value.documents[value.entry.build.path]);
  change(build);
  const sha256 = hash(build);
  const path = value.entry.build.path.replace(
    /build-[a-f0-9]{16}\.json$/,
    `build-${sha256.slice(0, 16)}.json`,
  );
  value.documents[path] = build;
  value.entry.build = { path, sha256 };
}

describe("fresh Feral first-pass publication", () => {
  it("authenticates actual blue/gear/state/closing,40k confirmation, separate1%/2% math and exact10k native/browser parity without mutating evidence", async () => {
    expect(hash(rawSaved)).toBe("c3acf5a961078c7d9e8d46291ad39736470b9e56552b5885361a7da68d4acc7b");
    const value = fixture(),
      before = hash(value);
    const build = await read(value);
    expect(build.id).toBe("feral-cat-static");
    expect(build.referenceDps).toBe(653.382713936449);
    expect(build.validationIterations).toBe(40000);
    expect(build.approval.accepted).toBe(true);
    expect(object(build.approval.originalAssessment).accepted).toBe(true);
    expect(build.rotationGuidance.talents).toBe("8/33/10");
    expect(build.scope.largestConservativeRetainedGapFraction).toBe(0.009100038399172354);
    expect(build.enchants).toHaveLength(9);
    expect(hash(value)).toBe(before);
  });

  it("rejects another model/database/revision or altered public DPS/settings", async () => {
    for (const change of [
      (v: Fixture): void => {
        v.sourceRelease = "0".repeat(24);
      },
      (v: Fixture): void => {
        v.databaseSha256 = "0".repeat(64);
      },
      (v: Fixture): void => {
        v.revision = "another-engine";
      },
      (v: Fixture): void => {
        v.entry.referenceDps++;
      },
      (v: Fixture): void => {
        v.entry.settingsSha256 = "0".repeat(64);
      },
    ]) {
      const value = fixture();
      change(value);
      await expect(read(value)).rejects.toThrow();
    }
  });

  it("rejects missing, changed and duplicated actual Cat consume request frames", async () => {
    for (const mode of ["missing", "changed", "duplicate"]) {
      const value = fixture(),
        first = value.entry.requestTemplates[0];
      if (!first) throw new Error("Missing actual first frame");
      if (mode === "missing") value.entry.requestTemplates.pop();
      if (mode === "changed") first.requestBase64 += "AAAA";
      if (mode === "duplicate") value.entry.requestTemplates[1] = structuredClone(first);
      await expect(read(value)).rejects.toThrow(/wire|frame|template|inspected/i);
    }
  });

  it("rejects correctly resealed exports that contradict source state, guide, enchants, scope, precision or approval", async () => {
    for (const change of [
      (b: Record<string, unknown>): void => {
        object(b.scope).globalOptimalityProven = true;
      },
      (b: Record<string, unknown>): void => {
        b.validationIterations = 200000;
      },
      (b: Record<string, unknown>): void => {
        b.publicPromotion = true;
      },
      (b: Record<string, unknown>): void => {
        b.requiresProvisionalEnchantOptIn = true;
      },
      (b: Record<string, unknown>): void => {
        object(b.state).conjured = "tea";
      },
      (b: Record<string, unknown>): void => {
        object(b.rotationGuidance).instruction = "Invented rotation";
      },
      (b: Record<string, unknown>): void => {
        object(b.scope).closingFeedbackCompleted = false;
      },
      (b: Record<string, unknown>): void => {
        object(b.scope).closingGearSweeps = 4;
      },
      (b: Record<string, unknown>): void => {
        object(b.scope).gearApplicabilityRequired = true;
      },
      (b: Record<string, unknown>): void => {
        object(b.scope).numericalIterations = 6049800000;
      },
      (b: Record<string, unknown>): void => {
        object(b.scope).originalStrictAssessmentAccepted = false;
      },
      (b: Record<string, unknown>): void => {
        object(b.approval).accepted = false;
      },
      (b: Record<string, unknown>): void => {
        b.enchants = [];
      },
      (b: Record<string, unknown>): void => {
        b.schema = "kfc-model-first-pass-build.v1";
      },
    ]) {
      const value = fixture();
      reseal(value, change);
      await expect(read(value)).rejects.toThrow();
    }
  });

  it("requires all source completions and rejects malformed/traversing provenance", async () => {
    for (const role of ["blue", "gear", "state", "closing", "confirmation", "parity"]) {
      const value = fixture(),
        build = object(value.documents[value.entry.build.path]);
      const ref = object(object(build.evidence)[role]);
      delete value.documents[z.string().parse(ref.path)];
      await expect(read(value)).rejects.toThrow(/Missing genuine source/);
    }
    const value = fixture();
    value.entry.build.path = "optimization/../secrets.json";
    await expect(read(value)).rejects.toThrow();
  });

  it("cannot publish the Cat evidence as Hunter or substitute another class ID", async () => {
    const value = fixture();
    value.entry.profile = "hunter";
    await expect(read(value)).rejects.toThrow();
    const other = fixture();
    other.entry.id = "hunter-survival-static";
    await expect(read(other)).rejects.toThrow();
  });

  it("reconstructs every Cat instruction and rejects unsupported spells, hidden actions and malformed conditions", () => {
    const build = object(saved.documents[saved.entry.build.path]);
    const rotation = object(object(build.settings).player).rotation;
    const guide = object(build.rotationGuidance);
    const text = feralSimulatorGuidanceText(object(rotation), "rune");
    for (const key of ["priorities", "prepull", "instruction", "scenario", "caveats"] as const)
      expect(text[key]).toEqual(guide[key]);
    for (const action of [
      { castSpell: { spellId: { spellId: 9846 } } },
      { wait: { duration: { const: { val: "1s" } } } },
      {
        castSpell: { spellId: { spellId: 9830 } },
        condition: {
          cmp: { op: "OpUnknown", lhs: { currentEnergy: {} }, rhs: { const: { val: "55" } } },
        },
      },
      {
        castSpell: { spellId: { spellId: 9830 } },
        condition: {
          cmp: { op: "OpLe", lhs: { currentEnergy: {} }, rhs: { const: { val: "55s" } } },
        },
      },
      {
        castSpell: { spellId: { spellId: 9830 } },
        condition: {
          cmp: { op: "toString", lhs: { currentEnergy: {} }, rhs: { const: { val: "55" } } },
        },
      },
    ])
      expect(() =>
        feralSimulatorGuidanceText({ type: "TypeAPL", priorityList: [{ action }] }, "rune"),
      ).toThrow();
    expect(() =>
      feralSimulatorGuidanceText(
        {
          type: "TypeAPL",
          priorityList: [{ hide: true, action: { castSpell: { spellId: { spellId: 9830 } } } }],
        },
        "rune",
      ),
    ).toThrow();
  });

  it("covers supported Cat Form prepull instead of inventing a missing prepull or silently dropping unknown actions", () => {
    const build = object(saved.documents[saved.entry.build.path]);
    const rotation = structuredClone(object(object(build.settings).player).rotation);
    const value = object(rotation);
    expect(feralSimulatorGuidanceText(value, "rune").prepull).toEqual([]);
    value.prepullActions = [
      {
        action: { castSpell: { spellId: { spellId: 768 } } },
        doAtValue: { const: { val: "-1s" } },
      },
    ];
    expect(feralSimulatorGuidanceText(value, "rune").prepull).toEqual([
      "Enter Cat Form 1 second before the pull.",
    ]);
    value.prepullActions = [
      {
        action: { castSpell: { spellId: { spellId: 9830 } } },
        doAtValue: { const: { val: "-1s" } },
      },
    ];
    expect(() => feralSimulatorGuidanceText(value, "rune")).toThrow();
  });
});
