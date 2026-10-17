import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { provisionalWarriorWeaponSettings } from "../infra/simulator/prebis-proc-scenario.mjs";

function fixture(variant = "arms") {
  const baseline = {
    schema: "kfc-optimization-baseline.v1",
    profile: "warrior",
    variant,
    playerClass: 9,
    settings: {
      player: {
        talentsString: "fixed",
        consumes: { mainHandImbue: "DenseSharpeningStone" },
        equipment: {
          items: Array.from({ length: 17 }, (_, slot) =>
            slot === 15 && variant === "arms" ? {} : { id: slot + 1, enchant: 2563 },
          ),
        },
      },
    },
  };
  const db = {
    items: [
      { id: 15, type: 13, weaponType: 9, handType: variant === "arms" ? 4 : 2, ilvl: 60 },
      { id: 16, type: 13, weaponType: 9, handType: 2, ilvl: 60 },
    ],
  };
  const inspection = {
    enchants: {
      crusader: {
        effectId: 1900,
        spellId: 20034,
        type: 13,
        extraTypes: [],
        status: "provisional",
        classAllowlist: [],
        armorTypes: [],
        minLevel: 0,
        maxLevel: 0,
        itemLevelMin: 0,
        itemLevelMax: 0,
        enchantType: 0,
      },
    },
  };
  return { baseline, db, inspection };
}

test("Arms proc scenario changes only its two-hand weapon and explicitly retains provisional confidence", () => {
  const input = fixture();
  const before = globalThis.structuredClone(input);
  const result = provisionalWarriorWeaponSettings(input.baseline, input.db, input.inspection);
  assert.equal(result.settings.player.equipment.items[14].enchant, 1900);
  assert.deepEqual(result.settings.player.equipment.items[15], {});
  assert.deepEqual(result.enchantPolicy.provisionalEffectIds, [36, 803, 1898, 1900]);
  assert.match(result.enchantPolicy.notice, /Not verified Forever/);
  assert.match(result.enchantPolicy.notice, /explicit opt-in/);
  const restored = globalThis.structuredClone(result.settings);
  restored.player.equipment.items[14].enchant = 2563;
  assert.deepEqual(restored, input.baseline.settings);
  assert.deepEqual(input, before);
});

test("Fury proc scenario keeps dual wield and applies the same model to both real weapons", () => {
  const input = fixture("fury");
  const result = provisionalWarriorWeaponSettings(input.baseline, input.db, input.inspection);
  assert.deepEqual(result.settings.player.equipment.items.slice(14, 16), [
    { id: 15, enchant: 1900 },
    { id: 16, enchant: 1900 },
  ]);
});

test("unsupported profiles, weapon styles and inapplicable proc models cannot create a scenario", () => {
  for (const change of [
    (x) => (x.baseline.profile = "tank_warrior"),
    (x) => (x.baseline.variant = "protection"),
    (x) => (x.baseline.playerClass = 1),
    (x) => (x.baseline.schema = "other"),
    (x) => x.baseline.settings.player.equipment.items.pop(),
    (x) => (x.baseline.settings.player.equipment.items[15] = { id: 16 }),
    (x) => (x.baseline.settings.player.equipment.items[14] = {}),
    (x) => (x.db.items[0].handType = 2),
    (x) => (x.db.items[0].weaponType = 7),
    (x) => (x.inspection.enchants.crusader.classAllowlist = [3]),
    (x) => (x.inspection.enchants.crusader.status = "unsupported"),
    (x) => (x.inspection.enchants = {}),
  ]) {
    const input = fixture();
    change(input);
    assert.throws(() =>
      provisionalWarriorWeaponSettings(input.baseline, input.db, input.inspection),
    );
  }
  for (const change of [
    (x) => (x.db.items[0].handType = 4),
    (x) => (x.db.items[1].handType = 1),
    (x) => (x.db.items[1].weaponType = 7),
    (x) => (x.baseline.settings.player.equipment.items[15] = {}),
  ]) {
    const input = fixture("fury");
    change(input);
    assert.throws(() =>
      provisionalWarriorWeaponSettings(input.baseline, input.db, input.inspection),
    );
  }
});

test("an already provisional or malformed policy is not relabelled as a fresh conservative comparison", () => {
  for (const policy of [
    { schema: "kfc-enchant-model-policy.v1", provisionalEffectIds: [1900] },
    { schema: "other", provisionalEffectIds: [] },
  ]) {
    const input = fixture();
    input.baseline.enchantPolicy = policy;
    assert.throws(() =>
      provisionalWarriorWeaponSettings(input.baseline, input.db, input.inspection),
    );
  }
});

test("proc capture rejects missing, duplicate or unknown arguments before reading files", () => {
  for (const args of [
    [],
    ["--baseline="],
    ["--baseline=missing.json", "--publish"],
    ["--baseline=missing.json", "--baseline=other.json"],
  ]) {
    const result = spawnSync(
      process.execPath,
      ["scripts/capture-simulator-proc-scenario.mjs", ...args],
      { cwd: resolve(import.meta.dirname, ".."), encoding: "utf8", timeout: 5000 },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Pass only --baseline/);
    assert.doesNotMatch(result.stderr, /ENOENT/);
  }
});
