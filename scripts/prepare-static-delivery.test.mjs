import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { URL } from "node:url";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { SIMULATOR_REVISION, SIMULATOR_SPECS } from "../packages/forever-data/dist/simulator.js";
import {
  isPublicDeliveryAsset,
  prepareStaticDelivery,
  staticDeliveryNginx,
} from "./prepare-static-delivery.mjs";
import { verifyStaticDelivery } from "./verify-static-delivery.mjs";

const checksum = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "kfc-static-delivery-test-")),
    source = join(root, "source"),
    release = "a".repeat(24),
    folder = join(source, release),
    bytes = Buffer.from("synthetic compression fixture; not executable WASM\n".repeat(1000));
  await mkdir(folder, { recursive: true });
  const contents = {
    "lib.wasm": bytes,
    "copy.json": bytes,
    "image.jpg": bytes,
    "warrior/index.html": Buffer.from("private adapted HTML"),
    "kfc-reviewed-presets.json": Buffer.from("private proof"),
    "kfc-preset-safety.json": Buffer.from("private proof2"),
    "kfc-optimized-tank-profile.json": Buffer.from("private tank proof"),
    "kfc-tank-browser-research.json": Buffer.from("private research proof"),
    ["tank-measurements/" + "a".repeat(64) + ".json"]: Buffer.from("private measurements"),
  };
  for (const [name, data] of Object.entries(contents)) {
    await mkdir(join(folder, name, ".."), { recursive: true });
    await writeFile(join(folder, name), data);
  }
  const manifest = {
    schema: "kfc-forever-simulator.v1",
    release,
    upstream: "https://github.com/gunba/wow-forever-sim",
    revision: SIMULATOR_REVISION,
    preparedAt: "2026-10-21T00:00:00Z",
    itemCount: 1,
    excludedModeledItems: 0,
    pages: SIMULATOR_SPECS.map((s) => s.page),
    files: Object.fromEntries(
      Object.entries(contents).map(([name, data]) => [
        name,
        { bytes: data.length, sha256: checksum(data) },
      ]),
    ),
    dataProvenance: "pinned-upstream-forever-data",
    mechanicsStatus: "beta_model",
  };
  await writeFile(join(folder, "manifest.json"), JSON.stringify(manifest));
  return { root, source, release, folder, bytes, manifest, output: join(root, "delivery") };
}

test("public inventory refuses internal proofs, HTML, maps, hidden files, traversal and compressed sidecars", () => {
  for (const name of [
    "../secret.json",
    ".env",
    "bundle/.secret.js",
    "warrior/index.html",
    "kfc-reviewed-presets.json",
    "kfc-preset-safety.json",
    "manifest.json",
    "kfc-optimized-tank-profile.json",
    "kfc-tank-browser-research.json",
    "tank-measurements/example.json",
    "bundle/source.js.map",
    "lib.wasm.gz",
    "lib.wasm.br",
    "a\\b.js",
  ])
    assert.equal(isPublicDeliveryAsset(name), false, name);
  for (const name of [
    "lib.wasm",
    "assets/database/db.bin",
    "bundle/index-test.chunk.js",
    "kfc-workspace.css",
    "kfc-tank-native-builds.json",
    "kfc-tank-native-library.js",
    "vendor/fonts/inter.woff2",
  ])
    assert.equal(isPublicDeliveryAsset(name), true, name);
});

