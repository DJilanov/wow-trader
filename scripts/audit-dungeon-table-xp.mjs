import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import process from "node:process";
import { isDeepStrictEqual, parseArgs } from "node:util";
import {
  questXpRecordSchema,
  questXpImportSetSchema,
  readQuestXpIndex,
  readPublishedQuestXp,
} from "../packages/reference-data/dist/index.js";
import { auditDungeonQuestRewards } from "./dungeon-quest-xp-audit.mjs";
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
  options: {
    records: { type: "string" },
    reference: { type: "string" },
    historical: { type: "string" },
    output: { type: "string" },
  },
});
if ((!values.records && !values.reference) || !values.output)
  throw new Error(
    "Use --records PUBLIC_QUEST_SNAPSHOT.json and/or --reference PUBLISHED_ROOT [--historical IMPORT.json] --output NEW_REPORT.json",
  );
const byId = new Map();
const inputs = [];
function addRecord(value) {
  const record = questXpRecordSchema.parse(value);
  if (record.game !== "forever") throw new Error("Dungeon XP audit requires Forever records.");
  const previous = byId.get(record.id);
  if (previous?.capturedAt === record.capturedAt && !isDeepStrictEqual(previous, record))
    throw new Error(`Conflicting same-capture quest records: ${record.id}`);
  if (!previous || record.capturedAt > previous.capturedAt) byId.set(record.id, record);
}
if (values.reference) {
  const root = resolve(values.reference);
  const index = await readQuestXpIndex(root);
  if (!index) throw new Error("Published quest XP index is missing.");
  for (const entry of index.records.filter((record) => record.game === "forever")) {
    const record = await readPublishedQuestXp(root, entry);
    if (!record) throw new Error(`Published quest XP record is stale: ${entry.id}`);
    addRecord(record);
  }
  inputs.push({
    path: resolve(root, "quest-xp/index.json"),
    sha256: createHash("sha256")
      .update(await readFile(resolve(root, "quest-xp/index.json")))
      .digest("hex"),
    publishedAt: index.publishedAt,
  });
}
if (values.records) {
  const raw = await readFile(values.records, "utf8");
  const snapshot = JSON.parse(raw);
  if (!Array.isArray(snapshot)) throw new Error("Quest XP snapshot must be an array.");
  for (const value of snapshot) addRecord(value);
  inputs.push({
    path: resolve(values.records),
    sha256: createHash("sha256").update(raw).digest("hex"),
  });
}
const records = [...byId.values()];
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
if (values.historical) {
  const raw = await readFile(values.historical, "utf8");
  const imported = questXpImportSetSchema.parse(JSON.parse(raw));
  if (imported.game !== "forever") throw new Error("Historical import is not for Forever.");
  for (const record of imported.records) {
    const index = facts.findIndex((fact) => fact.questId === record.id);
    const primary = facts[index];
    if (primary?.status === "available" || primary?.status === "conflict") continue;
    if (record.game !== "forever" || record.status !== "available") continue;
    const fallback = {
      questId: record.id,
      fullXp: record.fullXp,
      questLevel: record.questLevel ?? primary?.questLevel ?? null,
      minimumLevel: primary?.minimumLevel ?? record.minimumLevel,
      xpByLevel: record.xpByLevel,
      sourceUrl: `${record.sourceKind}: ${record.sourceRef} · ${record.revision}`,
      capturedAt: record.importedAt,
      status: "available",
      evidenceKind: "historical-reference",
    };
    if (index === -1) facts.push(fallback);
    else facts[index] = fallback;
  }
  inputs.push({
    path: resolve(values.historical),
    sha256: createHash("sha256").update(raw).digest("hex"),
    revision: imported.revision,
  });
}
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
          unplayedDungeon: isUnplayedDungeonQuest(choice.questId),
          xp: reward.xp,
          basis: reward.basis,
          source: reward.source,
        };
      }),
  };
});
const report = {
  schema: "dungeon-table-xp-audit.v2",
  policy:
    "Unscaled dungeon tables use table XP × 2.375 with rounding and overlevel reduction. Scaled page rewards retain their own coefficients at every dungeon level; observations take precedence.",
  boundary:
    "Quest hand-in estimates only, per player; no kills, earned progress or one-run completion is claimed. Bundle-only stops keep their independent unknown identities.",
  records: records.length,
  inputs,
  ...auditDungeonQuestRewards(facts),
  stops,
};
const output = resolve(values.output);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
process.stdout.write(`${JSON.stringify({ output, ...report.summary })}\n`);
if (report.issues.length) process.exitCode = 1;
