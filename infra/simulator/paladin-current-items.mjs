import assert from "node:assert/strict";
import { currentLevel60Ratings, normalizeCurrentPrebisItem } from "./current-prebis-staging.mjs";
import { auditDruidCurrentStats } from "./druid-current-items.mjs";

export const paladinCurrentItemRecoveryIds = Object.freeze([
  5196, 6630, 6641, 6692, 6905, 9522, 9535, 10358, 10763, 14147, 272107,
]);

/** Recover the additional Paladin-domain disagreements after the shared 33-item corrections.
 * @param {object} parent @param {object[]} parentSources @param {object} evidence @returns {object}
 */
export function recoverPaladinCurrentItems(parent, parentSources, evidence) {
  assert.equal(evidence.schema, "kfc-paladin-current-items-source.v2");
  assert.equal(evidence.source.clientVersion, "1.60.1.70532");
  assert.equal(
    evidence.source.normalized.byteSha256,
    "e00c4897f5278e4dca9ac834adacfd4da07e61a2ca4382f881f2f6785faeefe7",
  );
  assert.deepEqual(evidence.reviewedIds, [...paladinCurrentItemRecoveryIds]);
  const expectedFields = new Map(
    paladinCurrentItemRecoveryIds.map((id) => [
      id,
      [
        "stats",
        ...([5196, 6692].includes(id) ? ["weaponDamageMin"] : []),
        ...([9522, 9535, 10358].includes(id) ? ["quality"] : []),
      ].sort(),
    ]),
  );
  const items = new Map(parent.items.map((row) => [row.id, row]));
  const sourceRows = new Map(parentSources.map((row) => [row.id, row]));
  const current = new Map(evidence.normalized.items.map((row) => [row.itemId, row]));
  const sparse = new Map(evidence.itemSparse.map((row) => [row.id, row]));
  assert.equal(items.size, parent.items.length);
  assert.equal(sourceRows.size, parentSources.length);
  assert.equal(current.size, 11);
  assert.equal(sparse.size, 11);
  const before = auditDruidCurrentStats(
    parent,
    evidence.normalized.items,
    paladinCurrentItemRecoveryIds,
  );
  assert.deepEqual(before, evidence.diagnostic);
  assert.equal(before.length, 16);
  const ratings = currentLevel60Ratings(evidence.ratings);
  const sets = new Map(evidence.normalized.sets.map((row) => [row.id, row]));
  const db = structuredClone(parent),
    sources = structuredClone(parentSources),
    changes = [];
  for (const id of paladinCurrentItemRecoveryIds) {
    const old = items.get(id),
      row = current.get(id),
      raw = sparse.get(id),
      source = sourceRows.get(id);
    assert(old && row && raw && source, "Missing reviewed Paladin current record " + id);
    assert.deepEqual(
      old,
      evidence.items.find((entry) => entry.id === id),
    );
    assert.deepEqual(
      source,
      evidence.sources.find((entry) => entry.id === id),
    );
    assert.deepEqual(row.effectIds, [], "Additional current effects need a separate review");
    const normalized = normalizeCurrentPrebisItem(row, raw, old, ratings, sets);
    const next = {
      ...old,
      ...normalized,
      phase: old.phase ?? normalized.phase,
      expansion: old.expansion ?? normalized.expansion,
    };
    const changed = [...new Set([...Object.keys(old), ...Object.keys(next)])]
      .filter((key) => JSON.stringify(old[key]) !== JSON.stringify(next[key]))
      .sort();
    assert.deepEqual(changed, expectedFields.get(id), "Unreviewed metadata change " + id);
    db.items[db.items.findIndex((item) => item.id === id)] = next;
    const updatedSource = sources.find((entry) => entry.id === id);
    updatedSource.requiredLevel = row.requiredLevel;
    updatedSource.status = "current-client-stats-reviewed-acquisition-provisional";
    updatedSource.statReview = {
      build: 70532,
      fields: changed,
      historicalAcquisitionPreserved: true,
      scope: "declared healing workloads",
    };
    changes.push({ id, before: old, after: next, fields: changed });
  }
  assert.deepEqual(
    auditDruidCurrentStats(db, evidence.normalized.items, paladinCurrentItemRecoveryIds),
    [],
  );
  for (const item of db.items)
    if (!paladinCurrentItemRecoveryIds.includes(item.id))
      assert.deepEqual(item, items.get(item.id));
  for (const source of sources)
    if (!paladinCurrentItemRecoveryIds.includes(source.id))
      assert.deepEqual(source, sourceRows.get(source.id));
  return {
    schema: "kfc-paladin-current-item-recovery.v1",
    db,
    sources,
    changes,
    explicitDifferencesBefore: 16,
    explicitDifferencesAfter: 0,
    numericalReuseAllowed: false,
    classMechanicsAdmission: false,
    publicationAllowed: false,
  };
}
