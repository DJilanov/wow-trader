import { spawn } from "node:child_process";
import { access, mkdir, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import console from "node:console";

const root = resolve(import.meta.dirname, "..");
const revision = "996e53f029c0213b223aecb94d754f6b4b9efb49";
const definitions = join(root, ".cache/wowdbdefs", revision);
const output = resolve(
  process.env.FOREVER_MECHANICS_OUTPUT ?? join(root, "artifacts/forever-mechanics"),
);
async function run(command, args, cwd = root) {
  await new Promise((resolve_, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve_() : reject(new Error(`${command} exited with ${code}`)),
    );
  });
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
async function main() {
  if (!(await exists(join(definitions, ".git")))) {
    await mkdir(definitions, { recursive: true });
    await run("git", ["init"], definitions);
    await run(
      "git",
      ["remote", "add", "origin", "https://github.com/wowdev/WoWDBDefs.git"],
      definitions,
    );
    await run("git", ["fetch", "--depth=1", "origin", revision], definitions);
    await run("git", ["checkout", "--detach", revision], definitions);
  }
  const { execFileSync } = await import("node:child_process");
  if (
    execFileSync("git", ["rev-parse", "HEAD"], { cwd: definitions, encoding: "utf8" }).trim() !==
    revision
  )
    throw new Error(
      "Definitions checkout differs from the reviewed revision; fetch and check out the pinned commit explicitly",
    );
  const dotnet = process.env.DOTNET_BIN ?? join(process.env.HOME ?? "", ".dotnet/dotnet");
  if (!(await exists(dotnet))) throw new Error("Set DOTNET_BIN to the installed .NET 10 SDK");
  await run(dotnet, [
    "run",
    "--project",
    "tools/extractor-dotnet/WowTrader.Extractor.csproj",
    "--",
    "mechanics-snapshot",
    "--wow-root",
    process.env.WOW_ROOT ?? "/Applications/World of Warcraft",
    "--product",
    "wow_classic_beta",
    "--locale",
    "enUS",
    "--region",
    "eu",
    "--definitions",
    join(definitions, "definitions"),
    "--definitions-revision",
    revision,
    "--output",
    output,
  ]);
  const snapshots = [];
  const walk = async (path) => {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const p = join(path, entry.name);
      if (entry.isDirectory()) await walk(p);
      else if (entry.name === "manifest.json") {
        const m = JSON.parse(await readFile(p, "utf8"));
        if (m.schema === "forever-mechanics-snapshot.v1")
          snapshots.push({ path: p, date: m.capturedAt });
      }
    }
  };
  await walk(output);
  snapshots.sort((a, b) => b.date.localeCompare(a.date));
  if (!snapshots[0]) throw new Error("No validated mechanics snapshot was produced");
  await run(process.execPath, ["scripts/import-forever-mechanics.mjs", snapshots[0].path]);
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
