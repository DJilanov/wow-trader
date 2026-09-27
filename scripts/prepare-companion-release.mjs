import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const packageJsonPath = path.join(repositoryRoot, "apps/desktop/package.json");
const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const version = String(packageJson.version ?? "");
if (!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(version)) {
  throw new Error(`Invalid desktop package version '${version}'`);
}

const sourcePath = path.join(
  repositoryRoot,
  "apps/desktop/out/make",
  `WoW Trader Companion-${version}-x64.dmg`,
);
const releaseRoot = path.resolve(
  process.env.COMPANION_RELEASE_OUTPUT ?? path.join(repositoryRoot, "artifacts/companion-releases"),
);
const releaseDirectory = path.join(releaseRoot, "releases", version);
const filename = `WoW Trader Companion-${version}-macOS-x64.dmg`;
const destinationPath = path.join(releaseDirectory, filename);

await mkdir(releaseDirectory, { recursive: true });
try {
  await copyFile(sourcePath, destinationPath, constants.COPYFILE_EXCL);
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
}

const [sourceHash, destinationHash, file] = await Promise.all([
  sha256(sourcePath),
  sha256(destinationPath),
  stat(destinationPath),
]);
if (sourceHash !== destinationHash) {
  throw new Error(`Existing release artifact does not match ${sourcePath}`);
}

const manifest = {
  schemaVersion: 1,
  version,
  channel: "maintainer-alpha",
  publishedAt: new Date().toISOString(),
  collectorVersion: "0.10.0",
  supportedProducts: ["wow_anniversary", "wow_classic_beta"],
  minimumMacOs: "12",
  notes: [
    "Installs and updates WowTraderCollector for WoW Forever and TBC Anniversary.",
    "Uploads validated native Forever scans after /reload or logout.",
    "Shows an explicit checking state while manual scan reconciliation is running.",
    "Synchronizes build- and realm-specific price history into the addon's Market Intel panel.",
    "Opens the correct Forever or TBC Trader directly from the Companion.",
  ],
  assets: [
    {
      id: "macos-intel-dmg",
      label: "macOS Intel",
      platform: "macos",
      architecture: "x64",
      filename,
      contentType: "application/x-apple-diskimage",
      byteSize: file.size,
      sha256: destinationHash,
      signed: false,
      recommended: true,
    },
  ],
};

await writeFile(path.join(releaseRoot, "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`, {
  encoding: "utf8",
  mode: 0o644,
});
process.stdout.write(
  `Prepared Companion ${version} at ${releaseDirectory}\nSHA-256 ${destinationHash}\n`,
);

async function sha256(filePath) {
  const contents = await readFile(filePath);
  return createHash("sha256").update(contents).digest("hex");
}
