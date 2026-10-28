import assert from "node:assert/strict";
import { createTierScenarioSettings, tierScenarioPolicy } from "./tier-scenarios.mjs";
import { createTankTierSettings, tankTierPolicy } from "./tank-tier-policy.mjs";
import { raidBenchmarkDebuffs } from "./tier-scenarios.mjs";

export function currentTankTierPolicy(scenario) {
  const base = { ...tankTierPolicy(scenario) };
  delete base.seed;
  return {
    ...base,
    version: "current-pre-raid-tank-comparison-v1",
    iterations: 5000,
    seeds: [61723001],
    equipment:
      "current qualified pre-raid builds; separate threat and physical mitigation objectives; main-hand coating removed for raid Windfury",
  };
}

function normalized(value) {
  if (value === "TristateEffectRegular") return 1;
  if (value === "TristateEffectImproved") return 2;
  if (value === "SpellSchoolPhysical") return undefined;
  if (value == null || value === false || value === 0 || value === "") return undefined;
  if (Array.isArray(value))
    return value.length ? value.map((entry) => normalized(entry) ?? null) : undefined;
  if (typeof value !== "object") return value;
  const fields = Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([key, entry]) => {
      const next = normalized(entry);
      return next === undefined ? [] : [[key, next]];
    });
  return fields.length ? Object.fromEntries(fields) : undefined;
}

export function assertCurrentTankComparison(settings, scenario, profile, support) {
  const expected = createTankTierSettings(
    settings,
    scenario,
    profile,
    support,
    raidBenchmarkDebuffs,
  );
  for (const field of ["encounter", "raidBuffs", "partyBuffs", "debuffs", "tanks", "targetDummies"])
    assert.deepEqual(
      normalized(settings[field]),
      normalized(expected[field]),
      "Tank comparison differs: " + profile + " " + field,
    );
  for (const field of ["buffs", "healingModel", "inFrontOfTarget", "consumes", "level"])
    assert.deepEqual(
      normalized(settings.player[field]),
      normalized(expected.player[field]),
      "Tank player comparison differs: " + profile + " " + field,
    );
}

const paladinSelfSupport = Object.freeze({
  raid: { retributionAura: 1 },
  party: {},
  individual: { blessingOfMight: 1 },
});

export function currentDpsTierPolicy(scenario, support, encounter) {
  const policy = tierScenarioPolicy(scenario, support);
  if (scenario === "solo") {
    policy.selfSupport.retribution_paladin = structuredClone(paladinSelfSupport);
    policy.selfSupport.shockadin = {
      raid: { retributionAura: 1 },
      party: {},
      individual: { blessingOfWisdom: 1 },
    };
  }
  return {
    ...policy,
    encounter,
    playerEquipmentTalentsRaceConsumes: "retained from each published reviewed build",
  };
}

export function currentDpsTierSettings(
  settings,
  encounter,
  support,
  scenario,
  profile,
  buildId = "",
) {
  const policy = currentDpsTierPolicy(scenario, support, encounter);
  const next = createTierScenarioSettings(
    settings,
    encounter,
    support,
    scenario,
    profile === "retribution_paladin" ? "warrior" : profile,
  );
  if (profile === "retribution_paladin" && scenario === "solo") {
    const self = buildId.includes("shockadin")
      ? policy.selfSupport.shockadin
      : policy.selfSupport.retribution_paladin;
    next.raidBuffs = structuredClone(self.raid);
    next.partyBuffs = structuredClone(self.party);
    next.player.buffs = structuredClone(self.individual);
  }
  return next;
}

export const healerTierPolicy = Object.freeze({
  version: "shared-three-minute-healing-v2",
  durationSeconds: 180,
  iterationsPerSeed: 256,
  seeds: [58723001, 58723003],
  layout: "stacked",
  recipients: 4,
  recipientMaximumHealth: 18000,
  tankDamagePerSecond: 800,
  groupDamagePerRecipientPerSecond: 200,
  burstDamagePerRecipient: 2500,
  burstIntervalSeconds: 15,
  support:
    "reviewed full raid support; source gear, talents and spell priorities retained; self-damaging runes excluded",
  ranking: "survival gate at 99%, then useful healing plus consumed absorbs; overhealing excluded",
  selfDamageResources: "excluded",
});

export function currentHealerTierWorkload(source, assignment) {
  const next = globalThis.structuredClone(source);
  const workload = next.workload && Array.isArray(next.workload.damage) ? next.workload : next;
  const demand = healerTierDemand(assignment);
  Object.assign(workload, {
    name: `shared-tier-${assignment}-180s`,
    targets: demand.targets,
    damage: demand.damage,
  });
  for (const container of new Set([next, workload])) {
    if (Array.isArray(container.cooldowns))
      container.cooldowns = container.cooldowns.filter(
        (use) => ![12662, 20520].includes(use.itemId),
      );
  }
  return next;
}

export function healerTierDemand(assignment) {
  assert(["tank", "group", "burst"].includes(assignment));
  const targets = Array.from({ length: 5 }, (_, raidIndex) => ({
    raidIndex,
    maximumHealth: raidIndex === 0 ? 0 : healerTierPolicy.recipientMaximumHealth,
    x: raidIndex * 2,
    y: 0,
  }));
  const damage = [];
  for (let second = 1; second < healerTierPolicy.durationSeconds; second++) {
    if (assignment === "burst" && second % healerTierPolicy.burstIntervalSeconds !== 0) continue;
    for (let raidIndex = 1; raidIndex <= (assignment === "tank" ? 1 : 4); raidIndex++) {
      damage.push({
        atMs: second * 1000,
        raidIndex,
        amount:
          assignment === "tank"
            ? healerTierPolicy.tankDamagePerSecond
            : assignment === "group"
              ? healerTierPolicy.groupDamagePerRecipientPerSecond
              : healerTierPolicy.burstDamagePerRecipient,
      });
    }
  }
  return { durationSeconds: healerTierPolicy.durationSeconds, targets, damage };
}

export function poolHealingMeasurements(results) {
  assert(results.length === healerTierPolicy.seeds.length);
  for (const result of results) {
    assert.equal(result.iterations, healerTierPolicy.iterationsPerSeed);
    assert(
      Number.isFinite(result.hps) &&
        Number.isFinite(result.hpsStdev) &&
        result.hps >= 0 &&
        result.hpsStdev >= 0,
    );
    assert(
      Math.abs(result.hps - result.effectiveHealingHps - result.absorbedHps) < 1e-6,
      "Healing accounting must reconcile before pooling",
    );
  }
  const iterations = results.reduce((sum, result) => sum + result.iterations, 0);
  const mean = (field) =>
    results.reduce((sum, result) => sum + result[field] * result.iterations, 0) / iterations;
  const hps = mean("hps");
  const variance =
    results.reduce(
      (sum, result) =>
        sum +
        (result.iterations - 1) * result.hpsStdev ** 2 +
        result.iterations * (result.hps - hps) ** 2,
      0,
    ) /
    (iterations - 1);
  return {
    iterations,
    hps,
    hpsStdev: Math.sqrt(variance),
    ...Object.fromEntries(
      [
        "effectiveHealingHps",
        "absorbedHps",
        "overhealingHps",
        "survivalRate",
        "manaRemainingMean",
        "missingHealthSecondsMean",
        "finalMissingHealthMean",
        "manaBlockedSecondsMean",
        "plannedIncomingPostMitigationDamage",
        "deliveredIncomingDamageMean",
      ].map((field) => [field, mean(field)]),
    ),
  };
}
