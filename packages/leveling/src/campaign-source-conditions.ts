import type { CampaignAction } from "./campaign.js";
import type { ImportedDirective, ImportedChapter, ImportedStep } from "./guide-archive.js";
import { CAMPAIGN_QUEST_GUARDS, normalizeQuestPickupGuard } from "./campaign-native-guards.js";
import { displayOnlyQuestPhases } from "./campaign-source-display.js";

export const CAMPAIGN_SOURCE_CHECKS: ReadonlySet<string> = new Set([
  ...CAMPAIGN_QUEST_GUARDS,
  ".itemcount",
  ".money",
]);

export interface CampaignSourceConditions {
  readonly checks: readonly ImportedDirective[];
  readonly phases: readonly ImportedDirective[];
  readonly optional: boolean;
}

/** Preserve the source context so split/reassigned actions can select their own controls later. */
export function createCampaignSourceConditions(
  directives: readonly ImportedDirective[],
): CampaignSourceConditions | undefined {
  const checks = directives.filter((directive) => CAMPAIGN_SOURCE_CHECKS.has(directive.tag));
  if (!checks.length) return undefined;
  const displayOnly = displayOnlyQuestPhases(directives);
  return {
    checks,
    phases: directives.filter(
      (directive) =>
        [".accept", ".complete", ".turnin"].includes(directive.tag) && !displayOnly.has(directive),
    ),
    optional: directives.some((directive) =>
      ["#optional", "#completewith"].includes(directive.tag),
    ),
  };
}

export function campaignActionSource(
  guide: Pick<ImportedChapter, "chapterId" | "version">,
  step: Pick<ImportedStep, "id">,
  directives: readonly ImportedDirective[],
): NonNullable<CampaignAction["source"]> {
  const conditions = createCampaignSourceConditions(directives);
  return {
    chapterId: guide.chapterId,
    version: guide.version,
    stepId: step.id,
    ...(conditions ? { conditions } : {}),
  };
}

export function matchesCampaignSourcePhase(
  action: CampaignAction,
  directive: ImportedDirective,
): boolean {
  const state =
    directive.tag === ".accept"
      ? "accepted"
      : directive.tag === ".complete"
        ? "objectives-complete"
        : directive.tag === ".turnin"
          ? "rewarded"
          : null;
  const objective =
    directive.tag === ".complete" ? Number(directive.arguments.split(",")[1] ?? 1) : null;
  return action.questChanges.some(
    (change) =>
      change.questId === directive.questId &&
      change.state === state &&
      (change.state === "objectives-complete"
        ? (change.objectiveIndex ?? 1)
        : change.objectiveIndex) === objective,
  );
}

/** Match native partial-step filtering, then normalize a split parent hand-in before its pickup. */
export function campaignSourceCheckMap(
  action: CampaignAction,
  conditions: CampaignSourceConditions | undefined = action.source?.conditions,
): ReadonlyMap<ImportedDirective, ImportedDirective> {
  if (!conditions) return new Map();
  if (
    action.questChanges.some(
      (change) =>
        !conditions.phases.some((phase) =>
          matchesCampaignSourcePhase({ ...action, questChanges: [change] }, phase),
        ),
    )
  )
    return new Map();
  const complete = conditions.phases.every((phase) => matchesCampaignSourcePhase(action, phase));
  const relevant = new Set([
    ...action.questChanges.map((change) => change.questId),
    ...(action.itemCollections?.map((target) => target.questId) ?? []),
    ...(action.requiredQuestIds ?? []),
  ]);
  return new Map(
    conditions.checks
      .filter((check) => {
        const questCheck = CAMPAIGN_QUEST_GUARDS.has(check.tag);
        const ids = check.arguments.split(",").map(Number);
        if (action.creatureTarget && questCheck && ids.some((id) => !relevant.has(id)))
          return false;
        return complete || (questCheck && ids.length > 0 && ids.every((id) => relevant.has(id)));
      })
      .map((check) => [check, normalizeQuestPickupGuard(check, action, conditions.phases)]),
  );
}

export function campaignSourceChecks(
  action: CampaignAction,
  conditions: CampaignSourceConditions | undefined = action.source?.conditions,
): readonly ImportedDirective[] {
  return conditions ? [...campaignSourceCheckMap(action, conditions).values()] : [];
}
