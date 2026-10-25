#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { loadCatalogSnapshot } from "../packages/catalog/dist/index.js";
import {
  atomicJsonWrite,
  listingRecordSchema,
  referenceRecordSchema,
  referenceTaskSchema,
} from "../packages/reference-data/dist/index.js";
import {
  decodeQuestieSpawnLocations,
  loadQuestieForeverExport,
} from "../packages/world-data/dist/index.js";

/** @typedef {import('../packages/reference-data/dist/index.js').ReferenceRecord} ReferenceRecord */
/** @typedef {import('../packages/contracts/dist/index.js').CatalogBundle} CatalogBundle */
/** @typedef {import('../packages/world-data/dist/index.js').QuestieForeverBundle} CommunityBundle */

const ITEM_SOURCES = new Set([
  "sold-by",
  "dropped-by",
  "reward-from",
  "contained-in-item",
  "contained-in-object",
]);
const SPELL_SOURCES = new Set(["taught-by-npc", "taught-by-item", ...ITEM_SOURCES]);
const COMMUNITY_SOURCES = new Map([
  ["sold_by_npc", "sold-by"],
  ["dropped_by_npc", "dropped-by"],
  ["dropped_by_object", "contained-in-object"],
  ["contained_in_item", "contained-in-item"],
  ["rewarded_by_quest", "reward-from"],
]);
const PREFIX =
  /^(?:recipe|plans|pattern|schematic|formula|design|technique|manual|blueprint|tome|book):?\s+/i;
const normalize = (value) =>
  value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const npcName = (value) => normalize(value.replace(/\s*<[^>]*>\s*$/, ""));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const unique = (values) => [...new Set(values)].sort();
const markedUnused = (name) => /\b(?:unused|obsolete|deprecated)\b|\(old\)/i.test(name);

/**
 * Reconcile evidence without modifying captures or treating absence as unavailability.
 * @param {{catalog: CatalogBundle, community: CommunityBundle, tasks: readonly {game: string, kind: string, id: number}[], records: readonly ReferenceRecord[], listings: readonly import('../packages/reference-data/dist/index.js').ListingRecord[]}} input
 * @returns {object} A review-only evidence report and new-only NPC tasks.
 */
