import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";

import type { JsonValue } from "@wow-trader/contracts";

import { decodeJsonCbor } from "./cbor.js";
import {
  deriveQuestieForeverRelations,
  getQuestieForeverFieldNames,
  type QuestieEntityKind,
  type QuestieForeverBundle,
  type QuestieForeverEntity,
  type QuestieForeverImportOptions,
} from "./questie-forever.js";

const BAKED_SPECS: Readonly<
  Record<QuestieEntityKind, { readonly prefix: string; readonly tableFields: ReadonlySet<number> }>
> = {
  quest: {
    prefix: "Quest",
    tableFields: new Set([2, 3, 8, 9, 10, 12, 13, 14, 15, 16, 18, 19, 20, 21, 26, 28, 29, 35]),
  },
  npc: { prefix: "Npc", tableFields: new Set([7, 8, 10, 11]) },
  item: { prefix: "Item", tableFields: new Set([2, 3, 4, 6, 14, 15]) },
  object: { prefix: "Object", tableFields: new Set([2, 3, 4, 7]) },
};

interface TocMetadata {
  readonly values: ReadonlyMap<string, string>;
  readonly raw: string;
}

export interface QuestieBakedSelection {
  readonly questIds: readonly number[];
  readonly includeQuestGivers?: boolean;
}

/** Reads selected entities from QuestieDB's baked TOC without loading or executing addon Lua. */
export async function loadQuestieForeverBaked(
  tocPath: string,
  selection: QuestieBakedSelection,
  options: QuestieForeverImportOptions,
): Promise<QuestieForeverBundle> {
  const info = await stat(tocPath);
  if (info.size > 32_000_000) throw new Error("QuestieDB TOC exceeds size budget");
  const raw = await readFile(tocPath, "utf8");
  const metadata = parseTocMetadata(raw);
  if (metadata.values.get("X-Flavor") !== "Forever")
    throw new Error("QuestieDB TOC is not the Forever flavor");
  if (metadata.values.get("X-Mode") !== "baked")
    throw new Error("QuestieDB TOC is not a baked artifact");
  if (metadata.values.get("X-Contract-Version") !== "2")
    throw new Error("Unsupported QuestieDB baked contract");
  const questIds = normalizeIds(selection.questIds);
  if (!questIds.length) throw new Error("QuestieDB baked selection is empty");

  const quests = questIds.map((id) => decodeEntity(metadata, "quest", id)).filter(isPresent);
  const related = selection.includeQuestGivers === false ? [] : decodeQuestGivers(metadata, quests);
  const entities = [...quests, ...related].sort(
    (left, right) => left.kind.localeCompare(right.kind) || left.id - right.id,
  );
  const sourceVersion = required(options.sourceVersion, "source version");
  const sourceRevision = required(options.sourceRevision, "source revision");
  const licenseRef = required(options.licenseRef, "license reference");
  if (metadata.values.get("Version") !== sourceVersion)
    throw new Error("QuestieDB source version does not match the TOC metadata");
  if (metadata.values.get("X-BUILD-COMMIT") !== sourceRevision)
    throw new Error("QuestieDB source revision does not match the TOC metadata");
  const sha256 = createHash("sha256").update(raw).digest("hex");
  const checksum = createHash("sha256")
    .update(
      [
        "1",
        sourceVersion,
        sourceRevision,
        String(options.includedAuthored === true),
        `${basename(tocPath)}:${sha256}`,
        questIds.join(","),
        "baked-selection-v2",
        String(selection.includeQuestGivers !== false),
        JSON.stringify(entities),
      ].join("|"),
    )
    .digest("hex");
  return {
    formatVersion: 1,
    sourceKind: "questiedb_forever",
    sourceVersion,
    sourceRevision,
    licenseRef,
    includedAuthored: options.includedAuthored === true,
    checksum,
    artifacts: [
      {
        fileName: basename(tocPath),
        byteSize: info.size,
        sha256,
        entityCount: entities.length,
      },
    ],
    entities,
    relations: deriveQuestieForeverRelations(entities),
  };
}

export function parseTocMetadata(raw: string): TocMetadata {
  if (Buffer.byteLength(raw) > 32_000_000) throw new Error("QuestieDB TOC exceeds size budget");
  const values = new Map<string, string>();
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^## ([A-Za-z0-9-]+):(?: |$)(.*)$/);
    if (!match) continue;
    const key = match[1]!;
    if (values.has(key)) throw new Error(`QuestieDB TOC repeats metadata key ${key}`);
    values.set(key, match[2] ?? "");
  }
  return { values, raw };
}

