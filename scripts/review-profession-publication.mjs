import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  atomicJsonWrite,
  readStagedReference,
  referenceClientConflicts,
  referenceTaskSchema,
} from "../packages/reference-data/dist/index.js";
import {
  professionClientReviewSchema,
  professionReferenceBundleSchema,
  loadQuestieForeverExport,
  decodeQuestieSpawnLocations,
} from "../packages/world-data/dist/index.js";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const normalize = (value) =>
  value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const bareNpcName = (value) => value.replace(/\s*<[^>]*>\s*$/, "").trim();
const unused = (name) => /\b(?:unused|obsolete|deprecated)\b|\(old\)/i.test(name);
const acquisition = new Map([
  ["sold-by:npc", "sold_by_npc"],
  ["dropped-by:npc", "dropped_by_npc"],
  ["contained-in-item:item", "contained_in_item"],
  ["contained-in-object:object", "dropped_by_object"],
  ["reward-from:quest", "rewarded_by_quest"],
]);

/** @param {{client: import('../packages/world-data/dist/index.js').ProfessionClientReview, records: readonly import('../packages/reference-data/dist/index.js').ReferenceRecord[], reconciliation: object, now?: Date}} options @returns {object} */
export function reviewProfessionPublication({
  client,
  records,
  reconciliation,
  questie = null,
  now = new Date(),
}) {
  const items = new Map(client.items.map((row) => [row.itemId, row]));
  const spells = new Map(client.spells.map((row) => [row.spellId, row]));
  const recipes = new Map(client.recipes.map((row) => [row.recipeSpellId, row]));
  const entities = new Map();
  const relations = new Map();
  const held = [];
  const sources = new Map();
  const validItems = new Map();
  const validSpells = new Map();
  const questieEntities = new Map(
    (questie?.entities ?? []).map((row) => [`${row.kind}:${row.id}`, row]),
  );
  const heldIdentityItems = new Set(
    reconciliation.identities
      .filter((row) => row.status === "client_identity_conflict" || row.status === "marked_unused")
      .map((row) => row.itemId),
  );
  const addEntity = (kind, id, name, data = {}) => {
    const key = `${kind}:${id}`;
    const old = entities.get(key);
    const clean = kind === "npc" ? bareNpcName(name) : name;
    if (old && normalize(old.name) !== normalize(clean)) return false;
    if (!old) entities.set(key, { kind, id, name: clean, data });
    return true;
  };
  const evidenceFor = (record, matchMethod) => {
    sources.set(record.sourceSha256, {
      url: record.sourceUrl,
      sha256: record.sourceSha256,
      capturedAt: record.capturedAt,
    });
    return {
      source: "wowhead",
      sourceUrl: record.sourceUrl,
      sourceSha256: record.sourceSha256,
      capturedAt: record.capturedAt,
      permissionRef: record.permissionRef,
      matchMethod,
      currentRealmAvailability: "unverified",
    };
  };
  const addRelation = (sourceKind, sourceId, relationKind, targetKind, targetId, evidence) => {
    const key = `${sourceKind}:${sourceId}:${relationKind}:${targetKind}:${targetId}`;
    if (!relations.has(key))
      relations.set(key, { sourceKind, sourceId, relationKind, targetKind, targetId, evidence });
  };
  for (const record of records) {
    if (Date.parse(record.capturedAt) + 14 * 86_400_000 <= now.getTime()) {
      held.push({ kind: record.kind, id: record.id, reason: "stale_source" });
      continue;
    }
    if (record.kind === "npc") {
      const subName = record.name.match(/<([^>]+)>\s*$/)?.[1];
      addEntity("npc", record.id, record.name, subName ? { subName } : {});
    }
    if (record.kind === "item") {
      const item = items.get(record.id);
      const conflicts = item
        ? referenceClientConflicts(record, item)
        : ["missing_current_client_item"];
      if (heldIdentityItems.has(record.id)) conflicts.push("profession_identity_review_required");
      if (unused(record.name)) conflicts.push("marked_unused");
      if (conflicts.length) {
        held.push({ kind: "item", id: record.id, reason: conflicts.join(",") });
        continue;
      }
      validItems.set(record.id, record);
      addEntity("item", record.id, item.name);
    }
    if (record.kind === "spell") {
      const spell = spells.get(record.id);
      if (
        !spell ||
        !recipes.has(record.id) ||
        normalize(spell.name) !== normalize(record.name) ||
        unused(spell.name)
      ) {
        held.push({
          kind: "spell",
          id: record.id,
          reason: "current_client_spell_identity_mismatch",
        });
        continue;
      }
      validSpells.set(record.id, record);
    }
  }
  for (const record of validItems.values()) {
    for (const relation of record.relations) {
      const kind = acquisition.get(`${relation.relation}:${relation.kind}`);
      if (!kind) continue;
      if (relation.kind === "item" && !items.has(relation.id)) continue;
      if (!addEntity(relation.kind, relation.id, relation.name)) {
        held.push({
          kind: "item",
          id: record.id,
          reason: "source_target_name_conflict",
          targetId: relation.id,
        });
        continue;
      }
      addRelation(
        "item",
        record.id,
        kind,
        relation.kind,
        relation.id,
        evidenceFor(record, "explicit_source_relation"),
      );
    }
    for (const relation of record.relations.filter(
      (row) => row.relation === "teaches" && row.kind === "spell",
    ))
      if (recipes.has(relation.id))
        addRelation(
          "item",
          record.id,
          "teaches_spell",
          "spell",
          relation.id,
          evidenceFor(record, "explicit_teaching_id"),
        );
  }
  for (const record of validSpells.values()) {
    for (const relation of record.relations) {
      if (
        relation.relation === "taught-by-item" &&
        relation.kind === "item" &&
        validItems.has(relation.id)
      ) {
        const method =
          record.sourceKind === "listing-name-join"
            ? "unique_profession_name_match"
            : "explicit_teaching_id";
        addRelation(
          "item",
          relation.id,
          "teaches_spell",
          "spell",
          record.id,
          evidenceFor(record, method),
        );
      }
      if (
        relation.relation === "taught-by-npc" &&
        relation.kind === "npc" &&
        addEntity("npc", relation.id, relation.name)
      )
        addRelation(
          "npc",
          relation.id,
          "teaches_spell",
          "spell",
          record.id,
          evidenceFor(record, "explicit_trainer_relation"),
        );
    }
  }
  for (const record of records.filter(
    (row) => row.kind === "npc" && Date.parse(row.capturedAt) + 14 * 86_400_000 > now.getTime(),
  )) {
    for (const relation of record.relations) {
      if (relation.relation === "teaches" && relation.kind === "spell" && recipes.has(relation.id))
        addRelation(
          "npc",
          record.id,
          "teaches_spell",
          "spell",
          relation.id,
          evidenceFor(record, "explicit_npc_teaching_list"),
        );
      if (relation.relation === "sells" && relation.kind === "item" && validItems.has(relation.id))
        addRelation(
          "item",
          relation.id,
          "sold_by_npc",
          "npc",
          record.id,
          evidenceFor(record, "explicit_npc_vendor_list"),
        );
    }
  }
  let acceptedProposals = 0;
  let acceptedBaselineRelations = 0;
  for (const proposal of reconciliation.proposedRelations) {
    if (proposal.confidence === "pinned_community_baseline") {
      const sourceItem = items.get(proposal.sourceId);
      const baselineItem = questieEntities.get(`item:${proposal.sourceId}`);
      const target = questieEntities.get(`${proposal.kind}:${proposal.id}`);
      const relationKind = acquisition.get(`${proposal.relation}:${proposal.kind}`);
      if (
        questie &&
        sourceItem &&
        validItems.has(sourceItem.itemId) &&
        baselineItem &&
        normalize(sourceItem.name) === normalize(baselineItem.name ?? "") &&
        target?.name &&
        relationKind &&
        addEntity(proposal.kind, proposal.id, target.name)
      ) {
        addRelation("item", sourceItem.itemId, relationKind, proposal.kind, proposal.id, {
          source: "questiedb_forever",
          sourceRevision: questie.sourceRevision,
          checksum: questie.checksum,
          permissionRef: "owner-confirmed-2026-10-25",
          matchMethod: "pinned_community_baseline",
          currentRealmAvailability: "unverified",
        });
        acceptedBaselineRelations++;
        continue;
      }
      held.push({
        kind: proposal.sourceKind,
        id: proposal.sourceId,
        reason: questie
          ? "baseline_identity_or_target_unresolved"
          : "questie_republication_permission_pending",
        targetId: proposal.id,
      });
      continue;
    }
    if (
      proposal.relation !== "taught-by-item" ||
      !validItems.has(proposal.id) ||
      !recipes.has(proposal.sourceId)
    )
      continue;
    const identity = reconciliation.identities.find(
      (row) => row.itemId === proposal.id && row.selectedSpellIds.includes(proposal.sourceId),
    );
    if (!identity || identity.status === "client_identity_conflict") continue;
    const record = validItems.get(proposal.id);
    if (identity.clientDescription !== items.get(proposal.id).description) {
      held.push({
        kind: "item",
        id: proposal.id,
        reason: "teaching_description_changed_in_current_build",
      });
      continue;
    }
    if (
      proposal.confidence === "output_identity_name_match" &&
      !identity.outputAliases.some((alias) =>
        client.recipeOutputs.some(
          (output) =>
            output.recipeSpellId === proposal.sourceId &&
            output.outputItemId === alias.outputItemId,
        ),
      )
    ) {
      held.push({
        kind: "item",
        id: proposal.id,
        reason: "crafted_item_identity_changed_in_current_build",
      });
      continue;
    }
    addRelation(
      "item",
      proposal.id,
      "teaches_spell",
      "spell",
      proposal.sourceId,
      evidenceFor(record, proposal.confidence),
    );
    acceptedProposals++;
  }
  for (const relation of relations.values())
    if (relation.targetKind === "spell" && spells.has(relation.targetId))
      addEntity("spell", relation.targetId, spells.get(relation.targetId).name, {
        source: "exact_client",
        buildNumber: client.build.buildNumber,
      });
  let publishedCoordinateJoins = 0;
  if (questie)
    for (const row of reconciliation.npcLocations.filter((entry) => entry.status === "joined")) {
      const entity = entities.get(`npc:${row.npcId}`);
      const baseline = questieEntities.get(`npc:${row.npcId}`);
      if (!entity || !baseline?.name || normalize(entity.name) !== normalize(baseline.name))
        continue;
      const decoded = decodeQuestieSpawnLocations(baseline.data.spawns);
      const spawns = {};
      for (const point of decoded.locations)
        (spawns[point.areaId] ??= []).push([point.xPercent, point.yPercent]);
      if (!decoded.locations.length) continue;
      entity.data = {
        ...entity.data,
        spawns,
        zoneID: baseline.data.zoneID ?? null,
        locationSourceName: "QuestieDB Forever",
        locationSourceRevision: questie.sourceRevision,
        excludedCoordinateCount: decoded.rejectedCount,
      };
      publishedCoordinateJoins++;
    }
  const entityRows = [...entities.values()].sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.id - b.id,
  );
  const relationRows = [...relations.values()].sort(
    (a, b) =>
      a.sourceKind.localeCompare(b.sourceKind) ||
      a.sourceId - b.sourceId ||
      a.relationKind.localeCompare(b.relationKind) ||
      a.targetId - b.targetId,
  );
  const sourceRows = [...sources.values()].sort((a, b) => a.sha256.localeCompare(b.sha256));
  if (!sourceRows.length) throw new Error("No current, attributable references passed review");
  const validUntil = new Date(
    Math.min(...sourceRows.map((row) => Date.parse(row.capturedAt))) + 14 * 86_400_000,
  ).toISOString();
  const checksum = sha256(
    JSON.stringify({
      build: client.build,
      entities: entityRows,
      relations: relationRows,
      sources: sourceRows,
      validUntil,
    }),
  );
  const bundle = professionReferenceBundleSchema.parse({
    formatVersion: 1,
    sourceKind: "profession_reference_review",
    sourceVersion: "profession-review.v1",
    sourceRevision: `review-${checksum.slice(0, 24)}`,
    licenseRef:
      "Owner-confirmed factual-reference permission: Wowhead 2026-10-07; QuestieDB 2026-10-25",
    includedAuthored: false,
    upstreamSources: questie
      ? [
          {
            name: "QuestieDB Forever",
            revision: questie.sourceRevision,
            checksum: questie.checksum,
            licenseRef: "Owner-confirmed republication permission, 2026-10-25",
          },
        ]
      : [],
    validUntil,
    checksum,
    artifacts: [
      {
        fileName: `profession-relations-${checksum.slice(0, 16)}.json`,
        byteSize: Buffer.byteLength(`${JSON.stringify(relationRows)}\n`),
        sha256: sha256(`${JSON.stringify(relationRows)}\n`),
        entityCount: relationRows.length,
      },
    ],
    entities: entityRows,
    relations: relationRows,
  });
  return {
    bundle,
    review: {
      schema: "profession-publication-review.v1",
      build: client.build,
      checksum,
      acceptedProposals,
      acceptedBaselineRelations,
      publishedCoordinateJoins,
      entities: entityRows.length,
      relations: relationRows.length,
      sources: sourceRows.length,
      validUntil,
      taughtRecipes: new Set(
        relationRows
          .filter((row) => row.relationKind === "teaches_spell")
          .map((row) => row.targetId),
      ).size,
      teachingItems: new Set(
        relationRows
          .filter((row) => row.relationKind === "teaches_spell" && row.sourceKind === "item")
          .map((row) => row.sourceId),
      ).size,
      held,
      privateCoordinateJoins: reconciliation.npcLocations,
      identityReview: reconciliation.identities.filter((row) => !row.selectedSpellIds.length),
    },
  };
}

