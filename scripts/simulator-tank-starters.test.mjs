import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createTankStarters,
  patchBuildPresetLoad,
  patchGearPresetLoad,
  patchTankDefaults,
  patchTankPresetSource,
  patchTankTalentSource,
  tankStarterTalents,
  patchTankSimSource,
  patchPresetEligibility,
  tankStarterDefinitions,
  tankStarterScore,
} from "../infra/simulator/tank-starters-adapter.mjs";

test("requested tank talent presets spend 51 points in the correct trees", () => {
  for (const [key, totals] of [
    ["tank_warrior", [8, 5, 38]],
    ["feral_tank_druid", [0, 41, 10]],
  ]) {
    const strings = tankStarterTalents[key].talentsString.split("-");
    assert.deepEqual(
      strings.map((tree) => [...tree].reduce((sum, rank) => sum + Number(rank), 0)),
      totals,
    );
  }
  assert.equal(tankStarterTalents.tank_warrior.talentsString.split("-")[1][3] ?? "0", "0");
  assert.equal(tankStarterTalents.tank_warrior.talentsString.split("-")[2][9], "3");
  assert.equal(tankStarterTalents.feral_tank_druid.talentsString.split("-")[1][3], "3");
});

test("Protection suggestions use one corrected build rather than stale race-specific talents", () => {
  const original =
    "imports\nexport const TalentsProtection = old;\nTalentsProtectionOrc\nexport const PresetBuildTanky = existingBuild;";
  const patched = patchTankTalentSource(original, "tank_warrior");
  assert(patched.includes("Protection 8/5/38"));
  assert(patched.includes("export const DefaultTalents = TalentsProtection;"));
  assert(!patched.includes("TalentsProtectionOrc"));
  assert(patched.endsWith("export const PresetBuildTanky = existingBuild;"));
  const bear = patchTankTalentSource(
    "'Bear Tank 1/40/10', SavedTalents.create({ talentsString: '01-50022332120132012551-055' })",
    "feral_tank_druid",
  );
  assert(bear.includes("Bear Tank 0/41/10"));
  assert.throws(() => patchTankTalentSource("changed source", "tank_warrior"), /changed/);
  assert.throws(() => patchTankTalentSource("changed source", "feral_tank_druid"), /changed/);
});

function fixture() {
  const core = [];
  for (const definition of Object.values(tankStarterDefinitions)) {
    for (const [index, id] of definition.core.entries()) {
      const type = [1, 3, 5, 6, 7, 8, 9, 10][index];
      core.push({
        id,
        type,
        name: `Premier ${definition.family} ${type}`,
        quality: 3,
        ilvl: 60,
        classAllowlist: [definition.playerClass],
        setId: [6, 8].includes(type) ? 0 : definition.setId,
        stats: Array.from({ length: 44 }, (_, index) => (index === 2 ? 20 : 0)),
      });
    }
  }
  const items = [];
  for (const type of [2, 4, 11, 12, 13, 14]) {
    for (let index = 0; index < 4; index++)
      items.push({
        id: type * 100 + index,
        type,
        name: `Test filler ${type}/${index}`,
        quality: 3,
        ilvl: 60,
        stats: Array.from({ length: 44 }, (_, stat) => (stat === 2 ? index + 1 : 0)),
        ...(type === 13
          ? {
              weaponType: index === 3 ? 8 : index === 2 ? 7 : 4,
              handType: index === 3 ? 4 : 3,
              weaponSpeed: 2,
              weaponDamageMin: 50,
              weaponDamageMax: 100,
            }
          : {}),
        ...(type === 14 ? { rangedWeaponType: index === 2 ? 4 : index === 3 ? 5 : 3 } : {}),
      });
  }
  items.find((item) => item.id === 1402).id = 272428;
  items.find((item) => item.id === 1403).id = 272434;
  for (const [index, id] of [272437, 249469, 272440, 1490].entries()) {
    items.push({
      id,
      type: 12,
      name: `Curated test trinket ${id}`,
      quality: 3,
      ilvl: 60,
      stats: Array.from({ length: 44 }, (_, stat) => (stat === 2 ? index + 1 : 0)),
    });
  }
  return {
    catalog: {
      items: items.map((item) => ({
        id: item.id,
        requiredLevel: 55,
        sources: [{ kind: "dungeon" }],
      })),
    },
    equipment: { items },
    vendorItems: { items: core },
    accessories: [19325, 271908, 272064].map((id, index) => ({
      id,
      type: 11,
      stats: Array(44).fill(0),
      factionRestriction: index,
    })),
  };
}

