import assert from "node:assert/strict";
import console from "node:console";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import process from "node:process";
import { SIMULATOR_SPECS } from "../packages/forever-data/dist/simulator.js";

const root = resolve(import.meta.dirname, ".."),
  { chromium } = createRequire(root + "/.cache/forever-sim-upstream/package.json")("playwright"),
  base = (process.env.SIMULATOR_TEST_URL ?? "http://localhost:3017/tools").replace(/\/$/, ""),
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }),
  checked = [];

async function ready(page) {
  await page
    .frameLocator("iframe")
    .locator('.sim-ui[data-kfc-initialized="true"]')
    .waitFor({ timeout: 60000 });
  await page.locator(".simulator-loading").waitFor({ state: "hidden", timeout: 15000 });
}

async function reloadEngine(page) {
  const element = await page.locator("iframe").elementHandle(),
    engine = await element.contentFrame(),
    navigation = page.waitForEvent("framenavigated", { predicate: (frame) => frame === engine });
  await page.locator("iframe").evaluate((iframe) => iframe.contentWindow.location.reload());
  await navigation;
  await ready(page);
}

async function current(page) {
  return page.evaluate(() => {
    const entries = Object.entries(globalThis.localStorage).filter(([key]) =>
      key.endsWith("__currentSettings__"),
    );
    if (entries.length !== 1) throw Error("Expected one current character");
    return { key: entries[0][0], value: JSON.parse(entries[0][1]) };
  });
}

function core(settings) {
  assert.equal(settings.raidBuffs.moonkinAura, true);
  assert.equal(settings.raidBuffs.leaderOfThePack, true);
  assert.equal(settings.raidBuffs.trueshotAura, true);
  for (const field of [
    "battleShout",
    "strengthOfEarthTotem",
    "graceOfAirTotem",
    "giftOfTheWild",
    "powerWordFortitude",
    "manaSpringTotem",
    "devotionAura",
    "stoneskinTotem",
    "thorns",
    "retributionAura",
  ])
    assert.equal(settings.raidBuffs[field], "TristateEffectImproved", field);
  for (const field of [
    "arcaneBrilliance",
    "divineSpirit",
    "shadowProtection",
    "natureResistanceTotem",
    "fireResistanceAura",
    "frostResistanceAura",
  ])
    assert.equal(settings.raidBuffs[field], true, field);
  assert.equal(settings.raidBuffs.bloodPact, "TristateEffectRegular");
  assert.equal(settings.player.buffs.blessingOfKings, true);
  for (const field of ["blessingOfMight", "blessingOfWisdom"])
    assert.equal(settings.player.buffs[field], "TristateEffectImproved", field);
  assert.equal(settings.partyBuffs.windfuryTotem, true);
  assert.equal(settings.partyBuffs.flametongueTotem ?? false, false);
}

try {
  for (const width of [1440, 390]) {
    for (const spec of SIMULATOR_SPECS.filter((entry) => entry.role !== "raid")) {
      const context = await browser.newContext({ viewport: { width, height: 1000 } }),
        page = await context.newPage(),
        errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      try {
        await page.addInitScript(() =>
          globalThis.localStorage.setItem("classic_wasmconcurrency", "1"),
        );
        await page.goto(`${base}/forever/simulator/${spec.slug}`, {
          waitUntil: "domcontentloaded",
        });
        await ready(page);
        core((await current(page)).value);
        const frame = page.frameLocator("iframe");
        assert.match(await page.locator("iframe").getAttribute("src"), /raidDefaults=full-v2/);
        const presets = frame.locator(".preset-configuration-picker-root .saved-data-set-name");
        let configurations = 0;
        for (let index = 0; index < (await presets.count()); index++) {
          const preset = presets.nth(index);
          if (!(await preset.isVisible()) || (await preset.locator("..").isDisabled())) continue;
          await preset.click();
          core((await current(page)).value);
          configurations++;
        }
        await reloadEngine(page);
        const before = await current(page);
        core(before.value);
        const optedOut = globalThis.structuredClone(before.value);
        optedOut.raidBuffs.trueshotAura = false;
        delete optedOut.raidBuffs.moonkinAura;
        optedOut.raidBuffs.strengthOfEarthTotem = "TristateEffectRegular";
        optedOut.player.buffs.blessingOfKings = false;
        await page.evaluate(
          ({ key, value }) => globalThis.localStorage.setItem(key, JSON.stringify(value)),
          {
            key: before.key,
            value: optedOut,
          },
        );
        await reloadEngine(page);
        const restored = (await current(page)).value;
        assert.equal(restored.raidBuffs.trueshotAura ?? false, false, "Manual opt-out overwritten");
        assert.equal(restored.raidBuffs.moonkinAura ?? false, false);
        assert.equal(restored.raidBuffs.strengthOfEarthTotem, "TristateEffectRegular");
        assert.equal(restored.player.buffs.blessingOfKings ?? false, false);
        assert.deepEqual(restored.player.equipment, optedOut.player.equipment);
        assert.equal(restored.player.talentsString, optedOut.player.talentsString);
        // Simulate an existing browser before the one-time baseline rollout.
        await page.evaluate((key) => {
          globalThis.localStorage.removeItem(key + "_kfc-raid-defaults-full-v2");
          globalThis.localStorage.setItem(key + "_kfc-raid-defaults-core-v1", "1");
        }, before.key);
        await reloadEngine(page);
        const migrated = (await current(page)).value;
        core(migrated);
        assert.deepEqual({ ...migrated.player, buffs: {} }, { ...optedOut.player, buffs: {} });
        assert.deepEqual(migrated.debuffs, optedOut.debuffs);
        assert.deepEqual(migrated.encounter, optedOut.encounter);
        if (spec.page === "warrior") {
          // The historical full benchmark intentionally retains its measured buff setup.
          await page.getByRole("button", { name: "Load build", exact: true }).click();
          await ready(page);
          assert.equal((await current(page)).value.raidBuffs.trueshotAura ?? false, false);
        }
        assert.deepEqual(errors, [], `${spec.slug}: browser errors`);
        checked.push({
          profile: spec.page,
          width,
          configurations,
          defaults: true,
          improvedTotems: true,
          kings: true,
          reload: true,
          optOut: true,
          migration: true,
        });
        console.log(
          `PASS ${spec.slug} ${width}px: full improved raid buffs and Kings, ${configurations} configurations, reload, opt-out, migration`,
        );
      } finally {
        await context.close();
      }
    }
  }
  const report = { status: "passed", version: "full-v2", base, checked };
  if (process.env.SIMULATOR_SMOKE_REPORT)
    await writeFile(process.env.SIMULATOR_SMOKE_REPORT, JSON.stringify(report, null, 2) + "\n", {
      flag: "wx",
    });
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
