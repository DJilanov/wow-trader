import { createCharacterProfile, type CharacterProfile } from "./profile.js";
import type { CampaignRace } from "./campaign-route.js";
import type { ClassSlug } from "./model.js";

export function campaignPlanSourceProfile(plan: {
  readonly race: CampaignRace;
  readonly leaderClass: ClassSlug | null;
  readonly sharedQuestsOnly?: true;
}): CharacterProfile {
  return createCampaignSourceProfile(plan.race, plan.sharedQuestsOnly ? null : plan.leaderClass);
}

export function createCampaignSourceProfile(
  race: CampaignRace,
  classSlug: ClassSlug | null,
): CharacterProfile {
  return {
    ...createCharacterProfile("alliance", race),
    classSlug,
    // A source-guide branch policy, not the server's quest/kill XP multiplier.
    xpRate: 1,
    party: { size: 5, readiness: "together", tank: "unknown", healer: "unknown" },
  };
}
