import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { test } from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const valuation = await readFile(
  path.join(root, "apps/addon/WowTraderCollector/ClientValuationData.lua"),
  "utf8",
);
const packBuild = Number(/\bclientBuild\s*=\s*(\d+)\b/u.exec(valuation)?.[1]);
assert.ok(Number.isSafeInteger(packBuild) && packBuild > 0);

for (const difference of [0, 1, -1]) {
  test(`bundle preflight checks the installed build (difference ${difference})`, async () => {
    const wowRoot = await mkdtemp(path.join(tmpdir(), "wow-trader-pack-build-"));
    const manifestPath = path.join(root, "apps/desktop/resources/addon-manifest.json");
    const before = await readFile(manifestPath);
    try {
      await mkdir(path.join(wowRoot, "_forever_"));
      await writeFile(path.join(wowRoot, "_forever_/.flavor.info"), "Flavor\nwowf\n");
      await writeFile(
        path.join(wowRoot, ".build.info"),
        `Product!STRING:0|Version!STRING:0|Active!DEC:1\nwowf|1.60.1.${packBuild + difference}|1\n`,
      );
      const result = spawnSync(
        process.execPath,
        ["scripts/prepare-addon-manifest.mjs", "--check", "--wow-root", wowRoot],
        { cwd: root, encoding: "utf8", timeout: 15_000 },
      );
      assert.ifError(result.error);
      if (difference === 0) {
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /file checksums verified/u);
      } else {
        assert.notEqual(result.status, 0);
        assert.match(
          result.stderr,
          /Disenchant data build .* does not match installed Forever build/u,
        );
      }
      assert.deepEqual(
        await readFile(manifestPath),
        before,
        "Preflight never rewrites the manifest",
      );
    } finally {
      await rm(wowRoot, { recursive: true, force: true });
    }
  });
}
