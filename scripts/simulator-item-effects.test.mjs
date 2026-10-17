import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";
import { patchFlameWrathSelfRetaliation } from "../infra/simulator/item-effects-adapter.mjs";
import {
  patchManualCrowdPummeler,
  validateManualCrowdClient,
} from "../infra/simulator/manual-crowd-pummeler.mjs";

function mcpFixture() {
  const effect = Object.fromEntries(
    [
      "EffectTriggerSpell",
      "EffectAttributes",
      "EffectAuraPeriod",
      "EffectBonusCoefficient",
      "EffectChainTargets",
      "EffectItemType",
      "EffectMechanic",
      "EffectPointsPerResource",
      "EffectPos_facing",
      "EffectRealPointsPerLevel",
      "BonusCoefficientFromAP",
      "Coefficient",
      "Variance",
      "ResourceCoefficient",
      "ScalingClass",
    ].map((key) => [key, 0]),
  );
  Object.assign(effect, {
    SpellID: 13494,
    DifficultyID: 0,
    EffectIndex: 0,
    Effect: 6,
    EffectAura: 319,
    EffectBasePointsF: 50,
    ImplicitTarget: [1, 0],
    EffectMiscValue: [0, 0],
    EffectRadiusIndex: [0, 0],
    EffectSpellClassMask: [0, 0, 0, 0],
    EffectAmplitude: 1,
    EffectChainAmplitude: 1,
    PvpMultiplier: 1,
    GroupSizeBasePointsCoefficient: 1,
  });
  const attributes = Array(17).fill(0);
  attributes[15] = 8192;
  return {
    snapshot: {
      schema: "forever-client-mechanics.v1",
      clientVersion: "1.60.1.70425",
      items: [{ itemId: 9449, effectIds: [98990], issues: [] }],
    },
    sparse: [{ id: 9449, MaxCount: 1, Stackable: 1, InventoryType: 17 }],
    tables: new Map([
      ["ItemXItemEffect", [{ id: 93413, ItemEffectID: 98990, ItemID: 9449 }]],
      [
        "ItemEffect",
        [
          {
            id: 98990,
            LegacySlotIndex: 0,
            TriggerType: 0,
            Charges: 3,
            CoolDownMSec: 180000,
            CategoryCoolDownMSec: -1,
            SpellCategoryID: 0,
            SpellID: 13494,
            ChrSpecializationID: 0,
            PlayerConditionID: 0,
          },
        ],
      ],
      ["SpellEffect", [effect]],
      [
        "SpellAuraOptions",
        [
          {
            SpellID: 13494,
            DifficultyID: 0,
            CumulativeAura: 0,
            ProcCategoryRecovery: 0,
            ProcChance: 101,
            ProcCharges: 0,
            SpellProcsPerMinuteID: 0,
            ProcTypeMask: [0, 0],
          },
        ],
      ],
      [
        "SpellMisc",
        [
          {
            SpellID: 13494,
            DifficultyID: 0,
            DurationIndex: 9,
            PvPDurationIndex: 0,
            MinDuration: 0,
            CastingTimeIndex: 1,
            RangeIndex: 1,
            SchoolMask: 1,
            Attributes: attributes,
          },
        ],
      ],
      ["SpellDuration", [{ id: 9, Duration: 30000, MaxDuration: 30000, DurationPerResource: 0 }]],
    ]),
  };
}

test("MCP client model preserves three charges, current cooldown and melee-only haste", () => {
  const input = mcpFixture();
  const original = globalThis.structuredClone(input);
  const model = validateManualCrowdClient(input.snapshot, input.sparse, input.tables);
  assert.deepEqual(
    [
      model.chargesPerItem,
      model.cooldownSeconds,
      model.durationSeconds,
      model.meleeSpeedMultiplier,
      model.affectsRanged,
    ],
    [3, 180, 30, 1.5, false],
  );
  assert.deepEqual(input, original);
});

