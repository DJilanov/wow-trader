import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { readLevelingQuestAllowlist } from "./reference-publisher.mjs";

test("loads a checksum-bound unique Forever quest allowlist", async () => {
  const root = await mkdtemp(join(tmpdir(), "reference-publisher-"));
  try {
    const path = join(root, "queue.json");
    const tasks = [
      { game: "forever", kind: "quest", id: 308 },
      { game: "forever", kind: "quest", id: 1641 },
    ];
    const signature = createHash("sha256").update(JSON.stringify(tasks)).digest("hex");
    await writeFile(path, JSON.stringify(tasks));

    const result = await readLevelingQuestAllowlist(path, signature);

    assert.equal(result.signature, signature);
    assert.deepEqual([...result.ids], [308, 1641]);
    await assert.rejects(readLevelingQuestAllowlist(path, "0".repeat(64)), /checksum mismatch/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects duplicate or cross-edition leveling queue identities", async () => {
  const root = await mkdtemp(join(tmpdir(), "reference-publisher-"));
  try {
    const path = join(root, "queue.json");
    await writeFile(
      path,
      JSON.stringify([
        { game: "forever", kind: "quest", id: 308 },
        { game: "forever", kind: "quest", id: 308 },
      ]),
    );
    await assert.rejects(readLevelingQuestAllowlist(path), /duplicate IDs/);
    await writeFile(path, JSON.stringify([{ game: "tbc", kind: "quest", id: 308 }]));
    await assert.rejects(readLevelingQuestAllowlist(path), /non-Forever quest/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
