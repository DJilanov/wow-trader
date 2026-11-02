import type { CampaignPlan, CampaignSource } from "./campaign.js";
import type { CampaignMaterialWork, CombatDataset, CombatObjective } from "./combat-model.js";
import { getGuideStepView } from "./guide-archive.js";
import { createCampaignSourceProfile } from "./campaign-source-profile.js";
import { parseCampaignItemTarget } from "./campaign-items.js";

const normalized = (value: string): string =>
  value.normalize("NFKC").replace(/^\+/, "").trim().toLowerCase();

/** Bind stock instructions to their captured creature; ambiguous methods remain unmodeled. */
export function compileCampaignMaterialWork(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  dataset: CombatDataset,
): readonly CampaignMaterialWork[] {
  const profile = createCampaignSourceProfile(plan.race, plan.leaderClass);
  const steps = new Map(
    sources.flatMap(({ guide }) =>
      guide.targetBuild !== plan.targetBuild
        ? []
        : guide.steps.map(
            (step) => [`${guide.chapterId}:${guide.version}:${step.id}`, step] as const,
          ),
    ),
  );
  const quests = new Map(dataset.quests.map((quest) => [quest.questId, quest]));
  return plan.actions.flatMap((action): CampaignMaterialWork[] => {
    if (!action.source || !action.itemCollections?.length) return [];
    const source = action.source;
    const step = steps.get(
      `${action.source.chapterId}:${action.source.version}:${action.source.stepId}`,
    );
    if (!step) throw new Error("Material work has no matching captured source step.");
    const view = getGuideStepView(
      {
        ...step,
        directives: step.directives.filter((row) => ![".group", ".solo"].includes(row.tag)),
      },
      profile,
      { dungeons: [] },
    );
    if (view.condition !== "match") return [];
    const selfGather =
      view.directives.some(
        (row) => row.tag === "text" && /^\s*(?:kill|slay|defeat|destroy)\s/i.test(row.text),
      ) &&
      !view.directives.some(
        (row) =>
          [".buy", ".vendor", ".use", ".cast"].includes(row.tag) ||
          (row.tag === "text" &&
            /\b(?:buy|purchase|pickpocket|pick pocket|trade|instead|unless|avoid)\b|\bdon['’]t\b/i.test(
              row.text,
            )),
      );
    const targets = action.itemCollections
      .map((target): CampaignMaterialWork["targets"][number] => {
        const matches = view.directives
          .map((row, offset) => ({ row, offset, parsed: parseCampaignItemTarget(row) }))
          .filter(
            ({ parsed }) =>
              parsed &&
              parsed.itemId === target.itemId &&
              parsed.questId === target.questId &&
              parsed.quantity === target.quantity &&
              parsed.objectiveBitmask === target.objectiveBitmask,
          );
        const found = matches.length === 1 ? matches[0] : undefined;
        const names = new Set<string>();
        if (found)
          for (const row of view.directives.slice(found.offset + 1)) {
            if ([".collect", ".complete"].includes(row.tag)) break;
            if (row.tag === ".mob") names.add(normalized(row.arguments));
          }
        const items =
          quests
            .get(target.questId)
            ?.itemObjectives?.filter((item) => item.itemId === target.itemId) ?? [];
        const item = items.length === 1 ? items[0] : undefined;
        const candidates =
          item?.provided || item?.groundPickup
            ? []
            : dataset.npcs.filter(
                (npc) => item?.npcIds.includes(npc.id) && names.has(normalized(npc.name)),
              );
        const requirement = (plan.itemRequirements ?? []).filter(
          (row) => row.questId === target.questId && row.itemId === target.itemId,
        );
        const compatible =
          found &&
          selfGather &&
          target.objectiveBitmask === 1 &&
          item &&
          !item.provided &&
          !item.groundPickup &&
          item.objectiveIndex !== null &&
          requirement.length === 1 &&
          requirement[0]!.quantity === target.quantity &&
          !requirement[0]!.conflict &&
          !requirement[0]!.sourceProvided;
        const usable = compatible && candidates.length === 1;
        const objective: CombatObjective = {
          questId: target.questId,
          objectiveIndex: item?.objectiveIndex ?? 1,
          npcIds: usable ? [candidates[0]!.id] : [],
          requiredKills: null,
          credit: usable ? "personal-loot" : "unknown",
          source: `${source.chapterId}:${source.stepId}; captured material ${target.itemId}`,
          reason: usable
            ? null
            : "Material collection needs a unique source creature, compatible quantity and explicit self-gather method.",
          loot: {
            itemId: target.itemId,
            quantity: target.quantity,
            sharing: item?.sharing ?? "unknown",
            ...(item?.sharingReference ? { sharingReference: item.sharingReference } : {}),
          },
        };
        return {
          confirmationKey: target.confirmationKey,
          sourceOrdinal: found?.offset ?? Number.MAX_SAFE_INTEGER,
          sourceBlocksCompletion:
            found !== undefined && (found.row.arguments.split(",")[4]?.trim() ?? "0") === "0",
          possibleDropNpcIds: item?.npcIds ?? [],
          objective,
        };
      })
      .sort((left, right) => left.sourceOrdinal - right.sourceOrdinal);
    return [{ id: `${action.id}-material-work`, actionId: action.id, targets }];
  });
}
