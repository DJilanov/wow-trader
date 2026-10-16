import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";
import {
  access,
  cp,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import console from "node:console";

const root = resolve(import.meta.dirname, "..");
const source = join(root, ".cache/forever-sim-upstream");
const toolchain = join(root, ".cache/simulator-toolchain");
const output = resolve(
  process.env.FOREVER_SIMULATOR_ROOT || join(root, "artifacts/forever-simulator"),
);
const configuration = join(root, "infra/simulator/upstream.json");

export async function prepareSimulator() {
  const configRaw = await readFile(configuration);
  const config = JSON.parse(configRaw);
  if (
    !/^[a-f0-9]{40}$/.test(config.revision) ||
    config.repository !== "https://github.com/gunba/wow-forever-sim.git"
  )
    throw new Error("Invalid pinned simulator source");
  const overlay = await readFile(join(root, "infra/simulator/host-adapter.mjs"));
  const vendorRaw = await readFile(join(root, "infra/simulator/vendors.json"));
  const builder = await readFile(fileURLToPath(import.meta.url));
  const release = sha(Buffer.concat([configRaw, overlay, vendorRaw, builder])).slice(0, 24);
  await mkdir(output, { recursive: true });
  const lockPath = join(output, ".build.lock");
  const lock = await open(lockPath, "wx", 0o600);
  const temporary = join(output, `.staging-${randomUUID()}`);
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, release }));
    const destination = join(output, release);
    const existing = await loadManifest(destination);
    if (existing) {
      await verifyFiles(destination, existing.files);
      await atomicJson(join(output, "active.json"), existing);
      console.log(`[simulator] Verified existing all-class release ${release}`);
      return existing;
    }
    const created = !(await exists(join(source, ".git")));
    if (created)
      await run(
        "git",
        ["clone", "--filter=blob:none", "--no-checkout", config.repository, source],
        root,
      );
    const head = await run("git", ["rev-parse", "HEAD"], source, undefined, true);
    if (created) await run("git", ["checkout", "--detach", config.revision], source);
    else if (head.trim() !== config.revision) {
      const dirty = await run("git", ["status", "--porcelain"], source, undefined, true);
      if (dirty.trim())
        throw new Error(
          "Simulator checkout has changes; use a separate clean cache rather than resetting it",
        );
      await run("git", ["fetch", "--depth=1", "origin", config.revision], source);
      await run("git", ["checkout", "--detach", config.revision], source);
    }
    if (!(await exists(join(source, "node_modules/.package-lock.json"))))
      await run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], source);
    const go = await ensureGo(config);
    const environment = {
      ...process.env,
      PATH: `${dirname(go)}:${join(toolchain, "bin")}:${join(source, "node_modules/.bin")}:${process.env.PATH ?? ""}`,
      GOBIN: join(toolchain, "bin"),
      GOTOOLCHAIN: "local",
      SITE_BASE: `/forever-sim/${release}/`,
      SITE_REPO: "gunba/wow-forever-sim",
    };
    await mkdir(environment.GOBIN, { recursive: true });
    if (!(await exists(join(environment.GOBIN, "protoc-gen-go"))))
      await run(
        go,
        ["install", "google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.6"],
        source,
        environment,
      );
    // Pin the compiler wrapper too; do not resolve a different latest protoc on the next machine.
    const npmPackage = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
    npmPackage.config = { ...npmPackage.config, protocVersion: "36.2" };
    await writeFile(join(source, "package.json"), JSON.stringify(npmPackage, null, 2));
    await run("make", ["proto"], source, environment);
    const { adaptSource, hostSimulatorAssets } = await import(
      `../infra/simulator/host-adapter.mjs`
    );
    const data = await adaptSource(source);
    await run(
      go,
      ["run", "./tools/database/gen_db", "-outDir=assets", "-gen=db"],
      source,
      environment,
    );
    // This is our generated build cache, not source or a published release. Old hashed bundles
    // otherwise accumulate and can carry references to a previous release into a new manifest.
    await rm(join(source, "dist/classic"), { recursive: true, force: true });
    await run("make", ["dist/classic/.dirstamp"], source, environment);
    await cp(join(source, "dist/classic"), temporary, { recursive: true });
    await hostSimulatorAssets(temporary, `/forever-sim/${release}/`, JSON.parse(vendorRaw));
    await cp(join(source, "LICENSE"), join(temporary, "LICENSE.txt"));
    const pages = [];
    for (const entry of await readdir(temporary, { withFileTypes: true }))
      if (entry.isDirectory() && (await exists(join(temporary, entry.name, "index.html"))))
        pages.push(entry.name);
    const files = await indexFiles(temporary, "", release);
    const manifest = {
      schema: "kfc-forever-simulator.v1",
      release,
      upstream: "https://github.com/gunba/wow-forever-sim",
      revision: config.revision,
      preparedAt: new Date().toISOString(),
      itemCount: data.itemCount,
      excludedModeledItems: data.excludedModeledItems,
      pages: pages.sort(),
      files,
      dataProvenance: "pinned-upstream-forever-data",
      mechanicsStatus: "beta_model",
    };
    await atomicJson(join(temporary, "manifest.json"), manifest);
    await rename(temporary, destination);
    await atomicJson(join(output, "active.json"), manifest);
    console.log(
      `[simulator] Prepared ${pages.length} pages with ${data.itemCount} real-source items, ${data.excludedModeledItems} projected items excluded`,
    );
    return manifest;
  } finally {
    if (await exists(temporary)) await rm(temporary, { recursive: true });
    await lock.close();
    await unlink(lockPath);
  }
}

