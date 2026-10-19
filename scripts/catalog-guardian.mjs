#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { gunzipSync } from "node:zlib";

import {
  buildCatalogRuntime,
  mergeGuardianStatus,
  verifyCatalogRuntime,
  verifyGuardianRelease,
} from "./catalog-runtime.mjs";
import { canReusePublishedCatalog } from "./catalog-guardian-state.mjs";
import { resolveCatalogPromotionApproval } from "./catalog-review-approval.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const catalogCli = join(repositoryRoot, "packages/catalog/node_modules/.bin/tsx");
const guardianDirectory = join(homedir(), "Library/Application Support/WowTraderCatalogGuardian");
const statusPath = join(guardianDirectory, "status.json");
const lockPath = join(guardianDirectory, "guardian.lock");
let workRoot = repositoryRoot;
/** @type {{catalogExtractorVersion: string, catalogRuntimeFingerprint: string, sourceRevision: string} | null} */
let installation = null;
let definitionsSource = join(workRoot, ".cache/wowdbdefs/catalog-guardian-source");
const defaultWowRoot = "/Applications/World of Warcraft";
const defaultDeployHost = "root@89.167.46.193";
const defaultDeployRoot = "/home/wow-trader-system";

await main(process.argv.slice(2)).catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  await updateStatus({ state: "error", message }).catch(() => undefined);
  process.stderr.write(`[catalog-guardian] ${message}\n`);
  process.exitCode = 1;
});

async function main(arguments_) {
  const options = parseOptions(arguments_);
  await mkdir(guardianDirectory, { recursive: true, mode: 0o700 });
  const releaseLock = await acquireLock();
  if (!releaseLock) {
    log("Another catalog guardian run is active; skipping this interval.");
    return;
  }
  try {
    await loadInstallation();
    if (options.verifyTools) await verifyInstalledTools();
    await reconcile(options);
  } finally {
    await releaseLock();
  }
}

/** @returns {Promise<void>} */
async function loadInstallation() {
  const metadataPath = join(repositoryRoot, "installation.json");
  if (!(await pathExists(metadataPath)) && !/^[a-f0-9]{64}$/.test(basename(repositoryRoot))) return;
  await verifyGuardianRelease(repositoryRoot, basename(repositoryRoot));
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  if (
    metadata.schemaVersion !== "catalog-guardian-installation.v1" ||
    metadata.platform !== process.platform ||
    metadata.arch !== process.arch ||
    !/^\d+\.\d+\.\d+$/.test(metadata.catalogExtractorVersion) ||
    !/^[a-f0-9]{64}$/.test(metadata.catalogRuntimeFingerprint) ||
    !/^[a-f0-9]{40}$/.test(metadata.sourceRevision)
  )
    throw new Error("Unsupported catalog guardian installation metadata.");
  installation = metadata;
  workRoot = join(guardianDirectory, "work");
  definitionsSource = join(workRoot, ".cache/wowdbdefs/catalog-guardian-source");
  await mkdir(workRoot, { recursive: true, mode: 0o700 });
  await verifyCatalogRuntime(
    join(repositoryRoot, "runtime"),
    installation.catalogRuntimeFingerprint,
  );
}

/** @returns {Promise<void>} */
async function verifyInstalledTools() {
  if (!installation) throw new Error("Tool verification requires an installed guardian release.");
  const catalog = await runCatalog([], [1]);
  if (!catalog.stderr.includes("Usage: catalog"))
    throw new Error("Compiled catalog CLI failed its startup check.");
  const extractor = await run(join(repositoryRoot, "extractor/WowTrader.Extractor"), ["--help"], {
    capture: true,
    allowedExitCodes: [1],
  });
  if (!extractor.stderr.includes("Usage:"))
    throw new Error("Self-contained extractor failed its startup check.");
  log("Installed Node, compiled catalog CLI and self-contained extractor verified.");
}

