import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";
import { test } from "node:test";
import {
  currentLevel60Ratings,
  normalizeCurrentPrebisItem,
  stageCurrentPrebisRecovery,
} from "../infra/simulator/current-prebis-staging.mjs";
import {
  classicPreRaidEvidence,
  classicReferenceRevision,
  classicReferenceSha256,
} from "../infra/simulator/classic-acquisition.mjs";

const coefficients = {
  "Defense Skill": 1,
  Dodge: 12,
  Parry: 15,
  Block: 5,
  "Hit - Melee": 10,
  "Crit - Melee": 14,
};

function fixture(id = 1234) {
  const historical = {
    id,
    name: "Fixture",
    icon: "inv_bracer_17",
    type: 6,
    armorType: 2,
    ilvl: 60,
    quality: 3,
    stats: Array(44).fill(999),
    setId: 522,
    setName: "Old historical set",
    classAllowlist: [9],
    sources: [{ drop: { zoneId: 1584 } }],
  };
  const current = {
    itemId: id,
    name: "Fixture",
    itemLevel: 57,
    requiredLevel: 52,
    inventoryType: 9,
    classId: 4,
    subclassId: 2,
    quality: 3,
    stats: [
      { statType: 3, value: 15 },
      { statType: 7, value: 7 },
    ],
    armor: 71,
    weapon: null,
    setId: null,
    effectIds: [],
    issues: [],
  };
  const sparse = {
    id,
    Display_lang: "Fixture",
    ItemLevel: 57,
    RequiredLevel: 52,
    InventoryType: 9,
    OverallQualityID: 3,
    ItemSet: 0,
    RequiredSkill: 0,
    RequiredAbility: 0,
    LimitCategory: 0,
    Flags: [0, 0, 0, 0, 0],
    SocketType: [0, 0, 0],
    AllowableRace: [-1, -1],
    AllowableClass: 8,
    MaxCount: 1,
    Bonding: 2,
    RequiredPVPRank: 0,
    DamageType: 0,
    ItemDelay: 0,
  };
  const snapshot = {
    schema: "forever-client-mechanics.v1",
    clientVersion: "1.60.1.70425",
    items: [current],
    sets: [],
  };
  const reference = {
    schema: "kfc-classic-pre-raid-equipment.v1",
    revision: classicReferenceRevision,
    sourceSha256: classicReferenceSha256,
    presets: [],
    items: [{ item: historical, evidence: classicPreRaidEvidence(historical) }],
  };
  return { current, sparse, historical, snapshot, reference };
}

const normalize = (input, sets = new Map()) =>
  normalizeCurrentPrebisItem(input.current, input.sparse, input.historical, coefficients, sets);
const stage = (input, existing = new Set(), utilityTables) =>
  stageCurrentPrebisRecovery(
    input.snapshot,
    input.reference,
    [input.sparse],
    existing,
    coefficients,
    utilityTables,
  );

function utilityFixture() {
  const input = fixture(10776);
  Object.assign(input.current, {
    name: "Silky Spider Cape",
    inventoryType: 16,
    subclassId: 1,
    itemLevel: 42,
    requiredLevel: 37,
    armor: 30,
    stats: [{ statType: 7, value: 10 }],
    effectIds: [233785],
  });
  input.historical.name = input.current.name;
  Object.assign(input.sparse, {
    Display_lang: input.current.name,
    InventoryType: 16,
    ItemLevel: 42,
    RequiredLevel: 37,
    AllowableClass: -1,
    MaxCount: 0,
  });
  const tables = new Map([
    ["ItemXItemEffect", [{ ItemID: 10776, ItemEffectID: 233785 }]],
    [
      "ItemEffect",
      [
        {
          id: 233785,
          SpellID: 1293819,
          TriggerType: 1,
          Charges: 0,
          CoolDownMSec: -1,
          CategoryCoolDownMSec: -1,
          SpellCategoryID: 0,
          ChrSpecializationID: 0,
          PlayerConditionID: 0,
        },
      ],
    ],
    ["SpellAuraOptions", []],
    [
      "SpellEffect",
      [11, 7].map((mechanic, index) => ({
        SpellID: 1293819,
        DifficultyID: 0,
        EffectIndex: index,
        Effect: 6,
        EffectAura: 232,
        EffectBasePointsF: -7,
        EffectMiscValue: [mechanic, 0],
        ImplicitTarget: [1, 0],
        EffectSpellClassMask: [0, 0, 0, 0],
        EffectChainAmplitude: 1,
        GroupSizeBasePointsCoefficient: 1,
        PvpMultiplier: 1,
        Variance: 0,
        ScalingClass: 0,
        EffectRealPointsPerLevel: 0,
        EffectPointsPerResource: 0,
        EffectBonusCoefficient: 0,
        Coefficient: 0,
        BonusCoefficientFromAP: 0,
        ResourceCoefficient: 0,
        EffectAuraPeriod: 0,
        EffectTriggerSpell: 0,
        EffectAttributes: 0,
        EffectMechanic: 0,
        EffectChainTargets: 0,
      })),
    ],
  ]);
  return { input, tables };
}

