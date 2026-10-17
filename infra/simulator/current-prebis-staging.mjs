import assert from "node:assert/strict";
import {
  classicPreRaidEvidence,
  classicReferenceRevision,
  classicReferenceSha256,
} from "./classic-acquisition.mjs";

const flatStats = {
  0: 23,
  1: 34,
  3: 1,
  4: 0,
  5: 3,
  6: 4,
  7: 2,
  38: 17,
  39: 27,
  41: 41,
  42: 42,
  43: 12,
  45: 5,
  47: 16,
  48: 30,
  50: 40,
  51: 36,
  52: 37,
  54: 39,
  55: 38,
  56: 35,
  84: 9,
  85: 7,
  86: 10,
  87: 8,
  88: 11,
  89: 6,
};
const ratingStats = {
  12: [28, "Defense Skill"],
  13: [31, "Dodge"],
  14: [32, "Parry"],
  15: [29, "Block"],
  31: [18, "Hit - Melee"],
  32: [19, "Crit - Melee"],
};
const inventoryTypes = {
  1: 1,
  2: 2,
  3: 3,
  5: 5,
  6: 8,
  7: 9,
  8: 10,
  9: 6,
  10: 7,
  11: 11,
  12: 12,
  16: 4,
  20: 5,
};
const weaponTypes = { 0: 1, 1: 1, 4: 4, 5: 4, 6: 6, 7: 9, 8: 9, 10: 8, 13: 3, 15: 2 };
const rangedTypes = { 2: 1, 18: 2, 3: 3, 16: 6, 19: 8 };
const classMasks = { 1: 9, 2: 4, 4: 2, 8: 6, 16: 5, 64: 7, 128: 3, 256: 8, 1024: 1 };

export function currentLevel60Ratings(text) {
  const [header, ...lines] = text
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/);
  const keys = header.split("\t");
  assert.equal(new Set(keys).size, keys.length, "Repeated combat rating column");
  const level = keys.indexOf("Level");
  assert(level >= 0, "Missing rating level column");
  const rows = lines.map((line) => line.split("\t")).filter((row) => Number(row[level]) === 60);
  assert.equal(rows.length, 1, "Expected exactly one level-60 rating row");
  assert.equal(rows[0].length, keys.length, "Incomplete combat rating row");
  const result = Object.fromEntries(keys.map((key, index) => [key, Number(rows[0][index])]));
  delete result.Level;
  for (const [, name] of Object.values(ratingStats))
    assert(Number.isFinite(result[name]) && result[name] > 0, `Invalid combat rating ${name}`);
  return result;
}

