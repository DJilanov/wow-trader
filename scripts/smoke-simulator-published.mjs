import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import console from "node:console";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import process from "node:process";
import { URL } from "node:url";
import { inflateSync } from "node:zlib";
import { assertProcConsentDisabled } from "./review-prebis-browser.mjs";
import { assertSimulatorPageScroll } from "./simulator-page-scroll.mjs";
import { loadSimulatorBuildSettingsCodec } from "../artifacts/forever-simulator/optimization/review-tools/simulator-build-settings-codec.mjs";

const root = resolve(import.meta.dirname, "..");
const origin = new URL(process.env.SIMULATOR_TEST_URL ?? "https://kfcguild.online/tools");
assert(["https:", "http:"].includes(origin.protocol));
assert(!origin.username && !origin.password && !origin.search && !origin.hash);
const basePath = origin.pathname.replace(/\/$/, "");
assert(basePath === "" || basePath === "/tools");
const helperUrl = (path) => new URL(basePath + path, origin).href;
const storage = join(root, "artifacts/forever-simulator");
const pointer = JSON.parse(await readFile(join(storage, "published-reviews.json"), "utf8"));
const reference = pointer.profiles.warrior;
assert(/^published-reviews\/warrior-[a-f0-9]{16}\.json$/.test(reference.path));
const publication = JSON.parse(await readFile(join(storage, reference.path), "utf8"));
const displayRelease =
  process.env.SIMULATOR_PRESET_SAFETY_RELEASE ?? publication.presentationRelease;
