import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import console from "node:console";
import {
  referenceTaskSchema,
  readQuestXpIndex,
  readPublishedQuestXp,
} from "../packages/reference-data/dist/index.js";

const { values } = parseArgs({
  options: {
    queue: { type: "string" },
    rewards: { type: "string" },
    "expected-sha256": { type: "string" },
  },
});
if (!values.queue || !values.rewards)
  throw new Error(
    "Pass --queue=<immutable queue> --rewards=<published root> [--expected-sha256=<queue hash>]",
  );
if ((await stat(values.queue)).size > 4000000) throw new Error("Archive queue too large");
const raw = await readFile(values.queue, "utf8");
if (Buffer.byteLength(raw) > 4000000) throw new Error("Archive queue too large");
const tasks = referenceTaskSchema.array().min(1).max(10000).parse(JSON.parse(raw));
const wanted = new Set(tasks.map((task) => task.id));
if (
  tasks.some((task) => task.game !== "forever" || task.kind !== "quest") ||
  wanted.size !== tasks.length
)
  throw new Error("Archive queue must contain unique Forever quests only");
const queueSha256 = createHash("sha256").update(JSON.stringify(tasks)).digest("hex");
if (values["expected-sha256"] && queueSha256 !== values["expected-sha256"])
  throw new Error("Archive queue checksum mismatch");
const root = resolve(values.rewards),
  index = await readQuestXpIndex(root);
const counts = { available: 0, unknown: 0, conflict: 0, expired: 0, notPublished: tasks.length };
const unresolved = [];
for (const entry of index?.records ?? []) {
  if (entry.game !== "forever" || !wanted.has(entry.id)) continue;
  wanted.delete(entry.id);
  counts.notPublished--;
  const record = await readPublishedQuestXp(root, entry);
  if (!record) {
    counts.expired++;
    unresolved.push({ id: entry.id, status: "expired", issues: [] });
  } else {
    counts[record.status]++;
    if (record.status !== "available")
      unresolved.push({ id: record.id, status: record.status, issues: record.issues });
  }
}
for (const id of wanted) unresolved.push({ id, status: "not-published", issues: [] });
unresolved.sort((left, right) => left.id - right.id);
console.log(
  JSON.stringify({
    schema: "leveling-archive-xp-coverage.v1",
    checkedAt: new Date().toISOString(),
    publishedAt: index?.publishedAt ?? null,
    queueSha256,
    total: tasks.length,
    ...counts,
    complete: counts.available === tasks.length,
    unresolved,
  }),
);
