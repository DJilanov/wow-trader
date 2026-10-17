import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import process from "node:process";
import console from "node:console";
import { SIMULATOR_SPECS } from "../packages/forever-data/dist/simulator.js";
import { tankStarterTalents } from "../infra/simulator/tank-starters-adapter.mjs";

const root = resolve(import.meta.dirname, "..");
const { chromium } = createRequire(join(root, ".cache/forever-sim-upstream/package.json"))(
  "playwright",
);
const origin = process.env.SIMULATOR_TEST_URL ?? "http://localhost:3017";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

async function ready(page) {
  await page
    .frameLocator("iframe")
    .locator('.sim-ui[data-kfc-initialized="true"]')
    .waitFor({ timeout: 60000 });
  await page.locator(".simulator-loading").waitFor({ state: "hidden", timeout: 15000 });
}

async function settings(page) {
  return page.evaluate(() => {
    const key = Object.keys(globalThis.localStorage).find((key) =>
      key.endsWith("__currentSettings__"),
    );
    if (!key) throw new Error("Initial character was not persisted");
    return { key, value: JSON.parse(globalThis.localStorage.getItem(key)) };
  });
}

try {
  for (const spec of SIMULATOR_SPECS.filter((spec) => spec.role !== "raid")) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.goto(`${origin}/forever/simulator/${spec.slug}`, {
        waitUntil: "domcontentloaded",
      });
      await ready(page);
      const initial = await settings(page);
      assert(
        initial.value.player.equipment.items.filter((item) => item.id).length >= 14,
        `${spec.slug}: empty starter`,
      );
      assert(
        initial.value.player.equipment.items.some((item) => item.enchant),
        `${spec.slug}: no starter enchants`,
      );
      assert(initial.value.player.talentsString, `${spec.slug}: no starter talents`);
      assert.equal(
        initial.value.player.foreverTier1Bonuses ?? false,
        false,
        `${spec.slug}: pre-raid defaults must not receive free raid set bonuses`,
      );
      if (tankStarterTalents[spec.page])
        assert.equal(
          initial.value.player.talentsString,
          tankStarterTalents[spec.page].talentsString,
        );
      const frame = page.frameLocator("iframe");
      assert.equal(await frame.locator(".kfc-workspace-tools").count(), 0);
      assert.equal(
        await frame
          .locator('.kfc-workspace-heading a[href^="http"], .sim-sidebar-footer a[href^="http"]')
          .evaluateAll(
            (links) =>
              links.filter(
                (link) => new globalThis.URL(link.href).origin !== globalThis.location.origin,
              ).length,
          ),
        0,
      );
      if (spec.page === "tank_warrior") {
        await frame.getByRole("link", { name: "Simulation options", exact: true }).click();
        await frame.locator(".modal.show .settings-menu").waitFor();
        await frame.locator(".modal.show .btn-close").first().click();
      }
      await page.reload({ waitUntil: "domcontentloaded" });
      await ready(page);
      const restored = await settings(page);
      assert.deepEqual(restored.value.player.equipment, initial.value.player.equipment);
      assert.equal(restored.value.player.talentsString, initial.value.player.talentsString);
      assert.deepEqual(errors, [], `${spec.slug}: browser errors`);
      console.log(
        `PASS ${spec.slug}: first-visit loadout, enchants, talents and reload persistence`,
      );

      if (spec.page === "tank_warrior") {
        const marker = initial.key + "_kfc-starter-initialized-v1";
        const legacy = globalThis.structuredClone(initial.value);
        legacy.player.equipment.items = Array.from({ length: 17 }, () => ({}));
        const original = JSON.stringify(legacy);
        await page.evaluate(
          ({ key, marker, original }) => {
            globalThis.localStorage.setItem(key, original);
            globalThis.localStorage.removeItem(marker);
          },
          { key: initial.key, marker, original },
        );
        await page.reload({ waitUntil: "domcontentloaded" });
        await ready(page);
        const repaired = await settings(page);
        assert.deepEqual(repaired.value.player.equipment, initial.value.player.equipment);
        assert.equal(
          await page.evaluate((key) => globalThis.localStorage.getItem(key), marker + "_backup"),
          original,
        );

        await page.evaluate(({ key, original }) => globalThis.localStorage.setItem(key, original), {
          key: initial.key,
          original,
        });
        await page.reload({ waitUntil: "domcontentloaded" });
        await ready(page);
        assert.equal(
          (await settings(page)).value.player.equipment.items.filter((item) => item.id).length,
          0,
          "deliberate empty build was overwritten",
        );

        const custom = globalThis.structuredClone(initial.value);
        custom.player.equipment.items = custom.player.equipment.items.map((item, index) =>
          index === 0 ? { id: item.id } : {},
        );
        custom.player.talentsString = "35-05";
        await page.evaluate(
          ({ key, marker, custom }) => {
            globalThis.localStorage.setItem(key, JSON.stringify(custom));
            globalThis.localStorage.removeItem(marker);
          },
          { key: initial.key, marker, custom },
        );
        await page.reload({ waitUntil: "domcontentloaded" });
        await ready(page);
        const preserved = await settings(page);
        assert.equal(preserved.value.player.equipment.items.filter((item) => item.id).length, 1);
        assert.equal(preserved.value.player.equipment.items[0].enchant ?? 0, 0);
        assert.equal(preserved.value.player.talentsString, "35-05");
        console.log(
          "PASS legacy empty recovery with exact backup; custom, removed enchants and deliberate empty builds preserved",
        );
      }
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
