import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import process from "node:process";
import console from "node:console";
import { URL } from "node:url";
import { assertProcConsentDisabled } from "./review-prebis-browser.mjs";

assert.equal(process.argv.length, 2, "This loopback-only workspace smoke accepts no arguments");
const root = resolve(import.meta.dirname, "..");
const directory = "artifacts/forever-simulator/optimization/";
const read = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const origin = new URL(process.env.SIMULATOR_TEST_URL ?? "http://localhost:3017");
assert(
  origin.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) &&
    !origin.username &&
    !origin.password &&
    origin.pathname === "/" &&
    !origin.search &&
    !origin.hash,
  "Never import research builds into a remote browser installation",
);
const latest = await read(directory + "campaigns/latest.json");
assert(/^[a-f0-9]{64}$/.test(latest.identity));
const state = await read(directory + "campaigns/" + latest.identity + "/state.json");
assert.equal(state.identity, latest.identity);
const entries = Object.values(state.cases).filter(
  (entry) => entry.status === "reviewed-local" && entry.entry.spec.startsWith("warrior/"),
);
for (const id of ["arms-alliance", "arms-alliance-procs"])
  assert(
    entries.some((entry) => entry.entry.id === id),
    "Both Arms cases must be reviewed",
  );
const names = await readdir(join(root, directory, "share-links"));
assert(names.length <= 256);
const shares = await Promise.all(
  names
    .filter((name) => /^[a-z][a-z0-9-]*-[a-f0-9]{16}\.json$/.test(name))
    .map(async (name) => {
      const share = await read(directory + "share-links/" + name);
      assert.equal(name, share.caseId + "-" + hash(share).slice(0, 16) + ".json");
      return share;
    }),
);
const builds = await Promise.all(
  entries.map(async (entry) => {
    const share = shares.find(
      (value) =>
        value.caseId === entry.entry.id &&
        value.status === "reviewed-local" &&
        value.campaignIdentity === state.identity &&
        hash(value.campaignFinal) === hash(entry.final),
    );
    assert(share, "Missing exact final share receipt");
    const baseline = await read(share.baseline.path);
    assert.equal(hash(baseline), share.baseline.sha256);
    return { id: entry.entry.id, share, baseline };
  }),
);
const sourcePaths = [
  "apps/web/src/components/forever-simulator-reviewed-workspace.tsx",
  "apps/web/src/components/forever-simulator-frame.tsx",
  "apps/web/src/lib/forever-simulator-frame-state.ts",
  "apps/web/src/app/forever/simulator/[slug]/page.tsx",
  "apps/web/src/lib/forever-simulator-local-reviews.ts",
  "apps/web/src/app/globals.css",
  "scripts/review-prebis-workspace.mjs",
  "scripts/review-prebis-browser.mjs",
];
const fingerprints = await Promise.all(
  sourcePaths.map(async (path) => ({
    path,
    byteSha256: createHash("sha256")
      .update(await readFile(join(root, path)))
      .digest("hex"),
  })),
);
const { chromium } = createRequire(join(root, ".cache/forever-sim-upstream/package.json"))(
  "playwright",
);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const layouts = [],
  imports = [],
  errors = [];
const combat = (settings) =>
  Object.fromEntries(
    ["player", "encounter", "raidBuffs", "partyBuffs", "debuffs", "tanks", "targetDummies"]
      .filter((key) => settings[key] !== undefined)
      .map((key) => [key, settings[key]]),
  );

async function readyFrame(page) {
  await page
    .frameLocator(".forever-simulator-frame iframe")
    .locator('.sim-ui[data-kfc-initialized="true"]')
    .waitFor({ timeout: 90000 });
  await page.locator(".simulator-loading").waitFor({ state: "hidden", timeout: 15000 });
  const handle = await page.locator(".forever-simulator-frame iframe").elementHandle();
  const frame = await handle.contentFrame();
  await handle.dispose();
  assert(frame);
  return frame;
}

