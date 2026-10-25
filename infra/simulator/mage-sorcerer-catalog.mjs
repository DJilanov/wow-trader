import assert from "node:assert/strict";
import { mageSorcererItemIds } from "./mage-sorcerer-source.mjs";
import { prepareMageSorcererDrafts } from "./mage-sorcerer-drafts.mjs";
import { reviewMageSorcererAcquisition } from "./mage-sorcerer-acquisition.mjs";

/** Append the exact base items as candidates without granting model or numerical admission.
 * @param {object} parent @param {{source:object,reference:object}} evidence @returns {object}
 */
export function prepareMageSorcererCatalog(parent, evidence) {
  const prepared = prepareMageSorcererDrafts(evidence.source),
    acquisition = reviewMageSorcererAcquisition(evidence),
    db = globalThis.structuredClone(parent),
    additions = [],
    sources = [];
  assert.equal(new Set(parent.items.map((item) => item.id)).size, parent.items.length);
  for (const id of mageSorcererItemIds) {
    assert(
      !parent.items.some((item) => item.id === id),
      "Refusing to replace existing Sorcerer item " + id,
    );
    const draft = prepared.drafts.find((row) => row.itemId === id),
      current = evidence.source.normalized.items.find((row) => row.itemId === id),
      relations = acquisition.relations.filter((row) => row.rewardItemIds.includes(id));
    assert(draft && current);
    assert.equal(draft.rawWearClassMask, -1);
    assert.equal(draft.catalogAdmissionAllowed, false);
    assert.deepEqual(draft.acquisitionClassAllowlist, [3]);
    assert.deepEqual(relations.map((row) => row.faction).sort(), ["Alliance", "Horde"]);
    const item = { ...globalThis.structuredClone(draft.statDraft), classAllowlist: [3] };
    assert.equal(item.id, id);
    assert.equal(item.setId, 517);
    assert.equal(item.stats.length, 44);
    additions.push(item);
    db.items.push(item);
    sources.push({
      id,
      name: current.name,
      requiredLevel: current.requiredLevel,
      sources: [
        {
          kind: "dungeon-quest",
          quests: relations.map((row) => ({
            id: row.questId,
            faction: row.faction,
            url: row.url,
            sourceKind: row.sourceKind,
            exactPageItemLinksReviewed: row.exactPageItemLinksReviewed,
          })),
        },
      ],
      acquisition: {
        kind: "dungeon-set-upgrade",
        obtainableClass: 3,
        requiredClassMask: 128,
        binding: "pickup",
        currentServerVerified: false,
        referenceRewardNameCoverageComplete: true,
        exactPageItemLinkRelations: relations.filter((row) => row.exactPageItemLinksReviewed)
          .length,
      },
      status: "current-stats-baked-quest-map-reference-corroborated-model-controls-required",
      notes: [
        "Base set517 only; alternate1671 is excluded. Mage quest restrictions narrow the unrestricted raw wear mask.",
        "Eight reward sections corroborate names; four quest pages have exact base-item links reviewed. Quantities and live delivery remain unobserved.",
        "Client freeze interrupt flags are unresolved; configured immunity/DR and stationary DPS scope remain explicit.",
      ],
    });
  }
  assert.deepEqual(db.items.slice(0, parent.items.length), parent.items);
  return {
    schema: "kfc-mage-sorcerer-candidate-catalog.v1",
    db,
    additions,
    sources,
    acquisition,
    rules: prepared.review,
    modelCompiled: false,
    runtimeQualified: false,
    numericalOptimizationAllowed: false,
    publicationAllowed: false,
  };
}

/** Annotate set/equipment eligibility without making simultaneous quest rewards exclusive.
 * @param {object} parent @param {{source:object,reference:object}} evidence @returns {object}
 */
export function prepareMageSorcererInspection(parent, evidence) {
  reviewMageSorcererAcquisition(evidence);
  const result = globalThis.structuredClone(parent),
    names = new Map([
      [2, "+8 to all nonphysical resistances"],
      [4, "Incoming-hit freeze:2%,60-second cooldown,three-second root"],
      [6, "+23 spell power and healing"],
      [8, "+200 bonus armor"],
    ]);
  assert.equal(result.sets[517], undefined, "Refusing to replace Sorcerer set inspection");
  result.sets[517] = {
    name: "Sorcerer's Regalia",
    effects: evidence.source.normalized.setEffects
      .filter((row) => row.ItemSetID === 517)
      .map((row) => ({
        threshold: row.Threshold,
        spellId: row.SpellID,
        name: names.get(row.Threshold),
      }))
      .sort((a, b) => a.threshold - b.threshold),
  };
  for (const id of mageSorcererItemIds) {
    assert.equal(result.items[id], undefined, "Refusing to replace Sorcerer item inspection");
    const sparse = evidence.source.tables.ItemSparse.find((row) => row.id === id);
    assert(sparse);
    result.items[id] = {
      setId: 517,
      binding: sparse.Bonding,
      requiredLevel: sparse.RequiredLevel,
      effects: [],
      limitCategory: 0,
      questRewardOnce: true,
      questChoices: [],
    };
  }
  return result;
}

/** Attach candidate acquisition to the UI database with its original evidence limits intact.
 * @param {object} parent @param {object[]} sources @returns {object}
 */
export function appendMageSorcererImports(parent, sources) {
  assert(Array.isArray(parent.items) && Array.isArray(parent.currentItems));
  const result = globalThis.structuredClone(parent),
    seen = new Set([...parent.items, ...parent.currentItems].map((row) => row.id));
  assert.equal(seen.size, parent.items.length + parent.currentItems.length);
  assert.deepEqual(
    sources.map((row) => row.id),
    [...mageSorcererItemIds],
  );
  for (const source of sources) {
    assert(!seen.has(source.id), "Refusing to replace imported Sorcerer acquisition");
    assert.equal(source.acquisition.obtainableClass, 3);
    assert.equal(source.acquisition.requiredClassMask, 128);
    assert.equal(source.acquisition.currentServerVerified, false);
    assert.equal(source.acquisition.referenceRewardNameCoverageComplete, true);
    seen.add(source.id);
    result.currentItems.push({
      ...globalThis.structuredClone(source),
      statsProvenance: "current-client",
      acquisitionProvenance: "forever-baked-item-map-with-indexed-name-corroboration",
      acquisition: {
        ...source.acquisition,
        allowed: true,
        evidence:
          "Same-TOC Mage quest/item associations; eight indexed reward sections corroborate names, four include reviewed exact base links. Quantities/live delivery unobserved.",
      },
      effectReviews: [],
    });
  }
  return result;
}
