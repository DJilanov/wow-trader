import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CHAPTER_REFERENCES,
  guideArchiveManifestSchema,
  importedChapterSchema,
  buildCampaignPlan,
  buildCampaignStarters,
  enrichCampaignStarters,
  prepareCampaignPlan,
  activeCampaignActions,
  emptyPremadeProgress,
  campaignSections,
  compileCampaignAddon,
  getDungeonBundle,
  updatePremadeDungeonBundle,
  campaignActionReasons,
} from "../packages/leveling/dist/index.js";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const separator = arg.indexOf("=");
    assert.ok(separator > 2, "Use --archive=PATH and --report=PATH.");
    return [arg.slice(2, separator), arg.slice(separator + 1)];
  }),
);
for (const key of args.keys())
  assert.ok(["archive", "report"].includes(key), `Unknown option ${key}`);
const root = args.get("archive") ?? "artifacts/leveling/archive";
const reportPath = args.get("report") ?? ".cache/leveling-route-flow/report.json";
const manifest = guideArchiveManifestSchema.parse(
  JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")),
);
const sources = [];
for (const entry of manifest.chapters) {
  const reference = CHAPTER_REFERENCES.find((chapter) => chapter.id === entry.chapterId);
  if (reference?.family !== "questing" || !reference.factions.includes("alliance")) continue;
  const file = path.resolve(root, entry.file);
  assert.ok(file.startsWith(path.resolve(root) + path.sep), "Archive entry escapes its root.");
  const raw = await readFile(file, "utf8");
  assert.equal(
    createHash("sha256").update(raw).digest("hex"),
    entry.sha256,
    `Archive checksum ${entry.chapterId}`,
  );
  sources.push({ reference, guide: importedChapterSchema.parse(JSON.parse(raw)) });
}
const starters = enrichCampaignStarters(
  buildCampaignStarters(manifest.sourceSha256, sources),
  sources,
  [],
  null,
);
const variants = [],
  failures = [];
for (const route of starters.routes) {
  const identity = `${route.race}/${route.classSlug ?? "general"}`;
  try {
    const plan = prepareCampaignPlan(
      buildCampaignPlan(route.race, manifest.sourceSha256, sources, route.classSlug),
      sources,
      {
        starters,
        rewardFacts: [],
        rewardRevision: "route-flow-without-private-evidence",
        rewardBuild: null,
        rewardNotice: null,
        combat: null,
      },
    );
    assert.deepEqual(
      plan.partyPolicy?.unresolvedPrerequisiteIds ?? [],
      [],
      `${identity}: missing prerequisites`,
    );
    for (const strategy of ["dungeons", "mixed"]) {
      for (const optionalStops of [true, false]) {
        let progress = emptyPremadeProgress();
        progress.dungeonFinish.strategy = strategy;
        progress.raidGoals = optionalStops;
        if (!optionalStops)
          for (const leg of plan.legs) {
            if (leg.bundleId) {
              const bundle = getDungeonBundle(leg.bundleId, "alliance");
              assert.ok(bundle, `Missing bundle ${leg.bundleId}`);
              progress = updatePremadeDungeonBundle(progress, { ...bundle, included: false });
            }
          }
        const actions = activeCampaignActions(plan, progress);
        const staged = emptyPremadeProgress();
        staged.members = staged.members.map((member) => ({
          ...member,
          level: 60,
          currentXp: 0,
          xpNeedsUpdate: false,
        }));
        for (const action of actions.filter((entry) => entry.kind === "quests")) {
          const reasons = campaignActionReasons(action, staged);
          assert.deepEqual(
            reasons,
            [],
            `${identity}: ${action.id} has an unreachable prerequisite`,
          );
          staged.members = staged.members.map((member, index) => {
            if (action.leaderOnly && index !== 0) return member;
            const questStates = { ...member.questStates };
            const ranks = { "not-started": 0, accepted: 1, "objectives-complete": 2, rewarded: 3 };
            for (const change of action.questChanges) {
              const rank = ranks[questStates[change.questId] ?? "not-started"];
              if (change.state !== "accepted")
                assert.ok(
                  rank > 0,
                  `${identity}: ${action.id} precedes quest ${change.questId}'s pickup for player ${index + 1}`,
                );
              if (ranks[change.state] > rank) questStates[change.questId] = change.state;
            }
            return { ...member, questStates };
          });
        }
        assert.equal(
          new Set(actions.map((action) => action.id)).size,
          actions.length,
          `${identity}: duplicate steps`,
        );
        const sections = campaignSections(plan, progress);
        assert.ok(
          actions.every((action) =>
            sections.some((section) => section.actionIds.includes(action.id)),
          ),
          `${identity}: orphan chapter step`,
        );
        assert.ok(
          !actions.some((action) => action.movement?.terminal && /Westfall/i.test(action.title)),
          `${identity}: stale final solo transfer`,
        );
        if (route.classSlug) {
          const artifact = compileCampaignAddon(plan, actions, {
            version: "0.2.0-review.flow",
            runtimeBuild: 70450,
            interfaceVersion: 16001,
            restedXpVersion: "v4.11.27",
            nativeSources: sources,
          });
          assert.ok(artifact.documents.length > 0, `${identity}: empty native export`);
        }
        variants.push({
          identity,
          strategy,
          optionalStops,
          actions: actions.length,
          sections: sections.map((section) => ({
            id: section.id,
            title: section.title,
            first: actions.find((action) => section.actionIds.includes(action.id))?.title,
            last: actions.filter((action) => section.actionIds.includes(action.id)).at(-1)?.title,
          })),
        });
      }
    }
  } catch (error) {
    failures.push({ identity, error: error instanceof Error ? error.message : String(error) });
  }
}
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(
  reportPath,
  JSON.stringify(
    { sourceSha256: manifest.sourceSha256, sources: sources.length, variants, failures },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    sources: sources.length,
    editions: starters.routes.length,
    variants: variants.length,
    failures,
    report: reportPath,
  }),
);
assert.equal(failures.length, 0, "Route flow review failed; see report.");
