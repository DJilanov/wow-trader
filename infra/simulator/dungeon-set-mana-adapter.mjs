import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { accessorySnapshot } from "./verified-accessories.mjs";
import { inspectionSource } from "./inspection-data.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const dispatchAddition =
  "\t\tactiveBonuses = append(activeBonuses, character.kfcForeverDungeonManaBonuses()...)\n";
const supportOriginal = "return foreverEquipmentSets[id].Bonuses[pieces].Supported";
const supportPatched = supportOriginal + " || kfcForeverDungeonManaBonusSupported(id, pieces)";

export const dungeonManaSetModels = [
  { id: 181, name: "Magister's Regalia", spellId: 450527, procMask: 81920 },
  { id: 182, name: "Vestments of the Devout", spellId: 450576, procMask: 81920 },
  { id: 186, name: "Beaststalker Armor", spellId: 450577, procMask: 68 },
];
export const dungeonManaHandlerSha256 =
  "4c3a82f5b68192e4f63361b68bea69cb6e2a9b142e73a2449651730155efbe81";

export function patchDungeonManaSupport(source) {
  if (source.includes(supportPatched)) {
    assert.equal(source.split("kfcForeverDungeonManaBonusSupported").length, 2);
    return source;
  }
  assert.equal(source.split(supportOriginal).length, 2, "Upstream set support method changed");
  assert(!source.includes("kfcForeverDungeonManaBonusSupported"), "Partial mana support patch");
  return source.replace(supportOriginal, supportPatched);
}

export function reviewedDungeonManaSources(dispatch, support, handlers) {
  const originalDispatch = dispatch.replace(dispatchAddition, "");
  const originalSupport = support.replace(supportPatched, supportOriginal);
  assert.equal(
    sha(originalDispatch),
    "638b09728a20485706c8299ca62b12304a398233d743cbee07da0ad8a338d359",
    "Reviewed set dispatch changed",
  );
  assert.equal(
    sha(originalSupport),
    "bf83be0b0aac61c3024ec2b01f5fd5a9f39ace58b060eb794bc58f90d226662f",
    "Reviewed set support source changed",
  );
  assert.equal(sha(handlers), dungeonManaHandlerSha256, "Reviewed dungeon-set handlers changed");
  return {
    originalDispatch,
    originalSupport,
    patchedDispatch: patchDungeonManaDispatch(originalDispatch),
    patchedSupport: patchDungeonManaSupport(originalSupport),
  };
}

export async function loadDungeonManaEvidence(root) {
  const snapshotBytes = await readFile(
    join(root, "artifacts/forever-client-data", accessorySnapshot.checksum + ".json"),
  );
  assert.equal(sha(snapshotBytes), accessorySnapshot.checksum);
  const snapshot = JSON.parse(snapshotBytes.toString("utf8"));
  assert.equal(snapshot.clientVersion, inspectionSource.build);
  const parent = join(root, "artifacts/forever-mechanics/70425", inspectionSource.hotfix);
  for (const name of (await readdir(parent))
    .filter((name) => name.startsWith("mechanics-"))
    .sort()) {
    const directory = join(parent, name);
    const bytes = await readFile(join(directory, "manifest.json"));
    if (sha(bytes) !== inspectionSource.manifestSha256) continue;
    const manifest = JSON.parse(bytes.toString("utf8"));
    assert.equal(manifest.build.clientVersion, snapshot.clientVersion);
    assert.equal(manifest.hotfixSha256, snapshot.hotfixSha256);
    const load = async (table) => {
      const descriptor = manifest.tables[`${table}.effective`];
      assert.equal(descriptor?.path, `raw/${table}.effective.ndjson.gz`);
      const raw = await readFile(join(directory, descriptor.path));
      assert(raw.length <= 30_000_000);
      assert.equal(sha(raw), descriptor.sha256);
      const text = gunzipSync(raw, { maxOutputLength: 80_000_000 }).toString("utf8").trim();
      const rows = text ? text.split("\n").map((line) => JSON.parse(line)) : [];
      assert.equal(rows.length, descriptor.recordCount);
      return { rows, sha256: descriptor.sha256 };
    };
    const [effects, options] = await Promise.all([load("SpellEffect"), load("SpellAuraOptions")]);
    return {
      models: validateDungeonManaClient(snapshot, effects.rows, options.rows),
      effectsSha256: effects.sha256,
      optionsSha256: options.sha256,
      snapshotSha256: accessorySnapshot.checksum,
      mechanicsManifestSha256: inspectionSource.manifestSha256,
      clientVersion: snapshot.clientVersion,
    };
  }
  throw new Error("Reviewed current dungeon-mana mechanics capture not found");
}

