import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { shamanHealingEffectsSchema } from "./shaman-healing-effects.js";
import {
  shamanHealingEquipmentEffects,
  type ShamanHealingEquippedItem,
} from "./shaman-healing-equipment-effects.js";

const bytes = readFileSync(
  new URL("./fixtures/shaman-equipment-effects.v1.json.gz", import.meta.url),
);
expect(createHash("sha256").update(bytes).digest("hex")).toBe(
  "5bcff528335244854bb95a5f234f037b4137cb93cfdfc59657b3a347742202f3",
);
const fixture = z
  .object({
    schema: z.literal("kfc-shaman-equipment-effects-fixture.v1"),
    modelIdentity: z.string().length(64),
    source: z.object({ path: z.string(), byteSha256: z.string().length(64) }),
    referenceFactory: z.object({ path: z.string(), byteSha256: z.string().length(64) }),
    catalog: z
      .array(z.object({ id: z.number().int().positive(), setId: z.number().int().nonnegative() }))
      .length(2025),
    cases: z
      .array(
        z.object({
          caseId: z.string(),
          talentsString: z.string(),
          equipment: z
            .array(
              z.object({
                id: z.number().int().nonnegative(),
                enchant: z.number().int().positive().optional(),
              }),
            )
            .length(17),
          expectedEffects: shamanHealingEffectsSchema,
        }),
      )
      .length(126),
    noNewSimulationsExecuted: z.literal(true),
  })
  .strict()
  .parse(JSON.parse(gunzipSync(bytes).toString("utf8")));
const catalog = new Map(fixture.catalog.map((item) => [item.id, item]));
const withRiptide = fixture.cases.find(
  (entry) => Number(entry.talentsString.split("-")[2]?.[15] ?? 0) > 0,
)!;
const withoutRiptide = fixture.cases.find(
  (entry) => Number(entry.talentsString.split("-")[2]?.[15] ?? 0) === 0,
)!;

function equipment(ids: readonly number[]): ShamanHealingEquippedItem[] {
  return Array.from({ length: 17 }, (_, slot) => ({ id: ids[slot] ?? 0 }));
}
function setItems(setId: number, count: number): number[] {
  const ids = fixture.catalog
    .filter((item) => item.setId === setId)
    .slice(0, count)
    .map((item) => item.id);
  expect(ids.length).toBe(count);
  return ids;
}