function createFixtureStarters(input) {
  return createTankStarters(input.catalog, input.equipment, input.vendorItems, input.accessories);
}

test("each tank gets a complete, deterministic blue starter with legal weapon slots", () => {
  const input = fixture();
  const result = createFixtureStarters(input);
  assert.equal(result.equipment.items.length, input.equipment.items.length + 27);
  for (const [key, profile] of Object.entries(result.profiles)) {
    const ids = profile.gear.items.map((item) => item.id).filter(Boolean);
    assert.equal(ids.length, key === "feral_tank_druid" ? 16 : 17);
    assert.equal(new Set(ids).size, ids.length, "no duplicate unique items, rings or trinkets");
    assert.deepEqual(profile.core, tankStarterDefinitions[key].core);
    assert(profile.totals[2] >= 160);
    assert.match(profile.caveat, /not BiS/);
    if (key === "feral_tank_druid") assert.deepEqual(profile.gear.items[15], {});
    else
      assert.equal(
        result.equipment.items.find((item) => item.id === profile.gear.items[15].id).weaponType,
        7,
      );
  }
  assert.deepEqual(createFixtureStarters(input), result);
});

test("missing, corrupt, wrong-class or incomplete PvP core fails closed", () => {
  for (const corrupt of [
    (input) => input.vendorItems.items.pop(),
    (input) => {
      input.vendorItems.items[0].classAllowlist = [1];
    },
    (input) => {
      input.vendorItems.items[0].stats[0] = Number.NaN;
    },
    (input) => {
      input.vendorItems.items[0].setId = 0;
    },
  ]) {
    const input = fixture();
    corrupt(input);
    assert.throws(() => createFixtureStarters(input), /Invalid|Incomplete/);
  }
});

test("fillers exclude faction, profession, level, quality, class and random-suffix conflicts", () => {
  const input = fixture();
  const original = input.equipment.items.find((item) => item.type === 2);
  const conflicts = [
    { factionRestriction: 1 },
    { requiredProfession: 2 },
    { classAllowlist: [3] },
    { randomSuffixOptions: [123] },
    { quality: 4 },
  ];
  conflicts.forEach((conflict, index) => {
    const id = 5000 + index;
    input.equipment.items.push({ ...original, id, stats: Array(44).fill(10000), ...conflict });
    input.catalog.items.push({ id, requiredLevel: 55, sources: [{ kind: "dungeon" }] });
  });
  input.equipment.items.push({ ...original, id: 5010, stats: Array(44).fill(10000) });
  input.catalog.items.push({ id: 5010, requiredLevel: 61, sources: [{ kind: "dungeon" }] });
  const result = createFixtureStarters(input);
  for (const profile of Object.values(result.profiles)) assert(profile.gear.items[1].id < 5000);
  input.equipment.items = input.equipment.items.filter((item) => item.type !== 2);
  assert.throws(() => createFixtureStarters(input), /No legal/);
});

test("existing real-source items are retained and absent armor has no invented faction restriction", () => {
  const input = fixture();
  const existing = { ...input.vendorItems.items[0], icon: "existing-icon" };
  input.equipment.items.push(existing);
  input.vendorItems.items[1].factionRestriction = 2;
  const result = createFixtureStarters(input);
  assert.deepEqual(
    result.equipment.items.find((item) => item.id === existing.id),
    existing,
  );
  assert.equal(
    result.equipment.items.find((item) => item.id === input.vendorItems.items[1].id)
      .factionRestriction,
    0,
  );
});

test("different items sharing a unique-equipped limit category cannot occupy both trinket slots", () => {
  const input = fixture();
  for (const id of [272437, 249469])
    input.catalog.items.find((item) => item.id === id).limitCategory = 707;
  assert.throws(() => createFixtureStarters(input), /Conflicting unique-equipped/);
});

