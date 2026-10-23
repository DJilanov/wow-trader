import assert from "node:assert/strict";
import console from "node:console";
import { constants, createReadStream } from "node:fs";
import {
  copyFile,
  link,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import { pathToFileURL, URL } from "node:url";
import { simulatorManifestSchema } from "../packages/forever-data/dist/simulator.js";

const profiles = ["tank_warrior", "feral_tank_druid", "protection_paladin"],
  releasePattern = /^[a-f0-9]{24}$/,
  digestPattern = /^[a-f0-9]{64}$/,
  pointerNames = [
    "active.json",
    "model-update.json",
    "profile-model-updates.json",
    "published-reviews.json",
  ],
  ownFiles = new Set(["tank-model-updates.json", "optimized-tank-staging.json"]),
  sha = (value) => createHash("sha256").update(value).digest("hex"),
  hash = (value) => sha(JSON.stringify(value));
function inside(root, path) {
  const offset = relative(root, path);
  return offset && offset !== ".." && !offset.startsWith("../") && !isAbsolute(offset);
}
async function resolveOutput(path) {
  let current = resolve(path);
  const suffix = [];
  for (;;) {
    try {
      return resolve(await realpath(current), ...suffix.toReversed());
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const parent = dirname(current);
      assert(parent !== current, "No existing output ancestor");
      suffix.push(basename(current));
      current = parent;
    }
  }
}
async function digest(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
async function document(root, name, limit = 8_000_000) {
  const target = await realpath(resolve(root, name));
  assert(inside(root, target), "Evidence escaped its source directory");
  const info = await stat(target);
  assert(info.isFile() && info.size <= limit, "Invalid evidence size");
  const bytes = await readFile(target);
  assert(bytes.length <= limit);
  return { bytes, value: JSON.parse(bytes.toString("utf8")), sha256: sha(bytes) };
}
async function copyFrozenFile(source, target) {
  await mkdir(dirname(target), { recursive: true });
  try {
    await link(source, target);
  } catch (error) {
    if (error.code !== "EXDEV") throw error;
    await copyFile(source, target, constants.COPYFILE_EXCL);
  }
}
async function copyTree(source, target, depth = 0) {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (depth === 0 && ownFiles.has(entry.name)) continue;
    assert(!entry.isSymbolicLink(), "Runtime staging refuses source symlinks");
    const from = join(source, entry.name),
      to = join(target, entry.name);
    if (entry.isDirectory()) {
      await mkdir(to);
      await copyTree(from, to, depth + 1);
    } else {
      assert(entry.isFile(), "Runtime staging accepts regular files only");
      await copyFrozenFile(from, to);
    }
  }
}
async function mergeFile(source, target, expected) {
  const info = await lstat(source);
  assert(info.isFile(), "Release assets must be regular files");
  assert.equal(info.size, expected.bytes, "Release asset size changed");
  assert.equal(await digest(source), expected.sha256, "Release asset checksum changed");
  const existing = await lstat(target).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (existing) {
    assert(
      existing.isFile() && existing.size === expected.bytes,
      "Existing asset conflicts with approved release",
    );
    assert.equal(
      await digest(target),
      expected.sha256,
      "Existing asset conflicts with approved release",
    );
  } else await copyFrozenFile(source, target);
}
async function mergeRelease(source, output) {
  const raw = await document(source, "manifest.json"),
    manifest = simulatorManifestSchema.parse(raw.value);
  assert.equal(manifest.release, source.split(/[\\/]/).at(-1));
  const destination = join(output, manifest.release);
  await mkdir(destination, { recursive: true });
  const entries = Object.entries(manifest.files);
  for (let start = 0; start < entries.length; start += 16) {
    const results = await Promise.allSettled(
      entries.slice(start, start + 16).map(async ([name, expected]) => {
        assert(
          !name.includes("\\") && !isAbsolute(name) && inside(source, resolve(source, name)),
          "Invalid manifest asset path",
        );
        const path = await realpath(resolve(source, name));
        assert(inside(source, path), "Release asset escaped its source directory");
        assert.equal(path, resolve(source, name), "Release assets cannot use symlinked paths");
        await mergeFile(path, resolve(destination, name), expected);
      }),
    );
    for (const result of results) if (result.status === "rejected") throw result.reason;
  }
  await mergeFile(join(source, "manifest.json"), join(destination, "manifest.json"), {
    bytes: raw.bytes.length,
    sha256: raw.sha256,
  });
}

/** Builds a separate review root. It never edits the source runtime or selects a production model. */
export async function stageOptimizedTankSelection({
  sourceRoot,
  deliveryRoot,
  researchRoot,
  selectedProfiles,
  output,
}) {
  const source = await realpath(resolve(sourceRoot)),
    deliveries = await realpath(resolve(deliveryRoot)),
    research = await realpath(resolve(researchRoot)),
    target = await resolveOutput(output);
  for (const input of [source, deliveries, research])
    assert(
      target !== input && !inside(input, target) && !inside(target, input),
      "Staging output overlaps an input",
    );
  assert.deepEqual(
    Object.keys(selectedProfiles).sort(),
    [...profiles].sort(),
    "All three selected tank profiles are required",
  );
  const original = Object.fromEntries(
      await Promise.all(
        pointerNames.map(async (name) => [name, await readFile(join(source, name))]),
      ),
    ),
    globalSelection = JSON.parse(original["model-update.json"].toString("utf8"));
  assert.equal(globalSelection.schema, "kfc-simulator-model-update-selection.v1");
  const packages = [],
    parents = new Set(),
    selection = {
      schema: "kfc-optimized-tank-selection.v1",
      sourceRelease: "",
      engine: "",
      profiles: {},
    };
  for (const profile of profiles) {
    const release = selectedProfiles[profile];
    assert(
      typeof release === "string" && releasePattern.test(release),
      "Invalid selected tank release",
    );
    const directory = await realpath(join(deliveries, release));
    assert(inside(deliveries, directory), "Selected tank delivery escaped storage");
    const proof = await document(directory, "kfc-optimized-tank-profile.json", 4_000_000),
      value = proof.value,
      review = await document(directory, "browser-review.json");
    assert.equal(value.schema, "kfc-optimized-tank-profile.v1");
    assert.equal(value.status, "staged-awaiting-default-and-preset-review");
    assert.equal(value.profile, profile);
    assert.equal(value.release, release);
    assert.equal(hash(value.inputs).slice(0, 24), release, "Tank release identity changed");
    assert(
      digestPattern.test(value.engine) &&
        releasePattern.test(value.sourceRelease) &&
        releasePattern.test(value.researchRelease),
    );
    assert.equal(
      value.sourceRelease,
      globalSelection.release,
      "The numerical source no longer matches the current global presentation",
    );
    if (!selection.sourceRelease) {
      selection.sourceRelease = value.sourceRelease;
      selection.engine = value.engine;
    }
    assert.equal(value.sourceRelease, selection.sourceRelease);
    assert.equal(value.engine, selection.engine, "Tank profiles use different numerical engines");
    assert.equal(review.value.schema, "kfc-optimized-tank-browser-review.v1");
    assert.equal(review.value.status, "passed");
    assert.equal(review.value.release, release);
    assert.equal(review.value.profile, profile);
    assert.equal(review.value.proofSha256, proof.sha256);
    assert.equal(review.value.pointerWrites, 0);
    const gates = [
      "freshDefault",
      "everyPreset",
      "exactCombatRequest",
      "browserNativeParity",
      "customCharacterPreserved",
      "explicitImportPreserved",
      "provisionalConsentOff",
      "desktopMobile",
      "noLegacyPresetCopy",
    ];
    for (const gate of gates)
      assert.equal(review.value.gates?.[gate], true, "Incomplete tank browser approval: " + gate);
    const manifest = (await document(directory, "manifest.json")).value;
    assert.equal(manifest.files["kfc-optimized-tank-profile.json"]?.sha256, proof.sha256);
    selection.profiles[profile] = {
      release,
      proofSha256: proof.sha256,
      browserReview: { path: `tank-browser-reviews/${release}.json`, sha256: hash(review.value) },
    };
    packages.push({ directory, proof, review, release });
    parents.add(value.researchRelease);
    await document(source, `${value.sourceRelease}/manifest.json`);
    const parent = await realpath(join(research, value.researchRelease));
    assert(inside(research, parent), "Tank research parent escaped storage");
    assert.equal(
      hash((await document(parent, "manifest.json")).value),
      value.sourceManifestSha256,
      "Tank research parent changed",
    );
  }
  await mkdir(dirname(target), { recursive: true });
  await mkdir(target);
  try {
    await copyTree(source, target);
    for (const release of parents) await mergeRelease(join(research, release), target);
    for (const item of packages) {
      await mergeRelease(item.directory, target);
      const name = selection.profiles[item.proof.value.profile].browserReview.path;
      await mergeFile(join(item.directory, "browser-review.json"), join(target, name), {
        bytes: item.review.bytes.length,
        sha256: item.review.sha256,
      });
    }
    await writeFile(
      join(target, "tank-model-updates.json"),
      JSON.stringify(selection, null, 2) + "\n",
      { flag: "wx" },
    );
    for (const [name, bytes] of Object.entries(original)) {
      assert.deepEqual(
        await readFile(join(source, name)),
        bytes,
        "Source selection changed during staging",
      );
      assert.deepEqual(
        await readFile(join(target, name)),
        bytes,
        "Staging changed an unrelated selection",
      );
    }
    const receipt = {
      schema: "kfc-optimized-tank-staging.v1",
      status: "staged-awaiting-runtime-reader-and-public-browser-review",
      output: target,
      engine: selection.engine,
      selectionSha256: hash(selection),
      profiles: selectedProfiles,
      preservedSelections: Object.fromEntries(
        Object.entries(original).map(([name, bytes]) => [name, sha(bytes)]),
      ),
      sourceSha256: sha(await readFile(new URL(import.meta.url))),
      stagedAt: new Date().toISOString(),
      productionPointerWrites: 0,
    };
    await writeFile(
      join(target, "optimized-tank-staging.json"),
      JSON.stringify(receipt, null, 2) + "\n",
      { flag: "wx" },
    );
    return receipt;
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(await realpath(resolve(process.argv[1]))).href
) {
  const { values } = parseArgs({
    options: {
      "source-root": { type: "string" },
      output: { type: "string" },
      warrior: { type: "string" },
      bear: { type: "string" },
      paladin: { type: "string" },
    },
    strict: true,
  });
  assert(
    values["source-root"] && values.output && values.warrior && values.bear && values.paladin,
    "Supply --source-root=<current runtime> --output=<new review root> --warrior=<release> --bear=<release> --paladin=<release>",
  );
  const base = resolve(
    import.meta.dirname,
    "../artifacts/forever-simulator/optimization/tank-item-search-v1",
  );
  const receipt = await stageOptimizedTankSelection({
    sourceRoot: values["source-root"],
    deliveryRoot: join(base, "deliveries"),
    researchRoot: join(base, "browser-models"),
    output: values.output,
    selectedProfiles: {
      tank_warrior: values.warrior,
      feral_tank_druid: values.bear,
      protection_paladin: values.paladin,
    },
  });
  console.log(JSON.stringify(receipt));
}