test("current values, armor, unique/class restrictions and cleared set membership replace historical gameplay metadata", () => {
  const input = fixture(),
    before = globalThis.structuredClone(input);
  const item = normalize(input);
  assert.equal(item.stats.length, 44);
  assert.equal(item.stats[1], 15);
  assert.equal(item.stats[2], 7);
  assert.equal(item.stats[26], 71);
  assert.equal(item.stats.filter((value) => value !== 0).length, 3);
  assert.deepEqual(item.classAllowlist, [6]);
  assert.equal(item.unique, true);
  assert.equal(item.ilvl, 57);
  assert(!Object.hasOwn(item, "setId"));
  assert(!Object.hasOwn(item, "setName"));
  assert.deepEqual(input, before);
});

test("universal rating conversion, AP/RAP and base/bonus armor are counted once", () => {
  const input = fixture();
  input.current.armor = 188;
  input.current.stats = [
    { statType: 31, value: 10 },
    { statType: 32, value: 14 },
    { statType: 12, value: 6 },
    { statType: 38, value: 34 },
    { statType: 39, value: 5 },
    { statType: 50, value: 60 },
  ];
  const { stats } = normalize(input);
  assert.equal(stats[18], 1);
  assert.equal(stats[19], 1);
  assert.equal(stats[13], 0);
  assert.equal(stats[14], 0);
  assert.equal(stats[28], 6);
  assert.equal(stats[17], 34);
  assert.equal(stats[27], 39);
  assert.equal(stats[26], 188);
  assert.equal(stats[40], 60);
});

test("healing, damage-only power, universal spell power and school power stay separate", () => {
  const input = fixture();
  input.current.stats = [
    { statType: 41, value: 22 },
    { statType: 42, value: 8 },
    { statType: 45, value: 7 },
    { statType: 85, value: 14 },
    { statType: 88, value: 16 },
  ];
  const { stats } = normalize(input);
  assert.equal(stats[41], 22);
  assert.equal(stats[42], 8);
  assert.equal(stats[5], 7);
  assert.equal(stats[7], 14);
  assert.equal(stats[11], 16);
});

test("weapon hand restrictions, damage and set membership come from the current record", () => {
  const input = fixture();
  Object.assign(input.current, {
    classId: 2,
    subclassId: 4,
    inventoryType: 21,
    armor: 0,
    weapon: { minimum: 49, maximum: 91, speedSeconds: 2.2 },
  });
  Object.assign(input.sparse, { InventoryType: 21, ItemDelay: 2200 });
  const item = normalize(input);
  assert.equal(item.type, 13);
  assert.equal(item.weaponType, 4);
  assert.equal(item.handType, 1);
  assert.equal(item.weaponDamageMin, 49);
  assert.equal(item.weaponDamageMax, 91);
  assert.equal(item.weaponSpeed, 2.2);
  const armor = fixture();
  armor.current.setId = armor.sparse.ItemSet = 186;
  const set = { id: 186, Name_lang: "Current set", ItemID: [armor.current.itemId] };
  assert.equal(normalize(armor, new Map([[186, set]])).setName, "Current set");
  assert.throws(() => normalize(armor, new Map()), /Missing current set membership/);
});

