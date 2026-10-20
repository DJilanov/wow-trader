import { createHash } from "node:crypto";
import { parse, type Node } from "acorn";
import { simple } from "acorn-walk";
import { load, type CheerioAPI } from "cheerio";
import { referenceRelationSchema, type ReferenceRelation } from "./contracts.js";
import {
  listingProfession,
  listingRecordSchema,
  listingTaskSchema,
  type ListingEntry,
  type ListingRecord,
  type ListingTask,
} from "./listing-contracts.js";
import { calls, field, literal, object, plainText, type Expression } from "./parser.js";

const MAX_HTML_BYTES = 4_000_000;
const MAX_SCRIPT_BYTES = 2_000_000;
const ENTITY_ORIGIN = "https://www.wowhead.com";
type Selection = ReturnType<CheerioAPI>;
const SPELL_ACQUISITION_RELATIONS = new Set(["taught-by-npc", "taught-by-item"]);
const ITEM_ACQUISITION_RELATIONS = new Set([
  "sold-by",
  "dropped-by",
  "reward-from",
  "contained-in-item",
  "contained-in-object",
]);

interface EntityLink {
  readonly kind: "npc" | "quest" | "item" | "object" | "spell";
  readonly id: number;
  readonly name: string;
}

interface EntryAccumulator {
  readonly id: number;
  name: string;
  readonly sourceTypes: Set<string>;
  readonly relations: Map<string, ReferenceRelation>;
  readonly teaches: Set<number>;
  readonly unresolved: Set<string>;
}

const sourceFieldPattern =
  /(?:^|_)(?:source|sources|sourcemore|acquire|acquisition|learn|taught|trainer|vendor|drop|quest|container|location|availability)(?:$|_)/i;
const teachesFieldPattern = /teach/i;
const sourceLabels = new Map<number, string>([
  [1, "other"],
  [2, "drop"],
  [3, "crafted"],
  [4, "quest"],
  [5, "vendor"],
  [6, "trainer"],
  [7, "vendor"],
  [8, "trainer"],
  [10, "other"],
  [16, "drop"],
  [21, "drop"],
]);

/**
 * Parses a Forever profession listing into exact, provenance-bearing evidence.
 *
 * Conservative by design:
 * - entry IDs/names come from visible entity links or literal Listview rows;
 * - broad labels (Trainer, Vendor, Drop, Quest) are recorded as hints only;
 * - a relation is emitted only when an exact entity link appears in a
 *   source-like cell/field and the label makes the mapping unambiguous;
 * - anything else is marked unresolved so the detail-page fallback remains.
 */
export function parseWowheadListing(
  html: string,
  taskInput: ListingTask,
  options: {
    readonly url: string;
    readonly capturedAt: string;
    readonly permissionRef: string;
  },
): ListingRecord {
  const task = listingTaskSchema.parse(taskInput);
  if (Buffer.byteLength(html) > MAX_HTML_BYTES) throw new Error("Listing page too large");
  const $ = load(html);
  const canonical = $('link[rel="canonical"]').attr("href") ?? options.url;
  assertListingUrl(canonical, task);
  assertListingUrl(options.url, task);

  const entries = new Map<number, EntryAccumulator>();
  const warnings = new Set<string>();
  parseEmbeddedListview($, task, entries, warnings, literalListviewData($));
  parseVisibleTable($, task, entries, warnings);
  if (entries.size === 0) warnings.add("no_listing_entries");

  return listingRecordSchema.parse({
    schema: "wowhead-listing.v1",
    game: task.game,
    kind: task.kind,
    path: task.path,
    profession: listingProfession(task),
    sourceUrl: canonical,
    capturedAt: options.capturedAt,
    permissionRef: options.permissionRef,
    sourceSha256: createHash("sha256").update(html).digest("hex"),
    parserVersion: 1,
    entries: [...entries.values()]
      .sort((left, right) => left.id - right.id)
      .map((entry) => materializeEntry(entry, task)),
    warnings: [...warnings].sort().slice(0, 50),
  });
}

function assertListingUrl(raw: string, task: ListingTask): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Listing URL is not absolute");
  }
  const expected = task.path.split("?")[0];
  if (
    url.origin !== ENTITY_ORIGIN ||
    url.username ||
    url.password ||
    url.hash ||
    (url.pathname !== expected && url.pathname !== `${expected}/`)
  )
    throw new Error("Listing edition or path mismatch");
  if (task.kind === "item-list" && url.search)
    throw new Error("Item listing must not carry a query");
  if (task.kind === "spell-list" && url.search && url.search !== "?filter=20%3B1%3B0")
    throw new Error("Spell listing filter changed");
}

