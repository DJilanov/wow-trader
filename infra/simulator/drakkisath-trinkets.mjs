import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { loadCurrentPrebisEvidence } from "./current-prebis-recovery.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const definitions = [
  {
    itemId: 13965,
    statIndex: 19,
    passiveSpellId: 1318954,
    useSpellId: 1318944,
    unsupportedSpellIds: [1318945],
    recordsSha256: "e3e27868ebadd0697a805fc1804fcc1bc1f83e4f7dd3e6ac45f79e9078985f93",
    notice:
      "Partial current-client model: replaces the historical 2% passive with 1% melee/ranged crit; use grants the wearer 5% attack/spell crit against one marked enemy for 20 seconds (5-minute cooldown, shared 20-second trinket cooldown). The Orc/Ogre doubling and empty scripted spell 1318945 are not modeled. Item metadata and acquisition remain historical/provisional; this is not a complete or server-verified Forever item.",
  },
  {
    itemId: 13968,
    statIndex: 14,
    passiveSpellId: 1318956,
    useSpellId: 1287840,
    unsupportedSpellIds: [1318846],
    recordsSha256: "8e4234fb8a5d54a951dbad89f15f3ef23f4a2325e538d82d75e2417c7ed05ec1",
    notice:
      "Partial current-client model: replaces the historical 2% passive with 1% spell crit; use grants 7% spell hit for 20 seconds (5-minute cooldown, shared 20-second trinket cooldown), with no melee/ranged hit. Empty scripted spell 1318846 is not modeled. Item metadata and acquisition remain historical/provisional; this is not a complete or server-verified Forever item.",
  },
];

export const drakkisathModels = definitions.map((definition) => ({
  ...definition,
  passivePercent: 1,
  durationSeconds: 20,
  cooldownSeconds: 300,
  sharedCooldownSeconds: 20,
  status: "partial-client-effects-historical-metadata",
}));

export function validateDrakkisathClient(tables) {
  const rows = (name) => {
    assert(Array.isArray(tables.get(name)), `Missing Drakkisath evidence ${name}`);
    return tables.get(name);
  };
  return definitions.map((definition) => {
    const links = rows("ItemXItemEffect")
      .filter((row) => row.ItemID === definition.itemId)
      .sort((a, b) => a.id - b.id);
    const effectIds = new Set(links.map((row) => row.ItemEffectID));
    const itemEffects = rows("ItemEffect")
      .filter((row) => effectIds.has(row.id))
      .sort((a, b) => a.id - b.id);
    const spells = new Set(itemEffects.map((row) => row.SpellID));
    const select = (name, key) =>
      rows(name)
        .filter((row) => spells.has(row[key]))
        .sort((a, b) => a.id - b.id);
    const records = {
      links,
      itemEffects,
      spellEffects: select("SpellEffect", "SpellID"),
      options: select("SpellAuraOptions", "SpellID"),
      misc: select("SpellMisc", "SpellID"),
      text: select("Spell", "id"),
      durations: rows("SpellDuration").filter((row) => row.id === 18),
    };
    assert.equal(
      sha(JSON.stringify(records)),
      definition.recordsSha256,
      `Reviewed current Drakkisath effects changed: ${definition.itemId}`,
    );
    return globalThis.structuredClone(
      drakkisathModels.find((model) => model.itemId === definition.itemId),
    );
  });
}

export async function loadDrakkisathEvidence(root, upstream) {
  const evidence = await loadCurrentPrebisEvidence(root, upstream);
  const tables = new Map(evidence.utilityTables);
  const additionalTables = {};
  for (const name of ["Spell", "SpellMisc", "SpellDuration"]) {
    const descriptor = evidence.manifest.tables[name + ".effective"];
    assert.equal(descriptor?.path, `raw/${name}.effective.ndjson.gz`);
    const bytes = await readFile(join(evidence.captureDirectory, descriptor.path));
    assert(bytes.length <= 30_000_000);
    assert.equal(sha(bytes), descriptor.sha256);
    const text = gunzipSync(bytes, { maxOutputLength: 80_000_000 }).toString("utf8").trim();
    const rows = text ? text.split("\n").map((line) => JSON.parse(line)) : [];
    assert.equal(rows.length, descriptor.recordCount);
    tables.set(name, rows);
    additionalTables[name] = descriptor.sha256;
  }
  for (const { itemId } of definitions) {
    assert(!evidence.snapshot.items.some((item) => item.itemId === itemId));
    assert(!evidence.sparse.some((row) => row.id === itemId));
  }
  return {
    schema: "kfc-drakkisath-models.v1",
    models: validateDrakkisathClient(tables),
    checksums: { ...evidence.checksums, additionalTables },
  };
}

