import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";

import { verifySiteAssets } from "./smoke-site-assets.mjs";

/** @param {import('node:test').TestContext} t @param {{cssStatus?: number, imageType?: string, redirectTo?: string}} options */
async function fixture(t, options = {}) {
  const server = createServer((request, response) => {
    if (request.url === "/") {
      if (options.redirectTo) {
        response.writeHead(301, { location: options.redirectTo });
        response.end();
        return;
      }
      response.setHeader("content-type", "text/html");
      response.end(
        '<link rel="stylesheet" href="/_next/static/style.css"><script src="/_next/static/app.js"></script><img src="/tools/_next/image?url=%2Ftools%2Flogo.jpg&amp;w=64&amp;q=75"><img src="/tools/api/item-icons/123">',
      );
    } else if (request.url === "/_next/static/style.css") {
      response.writeHead(options.cssStatus ?? 200, { "content-type": "text/css" });
      response.end("body { display: block }");
    } else if (request.url === "/_next/static/app.js") {
      response.setHeader("content-type", "application/javascript");
      response.end("export {};");
    } else if (
      request.url === "/tools/_next/image?url=%2Ftools%2Flogo.jpg&w=64&q=75" ||
      request.url === "/tools/api/item-icons/123"
    ) {
      response.setHeader("content-type", options.imageType ?? "image/jpeg");
      response.end("image bytes");
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  t.after(
    () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}/`;
}

test("checks styles, scripts and optimized images including HTML-escaped queries", async (t) => {
  const origin = await fixture(t);
  assert.deepEqual(await verifySiteAssets([origin]), { pages: 1, assets: 4 });
});

test("fails when HTML loads but its stylesheet is missing", async (t) => {
  const origin = await fixture(t, { cssStatus: 500 });
  await assert.rejects(verifySiteAssets([origin]), /HTTP 500.*style\.css/u);
});

test("rejects image requests that return an HTML page with status 200", async (t) => {
  const origin = await fixture(t, { imageType: "text/html" });
  await assert.rejects(verifySiteAssets([origin]), /HTTP 200 text\/html/u);
});

test("checks the destination's assets after a canonical cross-origin redirect", async (t) => {
  const destination = await fixture(t);
  const legacyOrigin = await fixture(t, { redirectTo: destination });
  assert.deepEqual(await verifySiteAssets([legacyOrigin]), { pages: 1, assets: 4 });
});
