import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import console from "node:console";
import { startSimulatorLocalServer } from "../infra/simulator/simulator-local-server.mjs";

const root = resolve(import.meta.dirname, ".."),
  base = join(root, "artifacts/forever-simulator/optimization/tank-item-search-v1/browser-models");
const { values } = parseArgs({ options: { release: { type: "string" } }, strict: true });
assert(/^[a-f0-9]{24}$/.test(values.release ?? ""), "Pass --release=<staged browser model>");
const release = values.release,
  directory = join(base, release);
const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
const provenance = JSON.parse(
  await readFile(join(directory, "kfc-tank-browser-research.json"), "utf8"),
);
assert.equal(provenance.status, "research-only-not-optimized-defaults");
assert.equal(provenance.release, release);
assert.equal(manifest.files["lib.wasm"].sha256, provenance.wasmSha256);
const starters = JSON.parse(await readFile(join(directory, "kfc-tank-starters.json"), "utf8"));
const { chromium } = createRequire(join(root, ".cache/forever-sim-upstream/package.json"))(
  "playwright",
);
const server = await startSimulatorLocalServer(base, manifest),
  browser = await chromium.launch(),
  checked = [];
const saved = async (page) => {
  const entries = await page.evaluate(() =>
    Object.values(globalThis.localStorage).flatMap((value) => {
      try {
        const data = JSON.parse(value);
        return data?.player && data?.encounter ? [data] : [];
      } catch {
        return [];
      }
    }),
  );
  assert.equal(entries.length, 1);
  return entries[0];
};
const buttonContrast = async (page) =>
  page.locator(".dps-action").evaluate((button) => {
    const luminance = (value) => {
      const channels = value
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number)
        .map((channel) => {
          const scaled = channel / 255;
          return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
        });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const style = globalThis.getComputedStyle(button);
    const values = [luminance(style.color), luminance(style.backgroundColor)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  });
try {
  for (const profile of ["tank_warrior", "feral_tank_druid", "protection_paladin"])
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route(/^https?:\/\/([^/]+\.)?(zamimg|wowhead)\.com\//, (route) => route.abort());
      await page.addInitScript(() =>
        globalThis.localStorage.setItem("classic_wasmconcurrency", "1"),
      );
      try {
        assert((await page.goto(`${server.origin}/forever-sim/${release}/${profile}/`))?.ok());
        await page.locator(".kfc-slot-label").first().waitFor({ timeout: 60000 });
        if (width < 900) await page.getByRole("button", { name: "Results", exact: true }).click();
        await page.locator(".dps-action").waitFor({ timeout: 60000 });
        await page.locator("#simui-iterations").evaluate((input) => {
          input.value = "100";
          input.dispatchEvent(new globalThis.Event("change", { bubbles: true }));
        });
        if (width < 900) await page.getByRole("button", { name: "Build", exact: true }).click();
        const initial = await saved(page),
          ids = (gear) => gear.items.map((item) => item.id ?? 0);
        assert(
          [starters[profile].gear, starters[profile].hordeGear]
            .filter(Boolean)
            .some(
              (gear) => JSON.stringify(ids(gear)) === JSON.stringify(ids(initial.player.equipment)),
            ),
          "Research preparation changed the starter without an optimization review",
        );
        assert(!initial.player.foreverTier1Bonuses);
        let polearmChanged = false;
        if (profile === "feral_tank_druid") {
          const hand = page
            .locator(".gear-picker-root .item-picker-root")
            .filter({ has: page.locator(".kfc-slot-label", { hasText: /^Main Hand$/ }) });
          await hand.locator(".item-picker-name").click();
          const modal = page.locator(".modal.show .selector-modal");
          await modal.waitFor();
          await modal.locator(".tab-pane.active .selector-modal-search").fill("Blackhand Doomsaw");
          const candidate = modal
            .locator(".selector-modal-list-item-link")
            .filter({ hasText: "Blackhand Doomsaw" })
            .first();
          await candidate.waitFor();
          assert.notEqual(await candidate.getAttribute("aria-disabled"), "true");
          await candidate.click();
          await modal.locator(".modal-header .btn-close:visible").first().click();
          await page.waitForFunction(() =>
            Object.values(globalThis.localStorage).some((value) => {
              try {
                return JSON.parse(value)?.player?.equipment?.items?.[14]?.id === 12583;
              } catch {
                return false;
              }
            }),
          );
          assert.equal((await saved(page)).player.equipment.items[14].id, 12583);
          polearmChanged = true;
        }
        const beforeReload = await saved(page);
        await page.reload();
        await page.locator(".kfc-slot-label").first().waitFor({ timeout: 60000 });
        if (width < 900) await page.getByRole("button", { name: "Results", exact: true }).click();
        await page.locator(".dps-action").waitFor({ timeout: 60000 });
        assert.deepEqual(
          (await saved(page)).player.equipment.items,
          beforeReload.player.equipment.items,
          "Reload replaced the edited character",
        );
        assert.equal((await saved(page)).settings.iterations, 100);
        const contrastBefore = await buttonContrast(page);
        assert(contrastBefore >= 4.5, "Simulation button text lacks contrast");
        await page.locator(".dps-action").click();
        await page.waitForFunction(
          () =>
            /\d[\d,]*\.\d+/.test(
              globalThis.document.querySelector(".results-content .topline-result-avg")
                ?.textContent ?? "",
            ) && !globalThis.document.querySelector(".dps-action")?.disabled,
          null,
          { timeout: 180000 },
        );
        const metrics = await page
          .locator(".results-content .topline-result-avg")
          .allTextContents();
        assert(
          metrics.length > 0 &&
            metrics.every((value) => Number.isFinite(Number(value.replaceAll(",", "")))),
        );
        assert(!/Simulation notice/.test(await page.locator("body").innerText()));
        const contrastAfter = await buttonContrast(page);
        assert(contrastAfter >= 4.5, "Simulation button hover text lacks contrast");
        assert.deepEqual(errors, []);
        assert(
          await page.evaluate(
            () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 2,
          ),
          "Native workspace overflows the viewport",
        );
        await page.screenshot({ path: join(directory, `${profile}-${width}.png`), fullPage: true });
        const row = {
          profile,
          width,
          editedPolearmPersists: polearmChanged,
          iterations: 100,
          realCombat: true,
          metrics,
          contrastBefore,
          contrastAfter,
          pageErrors: errors.length,
        };
        checked.push(row);
        console.log(JSON.stringify(row));
      } finally {
        await context.close();
      }
    }
  for (const profile of ["warrior", "warlock", "raid"]) {
    const response = await globalThis.fetch(`${server.origin}/forever-sim/${release}/${profile}/`);
    assert(response.ok);
    const html = await response.text();
    assert(
      html.includes(`location.replace("/tools/forever/simulator/${profile}")`),
      "Unrelated class must open its approved workspace",
    );
  }
  const receipt = {
    schema: "kfc-tank-browser-engine-review.v1",
    status: "passed",
    scope: "research-engine-and-picker",
    release,
    engine: provenance.engine,
    wasmSha256: provenance.wasmSha256,
    checked,
    optimizedDefaultsQualified: false,
    pointerWrites: 0,
  };
  await writeFile(join(directory, "browser-review.json"), JSON.stringify(receipt, null, 2) + "\n");
} finally {
  await browser.close();
  await server.close();
}
