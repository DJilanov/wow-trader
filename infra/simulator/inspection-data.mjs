import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import process from "node:process";
import { equipmentOwnership } from "./equipment-ownership.mjs";

export const inspectionSource = {
  build: "1.60.1.70425",
  hotfix: "8464d7adbd3e6aba33b8c8ccefe6085c7b5c2ac0672685cbfb7e8671b01fffb8",
  manifestSha256: "89ab45e5831a45d32fba9db6982c63e307348f2b2d9cfcef7db9a2b1ad942f72",
};
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const statIndex = { 0: 23, 1: 34, 3: 1, 4: 0, 5: 3, 6: 4, 7: 2, 12: 28, 38: 17, 39: 27, 51: 36 };
const schools = [
  [64, 35],
  [4, 36],
  [16, 37],
  [8, 38],
  [32, 39],
];
const powers = [
  [64, 6],
  [4, 7],
  [16, 8],
  [2, 9],
  [8, 10],
  [32, 11],
];
const utilityAuras = new Set([31, 130, 154]);
const scripted = new Set([
  32, 33, 34, 249, 250, 241, 663, 664, 805, 853, 854, 931, 943, 1897, 2523, 2543, 2613, 2621, 8720,
  8721,
]);
const provisional = new Set([36, 803, 1898, 1900]);

export function enchantKey(enchant) {
  return `${enchant.effectId}:${enchant.spellId || 0}:${enchant.type}`;
}

// Only flat, fully resolved payloads are normalized here. Scripted effects stay in Go.
export function resolveEnchantStats(row, effects) {
  const stats = Array(44).fill(0);
  let utility = false;
  const add = (index, amount) => {
    if (index === undefined || !Number.isFinite(amount)) throw new Error("Unknown enchant stat");
    stats[index] += amount;
  };
  const aura = (effect) => {
    const value = effect.EffectBasePointsF;
    const misc = effect.EffectMiscValue?.[0];
    if (
      effect.Effect !== 6 ||
      effect.EffectRealPointsPerLevel ||
      effect.ScalingClass ||
      effect.Variance
    )
      throw new Error("Dynamic enchant payload");
    switch (effect.EffectAura) {
      case 29:
        if (misc === -1) for (let i = 0; i < 5; i++) add(i, value);
        else if (misc >= 0 && misc < 5) add(misc, value);
        else throw new Error("Unknown primary stat");
        break;
      case 22:
        for (const [mask, index] of schools) if (misc & mask) add(index, value);
        break;
      case 13:
        if (misc === 126) add(42, value);
        else for (const [mask, index] of powers) if (misc & mask) add(index, value);
        break;
      case 135:
        add(41, value);
        break;
      case 34:
        add(34, value);
        break;
      case 35:
        add(23, value);
        break;
      case 49:
        add(31, value);
        break;
      case 51:
        add(29, value);
        break;
      case 52:
        add(19, value);
        break;
      case 54:
        add(18, value);
        add(13, value);
        break;
      case 55:
        add(13, value);
        break;
      case 57:
        add(14, value);
        break;
      case 85:
        add(12, effect.EffectAuraPeriod ? (value * 5000) / effect.EffectAuraPeriod : value);
        break;
      case 99:
        add(17, value);
        break;
      case 124:
        add(27, value);
        break;
      case 274:
        add(30, value);
        break;
      case 674:
        add(40, value);
        break;
      case 30:
        if (misc === 95) add(28, value);
        else utility = true;
        break;
      default:
        if (utilityAuras.has(effect.EffectAura)) utility = true;
        else throw new Error(`Unmapped aura ${effect.EffectAura}`);
    }
  };
  try {
    if (row.Condition_ID || row.ScalingClass || row.EffectScalingPoints?.some(Boolean))
      throw new Error("Conditional enchant payload");
    row.Effect.forEach((type, index) => {
      const argument = row.EffectArg[index],
        amount = row.EffectPointsMin[index];
      if (!type) return;
      if (type === 4) add(40, amount);
      else if (type === 5) {
        add(statIndex[argument], amount);
        if (argument === 38) add(27, amount);
      } else if (type === 3) {
        const children = effects.get(argument);
        if (!children?.length) throw new Error("Missing passive spell");
        children.forEach(aura);
      } else throw new Error(`Scripted enchant type ${type}`);
    });
    return {
      stats,
      status: utility ? "utility" : "static",
      reason: utility
        ? "Utility effects do not contribute to combat results."
        : "Client-resolved static bonuses.",
    };
  } catch (error) {
    return { stats: null, status: "unsupported", reason: error.message };
  }
}

function indexRows(rows) {
  return new Map(rows.map((row) => [row.id, row]));
}

