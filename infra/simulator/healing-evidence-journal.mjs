import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { createInterface } from "node:readline";

/** Read completed evidence without converting an entire multi-gigabyte journal into one string.
 * @param {string} path @returns {AsyncGenerator<object>}
 */
export async function* readHealingEvidenceJournal(path) {
  const file = await open(path, "r");
  try {
    const info = await file.stat();
    if (info.size === 0) return;
    const last = Buffer.alloc(1);
    await file.read(last, 0, 1, info.size - 1);
    assert.equal(
      last[0],
      10,
      "Unterminated healing evidence record; preserve and recover the journal before resuming",
    );
  } finally {
    await file.close();
  }
  const stream = createReadStream(path),
    lines = createInterface({ input: stream, crlfDelay: Infinity });
  let lineNumber = 0;
  try {
    for await (const line of lines) {
      lineNumber++;
      if (!line.trim()) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch (error) {
        throw new Error("Invalid healing evidence JSON at line " + lineNumber, { cause: error });
      }
      assert(
        row && typeof row === "object" && !Array.isArray(row),
        "Invalid healing evidence record at line " + lineNumber,
      );
      yield row;
    }
  } finally {
    lines.close();
    stream.destroy();
  }
}

/** @param {string} path @returns {Promise<string>} */
export async function healingEvidenceJournalSha256(path) {
  const digest = createHash("sha256"),
    stream = createReadStream(path);
  for await (const bytes of stream) digest.update(bytes);
  return digest.digest("hex");
}
