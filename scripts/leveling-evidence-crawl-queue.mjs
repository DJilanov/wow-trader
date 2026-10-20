import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";

const QUEST_PAGE_EVIDENCE = new Map([
  ["pickup-level-conflict", ["minimum-level", "quest-level"]],
  ["source-gate-conflict", ["prerequisites", "eligibility"]],
  ["quest-lifecycle-unverified", ["minimum-level", "start", "end", "objectives", "prerequisites"]],
  ["personal-eligibility-unverified", ["faction", "race", "class", "prerequisites"]],
  ["reward-unresolved", ["reward-xp", "rewards"]],
  ["reward-historical-estimate", ["reward-xp", "rewards"]],
]);

const rawArgs = process.argv.slice(2);
const { values } = parseArgs({
  args: rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs,
  options: {
    backlog: { type: "string" },
    "base-queue": { type: "string" },
    "additional-queue": { type: "string" },
    queue: { type: "string" },
    report: { type: "string" },
  },
  strict: true,
});

if (!values.backlog || !values.queue || !values.report) {
  throw new Error(
    "Pass --backlog=<campaign evidence backlog> --queue=<crawler queue> --report=<plan report> [--base-queue=<existing quest queue>] [--additional-queue=<Forever quest/item queue>].",
  );
}

async function readJson(path, maximumBytes) {
  const absolute = resolve(path);
  if ((await stat(absolute)).size > maximumBytes)
    throw new Error(`Input exceeds size budget: ${path}`);
  const raw = await readFile(absolute, "utf8");
  return { raw, value: JSON.parse(raw) };
}

function parseReferenceQueue(value, label, allowItems = false) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  const tasks = value.map((task) => {
    if (
      task === null ||
      typeof task !== "object" ||
      Array.isArray(task) ||
      task.game !== "forever" ||
      (task.kind !== "quest" && !(allowItems && task.kind === "item")) ||
      !Number.isSafeInteger(task.id) ||
      task.id <= 0 ||
      task.id > 2_147_483_647 ||
      Object.keys(task).some((key) => !["game", "kind", "id"].includes(key))
    ) {
      throw new Error(
        `${label} contains an invalid Forever ${allowItems ? "quest/item" : "quest"} task.`,
      );
    }
    return { game: "forever", kind: task.kind, id: task.id };
  });
  if (new Set(tasks.map((task) => `${task.kind}:${task.id}`)).size !== tasks.length)
    throw new Error(`${label} contains duplicate task identities.`);
  return tasks;
}

async function atomicJsonWrite(path, value) {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, { flag: "wx", mode: 0o600 });
  await rename(temporary, absolute);
}

const backlogInput = await readJson(values.backlog, 32_000_000);
const backlog = backlogInput.value;
if (
  backlog === null ||
  typeof backlog !== "object" ||
  Array.isArray(backlog) ||
  backlog.schema !== "campaign-evidence-backlog.v1" ||
  !Array.isArray(backlog.tasks)
) {
  throw new Error("Unsupported campaign evidence backlog.");
}

const questEvidence = new Map();
const issueCounts = Object.fromEntries([...QUEST_PAGE_EVIDENCE.keys()].map((code) => [code, 0]));
for (const task of backlog.tasks) {
  if (task === null || typeof task !== "object" || Array.isArray(task))
    throw new Error("Campaign evidence backlog contains an invalid task.");
  const fields = QUEST_PAGE_EVIDENCE.get(task.code);
  if (!fields || !Number.isSafeInteger(task.questId) || task.questId <= 0) continue;
  if (typeof task.key !== "string" || !task.key) throw new Error("Evidence task key is missing.");
  issueCounts[task.code]++;
  const entry = questEvidence.get(task.questId) ?? {
    id: task.questId,
    evidenceCodes: new Set(),
    evidenceFields: new Set(),
    issueKeys: new Set(),
  };
  entry.evidenceCodes.add(task.code);
  for (const field of fields) entry.evidenceFields.add(field);
  entry.issueKeys.add(task.key);
  questEvidence.set(task.questId, entry);
}

