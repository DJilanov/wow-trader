import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve, join } from "node:path";
import { pathToFileURL, URL } from "node:url";
import { inflateSync } from "node:zlib";
import process from "node:process";
import console from "node:console";
import { SIMULATOR_SPECS } from "../packages/forever-data/dist/simulator.js";

const root = resolve(import.meta.dirname, "..");
const storage = join(root, "artifacts/forever-simulator");
const base = new URL(process.env.SIMULATOR_TEST_URL ?? "http://127.0.0.1:3334/tools");
assert(
  ["http:", "https:"].includes(base.protocol) &&
    !base.username &&
    !base.password &&
    !base.search &&
    !base.hash,
);
assert(base.pathname === "/tools" || base.pathname === "/tools/");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const codecPath =
  "optimization/greater-mageblood-model-v2/attempts/a4eabfa5c89f3813c1b74bdeb06e276faeebe0583cbea9d19081fc5873f45672/codec-node.mjs";
assert.equal(
  hash(await readFile(join(storage, codecPath))),
  "ddda496cbcf31cf2e7f18300d60bdf12f9035b742b485bff20dbb66bbaad628a",
);
const api = await import(pathToFileURL(join(storage, codecPath)).href);
const snapshot = JSON.parse(
  await readFile(join(root, "apps/web/src/lib/data/forever-dps-tier-list.json"), "utf8"),
);
const { chromium } = createRequire(join(root, ".cache/forever-sim-upstream/package.json"))(
  "playwright",
);
const browser = await chromium.launch();
const checks = [],
  errors = [];
