import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { balanceSimulatorGuidanceText } from "./forever-simulator-balance-guidance";
import {
  readSimulatorModelFirstPassBuild,
  simulatorModelFirstPassEntrySchema,
  type ModelFirstPassReference,
  type SimulatorModelFirstPassEntry,
} from "./forever-simulator-model-first-pass";

const rawSaved: unknown = JSON.parse(
  gunzipSync(
    readFileSync(new URL("./fixtures/model-first-pass-balance.json.gz", import.meta.url)),
    {
      maxOutputLength: 34_000_000,
    },
  ).toString("utf8"),
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

describe("fresh Balance first-pass publication", () => {
  it("authenticates actual blue/gear/state/closing,40k confirmation, separate1%/2% math and exact10k native/browser parity without mutating evidence", async () => {
    expect(hash(rawSaved)).toBe("0f587b0c662a321721f0db5b4e19f76d410fc5d431b6e17e1678732a9c29821f");
    const value = fixture(),
      before = hash(value);
    const build = await read(value);
    expect(build.id).toBe("balance-static");
    expect(build.referenceDps).toBe(573.6010225942198);
    expect(build.validationIterations).toBe(40000);
    expect(build.approval.accepted).toBe(true);
    expect(object(build.approval.originalAssessment).accepted).toBe(false);
    expect(build.rotationGuidance.talents).toBe("39/0/12");
    expect(build.scope.largestConservativeRetainedGapFraction).toBe(0.010059960456512257);
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

  it("rejects missing, changed and duplicated actual Moonkin consume request frames", async () => {
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
        object(b.scope).originalStrictAssessmentAccepted = true;
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

  it("cannot publish the Moonkin evidence as Hunter or substitute another class ID", async () => {
    const value = fixture();
    value.entry.profile = "hunter";
    await expect(read(value)).rejects.toThrow();
    const other = fixture();
    other.entry.id = "hunter-survival-static";
    await expect(read(other)).rejects.toThrow();
  });

  it("reconstructs every Moonkin instruction and rejects unsupported spells, hidden actions and malformed conditions", () => {
    const build = object(saved.documents[saved.entry.build.path]);
    const rotation = object(object(build.settings).player).rotation;
    const guide = object(build.rotationGuidance);
    const text = balanceSimulatorGuidanceText(object(rotation), true);
    for (const key of ["priorities", "prepull", "instruction", "scenario", "caveats"] as const)
      expect(text[key]).toEqual(guide[key]);
    for (const action of [
      { castSpell: { spellId: { spellId: 9846 } } },
      { wait: { duration: { const: { val: "1s" } } } },
      {
        castSpell: { spellId: { spellId: 9912 } },
        condition: {
          cmp: { op: "OpUnknown", lhs: { currentEnergy: {} }, rhs: { const: { val: "55" } } },
        },
      },
      {
        castSpell: { spellId: { spellId: 9912 } },
        condition: {
          cmp: { op: "OpLe", lhs: { currentEnergy: {} }, rhs: { const: { val: "55s" } } },
        },
      },
      {
        castSpell: { spellId: { spellId: 9912 } },
        condition: {
          cmp: { op: "toString", lhs: { currentEnergy: {} }, rhs: { const: { val: "55" } } },
        },
      },
    ])
      expect(() =>
        balanceSimulatorGuidanceText({ type: "TypeAPL", priorityList: [{ action }] }, true),
      ).toThrow();
    expect(() =>
      balanceSimulatorGuidanceText(
        {
          type: "TypeAPL",
          priorityList: [{ hide: true, action: { castSpell: { spellId: { spellId: 9912 } } } }],
        },
        true,
      ),
    ).toThrow();
  });

  it("keeps the measured Moonkin prepull empty and rejects unsupported form or spell prepull rather than silently dropping it", () => {
    const build = object(saved.documents[saved.entry.build.path]);
    const rotation = structuredClone(object(object(build.settings).player).rotation);
    const value = object(rotation);
    expect(balanceSimulatorGuidanceText(value, true).prepull).toEqual([]);
    for (const spellId of [24858, 9912]) {
      value.prepullActions = [
        { action: { castSpell: { spellId: { spellId } } }, doAtValue: { const: { val: "-1s" } } },
      ];
      expect(() => balanceSimulatorGuidanceText(value, true)).toThrow();
    }
  });
});
