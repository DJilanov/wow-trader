import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { SIMULATOR_REVISION, SIMULATOR_SPECS } from "../packages/forever-data/dist/simulator.js";
import { stageOptimizedTankSelection } from "./stage-optimized-tank-selection.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex"),
  json = (value) => JSON.stringify(value, null, 2) + "\n";
async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), "tank-selection-staging-")),
    sourceRoot = join(root, "source"),
    deliveryRoot = join(root, "deliveries"),
    researchRoot = join(root, "research"),
    output = join(root, "review"),
    sourceRelease = "a".repeat(24),
    researchRelease = "b".repeat(24),
    engine = "e".repeat(64),
    selectedProfiles = {};
  await Promise.all(
    [sourceRoot, deliveryRoot, researchRoot, join(sourceRoot, sourceRelease)].map((path) =>
      mkdir(path, { recursive: true }),
    ),
  );
  const bytes = "synthetic asset staging fixture; not executable WASM",
    metadata = (value) => ({ bytes: Buffer.byteLength(value), sha256: sha(value) });
  const manifest = (release, files) => ({
    schema: "kfc-forever-simulator.v1",
    release,
    upstream: "https://github.com/gunba/wow-forever-sim",
    revision: SIMULATOR_REVISION,
    preparedAt: "2026-10-23T00:00:00Z",
    itemCount: 1,
    excludedModeledItems: 0,
    pages: SIMULATOR_SPECS.map((spec) => spec.page),
    dataProvenance: "pinned-upstream-forever-data",
    mechanicsStatus: "beta_model",
    files,
  });
  const parent = manifest(researchRelease, { "lib.wasm": metadata(bytes) });
  await mkdir(join(researchRoot, researchRelease));
  await writeFile(join(researchRoot, researchRelease, "manifest.json"), json(parent));
  await writeFile(join(researchRoot, researchRelease, "lib.wasm"), bytes);
  const original = {
    "active.json": json(manifest(sourceRelease, {})),
    "model-update.json": json({
      schema: "kfc-simulator-model-update-selection.v1",
      release: sourceRelease,
      sourceRelease: "c".repeat(24),
    }),
    "profile-model-updates.json": json({
      schema: "kfc-simulator-profile-model-selection.v1",
      profiles: { warlock: { release: "d".repeat(24) } },
    }),
    "published-reviews.json": json({ schema: "kfc-published-simulator-reviews.v1", profiles: {} }),
  };
  for (const [name, value] of Object.entries(original))
    await writeFile(join(sourceRoot, name), value);
  await writeFile(join(sourceRoot, sourceRelease, "manifest.json"), original["active.json"]);
  for (const profile of ["tank_warrior", "feral_tank_druid", "protection_paladin"]) {
    const inputs = { profile, engine },
      release = sha(JSON.stringify(inputs)).slice(0, 24),
      directory = join(deliveryRoot, release);
    selectedProfiles[profile] = release;
    // These prove filesystem/selection behavior only; runtime reader approval is a separate mandatory gate.
    const proof = {
      schema: "kfc-optimized-tank-profile.v1",
      status: "staged-awaiting-default-and-preset-review",
      profile,
      release,
      sourceRelease,
      researchRelease,
      engine,
      inputs,
      sourceManifestSha256: sha(JSON.stringify(parent)),
    };
    const review = {
      schema: "kfc-optimized-tank-browser-review.v1",
      status: "passed",
      profile,
      release,
      engine,
      proofSha256: sha(json(proof)),
      pointerWrites: 0,
      gates: Object.fromEntries(
        [
          "freshDefault",
          "everyPreset",
          "exactCombatRequest",
          "browserNativeParity",
          "customCharacterPreserved",
          "explicitImportPreserved",
          "provisionalConsentOff",
          "desktopMobile",
          "noLegacyPresetCopy",
        ].map((name) => [name, true]),
      ),
    };
    await mkdir(directory);
    await writeFile(join(directory, "kfc-optimized-tank-profile.json"), json(proof));
    await writeFile(join(directory, "browser-review.json"), json(review));
    await writeFile(join(directory, "lib.wasm"), bytes);
    await writeFile(
      join(directory, "manifest.json"),
      json(
        manifest(release, {
          "lib.wasm": metadata(bytes),
          "kfc-optimized-tank-profile.json": metadata(json(proof)),
        }),
      ),
    );
  }
  try {
    await run({
      root,
      sourceRoot,
      deliveryRoot,
      researchRoot,
      output,
      selectedProfiles,
      original,
      bytes,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("stages an isolated three-profile review root, preserving every unrelated selection and source asset", async () => {
  await fixture(async (options) => {
    const receipt = await stageOptimizedTankSelection(options);
    assert.equal(receipt.status, "staged-awaiting-runtime-reader-and-public-browser-review");
    assert.equal(receipt.productionPointerWrites, 0);
    for (const [name, value] of Object.entries(options.original)) {
      assert.equal(await readFile(join(options.sourceRoot, name), "utf8"), value);
      assert.equal(await readFile(join(options.output, name), "utf8"), value);
    }
    const selection = JSON.parse(
      await readFile(join(options.output, "tank-model-updates.json"), "utf8"),
    );
    assert.equal(sha(JSON.stringify(selection)), receipt.selectionSha256);
    for (const [profile, release] of Object.entries(options.selectedProfiles)) {
      assert.equal(selection.profiles[profile].release, release);
      assert.equal(
        await readFile(join(options.output, release, "lib.wasm"), "utf8"),
        options.bytes,
      );
      assert.equal(
        (await lstat(join(options.output, release, "lib.wasm"))).ino,
        (await lstat(join(options.deliveryRoot, release, "lib.wasm"))).ino,
      );
    }
    await assert.rejects(lstat(join(options.sourceRoot, "tank-model-updates.json")), {
      code: "ENOENT",
    });
    await assert.rejects(stageOptimizedTankSelection(options), { code: "EEXIST" });
    assert.equal(
      await readFile(join(options.output, "tank-model-updates.json"), "utf8"),
      json(selection),
    );
  });
});

test("rejects partial or cross-profile approvals and a changed global source before creating output", async () => {
  for (const failure of ["partial", "scope", "source"])
    await fixture(async (options) => {
      if (failure === "partial") delete options.selectedProfiles.protection_paladin;
      if (failure === "scope")
        options.selectedProfiles.protection_paladin = options.selectedProfiles.tank_warrior;
      if (failure === "source")
        await writeFile(
          join(options.sourceRoot, "model-update.json"),
          json({ schema: "kfc-simulator-model-update-selection.v1", release: "f".repeat(24) }),
        );
      await assert.rejects(stageOptimizedTankSelection(options));
      await assert.rejects(lstat(options.output), { code: "ENOENT" });
    });
});

test("refuses input/output overlap and source symlinks without deleting source data", async () => {
  await fixture(async (options) => {
    await assert.rejects(
      stageOptimizedTankSelection({ ...options, output: join(options.sourceRoot, "review") }),
      /overlaps/,
    );
    const external = join(options.root, "outside.txt");
    await writeFile(external, "owned boundary-test fixture");
    await symlink(external, join(options.sourceRoot, "escape.txt"));
    await assert.rejects(stageOptimizedTankSelection(options), /symlinks/);
    assert.equal(await readFile(external, "utf8"), "owned boundary-test fixture");
    await assert.rejects(lstat(options.output), { code: "ENOENT" });
  });
});

test("detects changed release assets and missing desktop/mobile consent gates before retaining a draft", async () => {
  for (const failure of ["asset", "approval"])
    await fixture(async (options) => {
      const directory = join(options.deliveryRoot, options.selectedProfiles.tank_warrior);
      if (failure === "asset") await writeFile(join(directory, "lib.wasm"), "changed");
      else {
        const path = join(directory, "browser-review.json"),
          review = JSON.parse(await readFile(path, "utf8"));
        review.gates.provisionalConsentOff = false;
        await writeFile(path, json(review));
      }
      await assert.rejects(
        stageOptimizedTankSelection(options),
        /size changed|checksum changed|Incomplete tank browser/,
      );
      await assert.rejects(lstat(options.output), { code: "ENOENT" });
      for (const [name, value] of Object.entries(options.original))
        assert.equal(await readFile(join(options.sourceRoot, name), "utf8"), value);
    });
});
