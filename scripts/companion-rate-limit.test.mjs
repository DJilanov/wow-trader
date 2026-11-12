import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

test("history pages have an independent allowance and edge limits advertise a safe retry", async () => {
  const config = await readFile(
    new URL("../infra/nginx/helper.kfcguild.online.conf", import.meta.url),
    "utf8",
  );
  const location = /location = \/v1\/market-intelligence \{([^}]+)\}/.exec(config)?.[1];
  assert(location);
  assert.match(config, /zone=kfc_helper_market_read:10m rate=30r\/m;/);
  assert.match(location, /limit_req zone=kfc_helper_market_read burst=5 nodelay;/);
  assert.doesNotMatch(location, /zone=kfc_helper_ingest/);
  assert.match(location, /proxy_pass http:\/\/127\.0\.0\.1:19211;/);
  assert.match(location, /error_page 429 = @kfc_helper_rate_limited;/);
  assert.match(config, /zone=kfc_helper_ingest:10m rate=10r\/m;/);
  assert.match(config, /location \/v1\/ \{\s*limit_req zone=kfc_helper_ingest burst=5 nodelay;/);
  assert.match(config, /add_header Retry-After 6 always;/);
  assert.match(config, /add_header Cache-Control "no-store" always;/);
  assert.match(config, /return 429 '\{"error":"rate_limited"/);
  assert.doesNotMatch(config, /proxy_intercept_errors on;/);
});
