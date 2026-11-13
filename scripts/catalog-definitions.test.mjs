import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { resolveCatalogDefinitionsRevision } from "./catalog-definitions.mjs";

const execute = promisify(execFile);

test("definitions track pinned upstream commits without a matching build-name commit", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "catalog-definitions-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const upstream = join(root, "upstream");
  await mkdir(upstream);
  await execute("git", ["init", "--initial-branch=master", upstream]);
  await writeFile(join(upstream, "Item.dbd"), "COLUMNS\nint ID\n");
  async function commit(message) {
    await execute("git", ["-C", upstream, "add", "."]);
    await execute("git", [
      "-C",
      upstream,
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-m",
      message,
    ]);
    return (await execute("git", ["-C", upstream, "rev-parse", "HEAD"])).stdout.trim();
  }
  const first = await commit("Document a known table layout");
  async function run(command, args) {
    const localArgs = args.map((value) =>
      value === "https://github.com/wowdev/WoWDBDefs.git" ? upstream : value,
    );
    return execute(command, localArgs);
  }
  const checkout = join(root, "work/source");
  assert.equal(await resolveCatalogDefinitionsRevision(checkout, run), first);
  await writeFile(join(upstream, "Spell.dbd"), "COLUMNS\nint ID\n");
  const second = await commit("Add another table definition");
  assert.notEqual(first, second);
  assert.equal(await resolveCatalogDefinitionsRevision(checkout, run), second);
});

test("definitions reject invalid revisions and propagate fetch failures", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "catalog-definitions-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, ".git"));
  await assert.rejects(
    resolveCatalogDefinitionsRevision(root, async () => ({ stdout: "master\n" })),
    /exact Git commit/,
  );
  await assert.rejects(
    resolveCatalogDefinitionsRevision(root, async () => {
      throw new Error("Fetch failed");
    }),
    /Fetch failed/,
  );
});
