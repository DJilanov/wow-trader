import assert from "node:assert/strict";

export const priestHealingStatRecoveryIds = Object.freeze([
  2816, 4746, 5202, 6226, 6324, 6465, 6682, 6901, 7691, 7708, 7720, 9407, 9415, 9623, 10359, 16690,
  16691, 16692, 16693, 16694, 16695, 16696, 16697, 19507, 227862,
]);

/** Recover reviewed direct healing values without overwriting observed vendor corrections.
 * Other stats, acquisition, item effects and set admission keep their own provenance.
 * @param {object} parent @param {object} evidence @returns {object}
 */
export function recoverPriestStaticHealing(parent, evidence) {
  assert.equal(evidence.schema, "kfc-priest-static-healing-source.v1");
  assert.equal(evidence.currentClientVersion, "1.60.1.70532");
  assert.equal(
    evidence.normalizedSha256,
    "e00c4897f5278e4dca9ac834adacfd4da07e61a2ca4382f881f2f6785faeefe7",
  );
  assert.deepEqual(evidence.reviewedIds, [...priestHealingStatRecoveryIds]);
  const original = JSON.stringify(parent),
    items = new Map(parent.items.map((row) => [row.id, row])),
    current = new Map(evidence.currentItems.map((row) => [row.itemId, row]));
  assert.equal(items.size, parent.items.length, "Duplicate parent item identity");
  assert.equal(current.size, evidence.currentItems.length, "Duplicate current item identity");
  const changes = [];
  for (const id of priestHealingStatRecoveryIds) {
    const item = items.get(id),
      row = current.get(id);
    assert(item && row, `Missing reviewed healing item ${id}`);
    assert.equal(item.name, row.name);
    assert.equal(item.ilvl, row.itemLevel);
    assert.deepEqual(row.issues, []);
    assert.equal(item.stats.length, 44);
    assert(item.stats.every(Number.isFinite));
    assert.equal(item.stats[41], 0, `Refusing to replace an existing healing value ${id}`);
    const healing = row.stats.filter((stat) => stat.statType === 41);
    assert.equal(healing.length, 1, `Ambiguous healing modifier ${id}`);
    assert(Number.isFinite(healing[0].value) && healing[0].value > 0);
    changes.push({
      id,
      name: item.name,
      oldHealingPower: 0,
      healingPower: healing[0].value,
      itemEffectIds: [...row.effectIds],
      scope: "direct item healing stat only",
    });
  }
  const observed = evidence.observedMace,
    mace = items.get(272681);
  assert.equal(observed.captureBuild, "69913");
  assert.equal(
    observed.sourceSha256,
    "81af4753abb7389b775fd7edf3cdf0a16f5bfaf8db07cd3c789c12ddc6839d76",
  );
  assert.equal(observed.record.itemID, 272681);
  assert.equal(observed.record.item.stats.ITEM_MOD_SPELL_HEALING_DONE_SHORT, 176);
  assert.equal(observed.record.item.stats.ITEM_MOD_SPELL_DAMAGE_DONE_SHORT, 58);
  assert(mace, "Missing the observed vendor weapon");
  assert.deepEqual(
    [mace.stats[41], mace.stats[42], mace.weaponDamageMin, mace.weaponDamageMax],
    [176, 58, 64, 119],
  );
  const db = globalThis.structuredClone(parent),
    byId = new Map(db.items.map((row) => [row.id, row]));
  for (const change of changes) byId.get(change.id).stats[41] = change.healingPower;
  assert.equal(JSON.stringify(parent), original);
  for (const item of db.items) {
    const previous = items.get(item.id),
      before = [...previous.stats],
      after = [...item.stats];
    before[41] = 0;
    after[41] = 0;
    assert.deepEqual(after, before, "A nonhealing stat changed");
    assert.deepEqual(
      { ...item, stats: [] },
      { ...previous, stats: [] },
      "Other item metadata changed",
    );
  }
  return {
    schema: "kfc-priest-static-healing-recovery.v1",
    db,
    changes,
    preservedObserved: {
      id: 272681,
      healingPower: 176,
      spellDamage: 58,
      captureBuild: "69913",
      currentServerVerified: false,
    },
    scope:
      "25 reviewed direct healing stats; observed weapon priority preserved; not complete stat/effect/set reconciliation",
    classMechanicsAdmission: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}
