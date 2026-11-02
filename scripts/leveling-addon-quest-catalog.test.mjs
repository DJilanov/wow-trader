import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readAddonQuestCatalog } from "./leveling-addon-quest-catalog.mjs";

const archive = "a".repeat(64);
async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), "leveling-addon-catalog-"));
  try {
    const data = {
      schema: "forever-quest-funding-catalog.v1",
      targetBuild: 70205,
      publication: "private-reference",
      authorizationNote: "",
      providerRevision: "a".repeat(40),
      questSha256: archive,
      npcSha256: archive,
      areaMapSha256: archive,
      includesAuthoredCorrections: false,
      sourceArchiveSha256: archive,
      quests: [],
    };
    const raw = JSON.stringify(data),
      sha256 = createHash("sha256").update(raw).digest("hex"),
      file = `quest-catalog-${sha256}.json`;
    await writeFile(join(root, file), raw);
    const manifest = {
      schema: "forever-quest-funding-manifest.v1",
      targetBuild: 70205,
      sha256,
      file,
    };
    await writeFile(join(root, "manifest.json"), JSON.stringify(manifest));
    await run({ root, data, raw, manifest });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("a local catalog review is opt-in and never changes private publication", async () => {
  assert.equal(await readAddonQuestCatalog(null, 70205, archive), null);
  await fixture(async ({ root, data, raw, manifest }) => {
    assert.deepEqual(await readAddonQuestCatalog(root, 70205, archive), {
      data,
      revision: manifest.sha256,
    });
    assert.equal(await readFile(join(root, manifest.file), "utf8"), raw);
    assert.equal(
      JSON.parse(await readFile(join(root, "manifest.json"), "utf8")).sha256,
      manifest.sha256,
    );
  });
});

test("rejects mismatched builds, archive identities, corruption and oversized manifests", async () => {
  await fixture(async ({ root, manifest }) => {
    await assert.rejects(readAddonQuestCatalog(root, 70450, archive), /manifest build differs/);
    await assert.rejects(readAddonQuestCatalog(root, 70205, "b".repeat(64)), /identity differs/);
    await writeFile(join(root, manifest.file), "{}");
    await assert.rejects(readAddonQuestCatalog(root, 70205, archive), /checksum mismatch/);
    await writeFile(join(root, "manifest.json"), " ".repeat(4001));
    await assert.rejects(readAddonQuestCatalog(root, 70205, archive), /regular-file budget/);
  });
});
