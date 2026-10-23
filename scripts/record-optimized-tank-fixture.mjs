import assert from "node:assert/strict";
import console from "node:console";
import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";

const { values } = parseArgs({
  options: { "runtime-root": { type: "string" }, output: { type: "string" } },
  strict: true,
});
assert(
  values["runtime-root"] && values.output,
  "Supply --runtime-root=<real staged runtime> --output=<fixture.json.gz>",
);
const root = await realpath(resolve(values["runtime-root"])),
  outputParent = await realpath(dirname(resolve(values.output))),
  output = join(outputParent, basename(values.output)),
  offset = relative(root, output),
  sha = (bytes) => createHash("sha256").update(bytes).digest("hex"),
  hash = (value) => sha(JSON.stringify(value));
assert(
  output.endsWith(".json.gz") &&
    (offset === ".." || offset.startsWith("../") || isAbsolute(offset)),
  "Fixture output must be outside the runtime",
);
const existing = await lstat(output).catch((error) => {
  if (error.code === "ENOENT") return null;
  throw error;
});
assert(!existing || existing.isFile(), "Fixture output must be a regular file");
const documents = {};
async function record(name, expected) {
  const path = await realpath(resolve(root, name)),
    offset = relative(root, path);
  assert(offset && offset !== ".." && !offset.startsWith("../") && !isAbsolute(offset));
  const info = await stat(path);
  assert(info.isFile() && info.size <= 8_000_000);
  const bytes = await readFile(path);
  if (expected) {
    assert.equal(bytes.length, expected.bytes);
    assert.equal(sha(bytes), expected.sha256);
  }
  const value = JSON.parse(bytes.toString("utf8"));
  documents[name] = value;
  return { value, sha256: sha(bytes) };
}
const pointer = (await record("tank-model-updates.json")).value,
  profiles = {};
assert.equal(pointer.schema, "kfc-optimized-tank-selection.v1");
assert.deepEqual(Object.keys(pointer.profiles).sort(), [
  "feral_tank_druid",
  "protection_paladin",
  "tank_warrior",
]);
const selectionSha256 = hash(pointer);
await record("active.json");
for (const [profile, selected] of Object.entries(pointer.profiles)) {
  const release = selected.release;
  assert(/^[a-f0-9]{24}$/.test(release));
  profiles[profile] = release;
  const manifest = (await record(`${release}/manifest.json`)).value;
  const proof = await record(
    `${release}/kfc-optimized-tank-profile.json`,
    manifest.files["kfc-optimized-tank-profile.json"],
  );
  assert.equal(proof.sha256, selected.proofSha256);
  assert.equal(proof.value.profile, profile);
  assert.equal(proof.value.release, release);
  assert.equal(proof.value.engine, pointer.engine);
  assert.equal(proof.value.sourceRelease, pointer.sourceRelease);
  const review = (await record(selected.browserReview.path)).value;
  assert.equal(hash(review), selected.browserReview.sha256);
  assert.equal(review.status, "passed");
  assert.equal(review.proofSha256, proof.sha256);
  assert.equal(review.profile, profile);
  assert.equal(review.release, release);
  await record(
    `${release}/kfc-tank-native-builds.json`,
    manifest.files["kfc-tank-native-builds.json"],
  );
  for (const source of proof.value.cases) {
    assert(/^[a-f0-9]{64}$/.test(source.fingerprint));
    const name = `tank-measurements/${source.fingerprint}.json`;
    await record(`${release}/${name}`, manifest.files[name]);
  }
  await record(`${proof.value.sourceRelease}/manifest.json`);
  await record(`${proof.value.researchRelease}/manifest.json`);
}
assert.equal(
  hash((await record("tank-model-updates.json")).value),
  selectionSha256,
  "Selection changed during recording",
);
const bytes = gzipSync(
  JSON.stringify({ schema: "kfc-tank-model-reader-fixture.v2", profiles, documents }) + "\n",
  { level: 9 },
);
const temporary = join(outputParent, `.${basename(output)}.${randomUUID()}.tmp`);
try {
  await writeFile(temporary, bytes, { flag: "wx" });
  await rename(temporary, output);
} finally {
  await rm(temporary, { force: true });
}
console.log(
  JSON.stringify({
    output,
    sha256: sha(bytes),
    bytes: bytes.length,
    profiles,
    documents: Object.keys(documents).length,
    selectionSha256,
  }),
);
