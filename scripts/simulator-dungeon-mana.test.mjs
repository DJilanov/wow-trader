import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { workspaceInputs } from "../infra/simulator/workspace-adapter.mjs";
import {
  dungeonManaSetModels,
  patchDungeonManaDispatch,
  validateDungeonManaClient,
  patchDungeonManaSupport,
  reviewedDungeonManaSources,
} from "../infra/simulator/dungeon-set-mana-adapter.mjs";

const source = `package core
func (character *Character) GetActiveSetBonuses() []ActiveSetBonus {
  if forever {
\t\tactiveBonuses = character.foreverEquippedBonuses()
  }
}
// Apply effects from item set bonuses.
`;

function fixture() {
  const effect = (spellId, type, aura, trigger) => ({
    SpellID: spellId,
    DifficultyID: 0,
    Effect: type,
    EffectAura: aura,
    EffectBasePointsF: 200,
    EffectTriggerSpell: trigger,
    EffectMiscValue: [0, 0],
    Variance: 0,
    EffectRealPointsPerLevel: 0,
    EffectAuraPeriod: 0,
    EffectIndex: 0,
    ImplicitTarget: [1, 0],
    EffectRadiusIndex: [0, 0],
    EffectSpellClassMask: [0, 0, 0, 0],
    EffectChainAmplitude: 1,
    GroupSizeBasePointsCoefficient: 1,
    PvpMultiplier: 1,
    EffectBonusCoefficient: aura === 42 ? 1 : 0,
    EffectAmplitude: 0,
    EffectAttributes: 0,
    EffectChainTargets: 0,
    EffectItemType: 0,
    EffectMechanic: 0,
    EffectPointsPerResource: 0,
    EffectPos_facing: 0,
    BonusCoefficientFromAP: 0,
    Coefficient: 0,
    ResourceCoefficient: 0,
    ScalingClass: 0,
  });
  return {
    snapshot: {
      schema: "forever-client-mechanics.v1",
      clientVersion: "1.60.1.70425",
      sets: dungeonManaSetModels.map((model) => ({
        id: model.id,
        Name_lang: model.name,
        RequiredSkill: 0,
        RequiredSkillRank: 0,
        SetFlags: 0,
      })),
      setEffects: dungeonManaSetModels.map((model) => ({
        ItemSetID: model.id,
        Threshold: 5,
        SpellID: model.spellId,
        ChrSpecID: 0,
        TraitSubTreeID: 0,
      })),
    },
    effects: [
      ...dungeonManaSetModels.map((model) => effect(model.spellId, 6, 42, 450554)),
      effect(450554, 30, 0, 0),
    ],
    options: dungeonManaSetModels.map((model) => ({
      SpellID: model.spellId,
      DifficultyID: 0,
      ProcChance: 5,
      ProcCharges: 0,
      ProcCategoryRecovery: 0,
      SpellProcsPerMinuteID: 0,
      ProcTypeMask: [model.procMask, 0],
      CumulativeAura: 0,
    })),
  };
}

test("dungeon-mana overlay appends only its reviewed five-piece dispatch and is idempotent", () => {
  const patched = patchDungeonManaDispatch(source);
  assert.equal(patched.split("kfcForeverDungeonManaBonuses").length, 2);
  assert.equal(patchDungeonManaDispatch(patched), patched);
  assert.equal(
    patched.replace(
      "\t\tactiveBonuses = append(activeBonuses, character.kfcForeverDungeonManaBonuses()...)\n",
      "",
    ),
    source,
  );
});

test("changed, duplicated or partial set dispatch refuses patching", () => {
  for (const text of [
    "unrelated",
    source.replace("GetActiveSetBonuses", "OtherMethod"),
    source.replace("foreverEquippedBonuses()", "otherBonuses()"),
    source.replace(
      "\t\tactiveBonuses = character.foreverEquippedBonuses()\n",
      "\t\tactiveBonuses = character.foreverEquippedBonuses()\n".repeat(2),
    ),
    source + "// kfcForeverDungeonManaBonuses partial patch",
  ])
    assert.throws(() => patchDungeonManaDispatch(text));
});

test("three reviewed five-piece mana models require exact current-client payloads and preserve evidence confidence", () => {
  const input = fixture();
  const before = globalThis.structuredClone(input);
  const result = validateDungeonManaClient(input.snapshot, input.effects, input.options);
  assert.deepEqual(
    result.map((model) => model.id),
    [181, 182, 186],
  );
  assert(result.every((model) => model.manaPerProc === 200 && model.procChancePercent === 5));
  assert(result.every((model) => model.status === "client-supported-model-not-server-verified"));
  assert.deepEqual(input, before);
});