if (!questEvidence.size) throw new Error("Evidence backlog contains no quest-page work.");
const baseTasks = values["base-queue"]
  ? parseReferenceQueue((await readJson(values["base-queue"], 8_000_000)).value, "Base queue")
  : [];
const baseIds = new Set(baseTasks.map((task) => task.id));
const selectedIds = [...questEvidence.keys()].sort((left, right) => left - right);
const key = (task) => `${task.kind}:${task.id}`;
const queueByKey = new Map(baseTasks.map((task) => [key(task), task]));
for (const id of selectedIds) queueByKey.set(`quest:${id}`, { game: "forever", kind: "quest", id });
const additionalInput = values["additional-queue"]
  ? await readJson(values["additional-queue"], 8_000_000)
  : null;
const additionalTasks = additionalInput
  ? parseReferenceQueue(additionalInput.value, "Additional queue", true)
  : [];
const alreadyQueued = additionalTasks.filter((task) => queueByKey.has(key(task))).length;
for (const task of additionalTasks) queueByKey.set(key(task), task);
const queue = [...queueByKey.values()].sort(
  (left, right) => left.kind.localeCompare(right.kind) || left.id - right.id,
);
if (queue.length > 10_000) throw new Error("Merged crawler queue exceeds 10,000 tasks.");

const queueRaw = JSON.stringify(queue);
const queueSha256 = createHash("sha256").update(queueRaw).digest("hex");
const report = {
  schema: "leveling-evidence-crawl-plan.v1",
  targetBuild: Number.isSafeInteger(backlog.targetBuild) ? backlog.targetBuild : null,
  archiveSha256:
    typeof backlog.archiveSha256 === "string" && /^[a-f0-9]{64}$/.test(backlog.archiveSha256)
      ? backlog.archiveSha256
      : null,
  backlogSha256: createHash("sha256").update(backlogInput.raw).digest("hex"),
  queueSha256,
  ...(additionalInput
    ? { additionalQueueSha256: createHash("sha256").update(additionalInput.raw).digest("hex") }
    : {}),
  summary: {
    sourceEvidenceTasks: Object.values(issueCounts).reduce((total, count) => total + count, 0),
    sourceEvidenceQuests: selectedIds.length,
    baseQueueQuests: baseTasks.length,
    alreadyInBaseQueue: selectedIds.filter((id) => baseIds.has(id)).length,
    addedToBaseQueue: selectedIds.filter((id) => !baseIds.has(id)).length,
    mergedQueueQuests: queue.filter((task) => task.kind === "quest").length,
    ...(additionalInput
      ? {
          additionalQueueTasks: additionalTasks.length,
          additionalAlreadyQueued: alreadyQueued,
          additionalAdded: additionalTasks.length - alreadyQueued,
          mergedQueueItems: queue.filter((task) => task.kind === "item").length,
          mergedQueueTasks: queue.length,
        }
      : {}),
    byEvidenceCode: issueCounts,
  },
  exclusions: [
    "Named-target party-credit checks require an in-game five-player observation.",
    "Adaptive-grind measurements require an in-game timed observation.",
  ],
  quests: selectedIds.map((id) => {
    const entry = questEvidence.get(id);
    return {
      id,
      sourceUrl: `https://www.wowhead.com/forever/quest=${id}`,
      evidenceCodes: [...entry.evidenceCodes].sort(),
      evidenceFields: [...entry.evidenceFields].sort(),
      issueKeys: [...entry.issueKeys].sort(),
      alreadyInBaseQueue: baseIds.has(id),
    };
  }),
};

await atomicJsonWrite(values.queue, queue);
await atomicJsonWrite(values.report, report);
process.stdout.write(
  `${JSON.stringify({
    queue: resolve(values.queue),
    report: resolve(values.report),
    queueSha256,
    ...report.summary,
  })}\n`,
);
