import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import process from "node:process";
import {
  CHAPTER_REFERENCES,
  guideArchiveManifestSchema,
  importedChapterSchema,
  combatManifestSchema,
  combatDatasetSchema,
  buildCampaignPlan,
  attachCampaignCombat,
  getLevelingRace,
  CAMPAIGN_XP_REVISION,
  indexCombatReferences,
  resolveCombatObjectives,
} from "../packages/leveling/dist/index.js";

const { values } = parseArgs({
  options: {
    archive: { type: "string", default: "artifacts/leveling/archive" },
    combat: { type: "string", default: "artifacts/leveling/loot-preparation/combat" },
  },
  strict: true,
});
const archiveRoot = resolve(values.archive),
  combatRoot = resolve(values.combat);
const checksum = (raw) => createHash("sha256").update(raw).digest("hex");
async function bounded(path, maximum) {
  if ((await stat(path)).size > maximum) throw Error("Purchase-check input exceeds size budget");
  const raw = await readFile(path, "utf8");
  if (Buffer.byteLength(raw) > maximum) throw Error("Purchase-check input grew beyond size budget");
  return raw;
}
const archive = guideArchiveManifestSchema.parse(
  JSON.parse(await bounded(join(archiveRoot, "manifest.json"), 1_000_000)),
);
const manifest = combatManifestSchema.parse(
  JSON.parse(await bounded(join(combatRoot, "manifest.json"), 4000)),
);
const rawData = await bounded(join(combatRoot, manifest.file), 16_000_000);
assert.equal(checksum(rawData), manifest.sha256);
const dataset = combatDatasetSchema.parse(JSON.parse(rawData));
assert.equal(dataset.targetBuild, manifest.targetBuild);
assert.equal(dataset.targetBuild, archive.targetBuild);
const sources = [];
for (const entry of archive.chapters) {
  const reference = CHAPTER_REFERENCES.find((candidate) => candidate.id === entry.chapterId);
  if (reference?.family !== "questing" || !reference.factions.includes("alliance")) continue;
  const raw = await bounded(join(archiveRoot, entry.file), 8_000_000);
  assert.equal(checksum(raw), entry.sha256);
  const guide = importedChapterSchema.parse(JSON.parse(raw));
  assert.equal(guide.chapterId, entry.chapterId);
  assert.equal(guide.version, entry.version);
  assert.equal(guide.targetBuild, archive.targetBuild);
  assert.equal(guide.sourceSha256, entry.sourceSha256);
  assert.equal(guide.steps.length, entry.stepCount);
  sources.push({ reference, guide });
}
const results = [];
for (const race of ["dwarf", "gnome"])
  for (const leaderClass of getLevelingRace("alliance", race).classes) {
    const plan = attachCampaignCombat(
      buildCampaignPlan(race, archive.sourceSha256, sources, leaderClass),
      sources,
      dataset,
      manifest.sha256,
    );
    const purchaseActions = plan.actions.filter((action) =>
      action.questChanges.some(
        (change) =>
          change.questId === 384 &&
          change.state === "objectives-complete" &&
          change.objectiveIndex === 2,
      ),
    );
    const unresolved = plan.combat.activities
      .flatMap((activity) => activity.objectives)
      .filter((objective) => objective.questId === 384 && objective.objectiveIndex === 2);
    assert.equal(unresolved.length, 0, `${race}/${leaderClass}: purchase became kill/unknown work`);
    results.push({ race, leaderClass, purchaseActions: purchaseActions.length });
  }
assert.ok(
  results.some(
    (result) =>
      result.race === "dwarf" && result.leaderClass === "hunter" && result.purchaseActions > 0,
  ),
);
assert.ok(
  results.some(
    (result) =>
      result.race === "gnome" && result.leaderClass === "warrior" && result.purchaseActions > 0,
  ),
);
const acquisitions = [];
const references = indexCombatReferences(dataset);
for (const binding of [
  {
    chapter: "chapter-114-6-11-teldrassil",
    step: "source-step-0184",
    questId: 2242,
    method: "pickpocket",
  },
  {
    chapter: "chapter-39-52-53-feralas",
    step: "source-step-0028",
    questId: 3909,
    method: "quest hand-in",
  },
  {
    chapter: "chapter-39-52-53-feralas",
    step: "source-step-0029",
    questId: 3909,
    method: "quest hand-in",
  },
  {
    chapter: "chapter-39-52-53-feralas",
    step: "source-step-0030",
    questId: 3909,
    method: "quest hand-in",
  },
]) {
  const chapter = sources.find((source) => source.reference.id === binding.chapter);
  assert.ok(chapter, `Missing acquisition chapter ${binding.chapter}`);
  const step = chapter.guide.steps.find((candidate) => candidate.id === binding.step);
  assert.ok(step, `Missing acquisition step ${binding.chapter}:${binding.step}`);
  const objectives = resolveCombatObjectives(step.directives, references, `archive:${step.id}`);
  const objective = objectives.find(
    (entry) => entry.questId === binding.questId && entry.objectiveIndex === 1,
  );
  assert.ok(objective, `Missing acquisition objective ${binding.questId}`);
  assert.equal(objective.credit, "non-combat");
  assert.equal(objective.loot, undefined);
  assert.equal(objective.requiredKills, null);
  assert.deepEqual(objective.npcIds, []);
  acquisitions.push({ questId: binding.questId, stepId: step.id, method: binding.method });
}
const routeAcquisitions = [];
for (const edition of [
  { race: "night-elf", leaderClass: "rogue", questId: 2242 },
  { race: "human", leaderClass: "warrior", questId: 3909 },
]) {
  const plan = attachCampaignCombat(
    buildCampaignPlan(edition.race, archive.sourceSha256, sources, edition.leaderClass),
    sources,
    dataset,
    manifest.sha256,
  );
  const actions = plan.actions.filter((action) =>
    action.questChanges.some(
      (change) =>
        change.questId === edition.questId &&
        change.state === "objectives-complete" &&
        change.objectiveIndex === 1,
    ),
  );
  assert.ok(
    actions.length > 0,
    `${edition.race}/${edition.leaderClass}: no selected acquisition action`,
  );
  assert.equal(
    plan.combat.activities
      .flatMap((activity) => activity.objectives)
      .filter(
        (objective) => objective.questId === edition.questId && objective.objectiveIndex === 1,
      ).length,
    0,
    `${edition.race}/${edition.leaderClass}: acquisition became kill/unknown work`,
  );
  routeAcquisitions.push({ ...edition, selectedActions: actions.length });
}
process.stdout.write(
  JSON.stringify({
    status: "passed",
    calculatorRevision: CAMPAIGN_XP_REVISION,
    combatSha256: manifest.sha256,
    archiveSha256: archive.sourceSha256,
    editions: results.length,
    results,
    acquisitions,
    routeAcquisitions,
  }) + "\n",
);
