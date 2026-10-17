import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import console from "node:console";
import { mergeCurrentPrebisRecovery } from "../infra/simulator/current-prebis-admission.mjs";

const root = resolve(import.meta.dirname, "..");
const { chromium } = createRequire(join(root, ".cache/forever-sim-upstream/package.json"))(
  "playwright",
);
const origin = process.env.SIMULATOR_TEST_URL ?? "http://localhost:3017";
const manifest = JSON.parse(
  await readFile(join(root, "artifacts/forever-simulator/active.json"), "utf8"),
);
const release = process.env.SIMULATOR_TEST_RELEASE ?? manifest.release;
const url = (path) => `${origin}/forever-sim/${release}/${path}`;
const json = async (path) => {
  const response = await globalThis.fetch(url(path));
  assert(response.ok, `${path}: HTTP ${response.status}`);
  return response.json();
};
const [db, imported, inspection] = await Promise.all([
  json("assets/database/db.json"),
  json("kfc-prebis-import.json"),
  json("kfc-inspection.json"),
]);
assert(imported.items.length > 600);
const byId = new Map(db.items.map((item) => [item.id, item]));
assert.deepEqual(
  [...new Set(imported.items.map((item) => byId.get(item.id)?.type))].sort((a, b) => a - b),
  Array.from({ length: 14 }, (_, i) => i + 1),
);
for (const entry of imported.items)
  assert.equal(inspection.items[entry.id].provenance, "classic-provisional");
const recovered = imported.currentItems ?? [];
if (recovered.length) {
  const review = JSON.parse(
    await readFile(join(root, "infra/simulator/current-prebis-equipment.json"), "utf8"),
  );
  const expected = mergeCurrentPrebisRecovery({ items: [] }, review, review);
  assert.deepEqual(recovered, expected.currentItems);
  for (const item of expected.equipment.items) {
    assert.deepEqual(byId.get(item.id), item, `Compiled current item changed: ${item.id}`);
    const metadata = inspection.items[item.id];
    const source = recovered.find((entry) => entry.id === item.id);
    assert.equal(metadata.provenance, source.status);
    assert.equal(metadata.provenanceNote, source.note);
    assert.equal(metadata.requiredLevel, source.requiredLevel);
    assert.equal(metadata.setId, source.setId);
    assert.equal(metadata.limitCategory, source.limitCategory);
  }
  for (const { id } of review.blocked)
    assert(!byId.has(id), `Blocked current item admitted: ${id}`);
  console.log(
    `PASS recovered catalog: all ${recovered.length} compiled items and source metadata match the review exactly`,
  );
}
for (const id of [17182, 19019, 19364, 18832, 16963, 21329])
  assert(!byId.has(id), `Raid item ${id} was admitted`);
