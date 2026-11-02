import assert from "node:assert/strict";
import console from "node:console";
import process from "node:process";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  CHAPTER_REFERENCES,
  CAMPAIGN_XP_REVISION,
  CAMPAIGN_VERSION,
  QUEST_LOG_CAPACITY,
  DUNGEON_REFERENCE,
  COMBAT_XP_RULE,
  guideArchiveManifestSchema,
  importedChapterSchema,
  combatManifestSchema,
  combatDatasetSchema,
  questCatalogManifestSchema,
  questCatalogSchema,
  questRewardFactSchema,
  questCatalogRewardFacts,
  buildCampaignPlan,
  buildCampaignStarters,
  enrichCampaignStarters,
  prepareCampaignPlan,
  emptyPremadeProgress,
  updatePremadeDungeonBundle,
  getDungeonBundle,
  auditCampaignGuideFunding,
  auditCampaignSections,
  auditCampaignQuestLog,
  forecastCampaignGuide,
  guidePartyScenario,
  guidePartyAnchors,
} from "../packages/leveling/dist/index.js";

const { values } = parseArgs({
  options: {
    archive: { type: "string", default: "artifacts/leveling/archive" },
    facts: { type: "string" },
    combat: { type: "string" },
    catalog: { type: "string" },
    report: { type: "string", default: ".cache/leveling-xp-funding/report.json" },
    "all-editions": { type: "boolean", default: false },
    "require-funded": { type: "boolean", default: false },
    "starter-mode": { type: "string", default: "separate" },
  },
});
assert.ok(
  values.facts && values.combat && values.catalog,
  "Pass --facts=SNAPSHOT --combat=ROOT --catalog=ROOT.",
);
assert.ok(
  ["separate", "together", "both"].includes(values["starter-mode"]),
  "Use --starter-mode=separate, together or both.",
);
const hash = (raw) => createHash("sha256").update(raw).digest("hex");
async function bounded(file, maximum) {
  assert.ok((await stat(file)).size <= maximum, `Oversized audit input: ${file}`);
  return readFile(file, "utf8");
}
async function artifact(root, manifestSchema, dataSchema) {
  const manifest = manifestSchema.parse(
    JSON.parse(await bounded(path.join(root, "manifest.json"), 4000)),
  );
  const file = path.resolve(root, manifest.file);
  assert.ok(file.startsWith(path.resolve(root) + path.sep), "Artifact path escapes its root.");
  const raw = await bounded(file, 16_000_000);
  assert.equal(hash(raw), manifest.sha256, "Artifact checksum mismatch.");
  const data = dataSchema.parse(JSON.parse(raw));
  assert.equal(data.targetBuild, manifest.targetBuild);
  assert.equal(
    data.publication,
    "authorized",
    "This audit uses only publication-authorized guide references.",
  );
  return { data, revision: manifest.sha256 };
}
const archiveRoot = path.resolve(values.archive),
  manifest = guideArchiveManifestSchema.parse(
    JSON.parse(await bounded(path.join(archiveRoot, "manifest.json"), 1_000_000)),
  );
assert.equal(manifest.publication, "authorized");
const sources = [];
for (const entry of manifest.chapters) {
  const reference = CHAPTER_REFERENCES.find((chapter) => chapter.id === entry.chapterId);
  if (reference?.family !== "questing" || !reference.factions.includes("alliance")) continue;
  const file = path.resolve(archiveRoot, entry.file);
  assert.ok(file.startsWith(archiveRoot + path.sep));
  const raw = await bounded(file, 1_000_000);
  assert.equal(hash(raw), entry.sha256);
  sources.push({ reference, guide: importedChapterSchema.parse(JSON.parse(raw)) });
}
const [combat, catalog] = await Promise.all([
  artifact(path.resolve(values.combat), combatManifestSchema, combatDatasetSchema),
  artifact(path.resolve(values.catalog), questCatalogManifestSchema, questCatalogSchema),
]);
assert.equal(catalog.data.sourceArchiveSha256, manifest.sourceSha256);
if (combat.data.questCatalogReference) {
  assert.equal(
    combat.data.questCatalogReference.sha256,
    catalog.revision,
    "Combat and quest catalog revisions differ.",
  );
  assert.equal(combat.data.questCatalogReference.sourceArchiveSha256, manifest.sourceSha256);
}
const factsRaw = await bounded(path.resolve(values.facts), 8_000_000),
  snapshot = JSON.parse(factsRaw);
const facts = questCatalogRewardFacts(
  questRewardFactSchema.array().max(30000).parse(snapshot.facts),
  catalog.data,
);
assert.equal(
  new Set(facts.map((fact) => fact.questId)).size,
  facts.length,
  "Duplicate quest reward evidence.",
);
const starters = enrichCampaignStarters(
  buildCampaignStarters(manifest.sourceSha256, sources),
  sources,
  facts,
  combat,
  catalog.data,
);
const editions = values["all-editions"]
  ? starters.routes
  : starters.routes.filter((route) => route.race === "human" && route.classSlug === "warrior");
