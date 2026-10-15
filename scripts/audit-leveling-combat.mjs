import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import process from "node:process";
import console from "node:console";
import {
  combatDatasetSchema,
  combatManifestSchema,
  guideArchiveManifestSchema,
  importedChapterSchema,
  indexCombatReferences,
  resolveCombatObjectives,
  CHAPTER_REFERENCES,
  CAMPAIGN_RACES,
  buildCampaignPlan,
  attachCampaignCombat,
  COMBAT_XP_RULE,
} from "../packages/leveling/dist/index.js";

const { values } = parseArgs({
  options: {
    archive: { type: "string" },
    combat: { type: "string" },
    destination: { type: "string" },
  },
});
const hash = (raw) => createHash("sha256").update(raw).digest("hex");
async function bounded(path, maximum) {
  if ((await stat(path)).size > maximum)
    throw new Error("Combat audit input exceeds its size budget.");
  return readFile(path, "utf8");
}
const archiveRoot = resolve(
  values.archive ?? process.env.LEVELING_ARCHIVE_ROOT ?? "artifacts/leveling/archive",
);
const combatRoot = resolve(
  values.combat ?? process.env.LEVELING_COMBAT_ROOT ?? "artifacts/leveling/combat",
);
const manifestRaw = await bounded(join(archiveRoot, "manifest.json"), 4_000_000);
const manifest = guideArchiveManifestSchema.parse(JSON.parse(manifestRaw));
const combatManifest = combatManifestSchema.parse(
  JSON.parse(await bounded(join(combatRoot, "manifest.json"), 4000)),
);
const raw = await bounded(join(combatRoot, combatManifest.file), 16_000_000);
if (hash(raw) !== combatManifest.sha256) throw new Error("Combat checksum mismatch.");
const dataset = combatDatasetSchema.parse(JSON.parse(raw));
if (
  dataset.targetBuild !== manifest.targetBuild ||
  dataset.targetBuild !== combatManifest.targetBuild
)
  throw new Error("Combat and guide builds do not match.");
const index = indexCombatReferences(dataset),
  sources = [],
  objectives = [];
for (const entry of manifest.chapters) {
  const raw = await bounded(join(archiveRoot, entry.file), 8_000_000);
  if (hash(raw) !== entry.sha256) throw new Error("Guide checksum mismatch.");
  const guide = importedChapterSchema.parse(JSON.parse(raw));
  if (
    guide.chapterId !== entry.chapterId ||
    guide.targetBuild !== manifest.targetBuild ||
    guide.sourceSha256 !== entry.sourceSha256 ||
    guide.version !== entry.version ||
    guide.steps.length !== entry.stepCount
  )
    throw new Error("Guide manifest mismatch.");
  const reference = CHAPTER_REFERENCES.find((reference) => reference.id === guide.chapterId);
  if (!reference) throw new Error("Missing guide metadata.");
  sources.push({ reference, guide });
  for (const step of guide.steps)
    for (const objective of resolveCombatObjectives(
      step.directives,
      index,
      `${guide.chapterId}:${step.id}`,
    ))
      objectives.push({ ...objective, chapterId: guide.chapterId, factions: reference.factions });
}
const known = objectives.filter(
  (objective) => objective.credit === "shared-kills" && objective.requiredKills !== null,
);
const campaigns = CAMPAIGN_RACES.map((race) => {
  const plan = attachCampaignCombat(
    buildCampaignPlan(
      race,
      manifest.sourceSha256,
      sources.filter((source) => source.reference.family === "questing"),
      "warrior",
    ),
    sources,
    dataset,
    combatManifest.sha256,
  );
  return {
    faction: "alliance",
    race,
    actions: plan.actions.length,
    combatActivities: plan.combat.activities.length,
    knownKillActivities: plan.combat.activities.filter((activity) =>
      activity.objectives.some((objective) => objective.requiredKills !== null),
    ).length,
    profiledDungeonPaths: plan.combat.activities.filter((activity) => activity.profile !== null)
      .length,
    questIdsWithKnownKills: [
      ...new Set(
        plan.combat.activities.flatMap((activity) =>
          activity.objectives
            .filter((objective) => objective.requiredKills !== null)
            .map((objective) => objective.questId),
        ),
      ),
    ].sort((a, b) => a - b),
  };
});
const report = {
  schema: "forever-combat-audit.v1",
  calculator: COMBAT_XP_RULE,
  createdAt: new Date().toISOString(),
  targetBuild: dataset.targetBuild,
  archiveManifestSha256: hash(manifestRaw),
  combatSha256: combatManifest.sha256,
  providerRevision: dataset.provider.revision,
  summary: {
    chapters: sources.length,
    npcs: dataset.npcs.length,
    quests: dataset.quests.length,
    objectiveRows: objectives.length,
    reconciledKillRows: known.length,
    distinctQuestsWithKillQuotas: new Set(known.map((objective) => objective.questId)).size,
    allianceKillQuestIds: new Set(
      known
        .filter((objective) => objective.factions.includes("alliance"))
        .map((objective) => objective.questId),
    ).size,
    hordeKillQuestIds: new Set(
      known
        .filter((objective) => objective.factions.includes("horde"))
        .map((objective) => objective.questId),
    ).size,
    dungeonProfiles: dataset.dungeons.length,
    calibratedKillContexts: dataset.killXpEvidence.length,
  },
  notes: [
    "Variant/reference coverage only, not a sum of playable work or proof of continuous level-60 coverage.",
    "Authored Static layers are included; Dynamic corrections and live server rates remain separate.",
    "No guessed dungeon trash population or reward-scaling-to-kill-XP conversion is used.",
    "The existing premade campaign is Alliance-only; Horde source chapter previews share the combat calculator, not an invented Horde dungeon circuit.",
  ],
  campaigns,
  objectives,
};
if (values.destination) {
  const destination = resolve(values.destination);
  await mkdir(destination, { recursive: true });
  await writeFile(join(destination, "combat-audit.json"), `${JSON.stringify(report, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
}
console.log(JSON.stringify({ summary: report.summary, campaigns, notes: report.notes }));
