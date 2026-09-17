#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import process, { loadEnvFile } from "node:process";
import { clearTimeout, setTimeout } from "node:timers";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const repositoryRoot = resolve(import.meta.dirname, "..");
const composeFile = join(repositoryRoot, "infra/compose/docker-compose.yml");
const envPath = join(repositoryRoot, ".env");
const defaultDefinitionsRevision = "e6828ce1a61ad05e9693e762fcfd39666454cc62";
const defaultWorldDefinitionsRevision = "403d095cc9eda997c61571cfe18a418cad9ae08f";
const currentCatalogSchemaVersion = "catalog-snapshot-manifest.v4";
const currentWorldSchemaVersion = "world-snapshot-manifest.v1";
const currentWorldExtractorVersion = "0.2.3";
const dockerCandidates = [
  "/Applications/OrbStack.app/Contents/MacOS/xbin/docker",
  "/Applications/Docker.app/Contents/Resources/bin/docker",
];

await main(process.argv.slice(2)).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`\n[dev] ${message}\n`);
  process.exitCode = 1;
});

async function main(arguments_) {
  const unknownArgument = arguments_.find((argument) => argument !== "--bootstrap-only");
  if (unknownArgument) throw new Error(`Unknown argument: ${unknownArgument}`);

  await ensureLocalEnvironment();
  process.chdir(repositoryRoot);

  logStep("Installing workspace dependencies");
  await runPnpm(["install", "--frozen-lockfile", "--prefer-offline"]);

  const docker = await ensureDocker();
  logStep("Starting PostgreSQL");
  await run(docker, ["compose", "-f", composeFile, "up", "-d", "--wait", "postgres"]);

  logStep("Applying database migrations");
  await runPnpm(["db:migrate"]);

  logStep("Building workspace packages");
  await runPnpm(["exec", "turbo", "run", "build", "--output-logs=errors-only"]);

  const foreverAssetRoot = await ensureForeverPreview();
  process.env.FOREVER_ASSET_ROOT = foreverAssetRoot;

  const catalog = await ensureCurrentCatalog();
  const mediaRoot = await ensureCurrentItemIcons(catalog);
  process.env.WOW_TRADER_MEDIA_ROOT = mediaRoot;

  const worldSnapshot = await ensureForeverWorldSnapshot();
  if (worldSnapshot) {
    process.env.WOW_TRADER_WORLD_SNAPSHOT = worldSnapshot.manifestPath;
    process.env.WOW_TRADER_WORLD_MEDIA_ROOT = worldSnapshot.snapshotRoot;
    process.env.WOW_TRADER_WORLD_PREFER_ARTIFACT = "true";
  }

  if (arguments_.includes("--bootstrap-only")) {
    logStep("Bootstrap complete");
    return;
  }

  process.env.WOW_TRADER_WOW_ROOT = catalog.wowProductRoot;
  process.env.WOW_TRADER_INGEST_API_KEY ??= process.env.INGEST_API_KEYS.split(",")[0].trim();
  process.env.WOW_TRADER_ENDPOINT ??= `http://127.0.0.1:${process.env.INGEST_API_PORT ?? "4000"}`;
  process.env.WOW_TRADER_STATE_PATH ??= join(repositoryRoot, ".wow-trader-companion-state.json");

  logStep("Starting Next.js, the ingestion API, and the SavedVariables watcher");
  const turbo = join(repositoryRoot, "node_modules/turbo/bin/turbo");
  await run(process.execPath, [
    turbo,
    "run",
    "dev",
    "--filter=@wow-trader/web",
    "--filter=@wow-trader/ingest-api",
    "--filter=@wow-trader/companion",
  ]);
}

