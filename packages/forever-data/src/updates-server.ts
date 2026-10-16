import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, rename, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import {
  externalDataPublications,
  externalDataSnapshots,
  externalDataSources,
  type WowTraderDatabase,
} from "@wow-trader/db";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import {
  BLIZZARD_NOTES_PARSER,
  BLIZZARD_TOPIC_ID,
  BLIZZARD_TOPIC_JSON,
  BLIZZARD_TOPIC_URL,
  changedClasses,
  discoursePostsSchema,
  discourseTopicSchema,
  notesChecksum,
  officialNotesSchema,
  parseOfficialNotes,
  type OfficialNotes,
} from "./updates.js";

const SOURCE_SLUG = "blizzard-forever-development-notes";
const AGENT = "KFCHelperNotes/1.0 (+https://helper.kfcguild.online)";
const ORIGIN = "https://eu.forums.blizzard.com";
const MAX_BYTES = 3_000_000;
interface RobotsPolicy {
  isAllowed(url: string, agent: string): boolean | undefined;
  getCrawlDelay(agent: string): number | undefined;
}
const robotsParser = createRequire(import.meta.url)("robots-parser") as (
  url: string,
  text: string,
) => RobotsPolicy;
const healthSchema = z
  .object({
    schema: z.literal("forever-updates-health.v1"),
    checkedAt: z.iso.datetime(),
    lastSuccessAt: z.iso.datetime().nullable(),
    nextCheckAt: z.iso.datetime(),
    checksum: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    etag: z.string().max(500).nullable(),
    lastModified: z.string().max(100).nullable(),
    error: z.string().max(100).nullable(),
    sourceNotBefore: z.iso.datetime().nullable().optional(),
  })
  .strict();
export type OfficialNotesHealth = z.infer<typeof healthSchema>;
export interface PublishedOfficialNotes {
  readonly notes: OfficialNotes;
  readonly checksum: string;
  readonly publishedAt: string;
}
export interface OfficialNotesCapture {
  readonly notes: OfficialNotes;
  readonly rawPayload: string;
  readonly etag: string | null;
  readonly lastModified: string | null;
}
export interface NotesSyncOptions {
  readonly database?: WowTraderDatabase;
  readonly directory: string;
  readonly force?: boolean;
  readonly fetcher?: typeof fetch;
  readonly now?: () => Date;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}
export interface NotesSyncResult {
  readonly state: "updated" | "unchanged" | "not_due";
  readonly checksum: string | null;
  readonly affectedClasses: readonly string[];
}

