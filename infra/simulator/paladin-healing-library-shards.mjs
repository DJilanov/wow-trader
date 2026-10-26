import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { assertPaladinHealerLibraryCandidate } from "./paladin-healing-library.mjs";

const assetLimit = 8_000_000;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const encode = (value) => Buffer.from(JSON.stringify(value) + "\n");
const checksum = /^[a-f0-9]{64}$/;
const filename = /^[a-z0-9][a-z0-9_.-]*\.json$/;

function assertReference(ref) {
  assert(ref && filename.test(ref.file));
  assert(!ref.file.includes(".."));
  assert(checksum.test(ref.byteSha256));
  assert(Number.isSafeInteger(ref.bytes) && ref.bytes > 0 && ref.bytes <= assetLimit);
}

function parseAsset(assets, ref) {
  assertReference(ref);
  const bytes = assets.get(ref.file);
  assert(Buffer.isBuffer(bytes), "Missing Paladin library asset: " + ref.file);
  assert.equal(bytes.length, ref.bytes, ref.file);
  assert.equal(sha(bytes), ref.byteSha256, ref.file);
  return JSON.parse(bytes);
}

/** Partition the complete reviewed archive without changing any build or source identity.
 * Each decoded asset remains within the existing healer loader's eight-megabyte limit.
 * @param {object} library @returns {{indexRef:object,assets:Map<string,Buffer>}}
 */
export function createPaladinHealerLibraryShards(library) {
  assertPaladinHealerLibraryCandidate(library);
  const archiveBytes = encode(library),
    candidateSha256 = sha(archiveBytes);
  const assets = new Map();
  function add(file, value) {
    assert(!assets.has(file));
    const bytes = encode(value),
      ref = { file, byteSha256: sha(bytes), bytes: bytes.length };
    assertReference(ref);
    assets.set(file, bytes);
    return ref;
  }
  const shared = {
    profile: "healing-paladin",
    modelIdentity: library.model.identity,
    candidateSha256,
    websiteAdmissionComplete: false,
    fullClassQualified: false,
    publicationAllowed: false,
  };
  const catalog = add("catalog.json", {
    schema: "kfc-paladin-healer-catalog-shard.v1",
    ...shared,
    catalog: library.catalog,
  });
  const groups = library.groups.map((group) => {
    const configurations = library.configurations.filter((entry) => entry.groupId === group.id);
    const workloadIds = new Set(configurations.map((entry) => entry.workloadId));
    const file = "group-" + sha(group.id) + ".json";
    const asset = add(file, {
      schema: "kfc-paladin-healer-group-shard.v1",
      ...shared,
      group,
      configurations,
      workloads: library.workloads.filter((entry) => workloadIds.has(entry.id)),
    });
    return { group, asset };
  });
  const header = Object.fromEntries(
    Object.entries(library).filter(
      ([key]) => !["groups", "configurations", "workloads", "catalog"].includes(key),
    ),
  );
  const indexRef = add("library-index.json", {
    schema: "kfc-paladin-healer-library-index-candidate.v1",
    ...shared,
    archive: { byteSha256: candidateSha256, bytes: archiveBytes.length },
    header,
    propertyOrder: Object.keys(library),
    configurationOrder: library.configurations.map((entry) => entry.id),
    workloadOrder: library.workloads.map((entry) => entry.id),
    catalog,
    groups,
  });
  assert.equal(assets.size, 20);
  return { indexRef, assets };
}

/** Authenticate all shards and reconstruct the exact original archive, including member order.
 * This is a packaging check; it does not grant website or numerical qualification.
 * @param {{indexRef:object,assets:Map<string,Buffer>}} input @returns {object}
 */
