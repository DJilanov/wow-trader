import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readAddonCombatReference } from "./leveling-addon-combat.mjs";

function dataset() {
  return {
    schema: "forever-combat-reference.v1",
    targetBuild: 70205,
    publication: "private-reference",
    authorizationNote: "",
    provider: {
      repository: "https://example.test/provider",
      revision: "a".repeat(40),
      layer: "forever-static-with-authored",
      npcSha256: "a".repeat(64),
      questSha256: "b".repeat(64),
      itemSha256: "c".repeat(64),
      limitations: ["Synthetic test fixture, not server evidence"],
    },
    npcs: [],
    quests: [],
    dungeons: [],
    killXpEvidence: [],
  };
}

async function fixture(data, run) {
  const root = await mkdtemp(join(tmpdir(), "leveling-addon-combat-"));
  try {
    const raw = typeof data === "string" ? data : JSON.stringify(data);
    const sha256 = createHash("sha256").update(raw).digest("hex");
    const file = `combat-${sha256}.json`;
    const manifest = { schema: "forever-combat-manifest.v1", targetBuild: 70205, sha256, file };
    await writeFile(join(root, file), raw);
    await writeFile(join(root, "manifest.json"), JSON.stringify(manifest));
    await run(root, manifest, raw);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("combat references are explicitly opt-in", async () => {
  assert.equal(await readAddonCombatReference(null, 70205), null);
});

test("a local review reads a checksum-valid private dataset without changing publication or bytes", async () => {
  const data = dataset();
  await fixture(data, async (root, manifest, raw) => {
    const before = await readFile(join(root, "manifest.json"), "utf8");
    const loaded = await readAddonCombatReference(root, 70205);
    assert.deepEqual(loaded, { data, revision: manifest.sha256 });
    assert.equal(await readFile(join(root, manifest.file), "utf8"), raw);
    assert.equal(await readFile(join(root, "manifest.json"), "utf8"), before);
  });
});

test("manifest and dataset builds must independently match the archive", async () => {
  await fixture(dataset(), async (root) => {
    await assert.rejects(readAddonCombatReference(root, 70450), /manifest build/);
    await assert.rejects(readAddonCombatReference(root, 0), /Invalid combat source build/);
  });
  await fixture({ ...dataset(), targetBuild: 70450 }, async (root) => {
    await assert.rejects(readAddonCombatReference(root, 70205), /dataset build/);
  });
});

test("corruption, path traversal, invalid schemas and oversized manifests fail closed", async () => {
  await fixture(dataset(), async (root, manifest) => {
    await writeFile(join(root, manifest.file), "{}");
    await assert.rejects(readAddonCombatReference(root, 70205), /checksum mismatch/);
    await writeFile(
      join(root, "manifest.json"),
      JSON.stringify({ ...manifest, file: "../other.json" }),
    );
    await assert.rejects(readAddonCombatReference(root, 70205), /manifest schema/);
    await writeFile(join(root, "manifest.json"), " ".repeat(4001));
    await assert.rejects(readAddonCombatReference(root, 70205), /regular-file budget/);
  });
  await fixture({ ...dataset(), publication: "automatically-approved" }, async (root) => {
    await assert.rejects(readAddonCombatReference(root, 70205), /reference schema/);
  });
  await fixture(" ".repeat(16_000_001), async (root) => {
    await assert.rejects(readAddonCombatReference(root, 70205), /regular-file budget/);
  });
});

test("malformed source content is not echoed in parse errors", async () => {
  const sentinel = "PRIVATE_TEST_CONTENT_NOT_FOR_ERROR_LOGS";
  await fixture(`not-json-${sentinel}`, async (root) => {
    await assert.rejects(readAddonCombatReference(root, 70205), (error) => {
      assert.equal(error.message, "Combat data is not valid JSON.");
      assert.equal(String(error).includes(sentinel), false);
      return true;
    });
  });
});

test("missing combat data cannot silently become a quest-only build", async () => {
  await fixture(dataset(), async (root, manifest) => {
    await rm(join(root, manifest.file));
    await assert.rejects(readAddonCombatReference(root, 70205), { code: "ENOENT" });
  });
});
