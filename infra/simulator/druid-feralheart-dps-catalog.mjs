import assert from "node:assert/strict";
import { druidFeralheartItemIds, extendDruidFeralheartCatalog } from "./druid-feralheart-model.mjs";
import { reviewDruidFeralheartDpsAcquisition } from "./druid-feralheart-dps-acquisition.mjs";

/** Add current base items while preserving every parent row and the original source/review distinction.
 * @param {object} parent @param {{source:object,reference:object}} evidence @returns {object}
 */
export function prepareDruidFeralheartDpsCatalog(parent, evidence) {
  const extended = extendDruidFeralheartCatalog(parent, evidence.source),
    acquisition = reviewDruidFeralheartDpsAcquisition(evidence),
    sources = extended.sources.map((source) => ({
      ...source,
      sources: [
        {
          kind: "dungeon-quest",
          quests: acquisition.relations
            .filter((row) => row.rewardIds.includes(source.id))
            .map((row) => ({
              id: row.questId,
              faction: row.faction,
              url: row.url,
              originalSourceUrl: row.originalSourceUrl,
              sourceKind: row.referenceSourceKind,
              exactPageItemLinksReviewed: row.exactPageItemLinksReviewed,
            })),
        },
      ],
      acquisition: {
        ...source.acquisition,
        requiredClassMask: 1024,
        referenceRewardNameCoverageComplete: true,
        exactPageItemLinkRelations: 0,
      },
      status: "current-stats-preserved-quest-map-forever-name-corroborated-model-controls-required",
      notes: [
        "Base set513 only; alternate1667 remains a separate identity.",
        "Seven original Forever name reviews plus one new indexed quest8913 name section; exact item-ID evidence is not upgraded.",
        "Reward quantities and live delivery remain unobserved. Original historical source is preserved separately.",
      ],
    }));
  for (const source of sources)
    assert.deepEqual(source.sources[0].quests.map((row) => row.faction).sort(), [
      "Alliance",
      "Horde",
    ]);
  return {
    schema: "kfc-druid-feralheart-dps-candidate-catalog.v1",
    ...extended,
    sources,
    acquisition,
    modelCompiled: false,
    runtimeQualified: false,
    numericalOptimizationAllowed: false,
  };
}

/** Preserve both six-piece spells and avoid inventing mutually exclusive upgrade rewards.
 * @param {object} parent @param {{source:object,reference:object}} evidence @returns {object}
 */
export function prepareDruidFeralheartDpsInspection(parent, evidence) {
  reviewDruidFeralheartDpsAcquisition(evidence);
  const result = globalThis.structuredClone(parent),
    names = new Map([
      [18679, "+8 to all nonphysical resistances"],
      [
        27781,
        "Incoming melee/ranged hit:2% chance to restore current resource (300 mana/10 rage/40 energy)",
      ],
      [9334, "+26 attack power and ranged attack power"],
      [9344, "+15 magical damage and healing"],
      [14803, "+200 bonus armor"],
    ]);
  assert.equal(result.sets[513], undefined, "Refusing to replace Feralheart set inspection");
  result.sets[513] = {
    name: "Feralheart Raiment",
    effects: evidence.source.normalized.setEffects
      .filter((row) => row.ItemSetID === 513)
      .map((row) => {
        assert(names.has(row.SpellID));
        return { threshold: row.Threshold, spellId: row.SpellID, name: names.get(row.SpellID) };
      })
      .sort((a, b) => a.threshold - b.threshold || a.spellId - b.spellId),
  };
  for (const id of druidFeralheartItemIds) {
    assert.equal(result.items[id], undefined, "Refusing to replace Feralheart item inspection");
    const sparse = evidence.source.tables.ItemSparse.find((row) => row.id === id);
    assert(sparse);
    result.items[id] = {
      setId: 513,
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

/** Carry candidate access limits into imports without claiming observed server acquisition.
 * @param {object} parent @param {object[]} sources @returns {object}
 */
export function appendDruidFeralheartDpsImports(parent, sources) {
  assert(Array.isArray(parent.items) && Array.isArray(parent.currentItems));
  const result = globalThis.structuredClone(parent),
    seen = new Set([...parent.items, ...parent.currentItems].map((row) => row.id));
  assert.equal(seen.size, parent.items.length + parent.currentItems.length);
  assert.deepEqual(
    sources.map((row) => row.id),
    [...druidFeralheartItemIds],
  );
  for (const source of sources) {
    assert(!seen.has(source.id), "Refusing to replace Feralheart acquisition");
    assert.equal(source.acquisition.obtainableClass, 1);
    assert.equal(source.acquisition.requiredClassMask, 1024);
    assert.equal(source.acquisition.currentServerVerified, false);
    assert.equal(source.acquisition.referenceRewardNameCoverageComplete, true);
    seen.add(source.id);
    result.currentItems.push({
      ...globalThis.structuredClone(source),
      statsProvenance: "current-client",
      acquisitionProvenance: "preserved-druid-quest-map-with-forever-name-corroboration",
      acquisition: {
        ...source.acquisition,
        allowed: true,
        evidence:
          "Preserved Druid class-quest reward map; seven prior Forever name reviews and new indexed quest8913 section. Exact-ID evidence unchanged; quantities/live delivery unobserved.",
      },
      effectReviews: [],
    });
  }
  return result;
}
