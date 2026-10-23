import assert from "node:assert/strict";
import console from "node:console";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { URL } from "node:url";

const { values } = parseArgs({
  options: {
    "base-url": { type: "string" },
    "artifact-root": { type: "string" },
    output: { type: "string" },
  },
  strict: true,
});
assert(
  values["base-url"] && values["artifact-root"] && values.output,
  "Supply --base-url=<origin/tools> --artifact-root=<approved runtime root> --output=<new receipt.json>",
);
const base = new URL(values["base-url"]);
assert(
  ["http:", "https:"].includes(base.protocol) &&
    !base.search &&
    !base.hash &&
    !base.username &&
    !base.password,
);
const mount = base.pathname.replace(/\/$/, "");
assert(mount === "/tools", "Check the deployed Helper mount, including /tools");
const root = await realpath(resolve(values["artifact-root"])),
  sha = (value) => createHash("sha256").update(value).digest("hex"),
  hash = (value) => sha(JSON.stringify(value));
async function document(name, limit = 8_000_000) {
  const path = await realpath(resolve(root, name)),
    offset = relative(root, path);
  assert(
    offset && offset !== ".." && !offset.startsWith("../") && !isAbsolute(offset),
    "Evidence escaped runtime storage",
  );
  const info = await stat(path);
  assert(info.isFile() && info.size <= limit, "Evidence exceeds its read budget");
  const bytes = await readFile(path);
  assert(bytes.length <= limit);
  return { value: JSON.parse(bytes.toString("utf8")), sha256: sha(bytes) };
}
const selection = await document("tank-model-updates.json", 32_000),
  pointer = selection.value,
  profiles = ["feral_tank_druid", "protection_paladin", "tank_warrior"];
assert.equal(pointer.schema, "kfc-optimized-tank-selection.v1");
assert(/^[a-f0-9]{64}$/.test(pointer.engine));
assert.deepEqual(Object.keys(pointer.profiles).sort(), profiles);
const models = new Map();
for (const profile of profiles) {
  const selected = pointer.profiles[profile];
  assert(/^[a-f0-9]{24}$/.test(selected.release));
  const proof = await document(`${selected.release}/kfc-optimized-tank-profile.json`, 4_000_000);
  assert.equal(proof.sha256, selected.proofSha256);
  assert.equal(proof.value.schema, "kfc-optimized-tank-profile.v1");
  assert.equal(proof.value.profile, profile);
  assert.equal(proof.value.release, selected.release);
  assert.equal(proof.value.engine, pointer.engine);
  assert.equal(proof.value.sourceRelease, pointer.sourceRelease);
  assert.equal(hash(proof.value.inputs).slice(0, 24), selected.release);
  assert.equal(selected.browserReview.path, `tank-browser-reviews/${selected.release}.json`);
  const review = await document(selected.browserReview.path);
  assert.equal(hash(review.value), selected.browserReview.sha256);
  assert.equal(review.value.status, "passed");
  assert.equal(review.value.release, selected.release);
  assert.equal(review.value.proofSha256, selected.proofSha256);
  assert.equal(review.value.pointerWrites, 0);
  for (const gate of Object.values(review.value.gates)) assert.equal(gate, true);
  const manifest = (await document(`${selected.release}/manifest.json`)).value;
  assert.equal(manifest.files["kfc-optimized-tank-profile.json"].sha256, selected.proofSha256);
  const builds = proof.value.builds.filter((build) => !build.requiresProvisionalEnchantOptIn);
  assert.equal(builds.length, 4);
  assert.equal(new Set(builds.map((build) => `${build.scenario}:${build.objective}`)).size, 4);
  models.set(profile, proof.value);
}
for (const model of models.values()) {
  for (const name of [
    "kfc-optimized-tank-profile.json",
    "kfc-tank-browser-research.json",
    `tank-measurements/${model.cases[0].fingerprint}.json`,
  ]) {
    const response = await globalThis.fetch(
      new URL(`${mount}/forever-sim/${model.release}/${name}`, base),
      {
        redirect: "error",
        signal: globalThis.AbortSignal.timeout(30000),
      },
    );
    assert.equal(response.status, 404, `Private tank proof exposed: ${name}`);
  }
}
const output = resolve(values.output);
const existingReceipt = await lstat(output).catch((error) => {
  if (error.code === "ENOENT") return null;
  throw error;
});
assert(!existingReceipt, "An existing browser receipt cannot be overwritten");
await mkdir(dirname(output), { recursive: true });
const screenshotDirectory = await mkdtemp(
    join(dirname(output), basename(output, ".json") + "-screens-"),
  ),
  screenshots = [];
