import { createHash } from "node:crypto";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import { readSimulatorManifest, simulatorDirectory } from "./forever-simulator";
import { applyBoundedLocalSimulatorDeliveries } from "./forever-simulator-bounded-reviews";
import { appendFirstPassSimulatorDeliveries } from "./forever-simulator-first-pass-reviews";
import { appendRogueCombatSimulatorDelivery } from "./forever-simulator-rogue-reviews";
import { appendMutilateFirstPassSimulatorDelivery } from "./forever-simulator-mutilate-reviews";
import { appendSubtletyFirstPassSimulatorDelivery } from "./forever-simulator-subtlety-reviews";
import { appendHunterBeastMasterySimulatorDelivery } from "./forever-simulator-hunter-reviews";

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const latestSchema = z.object({ identity: hashSchema });
const caseIdSchema = z.string().regex(/^[a-z][a-z0-9-]*$/);
const referenceSchema = z.object({ path: z.string().min(1), sha256: hashSchema });
const finalSchema = z.object({
  baseline: referenceSchema,
  review: referenceSchema,
  accessories: z.array(referenceSchema).length(2),
  rotation: referenceSchema,
  exported: referenceSchema,
});
const caseSchema = z.object({
  entry: z.object({
    id: caseIdSchema,
    spec: z.string(),
    faction: z.string(),
    scenario: z.string(),
  }),
  status: z.string(),
  active: z.object({ kind: z.string() }).nullable().optional(),
  steps: z.array(z.object({ kind: z.string(), files: z.object({ output: referenceSchema }) })),
  final: finalSchema.nullable(),
});
const campaignSchema = z.object({
  schema: z.literal("kfc-prebis-campaign.v1"),
  identity: hashSchema,
  cases: z.record(caseIdSchema, caseSchema),
});
const shareSchema = z.object({
  schema: z.literal("kfc-local-build-share-review.v1"),
  campaignIdentity: hashSchema,
  caseId: caseIdSchema,
  sourceRelease: z.string().regex(/^[a-f0-9]{24}$/),
  status: z.enum(["reviewed-local", "core-reviewed-final-audits-pending"]),
  requiresProvisionalEnchantOptIn: z.boolean().default(false),
  feedbackReview: referenceSchema,
  baseline: referenceSchema,
  link: z.string().min(100).max(512_000),
  warnings: z.array(z.string()).max(20),
  campaignFinal: finalSchema.optional(),
});
const deliveriesSchema = z
  .object({
    schema: z.literal("kfc-local-reviewed-deliveries.v1"),
    campaignIdentity: hashSchema,
    sourceRelease: z.string().regex(/^[a-f0-9]{24}$/),
    cases: z.record(
      caseIdSchema,
      z.object({ supersedesExportSha256: hashSchema, share: referenceSchema }).strict(),
    ),
  })
  .strict();
const modelSchema = z.object({
  revision: z.string(),
  dbSha256: hashSchema,
  nativeBinarySha256: hashSchema,
});
const feedbackSchema = z.object({
  schema: z.literal("kfc-prebis-feedback-review.v1"),
  status: z.literal("closed-loop-verified"),
  profile: z.string().regex(/^[a-z][a-z_]*$/),
  variant: z.string(),
  revision: z.string(),
  baselineSha256: hashSchema,
  referenceDps: z.number().finite().positive(),
  iterations: z.literal(400000),
  enchantPolicy: z.object({ provisionalEffectIds: z.array(z.number().int().positive()) }),
});

interface ReviewReference {
  readonly path: string;
  readonly sha256: string;
}
export interface LocalSimulatorBuildReview {
  readonly id: string;
  readonly spec: string;
  readonly faction: string;
  readonly scenario: string;
  readonly stage: string;
  readonly status: "waiting" | "preview" | "reviewed";
  readonly href: string | null;
  readonly referenceDps: number | null;
  readonly requiresProvisionalEnchantOptIn: boolean;
  readonly warnings: readonly string[];
  readonly displayName?: string;
  readonly validationIterations?: number;
  readonly rotationGuidance?: {
    readonly talents: string;
    readonly scenario: string;
    readonly instruction?: string;
    readonly priorities: readonly string[];
    readonly caveats: readonly string[];
  };
}
export type LocalSimulatorReviews =
  | { readonly status: "disabled" | "empty" }
  | {
      readonly status: "ready";
      readonly identity: string;
      readonly release: string;
      readonly cases: readonly LocalSimulatorBuildReview[];
    };

