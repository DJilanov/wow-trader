import { readFile, mkdir, stat, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import console from "node:console";
import { questXpIndexSchema, readPublishedQuestXp } from "../packages/reference-data/dist/index.js";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    baseline: { type: "string" },
    rewards: { type: "string" },
    destination: { type: "string" },
    "expected-unknown": { type: "string" },
  },
});
const command = positionals[0];
if (
  !["prepare", "status"].includes(command) ||
  positionals.length !== 1 ||
  !values.baseline ||
  !values.rewards ||
  (command === "prepare" && !values.destination)
)
  throw new Error(
    "Usage: repair-leveling-quest-xp.mjs <prepare|status> --baseline <frozen published root> --rewards <current published root> [--destination <new queue directory> --expected-unknown <count>]",
  );

async function snapshot(root) {
  const path = join(root, "quest-xp/index.json");
  if ((await stat(path)).size > 4000000) throw new Error("Quest XP index too large");
  const raw = await readFile(path);
  if (raw.byteLength > 4000000) throw new Error("Quest XP index too large");
  const index = questXpIndexSchema.parse(JSON.parse(raw.toString("utf8")));
  const records = new Map();
  for (const entry of index.records) {
    const record = await readPublishedQuestXp(root, entry);
    if (!record) throw new Error(`Expired XP evidence: ${entry.game}:${entry.id}`);
    records.set(`${record.game}:${record.id}`, record);
  }
  return {
    index,
    records,
    sha256: createHash("sha256").update(raw).digest("hex"),
  };
}

const baseline = await snapshot(resolve(values.baseline));
const current = await snapshot(resolve(values.rewards));
const cohort = [...baseline.records.values()].filter(
  (record) => record.game === "forever" && record.status === "unknown",
);
if (values["expected-unknown"] !== undefined) {
  const expected = Number(values["expected-unknown"]);
  if (!Number.isSafeInteger(expected) || expected < 1 || cohort.length !== expected)
    throw new Error(
      `Baseline cohort mismatch: expected ${values["expected-unknown"]}, got ${cohort.length}`,
    );
}
const summary = {
  total: current.records.size,
  available: 0,
  unknown: 0,
  conflict: 0,
};
for (const record of current.records.values()) summary[record.status]++;
const unresolved = [];
let resolved = 0;
for (const record of cohort) {
  const latest = current.records.get(`forever:${record.id}`);
  if (latest?.status === "available") resolved++;
  else
    unresolved.push({
      id: record.id,
      name: record.name,
      status: latest?.status ?? "missing",
      issues: latest?.issues ?? ["missing_published_record"],
    });
}
const report = {
  schema: "quest-xp-recovery.v1",
  createdAt: new Date().toISOString(),
  baseline: { sha256: baseline.sha256, publishedAt: baseline.index.publishedAt },
  current: { sha256: current.sha256, publishedAt: current.index.publishedAt, ...summary },
  cohort: { total: cohort.length, resolved, remaining: unresolved.length, unresolved },
};
if (command === "prepare") {
  const pending = [...cohort, ...current.records.values()].filter(
    (record) => record.game === "forever" && record.status === "unknown",
  );
  const tasks = [
    ...new Map(
      pending.map((record) => [record.id, { game: "forever", kind: "quest", id: record.id }]),
    ).values(),
  ];
  if (!tasks.length || tasks.length > 10000)
    throw new Error("Recovery queue must contain 1-10000 quests");
  const raw = JSON.stringify(tasks),
    sha256 = createHash("sha256").update(raw).digest("hex"),
    directory = resolve(values.destination),
    name = `forever-xp-recovery-${sha256.slice(0, 16)}`;
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, `${name}.json`), `${raw}\n`, { flag: "wx", mode: 0o600 });
  await writeFile(
    join(directory, `${name}.inventory.json`),
    `${JSON.stringify({ ...report, queue: { sha256, total: tasks.length } }, null, 2)}\n`,
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      ...report,
      queue: { path: join(directory, `${name}.json`), sha256, total: tasks.length },
    }),
  );
} else console.log(JSON.stringify(report));
