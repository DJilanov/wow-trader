import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { JsonValue } from "@wow-trader/contracts";
import {
  parse,
  type AssignmentStatement,
  type Expression,
  type TableConstructorExpression,
} from "luaparse";

const EXPORT_FORMAT_VERSION = 1;

const ENTITY_SPECS = {
  quest: {
    fileName: "foreverQuestDB.lua",
    variableName: "quest",
    fields: [
      "name",
      "startedBy",
      "finishedBy",
      "requiredLevel",
      "questLevel",
      "requiredRaces",
      "requiredClasses",
      "objectivesText",
      "triggerEnd",
      "objectives",
      "sourceItemId",
      "preQuestGroup",
      "preQuestSingle",
      "childQuests",
      "inGroupWith",
      "exclusiveTo",
      "zoneOrSort",
      "requiredSkill",
      "requiredMinRep",
      "requiredMaxRep",
      "requiredSourceItems",
      "nextQuestInChain",
      "questFlags",
      "specialFlags",
      "parentQuest",
      "reputationReward",
      "breadcrumbForQuestId",
      "breadcrumbs",
      "extraObjectives",
      "requiredSpell",
      "requiredSpecialization",
      "requiredMaxLevel",
      "availableUntilCompleted",
      "availableStartingWith",
      "requiredRanks",
      "disabledByQuest",
    ],
  },
  npc: {
    fileName: "foreverNpcDB.lua",
    variableName: "npc",
    fields: [
      "name",
      "minLevelHealth",
      "maxLevelHealth",
      "minLevel",
      "maxLevel",
      "rank",
      "spawns",
      "waypoints",
      "zoneID",
      "questStarts",
      "questEnds",
      "factionID",
      "friendlyToFaction",
      "subName",
      "npcFlags",
    ],
  },
  item: {
    fileName: "foreverItemDB.lua",
    variableName: "item",
    fields: [
      "name",
      "npcDrops",
      "objectDrops",
      "itemDrops",
      "startQuest",
      "questRewards",
      "flags",
      "foodType",
      "itemLevel",
      "requiredLevel",
      "ammoType",
      "class",
      "subClass",
      "vendors",
      "relatedQuests",
      "teachesSpell",
    ],
  },
  object: {
    fileName: "foreverObjectDB.lua",
    variableName: "object",
    fields: ["name", "questStarts", "questEnds", "spawns", "zoneID", "factionID", "waypoints"],
  },
} as const;

export type QuestieEntityKind = keyof typeof ENTITY_SPECS;

export interface QuestieForeverImportOptions {
  readonly sourceVersion: string;
  readonly sourceRevision: string;
  readonly licenseRef: string;
  readonly includedAuthored?: boolean;
}

export interface QuestieForeverArtifact {
  readonly fileName: string;
  readonly byteSize: number;
  readonly sha256: string;
  readonly entityCount: number;
}

export interface QuestieForeverEntity {
  readonly kind: QuestieEntityKind;
  readonly id: number;
  readonly name: string | null;
  readonly data: Readonly<Record<string, JsonValue>>;
}

export interface QuestieForeverRelation {
  readonly sourceKind: QuestieEntityKind;
  readonly sourceId: number;
  readonly relationKind: string;
  readonly targetKind: QuestieEntityKind | "spell";
  readonly targetId: number;
  readonly evidence: Readonly<Record<string, JsonValue>>;
}

export interface QuestieForeverBundle {
  readonly formatVersion: number;
  readonly sourceKind: "questiedb_forever";
  readonly sourceVersion: string;
  readonly sourceRevision: string;
  readonly licenseRef: string;
  readonly includedAuthored: boolean;
  readonly checksum: string;
  readonly artifacts: readonly QuestieForeverArtifact[];
  readonly entities: readonly QuestieForeverEntity[];
  readonly relations: readonly QuestieForeverRelation[];
}

export interface QuestieSpawnLocation {
  readonly areaId: number;
  readonly xPercent: number;
  readonly yPercent: number;
}

export interface QuestieSpawnLocationResult {
  readonly locations: readonly QuestieSpawnLocation[];
  readonly rejectedCount: number;
}