const { chromium } = createRequire(
    new URL("../.cache/forever-sim-upstream/package.json", import.meta.url),
  )("playwright"),
  browser = await chromium.launch(),
  checked = [];
const metricValue = async (preview, label) =>
  Number(
    (await preview.locator("dt").filter({ hasText: label }).locator("..").locator("dd").innerText())
      .replaceAll(",", "")
      .replace(/[^\d.-]/g, ""),
  );
const ready = async (page) => {
  await page.waitForFunction(
    () =>
      globalThis.document.querySelector(".sim-ui")?.getAttribute("data-kfc-tank-builds-ready") ===
      "true",
    null,
    { timeout: 90000 },
  );
};
const overflow = async (page) =>
  assert(
    await page.evaluate(
      () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 2,
    ),
    "Page overflows the viewport",
  );
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } }),
      errors = [];
    context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
    await context.route(/^https?:\/\/([^/]+\.)?(zamimg|wowhead)\.com\//, (route) => route.abort());
    await context.addInitScript(() => {
      if (["http:", "https:"].includes(globalThis.location.protocol))
        globalThis.localStorage.setItem("classic_wasmconcurrency", "1");
    });
    try {
      const page = await context.newPage();
      for (const scenario of ["raid", "solo"]) {
        const url = new URL(
          `${mount}/forever/tier-list/tanks${scenario === "solo" ? "/solo" : ""}`,
          base,
        ).href;
        const response = await page.goto(url);
        assert(response?.ok());
        assert(
          !/\b(?:noindex|none)\b/i.test(response.headers()["x-robots-tag"] ?? ""),
          "Tank rankings disallow indexing in HTTP headers",
        );
        const board = page.locator('[data-tank-snapshot="kfc-forever-tank-tier-list.v3"]');
        await board.waitFor();
        assert.equal(await board.locator("[data-tier-build]").count(), 3);
        const robots = await page
          .locator('meta[name="robots"], meta[name="googlebot"]')
          .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("content") ?? ""));
        assert(
          robots.every((directive) => !/\b(?:noindex|none)\b/i.test(directive)),
          "Tank rankings disallow indexing in metadata",
        );
        for (const objective of ["threat", "mitigation"]) {
          const priorSelection = await board
            .locator("[data-selected-build]")
            .getAttribute("data-selected-build");
          await board
            .getByRole("button", {
              name: objective === "threat" ? "Threat generation" : "Damage taken",
              exact: true,
            })
            .click();
          if (priorSelection)
            await board
              .locator(
                `[data-selected-build="${priorSelection}"][data-selected-objective="${objective}"]`,
              )
              .waitFor();
          for (const profile of profiles) {
            const model = models.get(profile),
              id = profile.replaceAll("_", "-"),
              build = model.builds.find(
                (row) =>
                  row.scenario === scenario &&
                  row.objective === objective &&
                  !row.requiresProvisionalEnchantOptIn,
              );
            assert(build);
            await board.locator(`[data-tier-build="${id}"]`).click();
            const preview = board.locator(
              `[data-selected-build="${id}"][data-selected-objective="${objective}"]`,
            );
            await preview.waitFor();
            assert.equal(
              await metricValue(preview, /^Threat \/ second/),
              Number(build.reference.metrics.threat.avg.toFixed(1)),
            );
            assert.equal(
              await metricValue(preview, /^Damage taken \/ second/),
              Number(build.reference.metrics.dtps.avg.toFixed(1)),
            );
            assert.equal(
              await metricValue(preview, /^Damage \/ second/),
              Number(build.reference.metrics.dps.avg.toFixed(1)),
            );
            assert.equal(
              await metricValue(preview, /^Health$/),
              Math.round(build.reference.health),
            );
            assert.equal(await metricValue(preview, /^Armor$/), Math.round(build.reference.armor));
            const screenshot = `${scenario}-${objective}-${profile}-${width}.png`;
            const bytes = await preview.screenshot({ path: join(screenshotDirectory, screenshot) });
            screenshots.push({
              file: screenshot,
              sha256: sha(bytes),
              profile,
              scenario,
              objective,
              width,
            });
            const gear = preview
              .locator("details")
              .filter({ has: page.locator("summary", { hasText: /every item and enchant/ }) });
            await gear.locator("summary").click();
            assert.equal(await gear.locator("tbody tr").count(), 17);
            for (const item of build.gear)
              if (item.id)
                assert.equal(
                  await gear
                    .locator(`a[href="https://www.wowhead.com/forever/item=${item.id}"]`)
                    .count(),
                  build.gear.filter((other) => other.id === item.id).length,
                );
            const link = preview.getByRole("link", { name: /^Simulate/ }),
              href = await link.getAttribute("href");
            assert.equal(href, `${mount}${build.href}`);
            await overflow(page);
            checked.push({
              kind: "ranked-setup",
              scenario,
              objective,
              profile,
              width,
              settingsSha256: build.settingsSha256,
            });
            if (width === 1440) {
              const imported = await context.newPage();
              try {
                assert((await imported.goto(new URL(href, base).href))?.ok());
                await ready(imported);
                assert.equal(
                  await imported.locator("#kfc-tank-build-choice").inputValue(),
                  build.id,
                );
                await overflow(imported);
                checked.push({
                  kind: "public-exact-import",
                  scenario,
                  objective,
                  profile,
                  width,
                  settingsSha256: build.settingsSha256,
                });
              } finally {
                await imported.close();
              }
            }
            await gear.locator("summary").click();
          }
        }
      }
      for (const profile of profiles) {
        // Earlier exact imports deliberately saved characters in this isolated browser context.
        await page.evaluate(() => globalThis.localStorage.clear());
        const model = models.get(profile),
          slug = profile.replaceAll("_", "-");
        assert((await page.goto(new URL(`${mount}/forever/simulator/${slug}`, base).href))?.ok());
        const frame = page.frameLocator(
          `iframe[src^="${mount}/forever-sim/${model.release}/${profile}/"]`,
        );
        await frame
          .locator('.sim-ui[data-kfc-tank-builds-ready="true"]')
          .waitFor({ timeout: 90000 });
        assert.equal(
          await frame.locator("#kfc-tank-build-choice").inputValue(),
          model.defaultBuildId,
        );
        assert.equal(
          await frame.locator("#kfc-tank-build-choice option").count(),
          model.builds.length + 1,
        );
        await overflow(page);
        checked.push({ kind: "public-workspace", profile, width, release: model.release });
      }
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }
  assert.equal(checked.length, 42);
  assert.equal(
    (await document("tank-model-updates.json", 32_000)).sha256,
    selection.sha256,
    "Tank selection changed during browser checks",
  );
  const result = {
    schema: "kfc-optimized-tank-rankings-browser.v1",
    status: "passed",
    baseUrl: base.href,
    selectionSha256: hash(pointer),
    engine: pointer.engine,
    checked,
    verifiedAt: new Date().toISOString(),
    sourceSha256: sha(await readFile(new URL(import.meta.url))),
    screenshotDirectory,
    screenshots,
    privateEvidenceHidden: true,
    pointerWrites: 0,
  };
  await writeFile(output, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
  console.log(
    JSON.stringify({
      status: result.status,
      checks: checked.length,
      output: resolve(values.output),
    }),
  );
} finally {
  await browser.close();
}