export function buildInspectionData(db, tables) {
  const rows = (name) => tables.get(name) ?? [];
  const enchants = indexRows(rows("SpellItemEnchantment"));
  const spellEffects = new Map();
  for (const effect of rows("SpellEffect")) {
    const values = spellEffects.get(effect.SpellID) ?? [];
    if (!effect.DifficultyID) values.push(effect);
    spellEffects.set(effect.SpellID, values);
  }
  const spellNames = indexRows(rows("SpellName"));
  const sparse = indexRows(rows("ItemSparse"));
  const itemEffects = indexRows(rows("ItemEffect"));
  const effectsByItem = new Map();
  for (const link of rows("ItemXItemEffect")) {
    const itemId = link.ItemID;
    const effect = itemEffects.get(link.ItemEffectID);
    if (effect) effectsByItem.set(itemId, [...(effectsByItem.get(itemId) ?? []), effect]);
  }
  const name = (id) => spellNames.get(id)?.Name_lang || `Spell ${id}`;
  const result = {
    schema: "kfc-inspection.v1",
    source: inspectionSource,
    enchants: {},
    items: {},
    sets: {},
  };
  for (const enchant of db.enchants) {
    const row = enchants.get(enchant.effectId);
    if (!row) throw new Error(`Client enchant missing: ${enchant.effectId}`);
    const resolved = resolveEnchantStats(row, spellEffects);
    if (scripted.has(enchant.effectId))
      Object.assign(resolved, {
        stats: null,
        status: "scripted",
        reason:
          "Implemented engine effect; trigger and combat scope are handled separately from static stats.",
      });
    if (provisional.has(enchant.effectId))
      Object.assign(resolved, {
        stats: null,
        status: "provisional",
        reason:
          "Existing engine proc model; current Forever proc cadence is unverified. Explicit opt-in required.",
      });
    if (enchant.effectId === 8217)
      Object.assign(resolved, {
        stats: null,
        status: "provisional",
        reason:
          "Revelation requires an explicitly enabled provisional model and supported class payload.",
      });
    const before = enchant.stats ?? [];
    if (resolved.stats) enchant.stats = resolved.stats;
    enchant.requiredLevel = row.MinLevel || 0;
    enchant.itemLevelMin = row.ItemLevelMin || 0;
    const entry = {
      effectId: enchant.effectId,
      spellId: enchant.spellId || 0,
      type: enchant.type,
      name: enchant.name,
      label: row.Name_lang || enchant.name,
      status: resolved.status,
      reason: resolved.reason,
      stats: enchant.stats ?? Array(44).fill(0),
      changed: Boolean(
        resolved.stats && resolved.stats.some((value, i) => value !== (before[i] || 0)),
      ),
      minLevel: row.MinLevel || 0,
      maxLevel: row.MaxLevel || 0,
      itemLevelMin: row.ItemLevelMin || 0,
      itemLevelMax: row.ItemLevelMax || 0,
      requiredSkill: row.RequiredSkillID || 0,
      requiredSkillRank: row.RequiredSkillRank || 0,
      condition: row.Condition_ID || 0,
      description: row.Effect.flatMap((type, i) =>
        type === 1 || type === 3 ? [name(row.EffectArg[i])] : [],
      ),
      extraTypes: enchant.extraTypes ?? [],
      enchantType: enchant.enchantType || 0,
      armorTypes: enchant.armorTypes ?? [],
      classAllowlist: enchant.classAllowlist ?? [],
      requiredProfession: enchant.requiredProfession || 0,
    };
    result.enchants[enchantKey(enchant)] = entry;
  }
  for (const item of db.items) {
    const row = sparse.get(item.id);
    result.items[item.id] = {
      setId: row?.ItemSet || item.setId || 0,
      binding: row?.Bonding || 0,
      requiredLevel: row?.RequiredLevel || 0,
      effects: (effectsByItem.get(item.id) ?? []).map((effect) => ({
        spellId: effect.SpellID,
        name: name(effect.SpellID),
        trigger: effect.TriggerType,
      })),
    };
  }
  const rawSets = indexRows(rows("ItemSet"));
  for (const setId of new Set(
    Object.values(result.items)
      .map((item) => item.setId)
      .filter(Boolean),
  )) {
    result.sets[setId] = {
      name: rawSets.get(setId)?.Name_lang || `Set ${setId}`,
      effects: rows("ItemSetSpell")
        .filter((row) => row.ItemSetID === setId)
        .map((row) => ({
          threshold: row.Threshold,
          spellId: row.SpellID,
          name: name(row.SpellID),
        }))
        .sort((a, b) => a.threshold - b.threshold),
    };
  }
  return result;
}