function normalize(value) {
  const combat = Object.fromEntries(
    ["player", "encounter", "raidBuffs", "partyBuffs", "debuffs", "tanks", "targetDummies"]
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, value[key]]),
  );
  const proto = api.IndividualSimSettings.fromJson(combat);
  assert([0, 60].includes(proto.player.level));
  proto.player.level = 60;
  proto.player.bonusStats ??= { stats: [], pseudoStats: [] };
  for (const key of ["stats", "pseudoStats"]) {
    const values = proto.player.bonusStats[key] ?? [];
    while (values.length && values.at(-1) === 0) values.pop();
    proto.player.bonusStats[key] = values;
  }
  return api.IndividualSimSettings.toJson(proto);
}
async function ready(page) {
  const handle = await page.locator(".forever-simulator-frame iframe").elementHandle();
  assert(handle);
  const frame = await handle.contentFrame();
  assert(frame);
  await frame.locator('.sim-ui[data-kfc-initialized="true"]').waitFor({ timeout: 90000 });
  await page.locator(".simulator-loading").waitFor({ state: "hidden", timeout: 30000 });
  return frame;
}
async function saved(frame) {
  return frame.evaluate(() => {
    const key = Object.keys(globalThis.localStorage).find((key) =>
      key.endsWith("__currentSettings__"),
    );
    if (!key) throw new Error("Missing current character");
    return JSON.parse(globalThis.localStorage.getItem(key));
  });
}
async function simulate(page, frame) {
  await frame.evaluate(() => {
    const input = globalThis.document.getElementById("simui-iterations");
    if (!input) throw new Error("Missing iterations control");
    input.value = "25";
    input.dispatchEvent(new globalThis.Event("change", { bubbles: true }));
  });
  await frame.locator(".dps-action").click();
  await frame.waitForFunction(
    () => {
      const notice = globalThis.document.querySelector(".kfc-frame-notice:not([hidden])");
      if (notice) throw new Error(notice.textContent);
      return (
        !globalThis.document.querySelector(".dps-action")?.disabled &&
        /\d[\d,]*\.\d+/.test(
          globalThis.document.querySelector(".results-content .topline-result-avg")?.textContent ??
            "",
        )
      );
    },
    null,
    { timeout: 120000 },
  );
  const bytes = await frame.evaluate(() => globalThis.__presetCombat.at(-1));
  assert(bytes?.length, "No genuine combat request");
  assert.equal(api.RaidSimRequest.fromBinary(Uint8Array.from(bytes)).simOptions.iterations, 25);
  assert.equal(await frame.locator(".kfc-frame-notice:not([hidden])").count(), 0);
}
try {
  for (const spec of SIMULATOR_SPECS.filter((spec) => spec.role !== "raid")) {
    const entry = snapshot.entries.find((entry) => entry.profile === spec.page);
    const publication = entry
      ? JSON.parse(
          await readFile(
            join(
              storage,
              `published-reviews/${spec.page}-${entry.publicationSha256.slice(0, 16)}.json`,
            ),
            "utf8",
          ),
        )
      : null;
    if (publication) assert.equal(hash(JSON.stringify(publication)), entry.publicationSha256);
    const builds =
      publication?.builds.filter((build) => !build.requiresProvisionalEnchantOptIn) ?? [];
    for (const width of [1440, 390]) {
      const context = await browser.newContext({
        viewport: { width, height: width > 400 ? 1080 : 844 },
      });
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(30000);
        page.on("pageerror", (error) =>
          errors.push({ spec: spec.slug, width, message: error.message }),
        );
        await page.addInitScript(() => {
          globalThis.localStorage.setItem("classic_wasmconcurrency", "1");
          globalThis.__presetCombat = [];
          const post = globalThis.Worker.prototype.postMessage;
          globalThis.Worker.prototype.postMessage = function (message, ...args) {
            if (["raidSim", "raidSimAsync"].includes(message.msg))
              globalThis.__presetCombat.push(Array.from(message.inputData));
            return post.call(this, message, ...args);
          };
        });
        assert(
          (
            await page.goto(`${base.href.replace(/\/$/, "")}/forever/simulator/${spec.slug}`, {
              waitUntil: "domcontentloaded",
            })
          )?.ok(),
        );
        let frame = await ready(page);
        if (width > 400) await simulate(page, frame);
        checks.push({
          profile: spec.page,
          width,
          selection: "fresh-default",
          simulated: width > 400,
        });
        for (const build of builds) {
          const expected = api.IndividualSimSettings.toJson(
            api.IndividualSimSettings.fromBinary(
              inflateSync(Buffer.from(new URL(build.href, base).hash.slice(1), "base64")),
            ),
          );
          const presetName =
            build.id === "rogue-combat-static"
              ? "Combat · Backstab · pre-raid tested"
              : build.id === "two-hand-fury-static"
                ? "Two-hand Fury · pre-raid tested"
                : (build.displayName ??
                  `${build.spec.split("/")[1][0].toUpperCase()}${build.spec.split("/")[1].slice(1)} · pre-raid tested`);
          for (const selection of ["configuration", "gear"]) {
            await frame.evaluate(() => {
              const key = Object.keys(globalThis.localStorage).find((key) =>
                key.endsWith("__currentSettings__"),
              );
              const value = JSON.parse(globalThis.localStorage.getItem(key));
              value.player.profession1 = "Mining";
              value.player.profession2 = "Skinning";
              globalThis.localStorage.setItem(key, JSON.stringify(value));
            });
            await page.reload({ waitUntil: "domcontentloaded" });
            frame = await ready(page);
            assert.equal(
              (await saved(frame)).player.profession1,
              "Mining",
              "Reload must not silently overwrite personal settings",
            );
            if (width <= 400) {
              const button = frame.getByRole("button", { name: "Build", exact: true });
              if ((await button.getAttribute("aria-pressed")) !== "true") {
                await page
                  .locator("iframe")
                  .evaluate((element) => element.scrollIntoView({ block: "start" }));
                await button.click();
              }
            }
            const container =
              selection === "configuration"
                ? frame.locator(".preset-configuration-picker-root:visible").first()
                : frame
                    .locator(".saved-data-manager-root:visible")
                    .filter({ hasText: /^Gear Sets/ });
            const previous = await page.locator(".forever-simulator-frame iframe").elementHandle();
            await container.getByText(presetName, { exact: true }).click();
            await page.waitForFunction((element) => !element.isConnected, previous);
            frame = await ready(page);
            assert.deepEqual(
              normalize(await saved(frame)),
              normalize(expected),
              `${spec.page}/${build.id}/${selection}: incomplete preset`,
            );
            assert.equal(
              await frame.evaluate(() => globalThis.__presetCombat.length),
              0,
              "Selecting a preset must not automatically simulate",
            );
            if (width > 400) await simulate(page, frame);
            checks.push({
              profile: spec.page,
              build: build.id,
              width,
              selection,
              fullScenario: true,
              simulated: width > 400,
            });
            console.error(`[preset switching] ${spec.page}/${build.id}/${selection} ${width}`);
          }
        }
      } finally {
        await context.close();
      }
    }
  }
  assert.deepEqual(errors, []);
  const result = {
    status: "passed",
    origin: base.href,
    checks,
    simulations: checks.filter((check) => check.simulated).length,
    errors,
    capturedAt: new Date().toISOString(),
  };
  if (process.env.SIMULATOR_PRESET_REPORT)
    await writeFile(process.env.SIMULATOR_PRESET_REPORT, JSON.stringify(result, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
  console.log(
    JSON.stringify({ status: "passed", checks: checks.length, simulations: result.simulations }),
  );
} finally {
  await browser.close();
}