test("scripted 100-percent placeholders, altered thresholds, dynamic payloads and duplicate records fail closed", () => {
  for (const change of [
    (x) => (x.snapshot.clientVersion = "1.60.1.69913"),
    (x) => (x.snapshot.sets[0].Name_lang = "Other set"),
    (x) => (x.snapshot.sets[0].RequiredSkill = 197),
    (x) => (x.snapshot.sets[0].SetFlags = 1),
    (x) => (x.snapshot.setEffects[0].Threshold = 4),
    (x) => (x.snapshot.setEffects[0].SpellID = 450587),
    (x) => (x.snapshot.setEffects[0].ChrSpecID = 71),
    (x) => (x.options[0].ProcChance = 100),
    (x) => (x.options[0].CumulativeAura = 2),
    (x) => (x.options[0].ProcCategoryRecovery = 1000),
    (x) => (x.options[0].SpellProcsPerMinuteID = 1),
    (x) => (x.options[0].ProcTypeMask = [4, 0]),
    (x) => (x.effects[0].EffectTriggerSpell = 999),
    (x) => (x.effects[0].Variance = 0.2),
    (x) => (x.effects[0].EffectRealPointsPerLevel = 2),
    (x) => (x.effects.at(-1).EffectBasePointsF = 201),
    (x) => (x.effects.at(-1).EffectMiscValue = [1, 0]),
    (x) => x.effects.push(x.effects[0]),
    (x) => x.options.push(x.options[0]),
    (x) => x.snapshot.setEffects.push(x.snapshot.setEffects[0]),
  ]) {
    const input = fixture();
    change(input);
    assert.throws(() => validateDungeonManaClient(input.snapshot, input.effects, input.options));
  }
});

test("dungeon-mana staging rejects active targets and overrides before reading files", () => {
  for (const args of [["--apply"], ["--output=active.json"], ["--snapshot=other.json"]]) {
    const result = spawnSync(
      process.execPath,
      ["scripts/stage-simulator-dungeon-mana.mjs", ...args],
      { cwd: resolve(import.meta.dirname, ".."), encoding: "utf8", timeout: 5000 },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /accepts no arguments or active targets/);
    assert.doesNotMatch(result.stderr, /ENOENT/);
  }
});

test("mana proc and energize payloads reject changed targeting, scaling and hidden dynamic coefficients", () => {
  for (const index of [0, 3])
    for (const [field, value] of [
      ["EffectIndex", 1],
      ["ImplicitTarget", [6, 0]],
      ["EffectRadiusIndex", [1, 0]],
      ["EffectSpellClassMask", [1, 0, 0, 0]],
      ["EffectChainAmplitude", 2],
      ["GroupSizeBasePointsCoefficient", 2],
      ["PvpMultiplier", 2],
      ["EffectBonusCoefficient", index === 0 ? 0 : 1],
      ...[
        "EffectAmplitude",
        "EffectAttributes",
        "EffectChainTargets",
        "EffectItemType",
        "EffectMechanic",
        "EffectPointsPerResource",
        "EffectPos_facing",
        "BonusCoefficientFromAP",
        "Coefficient",
        "ResourceCoefficient",
        "ScalingClass",
      ].map((field) => [field, 1]),
    ]) {
      const input = fixture();
      input.effects[index][field] = value;
      assert.throws(
        () => validateDungeonManaClient(input.snapshot, input.effects, input.options),
        undefined,
        `Accepted changed ${field} on ${index === 0 ? "proc" : "energize"} payload`,
      );
    }
});

test("native and browser builders install and fingerprint the reviewed mana models", async () => {
  for (const file of ["native-runner.mjs", "host-adapter.mjs"]) {
    const source = await readFile(resolve(import.meta.dirname, "../infra/simulator", file), "utf8");
    assert(source.includes('from "./dungeon-set-mana-adapter.mjs"'));
    assert(source.includes("await prepareDungeonManaModels("));
  }
  for (const file of [
    "dungeon-set-mana-adapter.mjs",
    "dungeon-set-mana.go",
    "dungeon-set-mana_test.go",
  ])
    assert(workspaceInputs.includes(file), `Missing release input ${file}`);
  const builder = await readFile(
    resolve(import.meta.dirname, "prepare-forever-simulator.mjs"),
    "utf8",
  );
  assert(builder.includes("TestKfcDungeonSetMana"));
  assert(builder.includes("kfc-dungeon-mana-models.json"));
});

test("set-support reporting preserves the original adapter and adds only the reviewed model query", () => {
  const source =
    "func ForeverEquipmentBonusSupported(id, pieces int32) bool {\nreturn foreverEquipmentSets[id].Bonuses[pieces].Supported\n}\n";
  const patched = patchDungeonManaSupport(source);
  assert(patched.includes("Supported || kfcForeverDungeonManaBonusSupported(id, pieces)"));
  assert.equal(patchDungeonManaSupport(patched), patched);
  assert.throws(() => patchDungeonManaSupport("changed support API"));
  assert.throws(() => patchDungeonManaSupport(source + source));
  assert.throws(() =>
    patchDungeonManaSupport(source + "// kfcForeverDungeonManaBonusSupported partial"),
  );
});

test("integration refuses unreviewed source instead of overwriting local engine changes", () => {
  assert.throws(
    () => reviewedDungeonManaSources("unreviewed", "unreviewed", "unreviewed"),
    /dispatch changed/,
  );
});

test("real browser mana verification refuses overrides before reading local data", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/verify-simulator-dungeon-mana.mjs", "--output=active.json"],
    {
      cwd: resolve(import.meta.dirname, ".."),
      encoding: "utf8",
      timeout: 5000,
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /accepts no overrides/);
  assert.doesNotMatch(result.stderr, /ENOENT/);
});
