import assert from "node:assert/strict";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { isMainModule } from "./runtime-entrypoint.mjs";

test("main-module detection accepts a symlinked process entrypoint", async () => {
  const root = await mkdtemp(join(tmpdir(), "wow-trader-entrypoint-"));
  try {
    const release = join(root, "release.mjs");
    const current = join(root, "current.mjs");
    await writeFile(release, "export {};\n");
    await symlink(release, current);

    assert.equal(isMainModule(pathToFileURL(release).href, current), true);
    assert.equal(isMainModule(pathToFileURL(release).href, join(root, "missing.mjs")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
