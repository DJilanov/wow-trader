import { z } from "zod";

/** A planning anchor, separate from measured creature payouts and population profiles. */
export const dungeonKillXpReferenceSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,120}$/),
    basis: z.literal("reference-estimate"),
    partySize: z.literal(5),
    referenceLevel: z.number().int().min(1).max(59),
    minimumXpPerPlayer: z.number().int().positive().max(1000000),
    maximumXpPerPlayer: z.number().int().positive().max(1000000),
    source: z.string().trim().min(1).max(2000),
  })
  .strict()
  .refine(
    (reference) => reference.minimumXpPerPlayer <= reference.maximumXpPerPlayer,
    "Reversed dungeon XP reference range",
  );

export type DungeonKillXpReference = z.infer<typeof dungeonKillXpReferenceSchema>;

export const OWNER_DUNGEON_KILL_XP_REFERENCE: DungeonKillXpReference = {
  id: "owner-level20-five-player-dungeon-elite",
  basis: "reference-estimate",
  partySize: 5,
  referenceLevel: 20,
  minimumXpPerPlayer: 24,
  maximumXpPerPlayer: 30,
  source:
    "Owner-supplied planning range: a level-20 dungeon elite killed by five level-20 players gives 24–30 XP per player. Build and sample context are unverified; other levels use a solo-base and level-weighted-share extrapolation. No further division by five, party bonus or patch bonus.",
};

export function dungeonReferencePayout(input: {
  readonly reference: DungeonKillXpReference;
  readonly soloXp: number;
  readonly anchorSoloXp: number;
  readonly playerLevel: number;
  readonly partyLevels: readonly number[];
  readonly xpMultiplier: number;
}): readonly [number, number] {
  const { reference, soloXp, anchorSoloXp, playerLevel, partyLevels, xpMultiplier } = input;
  const denominator = anchorSoloXp * partyLevels.reduce((sum, level) => sum + level, 0);
  // Multiply the integers first: dividing24by145 first can round the anchor down to23.
  const payout = (xp: number): number =>
    Math.floor((soloXp * xp * reference.partySize * playerLevel * xpMultiplier) / denominator);
  return [payout(reference.minimumXpPerPlayer), payout(reference.maximumXpPerPlayer)];
}
