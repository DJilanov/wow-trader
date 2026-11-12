import type { CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatDataset, CombatQuestReference } from "./combat-model.js";
import type { ImportedStep } from "./guide-archive.js";
import type { QuestCatalog, QuestCatalogEntry } from "./quest-catalog.js";
import { isSharedFundingQuest } from "./quest-catalog.js";
import { campaignZoneId } from "./campaign-geography.js";

type Phase = "accepted" | "objectives-complete" | "rewarded";

const passiveTags = new Set([
  "text", "marker", ".goto", ".waypoint", ".line", ".target", ".mob",
  "#label", "#completewith", "#sticky", "#optional",
]);

function validStep(step: ImportedStep, quest: QuestCatalogEntry, phase: Phase): boolean {
  const phaseTag = phase === "accepted" ? ".accept" : phase === "rewarded" ? ".turnin" : ".complete";
  return step.condition.trim() === "skip" && step.directives.every((row) => {
    if (row.condition.trim()) return false;
    if (passiveTags.has(row.tag)) return true;
    if (row.tag === phaseTag) return row.questId === quest.questId;
    if (row.tag === ".group") return row.arguments.trim() === "" || /^[1-5]$/.test(row.arguments.trim());
    const id = Number(row.arguments.trim());
    if (!Number.isInteger(id) || id <= 0) return false;
    if (phase === "accepted")
      return (row.tag === ".isQuestAvailable" && id === quest.questId) ||
        (row.tag === ".isQuestTurnedIn" &&
          (quest.prerequisites.allOf.includes(id) ||
            (quest.prerequisites.anyOf.length === 1 && quest.prerequisites.anyOf[0] === id)));
    return id === quest.questId && (row.tag === ".isOnQuest" ||
      (phase === "rewarded" && row.tag === ".isQuestComplete"));
  });
}

function matchesGiver(step: ImportedStep, giver: QuestCatalogEntry["starts"][number]): boolean {
  return step.directives.some((row) => row.tag === ".target" && row.arguments.trim() === giver.name) &&
    step.directives.some((row) => {
      const zone = row.position ? campaignZoneId(row.position.zone) : null;
      return zone !== null && giver.positions.some((position) => zone === campaignZoneId(position.zone));
    });
}

function matchesCounters(quest: QuestCatalogEntry, reference: CombatQuestReference | undefined): boolean {
  return reference !== undefined && reference.onlyCreatureObjectives &&
    !reference.onlyInteractionObjectives && !reference.itemCreatureIds.length &&
    !reference.itemObjectives?.length && !reference.killQuotaConflicts?.length &&
    !reference.startItem && reference.requiredClasses === 0 &&
    reference.killQuotas?.length === quest.objectives.length &&
    reference.creatureIds.length === new Set(quest.objectives.map((row) => row.npcId)).size &&
    quest.objectives.every((objective) => reference.creatureIds.includes(objective.npcId) &&
      reference.killQuotas!.some((quota) => quota.objectiveIndex === objective.index &&
        quota.npcId === objective.npcId && quota.kills === objective.count));
}

function completeSkippedProgram(quest: QuestCatalogEntry, source: CampaignSource, combat: CombatDataset): boolean {
  const pickups = source.guide.steps.filter((step) =>
    step.directives.some((row) => row.tag === ".accept" && row.questId === quest.questId) &&
    validStep(step, quest, "accepted") && matchesGiver(step, quest.starts[0]!));
  const rewards = source.guide.steps.filter((step) =>
    step.directives.some((row) => row.tag === ".turnin" && row.questId === quest.questId) &&
    validStep(step, quest, "rewarded") && matchesGiver(step, quest.ends[0]!));
  return pickups.some((pickup) => rewards.some((reward) => {
    if (reward.ordinal <= pickup.ordinal) return false;
    if (source.guide.steps.some((step) => step.ordinal > pickup.ordinal && step.ordinal < reward.ordinal &&
      step.directives.some((row) => row.tag === ".abandon" && row.questId === quest.questId))) return false;
    return quest.objectives.every((objective) => source.guide.steps.some((step) =>
      step.ordinal > pickup.ordinal && step.ordinal < reward.ordinal &&
      validStep(step, quest, "objectives-complete") &&
      step.directives.some((row) => row.tag === ".complete" && row.questId === quest.questId &&
        row.arguments.trim() === `${quest.questId},${objective.index}`) &&
      step.directives.some((row) => row.tag === ".mob" &&
        row.arguments.trim() === combat.npcs.find((npc) => npc.id === objective.npcId)?.name)));
  }));
}

/** Qualify plain shared kills skipped editorially; emit generic provider-bound tasks, never unskip native source. */
export function skippedSharedKillFundingCatalog(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  combat: CombatDataset,
  catalog: QuestCatalog,
): QuestCatalog {
  if (!plan.sharedQuestsOnly || plan.targetBuild !== catalog.targetBuild ||
    catalog.targetBuild !== combat.targetBuild || plan.sourceArchiveSha256 !== catalog.sourceArchiveSha256 ||
    catalog.providerRevision !== combat.provider.revision || catalog.questSha256 !== combat.provider.questSha256 ||
    catalog.npcSha256 !== combat.provider.npcSha256 || !catalog.itemSha256 ||
    catalog.itemSha256 !== combat.provider.itemSha256) return catalog;
  let changed = false;
  const quests = catalog.quests.map((quest): QuestCatalogEntry => {
    if (quest.unsupportedRequirements.length !== 1 || quest.unsupportedRequirements[0] !== "source-held-pickup" ||
      quest.category !== "shared-kills" || quest.providedItem || quest.objectStarts?.length || quest.objectEnds?.length ||
      quest.starts.length !== 1 || quest.ends.length !== 1) return quest;
    const qualified = { ...quest, unsupportedRequirements: [] };
    if (!isSharedFundingQuest(qualified) ||
      !matchesCounters(quest, combat.quests.find((row) => row.questId === quest.questId)) ||
      quest.objectives.some((objective) => {
        const npc = combat.npcs.find((row) => row.id === objective.npcId);
        return !npc || ![0, 1].includes(npc.rank ?? -1) || npc.maximumLevel === null;
      }) ||
      !sources.some((source) => source.guide.targetBuild === plan.targetBuild &&
        completeSkippedProgram(quest, source, combat))) return quest;
    changed = true;
    return qualified;
  });
  return changed ? { ...catalog, quests } : catalog;
}