async function reconcile(options) {
  const installed = await readInstalledBuild(options.wowRoot, options.product);
  const productRoot = await findProductRoot(options.wowRoot, options.product);
  const hotfixPath = join(productRoot, "Cache/ADB", options.locale, "DBCache.bin");
  let hotfixHash;
  try {
    hotfixHash = await sha256File(hotfixPath);
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
    await updateStatus({
      state: "waiting_for_client",
      product: options.product,
      buildNumber: installed.buildNumber,
      message: `Launch ${options.product} build ${installed.buildNumber} once so its hotfix cache is available.`,
    });
    return;
  }

  const published = await readPublishedCatalog(options);
  if (
    canReusePublishedCatalog(
      published,
      installed,
      hotfixHash,
      installation?.catalogExtractorVersion ?? null,
    )
  ) {
    await updateStatus({
      state: "current",
      product: options.product,
      buildNumber: installed.buildNumber,
      hotfixHash,
      publishedBuildId: published.buildId,
      message: `Catalog build ${installed.buildNumber} is already published with this hotfix cache.`,
    });
    return;
  }
  if (published && installed.buildNumber < published.buildNumber) {
    throw new Error(
      `Installed build ${installed.buildNumber} is older than published build ${published.buildNumber}; refusing rollback.`,
    );
  }

  await updateStatus({
    state: "preparing",
    product: options.product,
    buildNumber: installed.buildNumber,
    hotfixHash,
    message: `Preparing exact catalog build ${installed.buildNumber}.`,
  });
  const definitionsRevision = await resolveDefinitionsRevision(installed.version);
  if (!definitionsRevision) {
    await updateStatus({
      state: "waiting_for_definitions",
      product: options.product,
      buildNumber: installed.buildNumber,
      hotfixHash,
      message: `WoWDBDefs has not published exact layouts for ${installed.version} yet; the guardian will retry.`,
    });
    return;
  }

  const catalogOutput = join(workRoot, "artifacts/local-catalog", definitionsRevision.slice(0, 12));
  let targetManifest = await findManifest(join(workRoot, "artifacts"), {
    product: options.product,
    buildNumber: installed.buildNumber,
    locale: options.locale,
    hotfixHash,
    definitionsRevision,
    extractorVersion: installation?.catalogExtractorVersion,
  });
  if (!targetManifest) {
    log(`Extracting ${installed.version} with definitions ${definitionsRevision.slice(0, 12)}.`);
    if (installation) {
      const definitionsCheckout = join(workRoot, ".cache/wowdbdefs", definitionsRevision);
      if (!(await pathExists(join(definitionsCheckout, ".git")))) {
        await run("git", [
          "clone",
          "--filter=blob:none",
          "--no-checkout",
          "https://github.com/wowdev/WoWDBDefs.git",
          definitionsCheckout,
        ]);
      }
      await run("git", ["-C", definitionsCheckout, "checkout", "--detach", definitionsRevision]);
      await run(
        join(repositoryRoot, "extractor/WowTrader.Extractor"),
        [
          "snapshot",
          "--wow-root",
          options.wowRoot,
          "--product",
          options.product,
          "--locale",
          options.locale,
          "--region",
          options.region,
          "--definitions",
          join(definitionsCheckout, "definitions"),
          "--definitions-revision",
          definitionsRevision,
          "--extractor-revision",
          installation.sourceRevision,
          "--output",
          catalogOutput,
        ],
        { cwd: workRoot },
      );
    } else
      await run(join(repositoryRoot, "tools/extractor-dotnet/run-tbc-validation.sh"), [], {
        cwd: repositoryRoot,
        env: {
          ...process.env,
          CATALOG_OUTPUT: catalogOutput,
          WOW_ROOT: options.wowRoot,
          WOW_PRODUCT: options.product,
          WOW_LOCALE: options.locale,
          WOW_REGION: options.region,
          WOWDBDEFS_REVISION: definitionsRevision,
        },
      });
    targetManifest = await findManifest(catalogOutput, {
      product: options.product,
      buildNumber: installed.buildNumber,
      locale: options.locale,
      hotfixHash,
      definitionsRevision,
    });
    if (!targetManifest) throw new Error("Extraction completed without the expected manifest.");
  }

  await runCatalog(["audit", targetManifest]);
  await runCatalog(["validate", targetManifest]);
  if (!published) {
    await notifyReviewRequired(installed.buildNumber, hotfixHash);
    await updateStatus({
      state: "review_required",
      product: options.product,
      buildNumber: installed.buildNumber,
      hotfixHash,
      definitionsRevision,
      manifestPath: targetManifest,
      message: "No previously published catalog exists for an automatic compatibility comparison.",
    });
    return;
  }

  const sourceManifest = await ensurePublishedManifest(options, published);
  const assessment = await assessPromotion(sourceManifest, targetManifest);
  const approval = resolveCatalogPromotionApproval(
    assessment.decision,
    await sha256File(targetManifest),
    options.approvedManifestSha256,
  );
  if (!approval.approved) {
    await notifyReviewRequired(installed.buildNumber, hotfixHash);
    await updateStatus({
      state: "review_required",
      product: options.product,
      buildNumber: installed.buildNumber,
      hotfixHash,
      definitionsRevision,
      manifestPath: targetManifest,
      assessment,
      message: assessment.blockers.map((blocker) => blocker.message).join(" "),
    });
    return;
  }

  const mediaDirectory = await ensureItemMedia(options, targetManifest);
  if (options.dryRun) {
    await updateStatus({
      state: "ready_to_publish",
      product: options.product,
      buildNumber: installed.buildNumber,
      hotfixHash,
      definitionsRevision,
      manifestPath: targetManifest,
      assessment,
      approvedManifestSha256: approval.mode === "reviewed" ? approval.manifestSha256 : undefined,
      promotionMode: approval.mode,
      message:
        approval.mode === "reviewed"
          ? `Build ${installed.buildNumber} has an exact reviewed-manifest approval; dry run did not publish it.`
          : `Build ${installed.buildNumber} passed automatic promotion policy; dry run did not publish it.`,
    });
    return;
  }

  const runtime = await ensureCatalogRuntime(options);
  await publishCatalog(options, targetManifest, mediaDirectory, assessment, approval, runtime);
}

