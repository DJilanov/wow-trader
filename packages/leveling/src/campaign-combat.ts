import type { CampaignPlan, CampaignSource } from "./campaign.js";
import type { ImportedDirective } from "./guide-archive.js";
import type { PremadeMember } from "./premade-model.js";
import {
  combatObjectiveKey,
  type CampaignCombatPlan,
  type CombatActivity,
  type CombatDataset,
  type CombatNpc,
  type CombatObjective,
} from "./combat-model.js";
import {
  advanceCombatPosition,
  estimateCreatureKills,
  type CombatXpPosition,
} from "./combat-xp.js";
import {
  addIncidentalCombatXp,
  incidentalCombatRowFields,
  incidentalCombatMessage,
  type IncidentalCombatEstimate,
} from "./campaign-incidental-combat.js";
import { estimatePartyCreatureKills } from "./combat-party-xp.js";
import { estimateBoundedPartyKills, type CampaignXpBounds } from "./campaign-xp-bounds.js";
import { getPremadeQuest, getPremadeStop } from "./premade.js";
import { filterDungeonLootSources } from "./campaign-dungeon-loot.js";
import {
  campaignPlanSourceProfile,
  createCampaignSourceProfile,
} from "./campaign-source-profile.js";
import { LEVELING_RACES } from "./profile.js";
import { sharedCampaignQuestSources } from "./campaign-shared-source.js";
import { getGuideStepView } from "./guide-archive.js";
import { chapterEligibility } from "./chapter-catalog.js";
import { DUNGEON_VISITS } from "./dungeon-catalog.js";
import { resolveCombatQuota } from "./combat-loot.js";
import type { LootScenario, LootKillEstimate } from "./quest-loot.js";
import { isExplicitVendorPurchase, isGeneratedVendorPurchase } from "./combat-purchase.js";
import {
  isExplorationObjective,
  isFriendlyHealingObjective,
  isViewingDialogueObjective,
  isLivingCaptureObjective,
  isItemDialogueObjective,
  nonKillCollectionMethod,
} from "./combat-nonkill.js";
import { attachCampaignLootTargets } from "./campaign-loot-targets.js";
import { resolveJointCombatQuota } from "./combat-loot-joint.js";
import { referencedQuestObjectiveIndexes } from "./campaign-quest-objectives.js";
import { attachCampaignItemWork } from "./campaign-item-work.js";
import { compileCampaignMaterialWork } from "./campaign-material-source.js";
import { combineCampaignSourceWork } from "./campaign-source-work.js";
import { attachCampaignReferenceFarmTargets } from "./campaign-reference-farm-targets.js";
import { isExplicitGroundPickup, isGeneratedGroundPickup } from "./campaign-ground-pickup.js";
import { displayOnlyQuestPhases } from "./campaign-source-display.js";
import { attachDungeonStarterWork } from "./campaign-dungeon-starters.js";
import { attachCampaignPunchCardPuzzle } from "./campaign-punch-card.js";
import { attachCampaignHakkarEvent } from "./campaign-hakkar-event.js";
import { felvineConversionObjectives } from "./campaign-felvine-conversion.js";
import { applyReviewedCombatNpcLevels } from "./combat-reviewed-npc-levels.js";
import { selectDungeonCollectionSources } from "./campaign-dungeon-collections.js";
import { canExcludeUnpricedLootPayout, type UnpricedLootPayoutCandidate } from "./campaign-acquisition-xp.js";
import { attachReviewedDungeonGroundMethods } from "./campaign-reviewed-dungeon-ground.js";
import { applyNarrativeEncounterReferences, attachNarrativeEventGuidance, narrativeEventObjectives } from "./campaign-narrative-events.js";
import { attachCampaignRingUpgrade } from "./campaign-ring-upgrade.js";
import { isOptionalCombatUtilityUse } from "./combat-source-utility.js";

import {
  combatTargetName as targetName,
  combatTargetNameForms as targetNameForms,
  questCreatureKillCount,
} from "./combat-quest-counter.js";
export { questCreatureKillCount } from "./combat-quest-counter.js";

export interface CombatReferenceIndex {
  readonly npcs: ReadonlyMap<number, CombatNpc>;
  readonly quests: ReadonlyMap<number, CombatDataset["quests"][number]>;
}
export function indexCombatReferences(
  dataset: Pick<CombatDataset, "npcs" | "quests">,
): CombatReferenceIndex {
  return {
    npcs: new Map(dataset.npcs.map((npc) => [npc.id, npc])),
    quests: new Map(dataset.quests.map((quest) => [quest.questId, quest])),
  };
}


