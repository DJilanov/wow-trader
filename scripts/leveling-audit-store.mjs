import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { link, mkdir, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { Buffer } from "node:buffer";

// Keep the full report contract, but never stringify the whole edition matrix at once.
function* reportChunks(report) {
  yield "{";
  let first = true;
  for (const [key, value] of Object.entries(report)) {
    if (value === undefined) continue;
    if (!first) yield ",";
    first = false;
    yield JSON.stringify(key) + ":";
    if (!Array.isArray(value)) {
      yield JSON.stringify(value);
      continue;
    }
    yield "[";
    for (let index = 0; index < value.length; index++) {
      if (index) yield ",";
      yield JSON.stringify(value[index]) ?? "null";
    }
    yield "]";
  }
  yield "}";
}

export async function writeCampaignAudit(destination, report, { gzip = false } = {}) {
  if (!report || typeof report !== "object" || Array.isArray(report))
    throw Error("Expected a campaign audit object");
  const root = resolve(destination);
  await mkdir(root, { recursive: true });
  const temporary = join(root, `.campaign-xp-audit-${randomUUID()}.tmp`);
  const semantic = createHash("sha256");
  const stored = createHash("sha256");
  let jsonBytes = 0;
  let bytes = 0;
  function* input() {
    for (const chunk of reportChunks(report)) {
      jsonBytes += Buffer.byteLength(chunk);
      if (jsonBytes > 2_000_000_000) throw Error("Audit exceeds its 2 GB report budget");
      semantic.update(chunk);
      yield chunk;
    }
    yield "\n";
  }
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      stored.update(chunk);
      bytes += chunk.length;
      callback(null, chunk);
    },
  });
  try {
    const streams = [Readable.from(input())];
    if (gzip) streams.push(createGzip({ level: 1 }));
    streams.push(counter, createWriteStream(temporary, { flags: "wx", mode: 0o600 }));
    await pipeline(streams);
    const sha256 = semantic.digest("hex");
    const fileSha256 = stored.digest("hex");
    const path = join(root, `campaign-xp-audit-${sha256.slice(0, 16)}.json${gzip ? ".gz" : ""}`);
    try {
      await link(temporary, path);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const existing = createHash("sha256");
      for await (const chunk of createReadStream(path)) existing.update(chunk);
      if (existing.digest("hex") !== fileSha256)
        throw Error("Existing immutable audit artifact differs; it was not overwritten");
    }
    return { path, sha256, fileSha256, bytes, jsonBytes, compression: gzip ? "gzip" : "none" };
  } finally {
    await unlink(temporary).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}
