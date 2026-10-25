import { z } from "zod";
import {
  type healerBuildSchema,
  healerConfigurationSchema,
  type healerItemSchema,
  healerLibrarySchema,
  healerReleaseSchema,
  healingEquipmentSchema,
  healingJobSchema,
  type healingRankPolicySchema,
  healingReplySchema,
  type HealerLibrary,
  type HealingResult,
  type HealingWorkload,
} from "./healing-simulator.js";
import {
  druidHealerLibrarySchema,
  druidHealerReleaseSchema,
  druidHealingJobSchema,
  druidHealingReplySchema,
  type druidHealingScenarioSchema,
  type DruidHealerLibrary,
  type DruidHealingResult,
  type DruidHealingWorkload,
} from "./druid-healing-simulator.js";

export const healerProfileSchema = z.enum(["healing-priest", "healing-druid"]);
export type HealerProfile = z.infer<typeof healerProfileSchema>;
export const anyHealerLibrarySchema = z.discriminatedUnion("profile", [
  healerLibrarySchema,
  druidHealerLibrarySchema,
]);
export const anyHealerReleaseSchema = z.discriminatedUnion("profile", [
  healerReleaseSchema,
  druidHealerReleaseSchema,
]);
export type AnyHealerLibrary = z.infer<typeof anyHealerLibrarySchema>;
export type AnyHealerRelease = z.infer<typeof anyHealerReleaseSchema>;
export type WorkspaceHealingWorkload = HealingWorkload | DruidHealingWorkload;
export type WorkspaceHealingResult = HealingResult | DruidHealingResult;
export type WorkspaceHealingReply =
  z.infer<typeof healingReplySchema> | z.infer<typeof druidHealingReplySchema>;
export type WorkspaceHealingJob =
  z.infer<typeof healingJobSchema> | z.infer<typeof druidHealingJobSchema>;

export const workspacePrioritySchema = z
  .object({
    spellId: z.number().int().positive().safe(),
    raidIndex: z.number().int().min(-1).max(4),
    minimumMissingHealth: z.number().finite().nonnegative(),
    keepHot: z.boolean(),
  })
  .strict();
export const workspaceConsumesSchema = z
  .object({
    flask: z.union([z.literal(1), z.literal(2)]),
    food: z.union([
      z.literal(1),
      z.literal(3),
      z.literal(4),
      z.literal(6),
      z.literal(8),
      z.literal(9),
      z.literal(10),
      z.literal(11),
    ]),
    mainHandImbue: z.union([z.literal(16), z.literal(20)]),
    defaultConjured: z.union([z.literal(0), z.literal(2)]),
    alcohol: z.number().int().min(0).max(5),
  })
  .strict();
export const workspaceConfigurationSchema = z
  .object({
    version: z.literal(2),
    profile: healerProfileSchema,
    modelIdentity: z.string().regex(/^[a-f0-9]{64}$/),
    buildId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    gear: healingEquipmentSchema,
    fields: z.record(z.string(), z.number().int().nonnegative()),
    race: z.number().int().positive().safe(),
    consumes: workspaceConsumesSchema,
    priorities: z.array(workspacePrioritySchema).min(1).max(32),
    policyId: z.string().regex(/^[a-z0-9][a-z0-9.-]*$/),
    iterations: z.number().int().min(1).max(10000),
  })
  .strict();
export type HealerWorkspaceConfiguration = z.infer<typeof workspaceConfigurationSchema>;
export type HealerWorkspacePriority = z.infer<typeof workspacePrioritySchema>;
export type HealerWorkspaceConsumes = z.infer<typeof workspaceConsumesSchema>;
export type HealerConsumeKind = keyof HealerWorkspaceConsumes;
export type HealerWorkspaceItem = z.infer<typeof healerItemSchema>;
type SharedBuild = z.infer<typeof healerBuildSchema>;
interface WorkspacePolicyDescription {
  readonly id: string;
  readonly label: string;
  readonly description: string;
}
export type HealerWorkspacePolicy = WorkspacePolicyDescription &
  (
    | { readonly kind: "priest"; readonly policy: z.infer<typeof healingRankPolicySchema> }
    | { readonly kind: "druid"; readonly policy: z.infer<typeof druidHealingScenarioSchema> }
  );
export interface HealerWorkspaceBuild extends Omit<
  SharedBuild,
  "archetype" | "workload" | "consumes"
> {
  readonly archetype: string;
  readonly workload: WorkspaceHealingWorkload;
  readonly consumes: HealerWorkspaceConsumes;
  readonly defaultPolicyId: string;
}
export interface HealerWorkspaceLibrary extends Omit<
  HealerLibrary,
  "schema" | "profile" | "builds" | "rankPolicies"