export async function loadQuestieForeverExport(
  directory: string,
  options: QuestieForeverImportOptions,
): Promise<QuestieForeverBundle> {
  const sourceVersion = requiredMetadata(options.sourceVersion, "source version");
  const sourceRevision = requiredMetadata(options.sourceRevision, "source revision");
  const licenseRef = requiredMetadata(options.licenseRef, "license reference");
  const parsed = await Promise.all(
    typedEntries(ENTITY_SPECS).map(async ([kind, spec]) => {
      const source = await readFile(join(directory, spec.fileName), "utf8");
      validateQuestieForeverLegend(kind, source);
      const entities = parseQuestieForeverSource(kind, source);
      return {
        artifact: {
          fileName: spec.fileName,
          byteSize: Buffer.byteLength(source),
          sha256: sha256(source),
          entityCount: entities.length,
        },
        entities,
      };
    }),
  );
  const artifacts = parsed.map(({ artifact }) => artifact);
  const entities = parsed.flatMap(({ entities: rows }) => rows);
  const relations = deriveQuestieForeverRelations(entities);
  const checksum = sha256(
    [
      String(EXPORT_FORMAT_VERSION),
      sourceVersion,
      sourceRevision,
      String(options.includedAuthored === true),
      ...artifacts.map((artifact) => `${artifact.fileName}:${artifact.sha256}`),
    ].join("|"),
  );
  return {
    formatVersion: EXPORT_FORMAT_VERSION,
    sourceKind: "questiedb_forever",
    sourceVersion,
    sourceRevision,
    licenseRef,
    includedAuthored: options.includedAuthored === true,
    checksum,
    artifacts,
    entities,
    relations,
  };
}

export function getQuestieForeverFieldNames(kind: QuestieEntityKind): readonly string[] {
  return ENTITY_SPECS[kind].fields;
}

export function decodeQuestieSpawnLocations(value: unknown): QuestieSpawnLocationResult {
  if (!isRecord(value)) return { locations: [], rejectedCount: value == null ? 0 : 1 };
  const locations: QuestieSpawnLocation[] = [];
  let rejectedCount = 0;
  for (const [areaKey, points] of Object.entries(value)) {
    const areaId = Number(areaKey);
    if (!Number.isSafeInteger(areaId) || areaId <= 0 || !Array.isArray(points)) {
      rejectedCount += 1;
      continue;
    }
    for (const point of points) {
      if (
        !Array.isArray(point) ||
        point.length < 2 ||
        typeof point[0] !== "number" ||
        typeof point[1] !== "number" ||
        !Number.isFinite(point[0]) ||
        !Number.isFinite(point[1]) ||
        point[0] < 0 ||
        point[0] > 100 ||
        point[1] < 0 ||
        point[1] > 100
      ) {
        rejectedCount += 1;
        continue;
      }
      locations.push({ areaId, xPercent: point[0], yPercent: point[1] });
    }
  }
  return {
    locations: locations.sort(
      (left, right) =>
        left.areaId - right.areaId ||
        left.xPercent - right.xPercent ||
        left.yPercent - right.yPercent,
    ),
    rejectedCount,
  };
}

export function parseQuestieForeverSource(
  kind: QuestieEntityKind,
  source: string,
): readonly QuestieForeverEntity[] {
  const spec = ENTITY_SPECS[kind];
  const chunk = parse(source, {
    comments: false,
    encodingMode: "x-user-defined",
    luaVersion: "5.1",
  });
  const [declaration, ...statements] = chunk.body;
  if (
    declaration?.type !== "LocalStatement" ||
    declaration.variables.length !== 1 ||
    declaration.variables[0]?.name !== spec.variableName ||
    declaration.init.length !== 1 ||
    declaration.init[0]?.type !== "TableConstructorExpression" ||
    declaration.init[0].fields.length !== 0
  ) {
    throw new Error(`${spec.fileName} must start with an empty local ${spec.variableName} table`);
  }
  const finalStatement = statements.at(-1);
  if (
    finalStatement?.type !== "ReturnStatement" ||
    finalStatement.arguments.length !== 1 ||
    finalStatement.arguments[0]?.type !== "Identifier" ||
    finalStatement.arguments[0].name !== spec.variableName
  ) {
    throw new Error(`${spec.fileName} must return ${spec.variableName}`);
  }

  const seen = new Set<number>();
  const entities = statements.slice(0, -1).map((statement) => {
    if (
      statement.type !== "AssignmentStatement" ||
      statement.variables.length !== 1 ||
      statement.init.length !== 1
    ) {
      throw new Error(`${spec.fileName} contains executable or unsupported statements`);
    }
    const id = entityAssignmentId(statement.variables[0]!, spec.variableName, spec.fileName);
    if (seen.has(id)) throw new Error(`${spec.fileName} contains duplicate ${kind} id ${id}`);
    seen.add(id);
    const expression = statement.init[0];
    if (expression?.type !== "TableConstructorExpression") {
      throw new Error(`${spec.fileName} ${kind} ${id} is not a literal table`);
    }
    const row = decodeLiteral(expression);
    if (!Array.isArray(row)) throw new Error(`${spec.fileName} ${kind} ${id} is not positional`);
    if (row.length > spec.fields.length) {
      throw new Error(`${spec.fileName} ${kind} ${id} has unknown field ${spec.fields.length + 1}`);
    }
    const data: Record<string, JsonValue> = {};
    row.forEach((value, index) => {
      const field = spec.fields[index];
      if (field && value !== null) data[field] = value;
    });
    return {
      kind,
      id,
      name: typeof data.name === "string" ? data.name : null,
      data,
    } satisfies QuestieForeverEntity;
  });
  if (entities.length === 0) throw new Error(`${spec.fileName} contains no ${kind} entities`);
  return entities.sort((left, right) => left.id - right.id);
}

