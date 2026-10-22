import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import process from "node:process";

const repository = resolve(import.meta.dirname, "..");
const cache = join(repository, ".cache", "restedxp");
const addon = join(cache, "v4.11.27");
const revision = "ce1e51daf5e0f5cf727903d82e7269947ac27d73";
const luaRoot = join(cache, "lua-5.1.5");
const luaArchive = join(cache, "lua-5.1.5.tar.gz");
const luaSha256 = "2640fc56a795f29d28ef15e13c34a47e223960b0240e8cb0a82d9b0738695333";

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

await mkdir(cache, { recursive: true });
if (!(await exists(addon)))
  execFileSync(
    "git",
    [
      "clone",
      "--depth",
      "1",
      "--branch",
      "v4.11.27",
      "--single-branch",
      "https://github.com/RestedXP/RXPGuides.git",
      addon,
    ],
    { stdio: "inherit" },
  );
assert.equal(
  execFileSync("git", ["-C", addon, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  revision,
  "Unexpected RestedXP source revision",
);
execFileSync(
  "git",
  [
    "-C",
    addon,
    "diff",
    "--exit-code",
    "HEAD",
    "--",
    "GuideLoader.lua",
    "functions.lua",
    "libs/LibDeflate/LibDeflate.lua",
    "libs/plc/base64.lua",
  ],
  { stdio: "ignore" },
);

if (!(await exists(luaArchive))) {
  const response = await globalThis.fetch("https://www.lua.org/ftp/lua-5.1.5.tar.gz", {
    signal: globalThis.AbortSignal.timeout(30000),
  });
  assert(response.ok, "Could not download official Lua source");
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert(bytes.length <= 300000);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    luaSha256,
    "Lua source checksum mismatch",
  );
  await writeFile(luaArchive, bytes, { flag: "wx" });
}
assert.equal(
  createHash("sha256")
    .update(await readFile(luaArchive))
    .digest("hex"),
  luaSha256,
);
if (!(await exists(luaRoot))) {
  const entries = execFileSync("tar", ["-tzf", luaArchive], { encoding: "utf8" })
    .trim()
    .split("\n");
  assert(
    entries.every((entry) => entry.startsWith("lua-5.1.5/") && !entry.split("/").includes("..")),
  );
  await mkdir(luaRoot);
  execFileSync("tar", ["-xzf", luaArchive, "--strip-components=1", "-C", luaRoot]);
}
const binary = join(luaRoot, "src", "lua");
if (!(await exists(binary)))
  execFileSync("make", ["-C", luaRoot, "generic"], { stdio: "inherit", timeout: 120000 });
const version = execFileSync(binary, ["-e", "io.write(_VERSION)"], { encoding: "utf8" });
assert.equal(version, "Lua 5.1");
process.stdout.write(
  JSON.stringify({
    status: "prepared",
    addon,
    revision,
    lua: binary,
    luaSourceSha256: luaSha256,
    systemInstallationModified: false,
  }) + "\n",
);
