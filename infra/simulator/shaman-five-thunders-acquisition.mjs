import assert from "node:assert/strict";
import { prepareShamanFiveThundersDrafts } from "./shaman-five-thunders-drafts.mjs";
import { shamanFiveThundersItemIds } from "./shaman-five-thunders-source.mjs";
import { prebisSetSubsets, prebisSlotTypes } from "./prebis-pool.mjs";
import {
  collectShamanHealingEquipment,
  legalShamanHealingGear,
} from "./shaman-healing-equipment.mjs";

function one(rows, predicate, label) {
  const found = rows.filter(predicate);
  assert.equal(found.length, 1, label);
  return found[0];
}

/** Corroborate reward bundles without turning page evidence into live availability.
 * @param {{source:object,delivery:object}} input @returns {object}
 */
export function reviewShamanFiveThundersAcquisition(input) {
  const { source, delivery } = input;
  const prepared = prepareShamanFiveThundersDrafts(source);
  assert.equal(delivery.schema, "kfc-shaman-five-thunders-delivery-source.v1");
  assert.equal(delivery.liveServerAccessVerified, false);
  assert.equal(delivery.rewardChainCompletionVerified, false);
  assert.deepEqual([delivery.sourceClassMask, delivery.sourceFaction], [64, "Horde"]);
  assert.equal(delivery.relations.length, 4);
  const milestones = [...source.acquisition.relations]
    .sort((a, b) => a.phase - b.phase)
    .map((relation) => {
      const page = one(
        delivery.relations,
        (row) => row.questId === relation.questId,
        "Five Thunders delivery page",
      );
      const url = new URL(page.url);
      assert.equal(url.origin, "https://www.wowhead.com");
      assert(url.pathname.startsWith("/forever/quest=" + relation.questId + "/"));
      assert.equal(page.sourceProduct, "forever");
      assert.equal(page.phase, relation.phase);
      assert.equal(page.rewardDelivery, "all-listed-items");
      assert.equal(page.rewardSectionHeading, "You will receive:");
      assert.deepEqual(
        [...page.rewardIds].sort((a, b) => a - b),
        relation.rewardItemIds,
      );
      assert.equal(page.rewardQuantitiesVerified, false);
      return {
        phase: relation.phase,
        questId: relation.questId,
        url: page.url,
        rewardIds: [...relation.rewardItemIds],
        requiredItemIds: [...relation.requiredItemIds],
        rewardDelivery: "all-listed-items",
        deliveryPageCorroborated: true,
        rewardQuantitiesVerified: false,
        liveServerAccessVerified: false,
      };
    });
  return {
    schema: "kfc-shaman-five-thunders-acquisition.v1",
    sourceBuild: 70532,
    itemIds: [...shamanFiveThundersItemIds],
    setId: 519,
    excludedVariantSetId: 1679,
    rawWearClassMask: prepared.review.rawWearClassMask,
    referenceAcquisitionClassMask: 64,
    referenceAcquisitionFaction: "Horde",
    milestones,
    deliveryPageCount: 4,
    availability: "conditional-on-completed-reference-quest-chain",
    liveServerAccessVerified: false,
    currentCharacterProgressVerified: false,
    fullClassAdmission: false,
    startsNewClassClock: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}

/** @param {number} completedPhase @returns {object} */
export function shamanFiveThundersAccessPolicy(completedPhase) {
  assert(
    Number.isInteger(completedPhase) && completedPhase >= 0 && completedPhase <= 4,
    "Invalid reward-chain milestone",
  );
  return {
    schema: "kfc-shaman-five-thunders-access-policy.v1",
    id: completedPhase === 0 ? "no-five-thunders" : "five-thunders-through-" + completedPhase,
    completedPhase,
    accessReference: completedPhase === 0 ? "none" : "horde-shaman-quest-chain-completed-reference",
    liveServerAccessVerified: false,
  };
}

/** Resolve sources for one explicit profile while preserving current item and baseline data.
 * @param {{items:Map<number,object>,sources:Map<number,object>,source:object,delivery:object,policy:object,context:object}} input
 * @returns {object}
 */
export function resolveShamanFiveThundersSources(input) {
  const { items, sources, policy, context } = input;
  assert(items instanceof Map && sources instanceof Map);
  assert(
    policy && typeof policy === "object" && !Array.isArray(policy),
    "An explicit access policy is required",
  );
  assert.deepEqual(policy, shamanFiveThundersAccessPolicy(policy.completedPhase));
  assert.equal(context.playerClass, 7);
  assert([1, 2].includes(context.faction));
  assert.equal(context.factionName, context.faction === 1 ? "Alliance" : "Horde");
  if (policy.completedPhase > 0)
    assert.equal(context.faction, 2, "Only the captured Horde quest route is admitted");
  const acquisition = reviewShamanFiveThundersAcquisition(input);
  const prepared = prepareShamanFiveThundersDrafts(input.source);
  const resolved = new Map([...sources].map(([id, row]) => [id, structuredClone(row)]));
  const availableIds = [];
  const replacements = [];
  for (const draft of prepared.drafts) {
    const item = items.get(draft.itemId),
      original = sources.get(draft.itemId);
    assert(item && original, "Missing current Five Thunders record " + draft.itemId);
    for (const [name, value] of Object.entries(draft.statDraft))
      assert.deepEqual(
        item[name],
        value,
        "Five Thunders current item drift " + draft.itemId + "/" + name,
      );
    assert.deepEqual(
      original.sources,
      [],
      "Reference overlay requires the original unadmitted sources",
    );
    assert.equal(original.acquisitionAdmitted, false);
    assert.equal(original.serverAccessVerified, false);
    assert.equal(original.currentStatsReviewed, true);
    assert.equal(original.rawWearClassMask, -1);
    assert.deepEqual(original.referenceAcquisition.rewardRelations, draft.rewardRelations);
    assert.equal(original.questChoice, undefined);
    const milestone = one(
      acquisition.milestones,
      (row) => row.rewardIds.includes(item.id),
      "Reward milestone",
    );
    if (milestone.phase > policy.completedPhase) continue;
    const replacement = {
      ...structuredClone(original),
      maxCount: 1,
      // A flat questId denotes an exclusive choice in the common ownership reader.
      // These corroborated bundles use the existing nested quest provenance instead.
      sources: [
        {
          kind: "dungeon-quest",
          faction: "Horde",
          quests: [
            { id: milestone.questId, url: milestone.url, rewardDelivery: "all-listed-items" },
          ],
        },
      ],
      status: "current-client-page-corroborated-conditional-reward-access",
      conditionalAcquisitionAdmitted: true,
      accessPolicyId: policy.id,
      acquisitionAdmitted: false,
      serverAccessVerified: false,
      acquisition: {
        kind: "dungeon-set-upgrade",
        obtainableClass: 7,
        binding: "pickup",
        referenceFaction: "Horde",
        requiredQuestId: milestone.questId,
        completedThroughPhaseReference: policy.completedPhase,
        rewardDelivery: "all-listed-items",
        deliveryPageCorroborated: true,
        characterProgressVerified: false,
        currentServerVerified: false,
      },
    };
    resolved.set(item.id, replacement);
    replacements.push(replacement);
    availableIds.push(item.id);
  }
  assert.equal(availableIds.length, [0, 1, 3, 6, 8][policy.completedPhase]);
  return {
    sources: resolved,
    sourceOverrides: replacements,
    availableIds: availableIds.sort((a, b) => a - b),
    acquisition,
    policy: structuredClone(policy),
  };
}

function contextFor(profile) {
  return {
    profile: "restoration-shaman",
    playerClass: 7,
    requireCraftAudit: true,
    faction: profile.faction,
    factionName: profile.faction === 1 ? "Alliance" : "Horde",
    professions: [...profile.professions],
    originalItems: Array(17).fill(undefined),
    currentIds: new Set(),
  };
}

function putRewards(baseGear, ids, items) {
  const gear = structuredClone(baseGear);
  for (const id of ids) {
    const item = items.get(id);
    assert(item && item.setId === 519);
    const slots = prebisSlotTypes.flatMap((type, slot) => (type === item.type ? [slot] : []));
    assert.equal(slots.length, 1, "Five Thunders piece must have one body slot");
    gear.items[slots[0]] = { id };
  }
  return gear;
}

/** Add milestone profiles and every multi-piece set comparison without changing the baseline.
 * @param {{database:object,sources:object[],baselineDomain:object,source:object,delivery:object}} input
 * @returns {object}
 */
export function prepareShamanFiveThundersAccessDomain(input) {
  const { database, baselineDomain } = input;
  assert.equal(baselineDomain.schema, "kfc-shaman-healing-equipment-domain.v1");
  assert.equal(baselineDomain.profiles.length, 30);
  assert.equal(baselineDomain.statPruning, false);
  assert.equal(baselineDomain.qualityPruning, false);
  assert.equal(baselineDomain.weaponStyleLocked, false);
  const professions = [1, 2, 3, 4, 8, 11];
  const expectedProfiles = [1, 2].flatMap((faction) =>
    professions.flatMap((first, index) =>
      professions.slice(index + 1).map((second) => `${faction}-${first}-${second}`),
    ),
  );
  assert.deepEqual(baselineDomain.profiles.map((row) => row.id).sort(), expectedProfiles.sort());
  const items = new Map(database.items.map((row) => [row.id, row]));
  const sources = new Map(input.sources.map((row) => [row.id, row]));
  assert.equal(items.size, database.items.length);
  assert.equal(sources.size, input.sources.length);
  const profiles = [];
  const profileIds = new Set();
  for (const base of baselineDomain.profiles) {
    assert(!profileIds.has(base.id), "Duplicate baseline profile");
    profileIds.add(base.id);
    const context = contextFor(base);
    assert.equal(base.id, `${base.faction}-${base.professions.join("-")}`);
    assert(legalShamanHealingGear(base.seed, items, sources, context));
    assert.deepEqual(
      collectShamanHealingEquipment(items, sources, context).slots,
      base.slots,
      "Baseline domain changed",
    );
    for (const phase of base.faction === 2 ? [0, 1, 2, 3, 4] : [0]) {
      const policy = shamanFiveThundersAccessPolicy(phase);
      const resolved = resolveShamanFiveThundersSources({
        ...input,
        items,
        sources,
        policy,
        context,
      });
      const pool = collectShamanHealingEquipment(items, resolved.sources, context);
      const allowed = new Set(resolved.availableIds);
      for (const [slot, ids] of pool.slots.entries()) {
        const expected = [
          ...base.slots[slot],
          ...resolved.availableIds.filter((id) => items.get(id).type === prebisSlotTypes[slot]),
        ].sort((a, b) => a - b);
        assert.deepEqual(ids, expected, "Only the declared reward pieces may expand a pool");
        assert(
          ids.filter((id) => shamanFiveThundersItemIds.includes(id)).every((id) => allowed.has(id)),
        );
      }
      const witness = putRewards(base.seed, resolved.availableIds, items);
      assert(
        legalShamanHealingGear(witness, items, resolved.sources, context),
        "Combined reward bundle must be legal",
      );
      const candidates = [...prebisSetSubsets(resolved.availableIds)].map((ids) => {
        const gear = putRewards(base.seed, ids, items);
        assert(legalShamanHealingGear(gear, items, resolved.sources, context));
        assert.equal(
          gear.items.filter((row) => items.get(row.id)?.setId === 519).length,
          ids.length,
        );
        return { id: "five-thunders-" + ids.join("-"), itemIds: [...ids], gear };
      });
      assert.equal(
        candidates.length,
        2 ** resolved.availableIds.length - 1 - resolved.availableIds.length,
      );
      profiles.push({
        id: phase === 0 ? base.id : `${base.id}:${policy.id}`,
        baselineProfileId: base.id,
        faction: base.faction,
        professions: [...base.professions],
        accessPolicy: policy,
        availableRewardIds: [...resolved.availableIds],
        sourceOverrides: resolved.sourceOverrides,
        slots: pool.slots,
        seed: structuredClone(base.seed),
        seedPurpose: "unchanged-equipment-legality-control",
        fullRewardWitness: witness,
        setCandidates: candidates,
        mandatorySetCandidateIds: candidates.length ? [candidates.at(-1).id] : [],
        statisticalPruning: false,
        conditionalAccess: phase > 0,
      });
    }
  }
  assert.equal(profileIds.size, 30);
  assert.equal(profiles.filter((row) => row.faction === 1).length, 15);
  assert.equal(profiles.filter((row) => row.faction === 2).length, 75);
  assert.equal(new Set(profiles.map((row) => row.id)).size, 90);
  const candidates = new Set(profiles.flatMap((row) => row.slots.flat()));
  return {
    schema: "kfc-shaman-five-thunders-access-domain.v1",
    sourceBuild: 70532,
    acquisition: reviewShamanFiveThundersAcquisition(input),
    profiles,
    baselineProfiles: 30,
    conditionalProfiles: 60,
    profileCount: 90,
    totalDistinctCandidates: candidates.size,
    multiPieceSetComparisons: profiles.reduce((sum, row) => sum + row.setCandidates.length, 0),
    allBaselineCandidatesRetained: true,
    parentCatalogChanged: false,
    statPruning: false,
    qualityPruning: false,
    weaponStyleLocked: false,
    fullLoadoutValidationRequired: true,
    runtimeAndWorkloadBindingRequired: true,
    liveServerAccessVerified: false,
    fullClassAdmission: false,
    startsNewClassClock: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}