export async function prepareDungeonManaModels(root, upstream) {
  const dispatchPath = join(upstream, "sim/core/item_sets.go");
  const supportPath = join(upstream, "sim/core/forever_equipment_sets.go");
  const [evidence, dispatch, support, handlers, helper, test] = await Promise.all([
    loadDungeonManaEvidence(root),
    readFile(dispatchPath, "utf8"),
    readFile(supportPath, "utf8"),
    readFile(join(upstream, "sim/common/item_sets/dungeon_set_1.go")),
    readFile(join(root, "infra/simulator/dungeon-set-mana.go")),
    readFile(join(root, "infra/simulator/dungeon-set-mana_test.go")),
  ]);
  const reviewed = reviewedDungeonManaSources(dispatch, support, handlers);
  await Promise.all([
    writeFile(join(upstream, "sim/core/kfc_dungeon_set_mana.go"), helper),
    writeFile(join(upstream, "sim/common/kfc_dungeon_set_mana_test.go"), test),
  ]);
  if (dispatch !== reviewed.patchedDispatch)
    await writeFile(dispatchPath, reviewed.patchedDispatch);
  if (support !== reviewed.patchedSupport) await writeFile(supportPath, reviewed.patchedSupport);
  const manifest = {
    schema: "kfc-dungeon-mana-models.v1",
    ...evidence,
    helperSha256: sha(helper),
    handlersSha256: sha(handlers),
    notice:
      "Three current-client-supported five-piece mana models. Payload and 5% cadence are client-backed, not independently server-verified. Other unsupported set procs remain disabled; no free set bonuses are granted.",
  };
  await writeFile(join(upstream, "ui/core/kfc_dungeon_mana.json"), JSON.stringify(manifest));
  return manifest;
}

export function patchDungeonManaDispatch(source) {
  const original = "\t\tactiveBonuses = character.foreverEquippedBonuses()\n";
  const patched =
    original +
    "\t\tactiveBonuses = append(activeBonuses, character.kfcForeverDungeonManaBonuses()...)\n";
  const start = source.indexOf("func (character *Character) GetActiveSetBonuses()");
  const end = source.indexOf("\n// Apply effects from item set bonuses.", start);
  assert(start >= 0 && end > start, "Upstream set dispatch method changed");
  const block = source.slice(start, end);
  assert.equal(block.split(original).length, 2, "Upstream set dispatch call changed");
  if (block.includes(patched)) {
    assert.equal(block.split("kfcForeverDungeonManaBonuses").length, 2);
    return source;
  }
  assert(!source.includes("kfcForeverDungeonManaBonuses"), "Partial dungeon-mana dispatch patch");
  return source.slice(0, start) + block.replace(original, patched) + source.slice(end);
}

export function validateDungeonManaClient(snapshot, effects, options) {
  assert.equal(snapshot.schema, "forever-client-mechanics.v1");
  assert.equal(snapshot.clientVersion, "1.60.1.70425");
  const exactEffect = (spellId, effect, aura, amount, trigger) => {
    const rows = effects.filter((row) => row.SpellID === spellId && row.DifficultyID === 0);
    assert.equal(rows.length, 1, `Changed dungeon-mana effect count: ${spellId}`);
    const row = rows[0];
    assert.deepEqual(
      [row.Effect, row.EffectAura, row.EffectBasePointsF, row.EffectTriggerSpell],
      [effect, aura, amount, trigger],
      `Changed dungeon-mana payload: ${spellId}`,
    );
    assert.deepEqual(row.EffectMiscValue, [0, 0], "Changed mana resource type");
    assert.deepEqual(
      [
        row.EffectIndex,
        row.ImplicitTarget,
        row.EffectRadiusIndex,
        row.EffectSpellClassMask,
        row.EffectChainAmplitude,
        row.GroupSizeBasePointsCoefficient,
        row.PvpMultiplier,
        row.EffectBonusCoefficient,
      ],
      [0, [1, 0], [0, 0], [0, 0, 0, 0], 1, 1, 1, aura === 42 ? 1 : 0],
      `Changed dungeon-mana target or coefficients: ${spellId}`,
    );
    for (const key of [
      "Variance",
      "EffectRealPointsPerLevel",
      "EffectAuraPeriod",
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
    ])
      assert.equal(row[key], 0, `Dynamic dungeon-mana effect: ${spellId}/${key}`);
  };
  for (const model of dungeonManaSetModels) {
    const sets = snapshot.sets.filter((set) => set.id === model.id);
    assert.equal(sets.length, 1, "Changed dungeon-mana set definition");
    assert.deepEqual(
      [sets[0].Name_lang, sets[0].RequiredSkill, sets[0].RequiredSkillRank, sets[0].SetFlags],
      [model.name, 0, 0, 0],
      "Changed dungeon-mana set identity or profession requirement",
    );
    const links = snapshot.setEffects.filter(
      (row) => row.ItemSetID === model.id && row.Threshold === 5,
    );
    assert.equal(links.length, 1, "Changed five-piece set threshold");
    assert.deepEqual(
      [links[0].SpellID, links[0].ChrSpecID, links[0].TraitSubTreeID],
      [model.spellId, 0, 0],
      "Changed five-piece spell or specialization restriction",
    );
    const rows = options.filter((row) => row.SpellID === model.spellId && row.DifficultyID === 0);
    assert.equal(rows.length, 1, "Changed dungeon-mana proc options");
    const row = rows[0];
    assert.equal(row.CumulativeAura, 0, "Changed dungeon-mana stacking behavior");
    assert.deepEqual(
      [row.ProcChance, row.ProcCharges, row.ProcCategoryRecovery, row.SpellProcsPerMinuteID],
      [5, 0, 0, 0],
      "Changed dungeon-mana proc rate or cooldown",
    );
    assert.deepEqual(row.ProcTypeMask, [model.procMask, 0], "Changed dungeon-mana trigger mask");
    exactEffect(model.spellId, 6, 42, 200, 450554);
  }
  exactEffect(450554, 30, 0, 200, 0);
  return dungeonManaSetModels.map((model) => ({
    ...model,
    pieces: 5,
    procChancePercent: 5,
    manaPerProc: 200,
    status: "client-supported-model-not-server-verified",
  }));
}