export async function prepareInspectionData(repo, upstream) {
  const parent = resolve(
    process.env.FOREVER_SIMULATOR_MECHANICS_ROOT ||
      join(repo, "artifacts/forever-mechanics/70425", inspectionSource.hotfix),
  );
  const candidates = (await readdir(parent)).filter((path) => path.startsWith("mechanics-"));
  let tables;
  for (const candidate of candidates.sort()) {
    const directory = join(parent, candidate);
    const manifestBytes = await readFile(join(directory, "manifest.json"));
    if (digest(manifestBytes) !== inspectionSource.manifestSha256) continue;
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    if (
      manifest.build.clientVersion !== inspectionSource.build ||
      manifest.hotfixSha256 !== inspectionSource.hotfix
    )
      continue;
    tables = new Map();
    for (const name of [
      "SpellItemEnchantment",
      "SpellEffect",
      "SpellName",
      "ItemSparse",
      "ItemEffect",
      "ItemXItemEffect",
      "ItemSet",
      "ItemSetSpell",
    ]) {
      const descriptor = manifest.tables[`${name}.effective`];
      if (!descriptor || descriptor.path !== `raw/${name}.effective.ndjson.gz`)
        throw new Error(`Missing inspection evidence ${name}`);
      const bytes = await readFile(join(directory, descriptor.path));
      if (bytes.length > 30_000_000 || digest(bytes) !== descriptor.sha256)
        throw new Error(`Inspection checksum mismatch: ${name}`);
      const text = gunzipSync(bytes, { maxOutputLength: 80_000_000 }).toString("utf8").trim();
      const rows = text ? text.split("\n").map((line) => JSON.parse(line)) : [];
      if (rows.length !== descriptor.recordCount)
        throw new Error(`Inspection row count mismatch: ${name}`);
      tables.set(name, rows);
    }
    break;
  }
  if (!tables)
    throw new Error(
      `Import the reviewed ${inspectionSource.build} mechanics capture before preparing inspection data`,
    );
  const db = JSON.parse(await readFile(join(upstream, "assets/database/db.json"), "utf8"));
  const data = buildInspectionData(db, tables);
  const mcp = JSON.parse(await readFile(join(upstream, "ui/core/kfc_mcp_model.json"), "utf8"));
  if (mcp.schema !== "kfc-mcp-model.v1" || mcp.model.itemId !== 9449 || !data.items[9449])
    throw new Error("Missing reviewed Manual Crowd Pummeler model");
  data.items[9449].modelNote = mcp.model.notice;
  const prebis = JSON.parse(
    await readFile(join(upstream, "ui/core/kfc_prebis_import.json"), "utf8"),
  );
  const catalog = JSON.parse(
    await readFile(join(upstream, "assets/db_inputs/forever_gear_catalog.json"), "utf8"),
  );
  for (const item of catalog.items) {
    if (data.items[item.id])
      Object.assign(data.items[item.id], { limitCategory: item.limitCategory || 0 });
  }
  for (const item of prebis.items) {
    if (!data.items[item.id]) throw new Error(`Missing admitted Classic candidate ${item.id}`);
    Object.assign(data.items[item.id], {
      provenance: item.status,
      provenanceNote:
        item.note + " Exact level requirement is unverified; candidates are evaluated at level 60.",
      requiredLevel: 0,
      questChoice: item.questChoice,
      ...(item.effectModel ? { modelNote: item.effectModel.notice } : {}),
    });
  }
  for (const item of prebis.currentItems ?? []) {
    if (!data.items[item.id]) throw new Error(`Missing recovered current candidate ${item.id}`);
    Object.assign(data.items[item.id], {
      provenance: item.status,
      provenanceNote: item.note,
      requiredLevel: item.requiredLevel,
      setId: item.setId,
      limitCategory: item.limitCategory,
    });
  }
  const sources = new Map(
    [...catalog.items, ...prebis.items, ...(prebis.currentItems ?? [])].map((item) => [
      item.id,
      item,
    ]),
  );
  for (const item of db.items)
    Object.assign(data.items[item.id], equipmentOwnership(item, sources.get(item.id)));
  await writeFile(join(upstream, "ui/core/kfc_inspection.json"), JSON.stringify(data));
  await writeFile(
    join(upstream, "sim/core/kfc_enchant_rules.json"),
    JSON.stringify(Object.values(data.enchants)),
  );
  const replacements = db.enchants.map((enchant) => {
    const entry = data.enchants[enchantKey(enchant)];
    return `if e.EffectId == ${enchant.effectId} && e.SpellId == ${enchant.spellId || 0} && int32(e.Type) == ${enchant.type} { e.Stats = []float64{${entry.stats.join(",")}}; e.RequiredLevel = ${entry.minLevel}; e.ItemLevelMin = ${entry.itemLevelMin} }`;
  });
  await writeFile(
    join(upstream, "tools/database/kfc_enchants_generated.go"),
    `package database\n\nfunc ApplyKfcEnchantAudit(db *WowDatabase) { for _, e := range db.Enchants { ${replacements.join("\n")} } }\n`,
  );
  return data;
}
