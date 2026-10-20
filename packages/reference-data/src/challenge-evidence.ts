import { createHash } from "node:crypto";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { z } from "zod";
import { atomicJsonWrite } from "./store.js";

const EVIDENCE_DIRECTORY = "challenge-evidence";

export const challengeEvidenceSchema = z
  .object({
    schema: z.literal("wowhead-challenge-evidence.v1"),
    key: z
      .string()
      .regex(
        /^(?:(?:tbc|forever)-(?:item|quest|spell)-\d+|(?:tbc|forever)-(?:spell|item)-list-[a-z0-9-]+)$/,
      ),
    url: z.url(),
    capturedAt: z.iso.datetime(),
    status: z.number().int().min(100).max(599),
    contentType: z.string().max(200),
    challengeKind: z.enum(["aws_waf", "cloudflare", "generic"]),
    bodyBytes: z.number().int().nonnegative(),
    bodySha256: z.string().regex(/^[a-f0-9]{64}$/),
    screenshotFile: z.string().max(300).nullable(),
    reportFile: z.string().max(300),
  })
  .strict();

export type ChallengeEvidence = z.infer<typeof challengeEvidenceSchema>;

export interface ChallengeScreenshot {
  readonly contentType: "image/png" | "image/jpeg";
  readonly bytes: Buffer;
}

export interface WriteChallengeEvidenceOptions {
  readonly stagingDirectory: string;
  readonly key: string;
  readonly url: string;
  readonly capturedAt: string;
  readonly status: number;
  readonly contentType: string;
  readonly responseBody: string;
  readonly screenshot: ChallengeScreenshot | null;
}

export interface WrittenChallengeEvidence {
  readonly evidence: ChallengeEvidence;
  readonly metadataPath: string;
  readonly reportPath: string;
}

export async function writeChallengeEvidence(
  options: WriteChallengeEvidenceOptions,
): Promise<WrittenChallengeEvidence> {
  const directory = resolve(options.stagingDirectory, EVIDENCE_DIRECTORY);
  await mkdir(directory, { recursive: true });
  const bodySha256 = createHash("sha256").update(options.responseBody).digest("hex");
  const timestamp = options.capturedAt.replace(/[^0-9]/g, "").slice(0, 17);
  const stem = `${options.key}-${timestamp}-${bodySha256.slice(0, 12)}`;
  const screenshotFile = options.screenshot
    ? `${stem}.${options.screenshot.contentType === "image/png" ? "png" : "jpg"}`
    : null;
  const metadataFile = `${stem}.json`;
  const reportFile = `${stem}.html`;
  if (screenshotFile && options.screenshot)
    await writeFile(resolve(directory, screenshotFile), options.screenshot.bytes, {
      flag: "wx",
      mode: 0o600,
    });
  const evidence = challengeEvidenceSchema.parse({
    schema: "wowhead-challenge-evidence.v1",
    key: options.key,
    url: options.url,
    capturedAt: options.capturedAt,
    status: options.status,
    contentType: options.contentType,
    challengeKind: challengeKind(options.responseBody),
    bodyBytes: Buffer.byteLength(options.responseBody),
    bodySha256,
    screenshotFile,
    reportFile,
  });
  const metadataPath = resolve(directory, metadataFile);
  const reportPath = resolve(directory, reportFile);
  await atomicJsonWrite(metadataPath, evidence);
  await writeFile(reportPath, challengeReport(evidence), { flag: "wx", mode: 0o600 });
  return { evidence, metadataPath, reportPath };
}

export async function latestChallengeReport(stagingDirectory: string): Promise<string | null> {
  const directory = resolve(stagingDirectory, EVIDENCE_DIRECTORY);
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const reports = await Promise.all(
    names
      .filter((name) => name.endsWith(".html"))
      .map(async (name) => ({ name, modifiedAt: (await stat(resolve(directory, name))).mtimeMs })),
  );
  reports.sort(
    (left, right) => left.modifiedAt - right.modifiedAt || left.name.localeCompare(right.name),
  );
  const latest = reports.at(-1);
  return latest ? resolve(directory, latest.name) : null;
}

function challengeKind(body: string): ChallengeEvidence["challengeKind"] {
  if (/AwsWafIntegration|awswaf/i.test(body)) return "aws_waf";
  if (/cf-chl-|cloudflare/i.test(body)) return "cloudflare";
  return "generic";
}

function challengeReport(evidence: ChallengeEvidence): string {
  const screenshot = evidence.screenshotFile
    ? `<img src="./${encodeURIComponent(basename(evidence.screenshotFile))}" alt="Captured challenge page">`
    : '<p class="missing">No screenshot was present in the Browsertrix archive.</p>';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'unsafe-inline'">
  <title>Challenge evidence — ${escapeHtml(evidence.key)}</title>
  <style>
    :root { color-scheme: dark; font-family: system-ui, sans-serif; }
    body { margin: 0; padding: 24px; background: #111827; color: #e5e7eb; }
    main { max-width: 1280px; margin: 0 auto; }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 16px; }
    dt { color: #93c5fd; } dd { margin: 0; overflow-wrap: anywhere; }
    img { display: block; max-width: 100%; height: auto; margin-top: 24px; border: 1px solid #374151; }
    .missing { padding: 24px; border: 1px solid #7f1d1d; background: #450a0a; }
  </style>
</head>
<body>
  <main>
    <h1>Read-only challenge evidence</h1>
    <dl>
      <dt>Record</dt><dd>${escapeHtml(evidence.key)}</dd>
      <dt>URL</dt><dd>${escapeHtml(evidence.url)}</dd>
      <dt>Captured</dt><dd>${escapeHtml(evidence.capturedAt)}</dd>
      <dt>Response</dt><dd>HTTP ${evidence.status} · ${escapeHtml(evidence.contentType)}</dd>
      <dt>Classification</dt><dd>${escapeHtml(evidence.challengeKind)}</dd>
      <dt>Body SHA-256</dt><dd>${evidence.bodySha256}</dd>
    </dl>
    ${screenshot}
  </main>
</body>
</html>
`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