function parseOptions(arguments_) {
  let wowRoot = defaultWowRoot;
  let product = "wow_classic_beta";
  let locale = "enUS";
  let region = "eu";
  let deployHost = defaultDeployHost;
  let deployRoot = defaultDeployRoot;
  let dryRun = true;
  let verifyTools = false;
  let approvedManifestSha256;
  for (let index = 0; index < arguments_.length; index += 1) {
    const flag = arguments_[index];
    if (flag === "--publish") {
      dryRun = false;
      continue;
    }
    if (flag === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (flag === "--verify-tools") {
      verifyTools = true;
      continue;
    }
    const value = arguments_[index + 1];
    if (!value) throw new Error(`Missing value for ${flag ?? "option"}.`);
    index += 1;
    if (flag === "--wow-root") wowRoot = resolve(value);
    else if (flag === "--product") product = value;
    else if (flag === "--locale") locale = value;
    else if (flag === "--region") region = value.toLowerCase();
    else if (flag === "--deploy-host") deployHost = value;
    else if (flag === "--deploy-root") deployRoot = value;
    else if (flag === "--approve-manifest-sha256") approvedManifestSha256 = value;
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!/^[a-z0-9_]+$/.test(product)) throw new Error("Product contains unsupported characters.");
  if (!/^[A-Za-z]{4}$/.test(locale)) throw new Error("Locale must contain four letters.");
  if (!/^[a-z]{2,4}$/.test(region)) throw new Error("Region contains unsupported characters.");
  if (!/^[A-Za-z0-9._@:-]+$/.test(deployHost))
    throw new Error("Deploy host contains unsupported characters.");
  if (!/^\/home\/[A-Za-z0-9._/-]+$/.test(deployRoot) || deployRoot.includes(".."))
    throw new Error("Deploy root must be a safe path below /home.");
  if (approvedManifestSha256 !== undefined && !/^[a-f0-9]{64}$/.test(approvedManifestSha256))
    throw new Error("Reviewed catalog approval must be an exact lowercase SHA-256 fingerprint.");
  return {
    wowRoot,
    product,
    locale,
    region,
    deployHost,
    deployRoot,
    dryRun,
    verifyTools,
    approvedManifestSha256,
  };
}

async function readInstalledBuild(wowRoot, product) {
  const contents = await readFile(join(wowRoot, ".build.info"), "utf8");
  const rows = contents.trim().split(/\r?\n/);
  const headers = rows[0].split("|").map((header) => header.split("!", 1)[0]);
  const productIndex = headers.indexOf("Product");
  const versionIndex = headers.indexOf("Version");
  const activeIndex = headers.indexOf("Active");
  if (productIndex < 0 || versionIndex < 0 || activeIndex < 0)
    throw new Error("The WoW build manifest has an unsupported format.");
  const matches = rows
    .slice(1)
    .map((row) => row.split("|"))
    .filter((row) => row[productIndex] === product && row[activeIndex] === "1");
  if (matches.length !== 1)
    throw new Error(`Expected one active ${product} build, found ${matches.length}.`);
  const version = matches[0][versionIndex];
  const buildNumber = Number(version?.split(".").at(-1));
  if (!version || !Number.isSafeInteger(buildNumber) || buildNumber <= 0)
    throw new Error(`Invalid installed version: ${version ?? "missing"}.`);
  return { version, buildNumber };
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
      if (!isMissingFileError(error)) throw error;
    }
  }
  throw new Error(`No installed directory declares product ${product}.`);
}

