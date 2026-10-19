export type CampaignEvidenceDomain = "reward" | "eligibility" | "combat" | "route" | "progress";

export type CampaignEvidenceResolution = "offline" | "in-game" | "offline-or-in-game";

export type CampaignEvidenceCode =
  | "saved-xp-invalid"
  | "named-target-unverified"
  | "source-prerequisite-missing"
  | "optional-quest-unmodeled"
  | "dungeon-access-unverified"
  | "checkpoint-not-ready"
  | "quest-bundle-unverified"
  | "adaptive-grind-unmeasured"
  | "combat-input-unknown"
  | "combat-scenario-estimated"
  | "pickup-level-conflict"
  | "source-gate-conflict"
  | "quest-lifecycle-unverified"
  | "personal-eligibility-unverified"
  | "quest-ineligible"
  | "quest-pickup-missing"
  | "quest-objectives-incomplete"
  | "dungeon-objective-misordered"
  | "combat-profile-unverified"
  | "reward-unresolved"
  | "reward-historical-estimate"
  | "dungeon-bundle-estimated"
  | "dungeon-details-pending";

export interface CampaignEvidenceIssue {
  readonly code: CampaignEvidenceCode;
  readonly domain: CampaignEvidenceDomain;
  readonly message: string;
  readonly resolution: CampaignEvidenceResolution;
  readonly actionId: string | null;
  readonly questId: number | null;
  readonly blocksForecast: boolean;
}

export interface CampaignEvidenceSummary {
  readonly reward: "verified" | "estimated" | "unresolved";
  readonly eligibility: "verified" | "unverified" | "blocked";
  readonly combat: "verified" | "adaptive" | "estimated" | "unresolved";
  readonly route: "compiled" | "unverified" | "blocked";
  readonly progress: "current" | "unverified";
}

export interface CampaignEvidenceDefinition {
  readonly label: string;
  readonly requiredEvidence: string;
  readonly releaseImpact: "blocker" | "validation" | "measurement";
}

