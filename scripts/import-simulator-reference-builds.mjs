import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import process from "node:process";
import console from "node:console";
import { importReferenceBuild, referenceTargets } from "../infra/simulator/reference-builds.mjs";

const root = resolve(import.meta.dirname, "..");
const directory = join(root, "artifacts/forever-simulator");
const config = JSON.parse(await readFile(join(root, "infra/simulator/upstream.json"), "utf8"));
const active = JSON.parse(await readFile(join(directory, "active.json"), "utf8"));
if (active.revision !== config.revision) throw new Error("Prepare the current simulator first");
const db = JSON.parse(
  await readFile(join(directory, active.release, "assets/database/db.json"), "utf8"),
);
const ids = new Set(db.items.map((item) => item.id));
const builds = [];
await mkdir(directory, { recursive: true });
for (const target of referenceTargets) {
  const path = join(directory, `mythicsim-${target.key}.json`);
  let bytes;
  if (process.argv.includes("--refresh")) {
    const response = await globalThis.fetch(
      `https://api.mythicsim.com/api/forever/ranking-sims/${target.id}?view=worn-gear-v1`,
      { signal: globalThis.AbortSignal.timeout(30000) },
    );
    if (!response.ok) throw new Error(`Public reference HTTP ${response.status}: ${target.key}`);
    bytes = globalThis.Buffer.from(await response.arrayBuffer());
    if (bytes.length > 8_000_000) throw new Error("Reference response too large");
  } else {
    bytes = await readFile(path);
  }
  const trees = JSON.parse(
    await readFile(
      join(root, ".cache/forever-sim-upstream/ui/core/talents/trees", target.className + ".json"),
      "utf8",
    ),
  );
  const build = importReferenceBuild(
    JSON.parse(bytes.toString("utf8")),
    target,
    trees,
    ids,
    createHash("sha256").update(bytes).digest("hex"),
  );
  if (process.argv.includes("--refresh")) await writeFile(path, bytes);
  builds.push(build);
}
const archive = {
  schema: "kfc-simulator-reference-builds.v1",
  targetRevision: config.revision,
  catalogRelease: active.release,
  importedAt: new Date().toISOString(),
  notice:
    "Four attributed public reference examples, not a mirror of rankings. Only factual talent allocations and equipment IDs are retained; narrative, stat tables, rankings and reported DPS are not republished. Talents are search seeds only. Missing items, original enchants and foreign APLs are never installed. Current gear, buffs, rotations and encounter settings remain controlled by each local experiment.",
  builds,
};
await writeFile(
  join(directory, "reference-candidates.json"),
  JSON.stringify(archive, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      output: join(directory, "reference-candidates.json"),
      builds: builds.map((build) => ({
        id: build.id,
        points: build.treePoints,
        unavailable: build.unavailableGearIds,
        status: build.status,
      })),
    },
    null,
    2,
  ),
);