export function deriveQuestieForeverRelations(
  entities: readonly QuestieForeverEntity[],
): readonly QuestieForeverRelation[] {
  const relations = new Map<string, QuestieForeverRelation>();
  const add = (
    source: QuestieForeverEntity,
    relationKind: string,
    targetKind: QuestieForeverRelation["targetKind"],
    targetId: number,
    field: string,
  ): void => {
    if (!Number.isSafeInteger(targetId) || targetId <= 0) return;
    const relation: QuestieForeverRelation = {
      sourceKind: source.kind,
      sourceId: source.id,
      relationKind,
      targetKind,
      targetId,
      evidence: { field, source: "questiedb_forever_export" },
    };
    const key = [source.kind, source.id, relationKind, targetKind, targetId].join(":");
    relations.set(key, relation);
  };
  const addMany = (
    source: QuestieForeverEntity,
    field: string,
    relationKind: string,
    targetKind: QuestieForeverRelation["targetKind"],
  ): void => {
    for (const id of numericIds(source.data[field]))
      add(source, relationKind, targetKind, id, field);
  };

  for (const entity of entities) {
    if (entity.kind === "item") {
      addMany(entity, "npcDrops", "dropped_by_npc", "npc");
      addMany(entity, "objectDrops", "dropped_by_object", "object");
      addMany(entity, "itemDrops", "contained_in_item", "item");
      addMany(entity, "questRewards", "rewarded_by_quest", "quest");
      addMany(entity, "vendors", "sold_by_npc", "npc");
      addMany(entity, "relatedQuests", "related_to_quest", "quest");
      addScalar(entity, "startQuest", "starts_quest", "quest", add);
      addScalar(entity, "teachesSpell", "teaches_spell", "spell", add);
    } else if (entity.kind === "npc" || entity.kind === "object") {
      addMany(entity, "questStarts", "starts_quest", "quest");
      addMany(entity, "questEnds", "finishes_quest", "quest");
    } else {
      addQuestGivers(entity, "startedBy", "started_by", add);
      addQuestGivers(entity, "finishedBy", "finished_by", add);
      addMany(entity, "preQuestGroup", "requires_group_quest", "quest");
      addMany(entity, "preQuestSingle", "requires_quest", "quest");
      addMany(entity, "childQuests", "unlocks_quest", "quest");
      addMany(entity, "exclusiveTo", "exclusive_with_quest", "quest");
      addMany(entity, "requiredSourceItems", "requires_item", "item");
      addScalar(entity, "sourceItemId", "provides_item", "item", add);
      addScalar(entity, "nextQuestInChain", "next_quest", "quest", add);
      addScalar(entity, "parentQuest", "parent_quest", "quest", add);
      addScalar(entity, "requiredSpell", "requires_spell", "spell", add);
    }
  }
  return [...relations.values()].sort((left, right) =>
    relationSortKey(left).localeCompare(relationSortKey(right)),
  );
}

function addQuestGivers(
  source: QuestieForeverEntity,
  field: string,
  relationKind: string,
  add: (
    source: QuestieForeverEntity,
    relationKind: string,
    targetKind: QuestieForeverRelation["targetKind"],
    targetId: number,
    field: string,
  ) => void,
): void {
  const groups = source.data[field];
  const kinds = ["npc", "object", "item"] as const;
  for (const [index, group] of positionalEntries(groups)) {
    const targetKind = kinds[index];
    if (!targetKind) continue;
    for (const id of numericIds(group)) add(source, relationKind, targetKind, id, field);
  }
}

