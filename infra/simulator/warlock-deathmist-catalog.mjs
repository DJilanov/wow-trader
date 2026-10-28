import assert from "node:assert/strict";
import { prepareWarlockDeathmistDrafts } from "./warlock-deathmist-drafts.mjs";

/** Append reviewed base items and acquisition references without replacing parent data.
 * @param {object} parent
 * @param {object} evidence
 * @returns {object}
 */
export function extendWarlockDeathmistCatalog(parent, evidence) {
  const prepared = prepareWarlockDeathmistDrafts(evidence);
  assert(Array.isArray(parent.items));
  const existing = new Set(parent.items.map((row) => row.id));
  assert.equal(existing.size, parent.items.length, "Duplicate parent catalog items");
  const db = structuredClone(parent);
  const additions = [],
    sources = [];
  for (const draft of prepared.drafts) {
    assert(!existing.has(draft.itemId), "Refusing to replace Deathmist item " + draft.itemId);
    const current = evidence.normalized.items.find((row) => row.itemId === draft.itemId);
    const item = {
      ...structuredClone(draft.statDraft),
      classAllowlist: [...draft.acquisitionClassAllowlist],
    };
    additions.push(item);
    db.items.push(item);
    // Faction quests are alternative acquisition routes. Placing two faction
    // restrictions on the item would incorrectly exclude it for both sides.
    sources.push({
      id: item.id,
      name: item.name,
      requiredLevel: current.requiredLevel,
      maxCount: 1,
      sources: [
        {
          kind: "dungeon-quest",
          quests: draft.rewardRelations.map((row) => ({
            id: row.questId,
            faction: row.faction,
            phase: row.phase,
            url: "https://www.wowhead.com/forever/quest=" + row.questId,
          })),
        },
      ],
      acquisition: {
        kind: "dungeon-set-upgrade",
        obtainableClass: 8,
        binding: "pickup",
        policy: "warlock-all-four-baked-quest-phases-reference",
        currentServerVerified: false,
        rewardQuantitiesVerified: false,
        simultaneousDeliveryVerified: false,
      },
      status: "current-client-reviewed-quest-acquisition-reference",
      notes: [
        "Base set 518 only. Class-quest acquisition and fear immunity use disclosed model references; live delivery is unverified.",
      ],
    });
  }
  return { db, additions, sources, numericalReuseAllowed: false, publicationAllowed: false };
}

/** Extend the actual ownership/set inspection contract for all eight base pieces.
 * @param {object} parent
 * @param {object} evidence
 * @returns {object}
 */
export function extendWarlockDeathmistInspection(parent, evidence) {
  const prepared = prepareWarlockDeathmistDrafts(evidence);
  assert(parent.sets && parent.items);
  assert.equal(parent.sets[518], undefined, "Refusing to replace Deathmist inspection");
  const result = structuredClone(parent);
  const labels = new Map([
    [2, "+8 to all resistances"],
    [4, "Incoming-hit fear; raid bosses are immune under this model reference"],
    [6, "+23 magical damage and healing"],
    [8, "+200 bonus armor"],
  ]);
  result.sets[518] = {
    name: "Deathmist Raiment",
    effects: prepared.review.thresholdSpells.map(([threshold, spellId]) => ({
      threshold,
      spellId,
      name: labels.get(threshold),
    })),
  };
  for (const draft of prepared.drafts) {
    assert.equal(
      result.items[draft.itemId],
      undefined,
      "Refusing to replace Deathmist item inspection",
    );
    const sparse = evidence.tables.ItemSparse.find((row) => row.id === draft.itemId);
    result.items[draft.itemId] = {
      setId: 518,
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