export function reconcileProfessionCrawl({ catalog, community, tasks, records, listings }) {
  const recipes = new Map(catalog.recipes.map((row) => [row.recipeSpellId, row]));
  const spells = new Map(catalog.spells.map((row) => [row.spellId, row]));
  const items = new Map(catalog.items.map((row) => [row.itemId, row]));
  const professions = new Map(catalog.professions.map((row) => [row.skillLineId, row.name]));
  const skillAliases = group(
    catalog.recipes.filter((row) => {
      const ability = row.rawRecord?.skillLineAbility;
      return (
        ability?.SkillLine === row.professionSkillLineId &&
        Number.isSafeInteger(ability.SkillupSkillLineID) &&
        ability.SkillupSkillLineID > 0
      );
    }),
    (row) => row.rawRecord.skillLineAbility.SkillupSkillLineID,
  );
  const professionForSkill = (id) => {
    if (professions.has(id)) return slug(professions.get(id));
    const aliases = unique((skillAliases.get(id) ?? []).map((row) => row.professionSkillLineId));
    return aliases.length === 1 ? slug(professions.get(Number(aliases[0]))) : null;
  };
  const staged = new Map(records.map((row) => [`${row.kind}:${row.id}`, row]));
  const baseline = new Map(community.entities.map((row) => [`${row.kind}:${row.id}`, row]));
  const scopedSpellIds = new Set(tasks.filter((row) => row.kind === "spell").map((row) => row.id));
  const scopedItemIds = new Set(tasks.filter((row) => row.kind === "item").map((row) => row.id));
  for (const id of scopedSpellIds)
    if (!recipes.has(id)) throw new Error(`Spell ${id} is not a recipe in the pinned catalog`);
  const listingSpells = group(
    listings
      .filter((row) => row.kind === "spell-list")
      .flatMap((listing) => listing.entries.map((entry) => ({ ...entry, listing }))),
    (row) => row.id,
  );
  const listingItems = listings
    .filter((row) => row.kind === "item-list")
    .flatMap((listing) => listing.entries.map((entry) => ({ ...entry, listing })));
  const recipesByName = group(
    [...scopedSpellIds].map((id) => ({
      id,
      name: spells.get(id)?.name ?? "",
      profession: slug(professions.get(recipes.get(id).professionSkillLineId)),
    })),
    (row) => `${row.profession}:${normalize(row.name)}`,
  );
  const itemsByName = group(
    listingItems,
    (row) => `${row.listing.profession}:${normalize(row.name.replace(PREFIX, ""))}`,
  );
  const outputAliases = group(
    catalog.recipeOutputs
      .filter((row) => scopedSpellIds.has(row.recipeSpellId))
      .flatMap((row) => {
        const recipe = recipes.get(row.recipeSpellId);
        return [items.get(row.outputItemId)?.name, baseline.get(`item:${row.outputItemId}`)?.name]
          .filter(Boolean)
          .map((name) => ({
            id: row.recipeSpellId,
            name,
            outputItemId: row.outputItemId,
            profession: slug(professions.get(recipe.professionSkillLineId)),
          }));
      }),
    (row) => `${row.profession}:${normalize(row.name)}`,
  );
  const baselineSources = group(
    community.relations.filter(
      (row) => row.sourceKind === "item" && COMMUNITY_SOURCES.has(row.relationKind),
    ),
    (row) => row.sourceId,
  );
  const taught = group(
    records
      .filter((row) => row.kind === "npc")
      .flatMap((npc) =>
        npc.relations
          .filter((row) => row.relation === "teaches" && row.kind === "spell")
          .map((row) => ({ id: row.id, npcId: npc.id, evidence: referenceEvidence(npc) })),
      ),
    (row) => row.id,
  );
  const sold = group(
    records
      .filter((row) => row.kind === "npc")
      .flatMap((npc) =>
        npc.relations
          .filter((row) => row.relation === "sells" && row.kind === "item")
          .map((row) => ({ id: row.id, npcId: npc.id, evidence: referenceEvidence(npc) })),
      ),
    (row) => row.id,
  );

  const identities = [];
  const proposedRelations = [];
  for (const entry of listingItems) {
    const key = `${entry.listing.profession}:${normalize(entry.name.replace(PREFIX, ""))}`;
    const candidates = recipesByName.get(key) ?? [];
    const siblings = itemsByName.get(key) ?? [];
    const client = items.get(entry.id);
    const page = staged.get(`item:${entry.id}`);
    const namesAgree =
      client &&
      normalize(client.name) === normalize(entry.name) &&
      (!client.requiredSkillId ||
        professionForSkill(client.requiredSkillId) === entry.listing.profession) &&
      (!page || normalize(page.name) === normalize(client.name));
    const direct = unique([
      ...entry.teaches,
      ...(page?.relations
        .filter((row) => row.relation === "teaches" && row.kind === "spell")
        .map((row) => row.id) ?? []),
      ...catalog.recipeTeachingItems
        .filter((row) => row.teachingItemId === entry.id)
        .map((row) => row.recipeSpellId),
    ])
      .map(Number)
      .filter(
        (id) =>
          scopedSpellIds.has(id) &&
          slug(professions.get(recipes.get(id).professionSkillLineId)) === entry.listing.profession,
      );
    const description = client?.description ?? "";
    const taughtName = description.match(
      /^Teaches you how to (?:make|create|craft|cook|sew|brew|distill) (.+?)\.?$/i,
    )?.[1];
    const descriptionMatches = taughtName
      ? candidates.filter(
          (row) => normalize(taughtName.replace(/^an?\s+/i, "")) === normalize(row.name),
        )
      : [];
    const inferred =
      candidates.length === 1 && (siblings.length === 1 || descriptionMatches.length === 1)
        ? [candidates[0].id]
        : [];
    const aliasRows = outputAliases.get(key) ?? [];
    const aliasIds = unique(aliasRows.map((row) => row.id)).map(Number);
    const aliasMatch =
      candidates.length === 0 &&
      aliasIds.length === 1 &&
      taughtName &&
      normalize(taughtName.replace(/^an?\s+/i, "")) === normalize(entry.name.replace(PREFIX, ""))
        ? aliasIds
        : [];
    let selected = [];
    let status = candidates.length ? "ambiguous" : "unmatched";
    if (!namesAgree) status = "client_identity_conflict";
    else if (markedUnused(client.name)) status = "marked_unused";
    else if (direct.length) {
      selected = direct;
      status = "explicit_teaching_id";
    } else if (inferred.length) {
      selected = inferred;
      status =
        siblings.length > 1 ? "client_description_name_match" : "unique_profession_name_match";
    } else if (aliasMatch.length) {
      selected = aliasMatch;
      status = "output_identity_name_match";
    }
    const row = {
      itemId: entry.id,
      itemName: entry.name,
      profession: entry.listing.profession,
      status,
      previously:
        candidates.length === 0
          ? "unmatched"
          : candidates.length !== 1 || siblings.length !== 1
            ? "ambiguous"
            : "unique",
      candidateSpellIds: candidates.map((candidate) => candidate.id),
      selectedSpellIds: selected,
      siblingItemIds: siblings.map((sibling) => sibling.id),
      clientDescription: description,
      clientRequiredSkillId: client?.requiredSkillId ?? null,
      clientProfession: client?.requiredSkillId ? professionForSkill(client.requiredSkillId) : null,
      outputAliases: aliasRows,
      evidence: referenceEvidence(entry.listing),
    };
    identities.push(row);
    for (const id of selected) {
      const existing = staged
        .get(`spell:${id}`)
        ?.relations.some(
          (relation) =>
            relation.relation === "taught-by-item" &&
            relation.kind === "item" &&
            relation.id === entry.id,
        );
      if (!existing)
        proposedRelations.push({
          sourceKind: "spell",
          sourceId: id,
          relation: "taught-by-item",
          kind: "item",
          id: entry.id,
          confidence: status,
          evidence: row.evidence,
          identityEvidence: {
            itemName: row.itemName,
            clientDescription: description,
            outputAliases: aliasRows,
          },
          catalogBuild: catalog.manifest.buildNumber,
          publication: "review_required",
        });
    }
  }

  const unresolvedSpells = [...scopedSpellIds].filter(
    (id) => !staged.get(`spell:${id}`)?.relations.some((row) => SPELL_SOURCES.has(row.relation)),
  );
  const spellGaps = unresolvedSpells
    .sort((a, b) => a - b)
    .map((id) => {
      const recipe = recipes.get(id);
      const page = staged.get(`spell:${id}`);
      const hints = listingSpells.get(id) ?? [];
      const sourceHints = unique(hints.flatMap((row) => row.sourceTypes));
      const proposed = proposedRelations.filter(
        (row) => row.sourceKind === "spell" && row.sourceId === id,
      );
      const inverseTrainers = taught.get(id) ?? [];
      for (const trainer of markedUnused(spells.get(id)?.name ?? "") ? [] : inverseTrainers)
        proposedRelations.push({
          sourceKind: "spell",
          sourceId: id,
          relation: "taught-by-npc",
          kind: "npc",
          id: trainer.npcId,
          confidence: "explicit_npc_teaching_list",
          evidence: trainer.evidence,
          catalogBuild: catalog.manifest.buildNumber,
          publication: "review_required",
        });
      return {
        spellId: id,
        name: spells.get(id)?.name ?? page?.name ?? null,
        profession: professions.get(recipe.professionSkillLineId) ?? null,
        clientAcquireMethod: recipe.rawRecord?.skillLineAbility?.AcquireMethod ?? null,
        sourceHints,
        classification: markedUnused(spells.get(id)?.name ?? "")
          ? "marked_unused"
          : inverseTrainers.length
            ? "npc_teaching_evidence_pending_review"
            : proposed.length
              ? "identity_match_pending_review"
              : sourceHints.length
                ? "listing_source_hint_only"
                : "unknown",
        inverseTrainers,
        proposedTeachingItemIds: proposed.map((row) => row.id),
        evidence: [page, ...hints.map((row) => row.listing)].filter(Boolean).map(referenceEvidence),
      };
    });
  const sourceLessItems = [...scopedItemIds].filter(
    (id) => !staged.get(`item:${id}`)?.relations.some((row) => ITEM_SOURCES.has(row.relation)),
  );
  const itemGaps = sourceLessItems
    .sort((a, b) => a - b)
    .map((id) => {
      const client = items.get(id);
      const page = staged.get(`item:${id}`);
      const historical = baseline.get(`item:${id}`);
      const hints = listingItems.filter((row) => row.id === id);
      const sourceHints = unique(hints.flatMap((row) => row.sourceTypes));
      const nameAgreement =
        !!client &&
        !!historical &&
        normalize(client.name) === normalize(historical.name ?? "") &&
        (!page || normalize(page.name) === normalize(client.name));
      const sources = (baselineSources.get(id) ?? []).map((row) => ({
        relation: COMMUNITY_SOURCES.get(row.relationKind),
        kind: row.targetKind,
        id: row.targetId,
        usable: nameAgreement,
        evidence: row.evidence,
      }));
      const inverseVendors = sold.get(id) ?? [];
      if (!markedUnused(client?.name ?? page?.name ?? "")) {
        for (const vendor of inverseVendors)
          proposedRelations.push({
            sourceKind: "item",
            sourceId: id,
            relation: "sold-by",
            kind: "npc",
            id: vendor.npcId,
            confidence: "explicit_npc_vendor_list",
            evidence: vendor.evidence,
            catalogBuild: catalog.manifest.buildNumber,
            publication: "review_required",
          });
        for (const source of sources.filter((row) => row.usable))
          proposedRelations.push({
            sourceKind: "item",
            sourceId: id,
            relation: source.relation,
            kind: source.kind,
            id: source.id,
            confidence: "pinned_community_baseline",
            evidence: {
              ...source.evidence,
              sourceRevision: community.sourceRevision,
              checksum: community.checksum,
            },
            catalogBuild: catalog.manifest.buildNumber,
            publication: "review_required",
          });
      }
      return {
        itemId: id,
        name: client?.name ?? page?.name ?? null,
        sourceHints,
        classification: markedUnused(client?.name ?? page?.name ?? "")
          ? "marked_unused"
          : inverseVendors.length
            ? "npc_vendor_evidence_pending_review"
            : sources.some((row) => row.usable)
              ? "baseline_source_pending_review"
              : sourceHints.length
                ? "listing_source_hint_only"
                : "unknown",
        baselineName: historical?.name ?? null,
        baselineNameAgreement: nameAgreement,
        baselineSources: sources,
        inverseVendors,
        evidence: [page, ...hints.map((row) => row.listing)].filter(Boolean).map(referenceEvidence),
      };
    });
  const npcLocations = records
    .filter((row) => row.kind === "npc")
    .map((npc) => {
      const historical = baseline.get(`npc:${npc.id}`);
      const decoded = decodeQuestieSpawnLocations(historical?.data.spawns);
      const nameAgreement = !!historical?.name && npcName(npc.name) === npcName(historical.name);
      return {
        npcId: npc.id,
        name: npc.name,
        baselineName: historical?.name ?? null,
        status: !historical
          ? "missing_baseline"
          : !nameAgreement
            ? "name_conflict"
            : decoded.locations.length
              ? "joined"
              : "missing_coordinates",
        zoneId: historical?.data.zoneID ?? null,
        locations: nameAgreement ? decoded.locations : [],
        rejectedCoordinates: decoded.rejectedCount,
      };
    })
    .sort((a, b) => a.npcId - b.npcId);

  // Catalog candidates are discovery tasks, never assertions that a trainer teaches a recipe.
  const candidates = new Map();
  const addCandidate = (id, reason) => {
    if (staged.has(`npc:${id}`)) return;
    const row = baseline.get(`npc:${id}`);
    const previous = candidates.get(id);
    candidates.set(id, {
      npcId: id,
      name: row?.name ?? null,
      subName: row?.data.subName ?? null,
      reasons: unique([...(previous?.reasons ?? []), reason]),
    });
  };
  for (const row of community.entities) {
    if (row.kind !== "npc" || typeof row.data.subName !== "string") continue;
    if (
      /(?:alchemy|alchemist|blacksmith|cooking|cook|enchant|engineer|first aid|physician|herbal|leatherwork|mining|skinning|tailor|fishing|fisherman)/i.test(
        row.data.subName,
      ) &&
      /(?:trainer|supplies|supplier|master|artisan|journeyman|apprentice|expert)/i.test(
        row.data.subName,
      )
    )
      addCandidate(row.id, "profession_catalog_title");
  }
  for (const row of itemGaps)
    for (const source of row.baselineSources)
      if (source.usable && source.kind === "npc" && source.relation === "sold-by")
        addCandidate(source.id, `baseline_vendor_for_item:${row.itemId}`);
  const npcCandidates = [...candidates.values()].sort((a, b) => a.npcId - b.npcId);
  const npcQueue = npcCandidates.map((row) => ({ game: "forever", kind: "npc", id: row.npcId }));
  const unscopedItems = records
    .filter(
      (row) =>
        row.kind === "item" &&
        !scopedItemIds.has(row.id) &&
        !row.relations.some((relation) => ITEM_SOURCES.has(relation.relation)),
    )
    .map((row) => row.id)
    .sort((a, b) => a - b);
  const relationKeys = new Set();
  const distinctProposals = proposedRelations.filter((row) => {
    const key = `${row.sourceKind}:${row.sourceId}:${row.relation}:${row.kind}:${row.id}`;
    if (relationKeys.has(key)) return false;
    relationKeys.add(key);
    return true;
  });
  return {
    schema: "profession-crawl-reconciliation.v1",
    policy: {
      publication: "review_required",
      capturesModified: false,
      acquireMethod: "Raw client value only; no undocumented numeric meaning is inferred.",
      sourceHints: "Listing hints are not exact sources; drop does not establish world-drop scope.",
      absence: "No source does not prove a recipe is obsolete or unavailable.",
      community: "Pinned baseline, not proof of current live trainer/vendor availability.",
    },
    catalog: {
      product: catalog.manifest.product,
      buildNumber: catalog.manifest.buildNumber,
      clientVersion: catalog.manifest.clientVersion,
      locale: catalog.manifest.locale,
    },
    community: {
      sourceKind: community.sourceKind,
      sourceVersion: community.sourceVersion,
      sourceRevision: community.sourceRevision,
      checksum: community.checksum,
      includedAuthored: community.includedAuthored,
      licenseRef: community.licenseRef,
    },
    summary: {
      recipeSpells: scopedSpellIds.size,
      teachingItems: scopedItemIds.size,
      spellGaps: spellGaps.length,
      itemGaps: itemGaps.length,
      unscopedSourceLessItems: unscopedItems.length,
      spellClassifications: countBy(spellGaps, (row) => row.classification),
      itemClassifications: countBy(itemGaps, (row) => row.classification),
      identityClassifications: countBy(identities, (row) => row.status),
      previousIdentityClassifications: countBy(identities, (row) => row.previously),
      identityProposals: distinctProposals.filter((row) => row.relation === "taught-by-item")
        .length,
      sourceRelationProposals: distinctProposals.filter((row) => row.relation !== "taught-by-item")
        .length,
      acquireMethodCounts: countBy(spellGaps, (row) => String(row.clientAcquireMethod)),
      newlyLinkedSpellGaps: spellGaps.filter((row) => row.proposedTeachingItemIds.length).length,
      previouslyAmbiguousResolved: identities.filter(
        (row) => row.previously === "ambiguous" && row.selectedSpellIds.length,
      ).length,
      previouslyUnmatchedResolved: identities.filter(
        (row) => row.previously === "unmatched" && row.selectedSpellIds.length,
      ).length,
      npcLocations: countBy(npcLocations, (row) => row.status),
      newNpcCandidates: npcQueue.length,
    },
    spellGaps,
    itemGaps,
    identities,
    proposedRelations: distinctProposals,
    npcLocations,
    npcCandidates,
    npcQueue,
    unscopedSourceLessItemIds: unscopedItems,
  };
}

