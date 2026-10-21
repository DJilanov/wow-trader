import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { join, relative, isAbsolute, resolve } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL, URL } from "node:url";
import process from "node:process";
import console from "node:console";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { isPublicDeliveryAsset } from "./prepare-static-delivery.mjs";

const checksum = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function verifyStaticDelivery(
  directory,
  { baseUrl, fetcher = globalThis.fetch } = {},
) {
  const root = await realpath(resolve(directory)),
    report = JSON.parse(await readFile(join(root, "completed.json")));
  assert.equal(report.schema, "kfc-static-delivery.v1");
  assert(Array.isArray(report.files) && report.files.length > 0 && report.files.length <= 300_000);
  const publicRoot = await realpath(join(root, "public"));
  let checked = 0,
    variants = 0;
  for (const file of report.files) {
    assert(/^\/(?:forever-sim\/[a-f0-9]{24}|(?:tools\/)?_next\/static)\//.test(file.url));
    assert(isPublicDeliveryAsset(file.url.slice(1)), "Verification rejected a nonpublic asset");
    const path = await realpath(join(publicRoot, file.url.slice(1))),
      offset = relative(publicRoot, path);
    assert(offset && !isAbsolute(offset) && offset !== ".." && !offset.startsWith("../"));
    const bytes = await readFile(path);
    assert.equal(bytes.length, file.bytes);
    assert.equal(checksum(bytes), file.sha256);
    for (const [name, metadata] of Object.entries(file.encodings)) {
      assert(["gzip", "br"].includes(name));
      const encodedPath = await realpath(path + (name === "gzip" ? ".gz" : ".br")),
        encodedOffset = relative(publicRoot, encodedPath);
      assert(
        encodedOffset &&
          !isAbsolute(encodedOffset) &&
          encodedOffset !== ".." &&
          !encodedOffset.startsWith("../"),
      );
      const encoded = await readFile(encodedPath);
      assert.equal(encoded.length, metadata.bytes);
      assert.equal(checksum(encoded), metadata.sha256);
      assert.equal(
        checksum(name === "gzip" ? gunzipSync(encoded) : brotliDecompressSync(encoded)),
        file.sha256,
      );
      variants++;
    }
    checked++;
  }
  const http = [];
  if (baseUrl) {
    const base = new URL(baseUrl);
    assert(
      ["http:", "https:"].includes(base.protocol) &&
        !base.username &&
        !base.password &&
        !base.search &&
        !base.hash,
    );
    const representative =
      report.files.find((file) => file.url.endsWith("/lib.wasm") && file.encodings.gzip) ??
      report.files.find((file) => file.encodings.gzip);
    assert(representative, "HTTP verification requires a compressible representative");
    const request = async (url, options = {}) =>
      fetcher(new URL(url, base), {
        signal: globalThis.AbortSignal.timeout(120000),
        redirect: "error",
        ...options,
      });
    const head = await request(representative.url, {
      method: "HEAD",
      headers: { "accept-encoding": "gzip" },
    });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get("content-encoding"), "gzip");
    assert.equal(Number(head.headers.get("content-length")), representative.encodings.gzip.bytes);
    assert.match(head.headers.get("vary") ?? "", /\baccept-encoding\b/i);
    assert.match(head.headers.get("cache-control") ?? "", /immutable/);
    if (representative.url.endsWith(".wasm"))
      assert.equal(head.headers.get("content-type"), "application/wasm");
    const etag = head.headers.get("etag");
    assert(etag);
    const compressed = await request(representative.url, {
      headers: { "accept-encoding": "gzip" },
    });
    assert.equal(compressed.status, 200);
    assert.equal(compressed.headers.get("content-encoding"), "gzip");
    const decoded = await compressed.arrayBuffer();
    assert.equal(decoded.byteLength, representative.bytes);
    assert.equal(checksum(new Uint8Array(decoded)), representative.sha256);
    const identity = await request(representative.url, {
      method: "HEAD",
      headers: { "accept-encoding": "gzip;q=0, br;q=0, identity" },
    });
    assert.equal(identity.status, 200);
    assert.equal(identity.headers.get("content-encoding"), null);
    assert.equal(Number(identity.headers.get("content-length")), representative.bytes);
    const cached = await request(representative.url, {
      method: "HEAD",
      headers: { "accept-encoding": "gzip", "if-none-match": etag },
    });
    assert.equal(cached.status, 304);
    const release = /^\/forever-sim\/([a-f0-9]{24})\//.exec(representative.url)?.[1];
    if (release)
      for (const name of ["manifest.json", "kfc-reviewed-presets.json", "kfc-preset-safety.json"]) {
        const response = await request(`/forever-sim/${release}/${name}`, { method: "HEAD" });
        assert.equal(response.status, 404, "Private delivery leaked: " + name);
      }
    http.push({
      url: representative.url,
      compressedBytes: representative.encodings.gzip.bytes,
      originalBytes: representative.bytes,
      gzip: true,
      identity: true,
      conditional: true,
      privateProofsHidden: true,
    });
  }
  return { status: "static-delivery-verified", checked, variants, http, activated: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({
    options: { directory: { type: "string" }, "base-url": { type: "string" } },
  });
  assert(values.directory, "--directory is required");
  verifyStaticDelivery(values.directory, { baseUrl: values["base-url"] })
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error.stack ?? error.message);
      process.exitCode = 1;
    });
}
