import { createHash } from "node:crypto";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import { readSimulatorManifest, simulatorDirectory } from "./forever-simulator";

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

async function readReference(root: string, reference: ReviewReference): Promise<unknown> {
  const path = isAbsolute(reference.path)
    ? reference.path
    : resolve(root, "../../..", reference.path);
  const value = await readBoundedJson(root, path);
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
  for (const [id, entry] of Object.entries(state.cases)) {
    if (entry.entry.id !== id) throw new Error("Local campaign case identity mismatch");
    const complete = entry.status === "reviewed-local";
    const review = complete
      ? entry.final?.review
      : entry.steps.filter((step) => step.kind === "feedback").at(-1)?.files.output;
    const share = shares.find(
      (value) =>
        value.caseId === id &&
        value.campaignIdentity === state.identity &&
        value.sourceRelease === manifest.release &&
        value.feedbackReview.sha256 === review?.sha256 &&
        value.status === (complete ? "reviewed-local" : "core-reviewed-final-audits-pending"),
    );
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
      const feedback = feedbackSchema.parse(await readReference(root, review));
      if (
        feedback.revision !== manifest.revision ||
        feedback.baselineSha256 !== share.baseline.sha256 ||
        `${feedback.profile}/${feedback.variant}` !== entry.entry.spec ||
        share.requiresProvisionalEnchantOptIn !== row.requiresProvisionalEnchantOptIn ||
        feedback.enchantPolicy.provisionalEffectIds.length > 0 !==
          row.requiresProvisionalEnchantOptIn
      )
        throw new Error("Local share is linked to a different combat setup");
      await readReference(root, share.baseline);
      if (complete) {
        if (
          !entry.final ||
          !share.campaignFinal ||
          hash(entry.final) !== hash(share.campaignFinal) ||
          entry.final.baseline.sha256 !== share.baseline.sha256
        )
          throw new Error("Local share is missing the final campaign evidence");
        await assertFinalEvidence(root, entry.final, row.requiresProvisionalEnchantOptIn);
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
  return { status: "ready", identity: state.identity, release: manifest.release, cases };
}
