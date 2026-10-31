import { createRequire } from "node:module";
import { verifyCompanionPublisher } from "./companion-release-signing.mjs";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const { readSigningConfiguration } = require("../apps/desktop/signing.cjs");
const signing = readSigningConfiguration();
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const packageJsonPath = path.join(repositoryRoot, "apps/desktop/package.json");
const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const version = String(packageJson.version ?? "");
if (!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(version)) {
  throw new Error(`Invalid desktop package version '${version}'`);
}

const supportedPlatforms = ["macos", "windows", "linux"];
const selectedPlatforms = readSelectedPlatforms(process.argv.slice(2));
const releaseRoot = path.resolve(
  process.env.COMPANION_RELEASE_OUTPUT ?? path.join(repositoryRoot, "artifacts/companion-releases"),
);
const releaseDirectory = path.join(releaseRoot, "releases", version);
const artifactDefinitions = [
  {
    platform: "macos",
    sourcePath: path.join(
      repositoryRoot,
      "apps/desktop/out/make",
      `WoW Trader Companion-${version}-x64.dmg`,
    ),
    asset: {
      id: "macos-intel-dmg",
      label: "macOS Intel · DMG",
      platform: "macos",
      architecture: "x64",
      filename: `WoW Trader Companion-${version}-macOS-x64.dmg`,
      contentType: "application/x-apple-diskimage",
      signed: false,
      recommended: true,
    },
  },
  {
    platform: "macos",
    sourcePath: path.join(
      repositoryRoot,
      "apps/desktop/out/make",
      `WoW Trader Companion-${version}-arm64.dmg`,
    ),
    asset: {
      id: "macos-apple-silicon-dmg",
      label: "macOS Apple Silicon · DMG",
      platform: "macos",
      architecture: "arm64",
      filename: `WoW Trader Companion-${version}-macOS-arm64.dmg`,
      contentType: "application/x-apple-diskimage",
      signed: false,
      recommended: false,
    },
  },
  {
    platform: "windows",
    sourcePath: path.join(
      repositoryRoot,
      "apps/desktop/out/make/zip/win32/x64",
      `WoW Trader Companion-win32-x64-${version}.zip`,
    ),
    asset: {
      id: "windows-x64-zip",
      label: "Windows x64 · Portable ZIP",
      platform: "windows",
      architecture: "x64",
      filename: `WoW Trader Companion-${version}-Windows-x64.zip`,
      contentType: "application/zip",
      signed: false,
      recommended: false,
    },
  },
  {
    platform: "linux",
    sourcePath: path.join(
      repositoryRoot,
      "apps/desktop/out/make/zip/linux/x64",
      `WoW Trader Companion-linux-x64-${version}.zip`,
    ),
    asset: {
      id: "linux-x64-zip",
      label: "Linux x64 · Portable ZIP",
      platform: "linux",
      architecture: "x64",
      filename: `WoW Trader Companion-${version}-Linux-x64.zip`,
      contentType: "application/zip",
      signed: false,
      recommended: false,
    },
  },
].filter((definition) => selectedPlatforms.has(definition.platform));

await mkdir(releaseDirectory, { recursive: true });
const assets = [];
for (const definition of artifactDefinitions) {
  const destinationPath = path.join(releaseDirectory, definition.asset.filename);
  await copyImmutableArtifact(definition.sourcePath, destinationPath);
  const file = await stat(destinationPath);
  assets.push({
    ...definition.asset,
    signed: await verifyCompanionPublisher(definition.platform, definition.sourcePath, signing),
    id: `${definition.asset.id}-v${version.replaceAll(".", "-")}`,
    byteSize: file.size,
    sha256: await sha256(destinationPath),
  });
}

const manifest = {
  schemaVersion: 1,
  version,
  channel: "maintainer-alpha",
  publishedAt: new Date().toISOString(),
  collectorVersion: "0.14.0",
  supportedProducts: ["wow_anniversary", "wow_classic_beta"],
  minimumMacOs: "12",
  minimumWindows: "10",
  minimumLinux: "Ubuntu 22.04 or equivalent with Secret Service",
  notes: [
    "Installs and updates WowTraderCollector for WoW Forever and TBC Anniversary.",
    "Connects through Discord browser approval with revocable, encrypted installation credentials.",
    "Uploads validated native Auction House scans after /reload or logout.",
    "Captures exact whole-auction stacks for budget-aware buying and crafting plans.",
    "Keeps character professions, known recipes, inventory and capital private to the connected account.",
    "Synchronizes watched items, buy limits, profit targets and in-game alert cooldowns.",
    "Uploads supported completed auction-mail receipts when explicitly enabled in the addon.",
    "Keeps market uploads working when optional private synchronization needs attention.",
    "Synchronizes scoped seven-day history and auction depth into the addon's buying panel.",
    "Checks available updates without silently replacing the installed application.",
    "Windows and Linux alpha builds are portable ZIP archives; extract them before launching.",
    "Publisher-signing status and SHA-256 are verified separately for each release asset.",
  ],
  assets,
};

await writeFile(path.join(releaseRoot, "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`, {
  encoding: "utf8",
  mode: 0o644,
});
process.stdout.write(
  `Prepared Companion ${version} for ${[...selectedPlatforms].join(", ")} at ${releaseDirectory}\n`,
);
for (const asset of assets) process.stdout.write(`${asset.id}: SHA-256 ${asset.sha256}\n`);

function readSelectedPlatforms(arguments_) {
  const value = arguments_
    .find((argument) => argument.startsWith("--platforms="))
    ?.slice("--platforms=".length);
  const platforms = value
    ? value.split(",").map((platform) => platform.trim())
    : supportedPlatforms;
  if (
    platforms.length === 0 ||
    platforms.some((platform) => !supportedPlatforms.includes(platform))
  ) {
    throw new Error(`--platforms must contain only: ${supportedPlatforms.join(", ")}`);
  }
  return new Set(platforms);
}

async function copyImmutableArtifact(sourcePath, destinationPath) {
  try {
    await copyFile(sourcePath, destinationPath, constants.COPYFILE_EXCL);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
  }
  const [sourceHash, destinationHash] = await Promise.all([
    sha256(sourcePath),
    sha256(destinationPath),
  ]);
  if (sourceHash !== destinationHash) {
    throw new Error(`Existing release artifact does not match ${sourcePath}`);
  }
}

async function sha256(filePath) {
  const contents = await readFile(filePath);
  return createHash("sha256").update(contents).digest("hex");
}
