import { createHash } from "node:crypto";

/** @param {unknown} value @returns {Record<string, unknown>} */
function object(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected a valuation evidence object.");
  return value;
}

/** @param {unknown} value @param {number} minimum @returns {number} */
function integer(value, minimum = 0) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum)
    throw new Error("Invalid integer in client valuation evidence.");
  return value;
}

/** @param {unknown} value @returns {number} */
function flags32(value) {
  const parsed = integer(value, -2147483648);
  if (parsed > 4294967295) throw new Error("Invalid 32-bit item flags.");
  return parsed >>> 0;
}

/**
 * @param {string} bytes
 * @returns {{lua: string, summary: {build: number, items: number, eligible: number, specialLoot: number, cooldowns: number, sha256: string}}}
 */
export function prepareClientValuation(bytes) {
  const evidence = object(JSON.parse(bytes));
  if (evidence.schema !== "item-valuation-client.v1")
    throw new Error("Unsupported client valuation evidence schema.");
  const build = object(evidence.build);
  if (build.product !== "wowf" && build.product !== "wow_classic_beta")
    throw new Error("Forever valuation evidence must come from a Forever client.");
  const buildNumber = integer(build.buildNumber, 1);
  if (
    typeof build.clientVersion !== "string" ||
    !/^1\.60\.\d+\.\d+$/u.test(build.clientVersion) ||
    Number(build.clientVersion.split(".").at(-1)) !== buildNumber
  )
    throw new Error("Client version and build do not agree.");
  if (
    typeof evidence.definitionsRevision !== "string" ||
    !/^[a-f0-9]{40}$/u.test(evidence.definitionsRevision) ||
    typeof evidence.hotfixSha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(evidence.hotfixSha256)
  )
    throw new Error("Valuation evidence lacks pinned client provenance.");
  const tables = object(evidence.tables);
  /** @param {string} name @returns {Record<string, unknown>[]} */
  function rows(name) {
    const table = object(tables[name]);
    if (!Array.isArray(table.rows) || table.rows.length === 0 || table.rows.length > 500000)
      throw new Error(`Missing or oversized ${name} evidence.`);
    integer(table.encryptedRecords);
    if (name === "ItemDisenchantLoot" && table.encryptedRecords !== 0)
      throw new Error(`Encrypted ${name} records prevent a complete rules review.`);
    const seen = new Set();
    return table.rows.map((value) => {
      const row = object(value);
      const id = integer(row.id, 1);
      if (seen.has(id)) throw new Error(`Duplicate ${name} record.`);
      seen.add(id);
      return row;
    });
  }
  const items = new Map(rows("Item").map((row) => [row.id, row]));
  const sparse = rows("ItemSparse");
  const brackets = rows("ItemDisenchantLoot");
  for (const row of brackets) {
    integer(row.Class);
    integer(row.Quality);
    integer(row.MinLevel);
    integer(row.MaxLevel);
    integer(row.SkillRequired);
    if (
      row.MinLevel > row.MaxLevel ||
      !Number.isInteger(row.Subclass) ||
      !Number.isInteger(row.ExpansionID)
    )
      throw new Error("Invalid client disenchant bracket.");
  }
  const cooldowns = new Set();
  for (const row of rows("SpellCooldowns")) {
    if (integer(row.RecoveryTime) >= 3600000 || integer(row.CategoryRecoveryTime) >= 3600000)
      cooldowns.add(integer(row.SpellID, 1));
  }
  const entries = [];
  let eligible = 0,
    specialLoot = 0;
  for (const item of sparse) {
    const base = items.get(item.id);
    if (!base) continue;
    const classId = integer(base.ClassID),
      quality = integer(item.OverallQualityID),
      level = integer(item.ItemLevel);
    if ((classId !== 2 && classId !== 4) || quality < 2 || quality > 4) continue;
    if (!Array.isArray(item.Flags) || item.Flags.length < 2)
      throw new Error("Item flags are required for disenchant eligibility.");
    const flags = flags32(item.Flags[0]);
    const specialDisenchantLoot = (flags32(item.Flags[1]) & 0x40000000) !== 0;
    const subclass = integer(base.SubclassID),
      expansion = integer(item.ExpansionID, -100),
      binding = integer(item.Bonding);
    const matching = brackets.filter(
      (row) =>
        row.Class === classId &&
        row.Quality === quality &&
        row.MinLevel <= level &&
        row.MaxLevel >= level &&
        (row.Subclass < 0 || row.Subclass === subclass) &&
        (row.ExpansionID < 0 || row.ExpansionID === expansion),
    );
    if (matching.length > 1) throw new Error("Ambiguous client disenchant brackets.");
    const canDisenchant = matching.length === 1 && (flags & 0x8000) === 0 && binding !== 4;
    if (canDisenchant) eligible++;
    if (canDisenchant && specialDisenchantLoot) specialLoot++;
    let referenceLevel = level > 65 && level <= 99 && matching[0]?.MinLevel === 61 ? 65 : level;
    if (classId === 2 && quality === 2 && level === 5) referenceLevel = 6;
    if (quality === 3 && level >= 5 && level < 11) referenceLevel = 11;
    entries.push({
      id: item.id,
      classId,
      quality,
      level,
      canDisenchant,
      skill: matching[0]?.SkillRequired ?? 0,
      referenceLevel,
      specialDisenchantLoot,
    });
  }
  entries.sort((a, b) => a.id - b.id);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const lua = `-- Generated from hotfixed client data. Loot probabilities are not included.
local _, Addon = ...
Addon.ClientValuationData = {
  clientProduct = "wow_classic_beta", clientBuild = ${buildNumber},
  evidenceSha256 = "${checksum}", hotfixSha256 = "${evidence.hotfixSha256}",
  definitionsRevision = "${evidence.definitionsRevision}",
  encryptedItems = ${integer(object(tables.ItemSparse).encryptedRecords)},
  encryptedCooldowns = ${integer(object(tables.SpellCooldowns).encryptedRecords)},
  -- Item columns: class, quality, item level, eligible, skill, reference level, special loot table.
  items = {
${entries.map((row) => `    [${row.id}] = {${row.classId},${row.quality},${row.level},${row.canDisenchant},${row.skill},${row.referenceLevel},${row.specialDisenchantLoot}},`).join("\n")}
  },
  cooldownRecipes = {${[...cooldowns]
    .sort((a, b) => a - b)
    .map((id) => `[${id}]=true`)
    .join(",")}},
}
`;
  return {
    lua,
    summary: {
      build: buildNumber,
      items: entries.length,
      eligible,
      specialLoot,
      cooldowns: cooldowns.size,
      sha256: checksum,
    },
  };
}