async function resolveDefinitionsRevision(clientVersion) {
  if (!(await pathExists(join(definitionsSource, ".git")))) {
    await mkdir(dirname(definitionsSource), { recursive: true });
    await run("git", [
      "clone",
      "--filter=blob:none",
      "--no-checkout",
      "https://github.com/wowdev/WoWDBDefs.git",
      definitionsSource,
    ]);
  }
  await run("git", ["-C", definitionsSource, "fetch", "--quiet", "origin", "master"]);
  const result = await run(
    "git",
    [
      "-C",
      definitionsSource,
      "log",
      "origin/master",
      "--format=%H%x09%s",
      "--fixed-strings",
      `--grep=Merge ${clientVersion}`,
    ],
    { capture: true },
  );
  const exact = result.stdout
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split("\t", 2))
    .find(([, subject]) => subject === `Merge ${clientVersion}`);
  return exact?.[0] ?? null;
}

async function findManifest(searchRoot, expected) {
  if (!(await pathExists(searchRoot))) return null;
  for (const path of await findFiles(searchRoot, "manifest.json")) {
    try {
      const manifest = JSON.parse(await readFile(path, "utf8"));
      if (
        manifest.schemaVersion === "catalog-snapshot-manifest.v4" &&
        manifest.product === expected.product &&
        manifest.buildNumber === expected.buildNumber &&
        manifest.locale === expected.locale &&
        manifest.hotfix?.sha256 === expected.hotfixHash &&
        manifest.definitions?.revision === expected.definitionsRevision &&
        (!expected.extractorVersion || manifest.extractor?.version === expected.extractorVersion)
      ) {
        return path;
      }
    } catch (error) {
      if (!(error instanceof SyntaxError) && !isMissingFileError(error)) throw error;
    }
  }
  return null;
}

async function findFiles(root, filename) {
  const matches = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (!directory) continue;
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile() && entry.name === filename) matches.push(path);
    }
  }
  return matches;
}

async function readPublishedCatalog(options) {
  const remoteScript = `set -Eeuo pipefail
set -a
. "$2/shared/env/owner.env"
set +a
psql "$DATABASE_URL" --no-align --tuples-only --field-separator='|' \\
  --set=product="$3" --set=locale="$4" <<'SQL'
SELECT id, build_number, client_version, COALESCE(hotfix_hash, ''), definitions_revision, extractor_version
FROM game_build
WHERE product = :'product' AND locale = :'locale' AND status = 'published'
ORDER BY published_at DESC NULLS LAST, created_at DESC
LIMIT 1;
SQL
`;
  const result = await run(
    "ssh",
    [
      options.deployHost,
      "bash",
      "-s",
      "--",
      "catalog-guardian",
      options.deployRoot,
      options.product,
      options.locale,
    ],
    { capture: true, input: remoteScript },
  );
  const line = result.stdout.trim().split(/\r?\n/).at(-1);
  if (!line) return null;
  const [
    buildId,
    buildNumberText,
    clientVersion,
    hotfixHash,
    definitionsRevision,
    extractorVersion,
  ] = line.split("|");
  const buildNumber = Number(buildNumberText);
  if (
    !buildId ||
    !Number.isSafeInteger(buildNumber) ||
    !clientVersion ||
    !hotfixHash ||
    !definitionsRevision ||
    !extractorVersion
  ) {
    throw new Error("Production returned malformed published-catalog metadata.");
  }
  return {
    buildId,
    buildNumber,
    clientVersion,
    hotfixHash,
    definitionsRevision,
    extractorVersion,
  };
}