export function reassemblePaladinHealerLibraryShards({ indexRef, assets }) {
  assert(assets instanceof Map);
  assert.equal(indexRef.file, "library-index.json");
  const index = parseAsset(assets, indexRef);
  assert.equal(index.schema, "kfc-paladin-healer-library-index-candidate.v1");
  assert.equal(index.profile, "healing-paladin");
  assert(checksum.test(index.modelIdentity));
  assert.equal(index.candidateSha256, index.archive.byteSha256);
  assert(checksum.test(index.archive.byteSha256));
  assert(Number.isSafeInteger(index.archive.bytes) && index.archive.bytes > 0);
  assert.equal(index.websiteAdmissionComplete, false);
  assert.equal(index.fullClassQualified, false);
  assert.equal(index.publicationAllowed, false);
  assert.equal(index.header.model.identity, index.modelIdentity);
  assert.equal(index.groups.length, 18);
  assert.equal(index.configurationOrder.length, 504);
  assert.equal(new Set(index.configurationOrder).size, 504);
  assert.equal(new Set(index.workloadOrder).size, index.workloadOrder.length);
  const usedFiles = new Set([indexRef.file]),
    groups = [],
    configurations = new Map(),
    workloads = new Map();
  function readShard(ref, schema) {
    assert(!usedFiles.has(ref.file), "Duplicate Paladin shard reference");
    usedFiles.add(ref.file);
    const shard = parseAsset(assets, ref);
    assert.equal(shard.schema, schema);
    assert.equal(shard.profile, index.profile);
    assert.equal(shard.modelIdentity, index.modelIdentity);
    assert.equal(shard.candidateSha256, index.candidateSha256);
    assert.equal(shard.websiteAdmissionComplete, false);
    assert.equal(shard.fullClassQualified, false);
    assert.equal(shard.publicationAllowed, false);
    return shard;
  }
  const catalog = readShard(index.catalog, "kfc-paladin-healer-catalog-shard.v1").catalog;
  for (const entry of index.groups) {
    assert.equal(entry.asset.file, "group-" + sha(entry.group.id) + ".json");
    const shard = readShard(entry.asset, "kfc-paladin-healer-group-shard.v1");
    assert.deepEqual(shard.group, entry.group);
    assert.equal(shard.configurations.length, 28);
    assert.equal(new Set(shard.configurations.map((config) => config.id)).size, 28);
    assert.deepEqual(
      shard.configurations.map((config) => config.id).sort(),
      shard.group.configurationIds.slice().sort(),
    );
    const expectedWorkloads = new Set();
    for (const configuration of shard.configurations) {
      assert.equal(configuration.groupId, shard.group.id);
      assert(!configurations.has(configuration.id));
      configurations.set(configuration.id, configuration);
      expectedWorkloads.add(configuration.workloadId);
    }
    assert.equal(shard.workloads.length, expectedWorkloads.size);
    assert.equal(
      new Set(shard.workloads.map((workload) => workload.id)).size,
      expectedWorkloads.size,
    );
    assert(shard.workloads.every((workload) => expectedWorkloads.has(workload.id)));
    for (const workload of shard.workloads) {
      if (workloads.has(workload.id)) assert.deepEqual(workloads.get(workload.id), workload);
      else workloads.set(workload.id, workload);
    }
    groups.push(shard.group);
  }
  assert.equal(assets.size, usedFiles.size, "Unexpected Paladin library assets");
  assert.equal(configurations.size, index.configurationOrder.length);
  assert.equal(workloads.size, index.workloadOrder.length);
  assert(index.configurationOrder.every((id) => configurations.has(id)));
  assert(index.workloadOrder.every((id) => workloads.has(id)));
  const values = new Map(Object.entries(index.header));
  for (const [key, value] of [
    ["groups", groups],
    ["configurations", index.configurationOrder.map((id) => configurations.get(id))],
    ["workloads", index.workloadOrder.map((id) => workloads.get(id))],
    ["catalog", catalog],
  ]) {
    assert(!values.has(key));
    values.set(key, value);
  }
  assert.equal(index.propertyOrder.length, values.size);
  assert.equal(new Set(index.propertyOrder).size, values.size);
  assert(index.propertyOrder.every((key) => values.has(key)));
  const library = Object.fromEntries(index.propertyOrder.map((key) => [key, values.get(key)]));
  const bytes = encode(library);
  assert.equal(bytes.length, index.archive.bytes);
  assert.equal(
    sha(bytes),
    index.archive.byteSha256,
    "Reassembled Paladin archive identity changed",
  );
  assertPaladinHealerLibraryCandidate(library);
  return library;
}