describe("Shaman equipped reference policies", () => {
  it("matches every distinct policy combination observed in 86,714 actual race-feedback jobs", () => {
    const bytes = readFileSync(
      new URL("./fixtures/shaman-equipment-effect-coverage.v1.json.gz", import.meta.url),
    );
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "92b41693a718a705af8c9999f51e0db48e40840b31e476790947c8a00b7d3afe",
    );
    const source = z
      .object({
        schema: z.literal("kfc-shaman-equipment-effect-coverage.v1"),
        modelIdentity: z.string().length(64),
        source: z.unknown(),
        journal: z.unknown(),
        actualRows: z.literal(86714),
        families: z.array(z.string()).length(11),
        unobservedPolicyFamilies: z.tuple([z.literal("healthRegen")]),
        catalog: z.array(z.object({ id: z.number(), setId: z.number() })),
        cases: z
          .array(
            z.object({
              sourceRequestKey: z.string().length(64),
              talentsString: z.string(),
              equipment: z
                .array(z.object({ id: z.number(), enchant: z.number().optional() }))
                .length(17),
              expectedEffects: shamanHealingEffectsSchema,
            }),
          )
          .length(40),
        noNewSimulationsExecuted: z.literal(true),
        numericalQualification: z.literal(false),
      })
      .strict()
      .parse(JSON.parse(gunzipSync(bytes).toString("utf8")));
    const items = new Map(source.catalog.map((item) => [item.id, item])),
      families = new Set<string>();
    for (const entry of source.cases) {
      const policies = shamanHealingEquipmentEffects(items, entry.equipment, entry.talentsString);
      expect(policies).toEqual(entry.expectedEffects);
      for (const key of Object.keys(policies)) families.add(key);
    }
    expect([...families].sort()).toEqual(source.families);
  });

  it("matches the real Go encoder for the six-piece regeneration family on its compatible profile", () => {
    const bytes = readFileSync(
      new URL("./fixtures/shaman-health-regen-codec.v1.json.gz", import.meta.url),
    );
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "1647fb2a04ed1d2fddc4d4495bb5640bba99d43d99261cf759adebeee9528fa6",
    );
    const source = z
      .object({
        schema: z.literal("kfc-shaman-health-regen-codec-fixture.v1"),
        modelIdentity: z.string().length(64),
        source: z.unknown(),
        codec: z.unknown(),
        catalog: z.array(z.object({ id: z.number(), setId: z.number() })),
        case: z.object({
          profileId: z.string(),
          race: z.number(),
          talentsString: z.string(),
          equipment: z
            .array(z.object({ id: z.number(), enchant: z.number().optional() }))
            .length(17),
          expectedEffects: shamanHealingEffectsSchema,
        }),
        actualGoEncoding: z.literal(true),
        newCombatJobs: z.literal(0),
        numericalQualification: z.literal(false),
      })
      .strict()
      .parse(JSON.parse(gunzipSync(bytes).toString("utf8")));
    expect(source.case.profileId).toBe("1-1-2");
    const effects = shamanHealingEquipmentEffects(
      new Map(source.catalog.map((item) => [item.id, item])),
      source.case.equipment,
      source.case.talentsString,
    );
    expect(effects).toEqual(source.case.expectedEffects);
    expect(effects.healthRegen?.tickTiming).toBe("two-second-ticks-reference");
  });

  it("matches the actual Go codec for all 126 independently confirmed builds", () => {
    expect(withRiptide).toBeDefined();
    expect(withoutRiptide).toBeDefined();
    for (const entry of fixture.cases) {
      const before = structuredClone(entry);
      const policies = shamanHealingEquipmentEffects(catalog, entry.equipment, entry.talentsString);
      expect(policies, entry.caseId).toEqual(entry.expectedEffects);
      expect(shamanHealingEffectsSchema.parse(policies)).toEqual(policies);
      expect(entry).toEqual(before);
    }
  });

  it("removes relic policies when their equipped item or required talent is removed", () => {
    expect(
      shamanHealingEquipmentEffects(catalog, equipment([22345]), withRiptide.talentsString).relic,
    ).toBeDefined();
    expect(
      shamanHealingEquipmentEffects(catalog, equipment([22345]), withoutRiptide.talentsString)
        .relic,
    ).toBeUndefined();
    expect(
      shamanHealingEquipmentEffects(catalog, equipment([272431]), withoutRiptide.talentsString)
        .relic,
    ).toBeDefined();
    expect(
      shamanHealingEquipmentEffects(catalog, equipment([]), withRiptide.talentsString),
    ).toEqual({});
  });

  it("uses owned set thresholds and keeps cast-set references explicit", () => {
    for (const [setId, threshold, key] of [
      [122, 3, "passiveDamage"],
      [81, 4, "passiveDamage"],
      [187, 5, "elements"],
      [519, 4, "fiveThunders"],
      [184, 6, "healthRegen"],
      [162, 4, "reactive"],
      [163, 6, "reactive"],
      [182, 4, "reactive"],
    ] as const) {
      expect(
        shamanHealingEquipmentEffects(
          catalog,
          equipment(setItems(setId, threshold - 1)),
          withRiptide.talentsString,
        )[key],
      ).toBeUndefined();
      const policies = shamanHealingEquipmentEffects(
        catalog,
        equipment(setItems(setId, threshold)),
        withRiptide.talentsString,
      );
      expect(policies[key]).toBeDefined();
      expect(shamanHealingEffectsSchema.parse(policies)).toEqual(policies);
    }
    for (const setId of [181, 182, 183, 185]) {
      expect(
        shamanHealingEquipmentEffects(
          catalog,
          equipment(setItems(setId, 4)),
          withRiptide.talentsString,
        ).castSets,
      ).toBeUndefined();
      const policies = shamanHealingEquipmentEffects(
        catalog,
        equipment(setItems(setId, 5)),
        withRiptide.talentsString,
      );
      expect(policies.castSets?.wildheartChance).toBe(setId === 185 ? "two-percent-reference" : "");
      expect(policies.castSets?.dreadmistCriticals).toBe(
        setId === 183 ? "noncritical-reference" : "",
      );
      expect(shamanHealingEffectsSchema.parse(policies)).toEqual(policies);
    }
  });

  it("rebuilds protective, utility, passive regeneration and legacy references from current gear", () => {
    const ids = [10030, 10721, 18638, 272437, 249473, 12930, 18471, 13968, 2816, 4262];
    const policies = shamanHealingEquipmentEffects(
      catalog,
      equipment(ids),
      withRiptide.talentsString,
    );
    expect(policies.protective).toMatchObject({
      admiralStamina: "disabled-reference",
      harmBelt: "no-overload-reference",
      selfReflection: "self-ineligible-reference",
      adaptiveEnemyInMelee: false,
      adaptiveOutcome: "noncritical-hit-reference",
    });
    expect(policies.legacy).toMatchObject({
      briarwoodSpellPower: 15,
      royalSealSpellPower: 18,
      eyeScriptReference: "captured-passive-unmodeled-script-reference",
    });
    expect(policies.utility?.headmasterIntellect).toBe("disabled-reference");
    expect(policies.heart?.dormantHeartProcChance).toBe(1);
    expect(policies.flatRegen?.tickTiming).toBe("two-second-ticks-reference");
    expect(shamanHealingEffectsSchema.parse(policies)).toEqual(policies);
    expect(
      shamanHealingEquipmentEffects(catalog, equipment([]), withRiptide.talentsString),
    ).toEqual({});
  });

  it("rejects unknown equipment and malformed input instead of retaining stale effects", () => {
    expect(() =>
      shamanHealingEquipmentEffects(catalog, equipment([999999999]), withRiptide.talentsString),
    ).toThrow();
    expect(() => shamanHealingEquipmentEffects(catalog, [], withRiptide.talentsString)).toThrow();
    expect(() => shamanHealingEquipmentEffects(catalog, equipment([]), "bad talents")).toThrow();
  });
});
