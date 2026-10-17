import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { z } from "zod";

const TOKEN_URL = "https://oauth.battle.net/token";
const MAX_TOKEN_RESPONSE_BYTES = 64_000;
const MAX_QUEST_RESPONSE_BYTES = 2_000_000;

export const BLIZZARD_REGIONS = ["us", "eu", "kr", "tw"] as const;
export type BlizzardRegion = (typeof BLIZZARD_REGIONS)[number];

export interface BlizzardApiCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface BlizzardApiConfig extends BlizzardApiCredentials {
  readonly region: BlizzardRegion;
  readonly namespace: string;
  readonly locale: string;
}

export interface BlizzardApiEnvironmentOverrides {
  readonly region?: string;
  readonly namespace?: string;
  readonly locale?: string;
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1).max(4096),
  token_type: z.string().min(1).max(80),
  expires_in: z.number().int().positive(),
});

const publicPayloadSchema = z.record(z.string(), z.unknown());

export const blizzardQuestEvidenceSchema = z
  .object({
    schema: z.literal("blizzard-quest-api.v1"),
    questId: z.number().int().positive(),
    region: z.enum(BLIZZARD_REGIONS),
    namespace: z.string().min(1).max(120),
    locale: z.string().min(1).max(20),
    sourceUrl: z.url(),
    capturedAt: z.iso.datetime(),
    responseStatus: z.union([z.literal(200), z.literal(404)]),
    responseSha256: z.string().regex(/^[a-f0-9]{64}$/),
    outcome: z.enum(["available", "missing", "missing_xp"]),
    title: z.string().min(1).max(300).nullable(),
    questLevel: z.number().int().min(1).max(100).nullable(),
    minimumLevel: z.number().int().min(1).max(100).nullable(),
    fullXp: z.number().int().min(0).max(10_000_000).nullable(),
    payload: publicPayloadSchema,
  })
  .strict()
  .superRefine((value, context): void => {
    if (value.responseStatus === 404 && value.outcome !== "missing")
      context.addIssue({ code: "custom", message: "A 404 response must be missing" });
    if (value.outcome === "available" && value.fullXp === null)
      context.addIssue({ code: "custom", message: "Available quest evidence requires XP" });
    if (value.outcome !== "available" && value.fullXp !== null)
      context.addIssue({ code: "custom", message: "Unavailable quest evidence cannot carry XP" });
  });
export type BlizzardQuestEvidence = z.infer<typeof blizzardQuestEvidenceSchema>;

export class BlizzardApiError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "BlizzardApiError";
  }
}

interface RequestOptions {
  readonly fetcher?: typeof fetch;
  readonly signal?: AbortSignal;
  readonly now?: () => number;
}

interface QuestRequestOptions extends RequestOptions {
  readonly questId: number;
  readonly accessToken: string;
  readonly region: BlizzardRegion;
  readonly namespace: string;
  readonly locale: string;
}

export type BlizzardNamespaceRequestOptions = Omit<QuestRequestOptions, "questId">;

function requiredCredential(value: string | undefined, name: string): string {
  const normalized = value?.trim() ?? "";
  if (!normalized) throw new Error(`${name} is required`);
  if (/^(?:replace|example|your)/i.test(normalized))
    throw new Error(`${name} still contains a placeholder`);
  if (!/^[A-Za-z0-9]+$/.test(normalized) || normalized.length > 256)
    throw new Error(`${name} has an invalid format`);
  return normalized;
}

export function blizzardApiConfigFromEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
  overrides: BlizzardApiEnvironmentOverrides = {},
): BlizzardApiConfig {
  const region = z
    .enum(BLIZZARD_REGIONS)
    .parse(overrides.region ?? environment.BLIZZARD_API_REGION ?? "eu");
  const namespace = z
    .string()
    .regex(/^static-[a-z0-9-]+$/, "BLIZZARD_API_NAMESPACE must be a static namespace")
    .max(120)
    .parse(overrides.namespace ?? environment.BLIZZARD_API_NAMESPACE);
  const locale = z
    .string()
    .regex(/^[a-z]{2}_[A-Z]{2}$/, "BLIZZARD_API_LOCALE must look like en_US")
    .parse(overrides.locale ?? environment.BLIZZARD_API_LOCALE ?? "en_US");
  return {
    clientId: requiredCredential(environment.BLIZZARD_CLIENT_ID, "BLIZZARD_CLIENT_ID"),
    clientSecret: requiredCredential(environment.BLIZZARD_CLIENT_SECRET, "BLIZZARD_CLIENT_SECRET"),
    region,
    namespace,
    locale,
  };
}

function requestSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function readBoundedBody(response: Response, maximum: number): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximum) {
      await reader.cancel();
      throw new Error("Blizzard API response exceeds the size budget");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function parseObject(body: Buffer, label: string): Readonly<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString("utf8"));
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
  return publicPayloadSchema.parse(parsed);
}

function retryAfterMs(value: string | null, now: () => number): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now()) : null;
}

function integerAt(value: unknown, maximum: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= maximum
    ? value
    : null;
}

function nestedObject(
  value: Readonly<Record<string, unknown>>,
  key: string,
): Readonly<Record<string, unknown>> | null {
  const nested = value[key];
  return typeof nested === "object" && nested !== null && !Array.isArray(nested)
    ? (nested as Readonly<Record<string, unknown>>)
    : null;
}