function addScalar(
  source: QuestieForeverEntity,
  field: string,
  relationKind: string,
  targetKind: QuestieForeverRelation["targetKind"],
  add: (
    source: QuestieForeverEntity,
    relationKind: string,
    targetKind: QuestieForeverRelation["targetKind"],
    targetId: number,
    field: string,
  ) => void,
): void {
  const value = source.data[field];
  if (typeof value === "number") add(source, relationKind, targetKind, value, field);
}

function numericIds(value: JsonValue | undefined): readonly number[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is number =>
      typeof entry === "number" && Number.isSafeInteger(entry) && entry > 0,
  );
}

function positionalEntries(value: JsonValue | undefined): readonly [number, JsonValue][] {
  if (Array.isArray(value)) return value.map((entry, index) => [index, entry]);
  if (!isRecord(value)) return [];
  return Object.entries(value)
    .filter(([key]) => /^[1-9]\d*$/.test(key))
    .map(([key, entry]) => [Number(key) - 1, entry as JsonValue] satisfies [number, JsonValue])
    .sort(([left], [right]) => left - right);
}

function entityAssignmentId(
  variable: AssignmentStatement["variables"][number],
  variableName: string,
  fileName: string,
): number {
  if (
    variable.type !== "IndexExpression" ||
    variable.base.type !== "Identifier" ||
    variable.base.name !== variableName ||
    variable.index.type !== "NumericLiteral" ||
    !Number.isSafeInteger(variable.index.value) ||
    variable.index.value <= 0
  ) {
    throw new Error(`${fileName} assignments must use positive numeric entity ids`);
  }
  return variable.index.value;
}

function decodeLiteral(expression: Expression): JsonValue {
  switch (expression.type) {
    case "StringLiteral":
    case "NumericLiteral":
    case "BooleanLiteral":
      return expression.value;
    case "NilLiteral":
      return null;
    case "UnaryExpression":
      if (expression.operator === "-" && expression.argument.type === "NumericLiteral") {
        return -expression.argument.value;
      }
      break;
    case "TableConstructorExpression":
      return decodeTable(expression);
  }
  throw new Error(`QuestieDB export contains unsupported Lua expression ${expression.type}`);
}

function decodeTable(expression: TableConstructorExpression): JsonValue {
  const positional: JsonValue[] = [];
  const keyed = new Map<string, JsonValue>();
  for (const field of expression.fields) {
    if (field.type === "TableValue") {
      positional.push(decodeLiteral(field.value));
      continue;
    }
    const decodedKey = field.type === "TableKeyString" ? field.key.name : decodeLiteral(field.key);
    if (typeof decodedKey !== "string" && typeof decodedKey !== "number") {
      throw new Error("QuestieDB export table keys must be strings or numbers");
    }
    keyed.set(String(decodedKey), decodeLiteral(field.value));
  }
  if (keyed.size === 0) return positional;
  const result: Record<string, JsonValue> = {};
  positional.forEach((value, index) => {
    result[String(index + 1)] = value;
  });
  for (const [key, value] of keyed) result[key] = value;
  return result;
}

function relationSortKey(relation: QuestieForeverRelation): string {
  return [
    relation.sourceKind,
    String(relation.sourceId).padStart(10, "0"),
    relation.relationKind,
    relation.targetKind,
    String(relation.targetId).padStart(10, "0"),
  ].join(":");
}

function validateQuestieForeverLegend(kind: QuestieEntityKind, source: string): void {
  const spec = ENTITY_SPECS[kind];
  const fields = new Map<number, string>();
  for (const match of source.matchAll(/^-- \[(\d+)\] = ([A-Za-z][A-Za-z0-9]*)\s*$/gm)) {
    const index = Number(match[1]);
    const field = match[2]!;
    if (fields.has(index)) throw new Error(`${spec.fileName} repeats field legend ${index}`);
    fields.set(index, field);
  }
  if (fields.size !== spec.fields.length) {
    throw new Error(
      `${spec.fileName} has ${fields.size} field legends; expected ${spec.fields.length}`,
    );
  }
  spec.fields.forEach((field, offset) => {
    const index = offset + 1;
    if (fields.get(index) !== field) {
      throw new Error(
        `${spec.fileName} field ${index} is ${fields.get(index) ?? "missing"}; expected ${field}`,
      );
    }
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function requiredMetadata(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`QuestieDB Forever import requires a ${label}`);
  if (normalized.length > 1_024) throw new Error(`QuestieDB Forever ${label} is too long`);
  return normalized;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function typedEntries<T extends object>(value: T): Array<[keyof T, T[keyof T]]> {
  return Object.entries(value) as Array<[keyof T, T[keyof T]]>;
}
