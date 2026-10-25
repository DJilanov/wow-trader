import assert from "node:assert/strict";

export const druidHealingRecoveryIds = Object.freeze([9450, 16706, 16715, 16718, 16719, 16720]);

/** Find direct-healing disagreements across a reviewed candidate domain.
 * @param {object} database @param {Array<object>} currentItems
 * @param {Array<number>} candidateIds @returns {Array<object>}
 */
export function auditDruidStaticHealing(database, currentItems, candidateIds) {
  const items = new Map(database.items.map((row) => [row.id, row])),
    current = new Map(currentItems.map((row) => [row.itemId, row]));
  assert.equal(items.size, database.items.length);
  assert.equal(current.size, currentItems.length);
  const differences = [];
  for (const id of candidateIds) {
    const item = items.get(id),
      row = current.get(id);
    assert(item, "Candidate missing from engine catalog: " + id);
    if (!row) continue;
    const healing = row.stats.filter((stat) => stat.statType === 41);
    if (!healing.length) continue;
    assert.equal(healing.length, 1, "Ambiguous direct healing: " + id);
    assert(Number.isFinite(healing[0].value) && healing[0].value >= 0);
    assert.equal(item.stats.length, 44);
    if (item.stats[41] !== healing[0].value)
      differences.push({
        id,
        name: item.name,
        before: item.stats[41],
        after: healing[0].value,
        combinedSpellPower: item.stats[5],
      });
  }
  return differences;
}

/** Recover six source-reviewed omitted values without replacing other stats or effects.
 * @param {object} parent @param {object} evidence @returns {object}
 */
export function recoverDruidStaticHealing(parent, evidence) {
  assert.equal(evidence.schema, "kfc-druid-static-healing-source.v1");
  assert.equal(evidence.source.clientVersion, "1.60.1.70532");
  assert.equal(
    evidence.source.normalized.byteSha256,
    "e00c4897f5278e4dca9ac834adacfd4da07e61a2ca4382f881f2f6785faeefe7",
  );
  assert.deepEqual(evidence.reviewedIds, [...druidHealingRecoveryIds]);
  const differences = auditDruidStaticHealing(
    parent,
    evidence.currentItems,
    druidHealingRecoveryIds,
  );
  assert.deepEqual(
    differences.map((row) => row.id),
    [...druidHealingRecoveryIds],
  );
  assert.deepEqual(
    differences.map((row) => row.after),
    [11, 11, 11, 20, 24, 15],
  );
  const current = new Map(evidence.currentItems.map((row) => [row.itemId, row])),
    items = new Map(parent.items.map((row) => [row.id, row]));
  for (const change of differences) {
    const item = items.get(change.id),
      row = current.get(change.id),
      sparse = evidence.itemSparse.filter((row) => row.id === change.id);
    assert.equal(sparse.length, 1);
    assert.equal(change.before, 0, "Refusing to replace an existing healing value");
    assert.equal(
      change.combinedSpellPower,
      0,
      "Combined spell power needs a separate reconciliation",
    );
    assert.deepEqual(row.issues, []);
    assert.deepEqual(row.effectIds, []);
    assert.deepEqual([item.name, item.ilvl], [row.name, row.itemLevel]);
    assert.deepEqual(
      [
        sparse[0].Display_lang,
        sparse[0].ItemLevel,
        sparse[0].RequiredLevel,
        sparse[0].InventoryType,
        sparse[0].OverallQualityID,
      ],
      [row.name, row.itemLevel, row.requiredLevel, row.inventoryType, row.quality],
    );
    assert(sparse[0].StatModifier_bonusStat.includes(41));
    assert.deepEqual(
      item,
      evidence.items.find((row) => row.id === change.id),
    );
  }
  assert.deepEqual(items.get(272681), evidence.observedWeapon);
  assert.deepEqual(
    [evidence.observedWeapon.stats[41], evidence.observedWeapon.stats[42]],
    [176, 58],
  );
  const db = structuredClone(parent),
    updated = new Map(db.items.map((row) => [row.id, row]));
  for (const change of differences) updated.get(change.id).stats[41] = change.after;
  for (const row of db.items) {
    const expected = structuredClone(items.get(row.id));
    const change = differences.find((change) => change.id === row.id);
    if (change) expected.stats[41] = change.after;
    assert.deepEqual(row, expected, "Unreviewed catalog data changed");
  }
  return {
    schema: "kfc-druid-static-healing-recovery.v1",
    db,
    changes: differences,
    preservedObservedWeaponId: 272681,
    numericalReuseAllowed: false,
    classMechanicsAdmission: false,
    publicationAllowed: false,
  };
}
