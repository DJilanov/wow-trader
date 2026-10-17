import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";
import {
  buildInspectionData,
  resolveEnchantStats,
  enchantKey,
} from "../infra/simulator/inspection-data.mjs";
import { patchInspectionSource } from "../infra/simulator/inspection-adapter.mjs";

function enchantRow(id, effects = [3, 0, 0], arguments_ = [7778, 0, 0], amounts = [0, 0, 0]) {
  return {
    id,
    Name_lang: "Client effect",
    Effect: effects,
    EffectArg: arguments_,
    EffectPointsMin: amounts,
  };
}
function aura(spellId, type, value, misc = 0) {
  return {
    SpellID: spellId,
    Effect: 6,
    EffectAura: type,
    EffectBasePointsF: value,
    EffectMiscValue: [misc, 0],
  };
}

test("current-client primary stats replace legacy numbers without double counting", () => {
  const rows = new Map([
    [7778, [aura(7778, 29, 3, 1)]],
    [7455, [aura(7455, 29, 3, 2)]],
  ]);
  assert.equal(resolveEnchantStats(enchantRow(247), rows).stats[1], 3);
  assert.equal(resolveEnchantStats(enchantRow(66, undefined, [7455, 0, 0]), rows).stats[2], 3);
  rows.set(7778, [aura(7778, 29, 4, -1)]);
  assert.deepEqual(resolveEnchantStats(enchantRow(1891), rows).stats.slice(0, 5), [4, 4, 4, 4, 4]);
});
test("kits grant bonus armor and generic AP to both appropriate pools once", () => {
  const result = resolveEnchantStats(
    enchantRow(8483, [4, 5, 0], [0, 38, 0], [16, 4, 0]),
    new Map(),
  );
  assert.equal(result.stats[40], 16);
  assert.equal(result.stats[17], 4);
  assert.equal(result.stats[27], 4);
});
test("healing and damage remain distinct and mana regeneration observes its period", () => {
  const rows = new Map([[7778, [aura(7778, 135, 55, 126), aura(7778, 13, 19, 126)]]]);
  const result = resolveEnchantStats(enchantRow(2505), rows);
  assert.equal(result.stats[41], 55);
  assert.equal(result.stats[42], 19);
  assert.equal(result.stats[5], 0);
  rows.set(7778, [{ ...aura(7778, 85, 2), EffectAuraPeriod: 2000 }]);
  assert.equal(resolveEnchantStats(enchantRow(2565), rows).stats[12], 5);
});
test("unknown, conditional, scaling and proc payloads are not guessed", () => {
  for (const row of [
    enchantRow(1, [1, 0, 0]),
    { ...enchantRow(1), Condition_ID: 9 },
    { ...enchantRow(1), ScalingClass: 1 },
  ]) {
    assert.equal(resolveEnchantStats(row, new Map()).status, "unsupported");
  }
  const rows = new Map([[7778, [{ ...aura(7778, 29, 3, 1), Variance: 1 }]]]);
  assert.equal(resolveEnchantStats(enchantRow(1), rows).stats, null);
});
test("all slot variants retain their identities and ranged scope stats never become generic hit", () => {
  const db = {
    items: [],
    enchants: [
      { effectId: 247, spellId: 7779, type: 6, stats: [0, 1], name: "Bracer" },
      { effectId: 247, spellId: 13419, type: 4, stats: [0, 1], name: "Cloak" },
      { effectId: 2523, spellId: 22779, type: 14, stats: [], name: "Scope" },
    ],
  };
  const tables = new Map([
    ["SpellItemEnchantment", [enchantRow(247), enchantRow(2523, undefined, [22779, 0, 0])]],
    ["SpellEffect", [aura(7778, 29, 3, 1), aura(22779, 54, 3)]],
  ]);
  const result = buildInspectionData(db, tables);
  assert.equal(Object.keys(result.enchants).length, 3);
  assert.equal(result.enchants[enchantKey(db.enchants[0])].stats[1], 3);
  assert.equal(result.enchants[enchantKey(db.enchants[1])].stats[1], 3);
  assert.equal(result.enchants[enchantKey(db.enchants[2])].stats.length, 0);
  assert.equal(result.enchants[enchantKey(db.enchants[2])].status, "scripted");
  assert.throws(
    () => buildInspectionData({ items: [], enchants: [{ effectId: 999 }] }, tables),
    /missing/,
  );
});
test("inspection overlays are idempotent and fail closed when upstream contracts change", () => {
  const fixture =
    "\t\tlet randomSuffix: ItemRandomSuffix | null = null;\n(this.enchantsBySlot[slots[i]] || []).find(enchant => [enchant.effectId, enchant.itemId, enchant.spellId].includes(itemSpec.enchant))";
  const result = patchInspectionSource("db", fixture);
  assert.equal(result, patchInspectionSource("db", result));
  assert.match(result, /Unknown enchant/);
  assert.throws(() => patchInspectionSource("db", "changed"), /contract changed/);
});

