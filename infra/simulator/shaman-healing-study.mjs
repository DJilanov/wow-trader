import assert from "node:assert/strict";
import { assertShamanRecipientManaPolicy } from "./shaman-mana-recipients.mjs";
import { eligibleShamanHealingActions } from "./shaman-healing-eligibility.mjs";

/** Stationary synthetic incoming damage, supplied after mitigation.
 * @param {{kind:'tank'|'group'|'burst',durationSeconds:number,damagePerSecond:number,geometry:'stacked'|'spread',recipients?:number}} options
 * @returns {object}
 */
export function createShamanHealingAssignment({
  kind,
  durationSeconds,
  damagePerSecond,
  geometry,
  recipients = 4,
}) {
  assert(["tank", "group", "burst"].includes(kind));
  assert(Number.isSafeInteger(durationSeconds) && durationSeconds >= 30 && durationSeconds <= 300);
  assert(Number.isFinite(damagePerSecond) && damagePerSecond > 0 && damagePerSecond <= 2000);
  assert([4, 9, 39].includes(recipients));
  assert(["stacked", "spread"].includes(geometry));
  assert(geometry !== "spread" || recipients === 4, "Spread reference requires four recipients");
  const targets = [{ raidIndex: 0, maximumHealth: 0, x: 0, y: 0 }];
  for (let index = 0; index < recipients; index++) {
    const spread = [
      [20, 0],
      [0, 20],
      [-20, 0],
      [0, -20],
    ];
    const [x, y] =
      geometry === "spread" ? spread[index] : [(index % 6) * 2 + 2, Math.floor(index / 6) * 2];
    targets.push({
      raidIndex: index + 1,
      maximumHealth: kind === "tank" && index === 0 ? 18000 : 10000,
      x,
      y,
    });
  }
  const damage = [];
  for (let second = 1; second < durationSeconds; second++) {
    if (kind === "tank")
      damage.push({ atMs: second * 1000, raidIndex: 1, amount: damagePerSecond });
    else if (kind === "group" || second % 15 === 0) {
      for (let target = 1; target <= recipients; target++)
        damage.push({
          atMs: second * 1000 + (kind === "group" ? target * Math.floor(400 / recipients) : 0),
          raidIndex: target,
          amount: (damagePerSecond * (kind === "burst" ? 15 : 1)) / recipients,
        });
    }
  }
  assert(damage.length <= 20000);
  return {
    schema: "kfc-shaman-healing-workload.v1",
    name: `synthetic-${kind}-${durationSeconds}s-${damagePerSecond}dps-${geometry}-${recipients}recipients`,
    targets,
    damage,
    priorities: [],
    decisionIntervalMs: 50,
    bounceRange: 12.5,
    chainRouting: "nearest-injured-reference",
    water: {
      FirstPulse: "after-period-reference",
      Recipients: "party-reference",
      HealingScaling: "base-and-power-reference",
    },
    resources: {
      ShieldCooldown: "current-client-reference",
      ShieldTriggers: "all-direct-critical-heals-reference",
      SwiftnessCooldownStart: "activation-reference",
    },
    riptide: {
      HotPower: "snapshot-reference",
      HotCriticals: "noncritical-reference",
      HotCadence: "source-fixed-reference",
      ChainBonus: "all-bounces-reference",
      ConsumeHot: true,
    },
    useNaturesSwiftness: false,
    naturesSwiftnessMinimumMissingHealth: 0,
  };
}

/** Select only captured eligible cast roots, with explicit utility and healing priorities.
 * @param {object} assignment @param {Record<string,number>} fields
 * @param {object} spellPolicy
 * @param {{directSpellId:number,directMinimumMissingHealth:number,chainSpellId?:number,chainMinimumMissingHealth?:number,chainMinimumInjuredTargets?:number,chainMinimumGroupMissingHealth?:number,chainRequireHot?:boolean,riptide?:boolean,riptideMinimumMissingHealth?:number,stream?:boolean,tide?:boolean,tideMinimumMissingMana?:number,shield?:boolean,naturesSwiftnessMinimumMissingHealth?:number}} options
 * @returns {object}
 */