assert(/^[a-f0-9]{24}$/.test(displayRelease));
assert.equal(
  createHash("sha256").update(JSON.stringify(publication)).digest("hex"),
  reference.sha256,
);
const require = createRequire(join(root, ".cache/forever-sim-upstream/package.json"));
const { chromium } = require("playwright");
const esbuild = require("esbuild");
let bundle;
try {
  bundle = await esbuild.build({
    absWorkingDir: root,
    stdin: {
      contents: "export {IndividualSimSettings} from './ui/core/proto/ui';",
      resolveDir: join(root, ".cache/forever-sim-upstream"),
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    logLevel: "silent",
  });
} finally {
  esbuild.stop();
}
const codec = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].contents).toString("base64")
);
const settingsCodec = await loadSimulatorBuildSettingsCodec(root);
const browser = await chromium.launch();
const errors = [];
const checked = [];
async function simulator(page) {
  const element = await page.locator("iframe").first().elementHandle();
  const frame = await element.contentFrame();
  assert(frame);
  await frame.locator('.sim-ui[data-kfc-initialized="true"]').waitFor({ timeout: 60000 });
  await page.locator(".simulator-loading").waitFor({ state: "hidden", timeout: 15000 });
  await assertSimulatorPageScroll(frame);
  return frame;
}
async function saved(frame) {
  return frame.evaluate(() => {
    const keys = Object.keys(globalThis.localStorage).filter((key) =>
      key.endsWith("__currentSettings__"),
    );
    if (keys.length !== 1) throw new Error("Expected isolated simulator character");
    return JSON.parse(globalThis.localStorage.getItem(keys[0]));
  });
}
try {
  for (const viewport of [
    { width: 1440, height: 1080 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400 && new URL(response.url()).pathname.includes("/forever-sim/"))
        errors.push(`Simulator asset HTTP ${response.status()}: ${response.url()}`);
    });
    await page.addInitScript(() => {
      globalThis.localStorage.setItem("classic_wasmconcurrency", "1");
      globalThis.__kfcPublishedCombatCount = 0;
      const post = globalThis.Worker.prototype.postMessage;
      globalThis.Worker.prototype.postMessage = function (message, ...rest) {
        if (["raidSim", "raidSimAsync"].includes(message.msg))
          globalThis.__kfcPublishedCombatCount++;
        return post.call(this, message, ...rest);
      };
    });
    assert((await page.goto(helperUrl("/forever/simulator/warrior")))?.ok(), "Warrior page failed");
    await simulator(page);
    const options = page.getByLabel("Choose a build").locator('option:not([value=""])');
    assert.equal(await options.count(), publication.builds.length);
    assert((await options.allTextContents()).every((label) => !/Alliance|Horde/.test(label)));
    for (const build of publication.builds.filter(
      (entry) =>
        process.env.SIMULATOR_SMOKE_ALL_MOBILE_BUILDS === "1" ||
        viewport.width > 400 ||
        entry.id === "two-hand-fury-static",
    )) {
      await page.getByLabel("Choose a build").selectOption(build.id);
      const precision = await page.locator(".simulator-reviewed-reference").innerText();
      assert(precision.includes(build.referenceDps.toFixed(2) + " modeled DPS"));
      assert(precision.includes(build.validationIterations.toLocaleString("en-US")));
      await page.getByRole("button", { name: "Load build", exact: true }).click();
      let frame = await simulator(page);
      assert(
        (await page.locator("iframe").getAttribute("src")).startsWith(
          `${basePath}/forever-sim/${displayRelease}/warrior/`,
        ),
      );
      const settings = codec.IndividualSimSettings.toJson(
        codec.IndividualSimSettings.fromBinary(
          inflateSync(Buffer.from(new URL(build.href, origin).hash.slice(1), "base64")),
        ),
      );
      assert.deepEqual(
        settingsCodec.normalize(await saved(frame)),
        settingsCodec.normalize(settings),
      );
      await assertProcConsentDisabled(frame);
      assert.equal(await frame.evaluate(() => globalThis.__kfcPublishedCombatCount), 0);
      if (build.id === "two-hand-fury-static") {
        const configurations = frame.locator(".preset-configuration-picker-root:visible").first();
        await configurations.getByText("Two-hand Fury · pre-raid tested", { exact: true }).click();
        assert.deepEqual(
          settingsCodec.normalize(await saved(frame)),
          settingsCodec.normalize(settings),
        );
        const sets = frame
          .locator(".saved-data-manager-root:visible")
          .filter({ hasText: /^Gear Sets/ });
        assert.equal(
          await sets.getByText("Two-hand Fury · pre-raid tested", { exact: true }).count(),
          1,
        );
        await page.reload();
        frame = await simulator(page);
        assert.deepEqual(
          settingsCodec.normalize(await saved(frame)),
          settingsCodec.normalize(settings),
        );
        await assertProcConsentDisabled(frame);
        if (viewport.width > 400 && process.env.SIMULATOR_SMOKE_COMBAT === "1") {
          await frame.evaluate(() => {
            for (const [id, value] of [
              ["simui-fixed-rng-seed", "77191"],
              ["simui-iterations", "25"],
            ]) {
              const input = globalThis.document.getElementById(id);
              if (!input) throw new Error("Missing simulation input " + id);
              input.value = value;
              input.dispatchEvent(new globalThis.Event("change", { bubbles: true }));
            }
          });
          await frame.locator(".dps-action").click();
          await frame.waitForFunction(
            () =>
              /\d[\d,]*\.\d+/.test(
                globalThis.document.querySelector(".results-content .topline-result-avg")
                  ?.textContent ?? "",
              ) && !globalThis.document.querySelector(".dps-action")?.disabled,
            null,
            { timeout: 90000 },
          );
          console.log(
            JSON.stringify({
              phase: "production-engine-smoke",
              iterations: 25,
              results: await frame
                .locator(".results-content .topline-result-avg")
                .allTextContents(),
              independentValidation: false,
            }),
          );
        }
      }
      assert(
        await page.evaluate(
          () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1,
        ),
        "Horizontal overflow",
      );
      checked.push({ id: build.id, width: viewport.width });
      console.log(
        JSON.stringify({ phase: "reviewed-build-checked", id: build.id, width: viewport.width }),
      );
    }
    await context.close();
  }
  const privateProof = await globalThis.fetch(
    helperUrl(`/forever-sim/${displayRelease}/kfc-reviewed-presets.json`),
  );
  assert.equal(privateProof.status, 404, "Private proof was exposed");
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      status: "passed",
      origin: origin.origin,
      release: displayRelease,
      checked,
      errors,
    }),
  );
} finally {
  await browser.close();
}
