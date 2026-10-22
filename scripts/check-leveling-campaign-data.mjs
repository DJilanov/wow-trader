import assert from "node:assert/strict";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import {
  CHAPTER_REFERENCES,
  CAMPAIGN_RACES,
  buildCampaignPlan,
  compileCampaignPickupGates,
  getLevelingRace,
  guideArchiveManifestSchema,
  importedChapterSchema,
  campaignSections,
  PREMADE_STOPS,
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
const dungeonLegIds = PREMADE_STOPS.filter((stop) => stop.dataStatus !== "missing-quest-data").map(
  (stop) => `dungeon-${stop.id}`,
);
for (const race of CAMPAIGN_RACES)
  for (const leaderClass of [null, ...getLevelingRace("alliance", race).classes]) {
    const plan = buildCampaignPlan(race, manifest.sourceSha256, sources, leaderClass);
    const tasks = compileCampaignPickupGates(plan);
    assert.ok(!tasks.actions.some((action) => action.id.endsWith("-entry-xp")));
    assert.ok(
      !tasks.actions.some((action) => action.kind === "xp-check" && action.source !== null),
    );
    assert.ok(!tasks.actions.some((action) => action.id === "ironforge-rendezvous-xp-readiness"));
    assert.deepEqual(
      tasks.actions.flatMap((action) => action.questChanges),
      plan.actions.flatMap((action) => action.questChanges),
      "Removing bookkeeping steps must not remove or reorder quest objectives",
    );
    assert.ok(
      Object.values(tasks.bookmarkAliases ?? {}).every((id) =>
        tasks.actions.some((action) => action.id === id),
      ),
    );
    const sections = campaignSections(plan);
    assert.deepEqual(
      sections.flatMap((section) => section.actionIds),
      plan.actions.map((action) => action.id),
    );
    assert.equal(
      new Set(sections.flatMap((section) => section.actionIds)).size,
      plan.actions.length,
    );
    assert.deepEqual(
      sections.filter((section) => section.kind === "dungeon").map((section) => section.id),
      dungeonLegIds,
    );
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
    // Source chapter ranges are references, not observed/forecast XP. In particular a
    // Hunter's last starter chapter can have a higher range than the rendezvous reference.
    // Keep scopes separate; continuous XP is asserted by the player-flow browser check.
    for (const section of sections)
      assert.ok(
        section.legIds.every(
          (id) =>
            (plan.legs.find((leg) => leg.id === id).kind === "starter") ===
            (section.kind === "starter"),
        ),
        "A personal starter leaked into a shared chapter",
      );
    assert.equal(plan.legs[0].from, 1);
    assert.equal(plan.legs.at(-1).to, 60);
    assert.deepEqual(
      plan.legs.filter((leg) => leg.kind === "dungeon").map((leg) => leg.id),
      dungeonLegIds,
    );
    assert.equal(plan.actions.filter((action) => action.kind === "unverified").length, 0);
    assert.ok(plan.actions.length > 500);
    assert.equal(new Set(plan.actions.map((action) => action.id)).size, plan.actions.length);
    const states = new Map();
    for (const action of plan.actions) {
      for (const change of action.questChanges) {
        if (change.state !== "accepted")
          assert.ok(
            ["accepted", "objectives-complete"].includes(states.get(change.questId)),
            `${race}/${leaderClass}: ${change.questId} has ${change.state} without a compiled pickup`,
          );
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
            action.libraryObjective !== "collection" ||
              action.libraryRequired ||
              action.libraryBackbone,
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