test("unresolved, contradictory or unsupported current metadata fails rather than losing fields", () => {
  for (const change of [
    (x) => x.current.effectIds.push(98539),
    (x) => x.current.issues.push("unresolved-variant"),
    (x) => (x.current.stats = [{ statType: 46, value: 17 }]),
    (x) => (x.current.stats[0].value = Number.NaN),
    (x) => (x.current.armor = null),
    (x) => (x.sparse.Display_lang = "Other"),
    (x) => (x.sparse.InventoryType = 3),
    (x) => (x.sparse.RequiredSkill = 171),
    (x) => (x.sparse.RequiredAbility = 42),
    (x) => (x.sparse.LimitCategory = 7),
    (x) => (x.sparse.AllowableRace = [1, 0]),
    (x) => (x.sparse.AllowableClass = 32),
    (x) => (x.sparse.AllowableClass = 2 ** 32 + 8),
    (x) => (x.current.inventoryType = "9"),
    (x) => (x.sparse.Flags = []),
    (x) => (x.sparse.SocketType = [1, 0, 0]),
  ]) {
    const input = fixture();
    change(input);
    assert.throws(() => normalize(input));
  }
});

test("staging never overwrites admitted items and explicitly gates effects and unmapped modifiers", () => {
  const input = fixture();
  assert.deepEqual(stage(input, new Set([1234])), { candidates: [], blocked: [] });
  const result = stage(input);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].status, "staged-not-admitted");
  assert(result.candidates[0].reviewRequired.includes("provisional-Forever-acquisition"));
  input.current.effectIds.push(98539);
  assert.equal(stage(input).blocked[0].reason, "current-effects-unreviewed");
  input.current.effectIds = [];
  input.current.stats.push({ statType: 46, value: 17 });
  assert.deepEqual(stage(input).blocked[0].unsupportedModifiers, [46]);
  const missing = stageCurrentPrebisRecovery(
    fixture().snapshot,
    fixture().reference,
    [],
    new Set(),
    coefficients,
  );
  assert.equal(missing.blocked[0].reason, "current-metadata-missing");
});