export function reconcileDrakkisathPassives(equipment, imports, evidence) {
  assert.equal(evidence.schema, "kfc-drakkisath-models.v1");
  const result = globalThis.structuredClone({ equipment, imports });
  assert.deepEqual(evidence.models, drakkisathModels);
  for (const definition of definitions) {
    const model = evidence.models.find((entry) => entry.itemId === definition.itemId);
    assert(model);
    const item = result.equipment.items.find((entry) => entry.id === model.itemId);
    const metadata = result.imports.items.find((entry) => entry.id === model.itemId);
    assert.equal(item?.type, 12);
    assert.equal(metadata?.status, "classic-provisional");
    assert.equal(item.stats.length, 44);
    assert(
      item.stats.every((value, index) =>
        index === model.statIndex ? value === 2 || value === 1 : value === 0,
      ),
    );
    item.stats[model.statIndex] = model.passivePercent;
    metadata.note = model.notice;
    metadata.effectModel = model;
  }
  return result;
}

export function assertDrakkisathDatabase(db) {
  for (const model of drakkisathModels) {
    const items = db.items.filter((item) => item.id === model.itemId);
    assert.equal(items.length, 1, `Missing current-effect trinket ${model.itemId}`);
    assert.equal(items[0].stats?.length, 44);
    assert(
      items[0].stats.every((value, index) => value === (index === model.statIndex ? 1 : 0)),
      `Trinket ${model.itemId} still has historical or unreviewed stats; rebuild the simulator`,
    );
  }
}

export function patchCasterCritChance(source, kind) {
  const patches = {
    target: [
      "\tBonusSpellDamageTaken float64 // For effects like mob type spell damage bonuses.",
      "\n\tBonusCritChanceTaken  float64 // Caster-specific crit against this defender (aura306).",
    ],
    physical: [
      "\treturn critRating/(CritRatingPerCritChance*100) - attackTable.MeleeCritSuppression",
      " + attackTable.BonusCritChanceTaken",
    ],
    spell: [
      "\t\ttarget.GetSchoolCritTakenChance(spell) +",
      "\n\t\tspell.Unit.AttackTables[target.UnitIndex][spell.CastType].BonusCritChanceTaken +",
    ],
  };
  assert(patches[kind], "Unknown caster-crit patch");
  const [original, suffix] = patches[kind];
  const fixed = original + suffix;
  if (source.split(fixed).length === 2) return source;
  assert.equal(source.split(original).length, 2, `Caster-crit ${kind} source changed`);
  return source.replace(original, fixed);
}

export async function prepareDrakkisathTrinkets(root, upstream) {
  const evidence = await loadDrakkisathEvidence(root, upstream);
  for (const [file, kinds] of [
    ["target.go", ["target"]],
    ["spell_result.go", ["physical", "spell"]],
  ]) {
    const path = join(upstream, "sim/core", file);
    const original = await readFile(path, "utf8");
    let source = original;
    for (const kind of kinds) source = patchCasterCritChance(source, kind);
    if (source !== original) await writeFile(path, source);
  }
  for (const file of ["drakkisath-trinkets.go", "drakkisath-trinkets_test.go"])
    await copyFile(
      join(root, "infra/simulator", file),
      join(upstream, "sim/common/kfc_" + file.replaceAll("-", "_")),
    );
  await writeFile(join(upstream, "ui/core/kfc_drakkisath_models.json"), JSON.stringify(evidence));
  return evidence;
}
