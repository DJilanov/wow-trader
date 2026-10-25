import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { normalizeHealerLibrary, healerAssetPath } from "@wow-trader/forever-data/healer-workspace";
import { druidHealerLibrarySchema } from "@wow-trader/forever-data/druid-healing-simulator";
import { healerLibrarySchema } from "@wow-trader/forever-data/healing-simulator";
import {
  configurationForHealerBuild,
  decodeHealerConfiguration,
  encodeHealerConfiguration,
  healerConfigurationProblem,
  healerWorkloadForConfiguration,
  isOriginalHealerConfiguration,
} from "./healer-configuration";

const rawLibrary = healerLibrarySchema.parse(
  JSON.parse(
    gunzipSync(
      readFileSync(
        new URL(
          "../../../../packages/forever-data/src/fixtures/healer-library.v1.json.gz",
          import.meta.url,
        ),
      ),
    ).toString(),
  ),
);
const library = normalizeHealerLibrary(rawLibrary);
const build = library.builds[0]!;

describe("Healer workspace configuration", () => {
  it("activates the ring only on an upgraded Priest model and removes its use when unequipped", () => {
    for (const version of [undefined, 1, 2] as const) {
      const current = normalizeHealerLibrary({ ...rawLibrary, itemEffectsVersion: version });
      const config = configurationForHealerBuild(current, current.builds[0]!);
      config.gear[10] = { id: 13143 };
      expect(
        healerWorkloadForConfiguration(current, config).cooldowns.some(
          (use) => use.spellId === 17252,
        ),
      ).toBe(version === 2);
      config.gear[10] = { id: 0 };
      expect(
        healerWorkloadForConfiguration(current, config).cooldowns.some(
          (use) => use.spellId === 17252,
        ),
      ).toBe(false);
    }
  });

  it("keeps legacy engines unchanged and only activates owned uses on the upgraded model", () => {
    const legacy = configurationForHealerBuild(library, build);
    legacy.gear[12] = { id: 18371 };
    expect(healerWorkloadForConfiguration(library, legacy).itemEffectsPolicy).toBeUndefined();
    expect(
      healerWorkloadForConfiguration(library, legacy).cooldowns.some(
        (entry) => entry.spellId === 1302205,
      ),
    ).toBe(false);
    const current = normalizeHealerLibrary({ ...rawLibrary, itemEffectsVersion: 1 });
    const config = configurationForHealerBuild(current, current.builds[0]!);
    config.gear[12] = { id: 18371 };
    config.gear[13] = { id: 272439 };
    const frame = healerWorkloadForConfiguration(current, config);
    expect(frame.itemEffectsPolicy?.dormantHeartProcChance).toBe(1);
    expect(frame.cooldowns).toContainEqual({
      spellId: 1302205,
      minimumMissingMana: 1500,
      requireHealingDemand: true,
    });
    expect(frame.cooldowns).toContainEqual({ itemId: 272439, requireHealingDemand: true });
    config.gear[12] = { id: 18469 };
    config.gear[13] = { id: 18469 };
    expect(
      healerWorkloadForConfiguration(current, config).cooldowns.some(
        (entry) => entry.spellId === 1302205 || entry.itemId === 272439,
      ),
    ).toBe(false);
  });

  it("keeps the Heart-off scenario visible and sends zero probability to the real job", () => {
    const current = normalizeHealerLibrary({
      ...rawLibrary,
      itemEffectsVersion: 1,
      rankPolicies: [
        ...rawLibrary.rankPolicies,
        ...rawLibrary.rankPolicies.map((policy) => ({ ...policy, id: policy.id + "-heart-zero" })),
      ],
    });
    const config = configurationForHealerBuild(current, current.builds[0]!);
    config.policyId += "-heart-zero";
    const frame = healerWorkloadForConfiguration(current, config);
    expect(frame.itemEffectsPolicy?.dormantHeartProcChance).toBe(0);
    expect(current.rankPolicies.find((policy) => policy.id === config.policyId)?.label).toContain(
      "Heart off",
    );
  });

  it("starts with a complete actual preset and round-trips model-specific sharing", () => {
    const config = configurationForHealerBuild(library, build);
    expect(healerConfigurationProblem(library, config)).toBeNull();
    expect(isOriginalHealerConfiguration(library, config)).toBe(true);
    expect(decodeHealerConfiguration(encodeHealerConfiguration(config))).toEqual(config);
    expect(() => decodeHealerConfiguration("x".repeat(24001))).toThrow();
    config.modelIdentity = "f".repeat(64);
    expect(healerConfigurationProblem(library, config)).toContain("another engine");
  });
  it("rebuilds owned cooldowns after race, gear and consumable changes", () => {
    const config = configurationForHealerBuild(library, build);
    expect(healerWorkloadForConfiguration(library, config).cooldowns).toContainEqual({
      spellId: 20554,
      requireHealingDemand: true,
    });
    config.race = library.races.find((race) => race.name === "Human")!.id;
    config.gear = config.gear.map((item) => (item.id === 11819 ? { id: 18469 } : item));
    const cooldowns = healerWorkloadForConfiguration(library, config).cooldowns;
    expect(
      cooldowns.some(
        (entry) => entry.spellId === 20554 || entry.spellId === 15604 || entry.itemId === 12662,
      ),
    ).toBe(false);
    config.consumes.defaultConjured = 2;
    expect(
      healerWorkloadForConfiguration(library, config).cooldowns.some(
        (entry) => entry.itemId === 12662,
      ),
    ).toBe(true);
  });
  it("allows incomplete talent edits but blocks simulation and unlearned spells", () => {
    const config = configurationForHealerBuild(library, build);
    config.fields = {};
    config.priorities = [
      { spellId: 10965, raidIndex: 1, minimumMissingHealth: 400, keepHot: false },
    ];
    expect(healerConfigurationProblem(library, config, false)).toBeNull();
    expect(healerConfigurationProblem(library, config)).toContain("51");
    config.priorities[0]!.spellId = library.spells.find((spell) => spell.requiredTalentField)!.id;
    expect(healerConfigurationProblem(library, config, false)).toContain("not learned");
  });
  it("does not show the preset reference for modified gear or casting priorities", () => {
    const config = configurationForHealerBuild(library, build);
    config.iterations = 128;
    expect(isOriginalHealerConfiguration(library, config)).toBe(true);
    config.priorities[0]!.minimumMissingHealth += 1;
    expect(isOriginalHealerConfiguration(library, config)).toBe(false);
  });
  it("migrates existing Priest shares and keeps class and model identity checks", () => {
    const legacy = {
      version: 1,
      modelIdentity: rawLibrary.modelIdentity,
      buildId: rawLibrary.builds[0]!.id,
      gear: rawLibrary.builds[0]!.gear,
      fields: rawLibrary.builds[0]!.fields,
      race: library.defaultRaceId,
      consumes: rawLibrary.builds[0]!.consumes,
      priorities: rawLibrary.builds[0]!.workload.priorities,
      policyId: rawLibrary.builds[0]!.workload.rankScaling.id,
      iterations: 512,
    };
    const migrated = decodeHealerConfiguration(
      btoa(JSON.stringify(legacy)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""),
    );
    expect(migrated).toEqual(configurationForHealerBuild(library, build));
    migrated.profile = "healing-druid";
    expect(healerConfigurationProblem(library, migrated)).toContain("another healing class");
    expect(isOriginalHealerConfiguration(library, migrated)).toBe(false);
    expect(() => healerWorkloadForConfiguration(library, migrated)).toThrow();
  });
  it("preserves the default casting plan and blocks unreviewed consumes", () => {
    const config = configurationForHealerBuild(library, build);
    expect(healerWorkloadForConfiguration(library, config)).toEqual(build.workload);
    config.consumes.alcohol = 1;
    expect(healerConfigurationProblem(library, config)).toContain("outside this Priest");
    config.consumes.alcohol = 0;
    config.priorities = [
      { spellId: 10965, raidIndex: 1, minimumMissingHealth: 400, keepHot: true },
    ];
    expect(healerConfigurationProblem(library, config)).toContain("heal over time");
  });
  it("namespaces assets by healing class without changing existing Priest URLs", () => {
    const release = "a".repeat(24);
    expect(healerAssetPath("healing-priest", release, "healing.wasm")).toBe(
      `/healing-sim/${release}/healing.wasm`,
    );
    expect(healerAssetPath("healing-druid", release, "healing.wasm")).toBe(
      `/healing-sim/classes/healing-druid/${release}/healing.wasm`,
    );
    expect(() => healerAssetPath("healing-druid", release, "../healing.wasm")).toThrow();
    expect(() => healerAssetPath("healing-druid", "../active", "library.json")).toThrow();
  });
});