export async function fetchOfficialNotes(
  options: {
    readonly fetcher?: typeof fetch;
    readonly sleep?: (milliseconds: number) => Promise<void>;
    readonly previous?: {
      readonly health: OfficialNotesHealth;
      readonly published: PublishedOfficialNotes;
    };
  } = {},
): Promise<OfficialNotesCapture | null> {
  const fetcher = options.fetcher ?? fetch;
  const sleep =
    options.sleep ??
    (async (milliseconds: number): Promise<void> => {
      await setTimeout(milliseconds);
    });
  const request = async (url: string, headers: Record<string, string> = {}): Promise<Response> => {
    if (new URL(url).origin !== ORIGIN) throw new Error("Unexpected official source host");
    return fetcher(url, {
      headers: { "user-agent": AGENT, accept: "application/json,text/plain;q=0.8", ...headers },
      redirect: "error",
      signal: AbortSignal.timeout(25000),
    });
  };
  const robotsResponse = await request(`${ORIGIN}/robots.txt`);
  if (!robotsResponse.ok && robotsResponse.status !== 404) throw sourceError(robotsResponse);
  const robots = robotsParser(
    `${ORIGIN}/robots.txt`,
    robotsResponse.ok ? await boundedText(robotsResponse) : "",
  );
  const delay = robots.getCrawlDelay(AGENT) ?? 1;
  if (!Number.isFinite(delay) || delay < 0 || delay > 60)
    throw new Error("Unsupported official source crawl delay");
  const get = async (url: string, headers: Record<string, string> = {}): Promise<Response> => {
    if (robots.isAllowed(url, AGENT) === false)
      throw new Error("Official source robots policy disallows request");
    await sleep(Math.max(1000, delay * 1000));
    const response = await request(url, headers);
    if (!response.ok && response.status !== 304) throw sourceError(response);
    if (
      response.status !== 304 &&
      !/\bapplication\/json\b/i.test(response.headers.get("content-type") ?? "")
    )
      throw new Error("Official source did not return JSON");
    return response;
  };
  const conditional: Record<string, string> = {};
  if (options.previous?.health.etag) conditional["if-none-match"] = options.previous.health.etag;
  if (options.previous?.health.lastModified)
    conditional["if-modified-since"] = options.previous.health.lastModified;
  const response = await get(BLIZZARD_TOPIC_JSON, conditional);
  if (response.status === 304) {
    if (!options.previous) throw new Error("Unusable source 304 without a previous publication");
    return null;
  }
  const rawTopic = await boundedText(response);
  const topic = discourseTopicSchema.parse(JSON.parse(rawTopic));
  const received = new Set(topic.post_stream.posts.map((post) => post.id));
  const missing = topic.post_stream.stream.filter((id) => !received.has(id));
  const extra = [];
  for (let offset = 0; offset < missing.length; offset += 20) {
    const url = new URL(`${ORIGIN}/en/wow/t/${BLIZZARD_TOPIC_ID}/posts.json`);
    for (const id of missing.slice(offset, offset + 20))
      url.searchParams.append("post_ids[]", String(id));
    const chunk = discoursePostsSchema.parse(JSON.parse(await boundedText(await get(url.href))));
    extra.push(...chunk.post_stream.posts);
  }
  const rawPayload = JSON.stringify({
    topic: JSON.parse(rawTopic) as unknown,
    additionalPosts: extra,
  });
  if (Buffer.byteLength(rawPayload) > MAX_BYTES)
    throw new Error("Official notes exceed storage budget");
  return {
    notes: parseOfficialNotes(topic, extra),
    rawPayload,
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
  };
}

export async function readOfficialNotesHealth(
  directory: string,
): Promise<OfficialNotesHealth | null> {
  return readJson(join(directory, "health.json"), healthSchema);
}

export async function getPublishedOfficialNotes(
  database: WowTraderDatabase | null,
  directory?: string,
): Promise<PublishedOfficialNotes | null> {
  if (database) {
    const publication = await getDatabasePublication(database);
    if (publication) return publication;
  }
  if (directory) {
    const local = await readJson(
      join(directory, "published.json"),
      z
        .object({
          notes: officialNotesSchema,
          checksum: z.string().regex(/^[a-f0-9]{64}$/),
          publishedAt: z.iso.datetime(),
        })
        .strict(),
    );
    if (local) {
      if (notesChecksum(local.notes) !== local.checksum)
        throw new Error("Official notes checksum mismatch");
      return local;
    }
  }
  return null;
}

async function getDatabasePublication(
  database: WowTraderDatabase,
): Promise<PublishedOfficialNotes | null> {
  const [row] = await database
    .select({
      notes: externalDataSnapshots.payload,
      checksum: externalDataSnapshots.checksum,
      publishedAt: externalDataPublications.publishedAt,
    })
    .from(externalDataSources)
    .innerJoin(
      externalDataPublications,
      eq(externalDataPublications.sourceId, externalDataSources.id),
    )
    .innerJoin(
      externalDataSnapshots,
      eq(externalDataSnapshots.id, externalDataPublications.snapshotId),
    )
    .where(
      and(
        eq(externalDataSources.slug, SOURCE_SLUG),
        eq(externalDataSnapshots.parserVersion, BLIZZARD_NOTES_PARSER),
      ),
    )
    .limit(1);
  if (!row) return null;
  const notes = officialNotesSchema.parse(row.notes);
  if (notesChecksum(notes) !== row.checksum) throw new Error("Official notes checksum mismatch");
  return { notes, checksum: row.checksum, publishedAt: row.publishedAt.toISOString() };
}

