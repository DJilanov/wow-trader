import { createHash } from "node:crypto";

import {
  externalDataPublications,
  externalDataSnapshots,
  externalDataSources,
  type WowTraderDatabase,
} from "@wow-trader/db";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import {
  foreverExportSchema,
  foreverSupplementalSchema,
  type ForeverExport,
  type ForeverSupplemental,
  type TalentTree,
} from "./schemas.js";

export const TALENTS_FOREVER_SOURCE_SLUG = "talents-forever";
export const TALENTS_FOREVER_DATA_URL = "https://talentsforever.com/data.json";
export const TALENTS_FOREVER_SPELLBOOK_SCRIPT_URL = "https://talentsforever.com/spellbooks.js";
export const FOREVER_PARSER_VERSION = "talents-forever.v1";

const MAX_DATA_BYTES = 2_000_000;
const MAX_SCRIPT_BYTES = 1_000_000;

export interface ForeverValidationIssue {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface ForeverValidationCounts {
  readonly classes: number;
  readonly trees: number;
  readonly talents: number;
  readonly completeTalents: number;
  readonly prerequisites: number;
  readonly spellbookEntries: number;
  readonly spellDescriptions: number;
  readonly races: number;
  readonly racialAbilities: number;
  readonly classAbilities: number;
  readonly legacyPerks: number;
  readonly changelogEntries: number;
  readonly spellbookIcons: number;
}

export interface ForeverValidationReport {
  readonly valid: boolean;
  readonly generated: string;
  readonly counts: ForeverValidationCounts;
  readonly issues: readonly ForeverValidationIssue[];
}

export interface ForeverCapture {
  readonly data: ForeverExport;
  readonly supplemental: ForeverSupplemental;
  readonly rawPayload: string;
  readonly sourcePayloadChecksum: string;
  readonly supplementalChecksum: string;
  readonly checksum: string;
  readonly byteSize: number;
  readonly retrievedAt: Date;
  readonly validation: ForeverValidationReport;
}

export interface ImportedForeverSnapshot {
  readonly sourceId: string;
  readonly snapshotId: string;
  readonly checksum: string;
  readonly duplicate: boolean;
  readonly published: boolean;
  readonly validation: ForeverValidationReport;
}

export interface PublishedForeverSnapshotResult {
  readonly sourceId: string;
  readonly snapshotId: string;
  readonly checksum: string;
  readonly publishedAt: Date;
}

export interface PublishedForeverSnapshot {
  readonly source: {
    readonly name: string;
    readonly homepageUrl: string;
    readonly dataUrl: string;
    readonly license: string;
    readonly licenseUrl: string;
    readonly attribution: string;
  };
  readonly snapshotId: string;
  readonly checksum: string;
  readonly sourcePayloadChecksum: string;
  readonly generated: string;
  readonly retrievedAt: Date;
  readonly publishedAt: Date;
  readonly data: ForeverExport;
  readonly supplemental: ForeverSupplemental;
  readonly validation: ForeverValidationReport;
}

export async function fetchForeverCapture(fetcher: typeof fetch = fetch): Promise<ForeverCapture> {
  const [rawPayload, spellbookScript] = await Promise.all([
    fetchText(fetcher, TALENTS_FOREVER_DATA_URL, MAX_DATA_BYTES, "application/json"),
    fetchText(fetcher, TALENTS_FOREVER_SPELLBOOK_SCRIPT_URL, MAX_SCRIPT_BYTES, "javascript"),
  ]);
  return createForeverCapture(rawPayload, parseSpellbookIconsScript(spellbookScript));
}

export function createForeverCapture(
  rawPayload: string,
  supplemental: ForeverSupplemental,
  retrievedAt = new Date(),
): ForeverCapture {
  const unknownPayload: unknown = JSON.parse(rawPayload);
  const data = foreverExportSchema.parse(unknownPayload);
  const parsedSupplemental = foreverSupplementalSchema.parse(supplemental);
  const sourcePayloadChecksum = sha256(rawPayload);
  const supplementalJson = stableJson(parsedSupplemental);
  const supplementalChecksum = sha256(supplementalJson);
  const checksum = sha256(`${sourcePayloadChecksum}:${supplementalChecksum}`);
  const validation = validateForeverData(data, parsedSupplemental);
  return {
    data,
    supplemental: parsedSupplemental,
    rawPayload,
    sourcePayloadChecksum,
    supplementalChecksum,
    checksum,
    byteSize: Buffer.byteLength(rawPayload),
    retrievedAt,
    validation,
  };
}

export function parseSpellbookIconsScript(script: string): ForeverSupplemental {
  const match = /window\.SPELLBOOK_ICONS\s*=\s*(\{[\s\S]*?\});/.exec(script);
  if (!match?.[1]) throw new Error("Talents Forever spellbook icon assignment was not found");
  const icons: unknown = JSON.parse(match[1]);
  return foreverSupplementalSchema.parse({ spellbookIcons: icons });
}

export function validateForeverData(
  data: ForeverExport,
  supplemental: ForeverSupplemental,
): ForeverValidationReport {
  const issues: ForeverValidationIssue[] = [];
  let trees = 0;
  let talents = 0;
  let completeTalents = 0;
  let prerequisites = 0;

  for (const [className, classData] of Object.entries(data.talents)) {
    const treeNames = new Set<string>();
    for (const tree of classData.trees) {
      trees += 1;
      if (treeNames.has(tree.name)) {
        issues.push(error("duplicate_tree", className, `Duplicate tree ${tree.name}`));
      }
      treeNames.add(tree.name);
      validateTalentTree(className, tree, issues);
      talents += tree.talents.length;
      completeTalents += tree.talents.filter(({ complete }) => complete).length;
      prerequisites += tree.talents.filter(({ req }) => Boolean(req)).length;
    }
  }

  for (const className of Object.keys(data.talents)) {
    if (!data.spellbooks[className]) {
      issues.push(warning("missing_spellbook", className, "No spellbook snapshot is available"));
    }
    if (!data.class_abilities[className]) {
      issues.push(
        warning(
          "missing_class_abilities",
          className,
          "No class ability observations are available",
        ),
      );
    }
  }

  const spellbookNames = new Set(
    Object.values(data.spellbooks).flatMap((spellbook) => [
      ...spellbook.general.map(([name]) => name),
      ...spellbook.tabs.flatMap(({ spells }) => spells.map(([name]) => name)),
    ]),
  );
  for (const name of spellbookNames) {
    if (!supplemental.spellbookIcons[name]) {
      issues.push(warning("missing_spellbook_icon", `spellbooks.${name}`, "No icon mapping"));
    }
  }

  const counts: ForeverValidationCounts = {
    classes: Object.keys(data.talents).length,
    trees,
    talents,
    completeTalents,
    prerequisites,
    spellbookEntries: Object.values(data.spellbooks).reduce(
      (total, spellbook) =>
        total +
        spellbook.general.length +
        spellbook.tabs.reduce((tabTotal, tab) => tabTotal + tab.spells.length, 0),
      0,
    ),
    spellDescriptions: Object.keys(data.spell_desc).length,
    races: Object.values(data.racials).reduce((total, races) => total + races.length, 0),
    racialAbilities: Object.values(data.racials).reduce(
      (total, races) =>
        total + races.reduce((raceTotal, race) => raceTotal + race.abilities.length, 0),
      0,
    ),
    classAbilities: Object.values(data.class_abilities).reduce(
      (total, abilities) => total + abilities.length,
      0,
    ),
    legacyPerks: data.legacy.trees.reduce((total, tree) => total + tree.perks.length, 0),
    changelogEntries: data.changelog.length,
    spellbookIcons: Object.keys(supplemental.spellbookIcons).length,
  };

  if (counts.classes === 0 || counts.talents === 0) {
    issues.push(error("empty_catalog", "talents", "Talent data must not be empty"));
  }

  return {
    valid: issues.every(({ severity }) => severity !== "error"),
    generated: data.generated,
    counts,
    issues,
  };
}

export async function importForeverCapture(
  database: WowTraderDatabase,
  capture: ForeverCapture,
  options: { readonly publish: boolean },
): Promise<ImportedForeverSnapshot> {
  if (!capture.validation.valid) {
    const errorCount = capture.validation.issues.filter(
      ({ severity }) => severity === "error",
    ).length;
    throw new Error(`Forever preview failed validation with ${errorCount} error(s)`);
  }

  return database.transaction(async (transaction) => {
    const [source] = await transaction
      .insert(externalDataSources)
      .values({
        slug: TALENTS_FOREVER_SOURCE_SLUG,
        name: "Talents Forever",
        homepageUrl: "https://talentsforever.com/",
        dataUrl: TALENTS_FOREVER_DATA_URL,
        license: "CC-BY-4.0",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        attribution: "Data adapted from talentsforever.com",
      })
      .onConflictDoUpdate({
        target: externalDataSources.slug,
        set: {
          name: "Talents Forever",
          homepageUrl: "https://talentsforever.com/",
          dataUrl: TALENTS_FOREVER_DATA_URL,
          license: "CC-BY-4.0",
          licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
          attribution: "Data adapted from talentsforever.com",
          updatedAt: new Date(),
        },
      })
      .returning({ id: externalDataSources.id });
    if (!source) throw new Error("Database did not return the Talents Forever source");

    const [existing] = await transaction
      .select({ id: externalDataSnapshots.id, status: externalDataSnapshots.status })
      .from(externalDataSnapshots)
      .where(
        and(
          eq(externalDataSnapshots.sourceId, source.id),
          eq(externalDataSnapshots.checksum, capture.checksum),
        ),
      )
      .limit(1);

    const snapshotId = existing?.id ?? (await insertSnapshot(transaction, source.id, capture));
    if (options.publish) await publishSnapshot(transaction, source.id, snapshotId);

    return {
      sourceId: source.id,
      snapshotId,
      checksum: capture.checksum,
      duplicate: Boolean(existing),
      published: options.publish || existing?.status === "published",
      validation: capture.validation,
    };
  });
}

export async function publishForeverSnapshot(
  database: WowTraderDatabase,
  identity: string,
): Promise<PublishedForeverSnapshotResult> {
  const byChecksum = /^[a-f0-9]{64}$/u.test(identity);
  const byId = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu.test(
    identity,
  );
  if (!byChecksum && !byId) throw new Error("Snapshot identity must be a UUID or SHA-256 checksum");

  return database.transaction(async (transaction) => {
    const [snapshot] = await transaction
      .select({
        sourceId: externalDataSources.id,
        snapshotId: externalDataSnapshots.id,
        checksum: externalDataSnapshots.checksum,
        parserVersion: externalDataSnapshots.parserVersion,
        status: externalDataSnapshots.status,
        validationReport: externalDataSnapshots.validationReport,
      })
      .from(externalDataSnapshots)
      .innerJoin(externalDataSources, eq(externalDataSources.id, externalDataSnapshots.sourceId))
      .where(
        and(
          eq(externalDataSources.slug, TALENTS_FOREVER_SOURCE_SLUG),
          byChecksum
            ? eq(externalDataSnapshots.checksum, identity)
            : eq(externalDataSnapshots.id, identity),
        ),
      )
      .limit(1);
    if (!snapshot) throw new Error(`Forever snapshot ${identity} does not exist`);
    if (snapshot.status === "rejected") throw new Error("A rejected snapshot cannot be published");
    if (snapshot.parserVersion !== FOREVER_PARSER_VERSION) {
      throw new Error(
        `Snapshot parser ${snapshot.parserVersion} must be revalidated with ${FOREVER_PARSER_VERSION}`,
      );
    }
    const validation = parseValidationReport(snapshot.validationReport);
    if (!validation.valid || validation.issues.some(({ severity }) => severity === "error")) {
      throw new Error("Snapshot validation report contains errors");
    }

    const publishedAt = await publishSnapshot(transaction, snapshot.sourceId, snapshot.snapshotId);
    return {
      sourceId: snapshot.sourceId,
      snapshotId: snapshot.snapshotId,
      checksum: snapshot.checksum,
      publishedAt,
    };
  });
}

export async function getPublishedForeverSnapshot(
  database: WowTraderDatabase,
  checksum?: string,
): Promise<PublishedForeverSnapshot | null> {
  const baseSelection = {
    sourceName: externalDataSources.name,
    homepageUrl: externalDataSources.homepageUrl,
    dataUrl: externalDataSources.dataUrl,
    license: externalDataSources.license,
    licenseUrl: externalDataSources.licenseUrl,
    attribution: externalDataSources.attribution,
    snapshotId: externalDataSnapshots.id,
    checksum: externalDataSnapshots.checksum,
    sourcePayloadChecksum: externalDataSnapshots.sourcePayloadChecksum,
    payload: externalDataSnapshots.payload,
    supplementalPayload: externalDataSnapshots.supplementalPayload,
    validationReport: externalDataSnapshots.validationReport,
    upstreamGeneratedDate: externalDataSnapshots.upstreamGeneratedDate,
    retrievedAt: externalDataSnapshots.retrievedAt,
    snapshotPublishedAt: externalDataSnapshots.publishedAt,
    publicationPublishedAt: externalDataPublications.publishedAt,
  };

  const rows = checksum
    ? await database
        .select(baseSelection)
        .from(externalDataSnapshots)
        .innerJoin(externalDataSources, eq(externalDataSources.id, externalDataSnapshots.sourceId))
        .where(
          and(
            eq(externalDataSources.slug, TALENTS_FOREVER_SOURCE_SLUG),
            eq(externalDataSnapshots.checksum, checksum),
            eq(externalDataSnapshots.status, "published"),
          ),
        )
        .orderBy(desc(externalDataSnapshots.publishedAt))
        .limit(1)
    : await database
        .select(baseSelection)
        .from(externalDataPublications)
        .innerJoin(
          externalDataSources,
          eq(externalDataSources.id, externalDataPublications.sourceId),
        )
        .innerJoin(
          externalDataSnapshots,
          eq(externalDataSnapshots.id, externalDataPublications.snapshotId),
        )
        .where(eq(externalDataSources.slug, TALENTS_FOREVER_SOURCE_SLUG))
        .limit(1);

  const row = rows[0];
  if (!row) return null;
  const data = foreverExportSchema.parse(row.payload);
  const supplemental = foreverSupplementalSchema.parse(row.supplementalPayload);
  const validation = parseValidationReport(row.validationReport);
  return {
    source: {
      name: row.sourceName,
      homepageUrl: row.homepageUrl,
      dataUrl: row.dataUrl,
      license: row.license,
      licenseUrl: row.licenseUrl,
      attribution: row.attribution,
    },
    snapshotId: row.snapshotId,
    checksum: row.checksum,
    sourcePayloadChecksum: row.sourcePayloadChecksum,
    generated: row.upstreamGeneratedDate,
    retrievedAt: row.retrievedAt,
    publishedAt: row.publicationPublishedAt ?? row.snapshotPublishedAt ?? row.retrievedAt,
    data,
    supplemental,
    validation,
  };
}

async function fetchText(
  fetcher: typeof fetch,
  url: string,
  maximumBytes: number,
  expectedContentType: string,
): Promise<string> {
  const response = await fetcher(url, {
    headers: { accept: "application/json,text/javascript;q=0.9", "user-agent": "KFC-Helper/1.0" },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes(expectedContentType)) {
    throw new Error(`${url} returned unexpected content type ${contentType || "unknown"}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maximumBytes) {
    throw new Error(`${url} exceeded the ${maximumBytes}-byte source limit`);
  }
  return new TextDecoder().decode(bytes);
}

function validateTalentTree(
  className: string,
  tree: TalentTree,
  issues: ForeverValidationIssue[],
): void {
  const positions = new Set<string>();
  const names = new Set(tree.talents.map(({ name }) => name));
  for (const talent of tree.talents) {
    const path = `${className}.${tree.name}.${talent.name}`;
    const position = `${talent.row}:${talent.col}`;
    if (positions.has(position)) {
      issues.push(error("duplicate_position", path, `Duplicate tree position ${position}`));
    }
    positions.add(position);
    if (talent.req && !names.has(talent.req)) {
      issues.push(error("missing_prerequisite", path, `Unknown prerequisite ${talent.req}`));
    }
    for (const rank of talent.confirmed ?? []) {
      if (rank > talent.max) {
        issues.push(
          error("confirmed_rank_out_of_range", path, `Confirmed rank ${rank} exceeds cap`),
        );
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byName = new Map(tree.talents.map((talent) => [talent.name, talent]));
  const visit = (name: string): void => {
    if (visiting.has(name)) {
      issues.push(error("prerequisite_cycle", `${className}.${tree.name}`, `Cycle at ${name}`));
      return;
    }
    if (visited.has(name)) return;
    visiting.add(name);
    const prerequisite = byName.get(name)?.req;
    if (prerequisite && byName.has(prerequisite)) visit(prerequisite);
    visiting.delete(name);
    visited.add(name);
  };
  for (const name of names) visit(name);
}

function error(code: string, path: string, message: string): ForeverValidationIssue {
  return { severity: "error", code, path, message };
}

function warning(code: string, path: string, message: string): ForeverValidationIssue {
  return { severity: "warning", code, path, message };
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function insertSnapshot(
  transaction: Parameters<Parameters<WowTraderDatabase["transaction"]>[0]>[0],
  sourceId: string,
  capture: ForeverCapture,
): Promise<string> {
  const [snapshot] = await transaction
    .insert(externalDataSnapshots)
    .values({
      sourceId,
      checksum: capture.checksum,
      sourcePayloadChecksum: capture.sourcePayloadChecksum,
      supplementalChecksum: capture.supplementalChecksum,
      byteSize: capture.byteSize,
      upstreamGeneratedDate: capture.data.generated,
      parserVersion: FOREVER_PARSER_VERSION,
      status: "review_required",
      rawPayload: capture.rawPayload,
      payload: capture.data,
      supplementalPayload: capture.supplemental,
      validationReport: capture.validation,
      retrievedAt: capture.retrievedAt,
    })
    .returning({ id: externalDataSnapshots.id });
  if (!snapshot) throw new Error("Database did not return the imported Forever snapshot");
  return snapshot.id;
}

async function publishSnapshot(
  transaction: Parameters<Parameters<WowTraderDatabase["transaction"]>[0]>[0],
  sourceId: string,
  snapshotId: string,
): Promise<Date> {
  const now = new Date();
  await transaction
    .update(externalDataSnapshots)
    .set({ status: "published", publishedAt: now })
    .where(eq(externalDataSnapshots.id, snapshotId));
  await transaction
    .insert(externalDataPublications)
    .values({ sourceId, snapshotId, publishedAt: now })
    .onConflictDoUpdate({
      target: externalDataPublications.sourceId,
      set: { snapshotId, publishedAt: now },
    });
  return now;
}

function parseValidationReport(value: unknown): ForeverValidationReport {
  return validationReportSchema.parse(value);
}

const validationReportSchema: z.ZodType<ForeverValidationReport> = z.object({
  valid: z.boolean(),
  generated: z.string(),
  counts: z.object({
    classes: z.number().int().nonnegative(),
    trees: z.number().int().nonnegative(),
    talents: z.number().int().nonnegative(),
    completeTalents: z.number().int().nonnegative(),
    prerequisites: z.number().int().nonnegative(),
    spellbookEntries: z.number().int().nonnegative(),
    spellDescriptions: z.number().int().nonnegative(),
    races: z.number().int().nonnegative(),
    racialAbilities: z.number().int().nonnegative(),
    classAbilities: z.number().int().nonnegative(),
    legacyPerks: z.number().int().nonnegative(),
    changelogEntries: z.number().int().nonnegative(),
    spellbookIcons: z.number().int().nonnegative(),
  }),
  issues: z.array(
    z.object({
      severity: z.union([z.literal("error"), z.literal("warning")]),
      code: z.string(),
      path: z.string(),
      message: z.string(),
    }),
  ),
});