describe("Selected Druid workspace configurations", () => {
  const druid = normalizeHealerLibrary(
    druidHealerLibrarySchema.parse(
      JSON.parse(
        gunzipSync(
          readFileSync(
            new URL(
              "../../../../packages/forever-data/src/fixtures/druid-healer-library.v1.json.gz",
              import.meta.url,
            ),
          ),
        ).toString(),
      ),
    ),
  );
  it("preserves every actual default workload, gear, talent and scenario without changing saved calculations", () => {
    for (const build of druid.builds) {
      const config = configurationForHealerBuild(druid, build);
      expect(healerConfigurationProblem(druid, config)).toBeNull();
      expect(healerWorkloadForConfiguration(druid, config)).toEqual(build.workload);
      expect(decodeHealerConfiguration(encodeHealerConfiguration(config))).toEqual(config);
      expect(isOriginalHealerConfiguration(druid, config)).toBe(true);
    }
  });
  it("labels uncertain historical item bases without changing simulation inputs", () => {
    for (const id of [18470, 12930]) {
      const item = druid.items.find((item) => item.id === id)!;
      expect(item.sourceLabel).toContain("current base unverified");
      expect(item.effectLines.join(" ")).toContain("selected scenario");
    }
  });
  it("rebuilds owned Druid item cooldowns and talents after custom edits", () => {
    const config = configurationForHealerBuild(
      druid,
      druid.builds.find((build) => build.id === druid.defaultBuildId)!,
    );
    config.gear = config.gear.map((item) =>
      [11819, 18371, 272439, 13143].includes(item.id) ? { id: 0 } : item,
    );
    config.fields.naturesSwiftness = 0;
    const workload = healerWorkloadForConfiguration(druid, config);
    expect(workload.schema).toBe("kfc-druid-healing-workload.v1");
    expect(workload.cooldowns).toEqual([
      { itemId: 13444, minimumMissingMana: 3000, requireHealingDemand: true },
    ]);
    if (workload.schema !== "kfc-druid-healing-workload.v1")
      throw new Error("Expected Druid workload");
    expect(workload.useNaturesSwiftness).toBe(false);
    config.consumes.defaultConjured = 2;
    expect(healerWorkloadForConfiguration(druid, config).cooldowns.at(-1)?.itemId).toBe(12662);
    config.policyId = "forest";
    const forest = healerWorkloadForConfiguration(druid, config);
    if (forest.schema !== "kfc-druid-healing-workload.v1")
      throw new Error("Expected Druid workload");
    expect(forest.legacyItemsPolicy.royalSealForestSpirit).toBe(true);
    expect(forest.research.id).toBe("combined-mana-stress");
  });
  it("enables only supported owned coupled item uses and follows the critical scenario", () => {
    const reviewed = { ...druid, supportedItemUses: ["major-recombobulator"] as const };
    const build = reviewed.builds.find((entry) => entry.id === reviewed.defaultBuildId)!;
    const config = configurationForHealerBuild(reviewed, build);
    config.gear[12] = { id: 18637 };
    const legacy = healerWorkloadForConfiguration(druid, config);
    if (legacy.schema !== "kfc-druid-healing-workload.v1") throw new Error("Druid expected");
    expect(legacy.utilityProbe).toBeUndefined();
    const active = healerWorkloadForConfiguration(reviewed, config);
    if (active.schema !== "kfc-druid-healing-workload.v1") throw new Error("Druid expected");
    expect(active.utilityProbe?.mode).toBe("recombobulator-timed-use");
    expect(active.utilityProbe?.recombobulatorCanCrit).toBe(false);
    expect(active.utilityProbe?.recombobulatorHealingCoefficient).toBe(0);
    const criticalLibrary = {
      ...reviewed,
      rankPolicies: reviewed.rankPolicies.map((entry) =>
        entry.kind === "druid"
          ? { ...entry, policy: { ...entry.policy, itemCriticalHealing: true } }
          : entry,
      ),
    };
    const critical = healerWorkloadForConfiguration(criticalLibrary, config);
    if (critical.schema !== "kfc-druid-healing-workload.v1") throw new Error("Druid expected");
    expect(critical.utilityProbe?.recombobulatorCanCrit).toBe(true);
    config.gear[12] = { id: 0 };
    const removed = healerWorkloadForConfiguration(criticalLibrary, config);
    if (removed.schema !== "kfc-druid-healing-workload.v1") throw new Error("Druid expected");
    expect(removed.utilityProbe).toBeUndefined();
  });
  it("retains the benchmarked item target and thresholds when rebuilding a preset", () => {
    const reviewed = {
      ...structuredClone(druid),
      supportedItemUses: ["major-recombobulator"] as const,
    };
    const build = reviewed.builds.find((entry) => entry.id === reviewed.defaultBuildId)!;
    if (build.workload.schema !== "kfc-druid-healing-workload.v1")
      throw new Error("Druid expected");
    build.gear[12] = { id: 18637 };
    build.workload.utilityProbe = {
      schema: "kfc-druid-utility-probe.v1",
      id: "coupled-recombo-400-800-most-injured-false",
      mode: "recombobulator-timed-use",
      headmasterIntellect: 0,
      baronRegeneration: false,
      circle: false,
      gauntlets: false,
      recombobulator: true,
      recombobulatorCanCrit: false,
      recombobulatorTarget: "most-injured",
      recombobulatorHealingCoefficient: 0,
      recombobulatorManaCoefficient: 0,
      minimumMissingHealth: 400,
      minimumMissingMana: 800,
    };
    const config = configurationForHealerBuild(reviewed, build);
    const frame = healerWorkloadForConfiguration(reviewed, config);
    if (frame.schema !== "kfc-druid-healing-workload.v1") throw new Error("Druid expected");
    expect(frame.utilityProbe).toEqual(build.workload.utilityProbe);
    expect(decodeHealerConfiguration(encodeHealerConfiguration(config))).toEqual(config);
  });
});