export async function syncOfficialNotes(options: NotesSyncOptions): Promise<NotesSyncResult> {
  const directory = resolve(options.directory);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lockPath = join(directory, ".sync.lock");
  const lock = await open(lockPath, "wx", 0o600);
  await lock.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
  const now = options.now ?? (() => new Date());
  let health: OfficialNotesHealth | null = null;
  let published: PublishedOfficialNotes | null = null;
  try {
    health = await readOfficialNotesHealth(directory);
    const databasePublication = options.database
      ? await getDatabasePublication(options.database)
      : null;
    published = databasePublication ?? (await getPublishedOfficialNotes(null, directory));
    const time = now();
    if (
      health &&
      ((health.sourceNotBefore && Date.parse(health.sourceNotBefore) > time.valueOf()) ||
        (!options.force && Date.parse(health.nextCheckAt) > time.valueOf()))
    )
      return { state: "not_due", checksum: published?.checksum ?? null, affectedClasses: [] };
    const capture = await fetchOfficialNotes({
      ...(options.fetcher ? { fetcher: options.fetcher } : {}),
      ...(options.sleep ? { sleep: options.sleep } : {}),
      ...(health && published && (!options.database || databasePublication)
        ? { previous: { health, published } }
        : {}),
    });
    const notes = capture?.notes ?? published?.notes;
    if (!notes) throw new Error("No official notes received");
    const checksum = notesChecksum(notes);
    const changed = checksum !== published?.checksum;
    if (capture) {
      await mkdir(join(directory, "captures"), { recursive: true, mode: 0o700 });
      const rawChecksum = createHash("sha256").update(capture.rawPayload).digest("hex");
      await writeFile(join(directory, "captures", `${rawChecksum}.json`), capture.rawPayload, {
        mode: 0o600,
        flag: "wx",
      }).catch((error: unknown) => {
        if (!isCode(error, "EEXIST")) throw error;
      });
      if (options.database) await persistNotes(options.database, capture, time);
    }
    if (changed) {
      const value: PublishedOfficialNotes = { notes, checksum, publishedAt: time.toISOString() };
      await atomicWrite(join(directory, "published.json"), value);
    }
    await atomicWrite(
      join(directory, "health.json"),
      healthSchema.parse({
        schema: "forever-updates-health.v1",
        checkedAt: time.toISOString(),
        lastSuccessAt: time.toISOString(),
        nextCheckAt: nextDailyCheck(time).toISOString(),
        checksum,
        etag: capture?.etag ?? health?.etag ?? null,
        lastModified: capture?.lastModified ?? health?.lastModified ?? null,
        error: null,
        sourceNotBefore: null,
      }),
    );
    return {
      state: changed ? "updated" : "unchanged",
      checksum,
      affectedClasses: changedClasses(published?.notes ?? null, notes),
    };
  } catch (error: unknown) {
    const time = now();
    const cooldown = error instanceof OfficialSourceError ? error.retryAt : null;
    await atomicWrite(
      join(directory, "health.json"),
      healthSchema.parse({
        schema: "forever-updates-health.v1",
        checkedAt: time.toISOString(),
        lastSuccessAt: health?.lastSuccessAt ?? null,
        nextCheckAt: new Date(
          Math.max(nextDailyCheck(time).valueOf(), cooldown ?? 0),
        ).toISOString(),
        checksum: published?.checksum ?? null,
        etag: health?.etag ?? null,
        lastModified: health?.lastModified ?? null,
        sourceNotBefore: cooldown ? new Date(cooldown).toISOString() : null,
        error:
          error instanceof OfficialSourceError
            ? `source_http_${error.status}`
            : "source_validation_or_storage_failed",
      }),
    );
    throw error;
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

async function persistNotes(
  database: WowTraderDatabase,
  capture: OfficialNotesCapture,
  now: Date,
): Promise<void> {
  await database.transaction(async (transaction) => {
    const [source] = await transaction
      .insert(externalDataSources)
      .values({
        slug: SOURCE_SLUG,
        name: "Blizzard Forever development notes",
        homepageUrl: BLIZZARD_TOPIC_URL,
        dataUrl: BLIZZARD_TOPIC_JSON,
        license: "Blizzard official publication",
        licenseUrl: BLIZZARD_TOPIC_URL,
        attribution:
          "Official Blizzard development notes. Summaries and classification by KFC Helper.",
      })
      .onConflictDoUpdate({ target: externalDataSources.slug, set: { updatedAt: now } })
      .returning({ id: externalDataSources.id });
    if (!source) throw new Error("Official notes source was not saved");
    const checksum = notesChecksum(capture.notes);
    await transaction
      .insert(externalDataSnapshots)
      .values({
        sourceId: source.id,
        checksum,
        sourcePayloadChecksum: createHash("sha256").update(capture.rawPayload).digest("hex"),
        byteSize: Buffer.byteLength(capture.rawPayload),
        upstreamGeneratedDate: now.toISOString().slice(0, 10),
        parserVersion: BLIZZARD_NOTES_PARSER,
        status: "published",
        rawPayload: capture.rawPayload,
        payload: capture.notes,
        supplementalPayload: {},
        validationReport: { valid: true, posts: capture.notes.posts.length },
        retrievedAt: now,
        publishedAt: now,
      })
      .onConflictDoNothing();
    const [snapshot] = await transaction
      .select({ id: externalDataSnapshots.id })
      .from(externalDataSnapshots)
      .where(
        and(
          eq(externalDataSnapshots.sourceId, source.id),
          eq(externalDataSnapshots.checksum, checksum),
        ),
      )
      .limit(1);
    if (!snapshot) throw new Error("Official notes snapshot was not saved");
    await transaction
      .insert(externalDataPublications)
      .values({ sourceId: source.id, snapshotId: snapshot.id, publishedAt: now })
      .onConflictDoUpdate({
        target: externalDataPublications.sourceId,
        set: { snapshotId: snapshot.id, publishedAt: now },
        setWhere: ne(externalDataPublications.snapshotId, snapshot.id),
      });
  });
}

function nextDailyCheck(time: Date): Date {
  const next = new Date(time);
  next.setUTCHours(6, 0, 0, 0);
  if (next.valueOf() <= time.valueOf()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

class OfficialSourceError extends Error {
  constructor(
    readonly status: number,
    readonly retryAt: number | null,
  ) {
    super(`Official source HTTP ${status}`);
  }
}

function sourceError(response: Response): OfficialSourceError {
  const retry = response.headers.get("retry-after");
  const parsed =
    retry && /^\d+$/.test(retry)
      ? Date.now() + Number(retry) * 1000
      : retry
        ? Date.parse(retry)
        : null;
  const limited = response.status === 429 || response.status === 503;
  const retryAt =
    parsed !== null && Number.isFinite(parsed) && parsed <= 8640000000000000
      ? Math.max(Date.now() + 1000, parsed)
      : limited
        ? Date.now() + 300000
        : null;
  return new OfficialSourceError(response.status, retryAt);
}

async function boundedText(response: Response): Promise<string> {
  if (Number(response.headers.get("content-length") ?? "0") > MAX_BYTES)
    throw new Error("Official response too large");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty official response");
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new Error("Official response too large");
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(parts).toString("utf8");
}

async function readJson<T>(path: string, schema: z.ZodType<T>): Promise<T | null> {
  try {
    const file = await open(path, "r");
    try {
      if ((await file.stat()).size > MAX_BYTES) throw new Error("Official notes file too large");
      return schema.parse(JSON.parse(await file.readFile("utf8")));
    } finally {
      await file.close();
    }
  } catch (error: unknown) {
    if (isCode(error, "ENOENT")) return null;
    throw error;
  }
}

async function atomicWrite(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value), { flag: "wx", mode: 0o600 });
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch((error: unknown) => {
      if (!isCode(error, "ENOENT")) throw error;
    });
  }
}

function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
