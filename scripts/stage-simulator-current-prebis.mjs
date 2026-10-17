import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import console from "node:console";
import { stageCurrentPrebisRecovery } from "../infra/simulator/current-prebis-staging.mjs";
import { loadCurrentPrebisEvidence } from "../infra/simulator/current-prebis-recovery.mjs";
import { simulationHash } from "../infra/simulator/simulation-cache.mjs";

assert.equal(
  process.argv.length,
  2,
  "The current-item staging command accepts no arguments and cannot target active data",
);
const root = resolve(import.meta.dirname, "..");
const read = async (path) => JSON.parse(await readFile(path, "utf8"));
const evidence = await loadCurrentPrebisEvidence(root, join(root, ".cache/forever-sim-upstream"));
const db = await read(join(root, ".cache/forever-sim-upstream/assets/database/db.json"));
const result = stageCurrentPrebisRecovery(
  evidence.snapshot,
  evidence.reference,
  evidence.sparse,
  new Set(db.items.map((item) => item.id)),
  evidence.coefficients,
  evidence.utilityTables,
);
const checksums = evidence.checksums;
const report = {
  schema: "kfc-current-prebis-staging.v1",
  status: "staged-not-admitted",
  clientVersion: evidence.snapshot.clientVersion,
  snapshotBytesSha256: checksums.snapshotBytesSha256,
  mechanicsManifestBytesSha256: checksums.mechanicsManifestBytesSha256,
  itemSparseBytesSha256: checksums.itemSparseBytesSha256,
  combatRatingsBytesSha256: checksums.combatRatingsBytesSha256,
  utilityTableBytesSha256: checksums.utilityTableBytesSha256,
  historicalReferenceBytesSha256: checksums.historicalReferenceBytesSha256,
  historicalDatabaseBytesSha256: checksums.historicalDatabaseBytesSha256,
  currentDatabaseValueSha256: simulationHash(db),
  normalizerBytesSha256: checksums.normalizerBytesSha256,
  notice:
    "Staged current-client values and wearer/set metadata with historical non-raid acquisition. Not an active catalog or admission approval. Existing items are never replaced. Unknown effects and unmodeled stat modifiers stay blocked. Reviewed passive control-duration utility is retained as explicitly unmodeled metadata, not a damage bonus. Set runtime, utility disclosure and vendor access still need review before adoption. Active database, native binary, public release and running simulations are unchanged.",
  ...result,
};
const directory = join(root, "artifacts/forever-simulator/optimization/staged-current-prebis");
await mkdir(directory, { recursive: true });
const output = join(directory, "current-prebis-" + simulationHash(report).slice(0, 16) + ".json");
try {
  await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  assert.deepEqual(await read(output), report, "Existing staged current-item report changed");
}
console.log(
  JSON.stringify(
    {
      output,
      candidates: result.candidates.length,
      blocked: result.blocked,
      status: report.status,
    },
    null,
    2,
  ),
);
