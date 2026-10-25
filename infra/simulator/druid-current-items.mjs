import assert from "node:assert/strict";
import { currentLevel60Ratings, normalizeCurrentPrebisItem } from "./current-prebis-staging.mjs";

export const druidCurrentItemRecoveryIds = Object.freeze([
  1929, 1934, 4746, 5197, 5201, 5404, 6226, 6340, 6473, 6480, 6688, 6695, 6697, 6748, 6750, 7720,
  7757, 9398, 9414, 9536, 10359, 11311, 14148, 14150, 14151, 20069, 20220,
]);
const explicitStats = new Map([
  [5, 3],
  [6, 4],
  [7, 2],
  [41, 41],
  [42, 42],
  [43, 12],
  [45, 5],
]);

/** Compare explicit current values without treating absent channels as zero.
 * @param {object} database @param {Array<object>} currentItems
 * @param {Array<number>} ids @returns {Array<object>}
 */
export function auditDruidCurrentStats(database, currentItems, ids) {
  const items = new Map(database.items.map((row) => [row.id, row])),
    current = new Map(currentItems.map((row) => [row.itemId, row])),
    differences = [];
  assert.equal(items.size, database.items.length);
  assert.equal(current.size, currentItems.length);
  for (const id of ids) {
    const item = items.get(id),
      row = current.get(id);
    assert(item, "Missing candidate " + id);
    if (!row) continue;
    assert.equal(item.stats.length, 44);
    for (const stat of row.stats) {
      if (!explicitStats.has(stat.statType)) continue;
      const actual = item.stats[explicitStats.get(stat.statType)];
      if (actual !== stat.value)
        differences.push({
          id,
          name: item.name,
          statType: stat.statType,
          current: stat.value,
          engine: actual,
          effects: row.effectIds,
        });
    }
  }
  return differences;
}

/** Validate excluded effects before adapting the existing strict item normalizer.
 * @param {object} evidence @returns {object}
 */
export function extractDruidCurrentItemReview(evidence) {
  assert.equal(evidence.schema, "kfc-druid-current-items-source.v1");
  assert.equal(evidence.source.clientVersion, "1.60.1.70532");
  assert.deepEqual(evidence.reviewedIds, [...druidCurrentItemRecoveryIds]);
  assert.deepEqual(evidence.healingScope, {
    offensiveAttacks: false,
    resurrections: false,
    weaponSkillBonuses: false,
  });
  const { tables } = evidence;
  assert.equal(tables.ItemSparse.length, 27);
  assert.equal(tables.ItemEffect.length, 3);
  assert.equal(tables.SpellEffect.length, 3);
  const reviews = [];
  for (const [id, effectId, spellId, trigger, aura, amount, misc, target] of [
    [5197, 232948, 1292008, 2, 14, 1, 1, 6],
    [7720, 233734, 1293540, 1, 4, 20, 0, 1],
    [9414, 238249, 1320726, 1, 30, 1, 3014, 1],
  ]) {
    const links = tables.ItemXItemEffect.filter((row) => row.ItemID === id);
    assert.equal(links.length, 1);
    assert.equal(links[0].ItemEffectID, effectId);
    const items = tables.ItemEffect.filter((row) => row.id === effectId);
    assert.equal(items.length, 1);
    assert.deepEqual(
      [
        items[0].SpellID,
        items[0].TriggerType,
        items[0].ChrSpecializationID,
        items[0].PlayerConditionID,
      ],
      [spellId, trigger, 0, 0],
    );
    const effects = tables.SpellEffect.filter((row) => row.SpellID === spellId);
    assert.equal(effects.length, 1);
    const row = effects[0];
    assert.deepEqual(
      [row.Effect, row.EffectAura, row.EffectBasePointsF, row.EffectMiscValue, row.ImplicitTarget],
      [6, aura, amount, [misc, 0], [target, 0]],
    );
    assert.deepEqual(row.EffectSpellClassMask, [0, 0, 0, 0]);
    for (const field of [
      "EffectTriggerSpell",
      "EffectAuraPeriod",
      "EffectBonusCoefficient",
      "Variance",
      "ScalingClass",
      "EffectRealPointsPerLevel",
      "Coefficient",
      "ResourceCoefficient",
      "BonusCoefficientFromAP",
    ])
      assert.equal(row[field], 0);
    reviews.push({
      id,
      effectId,
      spellId,
      status: "excluded-from-declared-healing-workloads",
      reason:
        id === 5197
          ? "Physical damage debuff; no offensive rotation or physical-damage objective"
          : id === 7720
            ? "Resurrection speed; no resurrection policy in these workloads"
            : "Feral combat skill; weapon-skill bonuses are excluded",
    });
  }
  const modifiers = evidence.normalized.items.flatMap((row) =>
    row.stats.filter((stat) => stat.statType === 136).map((stat) => ({ id: row.itemId, ...stat })),
  );
  assert.deepEqual(modifiers, [{ id: 6695, statType: 136, value: 12 }]);
  assert.deepEqual(
    [
      evidence.unsupportedModifierReview.id,
      evidence.unsupportedModifierReview.statType,
      evidence.unsupportedModifierReview.value,
      evidence.unsupportedModifierReview.observedTooltipSpellPower,
      evidence.unsupportedModifierReview.observedTooltipUndeadSpellDamage,
    ],
    [6695, 136, 12, 5, 12],
  );
  return {
    schema: "kfc-druid-current-item-review.v1",
    effectReviews: reviews,
    excludedModifier: {
      id: 6695,
      statType: 136,
      value: 12,
      scope: "Damage against Undead does not improve healing; offensive simulation is not admitted",
      url: evidence.unsupportedModifierReview.url,
    },
    negativeStat: { id: 4746, statType: 7, value: -11 },
    scope: evidence.healingScope,
    publicationAllowed: false,
  };
}