function entryFor(
  entries: Map<number, EntryAccumulator>,
  id: number,
  name: string,
  warnings: Set<string>,
): EntryAccumulator {
  const existing = entries.get(id);
  if (existing) {
    if (existing.name && name && existing.name !== name) warnings.add("name_conflict");
    if (!existing.name && name) existing.name = name;
    return existing;
  }
  const entry: EntryAccumulator = {
    id,
    name,
    sourceTypes: new Set(),
    relations: new Map(),
    teaches: new Set(),
    unresolved: new Set(),
  };
  entries.set(id, entry);
  return entry;
}

function addRelation(entry: EntryAccumulator, relation: ReferenceRelation): void {
  const key = `${relation.relation}|${relation.kind}|${relation.id}`;
  const existing = entry.relations.get(key);
  if (!existing) {
    entry.relations.set(key, relation);
    return;
  }
  if (!existing.name && relation.name) entry.relations.set(key, relation);
}

function materializeEntry(entry: EntryAccumulator, task: ListingTask): ListingEntry {
  const acquisition =
    task.kind === "spell-list" ? SPELL_ACQUISITION_RELATIONS : ITEM_ACQUISITION_RELATIONS;
  const hasExact = [...entry.relations.values()].some((relation) =>
    acquisition.has(relation.relation),
  );
  const unresolved = new Set(entry.unresolved);
  if (!hasExact && (entry.sourceTypes.size > 0 || entry.relations.size > 0)) {
    unresolved.add("source_relation_requires_detail_page");
    if (entry.sourceTypes.size > 0) unresolved.add("source_label_without_exact_relation");
  } else if (!hasExact && entry.relations.size === 0) {
    unresolved.add("no_exact_source");
  }
  return {
    id: entry.id,
    name: entry.name,
    sourceTypes: [...entry.sourceTypes].sort(),
    relations: [...entry.relations.values()]
      .sort(
        (left, right) =>
          left.relation.localeCompare(right.relation) ||
          left.kind.localeCompare(right.kind) ||
          left.id - right.id,
      )
      .map((relation) => referenceRelationSchema.parse(relation)),
    teaches: [...entry.teaches].sort((left, right) => left - right),
    unresolved: [...unresolved].sort(),
  };
}

function parseEmbeddedListview(
  $: CheerioAPI,
  task: ListingTask,
  entries: Map<number, EntryAccumulator>,
  warnings: Set<string>,
  variables: ReadonlyMap<string, unknown[]>,
): void {
  const expectedTemplate = task.kind === "spell-list" ? "spell" : "item";
  for (const element of $("script").toArray()) {
    const script = $(element).text();
    if (script.length > MAX_SCRIPT_BYTES) throw new Error("Listing script too large");
    if (!script.includes("new Listview")) continue;
    for (const call of calls(script, "Listview")) {
      let data: unknown;
      try {
        const configNode = call.arguments?.[0];
        const template = literal(field(configNode, "template"));
        if (template !== expectedTemplate) continue;
        const dataNode = field(configNode, "data");
        try {
          data = literal(dataNode);
        } catch {
          data = undefined;
        }
        if (
          !Array.isArray(data) &&
          dataNode?.type === "Identifier" &&
          typeof dataNode.name === "string"
        )
          data = variables.get(dataNode.name);
      } catch {
        warnings.add("nonliteral_listview_data");
        continue;
      }
      if (!Array.isArray(data)) {
        warnings.add("nonliteral_listview_data");
        continue;
      }
      for (const value of data) {
        const row = object(value);
        if (!row) continue;
        const id = row.id;
        const rawName = row.name;
        if (
          typeof id !== "number" ||
          !Number.isSafeInteger(id) ||
          id <= 0 ||
          typeof rawName !== "string"
        )
          continue;
        const name = plainText(rawName);
        if (!name) continue;
        const entry = entryFor(entries, id, name, warnings);
        applySourceCodes(entry, row.source);
        if (task.kind === "item-list") applySourceMore(entry, row.source, row.sourcemore);
        const sourceValues: unknown[] = [];
        let teachesValue: unknown;
        for (const [key, fieldValue] of Object.entries(row)) {
          if (sourceFieldPattern.test(key)) sourceValues.push(fieldValue);
          if (teachesFieldPattern.test(key)) teachesValue = fieldValue;
        }
        for (const sourceValue of sourceValues) {
          for (const text of stringsFromValue(sourceValue)) recordLabels(entry, text);
          applySourceLinks(entry, task, linksFromValue(sourceValue), warnings);
        }
        if (task.kind === "item-list" && teachesValue !== undefined) {
          for (const value of spellIdsFromValue(teachesValue)) entry.teaches.add(value);
        }
      }
    }
  }
}