function positiveLevel(value: unknown): number | null {
  const parsed = integerAt(value, 100);
  return parsed === null || parsed === 0 ? null : parsed;
}

function experience(value: unknown): number | null {
  const direct = integerAt(value, 10_000_000);
  if (direct !== null) return direct;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return integerAt((value as Readonly<Record<string, unknown>>).value, 10_000_000);
}

export async function requestBlizzardAccessToken(
  credentials: BlizzardApiCredentials,
  options: RequestOptions = {},
): Promise<string> {
  const authorization = Buffer.from(
    `${requiredCredential(credentials.clientId, "BLIZZARD_CLIENT_ID")}:${requiredCredential(credentials.clientSecret, "BLIZZARD_CLIENT_SECRET")}`,
    "utf8",
  ).toString("base64");
  const response = await (options.fetcher ?? fetch)(TOKEN_URL, {
    method: "POST",
    redirect: "error",
    headers: {
      accept: "application/json",
      authorization: `Basic ${authorization}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: requestSignal(options.signal, 20_000),
  });
  const body = await readBoundedBody(response, MAX_TOKEN_RESPONSE_BYTES);
  if (!response.ok)
    throw new BlizzardApiError(
      `Battle.net OAuth returned HTTP ${response.status}`,
      response.status,
      retryAfterMs(response.headers.get("retry-after"), options.now ?? Date.now),
    );
  return tokenResponseSchema.parse(parseObject(body, "Battle.net OAuth")).access_token;
}

export async function requestBlizzardQuest(
  options: QuestRequestOptions,
): Promise<BlizzardQuestEvidence> {
  if (!Number.isSafeInteger(options.questId) || options.questId < 1)
    throw new Error("Blizzard quest id must be a positive integer");
  if (!options.accessToken.trim()) throw new Error("Blizzard access token is required");
  const url = new URL(
    `/data/wow/quest/${options.questId}`,
    `https://${options.region}.api.blizzard.com`,
  );
  url.searchParams.set("namespace", options.namespace);
  url.searchParams.set("locale", options.locale);
  const response = await (options.fetcher ?? fetch)(url, {
    redirect: "error",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${options.accessToken}`,
    },
    signal: requestSignal(options.signal, 20_000),
  });
  const body = await readBoundedBody(response, MAX_QUEST_RESPONSE_BYTES);
  if (response.status !== 200 && response.status !== 404)
    throw new BlizzardApiError(
      `Blizzard quest API returned HTTP ${response.status}`,
      response.status,
      retryAfterMs(response.headers.get("retry-after"), options.now ?? Date.now),
    );
  const payload =
    response.status === 404 && body.byteLength === 0
      ? {}
      : parseObject(body, `Blizzard quest ${options.questId}`);
  const source = {
    schema: "blizzard-quest-api.v1" as const,
    questId: options.questId,
    region: options.region,
    namespace: options.namespace,
    locale: options.locale,
    sourceUrl: url.href,
    capturedAt: new Date((options.now ?? Date.now)()).toISOString(),
    responseStatus: response.status as 200 | 404,
    responseSha256: createHash("sha256").update(body).digest("hex"),
    payload,
  };
  if (response.status === 404)
    return blizzardQuestEvidenceSchema.parse({
      ...source,
      outcome: "missing",
      title: null,
      questLevel: null,
      minimumLevel: null,
      fullXp: null,
    });
  const responseId = integerAt(payload.id, 2_147_483_647);
  if (responseId !== options.questId)
    throw new Error(`Blizzard quest response identity mismatch for ${options.questId}`);
  const requirements = nestedObject(payload, "requirements");
  const rewards = nestedObject(payload, "rewards");
  const fullXp = experience(rewards?.experience);
  return blizzardQuestEvidenceSchema.parse({
    ...source,
    outcome: fullXp === null ? "missing_xp" : "available",
    title: typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : null,
    questLevel: positiveLevel(payload.level),
    minimumLevel: positiveLevel(requirements?.min_character_level),
    fullXp,
  });
}

/**
 * Confirms that the selected namespace exposes the Quest API before a batch.
 * A valid Classic namespace can support other Game Data resources while the
 * Quest resource itself returns 404, so namespace validation alone is unsafe.
 */
export async function requireBlizzardQuestApi(
  options: BlizzardNamespaceRequestOptions,
): Promise<void> {
  if (!options.accessToken.trim()) throw new Error("Blizzard access token is required");
  const url = new URL("/data/wow/quest/index", `https://${options.region}.api.blizzard.com`);
  url.searchParams.set("namespace", options.namespace);
  url.searchParams.set("locale", options.locale);
  const response = await (options.fetcher ?? fetch)(url, {
    redirect: "error",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${options.accessToken}`,
    },
    signal: requestSignal(options.signal, 20_000),
  });
  const body = await readBoundedBody(response, MAX_QUEST_RESPONSE_BYTES);
  if (!response.ok)
    throw new BlizzardApiError(
      `Blizzard Quest API is unavailable for namespace ${options.namespace} (HTTP ${response.status})`,
      response.status,
      retryAfterMs(response.headers.get("retry-after"), options.now ?? Date.now),
    );
  parseObject(body, "Blizzard Quest API index");
}