/** Reconcile reviewed current records while preserving acquisition and all other catalog items.
 * @param {object} parent @param {Array<object>} parentSources
 * @param {object} evidence @returns {object}
 */
export function recoverDruidCurrentItems(parent, parentSources, evidence) {
  const review = extractDruidCurrentItemReview(evidence),
    db = structuredClone(parent),
    sources = structuredClone(parentSources),
    items = new Map(db.items.map((row) => [row.id, row])),
    sourceRows = new Map(sources.map((row) => [row.id, row])),
    current = new Map(evidence.normalized.items.map((row) => [row.itemId, row])),
    sparse = new Map(evidence.tables.ItemSparse.map((row) => [row.id, row])),
    sets = new Map(evidence.normalized.sets.map((row) => [row.id, row])),
    ratings = currentLevel60Ratings(evidence.ratings),
    changes = [];
  assert.equal(items.size, parent.items.length);
  assert.equal(sourceRows.size, parentSources.length);
  assert.deepEqual(
    auditDruidCurrentStats(parent, evidence.normalized.items, druidCurrentItemRecoveryIds),
    evidence.diagnostic,
  );
  assert.equal(evidence.diagnostic.length, 41);
  for (const id of druidCurrentItemRecoveryIds) {
    const old = items.get(id),
      source = sourceRows.get(id),
      row = current.get(id),
      raw = sparse.get(id);
    assert.deepEqual(
      old,
      evidence.items.find((row) => row.id === id),
      "Refusing unreviewed or repeated recovery " + id,
    );
    assert.deepEqual(
      source,
      evidence.sources.find((row) => row.id === id),
    );
    assert(row && raw);
    assert.deepEqual(row.issues, []);
    assert.deepEqual(
      row.effectIds,
      evidence.tables.ItemXItemEffect.filter((row) => row.ItemID === id).map(
        (row) => row.ItemEffectID,
      ),
    );
    const adjusted = structuredClone(row);
    // The three attached effects and the damage-only modifier were explicitly reviewed above.
    adjusted.effectIds = [];
    adjusted.stats = adjusted.stats
      .filter((stat) => stat.statType !== 136)
      .map((stat) => {
        if (stat.value >= 0) return stat;
        assert.deepEqual([id, stat.statType, stat.value], [4746, 7, -11]);
        return { ...stat, value: 0 };
      });
    const normalized = normalizeCurrentPrebisItem(adjusted, raw, old, ratings, sets);
    if (id === 4746) normalized.stats[2] = -11;
    const next = {
      ...old,
      ...normalized,
      phase: old.phase ?? normalized.phase,
      expansion: old.expansion ?? normalized.expansion,
    };
    assert.deepEqual(next.sources, old.sources);
    assert.equal(next.icon, old.icon);
    const index = db.items.findIndex((row) => row.id === id);
    db.items[index] = next;
    items.set(id, next);
    changes.push({ id, before: old, after: next });
    source.requiredLevel = row.requiredLevel;
    source.status = "current-client-stats-reviewed-acquisition-provisional";
    source.statReview = {
      build: 70532,
      fields: ["stats", "armor", "itemLevel", "quality", "weapon"],
      scope: "declared healing workloads",
      effects: review.effectReviews.filter((row) => row.id === id),
      excludedModifiers: id === 6695 ? [review.excludedModifier] : [],
      historicalAcquisitionPreserved: true,
    };
  }
  assert.deepEqual(
    auditDruidCurrentStats(db, evidence.normalized.items, druidCurrentItemRecoveryIds),
    [],
  );
  for (const item of db.items)
    if (!druidCurrentItemRecoveryIds.includes(item.id))
      assert.deepEqual(
        item,
        parent.items.find((row) => row.id === item.id),
      );
  assert.deepEqual(items.get(272681), evidence.observedWeapon);
  return {
    schema: "kfc-druid-current-items-recovery.v1",
    db,
    sources,
    changes,
    review,
    preservedObservedWeaponId: 272681,
    numericalReuseAllowed: false,
    classMechanicsAdmission: false,
    publicationAllowed: false,
  };
}
