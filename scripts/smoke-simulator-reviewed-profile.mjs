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
import { loadSimulatorBuildSettingsCodec } from "../artifacts/forever-simulator/optimization/review-tools/simulator-build-settings-codec.mjs";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
assert.equal(args.length, 1, "Supply --profile=<published profile>");
assert(/^--profile=[a-z][a-z_]*$/.test(args[0]));
const profile = args[0].slice("--profile=".length);
const base = new URL(process.env.SIMULATOR_TEST_URL ?? "https://kfcguild.online/tools");
assert(["http:", "https:"].includes(base.protocol));
assert(!base.username && !base.password && !base.search && !base.hash);
const mount = base.pathname.replace(/\/$/, "");
assert(mount === "" || mount === "/tools");
const storage = join(root, "artifacts/forever-simulator");
const pointer = JSON.parse(await readFile(join(storage, "published-reviews.json"), "utf8"));
const reference = pointer.profiles[profile];
assert(
  reference &&
    new RegExp("^published-reviews/" + profile + "-[a-f0-9]{16}\\.json$").test(reference.path),
);
const publication = JSON.parse(await readFile(join(storage, reference.path), "utf8"));
assert.equal(
  createHash("sha256").update(JSON.stringify(publication)).digest("hex"),
  reference.sha256,
);
assert.equal(publication.profile, profile);
const require = createRequire(join(root, ".cache/forever-sim-upstream/package.json"));
const esbuild = require("esbuild");
let compiled;
try {
  compiled = await esbuild.build({
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
const api = await import(
  "data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].contents).toString("base64")
);
const codec = await loadSimulatorBuildSettingsCodec(root);
const browser = await require("playwright").chromium.launch();
const errors = [],
  checks = [];

async function ready(page) {
  const handle = await page.locator(".forever-simulator-frame iframe").elementHandle();
  assert(handle);
  const frame = await handle.contentFrame();
  assert(frame);
  await frame.locator('.sim-ui[data-kfc-initialized="true"]').waitFor({ timeout: 90000 });
  await page.locator(".simulator-loading").waitFor({ state: "hidden", timeout: 15000 });
  return frame;
}
async function saved(frame) {
  return frame.evaluate(() => {
    const keys = Object.keys(globalThis.localStorage).filter((key) =>
      key.endsWith("__currentSettings__"),
    );
    if (keys.length !== 1) throw new Error("Expected one isolated simulator character");
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
    page.setDefaultTimeout(30000);
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400 && new URL(response.url()).pathname.includes("/forever-sim/"))
        errors.push("Simulator asset HTTP " + response.status() + ": " + response.url());
    });
    await page.addInitScript(() => {
      globalThis.localStorage.setItem("classic_wasmconcurrency", "1");
      globalThis.__kfcReviewedCombatRequests = 0;
      const post = globalThis.Worker.prototype.postMessage;
      globalThis.Worker.prototype.postMessage = function (message, ...rest) {
        if (["raidSim", "raidSimAsync"].includes(message.msg))
          globalThis.__kfcReviewedCombatRequests++;
        return post.call(this, message, ...rest);
      };
    });
    assert((await page.goto(new URL(mount + "/forever/simulator/" + profile, base).href))?.ok());
    await ready(page);
    const selector = page.getByLabel("Choose a build");
    assert.equal(await selector.locator("option").count(), publication.builds.length);
    for (const build of publication.builds) {
      assert(
        typeof build.displayName === "string" && build.displayName.length > 0,
        "Preset smoke requires a named reviewed build",
      );
      await selector.selectOption(build.id);
      const referenceText = await page.locator(".simulator-reviewed-reference").innerText();
      assert(referenceText.includes(build.referenceDps.toFixed(2) + " modeled DPS"));
      assert(referenceText.includes(build.validationIterations.toLocaleString("en-US")));
      if (build.rotationGuidance) {
        const guide = page.locator(".simulator-reviewed-rotation");
        await guide.locator("summary").click();
        const readable = (text) => text.replace(/([A-Za-z,])(\d)/g, "$1 $2");
        assert.deepEqual(
          await guide.locator("ol li").allTextContents(),
          build.rotationGuidance.priorities.map(readable),
        );
        if (build.rotationGuidance.instruction)
          assert((await guide.innerText()).includes(readable(build.rotationGuidance.instruction)));
      }
      await page.getByRole("button", { name: "Load build", exact: true }).click();
      await page.waitForFunction((release) => {
        const src =
          globalThis.document
            .querySelector(".forever-simulator-frame iframe")
            ?.getAttribute("src") ?? "";
        return src.includes(release) && src.includes("#");
      }, publication.presentationRelease);
      let frame = await ready(page);
      const url = new URL(build.href, base);
      const expected = api.IndividualSimSettings.toJson(
        api.IndividualSimSettings.fromBinary(inflateSync(Buffer.from(url.hash.slice(1), "base64"))),
      );
      assert.deepEqual(codec.normalize(await saved(frame)), codec.normalize(expected));
      assert.equal(await frame.evaluate(() => globalThis.__kfcReviewedCombatRequests), 0);
      await assertProcConsentDisabled(frame);
      const configuration = frame.locator(".preset-configuration-picker-root:visible").first();
      if (viewport.width <= 400)
        await frame.getByRole("button", { name: "Build", exact: true }).click();
      await configuration.getByText(build.displayName, { exact: true }).click();
      assert.deepEqual(codec.normalize(await saved(frame)), codec.normalize(expected));
      const sets = frame
        .locator(".saved-data-manager-root:visible")
        .filter({ hasText: /^Gear Sets/ });
      assert.equal(await sets.getByText(build.displayName, { exact: true }).count(), 1);
      await page.reload();
      frame = await ready(page);
      assert.deepEqual(codec.normalize(await saved(frame)), codec.normalize(expected));
      await assertProcConsentDisabled(frame);
      assert(
        await page.evaluate(
          () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1,
        ),
      );
      let combat = null;
      if (viewport.width > 400 && process.env.SIMULATOR_SMOKE_COMBAT === "1") {
        await frame.locator("#simui-iterations").fill("25");
        await frame.locator("#simui-iterations").dispatchEvent("change");
        await frame.locator(".dps-action").click();
        await frame.waitForFunction(
          () =>
            !globalThis.document.querySelector(".dps-action")?.disabled &&
            /\d[\d,]*\.\d+/.test(
              globalThis.document.querySelector(".results-content .topline-result-avg")
                ?.textContent ?? "",
            ),
          null,
          { timeout: 90000 },
        );
        combat = {
          iterations: 25,
          displayedResult: await frame
            .locator(".results-content .topline-result-avg")
            .first()
            .innerText(),
        };
      }
      checks.push({
        viewport,
        caseId: build.id,
        fullSettingsPreserved: true,
        presetsAndGearPresent: true,
        consentOff: true,
        combat,
      });
    }
    await context.close();
  }
  const privateProof = await browser.newContext();
  try {
    const response = await privateProof.request.get(
      new URL(
        mount + "/forever-sim/" + publication.presentationRelease + "/kfc-reviewed-presets.json",
        base,
      ).href,
    );
    assert.equal(response.status(), 404, "Private preset proof must not be publicly served");
  } finally {
    await privateProof.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      status: "passed",
      origin: base.href,
      profile,
      presentationRelease: publication.presentationRelease,
      checks,
      errors,
      independentOptimizationValidation: false,
    }),
  );
} finally {
  await browser.close();
}
