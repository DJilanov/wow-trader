import { readFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import process from "node:process";
import {
  CHAPTER_REFERENCES,
  CAMPAIGN_RACES,
  getLevelingRace,
  buildCampaignPlan,
  guideArchiveManifestSchema,
  importedChapterSchema,
  gateQuestIds,
  getPremadeQuest,
} from "../packages/leveling/dist/index.js";
import { atomicJsonWrite } from "../packages/reference-data/dist/index.js";

const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
const destination = args
  .find((argument) => argument.startsWith("--destination="))
  ?.slice("--destination=".length);
if (
  !destination ||
  args.some(
    (argument) =>
      !argument.startsWith("--destination=") && !["--catch-up", "--library"].includes(argument),
  )
)
  throw new Error(
    "Pass --destination=<artifact directory> [--catch-up] [--library]; this command does not change a running crawler.",
  );
const root = resolve(process.env.LEVELING_ARCHIVE_ROOT ?? "artifacts/leveling/archive");
const manifest = guideArchiveManifestSchema.parse(
  JSON.parse(await readFile(join(root, "manifest.json"), "utf8")),
);
if (manifest.publication !== "authorized")
  throw new Error("Only authorized source archives can seed this queue.");
const sources = [];
for (const entry of manifest.chapters) {
  const reference = CHAPTER_REFERENCES.find((chapter) => chapter.id === entry.chapterId);
  if (!reference || reference.family !== "questing" || !reference.factions.includes("alliance"))
    continue;
  const raw = await readFile(join(root, entry.file), "utf8");
  if (createHash("sha256").update(raw).digest("hex") !== entry.sha256)
    throw new Error("Source checksum mismatch");
  const guide = importedChapterSchema.parse(JSON.parse(raw));
  if (
    guide.targetBuild !== manifest.targetBuild ||
    guide.version !== entry.version ||
    guide.sourceSha256 !== entry.sourceSha256
  )
    throw new Error("Source manifest mismatch");
  sources.push({ reference, guide });
}
const inventory = new Map(),
  releases = [];
for (const race of CAMPAIGN_RACES)
  for (const leaderClass of [null, ...getLevelingRace("alliance", race).classes]) {
    const plan = buildCampaignPlan(race, manifest.sourceSha256, sources, leaderClass, {
      includeLibrary: args.includes("--library"),
    });
    releases.push(plan.release);
    if (args.includes("--library"))
      for (const choice of plan.library?.choices ?? []) {
        if (inventory.has(choice.questId)) continue;
        inventory.set(choice.questId, {
          id: choice.questId,
          title: choice.title,
          earliestLevel: choice.referenceLevel,
          tier: choice.role === "held" ? 3 : 2,
          urgent: false,
          handIn: true,
          prerequisiteOnly: choice.role === "prerequisite",
          libraryCandidate: true,
          objective: choice.objective,
          selection: choice.role,
        });
      }
    if (args.includes("--catch-up"))
      for (const batch of plan.catchUpBatches ?? []) {
        if (
          batch.objectiveType !== "shared-kills" ||
          batch.conditional ||
          inventory.has(batch.questId)
        )
          continue;
        inventory.set(batch.questId, {
          id: batch.questId,
          title: batch.title,
          earliestLevel: batch.referenceLevel,
          tier: 2,
          urgent: false,
          handIn: true,
          prerequisiteOnly: false,
          catchUpCandidate: true,
        });
      }
    for (const action of plan.actions)
      for (const change of action.questChanges) {
        const leg = plan.legs.find((entry) => entry.id === action.legId);
        const tier = race === "human" && leaderClass === null ? 0 : 1;
        const urgent =
          tier === 0 &&
          ["start-125", "ironforge-rendezvous", "early-party-kills", "dungeon-thanes"].includes(
            action.legId,
          );
        const previous = inventory.get(change.questId);
        inventory.set(change.questId, {
          ...previous,
          id: change.questId,
          title: change.title,
          earliestLevel: Math.min(previous?.earliestLevel ?? 60, leg.from),
          tier: Math.min(previous?.tier ?? tier, tier),
          urgent: previous?.urgent || urgent,
          handIn: previous?.handIn || change.state === "rewarded",
          prerequisiteOnly: false,
        });
      }
  }
const visit = (id, level, tier, seen) => {
  if (seen.has(id)) return;
  seen.add(id);
  for (const parent of gateQuestIds(getPremadeQuest(id)?.gate ?? { kind: "all", gates: [] })) {
    if (!inventory.has(parent))
      inventory.set(parent, {
        id: parent,
        title: getPremadeQuest(parent)?.title ?? null,
        earliestLevel: level,
        tier,
        handIn: false,
        prerequisiteOnly: true,
      });
    visit(parent, level, tier, seen);
  }
};
for (const record of [...inventory.values()])
  visit(record.id, record.earliestLevel, record.tier, new Set());
const entries = [...inventory.values()].sort(
  (a, b) =>
    Number(Boolean(b.urgent)) - Number(Boolean(a.urgent)) ||
    a.tier - b.tier ||
    a.earliestLevel - b.earliestLevel ||
    a.id - b.id,
);
const tasks = entries.map((entry) => ({ game: "forever", kind: "quest", id: entry.id }));
const queueSha256 = createHash("sha256").update(JSON.stringify(tasks)).digest("hex");
const prefix = `forever-leveling-xp-${queueSha256.slice(0, 16)}`;
await mkdir(resolve(destination), { recursive: true });
const queuePath = join(resolve(destination), `${prefix}.json`),
  inventoryPath = join(resolve(destination), `${prefix}.inventory.json`);
await atomicJsonWrite(queuePath, tasks);
await atomicJsonWrite(inventoryPath, {
  schema: "leveling-xp-priority.v1",
  archiveSha256: manifest.sourceSha256,
  targetBuild: manifest.targetBuild,
  queueSha256,
  releases,
  entries,
});
process.stdout.write(
  `${JSON.stringify({ queuePath, inventoryPath, queueSha256, quests: tasks.length, humanPriority: entries.filter((entry) => entry.tier === 0).length, prerequisiteOnly: entries.filter((entry) => entry.prerequisiteOnly).length })}\n`,
);
