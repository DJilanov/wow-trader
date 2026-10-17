import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import process from "node:process";
import console from "node:console";
import { fileURLToPath, URL } from "node:url";
import { promisify } from "node:util";
import { simulationHash } from "../infra/simulator/simulation-cache.mjs";
import { assertProcConsentDisabled } from "./review-prebis-browser.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const optimization = "artifacts/forever-simulator/optimization";
const args = process.argv.slice(2);
assert(
  args.length >= 1 &&
    args.length <= 2 &&
    args.filter((value) => /^--case=[a-z][a-z0-9-]*$/.test(value)).length === 1 &&
    args.every((value) => /^--case=[a-z][a-z0-9-]*$/.test(value) || value === "--allow-pending") &&
    new Set(args).size === args.length,
  "Pass --case=<campaign-case> and optionally --allow-pending for an explicitly unfinished core-reviewed preview",
);
const caseId = args.find((value) => value.startsWith("--case=")).slice(7);
const allowPending = args.includes("--allow-pending");
const read = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
const readReference = async (reference) => {
  assert(reference && /^[a-f0-9]{64}$/.test(reference.sha256), "Missing evidence hash");
  const path = resolve(root, reference.path);
  const offset = relative(resolve(root, optimization), path);
  assert(
    offset && offset !== ".." && !offset.startsWith("../") && !isAbsolute(offset),
    "Evidence is outside the optimization archive",
  );
  const value = await read(path);
  assert.equal(simulationHash(value), reference.sha256, "Campaign evidence hash changed");
  return value;
};
const latest = await read(`${optimization}/campaigns/latest.json`);
assert(/^[a-f0-9]{64}$/.test(latest.identity), "Invalid campaign identity");
const state = await read(`${optimization}/campaigns/${latest.identity}/state.json`);
assert.equal(state.schema, "kfc-prebis-campaign.v1");
assert.equal(state.identity, latest.identity);
const assertCurrentInputs = async () => {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    ["scripts/update-simulator-prebis.mjs", "--status", `--case=${caseId}`],
    { cwd: root, maxBuffer: 1024 * 1024 },
  );
  const status = JSON.parse(stdout);
  assert.equal(status.identity, state.identity, "Campaign inputs changed");
  assert.equal(status.previousResultsAreStale, false, "Campaign results are stale");
  assert.equal(status.recaptureRequired, false, "Browser templates need recapturing");
};
const entry = state.cases[caseId];
assert(entry, "Unknown or not-yet-started campaign case");
assert.equal(entry.entry.id, caseId);
const complete = entry.status === "reviewed-local";
assert(
  complete || allowPending,
  "Final audits are unfinished; --allow-pending is required for a labelled preview",
);
await assertCurrentInputs();
const reviewReference = complete
  ? entry.final.review
  : entry.steps.filter((step) => step.kind === "feedback").at(-1)?.files.output;
assert(
  reviewReference,
  "Core feedback is unfinished; even a preview needs a completed core review",
);
const review = await readReference(reviewReference);
assert.equal(review.status, "closed-loop-verified");
assert.equal(review.iterations, 400000);
assert.equal(`${review.profile}/${review.variant}`, entry.entry.spec);
const baselineReference = { path: review.evidencePaths.baseline, sha256: review.baselineSha256 };
const baseline = await readReference(baselineReference);
const active = await read("artifacts/forever-simulator/active.json");
assert.equal(
  baseline.sourceRelease,
  active.release,
  "Preview is not from the current browser release",
);
assert.equal(review.revision, active.revision, "Preview is not from the current engine revision");
assert.equal(
  createHash("sha256")
    .update(await readFile(join(root, ".cache/simulator-toolchain/bin/kfc-prebis")))
    .digest("hex"),
  review.nativeBinarySha256,
  "Preview is not from the current native engine",
);
const db = await read(`artifacts/forever-simulator/${active.release}/assets/database/db.json`);
assert.equal(simulationHash(db), review.dbSha256, "Browser item database changed");
const requiresProvisionalEnchantOptIn = review.enchantPolicy.provisionalEffectIds.length > 0;
assert.equal(requiresProvisionalEnchantOptIn, entry.entry.scenario === "provisional-procs");
if (complete) {
  const exported = await readReference(entry.final.exported);
  assert.equal(exported.schema, "kfc-reviewed-simulator-build.v1");
  assert.equal(exported.evidence.feedbackSha256, reviewReference.sha256);
  assert.equal(exported.requiresProvisionalEnchantOptIn, requiresProvisionalEnchantOptIn);
  assert.deepEqual(exported.settings, baseline.settings);
  assert.equal(entry.final.accessories.length, 2);
  const kinds = new Set();
  for (const reference of entry.final.accessories) {
    const audit = await readReference(reference);
    assert.equal(audit.feedbackReviewSha256, reviewReference.sha256);
    assert.equal(audit.status, "no-confirmed-challenger");
    kinds.add(audit.kind);
  }
  assert.deepEqual([...kinds].sort(), ["rings", "trinkets"]);
  const rotation = await readReference(entry.final.rotation);
  assert.equal(rotation.feedbackSha256, reviewReference.sha256);
  assert.equal(rotation.validated, false);
  assert.equal(exported.evidence.rotationAuditSha256, entry.final.rotation.sha256);
}
const origin = new URL(process.env.SIMULATOR_TEST_URL || "http://localhost:3017");
assert(
  ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) &&
    origin.protocol === "http:" &&
    !origin.username &&
    !origin.password &&
    origin.pathname === "/" &&
    !origin.search &&
    !origin.hash,
  "Review links are loopback-only",
);
const baseUrl = `${origin.origin}/forever-sim/${active.release}/${baseline.profile}/`;
const { chromium } = createRequire(join(root, ".cache/forever-sim-upstream/package.json"))(
  "playwright",
);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [];
const open = async (url) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", async (dialog) => {
    errors.push(dialog.message());
    await dialog.dismiss();
  });
  await page.addInitScript(() => globalThis.localStorage.setItem("classic_wasmconcurrency", "1"));
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  assert(response?.ok(), "Local simulator did not load");
  await page.locator('.sim-ui[data-kfc-initialized="true"]').waitFor({ timeout: 60000 });
  return { context, page };
};
const savedSettings = async (page) =>
  page.evaluate(() => {
    const keys = Object.keys(globalThis.localStorage).filter((key) =>
      key.endsWith("__currentSettings__"),
    );
    if (keys.length !== 1) throw new Error("Expected one isolated character storage record");
    return JSON.parse(globalThis.localStorage.getItem(keys[0]));
  });
