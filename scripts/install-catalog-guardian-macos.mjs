#!/usr/bin/env node

import {
  access,
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  buildCatalogRuntime,
  verifyGuardianRelease,
  writeGuardianReleaseManifest,
} from "./catalog-runtime.mjs";

const execute = promisify(execFile);
const label = "online.kfcguild.wow-trader-catalog-guardian";
const repositoryRoot = resolve(import.meta.dirname, "..");
const installationDirectory = join(
  homedir(),
  "Library/Application Support/WowTraderCatalogGuardian",
);

await main(process.argv.slice(2)).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

async function main(arguments_) {
  if (process.platform !== "darwin") throw new Error("This installer supports macOS only.");
  const options = parseOptions(arguments_);
  await Promise.all([
    access(join(repositoryRoot, "scripts/catalog-guardian.mjs")),
    access(join(options.wowRoot, ".build.info")),
  ]);
  await execute("ssh", ["-o", "BatchMode=yes", options.deployHost, "true"]);
  const release = await prepareRelease();
  const guardianPath = join(release.directory, "scripts/catalog-guardian.mjs");
  const nodePath = join(release.directory, "bin/node");
  const productRoot = await findProductRoot(options.wowRoot, options.product);
  const watchPaths = [
    join(options.wowRoot, ".build.info"),
    join(productRoot, "Cache/ADB", options.locale, "DBCache.bin"),
  ];

  const logDirectory = join(homedir(), "Library/Logs/WowTraderCatalogGuardian");
  const launchAgentPath = join(homedir(), `Library/LaunchAgents/${label}.plist`);
  await Promise.all([
    mkdir(logDirectory, { recursive: true, mode: 0o700 }),
    mkdir(dirname(launchAgentPath), { recursive: true }),
  ]);
  const programArguments = [nodePath, guardianPath, ...guardianArguments(options), "--publish"];
  const plist = makeLaunchAgentPlist(
    programArguments,
    logDirectory,
    options.intervalSeconds,
    watchPaths,
    release.directory,
  );
  const domain = `gui/${process.getuid()}`;
  const previousPlist = await readOptionalFile(launchAgentPath);
  const backupPath = previousPlist
    ? join(installationDirectory, "rollback", `${Date.now()}.plist`)
    : null;
  if (backupPath) {
    await mkdir(dirname(backupPath), { recursive: true, mode: 0o700 });
    await writeFile(backupPath, previousPlist, { mode: 0o600, flag: "wx" });
  }
  const pendingPlist = `${launchAgentPath}.${process.pid}.tmp`;
  await writeFile(pendingPlist, plist, { mode: 0o600 });
  await execute("plutil", ["-lint", pendingPlist]);
  const lockPath = join(installationDirectory, "guardian.lock");
  const lock = await open(lockPath, "wx", 0o600).catch(async (error) => {
    await rm(pendingPlist, { force: true });
    if (error.code === "EEXIST")
      throw new Error(
        "A guardian run is active or has a stale lock; retry after it finishes. The installed job was not changed.",
      );
    throw error;
  });
  await lock.writeFile(`${process.pid}\n`);
  await lock.close();
  let lockHeld = true;
  let stoppedPrevious = false;
  let activated = false;
  try {
    const loaded = await isLoaded(domain);
    if (loaded) {
      await execute("launchctl", ["bootout", domain, launchAgentPath]);
      stoppedPrevious = true;
    }
    await unlink(lockPath);
    lockHeld = false;
    await execute(
      nodePath,
      [guardianPath, ...guardianArguments(options), "--dry-run", "--verify-tools"],
      { cwd: release.directory, maxBuffer: 4 * 1024 * 1024 },
    );
    const remoteRuntime = `${options.deployRoot}/shared/catalog-tooling/releases/${release.runtimeFingerprint}`;
    await execute("ssh", [options.deployHost, "mkdir", "-p", remoteRuntime]);
    await execute("rsync", [
      "-az",
      "--checksum",
      "--partial",
      `${release.directory}/runtime/`,
      `${options.deployHost}:${remoteRuntime}/`,
    ]);
    await execute("ssh", [
      options.deployHost,
      "node",
      `${remoteRuntime}/verify-runtime.mjs`,
      remoteRuntime,
      release.runtimeFingerprint,
    ]);
    await rename(pendingPlist, launchAgentPath);
    await execute("launchctl", ["bootstrap", domain, launchAgentPath]);
    activated = true;
    await execute("launchctl", ["kickstart", `${domain}/${label}`]);
    await writeFile(
      join(installationDirectory, "deployment.json"),
      JSON.stringify(
        {
          schemaVersion: "catalog-guardian-deployment.v1",
          installedAt: new Date().toISOString(),
          releaseDirectory: release.directory,
          runtimeFingerprint: release.runtimeFingerprint,
          rollbackPlist: backupPath,
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600 },
    );
  } catch (error) {
    if (activated) await execute("launchctl", ["bootout", domain, launchAgentPath]);
    if (previousPlist) {
      await writeFile(launchAgentPath, previousPlist, { mode: 0o600 });
      if (stoppedPrevious) await execute("launchctl", ["bootstrap", domain, launchAgentPath]);
    } else await rm(launchAgentPath, { force: true });
    throw error;
  } finally {
    if (lockHeld) await unlink(lockPath);
    await rm(pendingPlist, { force: true });
  }
  process.stdout.write(
    `Installed ${label}; it checks every ${options.intervalSeconds} seconds.\nRelease: ${release.directory}\nServer runtime: ${release.runtimeFingerprint}\nRollback: ${backupPath ?? "first installation"}\nLogs: ${logDirectory}\n`,
  );
}

/** @returns {Promise<{directory: string, runtimeFingerprint: string}>} */
async function prepareRelease() {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "wow-trader-catalog-runtime-"));
  const build = async (command, args) => {
    const result = await execute(command, args, {
      cwd: repositoryRoot,
      maxBuffer: 4 * 1024 * 1024,
    });
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    return result;
  };
  try {
    const runtimeFingerprint = await buildCatalogRuntime(
      repositoryRoot,
      join(temporaryDirectory, "runtime"),
      build,
    );
    await mkdir(join(temporaryDirectory, "scripts"));
    await mkdir(join(temporaryDirectory, "bin"));
    for (const script of [
      "catalog-guardian.mjs",
      "catalog-runtime.mjs",
      "sync-production-media.sh",
      "verify-item-media.mjs",
    ]) {
      await copyFile(
        join(repositoryRoot, "scripts", script),
        join(temporaryDirectory, "scripts", script),
      );
    }
    await chmod(join(temporaryDirectory, "scripts/sync-production-media.sh"), 0o700);
    await copyFile(process.execPath, join(temporaryDirectory, "bin/node"));
    await chmod(join(temporaryDirectory, "bin/node"), 0o700);
    const dotnet = process.env.DOTNET_BIN || join(homedir(), ".dotnet/dotnet");
    await build(dotnet, [
      "publish",
      "tools/extractor-dotnet/WowTrader.Extractor.csproj",
      "--configuration",
      "Release",
      "--runtime",
      process.arch === "arm64" ? "osx-arm64" : "osx-x64",
      "--self-contained",
      "true",
      "--output",
      join(temporaryDirectory, "extractor"),
    ]);
    const revision = await execute("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot });
    await writeFile(
      join(temporaryDirectory, "installation.json"),
      JSON.stringify(
        {
          schemaVersion: "catalog-guardian-installation.v1",
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
          sourceRevision: revision.stdout.trim(),
          catalogRuntimeFingerprint: runtimeFingerprint,
        },
        null,
        2,
      ) + "\n",
    );
    const fingerprint = await writeGuardianReleaseManifest(temporaryDirectory);
    const releaseDirectory = join(installationDirectory, "releases", fingerprint);
    await mkdir(dirname(releaseDirectory), { recursive: true, mode: 0o700 });
    const exists = await access(releaseDirectory).then(
      () => true,
      (error) => {
        if (error.code === "ENOENT") return false;
        throw error;
      },
    );
    if (exists) await verifyGuardianRelease(releaseDirectory, fingerprint);
    else await rename(temporaryDirectory, releaseDirectory);
    await verifyGuardianRelease(releaseDirectory, fingerprint);
    return { directory: releaseDirectory, runtimeFingerprint };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function parseOptions(arguments_) {
  let wowRoot = "/Applications/World of Warcraft";
  let product = "wow_classic_beta";
  let locale = "enUS";
  let region = "eu";
  let deployHost = "root@89.167.46.193";
  let deployRoot = "/home/wow-trader-system";
  let intervalSeconds = 300;
  for (let index = 0; index < arguments_.length; index += 2) {
    const flag = arguments_[index];
    const value = arguments_[index + 1];
    if (!value) throw new Error(`Missing value for ${flag ?? "option"}.`);
    if (flag === "--wow-root") wowRoot = resolve(value);
    else if (flag === "--product") product = value;
    else if (flag === "--locale") locale = value;
    else if (flag === "--region") region = value;
    else if (flag === "--deploy-host") deployHost = value;
    else if (flag === "--deploy-root") deployRoot = value;
    else if (flag === "--interval-seconds") intervalSeconds = Number(value);
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!Number.isSafeInteger(intervalSeconds) || intervalSeconds < 60 || intervalSeconds > 86_400) {
    throw new Error("Interval must be an integer between 60 and 86400 seconds.");
  }
  if (
    !/^[a-z0-9_]+$/.test(product) ||
    !/^[A-Za-z]{4}$/.test(locale) ||
    !/^[a-z]{2,4}$/.test(region)
  )
    throw new Error("Unsupported product, locale or region.");
  if (!/^[A-Za-z0-9._@:-]+$/.test(deployHost))
    throw new Error("Deploy host contains unsupported characters.");
  if (!/^\/home\/[A-Za-z0-9._/-]+$/.test(deployRoot) || deployRoot.includes(".."))
    throw new Error("Deploy root must be a safe path below /home.");
  if (!["x64", "arm64"].includes(process.arch)) throw new Error("Unsupported macOS architecture.");
  return { wowRoot, product, locale, region, deployHost, deployRoot, intervalSeconds };
}

function guardianArguments(options) {
  return [
    "--wow-root",
    options.wowRoot,
    "--product",
    options.product,
    "--locale",
    options.locale,
    "--region",
    options.region,
    "--deploy-host",
    options.deployHost,
    "--deploy-root",
    options.deployRoot,
  ];
}

function makeLaunchAgentPlist(
  programArguments,
  logDirectory,
  intervalSeconds,
  watchPaths,
  workingDirectory,
) {
  const argumentsXml = programArguments
    .map((argument) => `      <string>${escapeXml(argument)}</string>`)
    .join("\n");
  const executableDirectory = dirname(programArguments[0]);
  const path = `${executableDirectory}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`;
  const watchPathsXml = watchPaths
    .map((watchPath) => `      <string>${escapeXml(watchPath)}</string>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${label}</string>
    <key>ProgramArguments</key>
    <array>
${argumentsXml}
    </array>
    <key>WorkingDirectory</key>
    <string>${escapeXml(workingDirectory)}</string>
    <key>EnvironmentVariables</key>
    <dict>
      <key>HOME</key>
      <string>${escapeXml(homedir())}</string>
      <key>PATH</key>
      <string>${escapeXml(path)}</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>StartInterval</key>
    <integer>${intervalSeconds}</integer>
    <key>WatchPaths</key>
    <array>
${watchPathsXml}
    </array>
    <key>ProcessType</key>
    <string>Background</string>
    <key>StandardOutPath</key>
    <string>${escapeXml(join(logDirectory, "guardian.log"))}</string>
    <key>StandardErrorPath</key>
    <string>${escapeXml(join(logDirectory, "guardian-error.log"))}</string>
  </dict>
</plist>
`;
}

async function findProductRoot(wowRoot, product) {
  const entries = await readdir(wowRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = join(wowRoot, entry.name);
    try {
      const flavor = await readFile(join(candidate, ".flavor.info"), "utf8");
      if (flavor.trim().split(/\r?\n/)[1] === product) return candidate;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
  }
  throw new Error(`No installed directory declares product ${product}.`);
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** @param {string} path @returns {Promise<Buffer | null>} */
async function readOptionalFile(path) {
  try {
    return await readFile(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

/** @param {string} domain @returns {Promise<boolean>} */
async function isLoaded(domain) {
  try {
    await execute("launchctl", ["print", `${domain}/${label}`]);
    return true;
  } catch (error) {
    if (error.code === 113) return false;
    throw error;
  }
}