/** @param {string} name @returns {string} */
function slug(name) {
  return (name ?? "").toLowerCase().replace(/\s+/g, "-");
}
/** @template T @template K @param {readonly T[]} rows @param {(row:T)=>K} key @returns {Map<K,T[]>} */
function group(rows, key) {
  const result = new Map();
  for (const row of rows) {
    const id = key(row);
    const values = result.get(id) ?? [];
    values.push(row);
    result.set(id, values);
  }
  return result;
}
function countBy(rows, key) {
  return Object.fromEntries([...group(rows, key)].map(([name, values]) => [name, values.length]));
}
function referenceEvidence(row) {
  return {
    sourceKind: row.sourceKind ?? (row.schema === "wowhead-listing.v1" ? "listing" : "entity"),
    sourceUrl: row.sourceUrl,
    sourceSha256: row.sourceSha256,
    capturedAt: row.capturedAt,
  };
}
async function readJson(path, maximumBytes = 32_000_000) {
  if ((await stat(path)).size > maximumBytes) throw new Error(`Input exceeds byte budget: ${path}`);
  return JSON.parse(await readFile(path, "utf8"));
}

/** @param {readonly string[]} args @returns {Promise<void>} */
export async function runReconciliation(args) {
  const { values } = parseArgs({
    args: [...args],
    strict: true,
    options: Object.fromEntries(
      ["manifest", "queue", "source-report", "staging", "community", "output"].map((key) => [
        key,
        { type: "string" },
      ]),
    ),
  });
  for (const key of ["manifest", "queue", "source-report", "staging", "community", "output"])
    if (!values[key]) throw new Error(`Missing --${key}`);
  const output = resolve(values.output);
  const staging = resolve(values.staging);
  const destinations = [output, `${output}.npcs.json`, `${output}.relations.json`];
  const protectedRoots = [staging, dirname(resolve(values.manifest)), resolve(values.community)];
  if (
    destinations.some(
      (destination) =>
        protectedRoots.some((root) => {
          const path = relative(root, destination);
          return !isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`);
        }) ||
        ["queue", "source-report", "manifest"].some((key) => resolve(values[key]) === destination),
    )
  )
    throw new Error("Reconciliation output must not overwrite captures or source inputs");
  const source = await readJson(values["source-report"]);
  const queue = await readJson(values.queue);
  if (!Array.isArray(queue)) throw new Error("Queue must be an array");
  const tasks = queue.map((row) => referenceTaskSchema.parse(row));
  if (
    tasks.some((row) => row.game !== "forever" || !["spell", "item"].includes(row.kind)) ||
    new Set(tasks.map((row) => `${row.kind}:${row.id}`)).size !== tasks.length
  )
    throw new Error("Expected unique Forever spell/item tasks");
  // The expanded queue has its own checksum; the original report pins the recipe subset.
  const recipeTasks = tasks.filter((row) => row.kind === "spell");
  if (sha256(JSON.stringify(recipeTasks)) !== source.queueSha256)
    throw new Error("Recipe queue checksum mismatch");
  if (!source.community || !source.catalog)
    throw new Error("Pinned community/catalog metadata missing");
  const catalog = await loadCatalogSnapshot(resolve(values.manifest));
  for (const field of ["product", "buildNumber", "locale", "clientVersion"])
    if (catalog.manifest[field] !== source.catalog[field])
      throw new Error(`Catalog ${field} mismatch`);
  const community = await loadQuestieForeverExport(resolve(values.community), {
    ...source.community,
    licenseRef:
      source.community.licenseRef ??
      "Review required; offline reconciliation is not publication approval",
  });
  if (community.checksum !== source.community.checksum)
    throw new Error("Community export checksum mismatch");
  const records = [];
  for (const file of (await readdir(staging)).sort()) {
    const match = /^forever-(spell|item|npc)-(\d+)\.json$/.exec(file);
    if (!match) continue;
    const record = referenceRecordSchema.parse(await readJson(resolve(staging, file), 400_000));
    if (record.game !== "forever" || record.kind !== match[1] || record.id !== Number(match[2]))
      throw new Error(`Staged identity mismatch: ${file}`);
    records.push(record);
  }
  for (const task of tasks)
    if (!records.some((row) => row.kind === task.kind && row.id === task.id))
      throw new Error(`Missing capture: ${task.kind}:${task.id}`);
  const listings = [];
  for (const file of (await readdir(resolve(staging, "listings"))).sort()) {
    if (!/^forever-(spell|item)-list-[a-z-]+\.json$/.test(file)) continue;
    listings.push(
      listingRecordSchema.parse(await readJson(resolve(staging, "listings", file), 4_000_000)),
    );
  }
  const result = reconcileProfessionCrawl({ catalog, community, tasks, records, listings });
  await mkdir(dirname(output), { recursive: true });
  const paths = {
    report: output,
    npcs: `${output}.npcs.json`,
    relations: `${output}.relations.json`,
  };
  await atomicJsonWrite(paths.npcs, result.npcQueue);
  await atomicJsonWrite(paths.relations, {
    schema: "profession-relation-review.v1",
    catalog: result.catalog,
    community: result.community,
    relations: result.proposedRelations,
    publication: "review_required",
  });
  await atomicJsonWrite(output, {
    ...result,
    generatedAt: new Date().toISOString(),
    inputs: {
      queueSha256: sha256(JSON.stringify(tasks)),
      sourceReport: resolve(values["source-report"]),
      manifest: resolve(values.manifest),
      staging,
    },
    paths,
  });
  process.stdout.write(`${JSON.stringify({ paths, ...result.summary })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  runReconciliation(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
