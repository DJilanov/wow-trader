import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import {
  createPaladinHealerLibraryShards,
  reassemblePaladinHealerLibraryShards,
} from "./paladin-healing-library-shards.mjs";

const fixtureBytes = readFileSync(
  new URL("./fixtures/paladin-healing-library-source.v1.json.gz", import.meta.url),
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
assert.equal(sha(fixtureBytes), "6fdd0739773860ac0260149a125bd9742726a96f31f22b8018e9d45c569299e5");
const fixture = JSON.parse(gunzipSync(fixtureBytes)),
  library = fixture.library;
const packed = createPaladinHealerLibraryShards(library);
const originalBytes = Buffer.from(JSON.stringify(library) + "\n");
const copy = () => ({
  indexRef: { ...packed.indexRef },
  assets: new Map([...packed.assets].map(([name, bytes]) => [name, Buffer.from(bytes)])),
});

function replaceIndex(input, index) {
  const bytes = Buffer.from(JSON.stringify(index) + "\n");
  input.assets.set(input.indexRef.file, bytes);
  input.indexRef = { file: input.indexRef.file, byteSha256: sha(bytes), bytes: bytes.length };
}

function replaceAsset(input, ref, payload) {
  const bytes = Buffer.from(JSON.stringify(payload) + "\n");
  input.assets.set(ref.file, bytes);
  return { file: ref.file, byteSha256: sha(bytes), bytes: bytes.length };
}

test("the actual complete archive reassembles byte for byte from twenty bounded assets", () => {
  const restored = reassemblePaladinHealerLibraryShards(packed);
  assert.equal(packed.assets.size, 20);
  assert(packed.indexRef.bytes < 200_000);
  assert([...packed.assets.values()].every((bytes) => bytes.length <= 8_000_000));
  assert.equal(sha(originalBytes), fixture.libraryRef.byteSha256);
  assert.equal(JSON.stringify(restored) + "\n", originalBytes.toString());
  assert.equal(restored.configurations.length, 504);
  assert.equal(restored.workloads.length, 330);
  assert.equal(restored.catalog.length, 2243);
});

test("each group payload contains all of its own twenty-eight configurations and required workloads", () => {
  const index = JSON.parse(packed.assets.get(packed.indexRef.file));
  for (const entry of index.groups) {
    const shard = JSON.parse(packed.assets.get(entry.asset.file));
    assert.deepEqual(shard.group, entry.group);
    assert.equal(shard.configurations.length, 28);
    assert(shard.configurations.every((config) => config.groupId === shard.group.id));
    assert.deepEqual(
      new Set(shard.workloads.map((workload) => workload.id)),
      new Set(shard.configurations.map((config) => config.workloadId)),
    );
  }
});

test("valid reordered source arrays preserve their own exact archive identity", () => {
  const reordered = structuredClone(library);
  reordered.configurations.reverse();
  reordered.workloads.reverse();
  const result = reassemblePaladinHealerLibraryShards(createPaladinHealerLibraryShards(reordered));
  assert.equal(JSON.stringify(result), JSON.stringify(reordered));
});

test("missing catalog, missing group and unexpected extra assets are rejected", () => {
  const index = JSON.parse(packed.assets.get(packed.indexRef.file));
  for (const name of [index.catalog.file, index.groups[0].asset.file]) {
    const input = copy();
    input.assets.delete(name);
    assert.throws(() => reassemblePaladinHealerLibraryShards(input));
  }
  const input = copy();
  input.assets.set("unexpected.json", Buffer.from("{}\n"));
  assert.throws(() => reassemblePaladinHealerLibraryShards(input));
});

test("byte tampering and an oversized decoded reference cannot bypass integrity checks", () => {
  const input = copy(),
    index = JSON.parse(input.assets.get(input.indexRef.file));
  const bytes = input.assets.get(index.groups[0].asset.file);
  bytes[bytes.length - 1] = 32;
  assert.throws(() => reassemblePaladinHealerLibraryShards(input));
  const oversized = copy();
  oversized.indexRef.bytes = 8_000_001;
  assert.throws(() => reassemblePaladinHealerLibraryShards(oversized));
});

test("updating shard and index checksums cannot change the bound source archive", () => {
  const input = copy(),
    index = JSON.parse(input.assets.get(input.indexRef.file));
  const catalog = JSON.parse(input.assets.get(index.catalog.file));
  catalog.catalog[0].item.stats[0] += 1;
  index.catalog = replaceAsset(input, index.catalog, catalog);
  replaceIndex(input, index);
  assert.throws(() => reassemblePaladinHealerLibraryShards(input), /archive identity changed/);
});

test("cross-model group payloads and unsafe file names are rejected", () => {
  const input = copy(),
    index = JSON.parse(input.assets.get(input.indexRef.file));
  const entry = index.groups[0],
    shard = JSON.parse(input.assets.get(entry.asset.file));
  shard.modelIdentity = "0".repeat(64);
  entry.asset = replaceAsset(input, entry.asset, shard);
  replaceIndex(input, index);
  assert.throws(() => reassemblePaladinHealerLibraryShards(input));
  const unsafe = copy(),
    unsafeIndex = JSON.parse(unsafe.assets.get(unsafe.indexRef.file));
  unsafeIndex.groups[0].asset.file = "../group.json";
  replaceIndex(unsafe, unsafeIndex);
  assert.throws(() => reassemblePaladinHealerLibraryShards(unsafe));
});

test("duplicate group references and missing configuration order entries are rejected", () => {
  const duplicate = copy(),
    index = JSON.parse(duplicate.assets.get(duplicate.indexRef.file));
  index.groups[1] = index.groups[0];
  replaceIndex(duplicate, index);
  assert.throws(() => reassemblePaladinHealerLibraryShards(duplicate));
  const missing = copy(),
    missingIndex = JSON.parse(missing.assets.get(missing.indexRef.file));
  missingIndex.configurationOrder.pop();
  replaceIndex(missing, missingIndex);
  assert.throws(() => reassemblePaladinHealerLibraryShards(missing));
});

test("partitioning does not grant website publication or extended-fight qualification", () => {
  const index = JSON.parse(packed.assets.get(packed.indexRef.file));
  assert.equal(index.header.scope.durationSeconds, 180);
  assert.equal(index.header.scope.layout, "stacked");
  assert.equal(index.header.scope.fiveMinuteAndSpreadQualification, false);
  assert.equal(index.fullClassQualified, false);
  const input = copy();
  index.publicationAllowed = true;
  replaceIndex(input, index);
  assert.throws(() => reassemblePaladinHealerLibraryShards(input));
});
