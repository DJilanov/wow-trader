#!/usr/bin/env node

import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const MAX_QUEUE_BYTES = 32_000_000;
const MAX_REPORT_BYTES = 32_000_000;
const MAX_RECORD_BYTES = 300_000;
const MAX_TASKS = 100_000;
const SPELL_ACQUISITION_RELATIONS = new Set([
  "taught-by-npc",
  "taught-by-item",
  "sold-by",
  "dropped-by",
  "reward-from",
  "contained-in-item",
  "contained-in-object",
]);
const ITEM_ACQUISITION_RELATIONS = new Set([
  "sold-by",
  "dropped-by",
  "reward-from",
  "contained-in-item",
  "contained-in-object",
]);
const LISTING_DIRECTORY = "listings";
const MAX_LISTING_BYTES = 8_000_000;

export async function buildRecipeReferenceCrawlQueue(options) {
  const recipesPath = resolve(options.recipes);
  const sourceReportPath = resolve(options.sourceReport);
  const stagingDirectory = resolve(options.staging);
  const recipeTasks = validateRecipeTasks(
    await readBoundedJson(recipesPath, MAX_QUEUE_BYTES, "Recipe acquisition queue"),
  );
  const sourceReport = await readBoundedJson(
    sourceReportPath,
    MAX_REPORT_BYTES,
    "Recipe acquisition report",
  );
  const inputQueueSha256 = sha256(JSON.stringify(recipeTasks));
  if (!isObject(sourceReport) || sourceReport.queueSha256 !== inputQueueSha256) {
    throw new Error("Recipe queue does not match its acquisition report checksum");
  }

  const listingRecords = await readListingRecords(stagingDirectory);
  const listingIndex = indexListingRecords(listingRecords);
  const recipeNames = recipeNameMap(sourceReport);
  const nameJoinEnabled = process.env.NAME_JOIN !== "0";
  const nameJoinIndex = buildNameJoinIndex(listingIndex, sourceReport);
  const nameJoins = nameJoinEnabled ? nameJoinIndex.joins : new Map();

  const teachingItemIds = new Set();
  let stagedSpellCount = 0;
  let trainerRecipeCount = 0;
  let teachingItemRecipeCount = 0;
  let directSourceRecipeCount = 0;
  let incompleteSpellCount = 0;
  let listingResolvedSpellCount = 0;
  let listingUnresolvedSpellCount = 0;
  let listingAmbiguousSpellCount = 0;
  let listingMaterializedSpellCount = 0;
  let listingNameJoinedSpellCount = 0;
  let listingNameJoinMaterializedSpellCount = 0;
  let listingResolvedTeachingItemCount = 0;

  for (const item of listingIndex.items.values()) {
    if (item.entry.relations.some((relation) => ITEM_ACQUISITION_RELATIONS.has(relation.relation)))
      listingResolvedTeachingItemCount++;
  }

  for (const task of recipeTasks) {
    let record = await readOptionalReference(stagingDirectory, task);
    const listing = listingIndex.spells.get(task.id);
    const materialized = materializeListingSpell({
      task,
      recipeName: recipeNames.get(task.id),
      listing,
      taughtByItem: listingIndex.teaches.get(task.id) ?? [],
    });
    const nameJoined =
      materialized ??
      materializeNameJoinedSpell({
        task,
        recipeName: recipeNames.get(task.id),
        join: nameJoins.get(task.id),
      });
    if (!record && nameJoined) {
      await atomicJsonWrite(
        resolve(stagingDirectory, `${task.game}-${task.kind}-${task.id}.json`),
        nameJoined,
      );
      record = nameJoined;
      if (nameJoined.sourceKind === "listing-name-join") listingNameJoinMaterializedSpellCount++;
      else listingMaterializedSpellCount++;
    } else if (
      materialized &&
      record?.sourceKind === "listing" &&
      Date.parse(materialized.capturedAt) > Date.parse(record.capturedAt)
    ) {
      await atomicJsonWrite(
        resolve(stagingDirectory, `${task.game}-${task.kind}-${task.id}.json`),
        materialized,
      );
      record = materialized;
      listingMaterializedSpellCount++;
    } else if (
      nameJoined?.sourceKind === "listing-name-join" &&
      record?.sourceKind === "listing-name-join" &&
      Date.parse(nameJoined.capturedAt) > Date.parse(record.capturedAt)
    ) {
      await atomicJsonWrite(
        resolve(stagingDirectory, `${task.game}-${task.kind}-${task.id}.json`),
        nameJoined,
      );
      record = nameJoined;
      listingNameJoinMaterializedSpellCount++;
    }
    if (!record) {
      incompleteSpellCount++;
      if (listing) {
        listingUnresolvedSpellCount++;
        if (
          listing.entry.unresolved.includes("source_relation_requires_detail_page") ||
          listing.entry.unresolved.includes("source_label_without_exact_relation") ||
          listing.entry.unresolved.includes("no_exact_source")
        )
          listingAmbiguousSpellCount++;
      }
      continue;
    }
    stagedSpellCount++;
    if (record.sourceKind === "listing" || record.sourceKind === "listing-name-join")
      listingResolvedSpellCount++;
    if (record.sourceKind === "listing-name-join") listingNameJoinedSpellCount++;
    const acquisitions = record.relations.filter((relation) =>
      SPELL_ACQUISITION_RELATIONS.has(relation.relation),
    );
    if (!acquisitions.length) incompleteSpellCount++;
    if (
      acquisitions.some(
        (relation) => relation.relation === "taught-by-npc" && relation.kind === "npc",
      )
    )
      trainerRecipeCount++;
    if (
      acquisitions.some(
        (relation) => relation.relation === "taught-by-item" && relation.kind === "item",
      )
    )
      teachingItemRecipeCount++;
    if (
      acquisitions.some(
        (relation) =>
          relation.relation !== "taught-by-npc" && relation.relation !== "taught-by-item",
      )
    )
      directSourceRecipeCount++;
    for (const relation of acquisitions) {
      if (relation.relation === "taught-by-item" && relation.kind === "item") {
        teachingItemIds.add(relation.id);
      }
    }
  }

  // The recipe-item listings identify teaching items even when no spell page
  // has exposed a taught-by-item relation yet. Queue them explicitly so their
  // tooltip/classification and acquisition evidence are collected up front.
  for (const itemId of listingIndex.items.keys()) teachingItemIds.add(itemId);

  const teachingItemTasks = [...teachingItemIds]
    .sort((left, right) => left - right)
    .map((id) => ({ game: "forever", kind: "item", id }));
  let stagedTeachingItemCount = 0;
  let sourcedTeachingItemCount = 0;
  for (const task of teachingItemTasks) {
    const record = await readOptionalReference(stagingDirectory, task);
    if (!record) continue;
    stagedTeachingItemCount++;
    if (record.relations.some((relation) => ITEM_ACQUISITION_RELATIONS.has(relation.relation)))
      sourcedTeachingItemCount++;
  }

  const tasks = [...recipeTasks, ...teachingItemTasks];
  if (tasks.length > MAX_TASKS) throw new Error("Expanded profession queue exceeds task budget");
  const buildNumber = readBuildNumber(sourceReport);
  return {
    tasks,
    report: {
      schema: "recipe-reference-crawl-plan.v1",
      generatedAt: new Date().toISOString(),
      source: {
        recipes: recipesPath,
        acquisitionReport: sourceReportPath,
        queueSha256: inputQueueSha256,
        buildNumber,
      },
      summary: {
        recipeSpellCount: recipeTasks.length,
        stagedSpellCount,
        trainerRecipeCount,
        teachingItemRecipeCount,
        directSourceRecipeCount,
        incompleteSpellCount,
        teachingItemFollowupCount: teachingItemTasks.length,
        stagedTeachingItemCount,
        sourcedTeachingItemCount,
        incompleteTeachingItemCount: teachingItemTasks.length - sourcedTeachingItemCount,
        totalCrawlTaskCount: tasks.length,
        pendingCrawlTaskCount:
          recipeTasks.length -
          stagedSpellCount +
          teachingItemTasks.length -
          stagedTeachingItemCount,
        listingRecordCount: listingRecords.length,
        listingSpellRecordCount: listingRecords.filter((record) => record.kind === "spell-list")
          .length,
        listingItemRecordCount: listingRecords.filter((record) => record.kind === "item-list")
          .length,
        listingSpellEntryCount: listingIndex.spells.size,
        listingItemEntryCount: listingIndex.items.size,
        listingResolvedSpellCount,
        listingMaterializedSpellCount,
        listingNameJoinCandidates: nameJoins.size,
        listingNameJoinedSpellCount,
        listingNameJoinMaterializedSpellCount,
        listingNameJoinAmbiguousCount: nameJoinIndex.ambiguous,
        listingNameJoinNoItemCount: nameJoinIndex.unmatched,
        listingNameJoinDisabled: !nameJoinEnabled,
        listingUnresolvedSpellCount,
        listingAmbiguousSpellCount,
        listingResolvedTeachingItemCount,
        listingItemQueueCount: listingIndex.items.size,
        unstagedSpellCount: recipeTasks.length - stagedSpellCount,
      },
      listingNameJoins: [...nameJoins.entries()]
        .map(([spellId, join]) => ({
          spellId,
          spellName: join.spellName,
          itemId: join.itemId,
          itemName: join.itemName,
          profession: join.profession,
        }))
        .sort(
          (left, right) =>
            left.profession.localeCompare(right.profession) || left.spellId - right.spellId,
        ),
      dataContract: {
        authoritativeClientFields: [
          "profession",
          "required_skill",
          "reagents",
          "outputs",
          "craft_time",
          "cooldown",
        ],
        spellPageEvidence: ["taught-by-npc", "taught-by-item"],
        teachingItemPageEvidence: [
          "sold-by",
          "dropped-by",
          "reward-from",
          "contained-in-item",
          "contained-in-object",
        ],
        listingEvidence: [
          "exact taught-by-npc link under a Trainer source",
          "exact taught-by-item link under an item listing",
          "exact sold-by/dropped-by/reward-from/container links under an item source",
        ],
        listingPolicy:
          "Broad source labels are hints only. Exact links resolve a task; ambiguous or label-only rows keep the detail-page fallback.",
        nameJoinPolicy:
          "Recipe-item names are stripped of Recipe/Plans/Pattern/Schematic/Formula/Design/Technique/Manual/Blueprint prefixes and joined to client recipe names within the same profession. Only unique one-to-one matches are materialized; duplicates and misses keep the spell detail page.",
        absencePolicy: "Missing acquisition evidence remains incomplete and is not inferred.",
      },
      expandedQueueSha256: sha256(JSON.stringify(tasks)),
    },
  };
}

