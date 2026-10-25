import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  druidHealerLibrarySchema,
  druidHealingJobSchema,
  druidHealingReplySchema,
  druidHealingScenarioSchema,
} from "./druid-healing-simulator.js";

const bytes = readFileSync(
  new URL("./fixtures/druid-healing-transport.v1.json.gz", import.meta.url),
);
expect(createHash("sha256").update(bytes).digest("hex")).toBe(
  "453b1313c156115c40784c253ba046354cfe376b4c8bd2fb05a9c01272b07366",
);
const fixture = z
  .object({
    schema: z.literal("kfc-druid-healing-transport-fixture.v1"),
    jobs: z.array(z.unknown()).length(378),
    replies: z.array(z.unknown()).length(378),
  })
  .parse(JSON.parse(gunzipSync(bytes).toString()));

describe("Druid healer transport schemas", () => {
  it("accepts every actual selected native/Chromium job and result across all 42 cases", () => {
    for (const [index, input] of fixture.jobs.entries()) {
      const job = druidHealingJobSchema.parse(input),
        reply = druidHealingReplySchema.parse(fixture.replies[index]);
      expect(reply.id).toBe(job.id);
      expect(reply.status).toBe("complete");
      if (reply.status === "complete") {
        expect(reply.result.survivalRate).toBe(1);
        expect(reply.result.deliveredIncomingDamageMean).toBe(
          reply.result.plannedIncomingPostMitigationDamage,
        );
      }
    }
  });

  it("rejects Priest envelopes, arbitrary policies and unreviewed caster damage", () => {
    const job = druidHealingJobSchema.parse(fixture.jobs[0]);
    expect(() => druidHealingJobSchema.parse({ ...job, schema: "kfc-healing-job.v1" })).toThrow();
    expect(() =>
      druidHealingJobSchema.parse({
        ...job,
        workload: { ...job.workload, allowCasterDamage: true },
      }),
    ).toThrow();
    expect(() =>
      druidHealingJobSchema.parse({
        ...job,
        workload: { ...job.workload, research: { ...job.workload.research, omenProcChance: 0.17 } },
      }),
    ).toThrow();
    expect(() =>
      druidHealingJobSchema.parse({
        ...job,
        workload: {
          ...job.workload,
          legacyItemsPolicy: { ...job.workload.legacyItemsPolicy, royalSealHealingPower: null },
        },
      }),
    ).toThrow();
    expect(() => druidHealingJobSchema.parse({ ...job, unexpected: true })).toThrow();
    expect(() =>
      druidHealingJobSchema.parse({
        ...job,
        workload: { ...job.workload, cooldowns: [{ itemId: 13444, spellId: 15604 }] },
      }),
    ).toThrow();
  });

  it("preserves healing-accounting and qualification boundaries", () => {
    const reply = druidHealingReplySchema.parse(fixture.replies[0]);
    expect(reply.status).toBe("complete");
    if (reply.status !== "complete") throw new Error("Captured complete result expected");
    expect(() =>
      druidHealingReplySchema.parse({
        ...reply,
        result: { ...reply.result, absorbedHps: reply.result.absorbedHps + 100 },
      }),
    ).toThrow();
    expect(() =>
      druidHealingReplySchema.parse({
        ...reply,
        result: { ...reply.result, classQualified: true },
      }),
    ).toThrow();
    expect(() =>
      druidHealingReplySchema.parse({ ...reply, result: { ...reply.result, metrics: {} } }),
    ).toThrow();
    expect(() =>
      druidHealingReplySchema.parse({ ...reply, result: { ...reply.result, rawHps: Number.NaN } }),
    ).toThrow();
  });

  it("requires labelled explicit scenarios with strict policy fields", () => {
    const { research, equipmentPolicy, itemEffectsPolicy, legacyItemsPolicy, healingPolicy } =
        druidHealingJobSchema.parse(fixture.jobs[0]).workload,
      scenario = {
        id: "reference",
        label: "Reference",
        description: "Captured current-equipment reference.",
        research,
        equipmentPolicy,
        itemEffectsPolicy,
        legacyItemsPolicy,
        healingPolicy,
      };
    expect(druidHealingScenarioSchema.parse(scenario)).toEqual(scenario);
    expect(() =>
      druidHealingScenarioSchema.parse({
        ...scenario,
        legacyItemsPolicy: { ...legacyItemsPolicy, extraHealing: 100 },
      }),
    ).toThrow();
    expect(() =>
      druidHealingScenarioSchema.parse({
        ...scenario,
        healingPolicy: { ...healingPolicy, SwiftmendSelection: "automatic" },
      }),
    ).toThrow();
  });
});

describe("Actual selected Druid delivery", () => {
  it("validates all thirty independently compared setups and the full selectable catalog", () => {
    const bytes = readFileSync(
      new URL("./fixtures/druid-healer-library.v1.json.gz", import.meta.url),
    );
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "ce0c37c15398ff2605bd72b7cd103a199dddef009e37a5d973d82f1c00f2c91c",
    );
    const library = druidHealerLibrarySchema.parse(JSON.parse(gunzipSync(bytes).toString()));
    expect(library.builds).toHaveLength(30);
    expect(library.items).toHaveLength(1534);
    expect(library.enchants).toHaveLength(97);
    expect(new Set(library.builds.map((build) => build.archetype)).size).toBe(3);
    expect(
      library.builds.every(
        (build) =>
          build.references.length === 4 &&
          build.references.every(
            (reference) => reference.iterations === 256 && reference.survivalRate === 1,
          ),
      ),
    ).toBe(true);
    const changed = globalThis.structuredClone(library);
    changed.builds[0]!.defaultPolicyId = "missing-policy";
    expect(() => druidHealerLibrarySchema.parse(changed)).toThrow();
    changed.builds[0]!.defaultPolicyId = library.builds[0]!.defaultPolicyId;
    changed.builds[0]!.fields.wildGrowth = 2;
    expect(() => druidHealerLibrarySchema.parse(changed)).toThrow();
  });
});
