import type { ClassSlug } from "./model.js";
import { getLevelingRace, type RaceId } from "./profile.js";
import { premadeProgressSchema, type PremadeProgress } from "./premade-model.js";

export function recordPremadeMemberIdentity(
  progress: PremadeProgress,
  index: number,
  identity: { readonly raceId: RaceId | null; readonly classSlug: ClassSlug | null },
): PremadeProgress {
  if (!Number.isInteger(index) || index < 0 || index >= progress.members.length)
    throw new Error("Unknown party member.");
  const race = identity.raceId === null ? null : getLevelingRace("alliance", identity.raceId);
  if (identity.raceId !== null && !race)
    throw new Error("This guide supports Alliance party identities.");
  if (race && identity.classSlug !== null && !race.classes.includes(identity.classSlug))
    throw new Error("That class is not available for the selected race.");
  return premadeProgressSchema.parse({
    ...progress,
    members: progress.members.map((member, position) =>
      position === index ? { ...member, ...identity } : member,
    ),
  });
}
