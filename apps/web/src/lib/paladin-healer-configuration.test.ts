import { createHash } from "node:crypto";
import { deflateSync } from "fflate";
import { describe, expect, it } from "vitest";
import { configurationForPaladinHealerBuild } from "@wow-trader/forever-data/paladin-healer-workspace";
import {
  paladinGroupFixtures as groups,
  paladinIndexFixture as index,
  paladinPresentationFixture as presentation,
} from "./fixtures/paladin-healer-contract";
import {
  decodePaladinConfiguration,
  encodePaladinConfiguration,
  isOriginalPaladinConfiguration,
  paladinConfigurationProblem,
  paladinConfigurationStorageKey,
  paladinTalentsString,
} from "./paladin-healer-configuration";

const release = "a".repeat(24),
  group = groups[0]!;
const hash = (value: string): string => createHash("sha256").update(value).digest("hex");

describe("Personal Paladin configurations", () => {
  it("accepts all measured whole loadouts and preserves all 504 shared request/workload identities", () => {
    let count = 0;
    for (const payload of groups)
      for (const source of payload.configurations) {
        const config = configurationForPaladinHealerBuild(
          index,
          payload,
          release,
          source.scenarioId,
        );
        expect(
          paladinConfigurationProblem(index, payload, presentation, config, release),
        ).toBeNull();
        const shared = encodePaladinConfiguration(config);
        expect(shared.length).toBeLessThan(6000);
        const restored = decodePaladinConfiguration(shared);
        expect(JSON.stringify(restored)).toBe(JSON.stringify(config));
        expect(hash(JSON.stringify(restored.workload))).toBe(source.workloadId);
        expect(restored.sourceRequestBase64).toBe(source.job.requestBase64);
        count++;
      }
    expect(count).toBe(504);
  }, 90_000);

  it("removes the reference when any numerical personal setting changes, but retains it for iteration changes", () => {
    const config = configurationForPaladinHealerBuild(index, group, release);
    expect(isOriginalPaladinConfiguration(index, group, { ...config, iterations: 128 })).toBe(true);
    for (const change of ["gear", "fields", "consumes", "priorities", "cooldowns"] as const) {
      const custom = structuredClone(config);
      if (change === "gear") delete custom.gear[0]!.enchant;
      else if (change === "fields") custom.fields.divineIntellect = 0;
      else if (change === "consumes") custom.consumes.alcohol = (custom.consumes.alcohol + 1) % 6;
      else if (change === "priorities") custom.workload.priorities[0]!.minimumMissingHealth += 1;
      else custom.workload.cooldowns[0]!.minimumMissingMana = 2999;
      expect(isOriginalPaladinConfiguration(index, group, custom)).toBe(false);
    }
  });

  it("retains all Paladin-specific casting, consume and resource state through save/share", () => {
    const payload = groups.find((entry) => entry.group.archetype === "vigil-support")!;
    const config = configurationForPaladinHealerBuild(index, payload, release);
    Object.assign(config.workload.priorities[0]!, {
      minimumPartyTargets: 3,
      minimumPartyMissingHealth: 1500,
      maintainVigil: true,
      requireVigil: false,
    });
    config.workload.cooldowns[0]!.minimumMissingMana = 2200;
    config.consumes.manaRegenElixir = 2;
    config.consumes.alcohol = 5;
    const restored = decodePaladinConfiguration(encodePaladinConfiguration(config));
    expect(restored).toEqual(config);
    expect(restored.workload.priorities[0]!.minimumPartyTargets).toBe(3);
    expect(restored.sourceRequestBase64).toBe(config.sourceRequestBase64);
  });

  it("allows an equipped custom resource item and preserves its targeting thresholds", () => {
    const config = configurationForPaladinHealerBuild(index, group, release);
    config.gear[13] = { id: 18637 };
    config.workload.cooldowns.push({
      itemId: 18637,
      targetRaidIndex: 1,
      minimumMissingHealth: 1000,
      minimumMissingMana: 800,
      requireHealingDemand: true,
    });
    expect(paladinConfigurationProblem(index, group, presentation, config, release)).toBeNull();
    const restored = decodePaladinConfiguration(encodePaladinConfiguration(config));
    expect(restored.workload.cooldowns.at(-1)).toEqual(config.workload.cooldowns.at(-1));
    const invalid = structuredClone(config);
    invalid.workload.cooldowns.push({ spellId: 999999 });
    expect(paladinConfigurationProblem(index, group, presentation, invalid, release)).toMatch(
      /resource item/,
    );
  });

  it("rejects incompatible gear, talents, consumes and hidden model-policy changes", () => {
    const config = configurationForPaladinHealerBuild(index, group, release);
    const check = (candidate: typeof config): string | null =>
      paladinConfigurationProblem(index, group, presentation, candidate, release);
    expect(
      check({
        ...config,
        gear: config.gear.map((entry, slot) => (slot === 0 ? { id: 1 } : entry)),
      }),
    ).toMatch(/usable item/);
    expect(check({ ...config, fields: { ...config.fields, unknownTalent: 1 } })).toMatch(
      /another model/,
    );
    expect(check({ ...config, consumes: { ...config.consumes, manaRegenElixir: 1 } })).toMatch(
      /consumable/,
    );
    const policy = structuredClone(config);
    policy.workload.vigilRefundMode = "none";
    expect(check(policy)).toMatch(/mechanics scenario/);
    const template = structuredClone(config);
    template.sourceRequestBase64 = "YQ==";
    expect(check(template)).toMatch(/template/);
  });

  it("requires learned spells and restricts Vigil conditions and Divine Favor to their talents", () => {
    const config = configurationForPaladinHealerBuild(index, group, release);
    const unavailable = structuredClone(config);
    unavailable.workload.priorities[0]!.spellId = 999999;
    expect(paladinConfigurationProblem(index, group, presentation, unavailable, release)).toMatch(
      /not learned/,
    );
    const vigil = structuredClone(config);
    vigil.workload.priorities[0]!.requireVigil = true;
    expect(vigil.fields.lightsVigil ?? 0).toBe(0);
    expect(paladinConfigurationProblem(index, group, presentation, vigil, release)).toMatch(
      /Light's Vigil/,
    );
    const wrong = structuredClone(config);
    wrong.workload.priorities[0]!.maintainVigil = true;
    expect(paladinConfigurationProblem(index, group, presentation, wrong, release)).not.toBeNull();
  });

  it("keeps the three-tree codec and storage isolated from older healer saves", () => {
    const config = configurationForPaladinHealerBuild(index, group, release);
    expect(paladinTalentsString(presentation.talents, config.fields)).toBe(config.talentsString);
    expect(paladinTalentsString(presentation.talents, {})).toBe("--");
    expect(paladinConfigurationStorageKey(release)).toContain("healing-paladin:v3:");
    expect(paladinConfigurationStorageKey(release)).not.toBe(
      paladinConfigurationStorageKey("b".repeat(24)),
    );
  });

  it("bounds compressed and decoded untrusted links before parsing", () => {
    expect(() => decodePaladinConfiguration("?")).toThrow();
    expect(() => decodePaladinConfiguration("a".repeat(12001))).toThrow();
    const bomb = deflateSync(new Uint8Array(2_000_000).fill(97));
    const encoded = Buffer.from(bomb).toString("base64url");
    expect(() => decodePaladinConfiguration(encoded)).toThrow(/too large/);
    expect(() =>
      decodePaladinConfiguration(Buffer.from("invalid").toString("base64url")),
    ).toThrow();
  });
});
