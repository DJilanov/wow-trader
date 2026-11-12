import { z } from "zod";
import type { CampaignAction, CampaignPlan } from "./campaign.js";
import { CAMPAIGN_RACES } from "./campaign-route.js";
import { classSlugs } from "./model.js";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const identity = z.string().min(1).max(300);

export const campaignRouteLockSchema = z.object({
  schema: z.literal("campaign-route-lock.v1"),
  blockSize: z.literal(10),
  targetLevel: z.number().int().min(10).max(60).refine((level) => level % 10 === 0),
  race: z.enum(CAMPAIGN_RACES),
  leaderClass: z.enum(classSlugs).nullable(),
  targetBuild: z.number().int().positive(),
  sourceArchiveSha256: hash,
  party: z.array(z.object({
    raceId: z.enum(CAMPAIGN_RACES), classSlug: z.enum(classSlugs), role: z.enum(["tank", "healer", "dps"]),
  }).strict()).length(5),
  boundaryActionId: identity,
  actions: z.array(z.object({ id: identity, sha256: hash }).strict()).min(1).max(10000),
  payload: z.object({ file: z.string().regex(/^route-[a-f0-9]{64}\.json$/), sha256: hash }).strict(),
  validation: z.object({
    file: z.string().regex(/^validation-[a-f0-9]{64}\.json$/), sha256: hash,
    engineSha256: hash, referenceSha256: hash,
    forecastCases: z.number().int().min(48), nativeCases: z.number().int().min(20),
    questLogCapacity: z.literal(40), kind: z.literal("projected-reference-xp"),
  }).strict(),
}).strict().superRefine((lock, context) => {
  if (new Set(lock.actions.map((action) => action.id)).size !== lock.actions.length ||
    lock.actions.at(-1)?.id !== lock.boundaryActionId ||
    lock.payload.file !== `route-${lock.payload.sha256}.json` ||
    lock.validation.file !== `validation-${lock.validation.sha256}.json`)
    context.addIssue({ code: "custom", message: "Route lock identities or content-addressed filenames disagree." });
  if (lock.party.filter((member) => member.role === "tank").length !== 1 ||
    lock.party.filter((member) => member.role === "healer").length !== 1 ||
    lock.party.filter((member) => member.role === "dps").length !== 3)
    context.addIssue({ code: "custom", message: "A validated five-player route needs one tank, one healer and three DPS." });
});

export type CampaignRouteLock = z.infer<typeof campaignRouteLockSchema>;
export type CampaignRouteHash = (text: string) => string;

export interface CampaignRouteLockContext {
  readonly lock: CampaignRouteLock;
  readonly party: CampaignRouteLock["party"];
  readonly hashText: CampaignRouteHash;
  readonly engineSha256: string;
  readonly referenceSha256: string;
}

function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalized(entry)]));
  return value;
}

/** Keep the route payload independent of its replaceable XP-validation certificate. */
export function campaignActionLockText(action: CampaignAction): string {
  return JSON.stringify(normalized(action));
}

/** A new generation must not silently insert, remove, reorder or edit an approved prefix. */
export function assertCampaignRouteLock(plan: CampaignPlan, context: CampaignRouteLockContext): void {
  const lock = campaignRouteLockSchema.parse(context.lock);
  if (plan.race !== lock.race || plan.leaderClass !== lock.leaderClass ||
    plan.targetBuild !== lock.targetBuild || plan.sourceArchiveSha256 !== lock.sourceArchiveSha256)
    throw new Error("Validated route lock belongs to a different edition or source archive.");
  if (JSON.stringify(normalized(context.party)) !== JSON.stringify(normalized(lock.party)))
    throw new Error("Validated route lock belongs to a different party composition.");
  if (lock.validation.engineSha256 !== context.engineSha256 ||
    lock.validation.referenceSha256 !== context.referenceSha256)
    throw new Error("Validated route needs XP revalidation for the current model or reference data. Preserve its approved tasks.");
  for (const [index, expected] of lock.actions.entries()) {
    const action = plan.actions[index];
    if (!action || action.id !== expected.id || context.hashText(campaignActionLockText(action)) !== expected.sha256)
      throw new Error(`Validated route through level ${lock.targetLevel} changed at ${expected.id}. Revise and revalidate this block explicitly.`);
  }
}