function reviewedPassiveUtility(current, tables) {
  assert(Array.isArray(current.effectIds), "Missing current item-effect identities");
  if (current.effectIds.length === 0) return [];
  if (current.itemId !== 10776 || !tables) return null;
  assert(tables instanceof Map, "Invalid utility review tables");
  assert.equal(current.name, "Silky Spider Cape", "Reviewed utility item identity changed");
  assert.deepEqual(current.effectIds, [233785], "Reviewed utility item effects changed");
  for (const name of ["ItemXItemEffect", "ItemEffect", "SpellEffect", "SpellAuraOptions"])
    assert(Array.isArray(tables.get(name)), `Missing utility review table ${name}`);
  const links = tables.get("ItemXItemEffect").filter((row) => row.ItemID === 10776);
  assert.deepEqual(
    links.map((row) => row.ItemEffectID),
    [233785],
    "Utility item links changed",
  );
  const items = tables.get("ItemEffect").filter((row) => row.id === 233785);
  assert.equal(items.length, 1, "Missing or repeated utility ItemEffect");
  const effect = items[0];
  assert.deepEqual(
    [
      effect.SpellID,
      effect.TriggerType,
      effect.Charges,
      effect.CoolDownMSec,
      effect.CategoryCoolDownMSec,
      effect.SpellCategoryID,
      effect.ChrSpecializationID,
      effect.PlayerConditionID,
    ],
    [1293819, 1, 0, -1, -1, 0, 0, 0],
    "Utility effect acquired an on-use, cooldown or condition",
  );
  assert.deepEqual(
    tables.get("SpellAuraOptions").filter((row) => row.SpellID === 1293819),
    [],
    "Utility spell acquired proc or stacking options",
  );
  const rows = tables
    .get("SpellEffect")
    .filter((row) => row.SpellID === 1293819)
    .sort((a, b) => a.EffectIndex - b.EffectIndex);
  assert.equal(rows.length, 2, "Utility effect payload count changed");
  for (const [index, row] of rows.entries()) {
    assert.deepEqual(
      [
        row.DifficultyID,
        row.EffectIndex,
        row.Effect,
        row.EffectAura,
        row.EffectBasePointsF,
        row.EffectMiscValue,
        row.ImplicitTarget,
        row.EffectSpellClassMask,
        row.EffectChainAmplitude,
        row.GroupSizeBasePointsCoefficient,
        row.PvpMultiplier,
      ],
      [0, index, 6, 232, -7, [index === 0 ? 11 : 7, 0], [1, 0], [0, 0, 0, 0], 1, 1, 1],
      "Reviewed utility payload or target changed",
    );
    for (const field of [
      "Variance",
      "ScalingClass",
      "EffectRealPointsPerLevel",
      "EffectPointsPerResource",
      "EffectBonusCoefficient",
      "Coefficient",
      "BonusCoefficientFromAP",
      "ResourceCoefficient",
      "EffectAuraPeriod",
      "EffectTriggerSpell",
      "EffectAttributes",
      "EffectMechanic",
      "EffectChainTargets",
    ])
      assert.equal(row[field], 0, `Dynamic or additional utility behavior: ${field}`);
  }
  return [
    {
      itemEffectId: 233785,
      spellId: 1293819,
      status: "passive-utility-not-modeled",
      mechanicIds: [7, 11],
      durationReductionPercent: 7,
      zeroContributionScope: "Stationary encounter without root or snare mechanics only.",
    },
  ];
}