async function ensureForeverWorldSnapshot() {
  const product = process.env.FOREVER_WORLD_PRODUCT ?? "wow_classic_beta";
  const locale = process.env.FOREVER_WORLD_LOCALE ?? "enUS";
  const definitionsRevision =
    process.env.FOREVER_WORLD_WOWDBDEFS_REVISION ?? defaultWorldDefinitionsRevision;
  const wowRoot = resolve(process.env.FOREVER_WORLD_WOW_ROOT ?? "/Applications/World of Warcraft");
  try {
    await findProductRoot(wowRoot, product);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("No installed directory declares")) {
      logStep(`Skipping Forever world bootstrap because ${product} is not installed`);
      return null;
    }
    throw error;
  }

  const build = await readInstalledBuild(wowRoot, product);
  const outputDirectory = resolve(
    repositoryRoot,
    process.env.FOREVER_WORLD_OUTPUT ?? "artifacts/local-world",
  );
  let manifestPath = await findMatchingWorldManifest(outputDirectory, {
    product,
    buildNumber: build.buildNumber,
    locale,
    definitionsRevision,
  });
  if (!manifestPath) {
    logStep(`Extracting Forever world data from ${product} build ${build.buildNumber}`);
    await runPnpm(["extract:forever:world"], {
      env: {
        ...process.env,
        WORLD_OUTPUT: outputDirectory,
        WOW_PRODUCT: product,
        WOW_LOCALE: locale,
        WOW_ROOT: wowRoot,
        WOWDBDEFS_REVISION: definitionsRevision,
      },
    });
    manifestPath = await findMatchingWorldManifest(outputDirectory, {
      product,
      buildNumber: build.buildNumber,
      locale,
      definitionsRevision,
    });
    if (!manifestPath) {
      throw new Error("Forever extraction finished without producing the expected world manifest");
    }
  } else {
    logStep(`Using existing Forever world snapshot ${manifestPath}`);
  }

  logStep("Auditing Forever world records and decoded map media");
  await runPnpm(["world:audit", manifestPath]);
  return { manifestPath, snapshotRoot: dirname(manifestPath) };
}

async function ensureForeverPreview() {
  const outputDirectory = join(repositoryRoot, "artifacts/forever-preview-assets");
  const [publishedChecksum, manifest] = await Promise.all([
    readPublishedForeverChecksum(),
    readForeverAssetManifest(outputDirectory),
  ]);
  if (
    publishedChecksum &&
    manifest?.version === "forever-asset-manifest.v1" &&
    manifest.snapshotChecksum === publishedChecksum &&
    Array.isArray(manifest.entries) &&
    manifest.entries.length > 0 &&
    Array.isArray(manifest.missing) &&
    manifest.missing.length === 0
  ) {
    logStep(`Forever preview snapshot ${publishedChecksum.slice(0, 12)} is ready locally`);
    return outputDirectory;
  }

  logStep("Importing the reviewed Forever preview and its visual assets");
  await runPnpm(["forever:sync", "--", "--publish", "--assets-dir", outputDirectory]);
  return outputDirectory;
}

async function readPublishedForeverChecksum() {
  const databaseModuleUrl = pathToFileURL(join(repositoryRoot, "packages/db/dist/index.js")).href;
  const { createDatabase } = await import(databaseModuleUrl);
  const database = createDatabase(process.env.DATABASE_URL);
  try {
    const rows = await database.client`
      SELECT snapshot.checksum
      FROM external_data_publication publication
      INNER JOIN external_data_source source ON source.id = publication.source_id
      INNER JOIN external_data_snapshot snapshot ON snapshot.id = publication.snapshot_id
      WHERE source.slug = 'talents-forever'
      LIMIT 1
    `;
    return typeof rows[0]?.checksum === "string" ? rows[0].checksum : null;
  } finally {
    await database.close();
  }
}