const combatSettings = (settings) =>
  Object.fromEntries(
    ["player", "encounter", "raidBuffs", "partyBuffs", "debuffs", "tanks", "targetDummies"]
      .filter((key) => settings[key] !== undefined)
      .map((key) => [key, settings[key]]),
  );
try {
  const { context, page } = await open(baseUrl);
  await page.evaluate((settings) => {
    const key = Object.keys(globalThis.localStorage).find((value) =>
      value.endsWith("__currentSettings__"),
    );
    if (!key) throw new Error("Character storage not initialized");
    globalThis.localStorage.setItem(key, JSON.stringify(settings));
  }, baseline.settings);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('.sim-ui[data-kfc-initialized="true"]').waitFor({ timeout: 60000 });
  const before = await savedSettings(page);
  assert.deepEqual(
    combatSettings(before),
    combatSettings(baseline.settings),
    "Loading the reviewed baseline changed combat settings",
  );
  if (requiresProvisionalEnchantOptIn) await assertProcConsentDisabled(page);
  await page.locator(".export-dropdown .export-link").click();
  await page
    .locator(".export-dropdown .dropdown-item")
    .filter({ hasText: /^Link$/ })
    .click();
  const modal = page.locator(".modal.show").filter({ hasText: "Shareable Link" });
  const link = await modal.locator(".exporter-textarea").inputValue();
  const parsed = new URL(link);
  assert.equal(parsed.origin, origin.origin);
  assert.equal(parsed.pathname.replace(/\/$/, ""), new URL(baseUrl).pathname.replace(/\/$/, ""));
  assert.equal(parsed.search, "", "Partial-category exports cannot represent a complete build");
  assert(parsed.hash.length > 100, "Missing full-build payload");
  await context.close();
  const imported = await open(link);
  const after = await savedSettings(imported.page);
  assert.deepEqual(
    combatSettings(after),
    combatSettings(before),
    "Full-build share link changed combat settings on a clean browser",
  );
  if (requiresProvisionalEnchantOptIn) await assertProcConsentDisabled(imported.page);
  assert.deepEqual(errors, [], "Share/import emitted browser errors");
  await assertCurrentInputs();
  const result = {
    schema: "kfc-local-build-share-review.v1",
    campaignIdentity: state.identity,
    caseId,
    status: complete ? "reviewed-local" : "core-reviewed-final-audits-pending",
    sourceRelease: active.release,
    requiresProvisionalEnchantOptIn,
    toolSourceSha256: simulationHash(await readFile(fileURLToPath(import.meta.url), "utf8")),
    feedbackReview: reviewReference,
    baseline: baselineReference,
    ...(complete ? { campaignFinal: entry.final } : {}),
    link,
    combatSettingsSha256: simulationHash(combatSettings(after)),
    tested:
      "Complete combat settings preserved by the real exporter/importer in two isolated browser contexts. No combat simulation was run.",
    warnings: [
      ...(complete
        ? []
        : [
            "Final accessory/rotation audits are unfinished. This is a preview, not a finalized recommendation.",
          ]),
      ...(requiresProvisionalEnchantOptIn
        ? [
            "Provisional proc models remain OFF after import and reload. Before simulating, open Main Hand → Change enchant → Allow provisional proc models (unverified Forever behavior). This is a separate, explicit choice in the engine, not consent carried by this link.",
          ]
        : []),
      "Full-build import replaces this simulator character's gear, enchants, talents, rotation, race, professions, consumes, buffs and encounter. Save personal builds first.",
      "No honor-rank or reputation cap. Includes historical assumptions; not a launch-day acquisition guide or proof of global BiS.",
    ],
  };
  const directory = join(root, optimization, "share-links");
  await mkdir(directory, { recursive: true });
  const output = join(directory, `${caseId}-${simulationHash(result).slice(0, 16)}.json`);
  try {
    await writeFile(output, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    assert.deepEqual(await read(output), result, "Existing share review differs");
  }
  console.log(JSON.stringify({ output, status: result.status, link, tested: result.tested }));
} finally {
  await browser.close();
}