function decodeEntity(
  metadata: TocMetadata,
  kind: QuestieEntityKind,
  id: number,
): QuestieForeverEntity | null {
  const spec = BAKED_SPECS[kind];
  const baseKey = `X-${spec.prefix}-${id}`;
  const scalarPayload = stored(metadata.values, `${baseKey}-S`);
  if (scalarPayload === null) return null;
  const scalar = record(decodePayload(scalarPayload), `${kind} ${id} scalar row`);
  const data: Record<string, JsonValue> = {};
  getQuestieForeverFieldNames(kind).forEach((field, offset) => {
    const index = offset + 1;
    const value = spec.tableFields.has(index)
      ? decodeOptionalPayload(stored(metadata.values, `${baseKey}-${index}`))
      : scalar[String(index)];
    if (value !== undefined && value !== null) data[field] = value;
  });
  return {
    kind,
    id,
    name: typeof data.name === "string" ? data.name : null,
    data,
  };
}

function decodeQuestGivers(
  metadata: TocMetadata,
  quests: readonly QuestieForeverEntity[],
): readonly QuestieForeverEntity[] {
  const ids = {
    npc: new Set<number>(),
    object: new Set<number>(),
    item: new Set<number>(),
  };
  for (const quest of quests) {
    collectQuestGivers(quest.data.startedBy, ids);
    collectQuestGivers(quest.data.finishedBy, ids);
  }
  const items = [...ids.item]
    .sort((left, right) => left - right)
    .map((id) => decodeEntity(metadata, "item", id))
    .filter(isPresent);
  const questIds = new Set(quests.map((quest) => quest.id));
  for (const item of items) {
    if (typeof item.data.startQuest !== "number" || !questIds.has(item.data.startQuest)) continue;
    collectIds(item.data.npcDrops, ids.npc);
    collectIds(item.data.objectDrops, ids.object);
  }
  // Include only direct starter-item sources, not a recursive item/drop dependency crawl.
  return [
    ...items,
    ...(["npc", "object"] as const).flatMap((kind) =>
      [...ids[kind]]
        .sort((left, right) => left - right)
        .map((id) => decodeEntity(metadata, kind, id))
        .filter(isPresent),
    ),
  ];
}

function collectIds(value: JsonValue | undefined, ids: Set<number>): void {
  if (!Array.isArray(value)) return;
  for (const id of value)
    if (typeof id === "number" && Number.isSafeInteger(id) && id > 0) ids.add(id);
}

function collectQuestGivers(
  value: JsonValue | undefined,
  ids: { npc: Set<number>; object: Set<number>; item: Set<number> },
): void {
  const kinds = ["npc", "object", "item"] as const;
  for (const [index, group] of positionalEntries(value)) {
    const kind = kinds[index];
    if (!kind || !Array.isArray(group)) continue;
    collectIds(group, ids[kind]);
  }
}

function positionalEntries(value: JsonValue | undefined): readonly [number, JsonValue][] {
  if (Array.isArray(value)) return value.map((entry, index) => [index, entry]);
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value)
    .filter(([key]) => /^[1-9]\d*$/.test(key))
    .map(([key, entry]) => [Number(key) - 1, entry] satisfies [number, JsonValue])
    .sort(([left], [right]) => left - right);
}

function stored(values: ReadonlyMap<string, string>, key: string): string | null {
  const value = values.get(key);
  if (value === undefined) return null;
  const chunks = value.match(/^~([1-9]\d*)~$/)?.[1];
  if (!chunks) return value;
  const count = Number(chunks);
  if (!Number.isSafeInteger(count) || count > 1_000)
    throw new Error(`Invalid chunk count for ${key}`);
  let combined = "";
  for (let index = 1; index <= count; index += 1) {
    const part = values.get(`${key}-${index}`);
    if (part === undefined) throw new Error(`Missing metadata chunk ${key}-${index}`);
    combined += part;
    if (combined.length > 2_000_000) throw new Error(`Metadata value ${key} exceeds size budget`);
  }
  return combined;
}

function decodeOptionalPayload(payload: string | null): JsonValue | undefined {
  return payload === null ? undefined : decodePayload(payload);
}

function decodePayload(payload: string): JsonValue {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(payload) || payload.length % 4 !== 0)
    throw new Error("Invalid QuestieDB base64 payload");
  return decodeJsonCbor(Buffer.from(payload, "base64"));
}

function record(value: JsonValue, label: string): Readonly<Record<string, JsonValue>> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error(`Invalid QuestieDB ${label}`);
  return value;
}

function normalizeIds(ids: readonly number[]): number[] {
  const result = [...new Set(ids)];
  if (
    result.some((id) => !Number.isSafeInteger(id) || id <= 0 || id > 2_147_483_647) ||
    result.length > 10_000
  )
    throw new Error("QuestieDB selection contains invalid quest ids");
  return result.sort((left, right) => left - right);
}

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 1_024)
    throw new Error(`QuestieDB Forever import requires a valid ${label}`);
  return normalized;
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}