/** @param {readonly string[]} args @returns {Promise<void>} */
export async function runProfessionReview(args) {
  const { values } = parseArgs({
    args: [...args],
    strict: true,
    options: Object.fromEntries(
      ["client", "queue", "reconciliation", "staging", "output", "questie"].map((key) => [
        key,
        { type: "string" },
      ]),
    ),
  });
  for (const key of ["client", "queue", "reconciliation", "staging", "output"])
    if (!values[key]) throw new Error(`Missing --${key}`);
  const clientBytes = await readFile(values.client);
  const client = professionClientReviewSchema.parse(
    JSON.parse(gunzipSync(clientBytes, { maxOutputLength: 32_000_000 }).toString("utf8")),
  );
  const reconciliation = JSON.parse(await readFile(values.reconciliation, "utf8"));
  if (reconciliation.schema !== "profession-crawl-reconciliation.v1")
    throw new Error("Unsupported reconciliation report");
  const tasks = referenceTaskSchema
    .array()
    .max(10_000)
    .parse(JSON.parse(await readFile(values.queue, "utf8")));
  if (sha256(JSON.stringify(tasks)) !== reconciliation.inputs.queueSha256)
    throw new Error("Queue checksum mismatch");
  const records = [];
  for (const task of [
    ...tasks,
    ...reconciliation.npcLocations.map((row) => ({ game: "forever", kind: "npc", id: row.npcId })),
  ]) {
    const record = await readStagedReference(values.staging, task);
    if (!record) throw new Error(`Missing staged record ${task.kind}:${task.id}`);
    records.push(record);
  }
  const questie = values.questie
    ? await loadQuestieForeverExport(resolve(values.questie), {
        sourceVersion: reconciliation.community.sourceVersion,
        sourceRevision: reconciliation.community.sourceRevision,
        includedAuthored: false,
        licenseRef: "Owner-confirmed republication permission, 2026-10-25",
      })
    : null;
  if (questie && questie.checksum !== reconciliation.community.checksum)
    throw new Error("Questie export changed after reconciliation");
  const result = reviewProfessionPublication({ client, records, reconciliation, questie });
  const output = resolve(values.output);
  if (
    (await stat(values.staging)).isDirectory() &&
    output.startsWith(`${resolve(values.staging)}/`)
  )
    throw new Error("Output must not overwrite captures");
  await mkdir(dirname(output), { recursive: true });
  await atomicJsonWrite(
    resolve(dirname(output), result.bundle.artifacts[0].fileName),
    result.bundle.relations,
  );
  await atomicJsonWrite(output, result.bundle);
  await atomicJsonWrite(`${output}.review.json`, {
    ...result.review,
    generatedAt: new Date().toISOString(),
    clientExportSha256: sha256(clientBytes),
  });
  process.stdout.write(
    `${JSON.stringify({ output, ...result.review, held: result.review.held.length, privateCoordinateJoins: result.review.privateCoordinateJoins.length, identityReview: result.review.identityReview.length })}\n`,
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  runProfessionReview(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