function referenceObjectives(
  questId: number,
  index: CombatReferenceIndex,
  instructions: readonly string[],
): readonly CombatObjective[] {
  const quest = index.quests.get(questId);
  if (!quest) return [];
  if (!quest.onlyCreatureObjectives) {
    const mapped = quest.itemObjectives?.filter((item) => item.objectiveIndex !== null) ?? [];
    if (mapped.length) {
      const items = mapped.map((item): CombatObjective => {
        const ground =
          item.groundPickup || isGeneratedGroundPickup(quest, item.objectiveIndex!, instructions);
        const purchase = isGeneratedVendorPurchase(item, instructions, index.npcs);
        return {
          questId,
          objectiveIndex: item.objectiveIndex!,
          npcIds: item.provided || ground || purchase ? [] : item.npcIds,
          requiredKills: null,
          credit: item.provided || ground || purchase ? "non-combat" : "personal-loot",
          source: `QuestieDB corrected quest ${questId}`,
          reason: item.provided
            ? "The item is provided at pickup; no additional collection kills are assumed after acceptance."
            : purchase
              ? "Each player buys the full item quota from the named, source-qualified vendor; no acquisition kills are assumed."
              : ground
                ? item.quantity === 1
                  ? "Each player loots one item from the source-backed world object; no kills or respawn time are assumed."
                  : `Each player collects ${item.quantity} items from the source-backed world object; no kills or respawn time are assumed.`
                : "Loot kills require compatible drop and sharing evidence.",
          ...(item.provided || ground || purchase
            ? {}
            : {
                loot: {
                  itemId: item.itemId,
                  quantity: item.quantity,
                  sharing: item.sharing,
                  ...(item.sharingReference ? { sharingReference: item.sharingReference } : {}),
                },
              }),
        };
      });
      const quotas = quest.killQuotas ?? [];
      const completeKills =
        quest.creatureIds.length > 0 &&
        quotas.length === quest.creatureIds.length &&
        new Set(quotas.map((row) => row.npcId)).size === quest.creatureIds.length &&
        quotas.every(
          (row) => quest.creatureIds.includes(row.npcId) &&
            !mapped.some((item) => item.objectiveIndex === row.objectiveIndex),
        );
      return [
        ...(completeKills
          ? quotas.map((row): CombatObjective => ({
              questId,
              objectiveIndex: row.objectiveIndex,
              npcIds: [row.npcId],
              requiredKills: quest.killQuotaConflicts?.includes(row.objectiveIndex) ? null : row.kills,
              credit: quest.killQuotaConflicts?.includes(row.objectiveIndex) ? "unknown" : "shared-kills",
              source: row.source,
              reason: quest.killQuotaConflicts?.includes(row.objectiveIndex)
                ? "Kill quota references conflict; no numeric death count is assumed."
                : null,
              ...(quest.killQuotaConflicts?.includes(row.objectiveIndex)
                ? { quotaConflict: true as const }
                : {}),
            }))
          : []),
        ...items,
      ];
    }
    const npcIds = quest.creatureIds.length ? quest.creatureIds : quest.itemCreatureIds;
    return [
      {
        questId,
        objectiveIndex: 1,
        npcIds,
        requiredKills: null,
        credit: quest.creatureIds.length
          ? "unknown"
          : npcIds.length
            ? "personal-loot"
            : "non-combat",
        source: `QuestieDB corrected quest ${questId}`,
        reason: npcIds.length
          ? "Mixed objectives or personal drops need a reviewed kill/loot quota."
          : null,
      },
    ];
  }
  return quest.creatureIds.map((npcId, offset) => {
    const npc = index.npcs.get(npcId);
    const providerCount = npc
      ? questCreatureKillCount(
          npc,
          quest.objectiveText,
          quest.creatureIds.flatMap((id) => index.npcs.get(id)?.name ?? []),
        )
      : null;
    const reviewed = quest.killQuotas?.find(
      (quota) => quota.objectiveIndex === offset + 1 && quota.npcId === npcId,
    );
    const conflict =
      quest.killQuotaConflicts?.includes(offset + 1) ||
      (reviewed !== undefined && providerCount !== null && reviewed.kills !== providerCount);
    const count = conflict ? null : (reviewed?.kills ?? providerCount);
    return {
      questId,
      objectiveIndex: offset + 1,
      npcIds: [npcId],
      requiredKills: count,
      credit: count === null ? ("unknown" as const) : ("shared-kills" as const),
      ...(conflict ? { quotaConflict: true as const } : {}),
      source: reviewed?.source ?? `QuestieDB corrected quest ${questId} objective ${offset + 1}`,
      reason: conflict
        ? "Kill quota references conflict or their source identity is unresolved."
        : count === null
          ? "The target is known, but its numeric kill quota is unverified."
          : null,
    };
  });
}