export function createShamanHealingPriorities(assignment, fields, spellPolicy, options) {
  assert.equal(assignment.schema, "kfc-shaman-healing-workload.v1");
  const eligible = eligibleShamanHealingActions(spellPolicy, {
    level: 60,
    talents: Object.fromEntries(
      ["riptide", "waterShield", "manaTideTotem", "naturesSwiftness"].map((field) => [
        field,
        Boolean(fields[field]),
      ]),
    ),
    allowConditionalCandidates: true,
  });
  const byId = new Map(eligible.map((row) => [row.spellId, row]));
  const highest = (family) => {
    const rank = eligible.filter((row) => row.family === family).sort((a, b) => b.rank - a.rank)[0];
    assert(rank, "No captured eligible Shaman cast for " + family);
    return rank.spellId;
  };
  const {
    directSpellId,
    directMinimumMissingHealth,
    chainSpellId = 0,
    chainMinimumMissingHealth = 300,
    chainMinimumInjuredTargets = 2,
    chainMinimumGroupMissingHealth = 1200,
    chainRequireHot = false,
    riptide = Boolean(fields.riptide),
    riptideMinimumMissingHealth = 600,
    stream = true,
    tide = Boolean(fields.manaTideTotem),
    tideMinimumMissingMana = 2000,
    shield = Boolean(fields.waterShield),
    naturesSwiftnessMinimumMissingHealth = 3000,
  } = options;
  for (const value of [
    directMinimumMissingHealth,
    chainMinimumMissingHealth,
    chainMinimumGroupMissingHealth,
    riptideMinimumMissingHealth,
    tideMinimumMissingMana,
    naturesSwiftnessMinimumMissingHealth,
  ])
    assert(Number.isFinite(value) && value >= 0 && value <= 1000000);
  for (const value of [chainRequireHot, riptide, stream, tide, shield])
    assert.equal(typeof value, "boolean");
  assert(
    Number.isInteger(chainMinimumInjuredTargets) &&
      chainMinimumInjuredTargets >= 0 &&
      chainMinimumInjuredTargets <= 3,
  );
  assert(
    ["healing-wave", "lesser-healing-wave"].includes(byId.get(directSpellId)?.family),
    "Ineligible direct heal",
  );
  assert(!chainSpellId || byId.get(chainSpellId)?.family === "chain-heal", "Ineligible Chain Heal");
  assert(
    !chainRequireHot || (chainSpellId && riptide && fields.riptide > 0),
    "Chain HoT requirement needs owned Riptide",
  );
  const result = structuredClone(assignment),
    priorities = [];
  const target = result.name.startsWith("synthetic-tank-") ? 1 : -1;
  if (shield) priorities.push({ spellId: highest("water-shield"), raidIndex: -1 });
  if (tide)
    priorities.push({
      spellId: highest("mana-tide"),
      raidIndex: -1,
      minimumMissingMana: tideMinimumMissingMana,
    });
  if (stream) priorities.push({ spellId: highest("healing-stream"), raidIndex: -1 });
  if (riptide)
    priorities.push({
      spellId: highest("riptide"),
      raidIndex: target,
      minimumMissingHealth: riptideMinimumMissingHealth,
      keepHot: true,
    });
  if (chainSpellId)
    priorities.push({
      spellId: chainSpellId,
      raidIndex: target,
      minimumMissingHealth: chainMinimumMissingHealth,
      minimumInjuredTargets: chainMinimumInjuredTargets,
      minimumGroupMissingHealth: chainMinimumGroupMissingHealth,
      requireHot: chainRequireHot,
    });
  priorities.push({
    spellId: directSpellId,
    raidIndex: target,
    minimumMissingHealth: directMinimumMissingHealth,
  });
  result.priorities = priorities;
  result.useNaturesSwiftness = Boolean(fields.naturesSwiftness);
  result.naturesSwiftnessMinimumMissingHealth = result.useNaturesSwiftness
    ? naturesSwiftnessMinimumMissingHealth
    : 0;
  return result;
}

/** Construct an explicitly synthetic resource-demand schedule, with no borrowed cooldown grants.
 * @param {{durationSeconds:number,recipients:number,maximumMana:number,startingMana:number,costAmount:number,costPeriodMs:number,timing:'spend-before-pulses-reference'|'spend-after-pulses-reference'}} options
 * @returns {object}
 */