test("MCP cooldown, charges, payload, targeting and condition drift fail closed", () => {
  for (const change of [
    (x) => x.tables.get("ItemEffect")[0].Charges++,
    (x) => (x.tables.get("ItemEffect")[0].CoolDownMSec = 30000),
    (x) => (x.tables.get("ItemEffect")[0].PlayerConditionID = 1),
    (x) => (x.tables.get("SpellEffect")[0].EffectAura = 342),
    (x) => (x.tables.get("SpellEffect")[0].EffectBasePointsF = 100),
    (x) => (x.tables.get("SpellEffect")[0].ImplicitTarget = [6, 0]),
    (x) => (x.tables.get("SpellEffect")[0].ScalingClass = 1),
    (x) => (x.tables.get("SpellEffect")[0].EffectSpellClassMask = [1, 0, 0, 0]),
    (x) => (x.tables.get("SpellAuraOptions")[0].ProcTypeMask = [4, 0]),
    (x) => (x.tables.get("SpellMisc")[0].Attributes[0] = 1),
    (x) => (x.tables.get("SpellDuration")[0].Duration = 60000),
    (x) => (x.sparse[0].MaxCount = 0),
    (x) => x.snapshot.items[0].effectIds.push(1),
    (x) => x.tables.get("ItemXItemEffect").pop(),
  ]) {
    const input = mcpFixture();
    change(input);
    assert.throws(() => validateManualCrowdClient(input.snapshot, input.sparse, input.tables));
  }
});

test("MCP runtime overlay is idempotent and rejects ambiguous or changed handlers", () => {
  const fixed =
    "\tcore.NewItemEffect(ManualCrowdPummeler, kfcRegisterManualCrowdPummeler)\n\n\n\t// https://www.wowhead.com/classic/item=12794/after";
  assert.equal(patchManualCrowdPummeler(fixed), fixed);
  assert.throws(() => patchManualCrowdPummeler(fixed + fixed), /duplicated/);
  assert.throws(
    () => patchManualCrowdPummeler(fixed.replace("kfcRegisterManualCrowdPummeler", "other")),
    /handler changed/,
  );
  assert.throws(() => patchManualCrowdPummeler("other source"), /registration/);
});

const fixture = `
unrelated-before
itemhelpers.CreateWeaponProcSpell(FlameWrath, "Flame Wrath", 1.0, func() {
\t\t\t\tif result.Landed() {
\t\t\t\t\tshieldSpell.Cast(sim, spell.Unit)
\t\t\t\t}
})
\t// PPM from Armaments discord
unrelated-after
`;

test("Flame Wrath overlay prevents self-retaliation without disabling enemy-hit reflection", () => {
  const patched = patchFlameWrathSelfRetaliation(fixture);
  assert(patched.includes("result.Landed() && spell.Unit != shieldSpell.Unit"));
  assert(patched.includes("shieldSpell.Cast(sim, spell.Unit)"));
  assert(patched.startsWith("\nunrelated-before"));
  assert(patched.endsWith("unrelated-after\n"));
  assert.equal(patchFlameWrathSelfRetaliation(patched), patched);
});

test("changed, ambiguous and partially applied Flame Wrath registrations fail closed", () => {
  assert.throws(() => patchFlameWrathSelfRetaliation("different source"), /registration changed/);
  assert.throws(
    () => patchFlameWrathSelfRetaliation(fixture.replace("if result.Landed()", "if true")),
    /retaliation changed/,
  );
  assert.throws(
    () =>
      patchFlameWrathSelfRetaliation(
        fixture.replace(
          "shieldSpell.Cast(sim, spell.Unit)",
          "differentSpell.Cast(sim, spell.Unit)",
        ),
      ),
    /retaliation changed/,
  );
  assert.throws(
    () =>
      patchFlameWrathSelfRetaliation(
        fixture.replace(
          "})",
          "if result.Landed() {\n\t\t\t\t\tshieldSpell.Cast(sim, spell.Unit)\n})",
        ),
      ),
    /retaliation changed/,
  );
});

test("both browser preparation and native searches install the same engine correction", async () => {
  for (const file of ["native-runner.mjs", "host-adapter.mjs"]) {
    const source = await readFile(new URL(`../infra/simulator/${file}`, import.meta.url), "utf8");
    assert(source.includes('from "./item-effects-adapter.mjs"'));
    assert(source.includes("await prepareItemEffectFixes("));
  }
  const builder = await readFile(
    new URL("./prepare-forever-simulator.mjs", import.meta.url),
    "utf8",
  );
  assert(builder.includes("./sim/common"));
  assert(builder.includes("TestKfcFlameWrathSelfRetaliation"));
});