try {
  for (const [width, height] of [
    [1440, 1000],
    [390, 844],
  ]) {
    const context = await browser.newContext({ viewport: { width, height } });
    await context.addInitScript(() => {
      // Child-frame initialization can run on about:blank; instrument workers without accessing opaque storage.
      if (
        globalThis.location.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(globalThis.location.hostname)
      )
        globalThis.localStorage.setItem("classic_wasmconcurrency", "1");
      globalThis.__kfcNoCombatRequests = 0;
      const post = globalThis.Worker.prototype.postMessage;
      globalThis.Worker.prototype.postMessage = function (message, ...rest) {
        if (
          ["raidSim", "raidSimAsync", "raidSimJson", "statWeights", "statWeightsAsync"].includes(
            message.msg,
          )
        ) {
          globalThis.__kfcNoCombatRequests++;
          throw new Error("Workspace import smoke refuses combat requests");
        }
        return post.call(this, message, ...rest);
      };
    });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.on("pageerror", (error) => errors.push(error.message));
      const response = await page.goto(new URL("forever/simulator/warrior", origin).href, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      assert.equal(response.status(), 200);
      await readyFrame(page);
      const library = page.getByRole("region", { name: "Reviewed pre-raid builds" });
      const select = library.getByRole("combobox", { name: "Choose a build" });
      assert.equal(await select.locator("option").count(), builds.length);
      const savedSrc = await page.locator(".forever-simulator-frame iframe").getAttribute("src");
      assert(!savedSrc.includes("#"), "Visiting the page must not silently import a build");
      for (const build of builds) {
        await select.selectOption(build.id);
        assert.equal(
          await page.locator(".forever-simulator-frame iframe").getAttribute("src"),
          savedSrc,
          "Choosing without Load must preserve the current character",
        );
      }
      const initialOptions = await select.locator("option").allTextContents();
      assert(initialOptions.some((label) => label.includes("Arms · Alliance · Standard enchants")));
      assert(
        initialOptions.some((label) =>
          label.includes("Arms · Alliance · Provisional proc enchants"),
        ),
      );
      const selectedBuilds =
        width === 1440 ? builds : builds.filter((build) => build.id === "arms-alliance");
      for (const build of selectedBuilds) {
        await select.selectOption(build.id);
        if (build.share.requiresProvisionalEnchantOptIn)
          assert((await library.textContent()).includes("Provisional proc models remain OFF"));
        const previous = await page.locator(".forever-simulator-frame iframe").elementHandle();
        await library.getByRole("button", { name: "Load build", exact: true }).click();
        await page.waitForFunction((element) => !element.isConnected, previous);
        await previous.dispose();
        const frame = await readyFrame(page);
        assert.equal(
          new URL(await page.locator(".forever-simulator-frame iframe").getAttribute("src"), origin)
            .href,
          new URL(new URL(build.share.link).pathname + new URL(build.share.link).hash, origin).href,
        );
        const settings = await frame.evaluate(() =>
          Object.keys(globalThis.localStorage)
            .filter((key) => key.endsWith("__currentSettings__"))
            .map((key) => JSON.parse(globalThis.localStorage.getItem(key)))
            .find((value) => value.player?.equipment),
        );
        assert.deepEqual(combat(settings), combat(build.baseline.settings));
        assert.equal(hash(combat(settings)), build.share.combatSettingsSha256);
        try {
          await assertProcConsentDisabled(frame);
        } catch (error) {
          console.error(
            JSON.stringify({
              consentDialogFailure: await page.evaluate(() => {
                const iframe = globalThis.document.querySelector(".forever-simulator-frame iframe");
                const close = iframe.contentDocument.querySelector(
                  ".modal.show .modal-header .btn-close",
                );
                return {
                  scrollY: globalThis.scrollY,
                  iframe: iframe.getBoundingClientRect().toJSON(),
                  header: globalThis.document
                    .querySelector(".site-header")
                    .getBoundingClientRect()
                    .toJSON(),
                  close: close?.getBoundingClientRect().toJSON(),
                  innerScrollY: iframe.contentWindow.scrollY,
                };
              }),
            }),
          );
          await page.screenshot({
            path: join(root, directory, "reviews/warrior-workspace-dialog-failure.png"),
            fullPage: true,
          });
          throw error;
        }
        assert.equal(
          await frame.evaluate(() => globalThis.localStorage.getItem("classic_wasmconcurrency")),
          "1",
        );
        assert.equal(await frame.evaluate(() => globalThis.__kfcNoCombatRequests), 0);
        imports.push({
          width,
          caseId: build.id,
          fullCombatSettingsMatch: true,
          consentEnabled: false,
          combatRequests: 0,
        });
        console.log(
          JSON.stringify({
            imported: build.id,
            width,
            fullSettingsMatch: true,
            consentEnabled: false,
          }),
        );
      }
      const size = await page.evaluate(() => ({
        viewport: globalThis.innerWidth,
        scroll: globalThis.document.documentElement.scrollWidth,
      }));
      assert(size.scroll <= size.viewport, "No horizontal page overflow");
      await page.screenshot({
        path: join(root, directory, "reviews/warrior-reviewed-workspace-" + width + ".png"),
        fullPage: true,
      });
      layouts.push({
        width,
        height,
        status: response.status(),
        buildOptions: builds.length,
        overflow: false,
      });
    } finally {
      await context.close();
    }
  }
  assert.deepEqual(errors, []);
  for (const file of fingerprints)
    assert.equal(
      createHash("sha256")
        .update(await readFile(join(root, file.path)))
        .digest("hex"),
      file.byteSha256,
    );
} finally {
  await browser.close();
}
const report = {
  schema: "kfc-reviewed-build-class-workspace-smoke.v1",
  status: "passed",
  campaignIdentity: state.identity,
  scope:
    "Actual Warrior wrapper, reviewed-build selector, explicit full-settings imports and consent-OFF on desktop/mobile; no combat, native build, default promotion or production deployment.",
  fingerprints,
  layouts,
  imports,
  errors,
  noAutomaticImport: true,
};
console.log(JSON.stringify({ report, sha256: hash(report) }));