export function resolveCombatObjectives(
  directives: readonly ImportedDirective[],
  dataset: CombatReferenceIndex,
  source: string,
): readonly CombatObjective[] {
  const { npcs, quests } = dataset;
  const displayOnly = displayOnlyQuestPhases(directives);
  return directives
    .filter(
      (directive) =>
        directive.tag === ".complete" && directive.questId !== null && !displayOnly.has(directive),
    )
    .map((directive): CombatObjective => {
      const questId = directive.questId!,
        quest = quests.get(questId);
      const objectiveIndex = Number(directive.arguments.split(",")[1] ?? 1);
      if (!Number.isSafeInteger(objectiveIndex) || objectiveIndex < 1 || objectiveIndex > 100)
        return {
          questId,
          objectiveIndex: 1,
          npcIds: [],
          requiredKills: null,
          credit: "unknown",
          source,
          reason: "The source objective index is invalid; no kill quota is assumed.",
        };
      if (quest?.killQuotaConflicts?.includes(objectiveIndex))
        return {
          questId,
          objectiveIndex,
          npcIds: quest.creatureIds[objectiveIndex - 1]
            ? [quest.creatureIds[objectiveIndex - 1]!]
            : [],
          requiredKills: null,
          credit: "unknown",
          source,
          reason: "Kill quota references conflict or their source identity is unresolved.",
          quotaConflict: true,
        };
      const counter = /^(.*?)\s*\(x?(\d+)\)\s*$/i.exec(directive.text);
      const label = counter ? targetName(counter[1]!) : "";
      const offset = directives.indexOf(directive);
      const next = directives.findIndex(
        (entry, index) => index > offset && entry.tag === ".complete",
      );
      const segment = directives.slice(offset, next < 0 ? undefined : next);
      const segmentMobs = segment
        .filter((entry) => entry.tag === ".mob")
        .map((entry) => targetName(entry.arguments));
      let matches = (quest?.creatureIds ?? []).filter(
        (id) => targetName(npcs.get(id)?.name ?? "") === label,
      );
      if (label && !matches.length)
        matches = (quest?.creatureIds ?? []).filter((id) => {
          const npc = npcs.get(id);
          return (
            npc !== undefined &&
            segmentMobs.includes(targetName(npc.name)) &&
            targetNameForms(npc.name).has(label) &&
            quest?.killQuotas?.some(
              (quota) => quota.objectiveIndex === objectiveIndex && quota.npcId === id,
            )
          );
        });
      if (!label) {
        matches = (quest?.creatureIds ?? []).filter((id) =>
          segmentMobs.includes(targetName(npcs.get(id)?.name ?? "")),
        );
        if (matches.length !== 1 && quest?.onlyCreatureObjectives) {
          const id = quest.creatureIds[objectiveIndex - 1];
          matches = id === undefined ? [] : [id];
        }
      }
      const matched = matches.length === 1 ? npcs.get(matches[0]!) : undefined;
      const interactive =
        segment.some((entry) =>
          [".use", ".cast", ".gossip", ".interact"].includes(entry.tag) &&
          !(matched && segmentMobs.includes(targetName(matched.name)) &&
            isOptionalCombatUtilityUse(entry, quest, objectiveIndex)),
        ) &&
        !/^(?:kill|slay|destroy)\s/i.test(directive.text);
      const killHint =
        /^(?:kill|slay|destroy)\s/i.test(directive.text) ||
        directives.some((entry) => entry.tag === ".mob" && targetName(entry.arguments) === label) ||
        directives.some(
          (entry) => entry.tag === "text" && /\b(?:kill|slay|destroy)\b/i.test(entry.text),
        );
      const providerCount = matched
        ? questCreatureKillCount(
            matched,
            quest?.objectiveText ?? [],
            (quest?.creatureIds ?? []).flatMap((id) => npcs.get(id)?.name ?? []),
          )
        : null;
      const sourceCount =
        counter && Number(counter[2]) > 0 && Number(counter[2]) <= 10000
          ? Number(counter[2])
          : null;
      const reviewed =
        matched &&
        quest?.killQuotas?.find(
          (quota) => quota.objectiveIndex === objectiveIndex && quota.npcId === matched.id,
        );
      const counts = new Set(
        [sourceCount, providerCount, reviewed?.kills].filter(
          (count): count is number => count !== null && count !== undefined,
        ),
      );
      const conflict = counts.size > 1;
      const count = sourceCount ?? providerCount ?? reviewed?.kills ?? null;
      const providerKillHint = quest?.objectiveText.some((text) =>
        /\b(?:kill|slay|destroy|defeat)\b/i.test(text),
      );
      const knownKill =
        matches.length === 1 &&
        count !== null &&
        (killHint || providerKillHint || reviewed !== undefined) &&
        !interactive &&
        !conflict;
      const sourceMobs = directives
        .filter((entry) => entry.tag === ".mob")
        .map((entry) => targetName(entry.arguments));
      const item = quest?.itemObjectives?.find((entry) => entry.objectiveIndex === objectiveIndex);
      if (!knownKill && !conflict && isExplicitGroundPickup(quest, objectiveIndex, directives))
        return {
          questId,
          objectiveIndex,
          npcIds: [],
          requiredKills: null,
          credit: "non-combat",
          source,
          reason:
            "Each player completes the source world-object pickup counter; no acquisition kill XP or respawn time is assumed.",
        };
      if (
        quest &&
        !knownKill &&
        !conflict &&
        isLivingCaptureObjective({ directives, offset, objectiveIndex, quest, npcs })
      )
        return {
          questId,
          objectiveIndex,
          npcIds: [],
          requiredKills: null,
          credit: "non-combat",
          source,
          reason:
            "The quest and source require capturing the named living creature with an item; no death or incidental combat XP is assumed.",
        };
      if (
        quest &&
        !knownKill &&
        !conflict &&
        isItemDialogueObjective({ directives, offset, objectiveIndex, quest, npcs })
      )
        return {
          questId,
          objectiveIndex,
          npcIds: [],
          requiredKills: null,
          credit: "non-combat",
          source,
          reason:
            "The source gossip, named speaker and item-start quest corroborate this dialogue handoff; no creature death is implied.",
        };
      if (
        quest &&
        !knownKill &&
        !conflict &&
        isViewingDialogueObjective({ directives, offset, objectiveIndex, quest, npcs })
      )
        return {
          questId,
          objectiveIndex,
          npcIds: [],
          requiredKills: null,
          credit: "non-combat",
          source,
          reason:
            "The source gossip, named speaker and quest text corroborate this viewing dialogue; NPC credit does not imply a kill.",
        };
      if (
        quest &&
        !knownKill &&
        !conflict &&
        isExplorationObjective({ directives, offset, objectiveIndex, quest })
      )
        return {
          questId,
          objectiveIndex,
          npcIds: [],
          requiredKills: null,
          credit: "non-combat",
          source,
          reason:
            "Source and quest text identify this exploration counter separately from the captured kill objective; no additional kills are assumed.",
        };
      if (
        quest &&
        !knownKill &&
        !conflict &&
        isFriendlyHealingObjective({ directives, offset, quest, npcs })
      )
        return {
          questId,
          objectiveIndex,
          npcIds: [],
          requiredKills: null,
          credit: "non-combat",
          source,
          reason:
            "The source and quest text prescribe healing and fortifying the same friendly character; creature credit does not imply a kill.",
        };
      if (item?.provided)
        return {
          questId,
          objectiveIndex,
          npcIds: [],
          requiredKills: null,
          credit: "non-combat",
          source,
          reason:
            "The item is provided at pickup; no additional collection kills are assumed after acceptance.",
        };
      if (
        !knownKill &&
        isExplicitVendorPurchase(directives, offset, counter?.[1], item?.vendorEvidence, npcs)
      )
        return {
          questId,
          objectiveIndex,
          npcIds: [],
          requiredKills: null,
          credit: "non-combat",
          source,
          reason:
            "The source explicitly buys this item from a referenced vendor; no kill XP is attributed to the purchase.",
        };
      const nonKillMethod =
        !knownKill && !conflict && !providerKillHint && item
          ? nonKillCollectionMethod({
              directives,
              offset,
              questId,
              item,
              sourceQuantity: counter ? Number(counter[2]) : null,
              npcs,
            })
          : null;
      if (nonKillMethod)
        return {
          questId,
          objectiveIndex,
          npcIds: [],
          requiredKills: null,
          credit: "non-combat",
          source,
          reason:
            nonKillMethod === "pickpocket"
              ? "The source prescribes one successful pickpocket and explicitly avoids fighting this creature; no required kill XP is assumed."
              : "A matching quest hand-in supplies this single item before collection; no additional item-drop kills are assumed.",
        };
      const itemMobs = (item?.npcIds ?? quest?.itemCreatureIds ?? []).filter((id) =>
        sourceMobs.includes(targetName(npcs.get(id)?.name ?? "")),
      );
      const lootMobs = itemMobs.length ? itemMobs : (item?.npcIds ?? []);
      const nonCombat =
        !!quest &&
        quest.creatureIds.length === 0 &&
        quest.itemCreatureIds.length === 0 &&
        sourceMobs.length === 0 &&
        !killHint &&
        !providerKillHint;
      return {
        questId,
        objectiveIndex: Number.isInteger(objectiveIndex) && objectiveIndex > 0 ? objectiveIndex : 1,
        npcIds: knownKill ? matches : [...new Set([...matches, ...lootMobs])],
        requiredKills: knownKill ? count : null,
        credit: knownKill
          ? "shared-kills"
          : lootMobs.length
            ? "personal-loot"
            : nonCombat
              ? "non-combat"
              : "unknown",
        source: knownKill ? (reviewed?.source ?? source) : source,
        ...(conflict ? { quotaConflict: true } : {}),
        ...(item
          ? {
              loot: {
                itemId: item.itemId,
                quantity: item.quantity ?? sourceCount,
                sharing: item.sharing,
                ...(itemMobs.length ? { sourceNpcIds: itemMobs } : {}),
                ...(item.sharingReference ? { sharingReference: item.sharingReference } : {}),
              },
            }
          : {}),
        reason:
          knownKill || nonCombat
            ? null
            : conflict
              ? "Guide and corrected quest text disagree on the required kill quota."
              : interactive
                ? "Interaction/summon objectives are not assumed to award kill XP."
                : lootMobs.length
                  ? "Personal quest drops: required party kills and drop chance are unverified."
                  : !quest
                    ? "Quest objective references have not been imported."
                    : "A unique creature identity and explicit kill quota could not be reconciled.",
      };
    });
}