export function normalizeCurrentPrebisItem(
  current,
  sparse,
  historical,
  coefficients,
  sets,
  utilityTables,
) {
  for (const field of ["itemId", "itemLevel", "inventoryType", "classId", "subclassId", "quality"])
    assert(
      Number.isSafeInteger(current[field]) && current[field] >= 0,
      `Invalid current item field ${field}`,
    );
  assert(
    current.itemId > 0 &&
      current.itemLevel > 0 &&
      typeof current.name === "string" &&
      current.name.length > 0,
  );
  assert.equal(current.itemId, historical.id, "Current/historical identity mismatch");
  assert.equal(sparse.id, current.itemId, "Missing current ItemSparse metadata");
  assert.equal(sparse.Display_lang, current.name, "Current name differs between captures");
  for (const [raw, normalized] of [
    ["ItemLevel", "itemLevel"],
    ["InventoryType", "inventoryType"],
    ["RequiredLevel", "requiredLevel"],
    ["OverallQualityID", "quality"],
  ])
    assert.equal(sparse[raw], current[normalized], `Current metadata changed: ${raw}`);
  assert.equal(sparse.ItemSet, current.setId ?? 0, "Current item set changed");
  assert.deepEqual(current.issues, [], "Unresolved current item values");
  assert(
    reviewedPassiveUtility(current, utilityTables) !== null,
    "Current item effects need a runtime review",
  );
  assert(Array.isArray(current.stats));
  assert(
    Number.isInteger(current.requiredLevel) &&
      current.requiredLevel >= 0 &&
      current.requiredLevel <= 60,
  );
  assert(Number.isFinite(current.armor) && current.armor >= 0, "Missing current armor");
  assert.equal(sparse.RequiredSkill, 0, "Current profession lock needs review");
  assert.equal(sparse.RequiredAbility, 0, "Current ability lock needs review");
  assert.equal(sparse.LimitCategory, 0, "Current unique category needs resolution");
  assert(
    Array.isArray(sparse.Flags) &&
      sparse.Flags.length > 0 &&
      sparse.Flags.every(Number.isSafeInteger),
  );
  assert(
    Array.isArray(sparse.SocketType) && sparse.SocketType.every((value) => value === 0),
    "Current sockets need resolution",
  );
  assert(
    Array.isArray(sparse.AllowableRace) &&
      sparse.AllowableRace.length === 2 &&
      sparse.AllowableRace.every((value) => value === -1 || value === 0),
    "Current race restriction needs review",
  );
  assert(Number.isInteger(sparse.MaxCount) && sparse.MaxCount >= 0);
  const stats = Array(44).fill(0);
  for (const stat of current.stats) {
    assert(
      Number.isSafeInteger(stat.statType) && Number.isFinite(stat.value) && stat.value >= 0,
      "Invalid current stat",
    );
    const rating = ratingStats[stat.statType];
    const index = flatStats[stat.statType] ?? rating?.[0];
    assert(index !== undefined, `Unsupported current item modifier ${stat.statType}`);
    const divisor = rating ? coefficients[rating[1]] : 1;
    assert(Number.isFinite(divisor) && divisor > 0, "Invalid level-60 rating divisor");
    stats[index] += stat.value / divisor;
  }
  // Universal hit/crit are populated once; the engine shares them with spells.
  stats[26] = current.armor;
  stats[27] += stats[17];
  assert(/^[a-z0-9_]+$/i.test(historical.icon ?? ""), "Missing reviewed item icon");
  const item = {
    id: current.itemId,
    name: current.name,
    icon: historical.icon,
    type: inventoryTypes[current.inventoryType] ?? 0,
    stats,
    ilvl: current.itemLevel,
    quality: current.quality,
    phase: 1,
    expansion: 1,
  };
  if (current.classId === 4 && [1, 2, 3, 4].includes(current.subclassId))
    item.armorType = current.subclassId;
  if ([14, 23].includes(current.inventoryType))
    Object.assign(item, {
      type: 13,
      weaponType: current.inventoryType === 14 ? 7 : 5,
      handType: 3,
    });
  else if (current.classId === 2) {
    const ranged = rangedTypes[current.subclassId];
    if (ranged) Object.assign(item, { type: 14, rangedWeaponType: ranged });
    else {
      const weapon = weaponTypes[current.subclassId],
        hand = { 13: 2, 17: 4, 21: 1, 22: 3 }[current.inventoryType];
      assert(weapon && hand, "Unsupported current weapon identity");
      Object.assign(item, { type: 13, weaponType: weapon, handType: hand });
    }
    const damage = current.weapon;
    assert(
      damage &&
        Number.isFinite(damage.minimum) &&
        Number.isFinite(damage.maximum) &&
        damage.minimum >= 0 &&
        damage.maximum >= damage.minimum &&
        Number.isFinite(damage.speedSeconds) &&
        damage.speedSeconds > 0,
      "Unresolved current weapon damage/speed",
    );
    assert.equal(sparse.DamageType, 0, "Non-physical base weapon damage needs review");
    assert(
      Number.isFinite(sparse.ItemDelay) &&
        Math.abs(damage.speedSeconds * 1000 - sparse.ItemDelay) < 0.000001,
      "Current weapon speed differs between captures",
    );
    Object.assign(item, {
      weaponDamageMin: damage.minimum,
      weaponDamageMax: damage.maximum,
      weaponSpeed: damage.speedSeconds,
    });
  }
  assert(item.type > 0 && [2, 4].includes(current.classId), "Unsupported current equipment kind");
  assert(
    Number.isInteger(sparse.AllowableClass) &&
      (sparse.AllowableClass === -1 || sparse.AllowableClass > 0),
    "Unresolved current class mask",
  );
  if (sparse.AllowableClass > 0) {
    const supported = Object.keys(classMasks).reduce((mask, bit) => mask | Number(bit), 0);
    assert(
      sparse.AllowableClass <= supported && (sparse.AllowableClass & ~supported) === 0,
      "Unsupported class mask bits",
    );
    item.classAllowlist = Object.entries(classMasks)
      .filter(([bit]) => sparse.AllowableClass & Number(bit))
      .map(([, value]) => value);
  }
  if (sparse.MaxCount === 1 || (sparse.Flags[0] & 0x80000) !== 0) item.unique = true;
  if (current.setId) {
    const set = sets.get(current.setId);
    assert(
      set &&
        typeof set.Name_lang === "string" &&
        set.Name_lang.length > 0 &&
        set.ItemID?.includes(current.itemId),
      "Missing current set membership",
    );
    Object.assign(item, { setId: current.setId, setName: set.Name_lang });
  }
  return item;
}