test("automatic staging follows selected models and ignores incomplete, unselected historical directories", async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.source, "b".repeat(24)));
    await writeFile(
      join(f.source, "model-update.json"),
      JSON.stringify({
        schema: "kfc-simulator-model-update-selection.v1",
        release: f.release,
        sourceRelease: f.release,
      }),
    );
    await writeFile(
      join(f.source, "profile-model-updates.json"),
      JSON.stringify({
        schema: "kfc-simulator-profile-model-selection.v1",
        profiles: {
          mage: { release: f.release, sourceRelease: f.release },
        },
      }),
    );
    const options = { simulatorRoot: f.source, output: f.output };
    assert.deepEqual(
      (await prepareStaticDelivery(options)).manifestPins.map((row) => row.release),
      [f.release],
    );
    await assert.rejects(prepareStaticDelivery({ ...options, releases: ["b".repeat(24)] }), {
      code: "ENOENT",
    });
    await writeFile(
      join(f.source, "profile-model-updates.json"),
      JSON.stringify({
        schema: "kfc-simulator-profile-model-selection.v1",
        profiles: {
          mage: { release: "b".repeat(24), sourceRelease: f.release },
        },
      }),
    );
    await assert.rejects(prepareStaticDelivery(options), { code: "ENOENT" });
    await writeFile(
      join(f.source, "profile-model-updates.json"),
      JSON.stringify({
        schema: "kfc-simulator-profile-model-selection.v1",
        profiles: {
          mage: { release: "../private", sourceRelease: f.release },
        },
      }),
    );
    await assert.rejects(prepareStaticDelivery(options), /Invalid selected release/);
    await assert.rejects(lstat(f.output), { code: "ENOENT" });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("automatic staging includes all optimized tank models and refuses partial selections", async () => {
  const f = await fixture();
  try {
    const release = "c".repeat(24);
    await mkdir(join(f.source, release));
    await writeFile(
      join(f.source, release, "manifest.json"),
      JSON.stringify({ ...f.manifest, release, files: {} }),
    );
    await writeFile(
      join(f.source, "model-update.json"),
      JSON.stringify({
        schema: "kfc-simulator-model-update-selection.v1",
        release: f.release,
        sourceRelease: f.release,
      }),
    );
    const selected = {
      release,
      proofSha256: "d".repeat(64),
      browserReview: { path: `tank-browser-reviews/${release}.json`, sha256: "e".repeat(64) },
    };
    const pointer = {
      schema: "kfc-optimized-tank-selection.v1",
      sourceRelease: f.release,
      engine: "f".repeat(64),
      profiles: {
        tank_warrior: selected,
        feral_tank_druid: selected,
        protection_paladin: selected,
      },
    };
    await writeFile(join(f.source, "tank-model-updates.json"), JSON.stringify(pointer));
    const options = { simulatorRoot: f.source, output: f.output };
    assert.deepEqual(
      (await prepareStaticDelivery(options)).manifestPins.map((row) => row.release),
      [f.release, release],
    );
    delete pointer.profiles.protection_paladin;
    await writeFile(join(f.source, "tank-model-updates.json"), JSON.stringify(pointer));
    await assert.rejects(prepareStaticDelivery(options), /Incomplete selected tank profiles/);
    pointer.profiles.protection_paladin = { ...selected, release: "../private" };
    await writeFile(join(f.source, "tank-model-updates.json"), JSON.stringify(pointer));
    await assert.rejects(prepareStaticDelivery(options), /Invalid selected tank release/);
    await assert.rejects(lstat(f.output), { code: "ENOENT" });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("production and isolated Nginx includes cannot load the standalone smoke configuration inside a server block", async () => {
  const apex = await readFile(
      new URL("../infra/nginx/kfcguild.online.conf", import.meta.url),
      "utf8",
    ),
    smoke = await readFile(
      new URL("../infra/nginx/static-delivery-smoke.conf", import.meta.url),
      "utf8",
    );
  assert.match(apex, /current\/nginx-locations\*\.conf;/);
  assert.match(smoke, /include nginx-locations\*\.conf;/);
  assert.doesNotMatch(apex, /current\/nginx-\*\.conf;/);
  assert.equal(/^nginx-locations.*\.conf$/.test("nginx-locations.conf"), true);
  assert.equal(/^nginx-locations.*\.conf$/.test("nginx-smoke.conf"), false);
});

test("dry-run writes nothing; prepared variants decompress to the original hash and frozen inputs remain unchanged", async () => {
  const f = await fixture();
  try {
    const before = await readFile(join(f.folder, "manifest.json")),
      opts = { simulatorRoot: f.source, output: f.output };
    const plan = await prepareStaticDelivery(opts);
    assert.equal(plan.filesystemWrites, 0);
    await assert.rejects(lstat(f.output), { code: "ENOENT" });
    const result = await prepareStaticDelivery({ ...opts, prepare: true });
    assert.equal(result.activated, false);
    const report = JSON.parse(await readFile(join(f.output, "completed.json")));
    assert.equal(report.files.length, 3);
    for (const name of ["lib.wasm", "copy.json"]) {
      const file = join(f.output, "public/forever-sim", f.release, name);
      assert.deepEqual(await readFile(file), f.bytes);
      assert.deepEqual(gunzipSync(await readFile(file + ".gz")), f.bytes);
      assert.deepEqual(brotliDecompressSync(await readFile(file + ".br")), f.bytes);
    }
    for (const name of [
      "warrior/index.html",
      "manifest.json",
      "kfc-reviewed-presets.json",
      "kfc-preset-safety.json",
      "kfc-optimized-tank-profile.json",
      "kfc-tank-browser-research.json",
      "tank-measurements/" + "a".repeat(64) + ".json",
      "image.jpg.gz",
      "image.jpg.br",
    ])
      await assert.rejects(lstat(join(f.output, "public/forever-sim", f.release, name)), {
        code: "ENOENT",
      });
    assert.deepEqual(await readFile(join(f.folder, "manifest.json")), before);
    assert.deepEqual(await readFile(join(f.folder, "lib.wasm")), f.bytes);
    const verified = await verifyStaticDelivery(f.output);
    assert.equal(verified.status, "static-delivery-verified");
    assert.equal(verified.checked, 3);
    assert.equal(verified.variants, 4);
    await writeFile(
      join(f.output, "public/forever-sim", f.release, "lib.wasm.gz"),
      "corrupted delivery fixture",
    );
    await assert.rejects(verifyStaticDelivery(f.output));
    await assert.rejects(
      prepareStaticDelivery({ ...opts, prepare: true }),
      /existing outputs are never overwritten/,
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("restricted source permissions are copied rather than changed through a hardlink", async () => {
  const f = await fixture();
  try {
    const path = join(f.folder, "lib.wasm");
    await chmod(path, 0o600);
    await prepareStaticDelivery({ simulatorRoot: f.source, output: f.output, prepare: true });
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.equal(
      (await stat(join(f.output, "public/forever-sim", f.release, "lib.wasm"))).mode & 0o777,
      0o644,
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("new delivery stages retain old hashed Next chunks so existing tabs keep their immutable URLs", async () => {
  const f = await fixture();
  try {
    const oldStatic = join(f.root, "old-static"),
      newStatic = join(f.root, "new-static");
    await mkdir(oldStatic);
    await mkdir(newStatic);
    await writeFile(join(oldStatic, "old-hash.js"), "export const oldFixture = true;");
    await writeFile(join(newStatic, "new-hash.js"), "export const newFixture = true;");
    await prepareStaticDelivery({ helperStatic: oldStatic, output: f.output, prepare: true });
    const next = join(f.root, "next-delivery");
    await prepareStaticDelivery({
      helperStatic: newStatic,
      previousDelivery: f.output,
      output: next,
      prepare: true,
    });
    for (const name of ["old-hash.js", "new-hash.js"])
      assert((await readFile(join(next, "public/tools/_next/static", name))).length > 0);
    assert.equal((await verifyStaticDelivery(next)).checked, 2);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("tampered assets, escaped symlinks and overlapping outputs fail closed", async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      prepareStaticDelivery({
        simulatorRoot: f.source,
        output: join(f.source, "bad"),
        prepare: true,
      }),
      /overlaps/,
    );
    await writeFile(join(f.folder, "lib.wasm"), Buffer.alloc(f.bytes.length, 1));
    await assert.rejects(
      prepareStaticDelivery({ simulatorRoot: f.source, output: f.output, prepare: true }),
      /checksum changed/,
    );
    await assert.rejects(lstat(join(f.output, "completed.json")), { code: "ENOENT" });
    await rm(join(f.folder, "lib.wasm"));
    await writeFile(join(f.root, "outside.wasm"), f.bytes);
    await symlink(join(f.root, "outside.wasm"), join(f.folder, "lib.wasm"));
    await assert.rejects(
      prepareStaticDelivery({
        simulatorRoot: f.source,
        output: join(f.root, "other"),
        prepare: true,
      }),
      /escaped/,
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("Next static mirrors expose only approved files and generate scoped Nginx fallbacks without serving adapted HTML", async () => {
  const f = await fixture();
  try {
    const helper = join(f.root, "helper"),
      guild = join(f.root, "guild");
    await mkdir(join(helper, "chunks"), { recursive: true });
    await mkdir(guild);
    await writeFile(join(helper, "chunks/test.js"), "export const fixture = true;".repeat(500));
    await writeFile(join(helper, ".env"), "not public");
    await writeFile(join(guild, "test.css"), "body {}".repeat(500));
    await prepareStaticDelivery({
      helperStatic: helper,
      guildStatic: guild,
      output: f.output,
      prepare: true,
    });
    assert((await readFile(join(f.output, "public/tools/_next/static/chunks/test.js"))).length > 0);
    await assert.rejects(lstat(join(f.output, "public/tools/_next/static/.env")), {
      code: "ENOENT",
    });
    const config = await readFile(join(f.output, "nginx-locations.conf"), "utf8");
    assert.match(config, /location \^~ \/tools\/_next\/static\//);
    assert.match(config, /location \^~ \/_next\/static\//);
    assert.match(config, /19210/);
    assert.match(config, /19200/);
    assert.match(config, /gzip_static on/);
    assert.doesNotMatch(config, /gzip_static always/);
    assert.match(config, /limit_req zone=kfc_tools_search_crawlers burst=10 nodelay;/);
    const simulator = staticDeliveryNginx("/tmp/safe/public", { simulator: true });
    assert.match(simulator, /include \/etc\/nginx\/mime\.types;/);
    assert.doesNotMatch(simulator, /html\|/);
    assert.match(simulator, /rewrite \^\/forever-sim/);
    assert.match(simulator, /limit_req zone=kfc_tools_search_crawlers burst=10 nodelay;/);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