async function ensurePublishedManifest(options, published) {
  const existing = await findManifest(join(workRoot, "artifacts"), {
    product: options.product,
    buildNumber: published.buildNumber,
    locale: options.locale,
    hotfixHash: published.hotfixHash,
    definitionsRevision: published.definitionsRevision,
  });
  if (existing) return existing;
  const releaseName = makeReleaseName(
    options.product,
    published.buildNumber,
    options.locale,
    published.hotfixHash,
    published.definitionsRevision,
  );
  const destination = join(workRoot, "artifacts/catalog-guardian/reference", releaseName);
  await mkdir(destination, { recursive: true });
  await run("rsync", [
    "-az",
    "--checksum",
    `${options.deployHost}:${options.deployRoot}/shared/catalog-releases/${releaseName}/`,
    `${destination}/`,
  ]);
  const manifestPath = join(destination, "manifest.json");
  await access(manifestPath);
  return manifestPath;
}

async function assessPromotion(sourceManifest, targetManifest) {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "wow-trader-promotion-"));
  const outputPath = join(temporaryDirectory, "assessment.json");
  try {
    await runCatalog(
      ["assess-promotion", sourceManifest, targetManifest, "--output", outputPath],
      [0, 3],
    );
    return JSON.parse(await readFile(outputPath, "utf8"));
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function ensureItemMedia(options, manifestPath) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const mediaDirectory = join(
    workRoot,
    "artifacts/local-media",
    manifest.product,
    String(manifest.buildNumber),
    manifest.locale,
    manifest.hotfix.sha256,
  );
  try {
    await run(
      process.execPath,
      [join(repositoryRoot, "scripts/verify-item-media.mjs"), mediaDirectory],
      { capture: true },
    );
    return mediaDirectory;
  } catch {
    // Missing or partial media is regenerated from the exact installed build below.
  }

  const itemsPath = join(dirname(manifestPath), manifest.normalizedArtifacts.items.path);
  const itemRows = gunzipSync(await readFile(itemsPath))
    .toString("utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const iconIds = [
    ...new Set(
      itemRows
        .map((item) => item.iconFileDataId)
        .filter((value) => Number.isSafeInteger(value) && value > 0),
    ),
  ].sort((left, right) => left - right);
  if (iconIds.length === 0) throw new Error("The target catalog contains no item icon IDs.");
  await mkdir(mediaDirectory, { recursive: true });
  const idsPath = join(mediaDirectory, "icon-file-data-ids.txt");
  await writeFile(idsPath, `${iconIds.join("\n")}\n`, "utf8");
  if (installation) {
    await run(
      join(repositoryRoot, "extractor/WowTrader.Extractor"),
      [
        "icons",
        "--wow-root",
        options.wowRoot,
        "--product",
        options.product,
        "--locale",
        options.locale,
        "--region",
        options.region,
        "--ids",
        idsPath,
        "--output",
        mediaDirectory,
      ],
      { cwd: workRoot },
    );
  } else
    await run(join(repositoryRoot, "tools/extractor-dotnet/run-icon-extraction.sh"), [], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        ICON_IDS_PATH: idsPath,
        ICON_OUTPUT: mediaDirectory,
        WOW_ROOT: options.wowRoot,
        WOW_PRODUCT: options.product,
        WOW_LOCALE: options.locale,
        WOW_REGION: options.region,
      },
    });
  await run(process.execPath, [
    join(repositoryRoot, "scripts/verify-item-media.mjs"),
    mediaDirectory,
  ]);
  return mediaDirectory;
}

