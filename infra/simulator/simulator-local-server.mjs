import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".css": "text/css; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

export async function startSimulatorLocalServer(directory, manifest) {
  assert(/^[a-f0-9]{24}$/.test(manifest.release));
  assert(manifest.files && !Array.isArray(manifest.files));
  const root = await realpath(resolve(directory, manifest.release));
  const prefix = `/forever-sim/${manifest.release}/`;
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    try {
      if (!["GET", "HEAD"].includes(request.method)) {
        response.writeHead(405, { Allow: "GET, HEAD" });
        response.end();
        return;
      }
      let path;
      try {
        path = decodeURIComponent((request.url ?? "").split("?")[0]);
      } catch {
        response.writeHead(400);
        response.end();
        return;
      }
      assert(path.startsWith(prefix), "Unknown simulator release");
      let asset = path.slice(prefix.length);
      if (!asset || asset.endsWith("/")) asset += "index.html";
      assert(
        !asset.includes("\\") &&
          !asset.split("/").some((part) => !part || part === "." || part === ".."),
        "Invalid asset path",
      );
      const metadata = Object.hasOwn(manifest.files, asset) ? manifest.files[asset] : null;
      assert(metadata, "Unknown simulator asset");
      const file = await realpath(resolve(root, asset));
      assert(file.startsWith(root + sep), "Simulator asset escaped its release");
      const bytes = await readFile(file);
      if (
        bytes.length !== metadata.bytes ||
        createHash("sha256").update(bytes).digest("hex") !== metadata.sha256
      ) {
        response.writeHead(500);
        response.end("Simulator release integrity check failed");
        return;
      }
      response.writeHead(200, {
        "Content-Type": types[extname(asset)] ?? "application/octet-stream",
        "Content-Length": bytes.length,
      });
      response.end(request.method === "HEAD" ? undefined : bytes);
    } catch (error) {
      response.writeHead(["ERR_ASSERTION", "ENOENT", "ENOTDIR"].includes(error.code) ? 404 : 500);
      response.end();
    }
  });
  await new Promise((resolveReady, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolveReady();
    });
  });
  const address = server.address();
  assert(address && typeof address === "object");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    async close() {
      server.closeAllConnections();
      await new Promise((resolveClosed, reject) =>
        server.close((error) => (error ? reject(error) : resolveClosed())),
      );
    },
  };
}