export const CAMPAIGN_EVIDENCE_CATALOG = {
  "saved-xp-invalid": {
    label: "Current player XP required",
    requiredEvidence: "Record a fresh level and XP bar that fits the pinned XP curve.",
    releaseImpact: "blocker",
  },
  "named-target-unverified": {
    label: "Named-target party credit unverified",
    requiredEvidence: "Confirm objective credit or required loot for all five players in game.",
    releaseImpact: "validation",
  },
  "source-prerequisite-missing": {
    label: "Required prerequisite missing",
    requiredEvidence:
      "Repair the source-ordered prerequisite lifecycle or prove the alternative gate.",
    releaseImpact: "blocker",
  },
  "optional-quest-unmodeled": {
    label: "Selected optional quest is not modeled",
    requiredEvidence: "Model its full lifecycle or remove it from the selected route.",
    releaseImpact: "blocker",
  },
  "dungeon-access-unverified": {
    label: "Dungeon access bundle unverified",
    requiredEvidence: "Verify the access and prerequisite bundle from source data or in game.",
    releaseImpact: "blocker",
  },
  "checkpoint-not-ready": {
    label: "Actual XP checkpoint required",
    requiredEvidence:
      "Record a current player bar or complete the stated preparation before continuing.",
    releaseImpact: "blocker",
  },
  "quest-bundle-unverified": {
    label: "Quest bundle unverified",
    requiredEvidence: "Replace the unverified action with a complete sourced lifecycle.",
    releaseImpact: "blocker",
  },
  "adaptive-grind-unmeasured": {
    label: "Adaptive grind is playable but unmeasured",
    requiredEvidence:
      "Observe a suitable camp, kill mix, XP gain, and duration for the level checkpoint.",
    releaseImpact: "measurement",
  },
  "combat-input-unknown": {
    label: "Combat input missing",
    requiredEvidence:
      "Provide a compatible kill count and solo XP value or a controlled observation.",
    releaseImpact: "validation",
  },
  "combat-scenario-estimated": {
    label: "Combat scenario is estimated",
    requiredEvidence: "Replace the estimate with matching controlled combat observations.",
    releaseImpact: "measurement",
  },
  "pickup-level-conflict": {
    label: "Pickup level sources conflict",
    requiredEvidence:
      "Reconcile current-build sources or observe the lowest eligible pickup level.",
    releaseImpact: "validation",
  },
  "source-gate-conflict": {
    label: "Source prerequisite conflict",
    requiredEvidence: "Confirm the build-specific pickup in game or correct the older gate.",
    releaseImpact: "validation",
  },
  "quest-lifecycle-unverified": {
    label: "Quest lifecycle unverified",
    requiredEvidence: "Verify pickup level and every required quest lifecycle phase.",
    releaseImpact: "validation",
  },
  "personal-eligibility-unverified": {
    label: "Personal eligibility unverified",
    requiredEvidence: "Confirm race, class, item, or character-specific eligibility in game.",
    releaseImpact: "validation",
  },
  "quest-ineligible": {
    label: "Quest is not eligible",
    requiredEvidence:
      "Remove the action from this edition or repair its race/class/faction condition.",
    releaseImpact: "blocker",
  },
  "quest-pickup-missing": {
    label: "Quest pickup is missing",
    requiredEvidence: "Insert the valid pickup/held state before objectives or hand-in.",
    releaseImpact: "blocker",
  },
  "quest-objectives-incomplete": {
    label: "Quest objectives are incomplete",
    requiredEvidence: "Repair the route so every modeled objective completes before hand-in.",
    releaseImpact: "blocker",
  },
  "dungeon-objective-misordered": {
    label: "Dungeon objective is misordered",
    requiredEvidence: "Move the objective into its dungeon visit before crediting its hand-in.",
    releaseImpact: "blocker",
  },
  "combat-profile-unverified": {
    label: "Combat profile unverified",
    requiredEvidence:
      "Resolve the profile issue with current-build NPC data or controlled observations.",
    releaseImpact: "validation",
  },
  "reward-unresolved": {
    label: "Quest reward XP unresolved",
    requiredEvidence: "Publish current-build Forever XP or record an exact eligible hand-in delta.",
    releaseImpact: "blocker",
  },
  "reward-historical-estimate": {
    label: "Quest reward uses historical XP",
    requiredEvidence:
      "Replace the fallback with published Forever XP or an exact current-build hand-in observation.",
    releaseImpact: "validation",
  },
  "dungeon-bundle-estimated": {
    label: "Guaranteed dungeon rewards use a planning estimate",
    requiredEvidence:
      "Replace the level-scaled bundle estimate with compatible real quest reward evidence.",
    releaseImpact: "validation",
  },
  "dungeon-details-pending": {
    label: "Guaranteed dungeon quest identities and access are pending",
    requiredEvidence:
      "Identify the four faction quests and source their pickup, objectives, hand-ins and access requirements.",
    releaseImpact: "validation",
  },
} as const satisfies Record<CampaignEvidenceCode, CampaignEvidenceDefinition>;

export function summarizeCampaignEvidence(
  issues: readonly CampaignEvidenceIssue[],
): CampaignEvidenceSummary {
  const has = (code: CampaignEvidenceCode): boolean => issues.some((issue) => issue.code === code);
  const blocks = (domain: CampaignEvidenceDomain): boolean =>
    issues.some((issue) => issue.domain === domain && issue.blocksForecast);
  const hasDomain = (domain: CampaignEvidenceDomain): boolean =>
    issues.some((issue) => issue.domain === domain);

  return {
    reward: has("reward-unresolved")
      ? "unresolved"
      : has("reward-historical-estimate") || has("dungeon-bundle-estimated")
        ? "estimated"
        : "verified",
    eligibility: blocks("eligibility")
      ? "blocked"
      : hasDomain("eligibility")
        ? "unverified"
        : "verified",
    combat: has("combat-input-unknown")
      ? "unresolved"
      : has("combat-scenario-estimated") || has("combat-profile-unverified")
        ? "estimated"
        : has("adaptive-grind-unmeasured")
          ? "adaptive"
          : "verified",
    route: blocks("route") ? "blocked" : hasDomain("route") ? "unverified" : "compiled",
    progress: hasDomain("progress") ? "unverified" : "current",
  };
}

export function campaignEvidenceIssueKey(issue: CampaignEvidenceIssue): string {
  const subject = issue.questId === null ? issue.actionId : issue.questId;
  return `${issue.code}:${subject ?? "route"}`;
}