interface VariableDeclarationNode extends Node {
  readonly id?: { readonly type?: string; readonly name?: string };
  readonly init?: Expression;
}

function literalListviewData($: CheerioAPI): Map<string, unknown[]> {
  const variables = new Map<string, unknown[]>();
  for (const element of $("script").toArray()) {
    const script = $(element).text();
    if (!script.includes("listview")) continue;
    if (script.length > MAX_SCRIPT_BYTES) throw new Error("Listing script too large");
    let ast: Node;
    try {
      ast = parse(script, { ecmaVersion: "latest" });
    } catch {
      continue;
    }
    simple(ast, {
      VariableDeclarator(node: Node): void {
        const declaration = node as VariableDeclarationNode;
        if (
          declaration.id?.type !== "Identifier" ||
          typeof declaration.id.name !== "string" ||
          !/^listview/i.test(declaration.id.name) ||
          declaration.init?.type !== "ArrayExpression"
        )
          return;
        try {
          const value = literal(declaration.init);
          if (Array.isArray(value)) variables.set(declaration.id.name, value);
        } catch {
          // A nonliteral array is handled by the visible-table fallback.
        }
      },
    });
  }
  return variables;
}

function sourceCodes(value: unknown): number[] {
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? [value] : [];
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is number => typeof entry === "number" && Number.isSafeInteger(entry),
  );
}

function applySourceCodes(entry: EntryAccumulator, value: unknown): void {
  if (typeof value === "string") {
    recordLabels(entry, value);
    return;
  }
  for (const code of sourceCodes(value)) {
    const label = sourceLabels.get(code);
    if (label) entry.sourceTypes.add(label);
  }
}

function applySourceMore(entry: EntryAccumulator, source: unknown, value: unknown): void {
  if (!Array.isArray(value)) return;
  const codes = new Set(sourceCodes(source));
  const hasDrop = codes.has(2) || codes.has(16) || codes.has(21) || entry.sourceTypes.has("drop");
  const hasVendor = codes.has(5) || entry.sourceTypes.has("vendor");
  const hasQuest = codes.has(4) || entry.sourceTypes.has("quest");
  for (const raw of value) {
    const more = object(raw);
    if (!more) continue;
    const type = more.t ?? more.type;
    const id = more.ti ?? more.id;
    const rawName = more.n ?? more.name;
    if (
      typeof id !== "number" ||
      !Number.isSafeInteger(id) ||
      id <= 0 ||
      typeof rawName !== "string" ||
      !rawName.trim()
    ) {
      entry.unresolved.add("sourcemore_zone_only");
      continue;
    }
    const name = normalize(rawName);
    if (type === 1 || type === "npc") {
      if (hasVendor && !hasDrop) addRelation(entry, { relation: "sold-by", kind: "npc", id, name });
      else if (hasDrop && !hasVendor)
        addRelation(entry, { relation: "dropped-by", kind: "npc", id, name });
      else entry.unresolved.add("ambiguous_vendor_or_drop");
    } else if (type === 3 || type === "item") {
      if (hasDrop || hasVendor)
        addRelation(entry, { relation: "contained-in-item", kind: "item", id, name });
      else entry.unresolved.add("sourcemore_container_without_source_type");
    } else if (type === 5 || type === "quest") {
      if (hasQuest) addRelation(entry, { relation: "reward-from", kind: "quest", id, name });
      else entry.unresolved.add("sourcemore_quest_without_quest_source");
    } else if (type === 6 || type === "spell") {
      entry.unresolved.add("sourcemore_spell_source");
    } else if (type === "object") {
      if (hasDrop || hasVendor)
        addRelation(entry, { relation: "contained-in-object", kind: "object", id, name });
      else entry.unresolved.add("sourcemore_container_without_source_type");
    } else {
      entry.unresolved.add("sourcemore_unknown_type");
    }
  }
}

