import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import console from "node:console";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
assert(args.every((arg) => arg === "--write" || /^--profile=[a-z][a-z_]*$/.test(arg)));
const profileArgs = args.filter((arg) => arg.startsWith("--profile="));
assert.equal(profileArgs.length, 1, "Select exactly one reviewed profile");
const profile = profileArgs[0].slice("--profile=".length);
const directory = join(root, "artifacts/forever-simulator");
const require = createRequire(join(root, ".cache/forever-sim-upstream/package.json"));
const esbuild = require("esbuild");
let built;
try {
  built = await esbuild.build({
    absWorkingDir: root,
    stdin: {
      contents: [
        'export * from "./apps/web/src/lib/forever-simulator-local-reviews.ts";',
        'export * from "./apps/web/src/lib/forever-simulator-presentation.ts";',
        'export * from "./apps/web/src/lib/forever-simulator-published-reviews.ts";',
      ].join("\n"),
      resolveDir: root,
      sourcefile: "simulator-publication-entry.ts",
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    logLevel: "silent",
  });
} finally {
  esbuild.stop();
}
const api = await import(
  "data:text/javascript;base64," + Buffer.from(built.outputFiles[0].contents).toString("base64")
);
const presentation = await api.readSimulatorPresentation(profile, directory);
assert.equal(presentation?.kind, "reviewed-presets", "Missing matching browser approval");
const listing = await api.readLocalSimulatorReviews(directory, true);
const builds = api.buildsForPresentation(
  api.reviewedBuildsForSimulator(listing, presentation.sourceRelease, profile),
  presentation,
  profile,
);
const publication = api.createPublishedSimulatorProfile(presentation, profile, builds);
const sha256 = createHash("sha256").update(JSON.stringify(publication)).digest("hex");
const path = `published-reviews/${profile}-${sha256.slice(0, 16)}.json`;
let previous = { schema: "kfc-published-simulator-reviews.v1", profiles: {} };
try {
  previous = JSON.parse(await readFile(join(directory, "published-reviews.json"), "utf8"));
  assert.equal(previous.schema, "kfc-published-simulator-reviews.v1");
  assert(
    previous.profiles && typeof previous.profiles === "object" && !Array.isArray(previous.profiles),
  );
  assert.deepEqual(Object.keys(previous).sort(), ["profiles", "schema"]);
  for (const [name, entry] of Object.entries(previous.profiles)) {
    assert(/^[a-z][a-z_]*$/.test(name));
    assert(entry && typeof entry === "object" && !Array.isArray(entry));
    assert.deepEqual(Object.keys(entry).sort(), ["path", "sha256"]);
    assert(typeof entry.sha256 === "string" && /^[a-f0-9]{64}$/.test(entry.sha256));
    assert.equal(entry.path, `published-reviews/${name}-${entry.sha256.slice(0, 16)}.json`);
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const pointer = {
  schema: "kfc-published-simulator-reviews.v1",
  profiles: { ...previous.profiles, [profile]: { path, sha256 } },
};
if (args.includes("--write")) {
  await mkdir(join(directory, "published-reviews"), { recursive: true });
  const bytes = JSON.stringify(publication, null, 2) + "\n";
  try {
    await writeFile(join(directory, path), bytes, { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    assert.deepEqual(JSON.parse(await readFile(join(directory, path), "utf8")), publication);
  }
  const temporary = join(directory, `published-reviews.${process.pid}.tmp`);
  await writeFile(temporary, JSON.stringify(pointer, null, 2) + "\n", { flag: "wx" });
  await rename(temporary, join(directory, "published-reviews.json"));
  assert.deepEqual(
    await api.readPublishedSimulatorReviews(presentation, profile, directory),
    publication.builds,
  );
}
console.log(
  JSON.stringify({
    status: args.includes("--write") ? "reviewed-profile-published-locally" : "publication-plan",
    profile,
    sourceRelease: presentation.sourceRelease,
    presentationRelease: presentation.manifest.release,
    path,
    sha256,
    builds: builds.map(
      ({ id, referenceDps, validationIterations, requiresProvisionalEnchantOptIn }) => ({
        id,
        referenceDps,
        validationIterations: validationIterations ?? 400000,
        requiresProvisionalEnchantOptIn,
      }),
    ),
    nativeJobs: 0,
    browserJobs: 0,
  }),
);
