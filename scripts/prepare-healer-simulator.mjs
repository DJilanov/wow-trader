import assert from "node:assert/strict";
import console from "node:console";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import {
  anyHealerLibrarySchema,
  anyHealerReleaseSchema,
} from "../packages/forever-data/dist/healer-workspace.js";

const root = resolve(import.meta.dirname, ".."),
  sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const names = [
  "library.json",
  "healing.wasm",
  "healing-worker.js",
  "request-codec.js",
  "wasm_exec.js",
];
async function verified(ref, allowInternalSymlink = false) {
  assert(
    ref && typeof ref.path === "string" && /^[a-f0-9]{64}$/.test(ref.sha256),
    "Missing healer source pin",
  );
  assert(
    !isAbsolute(ref.path) &&
      !ref.path.split(/[\\/]/).some((part) => !part || part === "." || part === ".."),
    "Invalid healer source path",
  );
  const path = join(root, ref.path),
    canonical = await realpath(path);
  assert(canonical.startsWith(root + sep), "Healer inputs escaped the workspace");
  if (!allowInternalSymlink)
    assert.equal(canonical, path, "Healer release files cannot contain symlinks");
  assert((await stat(path)).size <= (allowInternalSymlink ? 2 * 1024 ** 3 : 128 * 1024 ** 2));
  if (allowInternalSymlink) {
    const digest = createHash("sha256");
    for await (const chunk of createReadStream(path)) digest.update(chunk);
    assert.equal(digest.digest("hex"), ref.sha256, ref.path);
    return;
  }
  const bytes = await readFile(path);
  assert.equal(sha(bytes), ref.sha256, ref.path);
  return bytes;
}
/** @param {{inputPath:string,directory?:string,activate?:boolean,reviewPath?:string}} options
 * @returns {Promise<{release:string,directory:string,active:boolean,builds:number,items:number,modelIdentity:string}>}
 */
export async function prepareHealerSimulator({
  inputPath,
  directory,
  activate = false,
  reviewPath,
}) {
  assert.equal(typeof inputPath, "string", "Pass the reviewed healer delivery with --input");
  const inputBytes = await readFile(resolve(root, inputPath));
  assert(inputBytes.length <= 8_000_000);
  const input = JSON.parse(inputBytes);
  assert.equal(input.schema, "kfc-healer-browser-input.v1");
  assert.deepEqual(Object.keys(input.files).sort(), names.slice().sort());
  assert(
    Array.isArray(input.sourcePins) &&
      input.sourcePins.length > 0 &&
      input.sourcePins.length <= 20000,
    "Healer source inventory must contain 1–20000 pins",
  );
  assert.equal(
    new Set(input.sourcePins.map((ref) => ref?.path)).size,
    input.sourcePins.length,
    "Duplicate healer source path",
  );
  for (const ref of input.sourcePins) await verified(ref, true);
  const files = {},
    encodings = {},
    contents = new Map();
  for (const name of names) {
    const bytes = await verified(input.files[name]);
    files[name] = { bytes: bytes.length, sha256: sha(bytes) };
    contents.set(name, bytes);
    const br = brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }),
      gzip = gzipSync(bytes, { level: 9 });
    contents.set(name + ".br", br);
    contents.set(name + ".gz", gzip);
    encodings[name] = {
      br: { bytes: br.length, sha256: sha(br) },
      gzip: { bytes: gzip.length, sha256: sha(gzip) },
    };
  }
  const library = anyHealerLibrarySchema.parse(JSON.parse(contents.get("library.json")));
  assert.equal(library.modelIdentity, input.modelIdentity);
  const targetDirectory = resolve(
    directory ??
      join(
        process.env.FOREVER_SIMULATOR_ROOT || join(root, "artifacts/forever-simulator"),
        "healing",
        ...(library.profile === "healing-priest" ? [] : [library.profile]),
      ),
  );
  const release = sha(
      JSON.stringify({ modelIdentity: input.modelIdentity, files, encodings }),
    ).slice(0, 24),
    manifest = anyHealerReleaseSchema.parse({
      schema: "kfc-healer-browser-release.v1",
      release,
      modelIdentity: input.modelIdentity,
      profile: library.profile,
      preparedAt: library.preparedAt,
      files,
      encodings,
    }),
    folder = join(targetDirectory, release),
    manifestBytes = JSON.stringify(manifest, null, 2) + "\n";
  await mkdir(dirname(folder), { recursive: true });
  try {
    const existing = JSON.parse(await readFile(join(folder, "manifest.json")));
    assert.deepEqual(existing, manifest, "Existing healer release changed");
    for (const [name, bytes] of contents)
      assert.equal(sha(await readFile(join(folder, name))), sha(bytes), name);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const pending = join(targetDirectory, ".pending-" + randomUUID());
    await mkdir(pending);
    for (const [name, bytes] of contents)
      await writeFile(join(pending, name), bytes, { flag: "wx" });
    await writeFile(join(pending, "manifest.json"), manifestBytes, { flag: "wx" });
    await rename(pending, folder);
  }
  if (activate) {
    assert(reviewPath, "Activation requires the actual workspace browser review");
    const review = JSON.parse(await readFile(resolve(root, reviewPath)));
    assert.equal(review.schema, "kfc-healer-workspace-browser-review.v1");
    assert.equal(review.release, release);
    assert.equal(review.modelIdentity, manifest.modelIdentity);
    assert.equal(review.status, "passed");
    assert.equal(review.manifestSha256, sha(manifestBytes));
    assert(
      review.simulationCompleted &&
        review.stopWorked &&
        review.gearEditingWorked &&
        review.talentEditingWorked &&
        review.raceEditingWorked,
    );
    const path = join(targetDirectory, ".active-" + randomUUID() + ".json");
    await writeFile(path, manifestBytes, { flag: "wx" });
    await rename(path, join(targetDirectory, "active.json"));
  }
  return {
    release,
    directory: folder,
    active: activate,
    builds: library.builds.length,
    items: library.items.length,
    modelIdentity: library.modelIdentity,
  };
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      directory: { type: "string" },
      activate: { type: "boolean", default: false },
      review: { type: "string" },
    },
  });
  prepareHealerSimulator({
    inputPath: values.input,
    directory: values.directory,
    activate: values.activate,
    reviewPath: values.review,
  })
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
