# Companion history download rate limit — November 6, 2026

## Cause

`Market intelligence download failed: HTTP 429` came from the Companion's history
download, after the AH scan had already uploaded. The affected scan contained
1,996 markets for Forever build 70790. Nginx logs showed history page requests
rejected by the upload limiter, `kfc_helper_ingest`, at 10 requests per minute
with a burst of five. Uploads, receipt requests and history pages all consumed
that same allowance. The old Companion retried only once after one second when
the edge response did not include `Retry-After`, so it immediately hit the same
limit and restarted the history download on its next reconciliation.

## Fix

- The exact `/v1/market-intelligence` endpoint has a separate IP allowance of
  30 requests per minute, with a burst of five. Uploads and their receipts keep
  their existing 10-per-minute allowance. Authentication and API limits remain.
- Edge-generated 429 responses include JSON, `Retry-After: 6`, and
  `Cache-Control: no-store`. Upstream API error responses remain intact.
- Companion 0.3.9 retries the same pinned page up to five times, honours either
  the seconds or HTTP-date form of `Retry-After`, and uses a 6–60 second
  exponential delay when the header is missing or invalid. A five-minute overall
  deadline and shutdown cancellation still bound the download.
- Completed uploads stay acknowledged if history fails. Remaining world/account
  work for that saved file can finish, and the failure explicitly says that saved
  uploads are retained. The last complete generated history file remains until
  every page has validated; partial downloads are never installed.

The Nginx behaviour follows the [official rate-limit module documentation](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html).
The retry header accepts the forms specified by [HTTP Semantics](https://httpwg.org/specs/rfc9110.html#field.retry-after).

## Verification and delivery

The original configuration reproduced the collision in an isolated Nginx
instance: exhausting the upload allowance rejected all four history pages. The
candidate passed the same test: uploads remained limited, history pages reached
the authenticated upstream independently, read exhaustion still returned 429,
and retry succeeded after the advertised delay. Query strings and upstream 401
responses were preserved.

The production Helper configuration was activated with a checksum guard, backup,
`nginx -t`, graceful reload and service-health check. No application restart,
database migration, apex configuration change or other site deployment was used.
Rollback configuration:
`/etc/nginx/sites-available/helper.kfcguild.online.before-market-read-20261106`.

Companion 0.3.9 was packaged for macOS arm64, signature-integrity checked and
installed on the maintainer Mac. Settings, encrypted credential file, WoW saved
variables and installed addon modules were preserved. A real installed renderer
check showed `up_to_date`, no error, zero pending scans and the processed receipt
for all 1,996 markets. The generated `MarketData.lua` contained all 1,996 items
for the exact build and realm. Restart WoW or `/reload` to load that history.

Focused commands:

```sh
pnpm --filter @wow-trader/companion-core test
pnpm --filter @wow-trader/companion-core typecheck
pnpm --filter @wow-trader/desktop test
pnpm --filter @wow-trader/desktop typecheck
node --test scripts/companion-rate-limit.test.mjs scripts/seo-site-migration.test.mjs
pnpm --filter @wow-trader/companion-core build
pnpm --filter @wow-trader/desktop build
```

Private build, installation, runtime and isolated-Nginx evidence lives in
`artifacts/companion-rate-limit-20261106/`. The public cross-platform installer
release has not been replaced by this local macOS update. No source commit or
push was requested for this repair.
