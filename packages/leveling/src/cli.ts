import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rename, rm, utimes, writeFile } from "node:fs/promises";
import path from "node:path";

import { compileGuides } from "./compiler.js";
import { THANES_ROUTE, WESTFALL_ROUTE } from "./westfall.js";

async function main(): Promise<void> {
  const repository = path.resolve(import.meta.dirname, "../../..");
  const release = path.join(repository, "artifacts", "leveling", WESTFALL_ROUTE.version);
  const addon = path.join(release, "KFCForeverGuides");
  await mkdir(addon, { recursive: true });
  const compiled = compileGuides([WESTFALL_ROUTE, THANES_ROUTE]);
  const files = {
    "KFCForeverGuides.toc": compiled.toc,
    "Guides.lua": compiled.lua,
    "README.txt": compiled.readme,
    "Observer.lua": await readFile(
      path.join(repository, "apps/addon/KFCForeverGuides/Observer.lua"),
      "utf8",
    ),
  };
  const hashes: Record<string, string> = {};
  for (const [name, contents] of Object.entries(files)) {
    await writeFile(path.join(addon, name), contents);
    await chmod(path.join(addon, name), 0o644);
    const epoch = new Date("2026-01-01T00:00:00.000Z");
    await utimes(path.join(addon, name), epoch, epoch);
    hashes[name] = createHash("sha256").update(contents).digest("hex");
  }
  const zipName = `kfc-forever-guides-${WESTFALL_ROUTE.version}-preview.zip`;
  const temporaryDirectory = await mkdtemp(path.join(release, ".zip-"));
  try {
    const temporaryZip = path.join(temporaryDirectory, zipName);
    execFileSync(
      "zip",
      [
        "-X",
        "-q",
        temporaryZip,
        ...Object.keys(files)
          .sort()
          .map((name) => `KFCForeverGuides/${name}`),
      ],
      { cwd: release, env: { ...process.env, TZ: "UTC" } },
    );
    await rename(temporaryZip, path.join(release, zipName));
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
  const zip = await readFile(path.join(release, zipName));
  await writeFile(
    path.join(release, "manifest.json"),
    JSON.stringify(
      {
        schemaVersion: "kfc-leveling-artifact.v1",
        releaseId: WESTFALL_ROUTE.id,
        version: WESTFALL_ROUTE.version,
        state: "preview",
        clientBuild: WESTFALL_ROUTE.clientBuild,
        restedXpVersion: "v4.11.14",
        routeIds: [WESTFALL_ROUTE.id, THANES_ROUTE.id],
        stepIds: [WESTFALL_ROUTE, THANES_ROUTE].flatMap((route) =>
          route.steps.map((step) => `${route.id}:${step.id}`),
        ),
        files: hashes,
        zip: {
          file: zipName,
          size: zip.length,
          sha256: createHash("sha256").update(zip).digest("hex"),
        },
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `Built ${path.join(release, zipName)} (${zip.length} bytes). Requires an in-game playthrough; no payment access is activated.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Guide build failed");
  process.exitCode = 1;
});
