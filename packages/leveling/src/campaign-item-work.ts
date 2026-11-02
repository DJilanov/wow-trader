import type { CampaignAction, CampaignPlan, CampaignSource } from "./campaign.js";
import type { CombatQuestReference } from "./combat-model.js";
import { getGuideStepView, type ImportedStep, type GuideStepView } from "./guide-archive.js";
import { createCampaignSourceProfile } from "./campaign-source-profile.js";
import { campaignActionSource, CAMPAIGN_SOURCE_CHECKS } from "./campaign-source-conditions.js";
import { campaignItemObjectiveQuantity } from "./campaign-item-quantities.js";
import { CAMPAIGN_QUEST_GUARDS } from "./campaign-native-guards.js";
import { groupCampaignItemWork } from "./campaign-item-work-groups.js";
import {
  parseCampaignItemTarget,
  mergeCampaignItemRequirements,
  type CampaignItemRequirement,
  type CampaignItemTarget,
} from "./campaign-items.js";

interface SourceView {
  readonly source: CampaignSource;
  readonly step: ImportedStep;
  readonly view: GuideStepView;
}

const collectionTags = new Set([
  "text",
  "marker",
  ".goto",
  ".waypoint",
  ".line",
  ".mob",
  ".target",
  ".unitscan",
  ".collect",
  ".link",
  "#sticky",
  "#completewith",
  "#optional",
  "#label",
  "#loop",
  "#xprate",
  "#season",
  "#era",
  "#softcore",
  ...CAMPAIGN_SOURCE_CHECKS,
]);

function canExtractCollection(view: GuideStepView, target: CampaignItemTarget): boolean {
  if (view.directives.every((row) => collectionTags.has(row.tag))) return true;
  // Objective phases can be omitted from the extracted inventory task. Resource or
  // unrelated quest guards cannot be reassigned, and disablecheckbox can force completion.
  return view.directives.every((row) => {
    if (!collectionTags.has(row.tag) && row.tag !== ".complete") return false;
    if (!CAMPAIGN_SOURCE_CHECKS.has(row.tag)) return true;
    const ids = row.arguments.split(",").map((value) => value.trim());
    return (
      CAMPAIGN_QUEST_GUARDS.has(row.tag) &&
      ids.length > 0 &&
      ids.every((id) => /^\d+$/.test(id) && Number(id) === target.questId)
    );
  });
}