function parseVisibleTable(
  $: CheerioAPI,
  task: ListingTask,
  entries: Map<number, EntryAccumulator>,
  warnings: Set<string>,
): void {
  const entityKind = task.kind === "spell-list" ? "spell" : "item";
  const tables = $("table")
    .toArray()
    .map((table) => $(table))
    .filter((table) => table.find(`a[href*="/forever/${entityKind}="]`).length > 0);
  if (tables.length === 0) {
    warnings.add("no_listing_table");
    return;
  }
  const table = tables.sort(
    (left, right) =>
      right.find(`a[href*="/forever/${entityKind}="]`).length -
      left.find(`a[href*="/forever/${entityKind}="]`).length,
  )[0]!;
  const headerCells = table.find("thead th").length
    ? table.find("thead th")
    : table.find("tr").first().find("th");
  const headers =
    headerCells.length > 0
      ? headerCells.toArray().map((cell) => normalize($(cell).text()).toLowerCase())
      : [];
  const nameIndex = headers.findIndex(
    (header) => /(?:^|\b)(?:name|recipe|spell|item)(?:\b|$)/.test(header) && !/teach/.test(header),
  );
  const sourceIndex = (() => {
    const primary = headers.findIndex((header) =>
      /(?:^|\b)(?:source|sources|acquisition|availability|learned|learn)(?:\b|$)/.test(header),
    );
    if (primary >= 0) return primary;
    return headers.findIndex((header) =>
      /(?:^|\b)(?:trainer|vendor|drop|quest)(?:\b|$)/.test(header),
    );
  })();
  const teachesIndex = headers.findIndex(
    (header, index) => index !== nameIndex && /teach|spell/.test(header),
  );
  if (sourceIndex < 0) warnings.add("no_source_column");
  if (task.kind === "item-list" && nameIndex < 0) {
    warnings.add("no_item_name_column");
    return;
  }

  const bodyRows = table.find("tbody tr").toArray();
  const candidates =
    bodyRows.length > 0
      ? bodyRows
      : table
          .find("tr")
          .toArray()
          .slice(headers.length > 0 ? 1 : 0);
  for (const rowElement of candidates) {
    const row = $(rowElement);
    const cells = row.find("td");
    if (cells.length === 0) continue;
    const nameCell = nameIndex >= 0 ? cells.eq(nameIndex) : row;
    const link = findEntityLink($, nameCell, task.game, entityKind);
    if (!link) continue;
    const name = link.name || normalize($(nameCell).text());
    if (!name) continue;
    const entry = entryFor(entries, link.id, name, warnings);
    const sourceCell = sourceIndex >= 0 ? cells.eq(sourceIndex) : null;
    if (sourceCell && sourceCell.length > 0) {
      const text = normalize(sourceCell.text());
      recordLabels(entry, text);
      applySourceLinks(entry, task, linksFromCheerio($, sourceCell), warnings);
    } else if (sourceIndex >= 0) {
      entry.unresolved.add("missing_source_cell");
    }
    if (task.kind === "item-list" && teachesIndex >= 0) {
      const teachesCell = cells.eq(teachesIndex);
      for (const spell of linksFromCheerio($, teachesCell)) {
        if (spell.kind === "spell") entry.teaches.add(spell.id);
      }
    }
  }
}

function findEntityLink(
  $: CheerioAPI,
  scope: Selection,
  game: string,
  kind: "spell" | "item",
): EntityLink | null {
  for (const anchor of scope.find(`a[href*="/${game}/${kind}="]`).toArray()) {
    const href = $(anchor).attr("href");
    if (!href) continue;
    const parsed = entityLink(href, $(anchor).text());
    if (parsed && parsed.kind === kind) return parsed;
  }
  return null;
}

function linksFromCheerio($: CheerioAPI, scope: Selection): EntityLink[] {
  const links: EntityLink[] = [];
  for (const anchor of scope.find("a[href]").toArray()) {
    const href = $(anchor).attr("href");
    if (!href) continue;
    const parsed = entityLink(href, $(anchor).text());
    if (parsed) links.push(parsed);
  }
  return links;
}

function linksFromHtml(html: string): EntityLink[] {
  const fragment = load(html);
  return linksFromCheerio(fragment, fragment.root());
}

function linksFromValue(value: unknown, depth = 0): EntityLink[] {
  if (depth > 8 || value === null || value === undefined) return [];
  if (typeof value === "string") return linksFromHtml(value);
  if (Array.isArray(value)) return value.flatMap((entry) => linksFromValue(entry, depth + 1));
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    const kind = typeof row.type === "string" ? row.type : row.kind;
    if (
      (kind === "npc" || kind === "quest" || kind === "item" || kind === "object") &&
      typeof row.id === "number" &&
      Number.isSafeInteger(row.id) &&
      row.id > 0 &&
      typeof row.name === "string" &&
      row.name.trim()
    )
      return [{ kind, id: row.id, name: normalize(row.name) }];
    return Object.values(row).flatMap((entry) => linksFromValue(entry, depth + 1));
  }
  return [];
}