async function ensureCatalogRuntime(options) {
  const temporaryDirectory = installation
    ? null
    : await mkdtemp(join(tmpdir(), "wow-trader-catalog-runtime-"));
  try {
    const runtimeDirectory = installation
      ? join(repositoryRoot, "runtime")
      : join(temporaryDirectory, "runtime");
    const fingerprint = installation
      ? await verifyCatalogRuntime(runtimeDirectory, installation.catalogRuntimeFingerprint)
      : await buildCatalogRuntime(repositoryRoot, runtimeDirectory, run);
    const remoteDirectory = `${options.deployRoot}/shared/catalog-tooling/releases/${fingerprint}`;
    await run("ssh", [options.deployHost, "mkdir", "-p", remoteDirectory]);
    await run("rsync", [
      "-az",
      "--checksum",
      "--partial",
      `${runtimeDirectory}/`,
      `${options.deployHost}:${remoteDirectory}/`,
    ]);
    const verify = `set -Eeuo pipefail
node "$2/verify-runtime.mjs" "$2" "$3"
node "$2/dist/cli.js" audit "$4"
`;
    return { directory: remoteDirectory, fingerprint, verify };
  } finally {
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function publishCatalog(
  options,
  manifestPath,
  mediaDirectory,
  assessment,
  approval,
  runtime,
) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const releaseName = makeReleaseName(
    manifest.product,
    manifest.buildNumber,
    manifest.locale,
    manifest.hotfix.sha256,
    manifest.definitions.revision,
  );
  const remoteCatalogDirectory = `${options.deployRoot}/shared/catalog-releases/${releaseName}`;
  const backupName = `wow_trader-pre-${manifest.product}-${manifest.buildNumber}-${manifest.hotfix.sha256.slice(0, 8)}-catalog-${compactDate(new Date())}.dump`;
  const remoteScript = `set -Eeuo pipefail
deploy_root=$2
backup="$deploy_root/shared/backups/$3"
if [ ! -e "$backup" ]; then
  set -a
  . "$deploy_root/shared/env/owner.env"
  set +a
  umask 077
  pg_dump --format=custom --no-owner --no-acl --file="$backup" "$DATABASE_URL"
fi
pg_restore --list "$backup" >/dev/null
mkdir -p "$4"
`;
  await run(
    "ssh",
    [
      options.deployHost,
      "bash",
      "-s",
      "--",
      "catalog-guardian",
      options.deployRoot,
      backupName,
      remoteCatalogDirectory,
    ],
    { input: remoteScript },
  );
  await run("rsync", [
    "-az",
    "--checksum",
    "--partial",
    `${dirname(manifestPath)}/`,
    `${options.deployHost}:${remoteCatalogDirectory}/`,
  ]);

  const remoteManifest = `${remoteCatalogDirectory}/manifest.json`;
  await run(
    "ssh",
    [
      options.deployHost,
      "bash",
      "-s",
      "--",
      "catalog-runtime",
      runtime.directory,
      runtime.fingerprint,
      remoteManifest,
    ],
    { input: runtime.verify },
  );
  const verifyAndImport = `set -Eeuo pipefail
deploy_root=$2
manifest=$3
runtime=$4
node "$runtime/verify-runtime.mjs" "$runtime" "$5"
node "$runtime/dist/cli.js" audit "$manifest"
node "$runtime/dist/cli.js" validate "$manifest"
set -a
. "$deploy_root/shared/env/owner.env"
set +a
node "$runtime/dist/cli.js" import "$manifest"
`;
  await run(
    "ssh",
    [
      options.deployHost,
      "bash",
      "-s",
      "--",
      "catalog-guardian",
      options.deployRoot,
      remoteManifest,
      runtime.directory,
      runtime.fingerprint,
    ],
    { input: verifyAndImport },
  );
  await run(
    join(repositoryRoot, "scripts/sync-production-media.sh"),
    [mediaDirectory, releaseName, options.product],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        WOW_TRADER_DEPLOY_HOST: options.deployHost,
        WOW_TRADER_DEPLOY_ROOT: options.deployRoot,
        WOW_TRADER_MEDIA_VERIFIER: `${runtime.directory}/verify-item-media.mjs`,
      },
    },
  );

  const promote = `set -Eeuo pipefail
deploy_root=$2
manifest=$3
set -a
. "$deploy_root/shared/env/owner.env"
set +a
runtime=$4
node "$runtime/verify-runtime.mjs" "$runtime" "$5"
node "$runtime/dist/cli.js" import "$manifest" --publish
pm2 reload kfc-helper-web --update-env
pm2 save >/dev/null
`;
  await run(
    "ssh",
    [
      options.deployHost,
      "bash",
      "-s",
      "--",
      "catalog-guardian",
      options.deployRoot,
      remoteManifest,
      runtime.directory,
      runtime.fingerprint,
    ],
    { input: promote },
  );
  const published = await readPublishedCatalog(options);
  if (
    !published ||
    published.buildNumber !== manifest.buildNumber ||
    published.hotfixHash !== manifest.hotfix.sha256
  ) {
    throw new Error(
      "Production did not report the promoted catalog as its latest published build.",
    );
  }
  await updateStatus({
    state: "published",
    product: manifest.product,
    buildNumber: manifest.buildNumber,
    hotfixHash: manifest.hotfix.sha256,
    definitionsRevision: manifest.definitions.revision,
    manifestPath,
    assessment,
    approvedManifestSha256: approval.mode === "reviewed" ? approval.manifestSha256 : undefined,
    promotionMode: approval.mode,
    publishedBuildId: published.buildId,
    message:
      approval.mode === "reviewed"
        ? `Catalog build ${manifest.buildNumber} was explicitly reviewed and published.`
        : `Catalog build ${manifest.buildNumber} was automatically verified and published.`,
  });
  await notify(`Catalog build ${manifest.buildNumber} published`, "WoW Trader crafting is ready.");
}

