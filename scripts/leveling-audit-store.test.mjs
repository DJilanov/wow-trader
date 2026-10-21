import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGunzip, gunzipSync } from "node:zlib";
import { Buffer, constants } from "node:buffer";
import { createReadStream } from "node:fs";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import test from "node:test";
import { writeCampaignAudit } from "./leveling-audit-store.mjs";

test("streams the complete canonical audit with matching semantic and file checksums", async () => {
  const root = await mkdtemp(join(tmpdir(), "leveling-audit-store-"));
  try {
    const report = {
      schema: "fixture",
      optional: undefined,
      projections: [
        { race: "human", text: 'Unicode: é\nquoted: "', steps: [1, 2] },
        null,
        { race: "dwarf", text: "different edition" },
      ],
      summary: { ready: false },
      routeCoveragePassed: false,
    };
    const canonical = JSON.stringify(report);
    for (const gzip of [false, true]) {
      const result = await writeCampaignAudit(root, report, { gzip });
      const stored = await readFile(result.path);
      const raw = gzip ? gunzipSync(stored) : stored;
      assert.equal(raw.toString(), canonical + "\n");
      assert.deepEqual(JSON.parse(raw), JSON.parse(canonical));
      assert.equal(result.sha256, createHash("sha256").update(canonical).digest("hex"));
      assert.equal(result.fileSha256, createHash("sha256").update(stored).digest("hex"));
      assert.equal(result.bytes, stored.length);
      assert.equal(result.jsonBytes, Buffer.byteLength(canonical));
      assert.deepEqual(await writeCampaignAudit(root, report, { gzip }), result);
      await writeFile(result.path, "corrupt existing artifact");
      await assert.rejects(writeCampaignAudit(root, report, { gzip }), /not overwritten/);
      assert.equal(await readFile(result.path, "utf8"), "corrupt existing artifact");
    }
    assert.equal(
      (await readdir(root)).some((file) => file.endsWith(".tmp")),
      false,
    );
    const before = await readdir(root);
    await assert.rejects(writeCampaignAudit(root, { invalid: 1n }), /BigInt/);
    assert.deepEqual(await readdir(root), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stores and verifies a complete matrix beyond Node's single-string limit without truncation", async () => {
  const root = await mkdtemp(join(tmpdir(), "leveling-audit-large-"));
  try {
    const entry = { text: "x".repeat(1024 * 1024) };
    const serialized = JSON.stringify(entry);
    const count = Math.ceil(constants.MAX_STRING_LENGTH / serialized.length) + 1;
    const report = { projections: Array(count).fill(entry) };
    const expected = createHash("sha256").update('{"projections":[');
    for (let index = 0; index < count; index++) {
      if (index) expected.update(",");
      expected.update(serialized);
    }
    expected.update("]}");
    const semanticHash = expected.copy().digest("hex");
    expected.update("\n");
    const result = await writeCampaignAudit(root, report, { gzip: true });
    assert.ok(result.jsonBytes > constants.MAX_STRING_LENGTH);
    assert.equal(result.sha256, semanticHash);
    assert.ok(result.bytes < 10_000_000);
    let decodedBytes = 0;
    const decodedHash = createHash("sha256");
    await pipeline(
      createReadStream(result.path),
      createGunzip(),
      new Writable({
        write(chunk, _encoding, callback) {
          decodedHash.update(chunk);
          decodedBytes += chunk.length;
          callback();
        },
      }),
    );
    assert.equal(decodedHash.digest("hex"), expected.digest("hex"));
    assert.equal(decodedBytes, result.jsonBytes + 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