export function attachCampaignCombat(
  plan: CampaignPlan,
  inputSources: readonly CampaignSource[],
  dataset: CombatDataset,
  revision: string,
): CampaignPlan {
  if (dataset.targetBuild !== plan.targetBuild)
    throw new Error("Combat reference build does not match the route.");
  dataset = applyReviewedCombatNpcLevels(dataset);
  dataset = applyNarrativeEncounterReferences(dataset);
  plan = attachNarrativeEventGuidance(plan, inputSources, dataset);
  const ordinaryQuestIds = new Set(
    plan.sharedSourceQuestIds ??
      dataset.quests.filter((quest) => quest.requiredClasses === 0).map((quest) => quest.questId),
  );
  const sources = plan.sharedQuestsOnly
    ? sharedCampaignQuestSources(inputSources, plan.race, ordinaryQuestIds)
    : inputSources;
  const punchCard = attachCampaignPunchCardPuzzle(plan, inputSources, dataset.quests);
  plan = punchCard.plan;
  const hakkarEvent = attachCampaignHakkarEvent(plan, inputSources, dataset);
  plan = hakkarEvent.plan;
  const reviewedGround = attachReviewedDungeonGroundMethods(plan, dataset);
  plan = reviewedGround.plan;
  const felvineConversions = felvineConversionObjectives(plan, dataset);
  plan = attachCampaignItemWork(plan, sources, dataset.quests);
  const ringUpgrade = attachCampaignRingUpgrade(plan, dataset);
  plan = ringUpgrade.plan;
  const firstMaterialWork = compileCampaignMaterialWork(plan, sources, dataset);
  const combined = combineCampaignSourceWork(plan, firstMaterialWork);
  const capturedMaterialWork =
    combined === plan ? firstMaterialWork : compileCampaignMaterialWork(combined, sources, dataset);
  plan = combined;
  const starters = attachDungeonStarterWork(plan, dataset);
  plan = starters.plan;
  const materialWork = [...capturedMaterialWork, ...starters.work];
  const byStep = new Map<string, readonly CombatObjective[]>();
  const byObjective = new Map<string, CombatObjective[]>();
  const references = indexCombatReferences(dataset);
  const bosses = new Map(dataset.bossReferences?.map((reference) => [reference.npcId, reference]) ?? []);
  const profile = campaignPlanSourceProfile(plan);
  const selectedSteps = new Set(
    plan.actions.flatMap((action) =>
      action.source
        ? [`${action.source.chapterId}:${action.source.version}:${action.source.stepId}`]
        : [],
    ),
  );
  const dedicatedQuestIds = new Set(
    dataset.quests
      .filter((quest) => (quest.requiredClasses ?? 0) !== 0)
      .map((quest) => quest.questId),
  );
  const sharedCompletionSteps = new Set(
    plan.sharedQuestsOnly
      ? plan.actions.flatMap((action) =>
          action.source &&
          !action.leaderOnly &&
          action.questChanges.some((change) => change.state === "objectives-complete") &&
          action.questChanges.every(
            (change) =>
              ordinaryQuestIds.has(change.questId) && !dedicatedQuestIds.has(change.questId),
          )
            ? [`${action.source.chapterId}:${action.source.version}:${action.source.stepId}`]
            : [],
        )
      : [],
  );
  const classProfiles = plan.sharedQuestsOnly
    ? (LEVELING_RACES.find((race) => race.id === plan.race)?.classes ?? []).map((classSlug) =>
        createCampaignSourceProfile(plan.race, classSlug),
      )
    : [];
  const dungeons = DUNGEON_VISITS.flatMap((visit) => (visit.sourceTag ? [visit.sourceTag] : []));
  for (const { guide, reference } of sources) {
    if (guide.targetBuild !== plan.targetBuild) continue;
    const eligible = chapterEligibility(reference, profile) === "match";
    const withoutDefaults = { ...reference, defaults: [] };
    const alternate = chapterEligibility(withoutDefaults, profile) === "match";
    const sharedRecommendation =
      chapterEligibility({ ...withoutDefaults, condition: "" }, profile) === "match" &&
      classProfiles.some((candidate) => chapterEligibility(withoutDefaults, candidate) === "match");
    if (!eligible && !alternate && !sharedRecommendation) continue;
    for (const step of guide.steps) {
      const key = `${guide.chapterId}:${guide.version}:${step.id}`;
      // Defaults choose branches; exact planned steps can reuse a source for another supported race.
      if (!eligible && !selectedSteps.has(key)) continue;
      // A guide's class recommendation cannot discard its selected ordinary-party counters.
      if (!eligible && !alternate && !sharedCompletionSteps.has(key)) continue;
      const source = `${guide.chapterId}:${step.id}`;
      const view = getGuideStepView(
        {
          ...step,
          directives: step.directives.filter(
            (directive) => ![".group", ".solo"].includes(directive.tag),
          ),
        },
        profile,
        { dungeons },
      );
      if (view.condition !== "match") continue;
      const objectives = resolveCombatObjectives(view.directives, references, source);
      byStep.set(`${guide.chapterId}:${guide.version}:${step.id}`, objectives);
      for (const objective of objectives) {
        const key = combatObjectiveKey(objective),
          entries = byObjective.get(key) ?? [];
        entries.push(objective);
        byObjective.set(key, entries);
      }
    }
  }
  const narrativeEvents = narrativeEventObjectives(plan, sources, dataset);
  const activities: CombatActivity[] = [];
  for (const action of plan.actions) {
    if (action.wholeQuestObjectives && action.combatObjectiveScope === "listed")
      throw new Error(`A generated task cannot cover the whole quest and listed counters simultaneously: ${action.id}.`);
    if (action.combatEnvironment === "outdoor" && action.location?.insideDungeon)
      throw new Error(`Outdoor combat task has an inside-dungeon location: ${action.id}.`);
    const completions = action.questChanges.filter(
      (change) => change.state === "objectives-complete",
    );
    if (!completions.length) continue;
    const leg = plan.legs.find((entry) => entry.id === action.legId)!;
    const exact = action.source
      ? byStep.get(`${action.source.chapterId}:${action.source.version}:${action.source.stepId}`)
      : undefined;
    const referencesForAction = completions.flatMap((change): readonly CombatObjective[] => {
      const objectiveIndex = change.objectiveIndex ?? 1;
      const reviewedObjective = ringUpgrade.objectives.get(action.id)?.find((objective) => objective.questId === change.questId && objective.objectiveIndex === objectiveIndex) ?? narrativeEvents.get(action.id) ?? punchCard.objectives.get(action.id) ?? reviewedGround.objectives.get(action.id) ?? hakkarEvent.objectives.get(action.id) ?? felvineConversions.get(action.id);
      if (reviewedObjective && reviewedObjective.questId === change.questId && reviewedObjective.objectiveIndex === objectiveIndex)
        return [reviewedObjective];
      if (!action.source) {
        const allReferences = referenceObjectives(change.questId, references, action.instructions);
        const reference = action.combatObjectiveScope === "listed"
          ? allReferences.filter((objective) => objective.objectiveIndex === objectiveIndex)
          : allReferences;
        if (reference.length) {
          if (!action.wholeQuestObjectives) return reference;
          return reference.map((objective): CombatObjective => {
            const item = references.quests.get(objective.questId)?.itemObjectives?.find(
              (entry) => entry.objectiveIndex === objective.objectiveIndex &&
                entry.itemId === objective.loot?.itemId,
            );
            const candidates = byObjective.get(combatObjectiveKey(objective)) ?? [];
            if (
              objective.credit !== "personal-loot" ||
              objective.quotaConflict ||
              objective.npcIds.length ||
              !item?.objectIds?.length ||
              item.npcIds.length ||
              item.provided ||
              item.vendorEvidence ||
              item.rewardEvidence ||
              item.quantity === null ||
              item.quantity !== objective.loot?.quantity ||
              !plan.itemRequirements?.some((requirement) =>
                requirement.questId === objective.questId &&
                requirement.objectiveIndex === objective.objectiveIndex &&
                requirement.itemId === item.itemId &&
                requirement.quantity === item.quantity &&
                !requirement.conflict && !requirement.sourceProvided,
              ) ||
              !candidates.length ||
              candidates.some((candidate) =>
                candidate.credit !== "non-combat" || candidate.npcIds.length > 0 ||
                candidate.requiredKills !== null || candidate.loot ||
                candidate.quotaConflict || candidate.combatAccess,
              )
            ) return objective;
            // A generic loot row must not discard unanimous, full-counter ground proofs.
            return candidates[0]!;
          });
        }
      }
      const candidates = (
        action.source
          ? (exact ?? [])
          : (byObjective.get(`${change.questId}:${objectiveIndex}`) ?? [])
      ).filter(
        (entry) => entry.questId === change.questId && entry.objectiveIndex === objectiveIndex,
      );
      const known = candidates.filter((entry) => entry.credit === "shared-kills");
      if (candidates.length && candidates.every((entry) => entry.credit === "non-combat"))
        return [candidates[0]!];
      const signatures = new Set(
        known.map((entry) => `${entry.npcIds.join(",")}:${entry.requiredKills}`),
      );
      if (signatures.size === 1 && known.length === candidates.length) return [known[0]!];
      return [
        {
          questId: change.questId,
          objectiveIndex,
          npcIds: [...new Set(candidates.flatMap((entry) => entry.npcIds))],
          requiredKills: null,
          credit: candidates.some((entry) => entry.credit === "personal-loot")
            ? "personal-loot"
            : "unknown",
          source: action.source
            ? `${action.source.chapterId}:${action.source.stepId}`
            : "source-reference",
          reason:
            signatures.size > 1
              ? "Source variants disagree on the creature or quota."
              : (candidates[0]?.reason ??
                "No reconciled creature kill quota is available for this objective."),
          ...(signatures.size > 1 || candidates.some((entry) => entry.quotaConflict)
            ? { quotaConflict: true as const }
            : {}),
          ...(candidates.length === 1 && candidates[0]?.loot ? { loot: candidates[0].loot } : {}),
        },
      ];
    });
    const objectives = [
      ...new Map(
        referencesForAction.map((objective) => [combatObjectiveKey(objective), objective]),
      ).values(),
    ].map((objective): CombatObjective =>
      starters.retainedObjectiveKeys.has(combatObjectiveKey(objective))
        ? {
            ...objective,
            npcIds: [],
            requiredKills: null,
            credit: "non-combat",
            reason:
              "Carry the retained starter acquired before this quest was accepted; no second item-drop fight is required.",
          }
        : objective,
    );
    for (const environment of ["outdoor", "dungeon"] as const) {
      const group = objectives.filter(
        (objective) =>
          (objective.credit !== "non-combat" || Boolean(objective.combatAccess)) &&
          (action.combatEnvironment ??
            (getPremadeQuest(objective.questId)?.objectiveStage === "before"
              ? "outdoor"
              : ["inside", "multiple-visits"].includes(
                    getPremadeQuest(objective.questId)?.objectiveStage ?? "",
                  ) ||
                  leg.kind === "dungeon" ||
                  action.location?.insideDungeon
                ? "dungeon"
                : "outdoor")) === environment,
      );
      const dungeonContext =
        action.location?.insideDungeon ??
        leg.dungeonVisitId ??
        (leg.kind === "dungeon" ? leg.stopId : null);
      const dungeonVisitIds = dungeonContext
        ? (getPremadeStop(dungeonContext)?.visitIds ?? [dungeonContext])
        : [];
      if (group.length)
        activities.push({
          id: `combat-${action.id}-${environment}`,
          actionId: action.id,
          environment,
          pathId:
            action.dungeonFinishOnly && action.location?.insideDungeon
              ? `${leg.id}-${action.location.insideDungeon}`
              : leg.id,
          questWide: action.source === null && action.combatObjectiveScope !== "listed",
          objectives:
            environment === "dungeon"
              ? filterDungeonLootSources(plan.dungeonCollectionPolicy === "selected-clear"
                ? selectDungeonCollectionSources(group, dungeonContext, references.npcs)
                : group, {
                  targetBuild: plan.targetBuild,
                  dungeonVisitIds,
                  npcs: references.npcs,
                  bosses,
                })
              : group,
          profile: null,
        });
    }
  }
  const notices: string[] = [];
  for (const leg of plan.legs.filter((entry) => entry.kind === "dungeon")) {
    const profiles = dataset.dungeons.filter(
      (entry) => entry.stopId === leg.stopId && entry.scope === "quest-path",
    );
    const entries = plan.actions.filter((action) => action.legId === leg.id);
    const firstReturn = entries.findIndex((action) =>
      action.questChanges.some((change) => change.state === "rewarded"),
    );
    const candidates = entries
      .slice(0, firstReturn < 0 ? entries.length : firstReturn)
      .filter((action) =>
        action.questChanges.some((change) => change.state === "objectives-complete"),
      );
    const anchor = candidates.at(-1);
    const multiStage =
      firstReturn >= 0 &&
      entries
        .slice(firstReturn + 1)
        .some((action) =>
          action.questChanges.some((change) => change.state === "objectives-complete"),
        );
    if (profiles.length !== 1 || !anchor || multiStage) {
      notices.push(
        `${leg.title}: full path combat is unmeasured${multiStage ? " across its separate visits" : ""}.`,
      );
      continue;
    }
    const index = activities.findIndex(
      (activity) => activity.actionId === anchor.id && activity.environment === "dungeon",
    );
    if (index >= 0) activities[index] = { ...activities[index]!, profile: profiles[0]! };
  }
  const ids = new Set(
    activities.flatMap((activity) => [
      ...activity.objectives.flatMap((objective) => [...objective.npcIds, ...(objective.combatAccess?.npcIds ?? [])]),
      ...(activity.profile?.packs.map((pack) => pack.npcId) ?? []),
    ]),
  );
  for (const work of materialWork)
    for (const target of work.targets) for (const id of target.objective.npcIds) ids.add(id);
  const combat: CampaignCombatPlan = {
    questObjectiveIndexes: referencedQuestObjectiveIndexes(dataset.quests),
    revision,
    sourceRevision: dataset.provider.revision,
    targetBuild: dataset.targetBuild,
    npcs: dataset.npcs.filter((npc) => ids.has(npc.id)),
    ...(dataset.npcMetadataReferences
      ? {
          npcMetadataReferences: dataset.npcMetadataReferences.filter((reference) =>
            ids.has(reference.npcId),
          ),
        }
      : {}),
    ...(dataset.bossReferences
      ? { bossReferences: dataset.bossReferences.filter((reference) => ids.has(reference.npcId)) }
      : {}),
    activities,
    ...(materialWork.length ? { materialWork } : {}),
    notice: notices.length ? notices.join(" ") : null,
    killXpEvidence: dataset.killXpEvidence.filter((entry) => ids.has(entry.npcId)),
    ...(dataset.dungeonKillXpReference
      ? { dungeonKillXpReference: dataset.dungeonKillXpReference }
      : {}),
    ...(dataset.lootDrops
      ? { lootDrops: dataset.lootDrops.filter((drop) => ids.has(drop.npcId)) }
      : {}),
    ...(dataset.historicalLoot ? { historicalLoot: dataset.historicalLoot } : {}),
  };
  return attachCampaignReferenceFarmTargets(
    attachCampaignLootTargets({ ...plan, combat }, dataset.provider),
  );
}