export function reviewedBuildsForSimulator(
  listing: LocalSimulatorReviews,
  release: string,
  profile: string,
): readonly LocalSimulatorBuildReview[] {
  if (listing.status !== "ready" || listing.release !== release) return [];
  return listing.cases.filter(
    (entry) =>
      entry.status === "reviewed" && entry.href !== null && entry.spec.split("/")[0] === profile,
  );
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function readBoundedJson(
  root: string,
  path: string,
  maximumBytes: number = 8_000_000,
): Promise<unknown> {
  const canonicalRoot = await realpath(root);
  const canonicalPath = await realpath(resolve(root, path));
  const offset = relative(canonicalRoot, canonicalPath);
  if (!offset || offset === ".." || offset.startsWith("../") || isAbsolute(offset))
    throw new Error("Local simulator review escaped its evidence directory");
  const info = await stat(canonicalPath);
  if (!info.isFile() || info.size > maximumBytes)
    throw new Error("Invalid local simulator review file size");
  return JSON.parse(await readFile(canonicalPath, "utf8")) as unknown;
}

async function readReference(
  root: string,
  reference: ReviewReference,
  maximumBytes: number = 8_000_000,
): Promise<unknown> {
  const path = isAbsolute(reference.path)
    ? reference.path
    : resolve(root, "../../..", reference.path);
  const value = await readBoundedJson(root, path, maximumBytes);
  if (hash(value) !== reference.sha256) throw new Error("Local simulator review hash mismatch");
  return value;
}

function localShareHref(link: string, release: string, profile: string): string {
  const url = new URL(link);
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.pathname.replace(/\/$/, "") !== `/forever-sim/${release}/${profile}` ||
    !/^#[A-Za-z0-9+/]{64,}={0,2}$/.test(url.hash)
  )
    throw new Error("Invalid local full-build share URL");
  return url.pathname + url.hash;
}

async function assertFinalEvidence(
  root: string,
  final: z.infer<typeof finalSchema>,
  requiresProvisionalEnchantOptIn: boolean,
): Promise<void> {
  await readReference(root, final.baseline);
  const kinds = new Set<string>();
  for (const reference of final.accessories) {
    const audit = z
      .object({
        kind: z.enum(["rings", "trinkets"]),
        status: z.literal("no-confirmed-challenger"),
        feedbackReviewSha256: hashSchema,
      })
      .parse(await readReference(root, reference));
    if (audit.feedbackReviewSha256 !== final.review.sha256)
      throw new Error("Stale local accessory review");
    kinds.add(audit.kind);
  }
  if (kinds.size !== 2) throw new Error("Incomplete local accessory review");
  const rotation = z
    .object({ feedbackSha256: hashSchema, validated: z.literal(false) })
    .parse(await readReference(root, final.rotation));
  const baseline = z
    .object({ settings: z.record(z.string(), z.unknown()) })
    .parse(await readReference(root, final.baseline));
  const exported = z
    .object({
      schema: z.literal("kfc-reviewed-simulator-build.v1"),
      evidence: z.object({ feedbackSha256: hashSchema, rotationAuditSha256: hashSchema }),
      settings: z.record(z.string(), z.unknown()),
      requiresProvisionalEnchantOptIn: z.boolean().default(false),
    })
    .parse(await readReference(root, final.exported));
  if (
    rotation.feedbackSha256 !== final.review.sha256 ||
    exported.evidence.feedbackSha256 !== final.review.sha256 ||
    exported.evidence.rotationAuditSha256 !== final.rotation.sha256 ||
    hash(exported.settings) !== hash(baseline.settings) ||
    exported.requiresProvisionalEnchantOptIn !== requiresProvisionalEnchantOptIn
  )
    throw new Error("Stale local final review");
}

