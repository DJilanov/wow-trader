import assert from "node:assert/strict";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  CHAPTER_REFERENCES,
  CAMPAIGN_RACES,
  buildCampaignPlan,
  getLevelingRace,
  guideArchiveManifestSchema,
  importedChapterSchema,
  campaignSections,
  emptyPremadeProgress,
  recordPremadeXp,
  forecastCampaignXp,
} from "../packages/leveling/dist/index.js";

const previousRoot = process.argv
  .find((arg) => arg.startsWith("--previous-release="))
  ?.slice("--previous-release=".length);
if (!previousRoot) throw new Error("Pass --previous-release=<retained release directory>.");
const presentationOnly = process.argv.includes("--presentation-only");
const previous = await import(
  pathToFileURL(join(resolve(previousRoot), "packages/leveling/dist/index.js")).href
);
const root = resolve(process.env.LEVELING_ARCHIVE_ROOT ?? "artifacts/leveling/archive");
const manifest = guideArchiveManifestSchema.parse(
  JSON.parse(await readFile(join(root, "manifest.json"), "utf8")),
);
const sources = [];
for (const entry of manifest.chapters) {
  const reference = CHAPTER_REFERENCES.find((chapter) => chapter.id === entry.chapterId);
  if (!reference || reference.family !== "questing" || !reference.factions.includes("alliance"))
    continue;
  sources.push({
    reference,
    guide: importedChapterSchema.parse(JSON.parse(await readFile(join(root, entry.file), "utf8"))),
  });
}
let editions = 0,
  common = 0,
  aliases = 0;
const key = (change) => `${change.questId}:${change.state}:${change.objectiveIndex}`;
for (const race of CAMPAIGN_RACES)
  for (const leaderClass of [null, ...getLevelingRace("alliance", race).classes]) {
    const oldPlan = previous.buildCampaignPlan(race, manifest.sourceSha256, sources, leaderClass);
    const plan = buildCampaignPlan(race, manifest.sourceSha256, sources, leaderClass);
    assert.equal(plan.release, oldPlan.release, "Existing save identity changed");
    if (presentationOnly) {
      assert.deepEqual(plan, oldPlan, "Presentation changes altered the executable quest route");
      const identity = (section) => ({
        id: section.id,
        from: section.from,
        to: section.to,
        legIds: section.legIds,
        actionIds: section.actionIds,
        stopId: section.stopId,
      });
      assert.deepEqual(
        campaignSections(plan).map(identity),
        previous.campaignSections(oldPlan).map(identity),
        "Chapter URLs, brackets or action ownership changed",
      );
      let progress = emptyPremadeProgress();
      for (let index = 0; index < 5; index++)
        progress = recordPremadeXp(progress, index, 13, index * 100);
      progress.members[0].questStates[9] = "rewarded";
      assert.deepEqual(
        forecastCampaignXp(plan, progress),
        previous.forecastCampaignXp(oldPlan, progress),
        "Geographic grouping changed the XP calculation",
      );
    }
    for (const oldAction of oldPlan.actions) {
      const action = plan.actions.find((entry) => entry.id === oldAction.id);
      if (!action) {
        if (
          oldAction.questChanges.some((change) =>
            [96390, 96391, 96392, 96393].includes(change.questId),
          ) ||
          oldAction.legId === "early-party-kills"
        ) {
          assert.ok(
            plan.actions.some((entry) => entry.id === plan.bookmarkAliases?.[oldAction.id]),
            `Missing old bookmark alias ${oldAction.id}`,
          );
          aliases++;
        }
        continue;
      }
      assert.equal(
        action.leaderOnly,
        oldAction.leaderOnly,
        `Changed participant ownership ${action.id}`,
      );
      const oldChanges = new Set(oldAction.questChanges.map(key));
      for (const change of action.questChanges)
        assert.ok(
          oldChanges.has(key(change)),
          `An old checked ID now asserts a new quest goal: ${action.id}`,
        );
      assert.equal(action.targetStopId, oldAction.targetStopId);
      assert.equal(action.targetLevel, oldAction.targetLevel);
      assert.deepEqual(action.requiredQuestIds ?? [], oldAction.requiredQuestIds ?? []);
      common++;
    }
    editions++;
  }
process.stdout.write(
  `Compatible saves verified: ${editions} editions, ${common} preserved action identities, ${aliases} retired bookmark aliases. No leader completion is migrated to party completion.\n`,
);
if (presentationOnly)
  process.stdout.write(
    "Geographic presentation preserves every executable action, chapter URL/bracket and per-player XP forecast.\n",
  );