export function stageCurrentPrebisRecovery(
  snapshot,
  reference,
  sparseRows,
  existingIds,
  coefficients,
  utilityTables,
) {
  assert.equal(snapshot.schema, "forever-client-mechanics.v1");
  assert.equal(snapshot.clientVersion, "1.60.1.70425");
  assert.equal(reference.schema, "kfc-classic-pre-raid-equipment.v1");
  assert.equal(reference.revision, classicReferenceRevision);
  assert.equal(reference.sourceSha256, classicReferenceSha256);
  const current = new Map(snapshot.items.map((item) => [item.itemId, item]));
  assert.equal(current.size, snapshot.items.length, "Repeated current item identity");
  const sparse = new Map(sparseRows.map((item) => [item.id, item]));
  assert.equal(sparse.size, sparseRows.length, "Repeated ItemSparse identity");
  const sets = new Map(snapshot.sets.map((set) => [set.id, set]));
  assert.equal(sets.size, snapshot.sets.length, "Repeated current set identity");
  const seen = new Set(),
    candidates = [],
    blocked = [];
  for (const entry of reference.items) {
    const id = entry.item.id;
    assert(!seen.has(id), "Repeated historical identity");
    seen.add(id);
    const paths = reference.presets
      .filter((preset) => preset.ids.includes(id))
      .map((preset) => preset.resource);
    const evidence = classicPreRaidEvidence(entry.item, paths);
    assert(evidence.allowed, "Unreviewed non-raid acquisition");
    assert.deepEqual(entry.evidence, evidence, "Historical acquisition changed");
    const row = current.get(id);
    if (!row || existingIds.has(id)) continue;
    const metadata = sparse.get(id);
    const effectReviews = reviewedPassiveUtility(row, utilityTables);
    const unsupported = row.stats.filter(
      (stat) => flatStats[stat.statType] === undefined && !ratingStats[stat.statType],
    );
    if (!metadata || effectReviews === null || unsupported.length) {
      blocked.push({
        id,
        name: row.name,
        reason: !metadata
          ? "current-metadata-missing"
          : effectReviews === null
            ? "current-effects-unreviewed"
            : "current-stats-unmodeled",
        effectIds: row.effectIds,
        unsupportedModifiers: unsupported.map((stat) => stat.statType),
      });
      continue;
    }
    const item = normalizeCurrentPrebisItem(
      row,
      metadata,
      entry.item,
      coefficients,
      sets,
      utilityTables,
    );
    candidates.push({
      item,
      status: "staged-not-admitted",
      ...(effectReviews.length ? { effectReviews } : {}),
      currentMetadata: {
        requiredLevel: metadata.RequiredLevel,
        binding: metadata.Bonding,
        maxCount: metadata.MaxCount,
        uniqueEquipped: (metadata.Flags[0] & 0x80000) !== 0,
        classMask: metadata.AllowableClass,
        raceMasks: metadata.AllowableRace,
        requiredPvpRank: metadata.RequiredPVPRank,
        limitCategory: metadata.LimitCategory,
        setId: metadata.ItemSet,
      },
      historicalAcquisition: evidence,
      ...(entry.item.sources ? { historicalSources: entry.item.sources } : {}),
      reviewRequired: [
        ...(effectReviews.length ? ["unmodeled-utility-disclosure"] : []),
        ...(item.setId ? ["current-set-runtime"] : []),
        ...(entry.item.sources?.some((source) => source.soldBy)
          ? ["historical-vendor-access-and-faction"]
          : []),
        "provisional-Forever-acquisition",
      ],
    });
  }
  return { candidates, blocked };
}
