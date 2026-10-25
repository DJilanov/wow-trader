import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import { questXpRecordSchema } from "../packages/reference-data/dist/index.js";
import {
  PREMADE_STOPS,
  emptyPremadeProgress,
  setPremadeQuestPackage,
  selectedPremadeQuests,
  forecastPremadeMember,
  resolveQuestReward,
  isUnplayedDungeonQuest,
  getDungeonBundle,
} from "../packages/leveling/dist/index.js";

const { values } = parseArgs({
  options: { records: { type: "string" }, output: { type: "string" } },
});
if (!values.records || !values.output)
  throw new Error("Use --records PUBLIC_QUEST_SNAPSHOT.json --output REPORT.json");
const records = JSON.parse(await readFile(values.records, "utf8")).map((value) =>
  questXpRecordSchema.parse(value),
);
const facts = records.map((record) => ({
  questId: record.id,
  fullXp: record.fullXp,
  questLevel: record.questLevel,
  minimumLevel: record.minimumLevel,
  xpByLevel: record.xpByLevel,
  referenceBaseXp: record.referenceBaseXp,
  pageMultiplier: record.pageMultiplier,
  sourceUrl: record.sourceUrl,
  capturedAt: record.capturedAt,
  status: record.status,
  evidenceKind: "published-forever",
}));
const initial = { ...emptyPremadeProgress(), difficultyPolicy: "experienced-premade" };
const stops = PREMADE_STOPS.map((stop) => {
  const atLevel = { ...initial.members[0], level: stop.level, currentXp: 0, xpNeedsUpdate: false };
  const modes = [
    ["speed-core", setPremadeQuestPackage(stop, initial, false)],
    ["default-quest-clear", initial],
    ["all-listed", setPremadeQuestPackage(stop, initial, true)],
  ].map(([mode, progress]) => {
    const forecast = forecastPremadeMember(stop, progress, atLevel, (choice, level) =>
      resolveQuestReward(choice.questId, level, facts),
    );
    const bundle =
      stop.dataStatus === "guaranteed-bundle"
        ? getDungeonBundle(stop.id, "alliance", progress.guaranteedBundles)
        : null;
    return {
      mode,
      selectedQuests:
        selectedPremadeQuests(stop, progress).length +
        (bundle?.slots.filter((slot) => slot.selected).length ?? 0),
      questXp: forecast.knownQuestXp + forecast.bundleQuestXp,
      bundleQuestXp: forecast.bundleQuestXp,
      unknownQuestIds: forecast.unknownQuestIds,
      unknownBundleSlotKeys: forecast.unknownBundleSlotKeys,
      endpoint: forecast.endpoint,
    };
  });
  return {
    id: stop.id,
    name: stop.name,
    handInLevel: stop.level,
    planningOnlyBundle: stop.dataStatus === "guaranteed-bundle",
    modes,
    quests: stop.quests
      .filter((choice) => ["core", "opportunistic"].includes(choice.role))
      .map((choice) => {
        const source = facts.find((fact) => fact.questId === choice.questId);
        const reward = resolveQuestReward(choice.questId, stop.level, facts);
        return {
          id: choice.questId,
          role: choice.role,
          tableXp: source?.referenceBaseXp ?? null,
          capturedPageCoefficient: source?.pageMultiplier ?? null,
          estimateOnlyBeyondGnomeregan: isUnplayedDungeonQuest(choice.questId),
          xp: reward.xp,
          basis: reward.basis,
          source: reward.source,
        };
      }),
  };
});
const report = {
  schema: "dungeon-table-xp-audit.v1",
  policy:
    "Unplayed higher-level dungeons use table XP × 2.375 with rounding and overlevel reduction; earlier scaled references and observations are not multiplied again.",
  boundary:
    "Quest hand-in estimates only, per player; no kills, earned progress or one-run completion is claimed. Bundle-only stops keep their independent unknown identities.",
  records: records.length,
  stops,
};
const output = resolve(values.output);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(
  `${JSON.stringify({ output, dungeons: stops.length, gnomeregan: stops.find((stop) => stop.id === "gnomeregan").modes })}\n`,
);
