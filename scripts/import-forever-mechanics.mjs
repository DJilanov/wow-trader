import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import console from "node:console";
import process from "node:process";
import {
  loadMechanicsTables,
  normalizeClientMechanics,
} from "../packages/forever-data/dist/mechanics.js";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { destination: { type: "string" } },
});
if (positionals.length !== 1)
  throw new Error(
    "Usage: import-forever-mechanics.mjs <manifest.json> [--destination <directory>]",
  );
const { manifest, tables } = await loadMechanicsTables(resolve(positionals[0]));
const data = normalizeClientMechanics(manifest, tables);
const raw = JSON.stringify(data),
  checksum = createHash("sha256").update(raw).digest("hex");
const directory = resolve(
  values.destination || process.env.FOREVER_MECHANICS_ROOT || "artifacts/forever-client-data",
);
await mkdir(directory, { recursive: true });
const target = join(directory, checksum + ".json");
try {
  await writeFile(target, raw, { flag: "wx", mode: 0o600 });
} catch (error) {
  if (error?.code !== "EEXIST") throw error;
  if ((await readFile(target, "utf8")) !== raw)
    throw new Error("Mechanics archive checksum collision");
}
const classes = [...new Set(data.talents.map((talent) => talent.className))].sort().map((name) => ({
  name,
  talents: data.talents.filter((t) => t.className === name).length,
  unresolvedLayouts: data.talents.filter((t) => t.className === name && !t.layoutResolved).length,
  unresolvedRankText: data.talents.filter(
    (t) => t.className === name && t.ranks.some((rank) => !rank.resolved),
  ).length,
}));
const report = {
  schema: "forever-mechanics-report.v1",
  checksum,
  file: checksum + ".json",
  clientVersion: data.clientVersion,
  hotfixSha256: data.hotfixSha256,
  capturedAt: data.capturedAt,
  items: data.items.length,
  itemsWithResolvedFields: data.items.filter((item) => !item.issues.length).length,
  sets: data.sets.length,
  setEffects: data.setEffects.length,
  classes,
  sourceIssues: data.issues,
  note: "Client field normalization is not validation of server behavior or simulator implementation. The published model remains independently versioned.",
};
const temporary = join(directory, `.active-${randomUUID()}.tmp`);
try {
  await writeFile(temporary, JSON.stringify(report), { flag: "wx", mode: 0o600 });
  await rename(temporary, join(directory, "active.json"));
} finally {
  await unlink(temporary).catch((error) => {
    if (error?.code !== "ENOENT") throw error;
  });
}
console.log(
  JSON.stringify({
    clientVersion: data.clientVersion,
    checksum,
    items: report.items,
    itemsWithResolvedFields: report.itemsWithResolvedFields,
    classes,
  }),
);
