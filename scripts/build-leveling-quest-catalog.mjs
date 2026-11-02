import assert from "node:assert/strict";
import console from "node:console";
import { Buffer } from "node:buffer";
import { readFile, mkdir, writeFile, rename, stat } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { execFileSync } from "node:child_process";
import {
  CHAPTER_REFERENCES,
  guideArchiveManifestSchema,
  importedChapterSchema,
  questCatalogSchema,
  combatManifestSchema,
  combatDatasetSchema,
  campaignZoneId,
  questCreatureKillCount,
  buildCampaignPlan,
  campaignRewardQuestIds,
  CAMPAIGN_RACES,
  getLevelingRace,
  capturedKillInputSchema,
  capturedCreatureKillQuotas,
} from "../packages/leveling/dist/index.js";
import { parseQuestieForeverSource } from "../packages/world-data/dist/index.js";
import {
  normalizeCatalogQuest,
  isSharedCatalogQuest,
  applyCatalogSourceConstraints,
  applyCatalogKillQuotaClaims,
} from "./leveling-quest-catalog.mjs";

const { values } = parseArgs({
  options: {
    "provider-root": { type: "string" },
    revision: { type: "string" },
    destination: { type: "string" },
    archive: { type: "string", default: "artifacts/leveling/archive" },
    combat: { type: "string" },
    "authorization-note": { type: "string" },
    "quest-captures": { type: "string" },
  },
});
assert.ok(
  values["provider-root"] &&
    values.destination &&
    values.combat &&
    /^[a-f0-9]{40}$/.test(values.revision ?? ""),
  "Pass --provider-root=CHECKOUT --revision=SHA --combat=ROOT --destination=ROOT [--quest-captures=JSON] [--authorization-note=NOTE].",
);
const sha = (raw) => createHash("sha256").update(raw).digest("hex");
async function bounded(file, maximum) {
  const metadata = await stat(file);
  assert.ok(
    metadata.isFile() && metadata.size <= maximum,
    `Input is not a bounded regular file: ${file}`,
  );
  const raw = await readFile(file, "utf8");
  assert.ok(Buffer.byteLength(raw) <= maximum, `Input grew beyond size limit: ${file}`);
  return raw;
}
async function immutableArtifact(root, prefix, data, manifestSchema) {
  await mkdir(root, { recursive: true });
  const raw = JSON.stringify(data) + "\n",
    hash = sha(raw),
    file = `${prefix}-${hash}.json`;
  try {
    await writeFile(path.join(root, file), raw, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    assert.equal(
      sha(await readFile(path.join(root, file))),
      hash,
      "Existing artifact checksum differs.",
    );
  }
  const manifest = { schema: manifestSchema, file, sha256: hash, targetBuild: data.targetBuild };
  const temp = path.join(root, `manifest-${randomUUID()}.tmp`);
  await writeFile(temp, JSON.stringify(manifest) + "\n", { flag: "wx", mode: 0o600 });
  await rename(temp, path.join(root, "manifest.json"));
  return manifest;
}
const provider = path.resolve(values["provider-root"]),
  exportRoot = path.join(provider, "src/corrections/Forever/combined");
assert.equal(
  execFileSync("git", ["-C", provider, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  values.revision,
  "Provider checkout revision differs.",
);
assert.equal(
  execFileSync("git", ["-C", provider, "status", "--porcelain", "--untracked-files=all"], {
    encoding: "utf8",
  }).trim(),
  "",
  "Use a clean provider checkout for reproducible catalog provenance.",
);
const [questRaw, npcRaw, itemRaw, mapRaw] = await Promise.all([
  bounded(path.join(exportRoot, "foreverQuestDB.lua"), 32_000_000),
  bounded(path.join(exportRoot, "foreverNpcDB.lua"), 32_000_000),
  bounded(path.join(exportRoot, "foreverItemDB.lua"), 32_000_000),
  bounded(path.join(provider, "support/Forever/Zones/areaIdToUiMapId.lua"), 200_000),
]);
assert.ok(
  [questRaw, npcRaw].every((raw) => raw.includes(" -> authored corrections.")),
  "Generate the provider export with --include-authored before building guide references.",
);
const block = /ZoneDB\.private\.areaIdToUiMapId\s*=\s*\[\[return\s*\{([\s\S]*?)\}\]\]/.exec(mapRaw);
assert.ok(block, "Canonical Forever AreaID map is missing.");
const areaMap = new Map(
  [...block[1].matchAll(/\[(\d+)\]\s*=\s*(\d+)/g)].flatMap((match) => {
    const zone = campaignZoneId(match[2]);
    return zone ? [[Number(match[1]), zone]] : [];
  }),
);
assert.equal(areaMap.get(40), "1436");
const npcs = new Map(parseQuestieForeverSource("npc", npcRaw).map((npc) => [npc.id, npc]));
const items = new Map(parseQuestieForeverSource("item", itemRaw).map((item) => [item.id, item]));
let quests = parseQuestieForeverSource("quest", questRaw).flatMap((quest) => {
  const normalized = normalizeCatalogQuest(quest, npcs, areaMap, items);
  return normalized ? [normalized] : [];
});
let byId = new Map(quests.map((quest) => [quest.questId, quest]));
const archiveRoot = path.resolve(values.archive),
  archive = guideArchiveManifestSchema.parse(
    JSON.parse(await bounded(path.join(archiveRoot, "manifest.json"), 1_000_000)),
  );
assert.equal(archive.publication, "authorized", "Guide source archive is not authorized.");
const combatRoot = path.resolve(values.combat),
  combatManifest = combatManifestSchema.parse(
    JSON.parse(await bounded(path.join(combatRoot, "manifest.json"), 4000)),
  );
const combatFile = path.resolve(combatRoot, combatManifest.file);
assert.ok(combatFile.startsWith(combatRoot + path.sep), "Combat member escapes its root.");
const combatRaw = await bounded(combatFile, 16_000_000);
assert.equal(sha(combatRaw), combatManifest.sha256, "Combat checksum differs.");
const source = combatDatasetSchema.parse(JSON.parse(combatRaw));
assert.equal(source.targetBuild, archive.targetBuild);
assert.equal(source.provider.revision, values.revision, "Combat provider revision differs.");
assert.equal(source.provider.questSha256, sha(questRaw), "Combat quest export differs.");
assert.equal(source.provider.npcSha256, sha(npcRaw), "Combat NPC export differs.");
assert.equal(source.provider.itemSha256, sha(itemRaw), "Combat item export differs.");
const wanted = new Set();
const quotaClaims = new Map();
const heldQuotas = new Map();
function addQuotaClaim(questId, objectiveIndex, kills, provenance) {
  const key = `${questId}:${objectiveIndex}`;
  const claims = quotaClaims.get(key) ?? new Map();
  claims.set(kills, provenance);
  quotaClaims.set(key, claims);
}
for (const quest of source.quests) {
  const entry = byId.get(quest.questId);
  for (const quota of quest.killQuotas ?? [])
    if (
      entry?.objectives.find((objective) => objective.index === quota.objectiveIndex)?.npcId ===
      quota.npcId
    )
      addQuotaClaim(quest.questId, quota.objectiveIndex, quota.kills, quota.source);
  for (const index of quest.killQuotaConflicts ?? [])
    heldQuotas.set(`${quest.questId}:${index}`, [
      "The input reference already holds this objective.",
    ]);
}
const chapters = [];
const sources = [];
for (const entry of archive.chapters) {
  const reference = CHAPTER_REFERENCES.find((chapter) => chapter.id === entry.chapterId);
  if (reference?.family !== "questing" || !reference.factions.includes("alliance")) continue;
  const file = path.resolve(archiveRoot, entry.file);
  assert.ok(file.startsWith(archiveRoot + path.sep), "Archive member escapes its root.");
  const raw = await bounded(file, 1_000_000);
  assert.equal(sha(raw), entry.sha256, "Source archive checksum differs.");
  const chapter = importedChapterSchema.parse(JSON.parse(raw));
  chapters.push(chapter);
  sources.push({ reference, guide: chapter });
  for (const step of chapter.steps)
    for (const directive of step.directives) {
      if (directive.questId !== null) wanted.add(directive.questId);
      if (
        directive.tag !== ".complete" ||
        directive.questId === null ||
        !/\b(slain|killed|defeated|destroyed)\b|^(Kill|Slay|Defeat)\b/i.test(directive.text)
      )
        continue;
      const quest = byId.get(directive.questId),
        objectiveIndex = Number(directive.arguments.split(",")[1] ?? 1);
      const objective = quest?.objectives.find((objective) => objective.index === objectiveIndex);
      const npc = objective && npcs.get(objective.npcId);
      if (!quest || !objective || !npc?.name) continue;
      const count = questCreatureKillCount(
        npc,
        [directive.text],
        quest.objectives.flatMap((objective) => npcs.get(objective.npcId)?.name ?? []),
      );
      if (count === null) continue;
      addQuotaClaim(
        quest.questId,
        objectiveIndex,
        count,
        `Authorized guide ${archive.sourceSha256}:${entry.chapterId}:${step.id}`,
      );
    }
}
// Authored dungeon lead-ins and optional route choices are not all present in the source archive.
for (const race of CAMPAIGN_RACES)
  for (const classSlug of getLevelingRace("alliance", race).classes) {
    const plan = buildCampaignPlan(race, archive.sourceSha256, sources, classSlug);
    for (const questId of campaignRewardQuestIds(plan, { includeHeldLibrary: true }))
      wanted.add(questId);
  }
let captureInputSha256 = null;
let captureInputCatalog = null;
let captureRecords = 0;
let capturedQuotaClaims = 0;
const captureHolds = [];
if (values["quest-captures"]) {
  const raw = await bounded(path.resolve(values["quest-captures"]), 16_000_000);
  const captures = capturedKillInputSchema.parse(JSON.parse(raw));
  captureInputSha256 = sha(raw);
  captureInputCatalog = captures.catalogSha256;
  const names = new Map([...npcs].map(([id, npc]) => [id, { name: npc.name ?? "" }]));
  for (const capture of captures.records) {
    const quest = byId.get(capture.id);
    if (!quest) continue;
    captureRecords++;
    const result = capturedCreatureKillQuotas(quest, capture, names);
    for (const quota of result.quotas) {
      addQuotaClaim(capture.id, quota.objectiveIndex, quota.kills, quota.source);
      capturedQuotaClaims++;
    }
    for (const hold of result.held) {
      const key = `${capture.id}:${hold.objectiveIndex}`;
      heldQuotas.set(key, [...(heldQuotas.get(key) ?? []), hold.reason]);
      captureHolds.push({ questId: capture.id, ...hold });
    }
  }
}
quests = applyCatalogSourceConstraints(quests, chapters);
const reconciliation = applyCatalogKillQuotaClaims(quests, quotaClaims, heldQuotas);
quests = reconciliation.quests;
byId = new Map(quests.map((quest) => [quest.questId, quest]));
for (const quest of quests)
  if (isSharedCatalogQuest(quest) && quest.category === "shared-kills") wanted.add(quest.questId);
const queue = [...wanted];
while (queue.length) {
  const quest = byId.get(queue.pop());
  if (!quest) continue;
  for (const parent of [...quest.prerequisites.allOf, ...quest.prerequisites.anyOf])
    if (!wanted.has(parent)) {
      wanted.add(parent);
      queue.push(parent);
    }
}
const authorizationNote = values["authorization-note"]?.trim() ?? "";
const publication = authorizationNote ? "authorized" : "private-reference";
const catalog = questCatalogSchema.parse({
  schema: "forever-quest-funding-catalog.v1",
  targetBuild: archive.targetBuild,
  publication,
  authorizationNote,
  providerRevision: values.revision,
  questSha256: sha(questRaw),
  npcSha256: sha(npcRaw),
  itemSha256: sha(itemRaw),
  areaMapSha256: sha(mapRaw),
  includesAuthoredCorrections: questRaw.includes(" -> authored corrections."),
  sourceArchiveSha256: archive.sourceSha256,
  quests: quests.filter((quest) => wanted.has(quest.questId)),
});
const selectedQuests = source.quests
  .filter((quest) => wanted.has(quest.questId))
  .map((quest) => {
    const entry = byId.get(quest.questId);
    if (!entry) return quest;
    const enriched = {
      ...quest,
      requiredClasses: quest.requiredClasses ?? entry.requiredClasses,
      prerequisites: quest.prerequisites ?? entry.prerequisites,
      onlyInteractionObjectives:
        quest.onlyInteractionObjectives ??
        (quest.creatureIds.length === 0 &&
          quest.itemCreatureIds.length === 0 &&
          !quest.itemObjectives?.length),
    };
    const killQuotaConflicts = reconciliation.conflicts
      .filter((conflict) => conflict.questId === quest.questId)
      .map((conflict) => conflict.objectiveIndex);
    const killQuotas = entry.objectives.flatMap((objective) => {
      const claims = quotaClaims.get(`${quest.questId}:${objective.index}`);
      if (
        objective.count === null ||
        claims?.size !== 1 ||
        quest.creatureIds[objective.index - 1] !== objective.npcId
      )
        return [];
      return [
        {
          objectiveIndex: objective.index,
          npcId: objective.npcId,
          kills: objective.count,
          source: [...claims.values()][0],
        },
      ];
    });
    return {
      ...enriched,
      ...(killQuotas.length || quest.killQuotas ? { killQuotas } : {}),
      ...(killQuotaConflicts.length || quest.killQuotaConflicts ? { killQuotaConflicts } : {}),
    };
  });
const itemIds = new Set(
  selectedQuests.flatMap((quest) => (quest.itemObjectives ?? []).map((item) => item.itemId)),
);
const drops = (source.lootDrops ?? []).filter((drop) => itemIds.has(drop.itemId));
const npcIds = new Set([
  ...selectedQuests.flatMap((quest) => [
    ...quest.creatureIds,
    ...quest.itemCreatureIds,
    ...(quest.itemObjectives ?? []).flatMap((item) => item.npcIds),
  ]),
  ...drops.map((drop) => drop.npcId),
]);
const combat = combatDatasetSchema.parse({
  ...source,
  publication,
  authorizationNote,
  quests: selectedQuests,
  provider: {
    ...source.provider,
    limitations: [
      ...source.provider.limitations,
      ...(captureInputSha256
        ? [
            `Explicit death counters from capture input ${captureInputSha256}, discovered against catalog ${captureInputCatalog}; source page checksums and timestamps remain on each quota. These are edition references, not observed current-server XP.`,
          ]
        : []),
    ],
  },
  npcs: source.npcs.filter((npc) => npcIds.has(npc.id)),
  dungeons: [],
  killXpEvidence: [],
  ...(source.lootDrops ? { lootDrops: drops } : {}),
  questCatalogReference: {
    sha256: sha(JSON.stringify(catalog) + "\n"),
    providerRevision: catalog.providerRevision,
    sourceArchiveSha256: catalog.sourceArchiveSha256,
  },
});
const destination = path.resolve(values.destination);
const catalogManifest = await immutableArtifact(
  destination,
  "quest-catalog",
  catalog,
  "forever-quest-funding-manifest.v1",
);
const normalizedCombatManifest = await immutableArtifact(
  path.join(destination, "combat"),
  "combat",
  combat,
  "forever-combat-manifest.v1",
);
const review =
  values["quest-captures"] || reconciliation.conflicts.length
    ? await immutableArtifact(
        path.join(destination, "kill-quota-review"),
        "kill-quota-review",
        {
          schema: "forever-kill-quota-review.v1",
          targetBuild: catalog.targetBuild,
          sourceCombatSha256: combatManifest.sha256,
          captureInputSha256,
          captureInputCatalog,
          captureRecords,
          capturedQuotaClaims,
          captureHolds,
          conflicts: reconciliation.conflicts,
        },
        "forever-kill-quota-review-manifest.v1",
      )
    : null;
console.log(
  JSON.stringify({
    destination,
    publication,
    catalog: catalogManifest,
    combat: normalizedCombatManifest,
    quests: catalog.quests.length,
    sharedKillCandidates: catalog.quests.filter(
      (quest) => isSharedCatalogQuest(quest) && quest.category === "shared-kills",
    ).length,
    npcs: combat.npcs.length,
    recordings: 0,
    clearProfiles: 0,
    captureRecords,
    capturedQuotaClaims,
    heldKillQuotas: reconciliation.conflicts.length,
    killQuotaReview: review?.sha256 ?? null,
  }),
);
