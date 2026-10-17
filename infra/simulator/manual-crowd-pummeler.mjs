import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { loadCurrentPrebisEvidence } from "./current-prebis-recovery.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const manualCrowdOriginalSha256 =
  "eca81fda34cf6ae3d3c65028aabf3bea8534a08384eeeb6aa5fac9ffb36f7c6f";
const replacement = "\tcore.NewItemEffect(ManualCrowdPummeler, kfcRegisterManualCrowdPummeler)\n\n";

export function patchManualCrowdPummeler(source) {
  const marker = "\tcore.NewItemEffect(ManualCrowdPummeler,";
  assert.equal(source.split(marker).length, 2, "MCP registration missing or duplicated");
  const start = source.indexOf(marker);
  const end = source.indexOf("\n\t// https://www.wowhead.com/classic/item=12794/", start);
  assert(end > start, "MCP registration boundary changed");
  const block = source.slice(start, end);
  if (block === replacement) return source;
  assert.equal(sha(block), manualCrowdOriginalSha256, "Reviewed MCP handler changed");
  return source.slice(0, start) + replacement + source.slice(end);
}

export function validateManualCrowdClient(snapshot, sparse, tables) {
  assert.equal(snapshot.schema, "forever-client-mechanics.v1");
  assert.equal(snapshot.clientVersion, "1.60.1.70425");
  const one = (name, predicate) => {
    const rows = tables.get(name).filter(predicate);
    assert.equal(rows.length, 1, `Changed MCP ${name} row count`);
    return rows[0];
  };
  const items = snapshot.items.filter((item) => item.itemId === 9449);
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].effectIds, [98990]);
  assert.deepEqual(items[0].issues, []);
  const raw = sparse.filter((row) => row.id === 9449);
  assert.equal(raw.length, 1);
  assert.deepEqual([raw[0].MaxCount, raw[0].Stackable, raw[0].InventoryType], [1, 1, 17]);
  assert.deepEqual(
    one("ItemXItemEffect", (row) => row.ItemID === 9449),
    { id: 93413, ItemEffectID: 98990, ItemID: 9449 },
  );
  assert.deepEqual(
    one("ItemEffect", (row) => row.id === 98990),
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
  );
  const effect = one("SpellEffect", (row) => row.SpellID === 13494);
  assert.deepEqual(
    [
      effect.DifficultyID,
      effect.EffectIndex,
      effect.Effect,
      effect.EffectAura,
      effect.EffectBasePointsF,
      effect.ImplicitTarget,
      effect.EffectMiscValue,
      effect.EffectRadiusIndex,
      effect.EffectSpellClassMask,
    ],
    [0, 0, 6, 319, 50, [1, 0], [0, 0], [0, 0], [0, 0, 0, 0]],
    "Changed MCP haste payload/target",
  );
  for (const key of [
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
  ])
    assert.equal(effect[key], 0, `Dynamic MCP payload: ${key}`);
  for (const key of [
    "EffectAmplitude",
    "EffectChainAmplitude",
    "PvpMultiplier",
    "GroupSizeBasePointsCoefficient",
  ])
    assert.equal(effect[key], 1, `Changed MCP multiplier: ${key}`);
  const options = one("SpellAuraOptions", (row) => row.SpellID === 13494);
  assert.deepEqual(
    [
      options.DifficultyID,
      options.CumulativeAura,
      options.ProcCategoryRecovery,
      options.ProcChance,
      options.ProcCharges,
      options.SpellProcsPerMinuteID,
      options.ProcTypeMask,
    ],
    [0, 0, 0, 101, 0, 0, [0, 0]],
    "Changed MCP stacking/proc options",
  );
  const misc = one("SpellMisc", (row) => row.SpellID === 13494);
  const attributes = Array(17).fill(0);
  attributes[15] = 8192;
  assert.deepEqual(
    [
      misc.DifficultyID,
      misc.DurationIndex,
      misc.PvPDurationIndex,
      misc.MinDuration,
      misc.CastingTimeIndex,
      misc.RangeIndex,
      misc.SchoolMask,
      misc.Attributes,
    ],
    [0, 9, 0, 0, 1, 1, 1, attributes],
    "Changed MCP spell duration or conditions",
  );
  assert.deepEqual(
    one("SpellDuration", (row) => row.id === 9),
    { id: 9, Duration: 30000, MaxDuration: 30000, DurationPerResource: 0 },
  );
  return {
    itemId: 9449,
    spellId: 13494,
    durationSeconds: 30,
    cooldownSeconds: 180,
    chargesPerItem: 3,
    maxOwned: 1,
    meleeSpeedMultiplier: 1.5,
    affectsRanged: false,
    status: "client-supported-model-not-server-verified",
    notice:
      "Current-client MCP model: 50% melee attack speed for 30 seconds, 3-minute cooldown, at most three uses per encounter/item and no inventory swapping. No ranged haste is assigned to aura319. Charges reset between independent simulated encounters; server behavior remains unverified. Classic behavior is unchanged.",
    auraSemanticsReference:
      "https://github.com/TrinityCore/TrinityCore/blob/master/src/server/game/Spells/Auras/SpellAuraDefines.h",
  };
}

export async function loadManualCrowdEvidence(root, upstream) {
  const evidence = await loadCurrentPrebisEvidence(root, upstream);
  const additional = await Promise.all(
    ["SpellMisc", "SpellDuration"].map(async (name) => {
      const descriptor = evidence.manifest.tables[name + ".effective"];
      assert.equal(descriptor?.path, `raw/${name}.effective.ndjson.gz`);
      const bytes = await readFile(join(evidence.captureDirectory, descriptor.path));
      assert(bytes.length <= 30_000_000);
      assert.equal(sha(bytes), descriptor.sha256);
      const text = gunzipSync(bytes, { maxOutputLength: 80_000_000 }).toString("utf8").trim();
      const rows = text ? text.split("\n").map((line) => JSON.parse(line)) : [];
      assert.equal(rows.length, descriptor.recordCount);
      return { name, rows, sha256: descriptor.sha256 };
    }),
  );
  const tables = new Map(evidence.utilityTables);
  for (const table of additional) tables.set(table.name, table.rows);
  return {
    schema: "kfc-mcp-model.v1",
    model: validateManualCrowdClient(evidence.snapshot, evidence.sparse, tables),
    checksums: {
      ...evidence.checksums,
      additionalTables: Object.fromEntries(additional.map((table) => [table.name, table.sha256])),
    },
  };
}

export async function prepareManualCrowdPummeler(root, upstream) {
  const evidence = await loadManualCrowdEvidence(root, upstream);
  const path = join(upstream, "sim/common/item_effects.go");
  const source = await readFile(path, "utf8");
  const fixed = patchManualCrowdPummeler(source);
  await copyFile(
    join(root, "infra/simulator/manual-crowd-pummeler.go"),
    join(upstream, "sim/common/kfc_manual_crowd_pummeler.go"),
  );
  await copyFile(
    join(root, "infra/simulator/manual-crowd-pummeler_test.go"),
    join(upstream, "sim/common/kfc_manual_crowd_pummeler_test.go"),
  );
  if (source !== fixed) await writeFile(path, fixed);
  await writeFile(join(upstream, "ui/core/kfc_mcp_model.json"), JSON.stringify(evidence));
  return evidence;
}
