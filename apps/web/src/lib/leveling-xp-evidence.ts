import {
  campaignEvidenceIssueKey,
  type CampaignEvidenceIssue,
  type QuestValidationResolution,
} from "@wow-trader/leveling";

export type ChapterEvidenceState =
  | "blocked"
  | "unknown"
  | "shortfall"
  | "estimated-reward"
  | "estimated-combat"
  | "adaptive"
  | "review"
  | "verified";

interface ChapterEvidenceMember {
  readonly status: "covered" | "shortfall" | "incomplete" | "blocked" | "no-start" | "before-start";
  readonly residualXp: number | null;
  readonly blockedReason: string | null;
  readonly issues: readonly CampaignEvidenceIssue[];
  readonly inheritedIssueCount: number;
  readonly validationResolutions?: readonly Pick<
    QuestValidationResolution,
    "code" | "questId" | "raceId" | "classSlug"
  >[];
}

export interface ChapterEvidencePresentation {
  readonly state: ChapterEvidenceState;
  readonly label: string;
  readonly details: readonly string[];
  readonly issueCount: number;
  readonly inheritedIssueCount: number;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function describeChapterEvidence(
  members: readonly ChapterEvidenceMember[],
): ChapterEvidencePresentation {
  const issues = [
    ...new Map(
      members
        .flatMap((member) => member.issues)
        .map((issue) => [campaignEvidenceIssueKey(issue), issue]),
    ).values(),
  ];
  const inheritedIssueCount = Math.max(0, ...members.map((member) => member.inheritedIssueCount));
  const count = (predicate: (issue: CampaignEvidenceIssue) => boolean): number =>
    issues.filter(predicate).length;
  const details: string[] = [];
  const reviewedContexts = new Set(
    members
      .flatMap((member) => member.validationResolutions ?? [])
      .map((row) => `${row.code}:${row.questId}:${row.raceId}:${row.classSlug}`),
  );
  if (reviewedContexts.size)
    details.push(
      `${plural(reviewedContexts.size, "quest condition")} matched reviewed evidence for the shown character and party contexts in this chapter.`,
    );
  const historicalRewards = count((issue) => issue.code === "reward-historical-estimate");
  const bundleEstimates = count((issue) => issue.code === "dungeon-bundle-estimated");
  const unresolvedRewards = count((issue) => issue.code === "reward-unresolved");
  const adaptiveCheckpoints = count((issue) => issue.code === "adaptive-grind-unmeasured");
  const otherCombat = count(
    (issue) => issue.domain === "combat" && issue.code !== "adaptive-grind-unmeasured",
  );
  const eligibility = count((issue) => issue.domain === "eligibility");
  const route = count((issue) => issue.domain === "route");
  const progress = count((issue) => issue.domain === "progress");

  if (unresolvedRewards)
    details.push(`${plural(unresolvedRewards, "quest reward")} still need current-build XP data.`);
  if (historicalRewards)
    details.push(
      `${plural(historicalRewards, "quest reward")} use historical estimates instead of published Forever XP.`,
    );
  if (bundleEstimates)
    details.push(
      `${plural(bundleEstimates, "guaranteed dungeon bundle")} use level-scaled planning rewards; quest identities and final rewards remain pending.`,
    );
  if (adaptiveCheckpoints)
    details.push(
      `${plural(adaptiveCheckpoints, "level checkpoint")} use adaptive grinding; the required XP is known, but the kills and duration are unmeasured.`,
    );
  if (otherCombat)
    details.push(
      `${plural(otherCombat, "combat assumption or omitted input")} ${otherCombat === 1 ? "remains" : "remain"} explicit. Sourced estimates can support planning; unknown XP is excluded. Measurements refine accuracy; they are not a prerequisite for planning.`,
    );
  if (eligibility)
    details.push(`${plural(eligibility, "eligibility rule")} need source or in-game confirmation.`);
  if (route) details.push(`${plural(route, "route condition")} need validation.`);
  if (progress)
    details.push(`${plural(progress, "player-state checkpoint")} need a current XP bar.`);
  if (inheritedIssueCount)
    details.push(
      `${plural(inheritedIssueCount, "issue")} originated in an earlier chapter and still affect this forecast.`,
    );

  const blocked = members.some((member) => member.status === "blocked" || member.blockedReason);
  const unknown = members.some(
    (member) => member.status === "no-start" || member.residualXp === null,
  );
  const shortfall = members.some(
    (member) => member.status === "shortfall" || (member.residualXp ?? 0) > 0,
  );
  let state: ChapterEvidenceState;
  let label: string;
  if (blocked) {
    state = "blocked";
    label = "Progression blocked";
  } else if (unknown || unresolvedRewards) {
    state = "unknown";
    label = "XP outcome needs current data";
  } else if (shortfall) {
    state = "shortfall";
    label = "Known-XP subtotal below target";
  } else if (historicalRewards || bundleEstimates) {
    state = "estimated-reward";
    label = bundleEstimates
      ? "XP target modeled with guaranteed-bundle estimates"
      : "XP target modeled with historical rewards";
  } else if (adaptiveCheckpoints && !otherCombat && !eligibility && !route && !progress) {
    state = "adaptive";
    label = "XP target modeled with adaptive grinding";
  } else if (otherCombat && !eligibility && !route && !progress) {
    state = "estimated-combat";
    label = "XP target modeled; combat remains estimated or excluded";
  } else if (issues.length || members.some((member) => member.status === "incomplete")) {
    state = "review";
    label = "XP target modeled; route evidence needs review";
  } else {
    state = "verified";
    label = "Modeled XP reaches target";
  }

  return {
    state,
    label,
    details,
    issueCount: issues.length,
    inheritedIssueCount,
  };
}