test("invalid gear uses actionable user errors, not an external crash-report prompt", () => {
  const original =
    "\tmakeRaidSimRequest(debug: boolean): RaidSimRequest {\n\t\tif (player.getParty() == null) {";
  const patched = patchInspectionSource("sim", original);
  assert.equal((patched.match(/\[USER_ERROR\]/g) ?? []).length, 2);
  assert.equal(patchInspectionSource("sim", patched), patched);
  const legacy = patched.replaceAll(
    "throw new SimError('[USER_ERROR] ' + (error instanceof Error ? error.message : 'Invalid equipment'));",
    "throw new SimError(error instanceof Error ? error.message : 'Invalid enchant');",
  );
  assert.equal(patchInspectionSource("sim", legacy), patched);
});
test("saved gear and raid imports are checked before inherited error-swallowing event batches", () => {
  const settings =
    "fromProto(eventID: EventID, settings: IndividualSimSettings, includeCategories?: Array<SimSettingCategories>) {\nTypedEvent.freezeAllAndDo(() => {});\n}\nconsole.warn('Failed to parse saved settings: ' + e);";
  const patched = patchInspectionSource("settings", settings);
  assert(
    patched.indexOf("this.sim.db.lookupEquipmentSpec") <
      patched.indexOf("TypedEvent.freezeAllAndDo"),
  );
  assert(patched.includes("recoverSavedEnchants(this.getSettingsStorageKey(), savedSettings, e)"));
  assert.equal(patched, patchInspectionSource("settings", patched));
  const raid = patchInspectionSource(
    "raid",
    "fromProto(eventID: EventID, proto: RaidProto) {\nTypedEvent.freezeAllAndDo(() => {});\n}",
  );
  assert(raid.indexOf("lookupEquipmentSpec") < raid.indexOf("TypedEvent.freezeAllAndDo"));
});
test("inspection uses safe local DOM, explicit model opt-in and matched virtual row heights", async () => {
  const ui = await readFile(new URL("../infra/simulator/inspection.ts", import.meta.url), "utf8");
  assert(!ui.includes("innerHTML"));
  assert(!ui.includes("https://"));
  assert(ui.includes('checkbox.type = "checkbox"'));
  assert(ui.includes('"keydown", escape, true'));
  assert(ui.includes("dialog.showModal()"));
  assert(ui.includes("dialog && !dialog.contains(anchor)"));
  assert(ui.includes("interactive: false"));
  assert(ui.includes('document.addEventListener("shown.bs.modal", click)'));
  const adapter = await readFile(
    new URL("../infra/simulator/inspection-adapter.mjs", import.meta.url),
    "utf8",
  );
  const css = await readFile(new URL("../infra/simulator/inspection.css", import.meta.url), "utf8");
  assert(adapter.includes("? 136 : 56"));
  assert(css.includes("height: 136px"));
});