/** Add explicit missing item work, preserving its captured location and personal audience. */
export function attachCampaignItemWork(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  quests: readonly CombatQuestReference[],
): CampaignPlan {
  const profile = createCampaignSourceProfile(plan.race, plan.leaderClass);
  const chapters = new Set(
    plan.actions.flatMap((action) => (action.source ? [action.source.chapterId] : [])),
  );
  const views: SourceView[] = [];
  for (const source of sources) {
    if (source.guide.targetBuild !== plan.targetBuild || !chapters.has(source.guide.chapterId))
      continue;
    for (const step of source.guide.steps) {
      const view = getGuideStepView(
        {
          ...step,
          directives: step.directives.filter((row) => ![".group", ".solo"].includes(row.tag)),
        },
        profile,
        { dungeons: [] },
      );
      if (view.condition === "match") views.push({ source, step, view });
    }
  }
  const bySource = new Map(
    views.map((entry) => [
      `${entry.source.guide.chapterId}:${entry.source.guide.version}:${entry.step.id}`,
      entry,
    ]),
  );
  const targets = views.flatMap((entry) =>
    entry.view.directives.flatMap((row) => {
      const target = parseCampaignItemTarget(row);
      return target ? [{ ...entry, target, label: row.text }] : [];
    }),
  );
  const selected = new Set(
    plan.actions.flatMap((action) => action.questChanges.map((row) => row.questId)),
  );
  const requirements: CampaignItemRequirement[] = [];
  for (const quest of quests) {
    if (!selected.has(quest.questId)) continue;
    for (const item of quest.itemObjectives ?? []) {
      if (item.objectiveIndex === null) continue;
      const prose = campaignItemObjectiveQuantity(quest, item.itemName);
      requirements.push({
        questId: quest.questId,
        objectiveIndex: item.objectiveIndex,
        itemId: item.itemId,
        quantity: item.quantity ?? prose.quantity,
        ...(item.provided ? { sourceProvided: true } : {}),
        ...(item.quantity === null && prose.conflict ? { conflict: true } : {}),
      });
    }
  }
  const itemRequirements = mergeCampaignItemRequirements([plan.itemRequirements, requirements]);
  const actions = plan.actions.map((action): CampaignAction => {
    if (!action.source || action.itemCollections?.length || action.questChanges.length !== 1)
      return action;
    const change = action.questChanges[0]!;
    if (change.state !== "accepted") return action;
    const quest = quests.find((entry) => entry.questId === change.questId);
    const startItem = quest?.startItem;
    if (!startItem) return action;
    const objectiveItems = quest.itemObjectives?.filter((item) => item.itemId === startItem.itemId);
    if (
      objectiveItems?.length !== 1 ||
      objectiveItems[0]!.itemName?.normalize("NFKC").toLowerCase() !==
        startItem.name.normalize("NFKC").toLowerCase()
    )
      return action;
    const own = bySource.get(
      `${action.source.chapterId}:${action.source.version}:${action.source.stepId}`,
    );
    if (!own || own.view.optional) return action;
    const directives = own.view.directives;
    if (
      !directives.every(
        (row) => collectionTags.has(row.tag) || [".use", ".accept"].includes(row.tag),
      )
    )
      return action;
    const uses = directives.filter((row) => row.tag === ".use");
    const accepts = directives.filter((row) => row.tag === ".accept");
    const collections = directives.filter((row) => row.tag === ".collect");
    if (
      uses.length !== 1 ||
      uses[0]!.arguments.trim() !== String(startItem.itemId) ||
      accepts.length !== 1 ||
      accepts[0]!.arguments.trim() !== String(change.questId) ||
      collections.length !== 1
    )
      return action;
    const target = parseCampaignItemTarget(collections[0]!);
    const requirement = itemRequirements.filter(
      (row) => row.questId === change.questId && row.itemId === startItem.itemId,
    );
    if (
      !target ||
      target.questId !== change.questId ||
      target.itemId !== startItem.itemId ||
      requirement.length !== 1 ||
      requirement[0]!.quantity !== target.quantity ||
      requirement[0]!.conflict ||
      requirement[0]!.sourceProvided ||
      !directives.some((row) => row.position !== null)
    )
      return action;
    // Historical AddQuest retains a starter needed for hand-in. Keep use/collect/accept together.
    return {
      ...action,
      itemCollections: [
        {
          ...target,
          confirmationKey: `campaign-item-${own.source.reference.sourceId}-${own.step.ordinal}-${target.questId}-${target.itemId}-${own.source.guide.version}`,
        },
      ],
    };
  });
  const handled = new Set<string>();
  for (const requirement of itemRequirements) {
    const key = `${requirement.questId}:${requirement.itemId}`;
    if (
      handled.has(key) ||
      requirement.quantity === null ||
      requirement.conflict ||
      requirement.sourceProvided
    )
      continue;
    handled.add(key);
    if (
      actions.some((action) =>
        action.itemCollections?.some(
          (target) =>
            target.questId === requirement.questId && target.itemId === requirement.itemId,
        ),
      )
    )
      continue;
    if (
      actions.some((action) =>
        action.questChanges.some(
          (row) =>
            row.questId === requirement.questId &&
            row.state === "objectives-complete" &&
            (row.objectiveIndex ?? 1) === requirement.objectiveIndex,
        ),
      )
    )
      continue;
    const handIns = actions.filter((action) =>
      action.questChanges.some(
        (row) => row.questId === requirement.questId && row.state === "rewarded",
      ),
    );
    if (
      handIns.length !== 1 ||
      !actions.some((action) =>
        action.questChanges.some(
          (row) => row.questId === requirement.questId && row.state === "accepted",
        ),
      )
    )
      continue;
    const handIn = handIns[0]!;
    if (!handIn.source) continue;
    const sourceKey = `${handIn.source.chapterId}:${handIn.source.version}:${handIn.source.stepId}`;
    const handInView = bySource.get(sourceKey);
    if (!handInView || handInView.view.optional) continue;
    const candidate = targets
      .filter(
        (entry) =>
          entry.target.questId === requirement.questId &&
          entry.target.itemId === requirement.itemId &&
          entry.target.quantity === requirement.quantity &&
          entry.source.guide.chapterId === handIn.source!.chapterId &&
          entry.step.ordinal < handInView.step.ordinal &&
          canExtractCollection(entry.view, entry.target) &&
          entry.view.directives.some((row) => row.position !== null),
      )
      .sort((left, right) => right.step.ordinal - left.step.ordinal)[0];
    if (!candidate) continue;
    const target = candidate.target;
    const itemName = quests
      .find((quest) => quest.questId === target.questId)
      ?.itemObjectives?.find((item) => item.itemId === target.itemId)?.itemName;
    const questTitle = handIn.questChanges.find(
      (change) => change.questId === target.questId,
    )!.title;
    const id = `${handIn.legId}-${candidate.source.reference.sourceId}-${candidate.step.id}-collect-${target.questId}-${target.itemId}`;
    const action: CampaignAction = {
      id,
      legId: handIn.legId,
      title:
        candidate.label ||
        `Collect ${target.quantity} ${itemName ?? "required items"} for ${questTitle}`,
      instructions: candidate.view.directives.some((row) => row.tag === ".complete")
        ? [
            candidate.label ||
              `Collect ${target.quantity} ${itemName ?? "required items"} for ${questTitle}`,
          ]
        : candidate.view.directives
            .filter((row) => row.tag === "text" && row.text)
            .map((row) => row.text),
      questChanges: [],
      itemCollections: [
        {
          ...target,
          confirmationKey: `campaign-item-${candidate.source.reference.sourceId}-${candidate.step.ordinal}-${target.questId}-${target.itemId}-${candidate.source.guide.version}`,
        },
      ],
      positions: candidate.view.directives.flatMap((row) =>
        row.position ? [{ sourceLine: row.sourceLine, position: row.position }] : [],
      ),
      source: campaignActionSource(
        candidate.source.guide,
        candidate.step,
        candidate.view.directives,
      ),
      kind: "instructions",
      leaderOnly: handIn.leaderOnly,
      targetLevel: null,
      targetStopId: null,
      raidOnly: handIn.raidOnly,
      ...(handIn.xpOptional === undefined ? {} : { xpOptional: handIn.xpOptional }),
      ...(handIn.xpTargetLevel === undefined ? {} : { xpTargetLevel: handIn.xpTargetLevel }),
    };
    const anchor = actions.findIndex((entry) => {
      if (entry.legId !== handIn.legId || !entry.source) return false;
      if (
        entry.kind === "instructions" &&
        entry.questChanges.length === 0 &&
        entry.source.chapterId === candidate.source.guide.chapterId &&
        entry.source.version === candidate.source.guide.version &&
        entry.source.stepId === candidate.step.id &&
        entry.itemCollections?.length &&
        entry.itemCollections.every((item) => item.questId === target.questId)
      )
        return false;
      const own = bySource.get(
        `${entry.source.chapterId}:${entry.source.version}:${entry.source.stepId}`,
      );
      return (
        own?.source.guide.chapterId === candidate.source.guide.chapterId &&
        own.step.ordinal >= candidate.step.ordinal
      );
    });
    if (anchor < 0 || anchor > actions.indexOf(handIn)) continue;
    actions.splice(anchor, 0, action);
  }
  return groupCampaignItemWork({
    ...plan,
    itemRequirements,
    actions,
    legs: plan.legs.map((leg) => ({
      ...leg,
      actionIds: actions.filter((action) => action.legId === leg.id).map((action) => action.id),
    })),
  });
}