export async function writeRecipeReferenceCrawlQueue(options) {
  const result = await buildRecipeReferenceCrawlQueue(options);
  await Promise.all([
    atomicJsonWrite(resolve(options.queue), result.tasks),
    atomicJsonWrite(resolve(options.report), result.report),
  ]);
  return {
    queue: resolve(options.queue),
    report: resolve(options.report),
    ...result.report.summary,
  };
}

function validateRecipeTasks(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_TASKS) {
    throw new Error("Recipe acquisition queue must contain 1-100000 tasks");
  }
  const tasks = value.map((task, index) => {
    if (
      !isObject(task) ||
      Object.keys(task).some((key) => !["game", "kind", "id"].includes(key)) ||
      task.game !== "forever" ||
      task.kind !== "spell" ||
      !Number.isSafeInteger(task.id) ||
      task.id <= 0 ||
      task.id > 2_147_483_647
    ) {
      throw new Error(`Invalid Forever recipe spell task at index ${index}`);
    }
    return { game: "forever", kind: "spell", id: task.id };
  });
  const keys = tasks.map((task) => `${task.game}-${task.kind}-${task.id}`);
  if (new Set(keys).size !== keys.length)
    throw new Error("Recipe acquisition queue has duplicates");
  return tasks;
}

async function readListingRecords(stagingDirectory) {
  const directory = resolve(stagingDirectory, LISTING_DIRECTORY);
  let names;
  try {
    names = await readdir(directory);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const records = [];
  for (const name of names.sort()) {
    if (!name.endsWith(".json") || name.endsWith(".missing.json") || name.endsWith(".error.json"))
      continue;
    const path = resolve(directory, name);
    const metadata = await stat(path);
    if (!metadata.isFile() || metadata.size > MAX_LISTING_BYTES) continue;
    const value = JSON.parse(await readFile(path, "utf8"));
    if (
      !isObject(value) ||
      value.schema !== "wowhead-listing.v1" ||
      value.game !== "forever" ||
      !Array.isArray(value.entries)
    )
      continue;
    records.push(value);
  }
  return records;
}

function indexListingRecords(records) {
  const spells = new Map();
  const items = new Map();
  const teaches = new Map();
  for (const record of records) {
    if (record.kind !== "spell-list" && record.kind !== "item-list") continue;
    for (const entry of record.entries) {
      if (!validListingEntry(entry)) continue;
      const relations = readListingRelations(entry.relations, `listing ${record.path}`);
      if (record.kind === "spell-list") {
        const existing = spells.get(entry.id);
        const current = existing ?? {
          record,
          entry: {
            id: entry.id,
            name: entry.name.trim(),
            sourceTypes: [],
            relations: [],
            teaches: [],
            unresolved: [],
          },
        };
        current.entry.sourceTypes = mergeStrings(current.entry.sourceTypes, entry.sourceTypes);
        current.entry.relations = dedupeRelations([...current.entry.relations, ...relations]);
        current.entry.unresolved = mergeStrings(current.entry.unresolved, entry.unresolved);
        if (!existing || Date.parse(record.capturedAt) >= Date.parse(existing.record.capturedAt)) {
          current.record = record;
          current.entry.name = entry.name.trim();
        }
        spells.set(entry.id, current);
        continue;
      }
      const existing = items.get(entry.id);
      if (!existing || Date.parse(record.capturedAt) >= Date.parse(existing.record.capturedAt)) {
        items.set(entry.id, {
          record,
          entry: {
            id: entry.id,
            name: entry.name.trim(),
            sourceTypes: mergeStrings([], entry.sourceTypes),
            relations,
            teaches: entry.teaches.filter(
              (spellId) => Number.isSafeInteger(spellId) && spellId > 0,
            ),
            unresolved: mergeStrings([], entry.unresolved),
          },
        });
      }
      for (const spellId of entry.teaches) {
        if (!Number.isSafeInteger(spellId) || spellId <= 0) continue;
        const list = teaches.get(spellId) ?? [];
        if (!list.some((item) => item.itemId === entry.id))
          list.push({ itemId: entry.id, itemName: entry.name.trim(), record });
        teaches.set(spellId, list);
      }
    }
  }
  return { spells, items, teaches };
}

function buildNameJoinIndex(listingIndex, sourceReport) {
  const recipeByProfession = new Map();
  for (const entry of recipeEntries(sourceReport)) {
    const profession = slugifyProfession(entry.professionName);
    if (!profession) continue;
    const key = normalizeRecipeName(entry.name);
    if (!key) continue;
    const byName = recipeByProfession.get(profession) ?? new Map();
    const list = byName.get(key) ?? [];
    list.push({ id: entry.recipeSpellId, name: entry.name });
    byName.set(key, list);
    recipeByProfession.set(profession, byName);
  }

  const itemsByProfession = new Map();
  for (const item of listingIndex.items.values()) {
    const profession = item.record.profession;
    const key = normalizeRecipeName(stripRecipePrefix(item.entry.name));
    if (!key) continue;
    const byName = itemsByProfession.get(profession) ?? new Map();
    const list = byName.get(key) ?? [];
    list.push({
      itemId: item.entry.id,
      itemName: item.entry.name,
      record: item.record,
    });
    byName.set(key, list);
    itemsByProfession.set(profession, byName);
  }

  const joins = new Map();
  let ambiguous = 0;
  let unmatched = 0;
  let matched = 0;
  for (const [profession, items] of itemsByProfession) {
    const recipes = recipeByProfession.get(profession);
    for (const [key, itemList] of items) {
      const recipeList = recipes?.get(key) ?? [];
      if (recipeList.length === 0) {
        unmatched += itemList.length;
        continue;
      }
      if (itemList.length !== 1 || recipeList.length !== 1) {
        ambiguous += itemList.length;
        continue;
      }
      const item = itemList[0];
      const recipe = recipeList[0];
      joins.set(recipe.id, {
        itemId: item.itemId,
        itemName: item.itemName,
        spellName: recipe.name,
        profession,
        record: item.record,
      });
      matched++;
    }
  }
  return { joins, ambiguous, unmatched, matched };
}

function recipeEntries(sourceReport) {
  const entries = Array.isArray(sourceReport.unresolvedRecipes)
    ? sourceReport.unresolvedRecipes
    : Array.isArray(sourceReport.entries)
      ? sourceReport.entries
      : [];
  return entries.filter(
    (entry) =>
      isObject(entry) &&
      Number.isSafeInteger(entry.recipeSpellId) &&
      entry.recipeSpellId > 0 &&
      typeof entry.name === "string" &&
      entry.name.trim().length > 0 &&
      typeof entry.professionName === "string" &&
      entry.professionName.trim().length > 0,
  );
}

function slugifyProfession(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stripRecipePrefix(value) {
  return value
    .replace(
      /^(?:recipe|plans|pattern|schematic|formula|design|technique|manual|blueprint|tome|book)\s*:\s*/i,
      "",
    )
    .trim();
}

function normalizeRecipeName(value) {
  return value
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function materializeNameJoinedSpell({ task, recipeName, join }) {
  if (!join || task.kind !== "spell") return null;
  const name = recipeName ?? join.spellName;
  if (!name) return null;
  return {
    game: task.game,
    kind: task.kind,
    id: task.id,
    schema: "wowhead-reference.v1",
    sourceKind: "listing-name-join",
    name,
    sourceUrl: join.record.sourceUrl,
    capturedAt: join.record.capturedAt,
    permissionRef: join.record.permissionRef,
    sourceSha256: join.record.sourceSha256,
    tooltipLines: [],
    numericFacts: {},
    quickFacts: [],
    objectives: [],
    description: "",
    rewards: [],
    relations: [
      {
        relation: "taught-by-item",
        kind: "item",
        id: join.itemId,
        name: join.itemName,
      },
    ],
  };
}

function recipeNameMap(sourceReport) {
  const names = new Map();
  if (Array.isArray(sourceReport.unresolvedRecipes))
    for (const entry of sourceReport.unresolvedRecipes)
      if (
        isObject(entry) &&
        Number.isSafeInteger(entry.recipeSpellId) &&
        typeof entry.name === "string" &&
        entry.name.trim()
      )
        names.set(entry.recipeSpellId, entry.name.trim());
  return names;
}

function materializeListingSpell({ task, recipeName, listing, taughtByItem }) {
  if (task.kind !== "spell") return null;
  const relations = [];
  let provenance = null;
  if (listing) {
    for (const relation of listing.entry.relations) {
      if (
        (relation.relation === "taught-by-npc" && relation.kind === "npc") ||
        (relation.relation === "taught-by-item" && relation.kind === "item")
      ) {
        relations.push(relation);
        provenance = listing.record;
      }
    }
  }
  for (const item of taughtByItem) {
    relations.push({
      relation: "taught-by-item",
      kind: "item",
      id: item.itemId,
      name: item.itemName,
    });
    provenance ??= item.record;
  }
  if (!relations.length || !provenance) return null;
  if (
    recipeName &&
    listing?.entry.name &&
    normalizeName(recipeName) !== normalizeName(listing.entry.name)
  )
    return null;
  const name = recipeName ?? listing?.entry.name;
  if (!name) return null;
  return {
    game: task.game,
    kind: task.kind,
    id: task.id,
    schema: "wowhead-reference.v1",
    sourceKind: "listing",
    name,
    sourceUrl: provenance.sourceUrl,
    capturedAt: provenance.capturedAt,
    permissionRef: provenance.permissionRef,
    sourceSha256: provenance.sourceSha256,
    tooltipLines: [],
    numericFacts: {},
    quickFacts: [],
    objectives: [],
    description: "",
    rewards: [],
    relations: dedupeRelations(relations),
  };
}

function validListingEntry(entry) {
  return (
    isObject(entry) &&
    Number.isSafeInteger(entry.id) &&
    entry.id > 0 &&
    typeof entry.name === "string" &&
    entry.name.trim().length > 0 &&
    Array.isArray(entry.sourceTypes) &&
    Array.isArray(entry.relations) &&
    Array.isArray(entry.teaches) &&
    Array.isArray(entry.unresolved)
  );
}

function readListingRelations(value, label) {
  if (!Array.isArray(value)) return [];
  const kinds = new Set(["npc", "quest", "spell", "item", "object"]);
  return value.map((relation, index) => {
    if (
      !isObject(relation) ||
      typeof relation.relation !== "string" ||
      !relation.relation.trim() ||
      typeof relation.kind !== "string" ||
      !kinds.has(relation.kind) ||
      !Number.isSafeInteger(relation.id) ||
      relation.id <= 0 ||
      typeof relation.name !== "string" ||
      !relation.name.trim()
    )
      throw new Error(`Invalid relation ${index} in ${label}`);
    return {
      relation: relation.relation.trim(),
      kind: relation.kind,
      id: relation.id,
      name: relation.name.trim(),
    };
  });
}

function dedupeRelations(relations) {
  const unique = new Map();
  for (const relation of relations) {
    const key = `${relation.relation}|${relation.kind}|${relation.id}`;
    const existing = unique.get(key);
    if (!existing || (!existing.name && relation.name)) unique.set(key, relation);
  }
  return [...unique.values()].sort(
    (left, right) =>
      left.relation.localeCompare(right.relation) ||
      left.kind.localeCompare(right.kind) ||
      left.id - right.id,
  );
}

function mergeStrings(left, right) {
  return [...new Set([...left, ...right.filter((value) => typeof value === "string")])]
    .map((value) => value.trim())
    .filter(Boolean)
    .sort();
}

function normalizeName(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function readOptionalReference(stagingDirectory, task) {
  const path = resolve(stagingDirectory, `${task.game}-${task.kind}-${task.id}.json`);
  let value;
  try {
    value = await readBoundedJson(path, MAX_RECORD_BYTES, "Staged reference");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  if (
    !isObject(value) ||
    value.schema !== "wowhead-reference.v1" ||
    value.game !== task.game ||
    value.kind !== task.kind ||
    value.id !== task.id ||
    !Array.isArray(value.relations)
  ) {
    throw new Error(`Invalid staged reference identity: ${path}`);
  }
  const relations = value.relations.map((relation, index) => {
    if (
      !isObject(relation) ||
      typeof relation.relation !== "string" ||
      !["npc", "quest", "spell", "item", "object"].includes(relation.kind) ||
      !Number.isSafeInteger(relation.id) ||
      relation.id <= 0 ||
      typeof relation.name !== "string" ||
      !relation.name.trim()
    ) {
      throw new Error(`Invalid relation ${index} in staged reference: ${path}`);
    }
    return relation;
  });
  return {
    relations,
    ...(typeof value.sourceKind === "string" ? { sourceKind: value.sourceKind } : {}),
    ...(typeof value.capturedAt === "string" ? { capturedAt: value.capturedAt } : {}),
  };
}

function readBuildNumber(report) {
  const value = report.catalog?.buildNumber ?? report.sourceCatalog?.buildNumber;
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

async function readBoundedJson(path, maximumBytes, label) {
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size > maximumBytes) {
    throw new Error(`${label} exceeds its file budget`);
  }
  const source = await readFile(path, "utf8");
  if (Buffer.byteLength(source) > maximumBytes) throw new Error(`${label} exceeds its byte budget`);
  try {
    return JSON.parse(source);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

async function atomicJsonWrite(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch((cleanupError) => {
      if (cleanupError?.code !== "ENOENT") throw cleanupError;
    });
    throw error;
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const separator = argument.indexOf("=");
    const name = argument.slice(2, separator === -1 ? undefined : separator);
    const value = separator === -1 ? argv[++index] : argument.slice(separator + 1);
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${name}`);
    values.set(name, value);
  }
  const recipes = values.get("recipes");
  const sourceReport = values.get("source-report");
  const staging = values.get("staging");
  const queue = values.get("queue");
  if (!recipes || !sourceReport || !staging || !queue) {
    throw new Error(
      "Usage: recipe-reference-crawl-queue.mjs --recipes <queue> --source-report <report> --staging <directory> --queue <expanded queue> [--report <plan report>]",
    );
  }
  return {
    recipes,
    sourceReport,
    staging,
    queue,
    report: values.get("report") ?? `${queue}.report.json`,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  writeRecipeReferenceCrawlQueue(parseArguments(process.argv.slice(2)))
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
