import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { z } from "zod";

export type MechanicsRow = Readonly<Record<string, unknown>>;
export type MechanicsTables = ReadonlyMap<string, readonly MechanicsRow[]>;
const descriptor = z
  .object({
    path: z.string(),
    recordCount: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    encryptedRecords: z.number().int().nonnegative(),
  })
  .strict();
export const mechanicsManifestSchema = z
  .object({
    schema: z.literal("forever-mechanics-snapshot.v1"),
    build: z
      .object({
        product: z.literal("wow_classic_beta"),
        clientVersion: z.string().regex(/^1\.60\.\d+\.\d+$/),
        buildNumber: z.number().int().positive(),
        buildKey: z.string().regex(/^[a-f0-9]{32}$/),
        cdnKey: z.string().regex(/^[a-f0-9]{32}$/),
      })
      .strict(),
    locale: z.literal("enUS"),
    definitionsRevision: z.string().regex(/^[a-f0-9]{40}$/),
    capturedAt: z.iso.datetime({ offset: true }),
    hotfixSha256: z.string().regex(/^[a-f0-9]{64}$/),
    tables: z.record(z.string(), descriptor),
    unavailable: z.array(z.string()),
    combatRatings: z
      .object({ path: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict(),
  })
  .strict();
export type MechanicsManifest = z.infer<typeof mechanicsManifestSchema>;

export interface ClientItemStats {
  readonly statType: number;
  readonly value: number;
}
export interface ClientCombatItem {
  readonly itemId: number;
  readonly name: string;
  readonly itemLevel: number;
  readonly requiredLevel: number;
  readonly inventoryType: number;
  readonly classId: number;
  readonly subclassId: number;
  readonly quality: number;
  readonly stats: readonly ClientItemStats[];
  readonly armor: number | null;
  readonly weapon: {
    readonly minimum: number;
    readonly maximum: number;
    readonly speedSeconds: number;
  } | null;
  readonly setId: number | null;
  readonly effectIds: readonly number[];
  readonly issues: readonly string[];
}
export interface ClientTalent {
  readonly className: string;
  readonly treeIndex: number | null;
  readonly treeId: number;
  readonly nodeId: number;
  readonly definitionId: number;
  readonly spellId: number;
  readonly name: string;
  readonly maxRanks: number;
  readonly row: number | null;
  readonly column: number | null;
  readonly description: string;
  readonly rawPosition: { readonly x: number; readonly y: number };
  readonly layoutResolved: boolean;
  readonly ranks: readonly {
    readonly rank: number;
    readonly text: string;
    readonly resolved: boolean;
  }[];
  readonly prerequisiteNodeIds: readonly number[];
}
export interface ClientMechanics {
  readonly schema: "forever-client-mechanics.v1";
  readonly clientVersion: string;
  readonly hotfixSha256: string;
  readonly capturedAt: string;
  readonly items: readonly ClientCombatItem[];
  readonly talents: readonly ClientTalent[];
  readonly sets: readonly MechanicsRow[];
  readonly setEffects: readonly MechanicsRow[];
  readonly issues: readonly string[];
}

const pointSlots: Readonly<Record<number, number>> = {
  1: 0,
  5: 0,
  7: 0,
  17: 0,
  20: 0,
  3: 1,
  6: 1,
  8: 1,
  10: 1,
  12: 1,
  2: 2,
  9: 2,
  11: 2,
  14: 2,
  16: 2,
  23: 2,
  13: 3,
  21: 3,
  22: 3,
  15: 4,
  25: 4,
  26: 4,
  28: 4,
};
const classTrees: Readonly<Record<string, number>> = {
  Shaman: 1082,
  Druid: 1089,
  Hunter: 1091,
  Paladin: 1100,
  Rogue: 1111,
  Mage: 1112,
  Priest: 1114,
  Warlock: 1116,
  Warrior: 1117,
};

export async function loadMechanicsTables(
  manifestPath: string,
): Promise<{ readonly manifest: MechanicsManifest; readonly tables: MechanicsTables }> {
  if ((await stat(manifestPath)).size > 1_000_000) throw new Error("Mechanics manifest too large");
  const manifest = mechanicsManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  const root = await realpath(dirname(resolve(manifestPath)));
  if (manifest.combatRatings.path !== "combatratings.txt")
    throw new Error("Invalid combat ratings path");
  const ratingsPath = await realpath(resolve(root, manifest.combatRatings.path));
  if (!ratingsPath.startsWith(root + "/") || (await stat(ratingsPath)).size > 1_000_000)
    throw new Error("Invalid combat ratings artifact");
  if (
    createHash("sha256")
      .update(await readFile(ratingsPath))
      .digest("hex") !== manifest.combatRatings.sha256
  )
    throw new Error("Combat ratings checksum mismatch");
  const tables = new Map<string, readonly MechanicsRow[]>();
  for (const [key, entry] of Object.entries(manifest.tables)) {
    if (!key.endsWith(".effective")) continue;
    const path = await realpath(resolve(root, entry.path));
    if (
      !path.startsWith(root + "/") ||
      !/^raw\/[A-Za-z0-9]+\.effective\.ndjson\.gz$/.test(entry.path)
    )
      throw new Error("Invalid mechanics table path");
    if ((await stat(path)).size > 30_000_000)
      throw new Error("Mechanics table exceeds size budget");
    const bytes = await readFile(path);
    if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256)
      throw new Error(`Mechanics checksum mismatch: ${key}`);
    const text =
      bytes.length === 0 && entry.recordCount === 0
        ? ""
        : gunzipSync(bytes, { maxOutputLength: 80_000_000 }).toString("utf8");
    const rows = text.trim()
      ? text
          .trim()
          .split("\n")
          .map((line) => z.record(z.string(), z.unknown()).parse(JSON.parse(line)))
      : [];
    if (rows.length !== entry.recordCount) throw new Error(`Mechanics row count mismatch: ${key}`);
    tables.set(key.slice(0, -10), rows);
  }
  return { manifest, tables };
}

export function resolveClientItemStats(
  sparse: MechanicsRow,
  points: MechanicsRow | undefined,
): readonly ClientItemStats[] {
  const types = numbers(sparse, "StatModifier_bonusStat");
  const legacy = numbers(sparse, "StatModifier_bonusAmount");
  if (legacy.length)
    return types.flatMap((type, index) =>
      type >= 0 && legacy[index] ? [{ statType: type, value: legacy[index]! }] : [],
    );
  const allocations = numbers(sparse, "StatPercentEditor");
  if (!allocations.some((value) => value !== 0)) return [];
  const slot = pointSlots[number(sparse, "InventoryType")];
  const prefix: Readonly<Record<number, string>> = {
    2: "Good",
    3: "Superior",
    4: "Epic",
    5: "Epic",
  };
  const quality = prefix[number(sparse, "OverallQualityID")];
  if (!quality || slot === undefined || !points) throw new Error("missing_item_stat_budget");
  const scale = numbers(points, quality + "F")[slot] ?? numbers(points, quality)[slot];
  if (scale === undefined || !Number.isFinite(scale) || scale < 0)
    throw new Error("invalid_item_stat_budget");
  if (types.length !== allocations.length) throw new Error("item_stat_allocation_length_mismatch");
  return types.flatMap((type, index) => {
    const allocation = allocations[index]!;
    if (type < 0 || allocation === 0) return [];
    if (!Number.isInteger(type) || !Number.isInteger(allocation))
      throw new Error("invalid_item_stat_allocation");
    const value = Math.floor((scale * allocation) / 10000 + 0.5);
    return [{ statType: type, value }];
  });
}

export function normalizeClientMechanics(
  manifest: MechanicsManifest,
  tables: MechanicsTables,
): ClientMechanics {
  const rows = (name: string): readonly MechanicsRow[] => tables.get(name) ?? [];
  const index = (name: string): Map<number, MechanicsRow> =>
    new Map(rows(name).map((row) => [number(row, "id"), row]));
  const base = index("Item"),
    points = index("RandPropPoints");
  const damageTables = new Map(
    [
      "ItemDamageOneHand",
      "ItemDamageOneHandCaster",
      "ItemDamageTwoHand",
      "ItemDamageTwoHandCaster",
      "ItemDamageRanged",
      "ItemArmorTotal",
      "ItemArmorQuality",
      "ItemArmorShield",
      "ArmorLocation",
    ].map((name) => [name, index(name)]),
  );
  const effectsByItem = new Map<number, number[]>();
  for (const row of rows("ItemXItemEffect")) {
    const id = number(row, "ItemID");
    const ids = effectsByItem.get(id) ?? [];
    ids.push(number(row, "ItemEffectID"));
    effectsByItem.set(id, ids);
  }
  const items: ClientCombatItem[] = [];
  for (const sparse of rows("ItemSparse")) {
    const itemId = number(sparse, "id"),
      item = base.get(itemId);
    if (!item || typeof sparse.Display_lang !== "string" || !sparse.Display_lang.trim()) continue;
    const inventoryType = number(sparse, "InventoryType");
    if (
      ![
        1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 20, 21, 22, 23, 25, 26, 28,
      ].includes(inventoryType)
    )
      continue;
    const itemLevel = number(sparse, "ItemLevel"),
      quality = number(sparse, "OverallQualityID"),
      classId = number(item, "ClassID"),
      subclassId = number(item, "SubclassID");
    const issues: string[] = [];
    let stats: readonly ClientItemStats[] = [];
    try {
      stats = resolveClientItemStats(sparse, points.get(itemLevel));
    } catch (error: unknown) {
      issues.push(error instanceof Error ? error.message : "item_stats_unresolved");
    }
    if (
      number(sparse, "PlayerLevelToItemLevelCurveID", 0) ||
      number(sparse, "ItemLevelOffsetCurveID", 0)
    )
      issues.push("item_level_curve_requires_variant_resolution");
    let armor: number | null = 0;
    let weapon: ClientCombatItem["weapon"] = null;
    if (classId === 4 && [1, 2, 3, 4, 6].includes(subclassId)) {
      if (subclassId === 6) {
        const shield = damageTables.get("ItemArmorShield")?.get(itemLevel);
        const value = shield ? numbers(shield, "Quality")[quality] : undefined;
        armor = value === undefined ? null : Math.floor(value + 0.5);
      } else {
        const total = damageTables.get("ItemArmorTotal")?.get(itemLevel),
          q = damageTables.get("ItemArmorQuality")?.get(itemLevel),
          location = damageTables
            .get("ArmorLocation")
            ?.get(inventoryType === 20 ? 5 : inventoryType);
        const field = ["", "Cloth", "Leather", "Mail", "Plate"][subclassId]!;
        const modifier = ["", "Clothmodifier", "Leathermodifier", "Chainmodifier", "Platemodifier"][
          subclassId
        ]!;
        const qualityMod = q ? numbers(q, "Qualitymod")[quality] : undefined;
        armor =
          total && location && qualityMod !== undefined
            ? Math.floor(number(total, field) * number(location, modifier) * qualityMod + 0.5)
            : null;
      }
      if (armor === null) issues.push("armor_unresolved");
    }
    if (classId === 2) {
      const caster = ((numbers(sparse, "Flags")[1] ?? 0) & 512) !== 0;
      const table =
        inventoryType === 17 || [2, 3, 18].includes(subclassId)
          ? caster
            ? "ItemDamageTwoHandCaster"
            : "ItemDamageTwoHand"
          : caster || subclassId === 19
            ? "ItemDamageOneHandCaster"
            : "ItemDamageOneHand";
      const d = damageTables.get(table)?.get(itemLevel),
        dps = d ? numbers(d, "Quality")[quality] : undefined;
      const speed = number(sparse, "ItemDelay", 0) / 1000,
        variance = number(sparse, "DmgVariance", 0);
      if (dps !== undefined && dps > 0 && speed > 0 && variance >= 0 && variance <= 2) {
        const average = dps * speed;
        weapon = {
          minimum: Math.floor(average * (1 - variance / 2) + 0.5),
          maximum: Math.floor(average * (1 + variance / 2) + 0.5),
          speedSeconds: speed,
        };
      } else issues.push("weapon_damage_unresolved");
    }
    items.push({
      itemId,
      name: sparse.Display_lang,
      itemLevel,
      requiredLevel: number(sparse, "RequiredLevel", 0),
      inventoryType,
      classId,
      subclassId,
      quality,
      stats,
      armor,
      weapon,
      setId: number(sparse, "ItemSet", 0) || null,
      effectIds: effectsByItem.get(itemId) ?? [],
      issues,
    });
  }
  const talents = normalizeTalents(tables);
  const issues = Object.entries(manifest.tables)
    .filter(([name, value]) => name.endsWith(".effective") && value.encryptedRecords > 0)
    .map(([name, value]) => `${name}: ${value.encryptedRecords} encrypted records not decoded`);
  return {
    schema: "forever-client-mechanics.v1",
    clientVersion: manifest.build.clientVersion,
    hotfixSha256: manifest.hotfixSha256,
    capturedAt: manifest.capturedAt,
    items,
    talents,
    sets: rows("ItemSet"),
    setEffects: rows("ItemSetSpell"),
    issues,
  };
}

function normalizeTalents(tables: MechanicsTables): ClientTalent[] {
  const rows = (name: string): readonly MechanicsRow[] => tables.get(name) ?? [];
  const indexed = (name: string): Map<number, MechanicsRow> =>
    new Map(rows(name).map((row) => [number(row, "id"), row]));
  const definitions = indexed("TraitDefinition"),
    entries = indexed("TraitNodeEntry"),
    spells = indexed("Spell"),
    names = indexed("SpellName");
  const links = new Map<number, MechanicsRow[]>();
  for (const row of rows("TraitNodeXTraitNodeEntry")) {
    const id = number(row, "TraitNodeID"),
      list = links.get(id) ?? [];
    list.push(row);
    links.set(id, list);
  }
  const curves = new Map<number, Map<number, number>>();
  for (const row of rows("CurvePoint")) {
    const pos = numbers(row, "Pos");
    if (pos.length !== 2) throw new Error("Unsupported curve point layout");
    const id = number(row, "CurveID"),
      points = curves.get(id) ?? new Map<number, number>();
    if (Number.isInteger(pos[0])) points.set(pos[0]!, pos[1]!);
    curves.set(id, points);
  }
  const values = new Map<string, MechanicsRow>();
  for (const row of rows("TraitDefinitionEffectPoints"))
    values.set(`${number(row, "TraitDefinitionID")}:${number(row, "EffectIndex")}`, row);
  const base = new Map<string, number>();
  for (const row of rows("SpellEffect")) {
    if (number(row, "DifficultyID", 0) !== 0) continue;
    base.set(
      `${number(row, "SpellID")}:${number(row, "EffectIndex")}`,
      number(row, "EffectBasePointsF"),
    );
  }
  const result: ClientTalent[] = [];
  for (const [className, treeId] of Object.entries(classTrees)) {
    const nodes = rows("TraitNode").filter((row) => number(row, "TraitTreeID") === treeId);
    if (nodes.length < 40) throw new Error(`Current ${className} tree identity needs review`);
    const nodeIds = new Set(nodes.map((node) => number(node, "id")));
    for (const node of nodes) {
      const nodeId = number(node, "id"),
        joins = links.get(nodeId) ?? [];
      if (joins.length !== 1) throw new Error(`Ambiguous active trait entry: ${nodeId}`);
      const entry = entries.get(number(joins[0]!, "TraitNodeEntryID"));
      if (!entry) throw new Error("Missing trait entry");
      const definitionId = number(entry, "TraitDefinitionID"),
        definition = definitions.get(definitionId);
      if (!definition) throw new Error("Missing trait definition");
      const spellId = number(definition, "SpellID"),
        name = String(definition.OverrideName_lang || names.get(spellId)?.Name_lang || "");
      if (!name) throw new Error(`Missing trait spell name: ${spellId}`);
      const x = number(node, "PosX"),
        y = number(node, "PosY"),
        candidateTree = x < 4500 ? 0 : x < 8500 ? 1 : 2;
      const origin = [1020, 5020, 9080][candidateTree]!,
        candidateColumn = (x - origin) / 600,
        candidateRow = (y - 2130) / 600;
      const layoutResolved =
        Number.isInteger(candidateColumn) &&
        Number.isInteger(candidateRow) &&
        candidateColumn >= 0 &&
        candidateColumn <= 3 &&
        candidateRow >= 0 &&
        candidateRow <= 6;
      const treeIndex = layoutResolved ? candidateTree : null,
        column = layoutResolved ? candidateColumn : null,
        row = layoutResolved ? candidateRow : null;
      const maxRanks = number(entry, "MaxRanks"),
        description = String(
          definition.OverrideDescription_lang || spells.get(spellId)?.Description_lang || "",
        );
      if (maxRanks < 1 || maxRanks > 20) throw new Error("Invalid trait rank cap");
      const ranks = Array.from({ length: maxRanks }, (_value, index) => {
        const rank = index + 1;
        const text = description
          .replace(
            /\$\/(-?\d+);[smSM](\d)|\$\{\$[smSM](\d)\/(-?\d+)\}(?:\.(\d))?|\$[smSM](\d)/g,
            (
              token: string,
              div1: string | undefined,
              effect1: string | undefined,
              effect2: string | undefined,
              div2: string | undefined,
              precision: string | undefined,
              effect3: string | undefined,
            ): string => {
              const effect = Number(effect1 ?? effect2 ?? effect3) - 1,
                rule = values.get(`${definitionId}:${effect}`);
              const curve = rule ? curves.get(number(rule, "CurveID")) : null;
              const amount =
                curve?.get(rank) ?? (!rule ? base.get(`${spellId}:${effect}`) : undefined);
              const divisor = Number(div1 ?? div2 ?? 1);
              if (amount === undefined || !divisor || (rule && number(rule, "OperationType") !== 0))
                return token;
              const value = Math.abs(amount / divisor);
              return precision
                ? value.toFixed(Number(precision))
                : String(Math.round(value * 1000) / 1000);
            },
          )
          .replace(/\|c[0-9a-f]{8}|\|r/gi, "");
        return { rank, text, resolved: !text.includes("$") };
      });
      const prerequisiteNodeIds = rows("TraitEdge")
        .filter(
          (edge) =>
            number(edge, "RightTraitNodeID") === nodeId &&
            number(edge, "Type") !== 0 &&
            nodeIds.has(number(edge, "LeftTraitNodeID")),
        )
        .map((edge) => number(edge, "LeftTraitNodeID"));
      result.push({
        className,
        treeIndex,
        treeId,
        nodeId,
        definitionId,
        spellId,
        name,
        maxRanks,
        row,
        column,
        description,
        ranks,
        prerequisiteNodeIds,
        rawPosition: { x, y },
        layoutResolved,
      });
    }
  }
  return result;
}

function number(row: MechanicsRow, key: string, fallback?: number): number {
  const value = row[key];
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`Invalid mechanics number: ${key}`);
  return value;
}
function numbers(row: MechanicsRow, key: string): readonly number[] {
  const value = row[key];
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "number" || !Number.isFinite(item))
  )
    throw new Error(`Invalid mechanics array: ${key}`);
  return value as readonly number[];
}
