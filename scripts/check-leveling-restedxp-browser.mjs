import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { inflateSync, deflateSync } from "node:zlib";
import process from "node:process";
import { parseArgs } from "node:util";
import { URL } from "node:url";
import { createCharacterProfile, decodeRestedXpImport } from "../packages/leveling/dist/index.js";

const { values } = parseArgs({
  args: process.argv.slice(process.argv[2] === "--" ? 3 : 2),
  options: {
    "playwright-package": { type: "string" },
    "browser-channel": { type: "string" },
    "executable-path": { type: "string" },
    helper: { type: "string", default: "http://127.0.0.1:3334" },
  },
});
assert(
  values["playwright-package"],
  "Pass --playwright-package=<installed playwright/package.json>.",
);
const requireBrowser = createRequire(resolve(values["playwright-package"]));
const { chromium, expect: defaultExpect } = requireBrowser("playwright/test");
const requireWeb = createRequire(resolve(import.meta.dirname, "../apps/web/package.json"));
const { unzipSync, strFromU8 } = requireWeb("fflate");
const expect = defaultExpect.configure({ timeout: 30000 });
const base = new URL(values.helper);
assert(
  ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) &&
    ["http:", "https:"].includes(base.protocol) &&
    !base.username &&
    !base.password,
  "Use an isolated local review preview, never production.",
);
const output = await mkdtemp(join(tmpdir(), "kfc-restedxp-browser-"));
assert(
  !values["browser-channel"] || ["chrome", "chromium"].includes(values["browser-channel"]),
  "Unsupported browser channel.",
);
assert(
  !(values["browser-channel"] && values["executable-path"]),
  "Choose a browser channel or executable path, not both.",
);
const browser = await chromium.launch({
  channel: values["browser-channel"],
  executablePath: values["executable-path"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const fakeAccount = "KfcBrowserOnlyFixture#1234";
const requests = [];
const errors = [];
const privacyViolations = [];
let httpRequestsChecked = 0;
await context.addInitScript(
  ({ origin, profile }) => {
    if (globalThis.location.origin !== origin) return;
    globalThis.localStorage.setItem(
      "kfc-leveling:characters:v2",
      JSON.stringify({
        version: 1,
        activeId: "restedxp-export-test",
        sessions: [
          {
            id: "restedxp-export-test",
            profile,
            progress: {},
            readerPositions: {},
            lastReader: null,
            lastChapterId: null,
            dungeonPlans: {},
          },
        ],
      }),
    );
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("Test-only clipboard denial");
        },
      },
    });
  },
  {
    origin: base.origin,
    profile: {
      ...createCharacterProfile("alliance", "human"),
      classSlug: "warrior",
      party: { size: 5, readiness: "together", tank: "unknown", healer: "unknown" },
    },
  },
);
await context.route("**/*", (route) => {
  const request = route.request();
  httpRequestsChecked++;
  const outbound = JSON.stringify([request.url(), request.headers(), request.postData()]);
  if ([fakeAccount, encodeURIComponent(fakeAccount)].some((value) => outbound.includes(value))) {
    privacyViolations.push("Account context was blocked in an outgoing HTTP request.");
    return route.abort();
  }
  if (["GET", "HEAD"].includes(request.method())) return route.continue();
  if (
    new URL(request.url()).origin === base.origin &&
    new URL(request.url()).pathname.endsWith("/api/v1/leveling-restedxp-export")
  ) {
    const body = request.postData() ?? "";
    requests.push(JSON.parse(body));
    return route.continue();
  }
  return route.abort();
});
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
try {
  const response = await page.goto(
    new URL("/tools/forever/leveling/routes/alliance-human?plan=premade&class=warrior", base).href,
    { waitUntil: "domcontentloaded", timeout: 120000 },
  );
  assert.equal(response.status(), 200);
  const panel = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Take this route into RestedXP" }) });
  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Create paste import", exact: true }),
  ).toBeEnabled();
  const zipDownload = page.waitForEvent("download", { timeout: 120000 });
  await panel.getByRole("button", { name: "Download addon ZIP", exact: true }).click();
  const zip = await zipDownload;
  const zipPath = join(output, "review.zip");
  await zip.saveAs(zipPath);
  await chmod(zipPath, 0o600);
  const files = unzipSync(await readFile(zipPath));
  const lua = strFromU8(files["KFCForeverGuides/Guides.lua"]);
  const toc = strFromU8(files["KFCForeverGuides/KFCForeverGuides.toc"]);
  assert(lua.includes("namespace.runtimeBuild = 70450"));
  assert(toc.includes("Guides.lua") && !toc.includes("Observer.lua"));
  const review = JSON.parse(strFromU8(files["KFCForeverGuides/review.json"]));
  assert.equal(review.publication, "review");
  assert.equal(review.restedXpVersion, "v4.11.27");

  await panel.getByLabel("Your BattleTag", { exact: true }).fill(fakeAccount);
  await panel.getByRole("button", { name: "Create paste import", exact: true }).click();
  const result = panel.getByLabel("Paste this into RestedXP → Guide Import", { exact: true });
  await expect(result).toBeVisible({ timeout: 120000 });
  await expect(panel.getByLabel("Your BattleTag", { exact: true })).toHaveValue("");
  const encoded = await result.inputValue();
  const decoded = await decodeRestedXpImport(encoded, fakeAccount, {
    compressZlib: async (bytes) => deflateSync(bytes),
    decompressZlib: async (bytes, maximum) => inflateSync(bytes, { maxOutputLength: maximum }),
  });
  assert(decoded.guides.length > 20, "Expected a full route, not a fixture");
  for (const guide of decoded.guides)
    assert(lua.includes(guide), "ZIP and paste-import document bytes differ");
  await panel.getByRole("button", { name: "Copy import", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Clipboard access was blocked");
  assert.equal(
    await result.evaluate((element) => element.selectionEnd - element.selectionStart),
    encoded.length,
  );
  const textDownload = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Download import.txt", exact: true }).click();
  const text = await textDownload;
  const textPath = join(output, "review-import.txt");
  await text.saveAs(textPath);
  await chmod(textPath, 0o600);
  assert.equal(await readFile(textPath, "utf8"), encoded);
  const widths = [];
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await panel.scrollIntoViewIfNeeded();
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve)),
        ),
    );
    const dimensions = await page.evaluate(() => ({
      width: globalThis.document.documentElement.scrollWidth,
      viewport: globalThis.innerWidth,
      offenders: [...globalThis.document.querySelectorAll("body *")]
        .filter((node) => node.getBoundingClientRect().right > globalThis.innerWidth + 1)
        .slice(0, 10)
        .map((node) => ({
          tag: node.tagName,
          class: node.className,
          right: node.getBoundingClientRect().right,
        })),
    }));
    assert(
      dimensions.width <= dimensions.viewport + 1,
      `Horizontal overflow at ${width}px: ${JSON.stringify(dimensions)}`,
    );
    await panel.screenshot({ path: join(output, `export-${width}.png`) });
    widths.push(width);
  }
  const storage = await page.evaluate(() =>
    JSON.stringify({
      local: { ...globalThis.localStorage },
      session: { ...globalThis.sessionStorage },
      url: globalThis.location.href,
    }),
  );
  assert(!storage.includes(fakeAccount), "Account context was persisted");
  await panel.getByLabel("Guide role", { exact: true }).selectOption("party");
  await panel.getByLabel("Your race", { exact: true }).selectOption("dwarf");
  await panel.getByLabel("Your class", { exact: true }).selectOption("priest");
  await expect(result).not.toBeVisible();
  await panel.getByLabel("Your BattleTag", { exact: true }).fill(fakeAccount);
  await panel.getByRole("button", { name: "Create paste import", exact: true }).click();
  await expect(result).toBeVisible({ timeout: 120000 });
  const party = await decodeRestedXpImport(await result.inputValue(), fakeAccount, {
    compressZlib: async (bytes) => deflateSync(bytes),
    decompressZlib: async (bytes, maximum) => inflateSync(bytes, { maxOutputLength: maximum }),
  });
  assert(party.guides.length > 20);
  assert(party.guides.every((guide) => /#group .* · Party · Dwarf Priest\n/.test(guide)));
  assert(party.guides.some((guide) => guide.includes("#label kfc-party-personal-")));
  assert(party.guides.every((guide) => guide.includes("<< Alliance Forever Dwarf Priest")));
  await panel.getByRole("button", { name: "Clear import", exact: true }).click();
  await expect(result).not.toBeVisible();
  assert.deepEqual(errors, []);
  assert.deepEqual(privacyViolations, [], "Account context must remain local.");
  assert(httpRequestsChecked > requests.length, "Static and other HTTP requests were not checked.");
  const evidence = {
    status: "passed",
    localPreview: true,
    productionChanged: false,
    browserVersion: browser.version(),
    targetBuild: 70450,
    restedXpVersion: "v4.11.27",
    nativePolicy: review.nativePolicy,
    leaderGuides: decoded.guides.length,
    partyGuides: party.guides.length,
    widths,
    zipAndImportExactDocuments: true,
    clipboardDeniedFallback: true,
    textDownloadSha256: createHash("sha256").update(encoded).digest("hex"),
    accountSentToServer: false,
    accountPersisted: false,
    httpRequestsChecked,
    allHttpUrlsHeadersAndBodiesChecked: true,
    requests: requests.map((request) => ({
      format: request.format,
      race: request.race,
      classSlug: request.classSlug,
      actionSha256: request.actionSha256,
    })),
    output,
  };
  await writeFile(join(output, "verified.json"), JSON.stringify(evidence, null, 2) + "\n", {
    mode: 0o600,
  });
  process.stdout.write(JSON.stringify(evidence) + "\n");
} catch (error) {
  if (privacyViolations.length)
    process.stderr.write("Privacy check failed: account context was blocked before sending.\n");
  process.stderr.write(`${error instanceof Error ? error.message : "Browser check failed"}\n`);
  await page
    .screenshot({ path: join(output, "failure.png"), timeout: 15000 })
    .catch(() => undefined);
  process.stderr.write(`Browser evidence: ${output}\n`);
  throw error;
} finally {
  await context.close();
  await browser.close();
}
