import type { CampaignSource } from "./campaign.js";
import { chapterEligibility, getChapterLabel } from "./chapter-catalog.js";
import { LEVELING_RACES, type CharacterProfile } from "./profile.js";

export interface EligibleCampaignLibrarySource {
  readonly source: CampaignSource;
  readonly ordinaryOnly: boolean;
}

/** Class recommendations can supply ordinary methods; real header and XP constraints still apply. */
export function eligibleCampaignLibrarySource(
  source: CampaignSource,
  profile: CharacterProfile,
  sharedOrdinary: boolean,
): EligibleCampaignLibrarySource | null {
  const { reference } = source;
  if (chapterEligibility(reference, profile) === "match") return { source, ordinaryOnly: false };
  if (!sharedOrdinary || profile.classSlug !== null) return null;
  const neutral = { ...reference, condition: "", defaults: [] };
  if (chapterEligibility(neutral, profile) !== "match") return null;
  const race = LEVELING_RACES.find(
    (entry) => entry.id === profile.raceId && entry.faction === profile.faction,
  );
  const selected = race?.classes
    .map((classSlug) => ({ ...profile, classSlug }))
    .find((candidate) => chapterEligibility(reference, candidate) === "match");
  if (!selected) return null;
  const label = getChapterLabel(reference, selected);
  return {
    source: {
      ...source,
      reference: { ...neutral, labels: [{ value: label.title, condition: "" }] },
    },
    ordinaryOnly: true,
  };
}