> {
  readonly profile: HealerProfile;
  readonly className: string;
  readonly classSlug: "priest" | "druid";
  readonly defaultRaceId: number;
  readonly defaultDirectSpellId: number;
  readonly rangedSlotName: "Wand" | "Idol";
  readonly supportedItemUses?: readonly "major-recombobulator"[] | undefined;
  readonly rankPolicies: readonly HealerWorkspacePolicy[];
  readonly builds: HealerWorkspaceBuild[];
}

export function normalizeHealerLibrary(library: AnyHealerLibrary): HealerWorkspaceLibrary {
  if (library.profile === "healing-druid") return normalizeDruidLibrary(library);
  const troll = library.races.find((race) => race.name === "Troll");
  if (!troll) throw new Error("The reviewed Priest default race is missing");
  return {
    ...library,
    className: "Priest",
    classSlug: "priest",
    defaultRaceId: troll.id,
    defaultDirectSpellId: 10965,
    rangedSlotName: "Wand",
    rankPolicies: library.rankPolicies.map((policy) => ({
      kind: "priest",
      id: policy.id,
      policy,
      label:
        (policy.kind === "unscaled-reference"
          ? "Reference scaling"
          : `Downranks · ${policy.fullScalingGap}-level window${policy.classProcMode === "coefficient-factor" ? " · scaled procs" : ""}`) +
        (library.itemEffectsVersion !== undefined
          ? policy.id.endsWith("-heart-zero")
            ? " · Heart off"
            : " · Heart client reference"
          : ""),
      description:
        (policy.kind === "unscaled-reference"
          ? "Client coefficients without an assumed low-rank penalty."
          : "Declared low-rank scaling sensitivity; the server formula is unverified.") +
        (library.itemEffectsVersion !== undefined
          ? policy.id.endsWith("-heart-zero")
            ? " Dormant Heart grants no proc bonus in this sensitivity case."
            : " Dormant Heart uses its literal 100% client proc reference; server behavior is unverified."
          : ""),
    })),
    builds: library.builds.map((build) => ({
      ...build,
      consumes: workspaceConsumesSchema.parse({ ...build.consumes, alcohol: 0 }),
      defaultPolicyId: build.workload.rankScaling.id,
    })),
  };
}
function normalizeDruidLibrary(library: DruidHealerLibrary): HealerWorkspaceLibrary {
  return {
    ...library,
    className: "Druid",
    classSlug: "druid",
    defaultRaceId: library.defaultRaceId,
    defaultDirectSpellId: 9889,
    rangedSlotName: "Idol",
    items: library.items.map((item) => {
      if (item.id !== 18470 && item.id !== 12930) return item;
      return {
        ...item,
        sourceLabel: "Historical base stats · current base unverified",
        effectLines: [
          ...item.effectLines,
          item.id === 18470
            ? "The selected scenario models either 44 or 0 retained healing. Its 16 Spirit applies only in the Forest / Grassland scenario."
            : "The selected scenario models 15 equip spell power or the historical 29-point reference. Current base stats remain unverified.",
        ],
      };
    }),
    rankPolicies: library.scenarios.map((policy) => ({
      kind: "druid",
      id: policy.id,
      label: policy.label,
      description: policy.description,
      policy,
    })),
    builds: library.builds.map((build) => ({ ...build })),
  };
}
export function normalizeHealerConfiguration(input: unknown): HealerWorkspaceConfiguration {
  const current = workspaceConfigurationSchema.safeParse(input);
  if (current.success) return current.data;
  const legacy = healerConfigurationSchema.parse(input);
  return workspaceConfigurationSchema.parse({
    ...legacy,
    version: 2,
    profile: "healing-priest",
    consumes: { ...legacy.consumes, alcohol: 0 },
    priorities: legacy.priorities.map(({ keepRenew, ...priority }) => ({
      ...priority,
      keepHot: keepRenew,
    })),
  });
}
export function parseHealerWorkspaceJob(
  profile: HealerProfile,
  input: unknown,
): WorkspaceHealingJob {
  return profile === "healing-druid"
    ? druidHealingJobSchema.parse(input)
    : healingJobSchema.parse(input);
}
export function parseHealerWorkspaceReply(
  profile: HealerProfile,
  input: unknown,
): WorkspaceHealingReply {
  return profile === "healing-druid"
    ? druidHealingReplySchema.parse(input)
    : healingReplySchema.parse(input);
}
export function healerAssetPath(profile: HealerProfile, release: string, name: string): string {
  if (!/^[a-f0-9]{24}$/.test(release) || !/^[a-z0-9][a-z0-9_.-]*$/i.test(name))
    throw new Error("Invalid healer asset identity");
  return profile === "healing-priest"
    ? `/healing-sim/${release}/${name}`
    : `/healing-sim/classes/${profile}/${release}/${name}`;
}