test("Warrior and Bear use threat accessories and faction-correct BG rings; Paladin keeps defensive trinkets", () => {
  const result = createFixtureStarters(fixture());
  for (const key of ["tank_warrior", "feral_tank_druid"]) {
    assert.deepEqual(result.profiles[key].gear.items.slice(10, 14), [
      { id: 19325 },
      { id: 271908 },
      { id: 272437 },
      { id: 249469 },
    ]);
    assert.equal(result.profiles[key].hordeGear.items[11].id, 272064);
    assert(tankStarterDefinitions[key].weights[18] > tankStarterDefinitions[key].weights[2] * 10);
  }
  assert.deepEqual(result.profiles.protection_paladin.gear.items.slice(12, 14), [
    { id: 272440 },
    { id: 1490 },
  ]);
});

test("weights value durability, paladin spell power and bear weapon DPS without block/parry", () => {
  const bear = tankStarterDefinitions.feral_tank_druid;
  const item = {
    type: 13,
    stats: Array(44).fill(0),
    weaponDamageMin: 100,
    weaponDamageMax: 100,
    weaponSpeed: 2,
  };
  assert.equal(tankStarterScore(item, bear), bear.weaponDpsWeight * 50);
  assert.equal(
    tankStarterScore({ ...item, type: 14 }, bear),
    0,
    "ranged stat sticks must not get main-hand DPS credit",
  );
  item.stats[30] = 100;
  item.stats[32] = 100;
  assert.equal(tankStarterScore(item, bear), bear.weaponDpsWeight * 50);
  for (const definition of Object.values(tankStarterDefinitions)) assert(definition.weights[2] > 0);
  assert(tankStarterDefinitions.protection_paladin.weights[5] > 0);
});

test("preset patches remove modeled defaults and propagate load hooks without erasing saved builds", () => {
  const source =
    "import LaunchGearJSON from './gear_sets/launch.gear.json';\nexport const GearLaunch = PresetUtils.makePresetGear('Modeled level 65', LaunchGearJSON);\n[ClassicPhase.Phase1]: [GearLaunch],\nexisting talents and rotation";
  for (const key of Object.keys(tankStarterDefinitions)) {
    const result = patchTankPresetSource(source, key);
    assert(result.includes(`KfcStarters.${key}.gear`));
    assert(result.includes("setForeverTier1Bonuses"));
    assert(result.endsWith("existing talents and rotation"));
  }
  assert(
    patchGearPresetLoad("\t\t\t\t\ttooltip: presetGear.tooltip,").includes(
      "onLoad: presetGear.onLoad",
    ),
  );
  assert(
    patchBuildPresetLoad(
      "if (gear) this.simUI.player.setGear(eventID, this.simUI.sim.db.lookupEquipmentSpec(gear.gear));",
    ).includes("gear?.onLoad?."),
  );
  assert(
    patchTankDefaults(
      "this.player.setForeverTier1Bonuses(eventID, !healingSpec);\nthis.player.setGear(eventID, this.sim.db.lookupEquipmentSpec(this.individualConfig.defaults.gear));",
    ).includes("setForeverTier1Bonuses(eventID, false)"),
  );
  assert.throws(() => patchTankPresetSource(source, "mage"), /Unknown/);
  for (const patch of [patchGearPresetLoad, patchBuildPresetLoad, patchTankDefaults])
    assert.throws(() => patch("changed source"), /changed/);
});

test("tank gear sorting uses the same published weights as starter generation", () => {
  const source =
    "before\nTank gear is a projected level-65 scenario, not confirmed obtainable loot.\n\t\tepWeights: Stats.fromMap(old weights),\n\t\t// Default consumes settings.\n[ Faction ignore ]\n[ Mirrored ignore ]\n[Faction.Horde]: {\n\t\t\t\t\t1: Presets.DefaultGear.gear,\nafter";
  const result = patchTankSimSource(source, "tank_warrior");
  assert(result.includes("KfcStarters.tank_warrior.weights"));
  assert(result.includes("PseudoStatMainHandDps"));
  assert(!result.includes("old weights"));
  assert(result.endsWith("after"));
  assert.throws(() => patchTankSimSource("changed source", "tank_warrior"), /changed/);
});

test("disabled faction presets are rejected at activation, not only styled as disabled", () => {
  assert(
    patchPresetEligibility("dataElem.addEventListener('click', () => {").includes(
      "if (config.enableWhen && !config.enableWhen(this.modObject)) return;",
    ),
  );
  assert.throws(() => patchPresetEligibility("changed source"), /changed/);
});