assert.ok(editions.length > 0);
const results = [];
for (const edition of editions) {
  const plan = prepareCampaignPlan(
    buildCampaignPlan(edition.race, manifest.sourceSha256, sources, edition.classSlug),
    sources,
    {
      starters,
      rewardFacts: facts,
      rewardRevision: hash(factsRaw),
      rewardBuild: snapshot.clientBuild ?? null,
      rewardNotice: snapshot.notice ?? null,
      combat,
      questCatalog: catalog.data,
    },
  );
  for (const difficultyPolicy of values["all-editions"]
    ? ["at-level", "experienced-premade"]
    : ["at-level"])
    for (const strategy of values["all-editions"] ? ["dungeons", "mixed"] : ["dungeons"])
      for (const optionalStops of values["all-editions"] ? [true, false] : [true]) {
        let progress = emptyPremadeProgress();
        progress.difficultyPolicy = difficultyPolicy;
        progress.dungeonFinish.strategy = strategy;
        progress.raidGoals = optionalStops;
        if (!optionalStops)
          for (const leg of plan.legs)
            if (leg.bundleId) {
              const bundle = getDungeonBundle(leg.bundleId, "alliance");
              assert.ok(bundle);
              progress = updatePremadeDungeonBundle(progress, { ...bundle, included: false });
            }
        for (const starterMode of values["starter-mode"] === "both"
          ? ["separate", "together"]
          : [values["starter-mode"]]) {
          const forecast = forecastCampaignGuide(plan, progress, { starterMode });
          const audit = auditCampaignGuideFunding(plan, progress, forecast);
          const scenario = guidePartyScenario(plan, progress, starterMode);
          const questLog = auditCampaignQuestLog(scenario.plan, scenario.progress, scenario);
          const independent = auditCampaignSections(
            scenario.plan,
            scenario.progress,
            guidePartyAnchors(scenario, []),
          );
          results.push({
            race: edition.race,
            classSlug: edition.classSlug,
            difficultyPolicy,
            strategy,
            optionalStops,
            starterMode,
            ...audit,
            questLog,
            addedQuestIds: plan.questFunding?.addedQuestIds ?? [],
            independentBudgets: independent.map((section) => ({
              id: section.sectionId,
              assumedEntryLevel: section.referenceEntryLevel,
              targetLevel: section.targetLevel,
              status: section.status,
              missingRewardIds: section.missingRewardIds,
              questXpByPlayer: section.questXpByPlayer,
              gapByPlayer: section.gapByPlayer,
              requiredKillXpByPlayer: section.forecast.members.map((member) => member.combatXp),
              blockedReasons: section.forecast.members.map((member) => member.blockedReason),
            })),
          });
        }
      }
}
const report = {
  schema: "forever-no-grind-xp-audit.v1",
  checkedAt: new Date().toISOString(),
  ledgerRevision: CAMPAIGN_XP_REVISION,
  combatRule: COMBAT_XP_RULE,
  inputs: {
    campaignRevision: CAMPAIGN_VERSION,
    dungeonReferenceSha256: DUNGEON_REFERENCE.sourceSha256,
    dungeonReferenceReviewedAt: DUNGEON_REFERENCE.reviewedAt,
    sourceArchiveSha256: manifest.sourceSha256,
    sourceBuild: manifest.targetBuild,
    rewardSnapshotSha256: hash(factsRaw),
    rewardBuild: snapshot.clientBuild ?? null,
    combatRevision: combat.revision,
    catalogRevision: catalog.revision,
  },
  summary: {
    editions: editions.length,
    scenarios: results.length,
    chapterChecks: results.reduce((sum, result) => sum + result.chapters.length, 0),
    fundedScenarios: results.filter((result) => result.funded).length,
    arithmeticWitnessPassed: results.every((result) => result.witnessPassed),
    funded: results.every((result) => result.funded),
    questLogCapacity: QUEST_LOG_CAPACITY,
    questLogCapacityPassed: results.every((result) =>
      result.questLog.every((member) => member.withinCapacity),
    ),
    maximumQuestLogUpperBound: Math.max(
      ...results.flatMap((result) => result.questLog.map((member) => member.peakUpperBound)),
    ),
  },
  scope:
    "Continuous route-start forecasts explicitly distinguish separate solo starter paths and a homogeneous five-player shared starter path. Independent budgets assume their stated entry level and prior prerequisites; they are diagnostics, not a funded continuous journey. Quest-log reviews conservatively include every selected optional pickup over the entire itinerary, widening duplicate lifetimes and reserving unidentified dungeon slots; passing this bound proves capacity, not XP eligibility. Historical/formula values remain labeled estimates. No checkpoint supplies XP.",
  results,
};
const reportFile = path.resolve(values.report);
await mkdir(path.dirname(reportFile), { recursive: true });
await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
console.log(JSON.stringify({ report: reportFile, ...report.summary }));
if (
  !report.summary.arithmeticWitnessPassed ||
  !report.summary.questLogCapacityPassed ||
  (values["require-funded"] && !report.summary.funded)
)
  process.exitCode = 2;
