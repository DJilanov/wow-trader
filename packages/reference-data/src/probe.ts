import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { z } from "zod";
import { CRAWLER_AGENT } from "./identity.js";
import { DEFAULT_REQUEST_DELAY_MS, requestGate, validateRequestDelay } from "./pacing.js";

const PROBE_SCHEMA = "source-access-probe.v1";
const MAX_BODY_BYTES = 1_000_000;
const MARKERS: readonly { readonly marker: string; readonly pattern: RegExp }[] = [
  { marker: "cloudfront_access_denied", pattern: /ERROR: The request could not be satisfied/i },
  { marker: "challenge_page", pattern: /cf-chl-/i },
  { marker: "just_a_moment", pattern: /<title>\s*Just a moment/i },
  { marker: "access_denied_title", pattern: /<title>\s*Access denied/i },
  { marker: "verify_human", pattern: /<title>\s*Verify you are human/i },
  { marker: "captcha", pattern: /(?:captcha|hcaptcha|recaptcha)/i },
];

// Cookies are deliberately not captured: a probe documents the transport, not a session.
const IGNORED_HEADERS = new Set(["set-cookie"]);

const entityPath = /^\/(?:tbc|forever)\/(?:item|quest|spell)=\d+(?:\/[a-z0-9][a-z0-9-]{0,200})?$/;

/**
 * Restricts probes to the exact public entity paths and robots.txt. A probe may
 * not be pointed at an arbitrary URL, so it cannot be reused to explore the host.
 */
export function probeUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Probe URL must be absolute");
  }
  if (url.origin !== "https://www.wowhead.com" || url.username || url.password || url.search)
    throw new Error("Probe URL must be a public wowhead.com entity");
  if (url.hash) throw new Error("Probe URL must not carry a fragment");
  if (url.pathname !== "/robots.txt" && !entityPath.test(url.pathname))
    throw new Error("Probe URL must be robots.txt or an exact item/quest/spell entity path");
  return url.href;
}

export const sourceProbeEvidenceSchema = z
  .object({
    schema: z.literal(PROBE_SCHEMA),
    url: z.url(),
    requestedAt: z.iso.datetime(),
    userAgent: z.string().min(1).max(300),
    status: z.number().int().min(100).max(599),
    ok: z.boolean(),
    redirectedTo: z.url().nullable(),
    durationMs: z.number().int().nonnegative(),
    bodyBytes: z.number().int().nonnegative(),
    bodySha256: z.string().regex(/^[a-f0-9]{64}$/),
    pageTitle: z.string().max(300).nullable(),
    challengeMarkers: z.array(z.string().max(80)).max(20),
    headers: z.record(z.string().max(80), z.string().max(2000)),
  })
  .strict();
export type SourceProbeEvidence = z.infer<typeof sourceProbeEvidenceSchema>;

export interface ProbeOptions {
  /** Directory holding the durable pacing sidecar; a probe must not reset it. */
  readonly directory: string;
  readonly url: string;
  readonly delayMs?: number;
  readonly fetcher?: typeof fetch;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly now?: () => number;
  readonly signal?: AbortSignal;
}

/**
 * Issues exactly one request under the same declared identity and durable pacing
 * gate as the crawler, and records the response as evidence. Denials are
 * returned as data rather than retried or re-identified.
 */
export async function probeSource(options: ProbeOptions): Promise<SourceProbeEvidence> {
  const url = probeUrl(options.url);
  const delay = validateRequestDelay(options.delayMs ?? DEFAULT_REQUEST_DELAY_MS);
  const sleep =
    options.sleep ??
    (async (milliseconds: number): Promise<void> => {
      await pause(milliseconds, undefined, { signal: options.signal });
    });
  const gate = await requestGate(
    resolve(options.directory),
    sleep,
    options.now ?? Date.now,
    options.signal,
  );
  await gate.beforeRequest(delay);
  const requestedAt = new Date().toISOString();
  const started = Date.now();
  const response = await (options.fetcher ?? fetch)(url, {
    redirect: "manual",
    headers: { "user-agent": CRAWLER_AGENT, accept: "text/html,application/xml" },
    ...(options.signal
      ? { signal: AbortSignal.any([options.signal, AbortSignal.timeout(20000)]) }
      : { signal: AbortSignal.timeout(20000) }),
  });
  const body = await limitedBody(response, MAX_BODY_BYTES);
  const text = body.toString("utf8");
  const title = /<title>([^<]{1,300})<\/title>/i.exec(text)?.[1]?.trim() ?? null;
  const headers: Record<string, string> = {};
  for (const [name, value] of response.headers) {
    if (IGNORED_HEADERS.has(name.toLowerCase())) continue;
    headers[name.toLowerCase()] = value.slice(0, 2000);
  }
  const evidence: SourceProbeEvidence = {
    schema: PROBE_SCHEMA,
    url,
    requestedAt,
    userAgent: CRAWLER_AGENT,
    status: response.status,
    ok: response.ok,
    redirectedTo: response.headers.get("location"),
    durationMs: Date.now() - started,
    bodyBytes: body.byteLength,
    bodySha256: createHash("sha256").update(body).digest("hex"),
    pageTitle: title,
    challengeMarkers: MARKERS.filter(({ pattern }) => pattern.test(text)).map(
      ({ marker }) => marker,
    ),
    headers,
  };
  return sourceProbeEvidenceSchema.parse(evidence);
}

async function limitedBody(response: Response, maximum: number): Promise<Buffer> {
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
      throw new Error("Probe response exceeds the evidence budget");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
