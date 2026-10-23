import { createHash } from "node:crypto";
import { z } from "zod";
import raidSupport from "../../../../infra/simulator/raid-buff-defaults.v2.json";
import { raidBenchmarkDebuffs } from "../../../../infra/simulator/tier-scenarios.mjs";
import {
  createTankTierSettings,
  tankTierPolicy,
  tankTierProfiles,
} from "../../../../infra/simulator/tank-tier-policy.mjs";
import type {
  OptimizedTankBuild,
  TankSimulatorModelUpdate,
} from "./forever-simulator-tank-model-updates";
import {
  tankTierSnapshotSchema,
  type OptimizedTankTierSnapshot,
  type TankTierScenario,
} from "./forever-tank-tier-list";

const record = z.record(z.string(), z.unknown());
const hash = (value: unknown): string =>
  createHash("sha256")
    .update(JSON.stringify(value) ?? "null")
    .digest("hex");

// Protobuf JSON omits zero-valued fields and prints enum names instead of numbers.
function normalized(value: unknown): unknown {
  if (value === "TristateEffectRegular") return 1;
  if (value === "TristateEffectImproved") return 2;
  if (value === "SpellSchoolPhysical") return undefined;
  if (value === null || value === undefined || value === false || value === 0 || value === "")
    return undefined;
  if (Array.isArray(value))
    return value.length
      ? value.map((entry: unknown): unknown => normalized(entry) ?? null)
      : undefined;
  if (typeof value !== "object") return value;
  const fields = Object.entries(value)
    .sort(([left], [right]): number => left.localeCompare(right))
    .flatMap(([key, entry]): [string, unknown][] => {
      const next = normalized(entry);
      return next === undefined ? [] : [[key, next]];
    });
  return fields.length ? Object.fromEntries(fields) : undefined;
}
function verifyComparisonPolicy(build: OptimizedTankBuild, scenario: TankTierScenario): void {
  const settings = build.settings;
  const expected = record.parse(
    createTankTierSettings(settings, scenario, build.profile, raidSupport, raidBenchmarkDebuffs),
  );
  const player = settings.player;
  const expectedPlayer = record.parse(expected.player);
  const fields = [
    "encounter",
    "raidBuffs",
    "partyBuffs",
    "debuffs",
    "tanks",
    "targetDummies",
  ] as const;
  for (const field of fields)
    if (hash(normalized(settings[field])) !== hash(normalized(expected[field])))
      throw new Error(`Optimized tank ${field} differs from the comparison policy`);
  for (const field of ["buffs", "healingModel", "inFrontOfTarget", "consumes", "level"] as const)
    if (hash(normalized(player[field])) !== hash(normalized(expectedPlayer[field])))
      throw new Error(`Optimized tank player ${field} differs from the comparison policy`);
}

/** Project only verified measured setups; the board never keeps a second copy of scores. */
export function createOptimizedTankTierSnapshot(
  scenario: TankTierScenario,
  models: readonly TankSimulatorModelUpdate[],
): OptimizedTankTierSnapshot {
  const first = models[0];
  if (
    !first ||
    models.length !== 3 ||
    new Set(models.map((model): string => model.proof.profile)).size !== 3 ||
    !tankTierProfiles.every((profile: string): boolean =>
      models.some((model): boolean => model.proof.profile === profile),
    )
  )
    throw new Error("All three approved optimized tank profiles are required");
  for (const model of models)
    if (
      model.sourceRelease !== first.sourceRelease ||
      model.proof.engine !== first.proof.engine ||
      model.selectionSha256 !== first.selectionSha256
    )
      throw new Error("Optimized tank profiles have different engine selections");
  const { seed: _seed, ...legacyPolicy } = tankTierPolicy(scenario);
  const policy = {
    ...legacyPolicy,
    version: "optimized-pre-raid-tank-comparison-v1",
    iterations: 40000,
    seeds: [81491001, 82491001],
    equipment:
      "item-by-item pre-raid search; separate threat and physical mitigation objectives, conservative enchants; fixed race, professions, talents and rotation",
  };
  const entries = models.flatMap((model) =>
    (["threat", "mitigation"] as const).map((objective) => {
      const matches = model.proof.builds.filter(
        (build): boolean =>
          build.scenario === scenario &&
          build.objective === objective &&
          !build.requiresProvisionalEnchantOptIn,
      );
      const build = matches[0];
      if (matches.length !== 1 || !build)
        throw new Error("Missing unique conservative optimized setup");
      verifyComparisonPolicy(build, scenario);
      return {
        id: build.profile.replaceAll("_", "-"),
        profile: build.profile,
        release: model.manifest.release,
        objective,
        iterations: build.reference.iterations,
        metrics: build.reference.metrics,
        health: build.reference.health,
        armor: build.reference.armor,
        threatBreakdown: build.threatBreakdown,
        talents: build.settings.player.talentsString,
        race: build.settings.player.race,
        manifestSha256: hash(model.manifest),
        wasmSha256: model.proof.wasmSha256,
        databaseSha256: model.proof.databaseSha256,
        proofSha256: model.proofSha256,
        sourceFingerprint: build.sourceFingerprint,
        sourceMeasurementsSha256: build.sourceMeasurementsSha256,
        settingsSha256: build.settingsSha256,
        benchmarkHref: build.href,
        capturedAt: build.measuredAt,
        warnings: build.warnings,
        gear: build.gear.map((item) => {
          const enchant =
            item.enchant == null ? null : z.object({ name: z.string() }).parse(item.enchant).name;
          const source = item.source == null ? null : record.parse(item.source);
          return {
            slot: item.slot,
            id: item.id,
            name: item.name ?? (item.id ? `Item ${item.id}` : "Empty"),
            enchant,
            provisionalSource: source?.status === "classic-provisional",
          };
        }),
      };
    }),
  );
  const snapshot = tankTierSnapshotSchema.parse({
    schema: "kfc-forever-tank-tier-list.v3",
    policy,
    policySha256: hash(policy),
    supportSha256: hash({ support: raidSupport, debuffs: raidBenchmarkDebuffs }),
    approvedSelection: { selectionSha256: first.selectionSha256, engine: first.proof.engine },
    entries,
  });
  if (snapshot.schema !== "kfc-forever-tank-tier-list.v3")
    throw new Error("Unexpected tank snapshot version");
  return snapshot;
}