function entityLink(raw: string, text: string): EntityLink | null {
  let url: URL;
  try {
    url = new URL(raw, ENTITY_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== ENTITY_ORIGIN || url.username || url.password) return null;
  const match = /^\/forever\/(npc|quest|item|object|spell)=([1-9]\d*)(?:\/|$)/.exec(url.pathname);
  if (!match) return null;
  const id = Number(match[2]);
  if (!Number.isSafeInteger(id)) return null;
  const name = normalize(text);
  return {
    kind: match[1] as EntityLink["kind"],
    id,
    name: name || `${match[1]} ${id}`,
  };
}

function stringsFromValue(value: unknown, depth = 0): string[] {
  if (depth > 8 || value === null || value === undefined) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((entry) => stringsFromValue(entry, depth + 1));
  if (typeof value === "object")
    return Object.values(value as Record<string, unknown>).flatMap((entry) =>
      stringsFromValue(entry, depth + 1),
    );
  return [];
}

function spellIdsFromValue(value: unknown, depth = 0): number[] {
  if (depth > 8 || value === null || value === undefined) return [];
  if (typeof value === "number")
    return Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647 ? [value] : [];
  if (typeof value === "string") {
    return linksFromHtml(value)
      .filter((link) => link.kind === "spell")
      .map((link) => link.id);
  }
  if (Array.isArray(value)) return value.flatMap((entry) => spellIdsFromValue(entry, depth + 1));
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    const kind = typeof row.type === "string" ? row.type : row.kind;
    if (
      kind === "spell" &&
      typeof row.id === "number" &&
      Number.isSafeInteger(row.id) &&
      row.id > 0
    )
      return [row.id];
    return Object.values(row).flatMap((entry) => spellIdsFromValue(entry, depth + 1));
  }
  return [];
}

function recordLabels(entry: EntryAccumulator, raw: string): void {
  const text = normalize(raw).toLowerCase();
  if (!text) return;
  if (/trainer|taught by/.test(text)) entry.sourceTypes.add("trainer");
  if (/vendor|sold by|sells/.test(text)) entry.sourceTypes.add("vendor");
  if (/drop|dropped by|loot/.test(text)) entry.sourceTypes.add("drop");
  if (/quest|reward/.test(text)) entry.sourceTypes.add("quest");
  if (/container|contained in|chest/.test(text)) entry.sourceTypes.add("container");
  if (/crafted|crafting/.test(text)) entry.sourceTypes.add("crafted");
  if (/world drop/.test(text)) entry.sourceTypes.add("world-drop");
}

function applySourceLinks(
  entry: EntryAccumulator,
  task: ListingTask,
  links: readonly EntityLink[],
  warnings: Set<string>,
): void {
  if (links.length === 0) return;
  const npcLinks = links.filter((link) => link.kind === "npc");
  const questLinks = links.filter((link) => link.kind === "quest");
  const itemLinks = links.filter((link) => link.kind === "item");
  const objectLinks = links.filter((link) => link.kind === "object");
  if (npcLinks.length > 20) {
    entry.unresolved.add("ambiguous_source_relation");
    warnings.add("too_many_npc_links");
    return;
  }

  const labels = entry.sourceTypes;
  if (task.kind === "spell-list") {
    if (labels.has("trainer") && npcLinks.length > 0) {
      for (const link of npcLinks)
        addRelation(entry, {
          relation: "taught-by-npc",
          kind: "npc",
          id: link.id,
          name: link.name,
        });
    }
    return;
  }

  if (labels.has("vendor") && npcLinks.length > 0) {
    for (const link of npcLinks)
      addRelation(entry, { relation: "sold-by", kind: "npc", id: link.id, name: link.name });
  }
  if (labels.has("drop") && npcLinks.length > 0) {
    for (const link of npcLinks)
      addRelation(entry, { relation: "dropped-by", kind: "npc", id: link.id, name: link.name });
  }
  if (labels.has("quest") && questLinks.length > 0) {
    for (const link of questLinks)
      addRelation(entry, {
        relation: "reward-from",
        kind: "quest",
        id: link.id,
        name: link.name,
      });
  }
  if (labels.has("container") && itemLinks.length > 0) {
    for (const link of itemLinks)
      addRelation(entry, {
        relation: "contained-in-item",
        kind: "item",
        id: link.id,
        name: link.name,
      });
  }
  if (labels.has("container") && objectLinks.length > 0) {
    for (const link of objectLinks)
      addRelation(entry, {
        relation: "contained-in-object",
        kind: "object",
        id: link.id,
        name: link.name,
      });
  }
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
