import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import console from "node:console";
import { assertSimulatorWorkspaceAccess } from "../infra/simulator/simulator-workspace.mjs";

const root = resolve(import.meta.dirname, "..");
await assertSimulatorWorkspaceAccess(root);
const directory = join(root, "artifacts/forever-simulator");
const manifest = JSON.parse(await readFile(join(directory, "active.json"), "utf8"));
const defaults = JSON.parse(
  await readFile(join(directory, manifest.release, "kfc-default-enchants.json"), "utf8"),
);
const require = createRequire(join(root, ".cache/forever-sim-upstream/package.json"));
const { chromium } = require("playwright");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const profiles = [];
try {
  for (const preset of defaults.presets.filter(
    (entry) => !["alliance", "horde"].includes(entry.variant),
  )) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.addInitScript(() => {
        globalThis.localStorage.setItem("classic_wasmconcurrency", "1");
        globalThis.__prebisRequests = [];
        const original = globalThis.Worker.prototype.postMessage;
        globalThis.Worker.prototype.postMessage = function (message, ...rest) {
          if (["raidSim", "raidSimAsync"].includes(message.msg))
            globalThis.__prebisRequests.push(Array.from(message.inputData));
          return original.call(this, message, ...rest);
        };
      });
      const response = await page.goto(
        `${process.env.SIMULATOR_TEST_URL || "http://localhost:3017"}/forever-sim/${manifest.release}/${preset.profile}/`,
      );
      assert(response?.ok(), `HTTP ${response?.status()}`);
      await page.locator('.sim-ui[data-kfc-initialized="true"]').waitFor({ timeout: 60000 });
      const build = page
        .locator(".preset-configuration-picker-root .saved-data-set-name")
        .filter({ hasText: new RegExp(`^${preset.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) });
      assert(
        (await build.count()) >= 1,
        `${preset.profile}/${preset.variant}: matching full build`,
      );
      await build.locator("visible=true").first().click();
      await page.evaluate(() => {
        for (const [id, value] of [
          ["simui-fixed-rng-seed", "1337"],
          ["simui-iterations", "1"],
        ]) {
          const input = globalThis.document.getElementById(id);
          input.value = value;
          input.dispatchEvent(new globalThis.Event("change", { bubbles: true }));
        }
      });
      await page.locator(".dps-action").click();
      await page.waitForFunction(() => globalThis.__prebisRequests.length > 0, null, {
        timeout: 60000,
      });
      const captured = await page.evaluate(() => ({
        bytes: globalThis.__prebisRequests.at(-1),
        settings: Object.keys(globalThis.localStorage)
          .filter((key) => key.endsWith("__currentSettings__"))
          .map((key) => JSON.parse(globalThis.localStorage.getItem(key)))
          .find((value) => value.player?.equipment),
      }));
      profiles.push({
        profile: preset.profile,
        variant: preset.variant,
        name: preset.name,
        playerClass: preset.playerClass,
        requestBase64: Buffer.from(captured.bytes).toString("base64"),
        settings: captured.settings,
      });
      console.log(
        `Captured ${preset.profile}/${preset.variant}: matching gear, talents, rotation and options`,
      );
    } finally {
      await context.close();
    }
  }
  assert.equal(profiles.length, 23);
  await mkdir(join(directory, "optimization"), { recursive: true });
  await writeFile(
    join(directory, "optimization/requests.json"),
    JSON.stringify(
      { sourceRelease: manifest.release, revision: manifest.revision, profiles },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