function makeReleaseName(product, buildNumber, locale, hotfixHash, definitionsRevision) {
  return `${product}-${buildNumber}-${locale}-${hotfixHash.slice(0, 8)}-${definitionsRevision.slice(0, 7)}`;
}

async function runCatalog(arguments_, allowedExitCodes = [0]) {
  if (installation) {
    return run(process.execPath, [join(repositoryRoot, "runtime/dist/cli.js"), ...arguments_], {
      cwd: workRoot,
      allowedExitCodes,
      capture: arguments_.length === 0,
    });
  }
  return run(catalogCli, [join(repositoryRoot, "packages/catalog/src/cli.ts"), ...arguments_], {
    cwd: repositoryRoot,
    allowedExitCodes,
  });
}

async function acquireLock() {
  try {
    const handle = await open(lockPath, "wx", 0o600);
    await handle.writeFile(`${process.pid}\n`, "utf8");
    await handle.close();
  } catch (error) {
    if (!isFileExistsError(error)) throw error;
    const existingPid = Number((await readFile(lockPath, "utf8")).trim());
    if (Number.isSafeInteger(existingPid) && processIsRunning(existingPid)) return null;
    await unlink(lockPath);
    return acquireLock();
  }
  return async () => {
    try {
      await unlink(lockPath);
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
    }
  };
}

function processIsRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function updateStatus(update) {
  let previous = {};
  try {
    previous = JSON.parse(await readFile(statusPath, "utf8"));
  } catch (error) {
    if (!(error instanceof SyntaxError) && !isMissingFileError(error)) throw error;
  }
  const status = {
    ...mergeGuardianStatus(previous, update),
    guardianRelease: installation ? basename(repositoryRoot) : "development",
    updatedAt: new Date().toISOString(),
  };
  const temporaryPath = `${statusPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(status, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await access(temporaryPath);
  await rename(temporaryPath, statusPath);
  log(status.message);
}

async function notifyReviewRequired(buildNumber, hotfixHash) {
  const notificationKey = `${buildNumber}:${hotfixHash}`;
  let previousNotificationKey = null;
  try {
    previousNotificationKey = JSON.parse(await readFile(statusPath, "utf8")).lastReviewNotifiedKey;
  } catch {
    // Status persistence is best effort for notification de-duplication.
  }
  if (previousNotificationKey === notificationKey) return;
  await notify(
    `Catalog build ${buildNumber} needs review`,
    "Economy rules changed; automatic publication stopped safely.",
  );
  await updateStatus({ lastReviewNotifiedKey: notificationKey });
}

async function notify(title, message) {
  if (process.platform !== "darwin") return;
  await run(
    "osascript",
    [
      "-e",
      `display notification ${appleScriptString(message)} with title ${appleScriptString(title)}`,
    ],
    {
      allowedExitCodes: [0, 1],
      capture: true,
    },
  );
}

function appleScriptString(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

async function sha256File(path) {
  const contents = await readFile(path);
  return createHash("sha256").update(contents).digest("hex");
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isMissingFileError(error)) return false;
    throw error;
  }
}

function compactDate(date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function log(message) {
  process.stdout.write(`[catalog-guardian] ${message}\n`);
}

function run(command, arguments_, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, arguments_, {
      cwd: options.cwd ?? repositoryRoot,
      env: options.env ?? process.env,
      stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stdout += text;
      if (!options.capture) process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stderr += text;
      if (!options.capture) process.stderr.write(text);
    });
    child.once("error", rejectPromise);
    child.once("close", (code) => {
      const allowedExitCodes = options.allowedExitCodes ?? [0];
      if (code !== null && allowedExitCodes.includes(code)) {
        resolvePromise({ stdout, stderr, exitCode: code });
        return;
      }
      rejectPromise(
        new Error(
          `${basename(command)} exited with code ${code ?? "unknown"}${stderr.trim() ? `: ${stderr.trim().split("\n").at(-1)}` : ""}`,
        ),
      );
    });
    if (options.input !== undefined) child.stdin.end(options.input);
  });
}

function isMissingFileError(error) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isFileExistsError(error) {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}