export function createShamanRecipientManaAssignment({
  durationSeconds,
  recipients,
  maximumMana,
  startingMana,
  costAmount,
  costPeriodMs,
  timing,
}) {
  assert([4, 9, 39].includes(recipients));
  assert(Number.isSafeInteger(costPeriodMs) && costPeriodMs > 0);
  assert(Number.isFinite(durationSeconds) && durationSeconds >= 30 && durationSeconds <= 300);
  assert(
    Math.ceil((durationSeconds * 1000) / costPeriodMs) * recipients <= 20000,
    "Recipient cost budget exceeded",
  );
  const costs = [];
  for (let atMs = 0; atMs < durationSeconds * 1000; atMs += costPeriodMs)
    costs.push({ atMs, amount: costAmount });
  const result = {
    schema: "kfc-shaman-recipient-mana.v1",
    id: `synthetic-${recipients}recipients-${durationSeconds}s-${costPeriodMs}ms`,
    regeneration: "none-reference",
    payment: "all-or-nothing-no-retry-reference",
    timing,
    recipients: Array.from({ length: recipients }, (_, index) => ({
      raidIndex: index + 1,
      maximumMana,
      startingMana,
      costs: structuredClone(costs),
    })),
  };
  assertShamanRecipientManaPolicy(result, durationSeconds);
  return result;
}

/** Survival and full scheduled delivery precede the external missing-health objective.
 * @param {object} result @param {number} durationSeconds @returns {object}
 */
export function summarizeShamanHealingAssignment(result, durationSeconds) {
  assert.equal(result.schema, "kfc-shaman-healing-workload-result.v1");
  assert.equal(result.classQualified, false);
  assert.equal(result.publicationAllowed, false);
  assert(Number.isFinite(durationSeconds) && durationSeconds >= 30 && durationSeconds <= 300);
  assert.equal(result.assignment?.schema, "kfc-shaman-external-assignment.v1");
  const assignment = result.assignment;
  for (const value of [
    result.survivalRate,
    result.manaRemainingMean,
    result.plannedIncomingPostMitigationDamage,
    result.deliveredIncomingDamageMean,
    assignment.supportHpsMean,
    assignment.healthRestoredHpsMean,
    assignment.absorbedHpsMean,
    assignment.damageDemandMean,
    assignment.externalMissingHealthSecondsMean,
    assignment.finalExternalMissingHealthMean,
  ])
    assert(Number.isFinite(value) && value >= 0);
  assert(result.survivalRate <= 1);
  for (const key of [
    "usefulOtherManaTideManaMean",
    "recipientManaDemandMean",
    "recipientManaSpentMean",
    "recipientUnpaidManaMean",
  ])
    assert(Number.isFinite(assignment[key] ?? 0) && (assignment[key] ?? 0) >= 0);
  const manaDemand = assignment.recipientManaDemandMean ?? 0;
  assert(
    Math.abs(
      (assignment.recipientManaSpentMean ?? 0) +
        (assignment.recipientUnpaidManaMean ?? 0) -
        manaDemand,
    ) <=
      Math.max(1, manaDemand) * 1e-7,
  );
  const planned = result.plannedIncomingPostMitigationDamage,
    tolerance = Math.max(1, planned) * 1e-7;
  assert(result.deliveredIncomingDamageMean <= planned + tolerance);
  assert(assignment.supportHpsMean * durationSeconds <= assignment.damageDemandMean + tolerance);
  assert(
    Math.abs(
      assignment.supportHpsMean - assignment.healthRestoredHpsMean - assignment.absorbedHpsMean,
    ) <=
      Math.max(1, assignment.supportHpsMean) * 1e-7,
  );
  return {
    feasible:
      result.survivalRate === 1 &&
      Math.abs(result.deliveredIncomingDamageMean - planned) <= tolerance,
    survivalRate: result.survivalRate,
    meanExternalMissingHealth: assignment.externalMissingHealthSecondsMean / durationSeconds,
    finalExternalMissingHealthMean: assignment.finalExternalMissingHealthMean,
    supportHpsMean: assignment.supportHpsMean,
    manaRemainingMean: result.manaRemainingMean,
    usefulOtherManaTideManaMean: assignment.usefulOtherManaTideManaMean,
    recipientManaSpentMean: assignment.recipientManaSpentMean ?? 0,
    recipientUnpaidManaMean: assignment.recipientUnpaidManaMean ?? 0,
  };
}
