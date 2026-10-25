import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  createHealerRaidSettings,
  renderHealerRaidFrameFixture,
  validateHealingRaidBuffSource,
} from "./healer-raid-frame-v2.mjs";

const support = JSON.parse(readFileSync(new URL("./raid-buff-defaults.v2.json", import.meta.url))),
  settings = {
    player: {
      class: "ClassPriest",
      level: 60,
      equipment: { items: Array.from({ length: 17 }, () => ({ id: 0 })) },
      buffs: { blessingOfKings: false },
      talentsString: "",
      consumes: { defaultPotion: "MajorManaPotion" },
    },
    settings: { ruleset: "RulesetForever", iterations: 100 },
    encounter: { duration: 180 },
    raidBuffs: {},
    partyBuffs: {},
  };

test("current aura payloads do not apply a removed Enhancing Totems multiplier", () => {
  const bytes = readFileSync(
    new URL("./fixtures/healer-raid-buffs-source.v1.json.gz", import.meta.url),
  );
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "a1844250b366244deaaff6baf6b7c03da4c58d458e0c66d98884fff6138f4a3d",
  );
  const evidence = JSON.parse(gunzipSync(bytes)),
    rules = validateHealingRaidBuffSource(evidence);
  assert.deepEqual(
    [rules.strengthOfEarth, rules.graceOfAir, rules.enhancingTotemsAvailable],
    [53, 89, false],
  );
  assert.equal(rules.classMechanicsAdmission, false);
  for (const mutate of [
    (value) => {
      value.traitDefinitions[0].SpellID = 16295;
    },
    (value) => {
      value.traitDefinitions.pop();
    },
    (value) => {
      value.effects.find((row) => row.SpellID === 25362).EffectBasePointsF = 60;
    },
  ]) {
    const changed = globalThis.structuredClone(evidence);
    mutate(changed);
    assert.throws(() => validateHealingRaidBuffSource(changed));
  }
});

test("all healer classes receive the exact shared improved raid support", () => {
  for (const playerClass of [
    1,
    4,
    5,
    7,
    "ClassDruid",
    "ClassPaladin",
    "ClassPriest",
    "ClassShaman",
  ]) {
    const next = createHealerRaidSettings(
      { ...settings, player: { ...settings.player, class: playerClass } },
      support,
    );
    assert.deepEqual(next.raidBuffs, support.raid);
    assert.deepEqual(next.partyBuffs, support.party);
    assert.deepEqual(next.player.buffs, support.individual);
    assert.equal(next.player.buffs.blessingOfKings, true);
    assert.equal(next.raidBuffs.moonkinAura, true);
    assert.equal(next.raidBuffs.trueshotAura, true);
    assert.equal(next.raidBuffs.strengthOfEarthTotem, 2);
    assert.equal(next.raidBuffs.graceOfAirTotem, 2);
    assert.equal(next.raidBuffs.manaSpringTotem, 2);
    assert.equal(next.partyBuffs.windfuryTotem, true);
    assert.equal(next.player.buffs.innervates, undefined);
  }
});

test("missing buffs, weaker totems and invented external grants require a new reviewed policy", () => {
  for (const mutate of [
    (value) => {
      value.individual.blessingOfKings = false;
    },
    (value) => {
      value.raid.moonkinAura = false;
    },
    (value) => {
      value.raid.graceOfAirTotem = 1;
    },
    (value) => {
      value.raid.strengthOfEarthTotem = 1;
    },
    (value) => {
      value.raid.manaSpringTotem = 1;
    },
    (value) => {
      value.party.windfuryTotem = false;
    },
    (value) => {
      value.individual.innervates = 10;
    },
  ]) {
    const changed = globalThis.structuredClone(support);
    mutate(changed);
    assert.throws(() => createHealerRaidSettings(settings, changed), /changed/);
    assert.throws(() => renderHealerRaidFrameFixture(changed), /changed/);
  }
});

test("support changes neither its inputs nor the character, gear, consumes and encounter", () => {
  const before = JSON.stringify({ settings, support }),
    next = createHealerRaidSettings(settings, support);
  assert.deepEqual(next.player.equipment, settings.player.equipment);
  assert.deepEqual(next.player.consumes, settings.player.consumes);
  assert.deepEqual(next.encounter, settings.encounter);
  assert.deepEqual(next.settings, settings.settings);
  next.player.buffs.blessingOfKings = false;
  next.raidBuffs.moonkinAura = false;
  assert.equal(JSON.stringify({ settings, support }), before);
});

test("unsupported class, level, ruleset, incomplete gear and external healing fail closed", () => {
  for (const mutate of [
    (value) => {
      value.player.class = "ClassWarrior";
    },
    (value) => {
      value.player.level = 61;
    },
    (value) => {
      value.settings.ruleset = "RulesetClassic";
    },
    (value) => {
      value.player.equipment.items.pop();
    },
    (value) => {
      value.player.healingModel = { hps: 1000 };
    },
  ]) {
    const changed = globalThis.structuredClone(settings);
    mutate(changed);
    assert.throws(() => createHealerRaidSettings(changed, support));
  }
});

test("native controls receive the same complete policy as JavaScript callers", () => {
  const rendered = renderHealerRaidFrameFixture(support);
  const value = rendered.match(/const kfcHealingFullRaidDefaultsJSON = (.+)\n/)?.[1];
  assert(value);
  assert.deepEqual(JSON.parse(JSON.parse(value)), support);
  assert.equal(renderHealerRaidFrameFixture(support), rendered);
});