assert.equal(byId.get(13001).stats[5], 18, "Current Forever stats must win");
console.log(
  `PASS published catalog: ${db.items.length} items, ${imported.items.length} provisional references, all 14 types, no sampled raid IDs`,
);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  for (const [profile, choices] of [
    [
      "warrior",
      [
        ["Shoulders", 12927],
        ["Main Hand", 12590],
        ["Trinket 1", 11815],
        ["Trinket 2", 13965],
      ],
    ],
    [
      "warlock",
      [
        ["Trinket 1", 12930],
        ["Trinket 2", 13968],
        ...(recovered.length
          ? [
              ["Wrist", 13107],
              ["Back", 10776],
            ]
          : []),
      ],
    ],
    ["feral_druid", [["Ranged", 22397]]],
    ...(recovered.length
      ? [
          [
            "rogue",
            [
              ["Chest", 23298],
              ["Shoulders", 23313],
            ],
          ],
          ["hunter", [["Wrist", 16681]]],
        ]
      : []),
  ]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => globalThis.localStorage.setItem("classic_wasmconcurrency", "1"));
    await page.goto(url(profile + "/"), { waitUntil: "domcontentloaded" });
    await page.locator('.sim-ui[data-kfc-initialized="true"]').waitFor({ timeout: 60000 });
    if (profile === "rogue") {
      await page.evaluate(() => {
        const key = Object.keys(globalThis.localStorage).find((key) =>
          key.endsWith("__currentSettings__"),
        );
        const settings = JSON.parse(globalThis.localStorage.getItem(key));
        settings.player.race = "RaceHuman";
        settings.settings.faction = "Alliance";
        globalThis.localStorage.setItem(key, JSON.stringify(settings));
      });
      await page.reload();
      await page.locator('.sim-ui[data-kfc-initialized="true"]').waitFor({ timeout: 60000 });
    }
    for (const [label, id] of choices) {
      const card = page
        .locator(".gear-picker-root .item-picker-root")
        .filter({ has: page.locator(".kfc-slot-label", { hasText: new RegExp(`^${label}$`) }) });
      await card.locator(".item-picker-name").click();
      const modal = page.locator(".modal.show .selector-modal");
      await modal.waitFor();
      await modal.locator(".tab-pane.active .selector-modal-search").fill(byId.get(id).name);
      const candidate = modal
        .locator(".selector-modal-list-item-link")
        .filter({ hasText: byId.get(id).name });
      await candidate.first().waitFor({ timeout: 15000 });
      if (
        ["classic-provisional", "current-client-historical-acquisition"].includes(
          inspection.items[id].provenance,
        )
      ) {
        await candidate.first().hover();
        await page.locator("[role=tooltip] .kfc-item-tooltip").waitFor();
        const tooltip = await page.locator("[role=tooltip] .kfc-item-tooltip").innerText();
        assert.match(
          tooltip,
          inspection.items[id].provenance === "classic-provisional"
            ? /Provisional Classic reference/
            : /Current-client stats · provisional acquisition/,
        );
        if (id === 10776) assert.match(tooltip, /Root\/snare-duration reduction is not simulated/);
        if ([23298, 23313].includes(id))
          assert.match(tooltip, /Gouge cooldown reduction is not simulated/);
        await page.keyboard.press("Escape");
      }
      await candidate.first().click();
      await modal.locator(".modal-header .btn-close:visible").first().click();
      assert.match(
        await card.innerText(),
        new RegExp(byId.get(id).name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      );
    }
    const settings = await page.evaluate(() => {
      const key = Object.keys(globalThis.localStorage).find(
        (key) =>
          key.endsWith("__currentSettings__") &&
          JSON.parse(globalThis.localStorage.getItem(key)).player?.equipment,
      );
      return { key, value: JSON.parse(globalThis.localStorage.getItem(key)) };
    });
    for (const [, id] of choices)
      assert(settings.value.player.equipment.items.some((item) => item.id === id));
    await page.reload();
    await page.locator('.sim-ui[data-kfc-initialized="true"]').waitFor({ timeout: 60000 });
    const restored = await page.evaluate(
      (key) => JSON.parse(globalThis.localStorage.getItem(key)),
      settings.key,
    );
    assert.deepEqual(restored.player.equipment, settings.value.player.equipment);
    await page.evaluate(() => {
      for (const [id, value] of [
        ["simui-iterations", "10"],
        ["simui-fixed-rng-seed", "1337"],
      ]) {
        const input = globalThis.document.getElementById(id);
        input.value = value;
        input.dispatchEvent(new globalThis.Event("change", { bubbles: true }));
      }
    });
    await page.locator(".dps-action").click();
    await page.waitForFunction(
      () =>
        /\d[\d,]*\.\d+/.test(
          globalThis.document.querySelector(".results-content .topline-result-avg")?.textContent ??
            "",
        ) && !globalThis.document.querySelector(".dps-action")?.disabled,
      null,
      { timeout: 90000 },
    );
    assert.deepEqual(errors, []);
    console.log(`PASS ${profile}: searchable candidates, provenance, equip/reload and real combat`);
    if (profile === "warrior" && inspection.items[9449]?.modelNote) {
      const card = page.locator(".gear-picker-root .item-picker-root").filter({
        has: page.locator(".kfc-slot-label", { hasText: /^Main Hand$/ }),
      });
      await card.locator(".item-picker-name").click();
      const modal = page.locator(".modal.show .selector-modal");
      await modal.locator(".tab-pane.active .selector-modal-search").fill("Manual Crowd Pummeler");
      await modal
        .locator(".selector-modal-list-item-link")
        .filter({ hasText: "Manual Crowd Pummeler" })
        .first()
        .hover();
      const tooltip = page.locator("[role=tooltip] .kfc-item-tooltip");
      await tooltip.waitFor();
      assert.match(await tooltip.innerText(), /3-minute cooldown.*three uses.*No ranged haste/s);
      await page.keyboard.press("Escape");
      await modal.locator(".modal-header .btn-close:visible").first().click();
      console.log("PASS MCP tooltip: current cooldown, charge cap and melee-only model disclosed");
    }
    if (profile === "warrior") {
      const duplicateReward = globalThis.structuredClone(settings.value);
      duplicateReward.player.equipment.items[12] = { id: 13965 };
      duplicateReward.player.equipment.items[13] = { id: 13965 };
      await page.evaluate(
        ({ key, value }) => globalThis.localStorage.setItem(key, JSON.stringify(value)),
        {
          key: settings.key,
          value: duplicateReward,
        },
      );
      await page.reload();
      await page.locator('.sim-ui[data-kfc-initialized="true"]').waitFor({ timeout: 60000 });
      const rejected = page.waitForEvent("dialog").then(async (dialog) => {
        const message = dialog.message();
        await dialog.dismiss();
        assert.match(message, /Blackhand.*only one copy.*quest source/s);
      });
      await Promise.all([rejected, page.locator(".dps-action").click()]);
      const duplicateDrop = globalThis.structuredClone(settings.value);
      duplicateDrop.player.equipment.items[10] = { id: 18500 };
      duplicateDrop.player.equipment.items[11] = { id: 18500 };
      await page.evaluate(
        ({ key, value }) => globalThis.localStorage.setItem(key, JSON.stringify(value)),
        {
          key: settings.key,
          value: duplicateDrop,
        },
      );
      await page.reload();
      await page.locator('.sim-ui[data-kfc-initialized="true"]').waitFor({ timeout: 60000 });
      await page.evaluate(() => {
        const iterations = globalThis.document.getElementById("simui-iterations");
        iterations.value = "10";
        iterations.dispatchEvent(new globalThis.Event("change", { bubbles: true }));
      });
      await page.locator(".dps-action").click();
      await page.waitForFunction(
        () =>
          /\d[\d,]*\.\d+/.test(
            globalThis.document.querySelector(".results-content .topline-result-avg")
              ?.textContent ?? "",
          ) && !globalThis.document.querySelector(".dps-action")?.disabled,
        null,
        { timeout: 90000 },
      );
      assert.deepEqual(errors, []);
      console.log(
        "PASS browser ownership: duplicate one-time reward rejected, duplicate non-unique drop simulated",
      );
    }
    if (profile === "rogue") {
      const wrongFaction = globalThis.structuredClone(settings.value);
      wrongFaction.player.equipment.items[4] = { id: 22879 };
      await page.evaluate(
        ({ key, value }) => globalThis.localStorage.setItem(key, JSON.stringify(value)),
        { key: settings.key, value: wrongFaction },
      );
      await page.reload();
      await page.locator('.sim-ui[data-kfc-initialized="true"]').waitFor({ timeout: 60000 });
      const rejected = page.waitForEvent("dialog").then(async (dialog) => {
        const message = dialog.message();
        await dialog.dismiss();
        assert.match(message, /requires a different faction/);
      });
      await Promise.all([rejected, page.locator(".dps-action").click()]);
      assert.deepEqual(errors, []);
      console.log(
        "PASS recovered PvP access: incompatible historical faction model rejected before combat",
      );
    }
    await page.close();
  }
} finally {
  await browser.close();
}