export interface CampaignCombatRow {
  readonly acquisitionXpExcluded?: true;
  readonly incidentalXp?: number;
  readonly maximumIncidentalXp?: number | null;
  readonly requiredBasis?: IncidentalCombatEstimate["basis"];
  readonly activityId: string;
  readonly environment: "outdoor" | "dungeon";
  readonly npcId: number;
  readonly name: string;
  readonly minimumLevel: number | null;
  readonly maximumLevel: number | null;
  readonly kills: number;
  readonly xp: number | null;
  readonly maximumXp: number | null;
  readonly source: string;
  readonly basis: "reference-estimate" | "observed" | "excluded" | "unknown";
  readonly lootEstimate?: Extract<LootKillEstimate, { status: "estimated" }>;
}
export interface CampaignCombatState {
  readonly counters: Map<string, number | null>;
  readonly paid: Set<string>;
  readonly pathKills: Map<string, number>;
}

export function createCampaignCombatState(
  combat: CampaignCombatPlan | undefined,
  member: PremadeMember,
): CampaignCombatState {
  const counters = new Map<string, number | null>();
  for (const objective of combat?.activities.flatMap((activity) => activity.objectives) ?? []) {
    const state = member.questStates[String(objective.questId)];
    const done =
      state === "objectives-complete" ||
      state === "rewarded" ||
      member.confirmations[`campaign-objective-${objective.questId}-${objective.objectiveIndex}`];
    if (done) counters.set(combatObjectiveKey(objective), objective.requiredKills);
    else if (state === "accepted") counters.set(combatObjectiveKey(objective), null);
  }
  return { counters, paid: new Set(), pathKills: new Map() };
}

