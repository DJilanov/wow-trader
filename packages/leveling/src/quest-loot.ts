import { z } from "zod";

const id = z.number().int().positive().max(10_000_000);
export const lootSharingSchema = z.enum(["independent", "pooled", "unknown"]);
export type LootSharing = z.infer<typeof lootSharingSchema>;

export const questItemObjectiveSchema = z
  .object({
    objectiveIndex: z.number().int().min(1).max(100).nullable(),
    itemId: id,
    quantity: z.number().int().min(1).max(10_000).nullable(),
    npcIds: z.array(id).max(1000),
    sharing: lootSharingSchema,
  })
  .strict();

export const questLootDropSchema = z
  .object({
    itemId: id,
    npcId: id,
    probability: z.number().finite().min(0).max(1),
    minimumQuantity: z.number().int().min(1).max(10_000).nullable(),
    maximumQuantity: z.number().int().min(1).max(10_000).nullable(),
    sampleSize: z.number().int().positive().nullable(),
    targetBuild: z.number().int().positive(),
    sourceBuild: z.number().int().positive().nullable().optional(),
    sourceUrl: z.url(),
    capturedAt: z.iso.datetime(),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
  .refine(
    (drop) =>
      drop.minimumQuantity === null ||
      drop.maximumQuantity === null ||
      drop.maximumQuantity >= drop.minimumQuantity,
    "Invalid drop stack range",
  );
export type QuestLootDrop = z.infer<typeof questLootDropSchema>;
export type LootScenario = "fast" | "expected" | "slow";
export type LootKillEstimate =
  | {
      readonly status: "estimated";
      readonly fastKills: number;
      readonly expectedKills: number;
      readonly slowKills: number;
      readonly minimumKills: number;
    }
  | { readonly status: "unknown"; readonly reason: string };

/** Conditional on the supplied drop probability; sample uncertainty is not a confidence interval. */
export function estimateLootKills(input: {
  readonly quantity: number;
  readonly probability: number;
  readonly minimumQuantity: number | null;
  readonly maximumQuantity: number | null;
  readonly partySize: number;
  readonly sharing: LootSharing;
}): LootKillEstimate {
  const { quantity, probability, partySize, sharing, minimumQuantity, maximumQuantity } = input;
  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 10_000 ||
    !Number.isFinite(probability) ||
    probability < 0 ||
    probability > 1 ||
    !Number.isInteger(partySize) ||
    partySize < 1 ||
    partySize > 5 ||
    !lootSharingSchema.safeParse(sharing).success ||
    [minimumQuantity, maximumQuantity].some(
      (n) => n !== null && (!Number.isInteger(n) || n < 1 || n > 10_000),
    ) ||
    (minimumQuantity !== null && maximumQuantity !== null && minimumQuantity > maximumQuantity)
  )
    throw new Error("Invalid quest loot estimate inputs.");
  const unknown = (reason: string): LootKillEstimate => ({ status: "unknown", reason });
  if (probability === 0) return unknown("This creature has no established positive drop chance.");
  if (minimumQuantity === null || maximumQuantity === null)
    return unknown("Items per successful drop are missing; one item is not assumed.");
  if (minimumQuantity !== maximumQuantity)
    return unknown(
      "Variable stacks require their quantity distribution, not a uniform assumption.",
    );
  if (partySize > 1 && sharing === "unknown")
    return unknown("Quest loot sharing is unknown for this party.");
  const successes = Math.ceil(
    (quantity * (sharing === "pooled" ? partySize : 1)) / minimumQuantity,
  );
  const independent = sharing === "independent" ? partySize : 1;
  if (successes > 10_000 || successes / probability > 10_000)
    return unknown("Expected collection exceeds the 10,000-kill planning budget.");
  if (probability === 1)
    return {
      status: "estimated",
      minimumKills: successes,
      fastKills: successes,
      expectedKills: successes,
      slowKills: successes,
    };

  let logMass = successes * Math.log(probability),
    cdf = 0;
  let fast: number | null = null,
    slow: number | null = null;
  let expectedMaximum = successes;
  // Negative-binomial completion time. Independent personal rolls need every player to finish.
  for (let kills = successes; kills <= 10_000; kills++) {
    cdf = Math.min(1, cdf + Math.exp(logMass));
    const allComplete = cdf ** independent;
    if (fast === null && allComplete >= 0.1) fast = kills;
    if (slow === null && allComplete >= 0.9) slow = kills;
    expectedMaximum += 1 - allComplete;
    if (allComplete >= 1 - 1e-12 && fast !== null && slow !== null)
      return {
        status: "estimated",
        minimumKills: successes,
        fastKills: fast,
        expectedKills: independent === 1 ? successes / probability : expectedMaximum,
        slowKills: slow,
      };
    logMass += Math.log(kills) - Math.log(kills - successes + 1) + Math.log1p(-probability);
  }
  return unknown("Drop variance exceeds the bounded planning distribution.");
}

export function plannedLootKills(
  estimate: Extract<LootKillEstimate, { status: "estimated" }>,
  scenario: LootScenario,
): number {
  return scenario === "fast"
    ? estimate.fastKills
    : scenario === "slow"
      ? estimate.slowKills
      : Math.ceil(estimate.expectedKills);
}
