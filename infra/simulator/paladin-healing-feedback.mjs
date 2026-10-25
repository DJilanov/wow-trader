import assert from "node:assert/strict";
import {
  createPaladinHealingAssignment,
  createPaladinHealingPriorities,
} from "./paladin-healing-study.mjs";
import { eligiblePaladinHealingRanks } from "./paladin-healing-eligibility.mjs";

/** Explicit reference and sensitivity inputs; neither is a verified server rule.
 * @returns {object[]}
 */
export function paladinHealingFeedbackHypotheses() {
  return [
    {
      id: "reference",
      rankLoss: false,
      vigilRefundMode: "once-per-cast",
      lightScaling: "full-tooltip-reference",
      lightOrder: "before-healing-light",
      heartChance: 1,
      conservative: false,
    },
    {
      id: "mana-stress",
      rankLoss: true,
      vigilRefundMode: "none",
      lightScaling: "coefficient-factor",
      lightOrder: "after-healing-light",
      heartChance: 0,
      conservative: true,
    },
  ];
}

/** Retain every eligible direct rank and coarse missing-health threshold.
 * @param {object} spellPolicy @param {Record<string,number>} fields @returns {object[]}
 */
export function paladinHealingPriorityCandidates(spellPolicy, fields) {
  const options = [{ holyShock: false, lightsVigil: false, maintainVigil: false }];
  if (fields.holyShock) options.push({ holyShock: true, lightsVigil: false, maintainVigil: false });
  if (fields.lightsVigil)
    for (const maintainVigil of [false, true])
      options.push({ holyShock: true, lightsVigil: true, maintainVigil });
  return eligiblePaladinHealingRanks(spellPolicy, {
    level: 60,
    talents: { holyShock: Boolean(fields.holyShock), lightsVigil: Boolean(fields.lightsVigil) },
    allowConditionalCandidates: true,
  })
    .filter((row) => ["holy-light", "flash-of-light"].includes(row.family))
    .flatMap((rank) =>
      options.flatMap((active) =>
        [0, 400, 1200].map((directMinimumMissingHealth) => ({
          directSpellId: rank.spellId,
          directMinimumMissingHealth,
          ...active,
        })),
      ),
    );
}

/** Build only owned item references and cooldowns for a complete, separately validated loadout.
 * @param {{kind:'tank'|'group'|'burst',durationSeconds:number,damagePerSecond:number,fields:Record<string,number>,spellPolicy:object,policy:object,hypothesis:object,gear:object,items:Map<number,object>,useUtilities?:boolean}} input
 * @returns {object}
 */
export function createPaladinHealingFeedbackWorkload({
  kind,
  durationSeconds,
  damagePerSecond,
  fields,
  spellPolicy,
  policy,
  hypothesis,
  gear,
  items,
  useUtilities = true,
}) {
  assert.equal(typeof useUtilities, "boolean");
  assert(
    paladinHealingFeedbackHypotheses().some(
      (row) => JSON.stringify(row) === JSON.stringify(hypothesis),
    ),
  );
  const frame = createPaladinHealingPriorities(
    createPaladinHealingAssignment({ kind, durationSeconds, damagePerSecond }),
    fields,
    spellPolicy,
    policy,
  );
  assert.equal(typeof policy.maintainVigil, "boolean");
  if (policy.maintainVigil) {
    assert(policy.lightsVigil);
    frame.priorities[0].maintainVigil = true;
  }
  if (hypothesis.rankLoss)
    frame.rankScaling = {
      schema: "kfc-paladin-rank-sensitivity.v1",
      id: "level-distance-mana-stress",
      kind: "level-distance-sensitivity",
      fullScalingGap: 5,
      coefficientLossPerLevel: 0.04,
      classProcMode: "coefficient-factor",
    };
  frame.vigilRefundMode = hypothesis.vigilRefundMode;
  frame.blessingOfLight.scaling = hypothesis.lightScaling;
  frame.blessingOfLight.multiplierOrder = hypothesis.lightOrder;
  const ids = new Set(gear.items.filter((row) => row.id).map((row) => row.id));
  assert(gear.items.length === 17 && [...ids].every((id) => items.has(id)));
  const sets = new Map();
  for (const spec of gear.items) {
    const setId = items.get(spec.id)?.setId;
    if (setId) sets.set(setId, (sets.get(setId) ?? 0) + 1);
  }
  if (ids.has(249473))
    frame.itemEffectsPolicy = {
      schema: "kfc-paladin-item-effects-policy.v1",
      id: hypothesis.id,
      dormantHeartHealingEvents: "completed-casts",
      dormantHeartProcChance: hypothesis.heartChance,
    };
  const cast = {};
  if ((sets.get(185) ?? 0) >= 5) cast.wildheartManaChance = hypothesis.conservative ? 0 : 0.02;
  if ((sets.get(183) ?? 0) >= 5) cast.dreadmistCanCrit = false;
  if ((sets.get(187) ?? 0) >= 5 || (sets.get(188) ?? 0) >= 5)
    cast.spellPowerChance = hypothesis.conservative ? 0.05 : 1;
  if (Object.keys(cast).length) frame.castSetPolicy = cast;
  const self = {};
  if ([184, 189].some((id) => (sets.get(id) ?? 0) >= 6) || (sets.get(1968) ?? 0) >= 4)
    self.regenerationTickMs = hypothesis.conservative ? 5000 : 2000;
  if ((sets.get(162) ?? 0) >= 4 || (sets.get(163) ?? 0) >= 6 || (sets.get(182) ?? 0) >= 4)
    self.selfDamageTriggers = !hypothesis.conservative;
  if (Object.keys(self).length) frame.selfSetPolicy = self;
  if ([2816, 6320, 6459, 6461, 6910, 7684, 14149, 16731].some((id) => ids.has(id)))
    frame.itemHealthRegenTickMs = hypothesis.conservative ? 5000 : 2000;
  frame.cooldowns = [
    { itemId: 13444, minimumMissingMana: 3000, requireHealingDemand: true },
    { itemId: 12662, minimumMissingMana: 1500, requireHealingDemand: true },
  ];
  for (const [itemId, spellId, minimumMissingMana] of [
    [18371, 1302205, 1250],
    [11819, 15604, 630],
    [13143, 17252, 1],
  ])
    if (ids.has(itemId))
      frame.cooldowns.push({ spellId, minimumMissingMana, requireHealingDemand: true });
  if (ids.has(20512))
    frame.cooldowns.push({ itemId: 20512, minimumMissingMana: 1500, requireHealingDemand: true });
  if (ids.has(272439)) frame.cooldowns.push({ itemId: 272439, requireHealingDemand: true });
  if (ids.has(272438)) frame.cooldowns.push({ itemId: 272438, requireHealingDemand: true });
  if (useUtilities) {
    for (const itemId of [4381, 18637])
      if (ids.has(itemId))
        frame.cooldowns.push({
          itemId,
          targetRaidIndex: 0,
          minimumMissingMana: 1500,
          requireHealingDemand: true,
        });
    for (const itemId of [4262, 8346])
      if (ids.has(itemId)) frame.cooldowns.push({ itemId, requireHealingDemand: true });
    if (ids.has(11808))
      frame.cooldowns.push({ itemId: 11808, minimumMissingMana: 1000, requireHealingDemand: true });
  }
  return frame;
}
