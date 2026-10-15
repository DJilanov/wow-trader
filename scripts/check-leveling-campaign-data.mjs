import assert from "node:assert/strict";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import {
  CHAPTER_REFERENCES,
  CAMPAIGN_RACES,
  buildCampaignPlan,
  getLevelingRace,
  guideArchiveManifestSchema,
  importedChapterSchema,
  campaignSections,
} from "../packages/leveling/dist/index.js";

const root = resolve(
  process.env.LEVELING_ARCHIVE_ROOT ?? process.argv[2] ?? "artifacts/leveling/archive",
);
const manifest = guideArchiveManifestSchema.parse(
  JSON.parse(await readFile(join(root, "manifest.json"), "utf8")),
);
assert.equal(manifest.publication, "authorized");
const sources = [];
for (const entry of manifest.chapters) {
  const reference = CHAPTER_REFERENCES.find((chapter) => chapter.id === entry.chapterId);
  if (!reference || reference.family !== "questing" || !reference.factions.includes("alliance"))
    continue;
  const raw = await readFile(join(root, entry.file), "utf8");
  assert.equal(createHash("sha256").update(raw).digest("hex"), entry.sha256);
  const guide = importedChapterSchema.parse(JSON.parse(raw));
  assert.equal(guide.version, entry.version);
  assert.equal(guide.sourceSha256, entry.sourceSha256);
  assert.equal(guide.targetBuild, manifest.targetBuild);
  sources.push({ reference, guide });
}
let count = 0;
for (const race of CAMPAIGN_RACES)
  for (const leaderClass of [null, ...getLevelingRace("alliance", race).classes]) {
    const plan = buildCampaignPlan(race, manifest.sourceSha256, sources, leaderClass);
    const sections = campaignSections(plan);
    assert.deepEqual(
      sections.flatMap((section) => section.actionIds),
      plan.actions.map((action) => action.id),
    );
    assert.equal(
      new Set(sections.flatMap((section) => section.actionIds)).size,
      plan.actions.length,
    );
    assert.equal(sections.filter((section) => section.kind === "dungeon").length, 21);
    for (const section of sections) {
      assert.deepEqual(
        section.areas.flatMap((area) => area.legIds),
        section.legIds,
      );
      if (section.kind === "zone") assert.ok(!section.title.startsWith("Prepare for "));
    }
    assert.equal(sections.filter((section) => section.id === "prepare-thanes").length, 1);
    assert.ok(
      sections
        .find((section) => section.id === "prepare-thanes")
        .legIds.includes("ironforge-rendezvous"),
    );
    assert.ok(
      sections
        .find((section) => section.id === "prepare-thanes")
        .legIds.includes("early-party-kills"),
    );
    for (let index = 1; index < sections.length; index++)
      assert.ok(sections[index].from >= sections[index - 1].from, "Public levels move backward");
    assert.equal(plan.legs[0].from, 1);
    assert.equal(plan.legs.at(-1).to, 60);
    assert.equal(plan.legs.filter((leg) => leg.kind === "dungeon").length, 21);
    assert.equal(plan.actions.filter((action) => action.kind === "unverified").length, 3);
    assert.ok(plan.actions.length > 500);
    assert.equal(new Set(plan.actions.map((action) => action.id)).size, plan.actions.length);
    const states = new Map();
    for (const action of plan.actions) {
      for (const change of action.questChanges) {
        if (action.libraryQuestId) {
          if (change.state === "accepted")
            for (const parent of action.requiredQuestIds ?? [])
              assert.equal(
                states.get(parent),
                "rewarded",
                `${race}/${leaderClass}: library quest ${change.questId} precedes source-chain return ${parent}`,
              );
          else
            assert.ok(
              ["accepted", "objectives-complete"].includes(states.get(change.questId)),
              `Library lifecycle out of order for ${change.questId}`,
            );
          assert.ok(
            action.libraryObjective !== "collection" || action.libraryRequired,
            "An optional collection farm entered the kill-first route",
          );
        }
        states.set(change.questId, change.state);
      }
    }
    for (const action of plan.actions) {
      assert.match(action.id, /^[a-z0-9-]{1,180}$/);
      assert.ok(plan.legs.find((leg) => leg.id === action.legId)?.actionIds.includes(action.id));
      if (action.source)
        assert.ok(
          sources
            .find(
              (source) =>
                source.guide.chapterId === action.source.chapterId &&
                source.guide.version === action.source.version,
            )
            ?.guide.steps.some((step) => step.id === action.source.stepId),
        );
    }
    assert.deepEqual(
      plan.legs.flatMap((leg) => leg.unresolvedQuestIds),
      [],
    );
    const ordered = (quest, state) =>
      plan.actions.findIndex(
        (action) =>
          action.legId === "wetlands-prerequisites" &&
          action.questChanges.some((change) => change.questId === quest && change.state === state),
      );
    assert.ok(ordered(463, "rewarded") < ordered(276, "accepted"));
    assert.ok(ordered(276, "rewarded") < ordered(277, "accepted"));
    assert.ok(ordered(277, "rewarded") <= ordered(275, "accepted"));
    assert.ok(
      !plan.actions
        .filter((action) => action.legId === "searing-temple-prep")
        .flatMap((action) => action.questChanges)
        .some((change) => [3446, 3447].includes(change.questId) && change.state !== "accepted"),
    );
    count++;
    process.stdout.write(
      `${race}/${leaderClass ?? "general"}: ${sections.length} public chapters / ${plan.legs.length} phases, ${plan.actions.length} source-backed/authored actions\n`,
    );
  }
process.stdout.write(
  `Validated ${count} complete race/class campaign projections and ${sources.length} authorized source chapters. This is a data/flow audit, not a 1–60 playthrough.\n`,
);