async function ensureGo(config) {
  const go = join(toolchain, "go/bin/go");
  if (await exists(go)) return go;
  const hash = config.goDownloads[`${process.platform}-${process.arch}`];
  if (!/^[a-f0-9]{64}$/.test(hash ?? ""))
    throw new Error("No verified Go toolchain for this platform; set up the supported build host");
  await mkdir(toolchain, { recursive: true });
  const archiveName = `${config.toolchain}.${process.platform}-${process.arch === "x64" ? "amd64" : process.arch}.tar.gz`;
  const archive = join(toolchain, archiveName);
  const response = await globalThis.fetch(`https://go.dev/dl/${archiveName}`, {
    signal: globalThis.AbortSignal.timeout(180000),
  });
  if (!response.ok) throw new Error(`Go download HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (sha(bytes) !== hash) throw new Error("Go archive checksum mismatch");
  await writeFile(archive, bytes);
  await run("tar", ["-xzf", archive, "-C", toolchain], root);
  return go;
}

async function indexFiles(directory, prefix, release) {
  const files = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error("Simulator release must not contain symlinks");
    if (entry.isDirectory())
      Object.assign(files, await indexFiles(join(directory, entry.name), relative + "/", release));
    else if (entry.isFile() && !entry.name.startsWith(".")) {
      const bytes = await readFile(join(directory, entry.name));
      if (/\.(html|js|css)$/.test(entry.name)) {
        for (const match of bytes.toString("utf8").matchAll(/\/forever-sim\/([a-f0-9]{24})\//g))
          if (match[1] !== release)
            throw new Error(`Mixed simulator release reference: ${relative}`);
      }
      files[relative] = { bytes: bytes.length, sha256: sha(bytes) };
    }
  }
  return files;
}

async function verifyFiles(directory, files) {
  for (const [name, expected] of Object.entries(files)) {
    const path = resolve(directory, name);
    if (!path.startsWith(directory + "/")) throw new Error("Invalid simulator file path");
    const bytes = await readFile(path);
    if (bytes.length !== expected.bytes || sha(bytes) !== expected.sha256)
      throw new Error(`Simulator asset integrity failed: ${name}`);
  }
}

async function loadManifest(directory) {
  try {
    return JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}
async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}
async function atomicJson(path, value) {
  const temp = path + "." + randomUUID() + ".tmp";
  try {
    await writeFile(temp, JSON.stringify(value), { flag: "wx" });
    await rename(temp, path);
  } finally {
    await unlink(temp).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
}
function sha(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
async function run(command, args, cwd, env = process.env, capture = false) {
  return new Promise((resolve_, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "",
      errors = "";
    child.stdout.on("data", (chunk) => {
      output = (output + chunk).slice(-100000);
    });
    child.stderr.on("data", (chunk) => {
      errors = (errors + chunk).slice(-20000);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        if (!capture) console.log(`[simulator] ${command} ${args[0]} completed`);
        resolve_(output);
      } else
        reject(
          new Error(
            `${command} exited with ${code}\n${output.slice(-4000)}\n${errors.slice(-4000)}`,
          ),
        );
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  prepareSimulator().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