export async function readLocalSimulatorReviews(
  directory: string = simulatorDirectory(),
  enabled: boolean = process.env.NODE_ENV === "development",
): Promise<LocalSimulatorReviews> {
  if (!enabled) return { status: "disabled" };
  const root = join(directory, "optimization");
  let latest: z.infer<typeof latestSchema>;
  try {
    latest = latestSchema.parse(await readBoundedJson(root, "campaigns/latest.json"));
  } catch (error: unknown) {
    if (isMissing(error)) return { status: "empty" };
    throw error;
  }
  const manifest = await readSimulatorManifest(directory);
  if (!manifest) return { status: "empty" };
  const state = campaignSchema.parse(
    await readBoundedJson(root, `campaigns/${latest.identity}/state.json`),
  );
  if (state.identity !== latest.identity) throw new Error("Local campaign identity mismatch");
  let deliveries: z.infer<typeof deliveriesSchema> | undefined;
  try {
    const candidate = deliveriesSchema.parse(
      await readBoundedJson(root, "reviewed-deliveries.json", 128_000),
    );
    if (
      candidate.campaignIdentity === state.identity &&
      candidate.sourceRelease === manifest.release
    ) {
      if (Object.keys(candidate.cases).some((id) => !Object.hasOwn(state.cases, id)))
        throw new Error("Unknown local delivered case");
      deliveries = candidate;
    }
  } catch (error: unknown) {
    if (!isMissing(error)) throw error;
  }
  let names: string[];
  try {
    names = await readdir(join(root, "share-links"));
  } catch (error: unknown) {
    if (!isMissing(error)) throw error;
    names = [];
  }
  const receipts = names.filter((name) => /^[a-z][a-z0-9-]*-[a-f0-9]{16}\.json$/.test(name));
  if (receipts.length > 256)
    throw new Error("Too many local share receipts; archive older reviews");
  const shares: z.infer<typeof shareSchema>[] = [];
  for (const name of receipts.sort()) {
    const value = await readBoundedJson(root, `share-links/${name}`, 600_000);
    const share = shareSchema.parse(value);
    if (name !== `${share.caseId}-${hash(value).slice(0, 16)}.json`)
      throw new Error("Local share receipt hash mismatch");
    shares.push(share);
  }
  const cases: LocalSimulatorBuildReview[] = [];
  const predecessors = new Map<string, string>();
  let databaseSha256: string | undefined;
  for (const [id, entry] of Object.entries(state.cases)) {
    if (entry.entry.id !== id) throw new Error("Local campaign case identity mismatch");
    const complete = entry.status === "reviewed-local";
    let final = entry.final;
    let review = complete
      ? entry.final?.review
      : entry.steps.filter((step) => step.kind === "feedback").at(-1)?.files.output;
    let share = shares.find(
      (value) =>
        value.caseId === id &&
        value.campaignIdentity === state.identity &&
        value.sourceRelease === manifest.release &&
        value.feedbackReview.sha256 === review?.sha256 &&
        value.status === (complete ? "reviewed-local" : "core-reviewed-final-audits-pending"),
    );
    const delivery = deliveries?.cases[id];
    if (delivery) {
      if (
        !complete ||
        !entry.final ||
        entry.active ||
        delivery.supersedesExportSha256 !== entry.final.exported.sha256
      )
        throw new Error("Stale local delivered predecessor");
      const upgraded = shareSchema.parse(await readReference(root, delivery.share, 600_000));
      if (
        upgraded.caseId !== id ||
        upgraded.campaignIdentity !== state.identity ||
        upgraded.sourceRelease !== manifest.release ||
        upgraded.status !== "reviewed-local" ||
        !upgraded.campaignFinal ||
        hash(upgraded.feedbackReview) !== hash(upgraded.campaignFinal.review)
      )
        throw new Error("Stale local delivered share");
      share = upgraded;
      final = upgraded.campaignFinal;
      review = final.review;
    }
    const row: LocalSimulatorBuildReview = {
      id,
      spec: entry.entry.spec,
      faction: entry.entry.faction,
      scenario: entry.entry.scenario,
      stage: complete ? "calculations reviewed" : (entry.active?.kind ?? entry.status),
      status: "waiting",
      href: null,
      referenceDps: null,
      requiresProvisionalEnchantOptIn: entry.entry.scenario === "provisional-procs",
      warnings: [],
    };
    if (share && review) {
      const feedbackValue = await readReference(root, review);
      const feedback = feedbackSchema.parse(feedbackValue);
      if (
        feedback.revision !== manifest.revision ||
        feedback.baselineSha256 !== share.baseline.sha256 ||
        `${feedback.profile}/${feedback.variant}` !== entry.entry.spec ||
        share.requiresProvisionalEnchantOptIn !== row.requiresProvisionalEnchantOptIn ||
        feedback.enchantPolicy.provisionalEffectIds.length > 0 !==
          row.requiresProvisionalEnchantOptIn
      )
        throw new Error("Local share is linked to a different combat setup");
      const baselineValue = await readReference(root, share.baseline);
      if (delivery && final) {
        const model = modelSchema.parse(feedbackValue);
        const baselineModel = z
          .object({ revision: z.string(), dbSha256: hashSchema, sourceRelease: z.string() })
          .parse(baselineValue);
        const exportedModel = modelSchema.parse(await readReference(root, final.exported));
        const faction = z.object({ faction: z.string() }).parse(feedbackValue).faction;
        databaseSha256 ??= hash(
          await readBoundedJson(
            directory,
            `${manifest.release}/assets/database/db.json`,
            128_000_000,
          ),
        );
        if (
          model.dbSha256 !== databaseSha256 ||
          model.revision !== manifest.revision ||
          baselineModel.revision !== model.revision ||
          baselineModel.dbSha256 !== model.dbSha256 ||
          baselineModel.sourceRelease !== manifest.release ||
          hash(exportedModel) !== hash(model) ||
          faction.toLowerCase() !== entry.entry.faction.toLowerCase()
        )
          throw new Error("Stale local delivered model");
      }
      if (complete) {
        if (
          !final ||
          !share.campaignFinal ||
          hash(final) !== hash(share.campaignFinal) ||
          final.baseline.sha256 !== share.baseline.sha256
        )
          throw new Error("Local share is missing the final campaign evidence");
        await assertFinalEvidence(root, final, row.requiresProvisionalEnchantOptIn);
        predecessors.set(id, final.exported.sha256);
      }
      cases.push({
        ...row,
        status: complete ? "reviewed" : "preview",
        href: localShareHref(share.link, manifest.release, feedback.profile),
        referenceDps: feedback.referenceDps,
        warnings: share.warnings,
      });
    } else cases.push(row);
  }
  const reviewed = await applyBoundedLocalSimulatorDeliveries({
    cases,
    predecessors,
    campaignIdentity: state.identity,
    sourceRelease: manifest.release,
    revision: manifest.revision,
    read: (path, maximumBytes) => readBoundedJson(root, path, maximumBytes),
    reference: (ref, maximumBytes) => readReference(root, ref, maximumBytes),
    databaseSha256: async () =>
      (databaseSha256 ??= hash(
        await readBoundedJson(
          directory,
          `${manifest.release}/assets/database/db.json`,
          128_000_000,
        ),
      )),
  });
  const firstPass = await appendFirstPassSimulatorDeliveries({
    cases: reviewed,
    campaignIdentity: state.identity,
    sourceRelease: manifest.release,
    revision: manifest.revision,
    read: (path, maximumBytes) => readBoundedJson(root, path, maximumBytes),
    reference: (ref, maximumBytes) => readReference(root, ref, maximumBytes),
    databaseSha256: async () =>
      (databaseSha256 ??= hash(
        await readBoundedJson(
          directory,
          `${manifest.release}/assets/database/db.json`,
          128_000_000,
        ),
      )),
  });
  const withRogue = await appendRogueCombatSimulatorDelivery({
    cases: firstPass,
    campaignIdentity: state.identity,
    sourceRelease: manifest.release,
    revision: manifest.revision,
    read: (path, maximumBytes) => readBoundedJson(root, path, maximumBytes),
    reference: (ref, maximumBytes) => readReference(root, ref, maximumBytes),
    databaseSha256: async () =>
      (databaseSha256 ??= hash(
        await readBoundedJson(
          directory,
          `${manifest.release}/assets/database/db.json`,
          128_000_000,
        ),
      )),
  });
  const withMutilate = await appendMutilateFirstPassSimulatorDelivery({
    cases: withRogue,
    campaignIdentity: state.identity,
    sourceRelease: manifest.release,
    revision: manifest.revision,
    read: (path, maximumBytes) => readBoundedJson(root, path, maximumBytes),
    reference: (ref, maximumBytes) => readReference(root, ref, maximumBytes),
    databaseSha256: async () =>
      (databaseSha256 ??= hash(
        await readBoundedJson(
          directory,
          `${manifest.release}/assets/database/db.json`,
          128_000_000,
        ),
      )),
  });
  const withSubtlety = await appendSubtletyFirstPassSimulatorDelivery({
    cases: withMutilate,
    campaignIdentity: state.identity,
    sourceRelease: manifest.release,
    revision: manifest.revision,
    read: (path, maximumBytes) => readBoundedJson(root, path, maximumBytes),
    reference: (ref, maximumBytes) => readReference(root, ref, maximumBytes),
    databaseSha256: async () =>
      (databaseSha256 ??= hash(
        await readBoundedJson(
          directory,
          `${manifest.release}/assets/database/db.json`,
          128_000_000,
        ),
      )),
  });
  const withHunter = await appendHunterBeastMasterySimulatorDelivery({
    cases: withSubtlety,
    campaignIdentity: state.identity,
    sourceRelease: manifest.release,
    revision: manifest.revision,
    read: (path, maximumBytes) => readBoundedJson(root, path, maximumBytes),
    reference: (ref, maximumBytes) => readReference(root, ref, maximumBytes),
    databaseSha256: async () =>
      (databaseSha256 ??= hash(
        await readBoundedJson(
          directory,
          `${manifest.release}/assets/database/db.json`,
          128_000_000,
        ),
      )),
  });
  return {
    status: "ready",
    identity: state.identity,
    release: manifest.release,
    cases: withHunter,
  };
}
