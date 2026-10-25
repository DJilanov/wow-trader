import assert from "node:assert/strict";
import { hunterBeastmasterItemIds } from "./hunter-beastmaster-source.mjs";
import { prepareHunterBeastmasterDrafts } from "./hunter-beastmaster-drafts.mjs";
import { reviewHunterBeastmasterAcquisition } from "./hunter-beastmaster-acquisition.mjs";

/** Prepare a candidate database; model compilation and control qualification are separate gates.
 * @param {object} parent @param {{source: object, rewardSource: object, indexed: object}} evidence
 * @returns {object}
 */
export function prepareHunterBeastmasterCatalog(parent, evidence) {
  const prepared = prepareHunterBeastmasterDrafts(evidence.source),
    acquisition = reviewHunterBeastmasterAcquisition(evidence),
    db = globalThis.structuredClone(parent),
    additions = [],
    sources = [];
  assert.equal(new Set(parent.items.map((item) => item.id)).size, parent.items.length);
  for (const id of hunterBeastmasterItemIds) {
    assert(
      !parent.items.some((item) => item.id === id),
      "Refusing to replace existing Beastmaster item " + id,
    );
    const draft = prepared.drafts.find((row) => row.itemId === id),
      current = evidence.source.normalized.items.find((row) => row.itemId === id),
      relations = acquisition.relations.filter((row) => row.rewardItemIds.includes(id));
    assert(draft && current);
    assert.equal(draft.catalogAdmissionAllowed, false);
    assert.equal(draft.rawWearClassMask, -1);
    assert.equal(relations.length, 2);
    assert.deepEqual(relations.map((row) => row.faction).sort(), ["Alliance", "Horde"]);
    const item = { ...globalThis.structuredClone(draft.statDraft), classAllowlist: [2] };
    assert.equal(item.id, id);
    assert.equal(item.setId, 515);
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
          })),
        },
      ],
      acquisition: {
        kind: "dungeon-set-upgrade",
        obtainableClass: 2,
        requiredClassMask: 4,
        binding: "pickup",
        currentServerVerified: false,
        referenceCoverageComplete: true,
      },
      individualEffects: globalThis.structuredClone(draft.individualEffects),
      status: "current-stats-reference-acquisition-runtime-unqualified",
      notes: [
        "Base set 515 only; alternate 1669 is excluded. Hunter quest restrictions narrow the unrestricted raw wear mask.",
        "Pet effects remain distinct runtime requirements. No pet bonus is converted into owner stats.",
        "Four preserved page records and four indexed reward sections remain separate evidence tiers; quantities and live server delivery are unverified.",
      ],
    });
  }
  assert.deepEqual(db.items.slice(0, parent.items.length), parent.items);
  return {
    schema: "kfc-hunter-beastmaster-candidate-catalog.v1",
    db,
    additions,
    sources,
    rules: prepared.review,
    acquisition,
    modelCompiled: false,
    runtimeQualified: false,
    numericalOptimizationAllowed: false,
    publicationAllowed: false,
  };
}

/** Preserve exact ownership and per-item effects without making paired quest rewards exclusive.
 * @param {object} parent @param {{source: object, rewardSource: object, indexed: object}} evidence
 * @returns {object}
 */
export function prepareHunterBeastmasterInspection(parent, evidence) {
  const { review, drafts } = prepareHunterBeastmasterDrafts(evidence.source);
  reviewHunterBeastmasterAcquisition(evidence);
  const result = globalThis.structuredClone(parent),
    names = new Map([
      [2, "+8 to all resistances"],
      [4, "Ranged auto attacks have a 4% chance to restore 200 mana"],
      [6, "+40 attack power"],
      [8, "+200 armor"],
    ]);
  assert.equal(result.sets[515], undefined, "Refusing to replace existing Beastmaster inspection");
  result.sets[515] = {
    name: "Beastmaster Armor",
    effects: evidence.source.normalized.setEffects
      .filter((row) => row.ItemSetID === 515)
      .map((row) => ({
        threshold: row.Threshold,
        spellId: row.SpellID,
        name: names.get(row.Threshold),
      }))
      .sort((a, b) => a.threshold - b.threshold),
  };
  for (const id of hunterBeastmasterItemIds) {
    assert.equal(
      result.items[id],
      undefined,
      "Refusing to replace existing Beastmaster item inspection",
    );
    const draft = drafts.find((row) => row.itemId === id),
      sparse = evidence.source.tables.ItemSparse.find((row) => row.id === id);
    assert(draft && sparse);
    result.items[id] = {
      setId: 515,
      binding: sparse.Bonding,
      requiredLevel: sparse.RequiredLevel,
      effects: draft.individualEffects.map((effect) => ({
        ...effect,
        spellId: effect.parentSpellId,
        status: "hunter-runtime-prepared-model-controls-required",
      })),
      limitCategory: 0,
      questRewardOnce: true,
      questChoices: [],
    };
  }
  assert.equal(review.petEffects.length, 4);
  return result;
}