async function readForeverAssetManifest(outputDirectory) {
  try {
    return JSON.parse(await readFile(join(outputDirectory, "manifest.json"), "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError || error?.code === "ENOENT") return null;
    throw error;
  }
}

async function ensureLocalEnvironment() {
  const templatePath = join(repositoryRoot, ".env.example");
  let contents;
  try {
    contents = await readFile(envPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    contents = await readFile(templatePath, "utf8");
  }

  const placeholder = "replace-with-a-long-random-local-key";
  const keyMatch = /^INGEST_API_KEYS=(.*)$/m.exec(contents);
  if (!keyMatch || keyMatch[1] === placeholder) {
    const generatedKey = randomBytes(32).toString("hex");
    contents = upsertEnvironmentValue(contents, "INGEST_API_KEYS", generatedKey);
    await writeFile(envPath, contents, { encoding: "utf8", mode: 0o600 });
    logStep("Created local .env with a generated ingestion key");
  }

  loadEnvFile(envPath);
  const apiKeys = process.env.INGEST_API_KEYS;
  if (!apiKeys || apiKeys.split(",").some((key) => key.trim().length < 16)) {
    throw new Error("Every INGEST_API_KEYS value in .env must contain at least 16 characters");
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing from .env");

  const rawUploadDirectory = process.env.RAW_UPLOAD_DIR;
  if (rawUploadDirectory && !isAbsolute(rawUploadDirectory)) {
    process.env.RAW_UPLOAD_DIR = resolve(repositoryRoot, rawUploadDirectory);
  }
}

async function ensureDocker() {
  const docker = await findDocker();
  if (!docker) {
    throw new Error("Docker with Compose is required. Install OrbStack or Docker Desktop.");
  }
  if (await commandSucceeds(docker, ["info"], 5_000)) return docker;

  if (process.platform !== "darwin") {
    throw new Error("The Docker command exists, but its daemon is not running");
  }

  const orbStackExists = await pathExists("/Applications/OrbStack.app");
  const dockerDesktopExists = await pathExists("/Applications/Docker.app");
  const application = orbStackExists ? "OrbStack" : dockerDesktopExists ? "Docker" : null;
  if (!application) throw new Error("The Docker command exists, but its daemon is not running");

  logStep(`Starting ${application}`);
  await run("open", ["-a", application], { quiet: true });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await commandSucceeds(docker, ["info"], 5_000)) return docker;
    await delay(1_000);
  }
  throw new Error(`${application} did not become ready within 60 seconds`);
}

async function findDocker() {
  if (await commandSucceeds("docker", ["--version"], 5_000)) return "docker";
  for (const candidate of dockerCandidates) {
    if (await pathExists(candidate)) return candidate;
  }
  return null;
}

async function ensureCurrentCatalog() {
  const product = process.env.WOW_PRODUCT ?? "wow_anniversary";
  const locale = process.env.WOW_LOCALE ?? "enUS";
  const definitionsRevision = process.env.WOWDBDEFS_REVISION ?? defaultDefinitionsRevision;
  const wowRoot = resolve(process.env.WOW_ROOT ?? "/Applications/World of Warcraft");
  const build = await readInstalledBuild(wowRoot, product);
  const wowProductRoot = await findProductRoot(wowRoot, product);
  const hotfixHash = await readHotfixHash(wowProductRoot, locale);

  if (!hotfixHash) {
    throw new Error(
      `No ${locale} DBCache.bin exists for ${product}. Launch that client once before running development.`,
    );
  }

  if (
    await isCatalogPublished({
      product,
      buildNumber: build.buildNumber,
      locale,
      hotfixHash,
      definitionsRevision,
    })
  ) {
    logStep(`Catalog ${product} build ${build.buildNumber} is already published locally`);
    return { ...build, product, locale, hotfixHash, wowProductRoot, wowRoot };
  }

  const configuredOutput = process.env.CATALOG_OUTPUT;
  const catalogOutput = configuredOutput
    ? resolve(repositoryRoot, configuredOutput)
    : join(repositoryRoot, "artifacts/local-catalog", definitionsRevision.slice(0, 12));
  let manifestPath = await findMatchingManifest(catalogOutput, {
    product,
    buildNumber: build.buildNumber,
    locale,
    hotfixHash,
    definitionsRevision,
  });

  if (!manifestPath) {
    logStep(`Extracting ${product} build ${build.buildNumber} from the installed client`);
    await runPnpm(["extract:tbc"], {
      env: {
        ...process.env,
        CATALOG_OUTPUT: catalogOutput,
        WOW_PRODUCT: product,
        WOW_LOCALE: locale,
        WOW_ROOT: wowRoot,
        WOWDBDEFS_REVISION: definitionsRevision,
      },
    });
    manifestPath = await findMatchingManifest(catalogOutput, {
      product,
      buildNumber: build.buildNumber,
      locale,
      hotfixHash,
      definitionsRevision,
    });
    if (!manifestPath)
      throw new Error("Extraction finished without producing the expected manifest");
  } else {
    logStep(`Using existing catalog snapshot ${manifestPath}`);
  }

  logStep("Auditing catalog artifact integrity and item coverage");
  await runPnpm(["catalog:audit", manifestPath]);

  logStep("Validating catalog relationships");
  const validateArguments = ["catalog:validate", manifestPath];
  if (product === "wow_anniversary") validateArguments.push("--tbc-golden");
  await runPnpm(validateArguments);

  logStep("Importing and publishing the validated local catalog");
  await runPnpm(["catalog:import", manifestPath]);
  await runPnpm(["catalog:import", manifestPath, "--publish"]);
  return { ...build, product, locale, hotfixHash, wowProductRoot, wowRoot };
}

async function ensureCurrentItemIcons(catalog) {
  const iconIds = await readPublishedIconIds(catalog);
  if (iconIds.length === 0) {
    throw new Error(
      `Published catalog ${catalog.product} build ${catalog.buildNumber} contains no item icon IDs`,
    );
  }

  const outputDirectory = join(
    repositoryRoot,
    "artifacts/local-media",
    catalog.product,
    String(catalog.buildNumber),
    catalog.locale,
    catalog.hotfixHash,
  );
  if (await hasCompleteIconSet(outputDirectory, catalog, iconIds)) {
    logStep(`${iconIds.length.toLocaleString()} item icons are already available locally`);
    return join(outputDirectory, "icons");
  }

  await mkdir(outputDirectory, { recursive: true });
  const idsPath = join(outputDirectory, "icon-file-data-ids.txt");
  await writeFile(idsPath, `${iconIds.join("\n")}\n`, "utf8");
  logStep(`Extracting ${iconIds.length.toLocaleString()} item icons from the installed client`);
  await runPnpm(["extract:icons"], {
    env: {
      ...process.env,
      ICON_IDS_PATH: idsPath,
      ICON_OUTPUT: outputDirectory,
      WOW_LOCALE: catalog.locale,
      WOW_PRODUCT: catalog.product,
      WOW_ROOT: catalog.wowRoot,
    },
  });
  if (!(await hasCompleteIconSet(outputDirectory, catalog, iconIds))) {
    throw new Error("Item icon extraction finished without producing a complete icon set");
  }
  return join(outputDirectory, "icons");
}

async function readPublishedIconIds(catalog) {
  const databaseModuleUrl = pathToFileURL(join(repositoryRoot, "packages/db/dist/index.js")).href;
  const { createDatabase } = await import(databaseModuleUrl);
  const database = createDatabase(process.env.DATABASE_URL);
  try {
    const rows = await database.client`
      SELECT DISTINCT iv.icon_file_data_id AS "fileDataId"
      FROM item_version iv
      INNER JOIN game_build gb ON gb.id = iv.build_id
      WHERE gb.product = ${catalog.product}
        AND gb.build_number = ${catalog.buildNumber}
        AND gb.locale = ${catalog.locale}
        AND gb.hotfix_hash = ${catalog.hotfixHash}
        AND gb.status = 'published'
        AND iv.icon_file_data_id IS NOT NULL
        AND iv.icon_file_data_id > 0
      ORDER BY iv.icon_file_data_id
    `;
    return rows.map((row) => Number(row.fileDataId));
  } finally {
    await database.close();
  }
}

async function hasCompleteIconSet(outputDirectory, catalog, iconIds) {
  try {
    const manifest = JSON.parse(await readFile(join(outputDirectory, "manifest.json"), "utf8"));
    if (
      manifest.schemaVersion !== "item-icon-manifest.v1" ||
      manifest.product !== catalog.product ||
      manifest.clientVersion !== catalog.version ||
      manifest.buildNumber !== catalog.buildNumber ||
      !Array.isArray(manifest.icons) ||
      !Array.isArray(manifest.unavailableIcons) ||
      manifest.icons.length + manifest.unavailableIcons.length !== iconIds.length
    ) {
      return false;
    }

    const manifestedIds = new Set([
      ...manifest.icons.map((icon) => icon.fileDataId),
      ...manifest.unavailableIcons.map((icon) => icon.fileDataId),
    ]);
    if (iconIds.some((fileDataId) => !manifestedIds.has(fileDataId))) return false;
    const filenames = new Set(await readdir(join(outputDirectory, "icons")));
    return manifest.icons.every((icon) => filenames.has(`${icon.fileDataId}.png`));
  } catch (error) {
    if (error instanceof SyntaxError || error?.code === "ENOENT") return false;
    throw error;
  }
}

async function readInstalledBuild(wowRoot, product) {
  const path = join(wowRoot, ".build.info");
  const lines = (await readFile(path, "utf8")).split(/\r?\n/u).filter((line) => line.length > 0);
  if (lines.length < 2) throw new Error(`Invalid World of Warcraft build file: ${path}`);

  const headings = lines[0].split("|").map((heading) => heading.split("!")[0]);
  for (const line of lines.slice(1)) {
    const values = line.split("|");
    const record = Object.fromEntries(headings.map((heading, index) => [heading, values[index]]));
    if (record.Product !== product || record.Active !== "1") continue;

    const version = record.Version;
    const buildNumber = Number(version?.split(".").at(-1));
    if (!version || !Number.isSafeInteger(buildNumber) || buildNumber <= 0) {
      throw new Error(`Invalid version for active product ${product} in ${path}`);
    }
    return { buildNumber, version };
  }
  throw new Error(`No active ${product} row exists in ${path}`);
}

async function findProductRoot(wowRoot, product) {
  const entries = await readdir(wowRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const flavorPath = join(wowRoot, entry.name, ".flavor.info");
    let flavor;
    try {
      flavor = await readFile(flavorPath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    const flavorProduct = flavor.split(/\r?\n/u)[1]?.trim();
    if (flavorProduct !== product) continue;
    return join(wowRoot, entry.name);
  }
  throw new Error(`No installed directory declares product ${product}`);
}

async function readHotfixHash(wowProductRoot, locale) {
  const hotfixPath = join(wowProductRoot, "Cache", "ADB", locale, "DBCache.bin");
  try {
    return createHash("sha256")
      .update(await readFile(hotfixPath))
      .digest("hex");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function isCatalogPublished(target) {
  const databaseModuleUrl = pathToFileURL(join(repositoryRoot, "packages/db/dist/index.js")).href;
  const { createDatabase } = await import(databaseModuleUrl);
  const database = createDatabase(process.env.DATABASE_URL);
  try {
    const rows = await database.client`
      SELECT EXISTS (
        SELECT 1
        FROM game_build
        WHERE product = ${target.product}
          AND build_number = ${target.buildNumber}
          AND locale = ${target.locale}
          AND hotfix_hash = ${target.hotfixHash}
          AND definitions_revision = ${target.definitionsRevision}
          AND manifest ->> 'schemaVersion' = ${currentCatalogSchemaVersion}
          AND status = 'published'
      ) AS published
    `;
    return rows[0]?.published === true;
  } finally {
    await database.close();
  }
}

async function findMatchingManifest(directory, target) {
  if (!(await pathExists(directory))) return null;
  const manifests = await findFiles(directory, "manifest.json");
  const matches = [];
  for (const manifestPath of manifests) {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (
      manifest.product === target.product &&
      manifest.buildNumber === target.buildNumber &&
      manifest.locale === target.locale &&
      manifest.hotfix?.sha256 === target.hotfixHash &&
      manifest.definitions?.revision === target.definitionsRevision &&
      manifest.schemaVersion === currentCatalogSchemaVersion
    ) {
      matches.push({ manifestPath, extractedAt: String(manifest.extractedAt ?? "") });
    }
  }
  matches.sort((left, right) => right.extractedAt.localeCompare(left.extractedAt));
  return matches[0]?.manifestPath ?? null;
}

async function findMatchingWorldManifest(directory, target) {
  if (!(await pathExists(directory))) return null;
  const manifests = await findFiles(directory, "manifest.json");
  const matches = [];
  for (const manifestPath of manifests) {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (
      manifest.product === target.product &&
      manifest.buildNumber === target.buildNumber &&
      manifest.locale === target.locale &&
      manifest.definitions?.revision === target.definitionsRevision &&
      manifest.schemaVersion === currentWorldSchemaVersion &&
      manifest.extractor?.version === currentWorldExtractorVersion
    ) {
      matches.push({ manifestPath, extractedAt: String(manifest.extractedAt ?? "") });
    }
  }
  matches.sort((left, right) => right.extractedAt.localeCompare(left.extractedAt));
  return matches[0]?.manifestPath ?? null;
}

async function findFiles(directory, filename) {
  const matches = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) matches.push(...(await findFiles(path, filename)));
    else if (entry.isFile() && entry.name === filename) matches.push(path);
  }
  return matches;
}

function upsertEnvironmentValue(contents, name, value) {
  const line = `${name}=${value}`;
  const expression = new RegExp(`^${name}=.*$`, "mu");
  if (expression.test(contents)) return contents.replace(expression, line);
  return `${contents.trimEnd()}\n${line}\n`;
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function runPnpm(arguments_, options = {}) {
  return run("pnpm", arguments_, options);
}

function run(command, arguments_, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, arguments_, {
      cwd: repositoryRoot,
      env: options.env ?? process.env,
      stdio: options.quiet ? "ignore" : "inherit",
    });
    const forwardInterrupt = () => child.kill("SIGINT");
    const forwardTermination = () => child.kill("SIGTERM");
    const cleanup = () => {
      process.off("SIGINT", forwardInterrupt);
      process.off("SIGTERM", forwardTermination);
    };
    process.once("SIGINT", forwardInterrupt);
    process.once("SIGTERM", forwardTermination);
    child.once("error", (error) => {
      cleanup();
      reject(error);
    });
    child.once("exit", (code, signal) => {
      cleanup();
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited with ${signal ?? `code ${String(code)}`}`));
    });
  });
}

function commandSucceeds(command, arguments_, timeoutMilliseconds) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, arguments_, { stdio: "ignore" });
    const timeout = setTimeout(() => child.kill("SIGKILL"), timeoutMilliseconds);
    let settled = false;
    const settle = (succeeded) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolvePromise(succeeded);
    };
    child.once("error", () => {
      settle(false);
    });
    child.once("exit", (code) => {
      settle(code === 0);
    });
  });
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function logStep(message) {
  process.stdout.write(`\n[dev] ${message}\n`);
}
