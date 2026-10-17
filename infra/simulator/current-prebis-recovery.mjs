import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { accessorySnapshot } from "./verified-accessories.mjs";
import { inspectionSource } from "./inspection-data.mjs";
import { classicReferenceSha256 } from "./classic-acquisition.mjs";
import { currentLevel60Ratings, stageCurrentPrebisRecovery } from "./current-prebis-staging.mjs";
import { mergeCurrentPrebisRecovery } from "./current-prebis-admission.mjs";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const read = async (path) => JSON.parse(await readFile(path, "utf8"));

export async function loadCurrentPrebisEvidence(root, upstream) {
  const snapshotBytes = await readFile(
    join(root, "artifacts/forever-client-data", accessorySnapshot.checksum + ".json"),
  );
  assert.equal(digest(snapshotBytes), accessorySnapshot.checksum);
  const snapshot = JSON.parse(snapshotBytes.toString("utf8"));
  assert.equal(snapshot.clientVersion, inspectionSource.build);
  const parent = join(root, "artifacts/forever-mechanics/70425", inspectionSource.hotfix);
  let evidence;
  for (const name of (await readdir(parent))
    .filter((name) => name.startsWith("mechanics-"))
    .sort()) {
    const directory = join(parent, name);
    const bytes = await readFile(join(directory, "manifest.json"));
    if (digest(bytes) !== inspectionSource.manifestSha256) continue;
    const manifest = JSON.parse(bytes.toString("utf8"));
    assert.equal(manifest.build.clientVersion, snapshot.clientVersion);
    assert.equal(manifest.hotfixSha256, snapshot.hotfixSha256);
    const load = async (name) => {
      const descriptor = manifest.tables[`${name}.effective`];
      assert.equal(descriptor?.path, `raw/${name}.effective.ndjson.gz`);
      const raw = await readFile(join(directory, descriptor.path));
      assert(raw.length <= 30_000_000);
      assert.equal(digest(raw), descriptor.sha256, `Current ${name} checksum changed`);
      const text = gunzipSync(raw, { maxOutputLength: 80_000_000 }).toString("utf8").trim();
      const rows = text ? text.split("\n").map((line) => JSON.parse(line)) : [];
      assert.equal(rows.length, descriptor.recordCount);
      return { name, rows, sha256: descriptor.sha256 };
    };
    const tables = await Promise.all(
      ["ItemSparse", "ItemEffect", "ItemXItemEffect", "SpellEffect", "SpellAuraOptions"].map(load),
    );
    const sparse = tables.find((table) => table.name === "ItemSparse");
    const utilities = tables.filter((table) => table.name !== "ItemSparse");
    assert.equal(manifest.combatRatings.path, "combatratings.txt");
    const ratingsBytes = await readFile(join(directory, manifest.combatRatings.path));
    assert.equal(digest(ratingsBytes), manifest.combatRatings.sha256);
    evidence = {
      captureDirectory: directory,
      manifest,
      sparse: sparse.rows,
      coefficients: currentLevel60Ratings(ratingsBytes.toString("utf8")),
      utilityTables: new Map(utilities.map((table) => [table.name, table.rows])),
      checksums: {
        itemSparseBytesSha256: sparse.sha256,
        combatRatingsBytesSha256: manifest.combatRatings.sha256,
        utilityTableBytesSha256: Object.fromEntries(
          utilities.map((table) => [table.name, table.sha256]),
        ),
      },
    };
    break;
  }
  assert(evidence, "The reviewed current-item mechanics capture was not found");
  const ratings = await read(join(upstream, "assets/db_inputs/forever_combat_ratings.json"));
  assert.equal(ratings.level, 60);
  assert.deepEqual(
    evidence.coefficients,
    ratings.coefficients,
    "Current client and engine ratings differ",
  );
  const referenceBytes = await readFile(
    join(root, "infra/simulator/classic-prebis-equipment.json"),
  );
  const reference = JSON.parse(referenceBytes.toString("utf8"));
  const sourceBytes = await readFile(
    join(root, "artifacts/forever-simulator/classic-reference/db.json"),
  );
  assert.equal(digest(sourceBytes), classicReferenceSha256);
  const sourceItems = new Map(
    JSON.parse(sourceBytes.toString("utf8")).items.map((item) => [item.id, item]),
  );
  for (const entry of reference.items)
    assert.deepEqual(
      entry.item,
      sourceItems.get(entry.item.id),
      `Historical source record changed: ${entry.item.id}`,
    );
  return {
    snapshot,
    reference,
    ...evidence,
    checksums: {
      ...evidence.checksums,
      snapshotBytesSha256: accessorySnapshot.checksum,
      mechanicsManifestBytesSha256: inspectionSource.manifestSha256,
      historicalReferenceBytesSha256: digest(referenceBytes),
      historicalDatabaseBytesSha256: classicReferenceSha256,
      normalizerBytesSha256: digest(
        await readFile(join(root, "infra/simulator/current-prebis-staging.mjs")),
      ),
    },
  };
}

export async function loadCurrentPrebisRecovery(root, upstream, equipment) {
  const review = await read(join(root, "infra/simulator/current-prebis-equipment.json"));
  const evidence = await loadCurrentPrebisEvidence(root, upstream);
  for (const [field, checksum] of Object.entries(evidence.checksums))
    assert.deepEqual(review[field], checksum, `Reviewed current-item input changed: ${field}`);
  const recoveryIds = new Set(review.candidates.map((candidate) => candidate.item.id));
  const normalized = stageCurrentPrebisRecovery(
    evidence.snapshot,
    evidence.reference,
    evidence.sparse,
    new Set(equipment.items.filter((item) => !recoveryIds.has(item.id)).map((item) => item.id)),
    evidence.coefficients,
    evidence.utilityTables,
  );
  return mergeCurrentPrebisRecovery(equipment, review, normalized);
}