test("staged preset-only acquisition survives JSON serialization for immutable replay", () => {
  const input = fixture();
  delete input.historical.sources;
  const resource = "ui/rogue/gear_sets/combat_sinister_strike_prebis.gear.json";
  input.reference.presets = [{ resource, ids: [input.historical.id] }];
  input.reference.items[0].evidence = classicPreRaidEvidence(input.historical, [resource]);
  const result = stage(input);
  assert.equal(result.candidates.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test("reviewed passive control-duration utility is staged with current stats and explicit unmodeled-effect evidence", () => {
  const { input, tables } = utilityFixture();
  const before = globalThis.structuredClone(input);
  assert.equal(stage(input).blocked[0].reason, "current-effects-unreviewed");
  const result = stage(input, new Set(), tables);
  assert.equal(result.blocked.length, 0);
  assert.equal(result.candidates.length, 1);
  const candidate = result.candidates[0];
  assert.equal(candidate.item.type, 4);
  assert.equal(candidate.item.stats[2], 10);
  assert.equal(candidate.item.stats[26], 30);
  assert.equal(candidate.item.stats.filter(Boolean).length, 2);
  assert.deepEqual(candidate.effectReviews, [
    {
      itemEffectId: 233785,
      spellId: 1293819,
      status: "passive-utility-not-modeled",
      mechanicIds: [7, 11],
      durationReductionPercent: 7,
      zeroContributionScope: "Stationary encounter without root or snare mechanics only.",
    },
  ]);
  assert(candidate.reviewRequired.includes("unmodeled-utility-disclosure"));
  assert.deepEqual(input, before);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test("utility review cannot conceal changed links, on-use/proc effects, conditions or dynamic payloads", () => {
  for (const change of [
    (x) => x.tables.delete("SpellAuraOptions"),
    (x) => x.tables.get("ItemXItemEffect").push({ ItemID: 10776, ItemEffectID: 42 }),
    (x) => (x.tables.get("ItemEffect")[0].TriggerType = 0),
    (x) => (x.tables.get("ItemEffect")[0].PlayerConditionID = 1),
    (x) => (x.tables.get("ItemEffect")[0].ChrSpecializationID = 71),
    (x) => (x.tables.get("ItemEffect")[0].CoolDownMSec = 1000),
    (x) => x.tables.get("SpellAuraOptions").push({ SpellID: 1293819, DifficultyID: 0 }),
    (x) => (x.tables.get("SpellEffect")[0].EffectAura = 42),
    (x) => (x.tables.get("SpellEffect")[0].EffectTriggerSpell = 123),
    (x) => (x.tables.get("SpellEffect")[0].EffectBasePointsF = -8),
    (x) => (x.tables.get("SpellEffect")[0].Variance = 0.2),
    (x) => (x.tables.get("SpellEffect")[0].EffectMiscValue = [1, 0]),
    (x) => (x.tables.get("SpellEffect")[0].ImplicitTarget = [6, 0]),
    (x) => x.tables.get("SpellEffect").push(x.tables.get("SpellEffect")[0]),
  ]) {
    const testCase = utilityFixture();
    change(testCase);
    assert.throws(() => stage(testCase.input, new Set(), testCase.tables));
  }
  const { input, tables } = utilityFixture();
  input.current.itemId = input.sparse.id = input.historical.id = 9394;
  input.current.effectIds = [98478];
  assert.equal(stage(input, new Set(), tables).blocked[0].reason, "current-effects-unreviewed");
});

test("raid acquisition, tampered evidence, duplicate identities and stale versions cannot stage", () => {
  for (const change of [
    (x) => (x.historical.sources = [{ drop: { zoneId: 2717 } }]),
    (x) => (x.reference.items[0].evidence = { allowed: true, kind: "other" }),
    (x) => x.reference.items.push(x.reference.items[0]),
    (x) => x.snapshot.items.push(x.current),
    (x) => (x.snapshot.clientVersion = "1.60.1.69913"),
    (x) => (x.reference.revision = "latest"),
    (x) => (x.snapshot.sets = [{ id: 1 }, { id: 1 }]),
  ]) {
    const input = fixture();
    change(input);
    assert.throws(() => stage(input));
  }
  const input = fixture();
  assert.throws(
    () =>
      stageCurrentPrebisRecovery(
        input.snapshot,
        input.reference,
        [input.sparse, input.sparse],
        new Set(),
        coefficients,
      ),
    /Repeated ItemSparse/,
  );
});

test("ratings are selected from exactly one complete level-60 row", () => {
  const names = Object.keys(coefficients),
    values = Object.values(coefficients);
  const table = `Level\t${names.join("\t")}\n59\t${values.join("\t")}\n60\t${values.join("\t")}\n`;
  assert.deepEqual(currentLevel60Ratings(table), coefficients);
  assert.throws(() => currentLevel60Ratings(table + `60\t${values.join("\t")}\n`), /exactly one/);
  assert.throws(
    () => currentLevel60Ratings(table.replace("Crit - Melee", "Missing")),
    /Invalid combat rating/,
  );
  assert.throws(
    () => currentLevel60Ratings(table.replace("Level", "Other")),
    /Missing rating level/,
  );
});

test("staging CLI rejects active-output overrides before reading or writing files", () => {
  for (const args of [["--output=active.json"], ["--snapshot=other.json"], ["--publish"]]) {
    const result = spawnSync(
      process.execPath,
      ["scripts/stage-simulator-current-prebis.mjs", ...args],
      { cwd: resolve(import.meta.dirname, ".."), encoding: "utf8", timeout: 5000 },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /cannot target active data/);
    assert.doesNotMatch(result.stderr, /ENOENT/);
  }
});