export function applyCampaignCombat(input: {
  readonly activity: CombatActivity;
  readonly combat: CampaignCombatPlan;
  readonly state: CampaignCombatState;
  readonly questStates: PremadeMember["questStates"];
  readonly position: CombatXpPosition;
  readonly partySize: number;
  readonly partyLevels?: readonly (number | null)[];
  readonly lootScenario?: LootScenario;
  readonly xpMultiplier?: number;
  readonly incidentalKillXpPercent?: number;
  readonly playerIndex?: number;
  readonly synchronizedParty?: boolean;
  readonly partyPositions?: readonly CombatXpPosition[] | null;
  readonly partyBounds?: readonly CampaignXpBounds[] | null;
  readonly unpricedPayoutCandidates?: readonly UnpricedLootPayoutCandidate[];
}): {
  readonly xp: number;
  readonly rows: readonly CampaignCombatRow[];
  readonly issues: readonly string[];
  readonly partyExit?: readonly CombatXpPosition[] | null;
  readonly partyBounds?: readonly CampaignXpBounds[] | null;
} {
  const { activity, combat, state, questStates, partySize } = input;
  if (state.paid.has(activity.id))
    return {
      xp: 0,
      rows: [],
      issues: [],
      ...(input.partyPositions === undefined ? {} : { partyExit: input.partyPositions }),
      ...(input.partyBounds === undefined ? {} : { partyBounds: input.partyBounds }),
    };
  if (input.partyPositions && input.partyBounds === undefined) {
    const own = input.partyPositions[input.playerIndex ?? 0];
    if (
      input.partyPositions.length !== partySize ||
      !own ||
      own.level !== input.position.level ||
      own.currentXp !== input.position.currentXp
    )
      throw new Error("Shared-party bars do not match the current combat phase.");
  }
  if (input.partyBounds) {
    const own = input.partyBounds[input.playerIndex ?? 0];
    if (
      input.partyBounds.length !== partySize ||
      !own ||
      own.minimum.level !== input.position.level ||
      own.minimum.currentXp !== input.position.currentXp
    )
      throw new Error("Party XP bounds do not match the combat phase.");
  }
  state.paid.add(activity.id);
  const npcs = new Map(combat.npcs.map((npc) => [npc.id, npc]));
  const rows: CampaignCombatRow[] = [],
    issues: string[] = [];
  let xp = 0,
    position = input.position;
  let partyPositions = input.partyBounds === undefined ? input.partyPositions : undefined;
  let partyBounds = input.partyBounds;
  const quotaCache = new Map<CombatObjective, ReturnType<typeof resolveCombatQuota>>();
  const quota = (objective: CombatObjective): ReturnType<typeof resolveCombatQuota> => {
    const existing = quotaCache.get(objective);
    if (existing) return existing;
    const value = resolveCombatQuota(
      objective,
      combat,
      partySize,
      input.lootScenario ?? "expected",
    );
    quotaCache.set(objective, value);
    return value;
  };
  const allActive = [
    ...new Map(
      combat.activities
        .flatMap((entry) => entry.objectives)
        .map((objective) => [combatObjectiveKey(objective), objective]),
    ).values(),
  ].filter((objective) => questStates[String(objective.questId)] === "accepted");
  const activeCandidates = allActive.filter((objective) => {
    if (objective.npcIds.length !== 1) return false;
    const counted = state.counters.get(combatObjectiveKey(objective)),
      target = quota(objective).kills;
    return counted === null || counted === undefined || target === null || counted < target;
  });
  // max(E[T1], E[T2]) is not E[max(T1, T2)]. A shared kill counter cannot model loot inventory.
  const deterministicQuota = (objective: CombatObjective): number | null => {
    const resolved = quota(objective);
    if (objective.credit === "shared-kills") return resolved.kills;
    const loot = resolved.lootEstimate;
    return loot && loot.minimumKills === loot.expectedKills ? loot.minimumKills : null;
  };
  const jointLoot = new Set(
    activeCandidates
      .filter((objective) => {
        if (objective.credit !== "personal-loot" || deterministicQuota(objective) !== null)
          return false;
        const minimum = quota(objective).lootEstimate?.minimumKills;
        return (
          activeCandidates.some((other) => {
            if (
              combatObjectiveKey(other) === combatObjectiveKey(objective) ||
              other.npcIds[0] !== objective.npcIds[0]
            )
              return false;
            const required = deterministicQuota(other);
            return required === null || minimum === undefined || required > minimum;
          }) ||
          activity.profile?.packs.some(
            (pack) =>
              pack.npcId === objective.npcIds[0] && (minimum === undefined || pack.kills > minimum),
          ) === true
        );
      })
      .map(combatObjectiveKey),
  );
  const active = activeCandidates.filter((objective) => quota(objective).kills !== null);
  function kill(npc: CombatNpc, count: number, source: string): void {
    const startingPartyBounds = partyBounds, startingPartyPositions = partyPositions;
    const shared = {
      npc,
      kills: count,
      environment: activity.environment,
      dungeonMultiplier: activity.profile?.dungeonMultiplier ?? null,
      ...(combat.dungeonKillXpReference
        ? { dungeonKillXpReference: combat.dungeonKillXpReference }
        : {}),
      evidence: combat.killXpEvidence ?? [],
      build: combat.targetBuild,
      ...(input.xpMultiplier === undefined ? {} : { xpMultiplier: input.xpMultiplier }),
    };
    const hasClearPath = activity.profile || (activity.pathId && combat.activities.some(
      (other) => other.pathId === activity.pathId && other.profile,
    ));
    const incidentalPercent = hasClearPath ? 0 : (input.incidentalKillXpPercent ?? 0);
    let estimate: IncidentalCombatEstimate;
    if (partyBounds) {
      const party = estimateBoundedPartyKills({ ...shared, positions: partyBounds }).map(
        (row) => addIncidentalCombatXp(row, incidentalPercent),
      );
      estimate = party[input.playerIndex ?? 0]!;
      partyBounds = party.every((member) => member.xp !== null && member.maximumExit !== null)
        ? party.map((member) => ({ minimum: member.exit, maximum: member.maximumExit! }))
        : null;
    } else if (partyBounds === null || partyPositions === null) {
      estimate = {
        xp: null,
        maximumXp: null,
        exit: position,
        basis: "unknown",
        reason:
          "Shared-party progress is not aligned for this combat phase; peer XP bars are not assumed to stay fixed.",
      };
    } else if (partyPositions) {
      const party = estimatePartyCreatureKills({ ...shared, positions: partyPositions }).map(
        (row) => addIncidentalCombatXp(row, incidentalPercent),
      );
      estimate = party[input.playerIndex ?? 0]!;
      partyPositions = party.every((member) => member.xp !== null && member.xp === member.maximumXp)
        ? party.map((member) => member.exit)
        : null;
    } else
      estimate = addIncidentalCombatXp(estimateCreatureKills({
        ...shared,
        position,
        partySize,
        ...(input.partyLevels
          ? {
              partyLevels: input.synchronizedParty
                ? Array.from({ length: partySize }, () => position.level)
                : input.partyLevels,
            }
          : {}),
        ...(input.playerIndex === undefined ? {} : { playerIndex: input.playerIndex }),
        ...(input.synchronizedParty === undefined
          ? {}
          : { synchronizedParty: input.synchronizedParty }),
      }), incidentalPercent);
    const pendingObjectives = allActive.filter((objective) => {
      if (!objective.npcIds.includes(npc.id)) return false;
      const counted = state.counters.get(combatObjectiveKey(objective)), target = quota(objective).kills;
      return counted === null || counted === undefined || target === null || counted < target;
    });
    const acquisitionXpExcluded = estimate.basis === "unknown" && estimate.xp === null &&
      !hasClearPath && Boolean(startingPartyBounds || startingPartyPositions) &&
      canExcludeUnpricedLootPayout({ npc, objectives: pendingObjectives,
        candidates: input.unpricedPayoutCandidates ?? [] });
    if (acquisitionXpExcluded) {
      // Keep the modeled workload and all item counters. This is a counted-XP baseline,
      // not a resolution of the server's uncertain payout or an actual-XP upper bound.
      estimate = { xp: 0, maximumXp: 0, exit: position,
        basis: "excluded", reason: "Additional loot-acquisition XP is unpriced and excluded from the known-input forecast; full item quantities and physical work are unchanged." };
      partyBounds = startingPartyBounds;
      partyPositions = startingPartyPositions;
    }
    if ((estimate.requiredBasis ?? estimate.basis) === "reference-estimate")
      issues.push(
        `${activity.id}:${npc.id}: combat XP uses an unobserved reference model${activity.environment === "dungeon" && combat.dungeonKillXpReference && !activity.profile ? ` (${combat.dungeonKillXpReference.id})` : ""}; this exact Forever build, level, party size and environment have not been observed.`,
      );
    const incidentalMessage = incidentalCombatMessage(estimate, incidentalPercent);
    if (incidentalMessage) issues.push(`${activity.id}:${npc.id}: ${incidentalMessage}`);
    const metadata = combat.npcMetadataReferences?.find((reference) => reference.npcId === npc.id);
    const referenceSource = [
      source,
      ...(estimate.basis === "reference-estimate" &&
      activity.environment === "dungeon" &&
      combat.dungeonKillXpReference &&
      !activity.profile
        ? [combat.dungeonKillXpReference.source]
        : []),
      ...(metadata
        ? [
            "sourceUrl" in metadata.levelSource
              ? metadata.levelSource.sourceUrl
              : metadata.levelSource.statement,
            ...(metadata.rankSource ? [metadata.rankSource.sourceUrl] : []),
            metadata.attribution,
            metadata.limitation,
          ]
        : []),
    ].join("; ");
    rows.push({
      activityId: activity.id,
      environment: activity.environment,
      npcId: npc.id,
      name: npc.name,
      minimumLevel: npc.minimumLevel,
      maximumLevel: npc.maximumLevel,
      kills: count,
      xp: estimate.xp,
      maximumXp: estimate.maximumXp,
      source:
        (estimate.requiredBasis ?? estimate.basis) === "observed"
          ? (estimate.observedSources?.join("; ") ?? source)
          : referenceSource,
      basis: estimate.basis,
      ...(acquisitionXpExcluded ? { acquisitionXpExcluded: true as const } : {}),
      ...incidentalCombatRowFields(estimate),
    });
    if (estimate.reason) issues.push(estimate.reason);
    xp += estimate.xp ?? 0;
    position =
      input.partyBounds === undefined
        ? advanceCombatPosition(position, estimate.xp ?? 0)
        : estimate.exit;
    if (estimate.xp !== null && activity.pathId) {
      const key = `${activity.pathId}:${npc.id}`;
      state.pathKills.set(key, (state.pathKills.get(key) ?? 0) + count);
    }
    for (const objective of active) {
      if (objective.npcIds[0] !== npc.id) continue;
      const key = combatObjectiveKey(objective),
        previous = state.counters.get(key);
      if (jointLoot.has(key)) {
        state.counters.set(key, null);
        continue;
      }
      if (previous !== null)
        state.counters.set(key, Math.min(quota(objective).kills!, (previous ?? 0) + count));
    }
  }
  const batched = new Set<string>();
  if (!activity.profile) {
    const currentKeys = new Set(activity.objectives.map(combatObjectiveKey));
    for (const npcId of new Set(
      activity.objectives.flatMap((objective) =>
        objective.npcIds.length === 1 ? objective.npcIds : [],
      ),
    )) {
      const group = activeCandidates.filter(
        (objective) =>
          objective.npcIds[0] === npcId && currentKeys.has(combatObjectiveKey(objective)),
      );
      if (
        group.length < 1 ||
        !group.some((objective) => jointLoot.has(combatObjectiveKey(objective))) ||
        group.some(
          (objective) =>
            !currentKeys.has(combatObjectiveKey(objective)) ||
            state.counters.get(combatObjectiveKey(objective)) === null ||
            (state.counters.get(combatObjectiveKey(objective)) ?? 0) > 0,
        )
      )
        continue;
      const resolved = resolveJointCombatQuota(
          group,
          combat,
          partySize,
          input.lootScenario ?? "expected",
        ),
        npc = npcs.get(npcId);
      if (resolved.status !== "estimated" || !npc) continue;
      kill(npc, resolved.kills, resolved.source);
      rows[rows.length - 1] = { ...rows[rows.length - 1]!, lootEstimate: resolved.estimate };
      for (const objective of group) {
        const key = combatObjectiveKey(objective);
        state.counters.set(key, quota(objective).kills);
        batched.add(key);
      }
      for (const other of allActive) {
        if (group.includes(other)) continue;
        const otherKey = combatObjectiveKey(other),
          previous = state.counters.get(otherKey),
          target = quota(other).kills;
        if (previous !== null && previous !== undefined && target !== null && previous >= target)
          continue;
        if (
          other.npcIds.includes(npcId) ||
          (other.loot &&
            combat.lootDrops?.some(
              (drop) =>
                drop.npcId === npcId &&
                drop.itemId === other.loot!.itemId &&
                (drop.probability > 0 || (drop.probabilityReference?.probability ?? 0) > 0),
            ))
        )
          state.counters.set(otherKey, null);
      }
      issues.push(
        `${activity.id}:${npcId}: joint collection kills use a reference probability model, not guaranteed drops.`,
      );
    }
  }
  for (const pack of activity.profile?.packs ?? []) {
    const npc = npcs.get(pack.npcId);
    const remaining = Math.max(
      0,
      pack.kills -
        (activity.pathId ? (state.pathKills.get(`${activity.pathId}:${pack.npcId}`) ?? 0) : 0),
    );
    if (npc && remaining) kill(npc, remaining, activity.profile!.source);
    else if (!npc && remaining && partyBounds !== undefined) partyBounds = null;
  }
  for (const objective of activity.objectives) {
    if (objective.credit === "non-combat") continue;
    if (questStates[String(objective.questId)] !== "accepted") continue;
    const key = combatObjectiveKey(objective);
    if (batched.has(key)) continue;
    const prior = state.counters.get(key),
      knownQuota = quota(objective).kills;
    if (prior !== null && prior !== undefined && knownQuota !== null && prior >= knownQuota)
      continue;
    if (jointLoot.has(key)) {
      if (partyBounds !== undefined) partyBounds = null;
      for (const other of activeCandidates)
        if (other.npcIds[0] === objective.npcIds[0] && jointLoot.has(combatObjectiveKey(other)))
          state.counters.set(combatObjectiveKey(other), null);
      issues.push(
        `${key}: collection overlaps another active objective or path kill; its joint loot distribution is unresolved.`,
      );
      continue;
    }
    const resolved = quota(objective);
    if (resolved.kills === null || objective.npcIds.length !== 1) {
      if (partyBounds !== undefined) partyBounds = null;
      issues.push(`${key}: ${resolved.reason ?? "Required kills are unresolved."}`);
      continue;
    }
    const counted = state.counters.get(key);
    if (counted === null) {
      if (partyBounds !== undefined) partyBounds = null;
      issues.push(
        `${key}: quest was already in progress; remaining kills are unknown. Combat already in your actual XP bar is not added again.`,
      );
      continue;
    }
    const remaining = Math.max(0, resolved.kills - (counted ?? 0));
    const npc = npcs.get(objective.npcIds[0]!);
    if (!npc) {
      if (partyBounds !== undefined) partyBounds = null;
      issues.push(`${key}: creature reference is missing.`);
      continue;
    }
    if (remaining) {
      kill(npc, remaining, resolved.source ?? objective.source);
      if (resolved.lootEstimate) {
        const last = rows.length - 1;
        rows[last] = { ...rows[last]!, lootEstimate: resolved.lootEstimate };
        issues.push(
          `${key}: loot kills use an edition-reference probability model, not guaranteed drops or verified current-build rates.`,
        );
      }
    }
  }
  return {
    xp,
    rows,
    issues: [...new Set(issues)],
    ...(partyPositions === undefined ? {} : { partyExit: partyPositions }),
    ...(partyBounds === undefined ? {} : { partyBounds }),
  };
}
