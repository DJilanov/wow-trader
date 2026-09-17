# KFC Helper production deployment runbook

Last verified against `89.167.46.193`: 2026-09-15.

The TBC and WoW Forever preview product is live at `https://helper.kfcguild.online`. This document
records the deployed topology, its operational runbook, and the storage work that must be completed
before unattended 30-minute Auction House uploads are enabled.

## Current production state

- The existing `kfc-website` application remains in its original PM2 process (runtime ID 30 at the
  time of verification) and serves `kfcguild.online` from `/home/kfc-website-system`.
- Helper release `kfc-helper-forever-preview-20260916-r7` is active. It publishes canonical catalog
  metadata, structured data, robots/manifest routes, a database-backed sitemap, live debounced TBC
  search, and the reviewed WoW Forever preview Encyclopedia.
- `kfc-helper-web` and `kfc-helper-ingest` run as named PM2 siblings in the `kfc` namespace on
  `127.0.0.1:19210` and `127.0.0.1:19211`. The saved PM2 process list contains all three apps.
- Nginx redirects HTTP to HTTPS and routes the Helper UI and authenticated `/v1/` ingestion traffic.
  Internal health and API-documentation routes are not public. Dotfile probes terminate at Nginx,
  recognizable non-Google crawlers are rejected, and Googlebot-shaped traffic is limited to six
  catalog requests per minute per address.
- Let's Encrypt issued the subdomain certificate; automatic renewal is installed. The certificate
  observed during deployment expires on 2026-12-14.
- PostgreSQL 15 contains the migrated `wow_trader` database with separate owner, read-only web, and
  limited ingestion roles. Credentials exist only in mode-0600 server environment files.
- The published TBC build contains 30,133 items. Its 3,163 verified item icons are served from an
  immutable, checksum-verified media release.
- The published Forever evidence snapshot has checksum `f9922e4e8784…cc213` and exposes 9 classes,
  27 trees, 470 talents, 401 spellbook entries, racials, class abilities, Legacy perks, and source
  history. Its 574 icons/backgrounds passed local and server-side byte/SHA-256 verification before
  the shared asset pointer changed.
- Two real SavedVariables scans were accepted, normalized into 117,310 price levels, and replayed as
  duplicates without adding rows. The same replay behavior was verified through the public HTTPS
  endpoint.
- A custom-format prelaunch backup was verified with `pg_restore --list` and restored into a
  disposable database. Its restored counts matched the live catalog and market data.
- A separate 7.8 MiB pre-migration custom-format backup was checked with `pg_restore --list` before
  migration `0006` introduced the external-evidence tables.
- The KFC desktop/mobile navigation includes a first-party `Helper` link. The Helper remains an
  independently deployable application so its release or failure does not replace process 30.
- The KFC site has a dedicated WoW Forever landing page and share image. HTTP and HTTPS `www` traffic
  canonicalize to `https://kfcguild.online`, while Helper HTTP traffic canonicalizes to its HTTPS
  subdomain.
- Full-depth retention/compaction and monitoring are not implemented yet. Automatic 30-minute
  uploads are intentionally disabled until the storage gate below is complete.

## Deployment decision

Deploy the product at `https://helper.kfcguild.online` as a KFC-branded service backed by the
server's existing PostgreSQL installation. Do not install Docker, Redis, a WoW client, CASC tools,
or the .NET extractor on the server.

Keep the existing PM2 application `kfc-website` intact. It is currently PM2 ID 30 and serves
`kfcguild.online` from `/home/kfc-website-system` on port 19200. PM2 numeric IDs are runtime-assigned
and are not a stable deployment contract. Add these named sibling processes in a `kfc` namespace:

- `kfc-helper-web`: Next.js application on `127.0.0.1:19210`.
- `kfc-helper-ingest`: authenticated Fastify ingestion API on `127.0.0.1:19211`.

Both ports were free during the inspection. They must remain bound to loopback and must not receive
new UFW rules. Nginx is the only public entrypoint.

Putting the Helper inside PM2 process 30 would require merging two independent Next.js applications
and the ingestion API into the KFC repository and runtime. That would couple releases and allow a
Helper failure to affect the guild site. The subdomain, shared design, KFC navigation link, PM2
namespace, and server ownership make it part of KFC without creating that failure domain.

## Verified server baseline at initial deployment

- Debian server with Node.js `20.20.0`, npm `10.8.2`, pnpm `10.33.0`, Corepack `0.34.1`, and PM2
  `6.0.14`.
- PostgreSQL `15.19` is active. The `wow_trader` database was created during deployment.
- PM2 startup persistence for the root process list is enabled.
- Nginx terminates TLS for `kfcguild.online` and proxies it to port 19200.
- `helper.kfcguild.online` resolves to this server and is protected by a valid TLS certificate.
- Ports 19210 and 19211 were unused before deployment and now listen on loopback only.
- The server had 7.6 GiB RAM, about 4.2 GiB available, and 31 GiB free disk at inspection time.
- Existing PostgreSQL databases occupy approximately 2.9 GiB in total.
- PostgreSQL listens on all interfaces, while `pg_hba.conf` and UFW currently permit remote 5432
  access from two fixed IPv4 addresses. The Helper must not depend on those public rules.

The current Helper runtime does not use Redis. `REDIS_URL` is a development-era environment entry,
not a production dependency for the web or ingestion processes.

## Target topology

```text
kfcguild.online (PM2: kfc-website, existing ID 30)
        |
        +-- Helper navigation link
                    |
                    v
helper.kfcguild.online
        |
        v
      Nginx
        |-- all UI routes ------> 127.0.0.1:19210 (kfc-helper-web)
        `-- /v1/* uploads ------> 127.0.0.1:19211 (kfc-helper-ingest)
                                      |             |
                                      `------ PostgreSQL 15

Local maintainer machine
        |-- catalog import --> SSH tunnel --> 127.0.0.1:5432 on server
        |-- item media ------> checksum-verified file synchronization
        `-- AH companion ----> HTTPS /v1/uploads/auction-scan
```

The database is the canonical shared catalog and market store. The server never extracts the game.
The local machine remains responsible for build detection, DB2/hotfix extraction, audits, validation,
and item-image extraction.

## Implemented production-readiness changes

The repository contains the following production controls:

1. `ecosystem.config.cjs` contains the two named PM2 applications, loopback ports,
   one fork each, bounded memory restarts, restart delay, and graceful shutdown timeouts. Do not put
   credentials in this file.
2. Production launchers load separate permission-restricted environment files from outside
   the release directory and then `exec` the web or API process. This keeps secrets out of Git and
   the PM2 declaration.
3. The deployment script creates an immutable release, installs with the pinned pnpm version
   and frozen lockfile, runs checks/build, packages public and static assets beside the generated
   Next.js standalone server, and switches a `current` symlink only after success. PM2 executes that
   standalone server directly; `next start` is not used with `output: "standalone"`.
4. The local catalog-publish command accepts an explicit manifest, audits it, validates it,
   imports it as reviewed, publishes it, and reports the exact resulting build. It must not call
   `pnpm dev` or attempt to start Docker.
5. Item-media synchronization performs manifest/checksum verification. The server needs
   only decoded item PNGs, not the WoW client or raw CASC files.
6. Market summary/retention work described in the storage gate remains required before enabling the
   permanent 30-minute schedule.

`pnpm dev` remains the convenient local environment command, but it is not a production start or
publish command.

## Phase 1: PostgreSQL provisioning

Create one database and separate least-privilege roles:

| Role                | Purpose                                     | Access                                        |
| ------------------- | ------------------------------------------- | --------------------------------------------- |
| `wow_trader_owner`  | migrations and reviewed catalog publication | schema ownership and DDL/DML                  |
| `wow_trader_ingest` | ingestion API                               | required market/raw-upload DML and reads only |
| `wow_trader_web`    | Next.js website                             | read-only access only                         |

Use SCRAM passwords generated on the server. Store the web and ingest connection strings in their
separate server environment files. Keep the owner credential only in the protected deployment/import
environment; it must never be available to the public web process.

Apply migrations exactly once as an explicit deployment step, never automatically during PM2
startup. Before every later migration:

1. Take a PostgreSQL custom-format backup of `wow_trader`.
2. Run the migration through a localhost connection.
3. Verify schema version and application health.
4. Prefer backward-compatible expand/contract migrations so the previous release can still run.

Set default privileges so tables and sequences created by later owner-run migrations retain the
intended web and ingestion grants.

### Local catalog access

Use an SSH tunnel rather than exposing a database credential over the network:

```bash
ssh -N -L 55432:127.0.0.1:5432 root@89.167.46.193
```

The maintainer-only import environment then points to
`postgresql://...@127.0.0.1:55432/wow_trader`. The operational sequence is:

1. Extract from the installed local client.
2. Audit every artifact and checksum locally.
3. Validate relationships and the applicable TBC/Forever golden checks locally.
4. Import the snapshot with the owner connection as `reviewed`.
5. Review the build diff and row-count report.
6. Synchronize and verify the build's decoded item media.
7. Publish the reviewed build.
8. Smoke-test the public Encyclopedia and Trader against that exact build.

The tunnel can be closed immediately after publication. If the two existing fixed-IP PostgreSQL
exceptions are not used by another workflow, remove them from UFW and `pg_hba.conf` and bind
PostgreSQL to localhost. Audit those consumers first so this hardening does not break another app.

## Phase 2: release layout and secrets

Use this server layout:

```text
/home/wow-trader-system/
  current -> releases/<release-id>
  releases/<release-id>/
  shared/
    env/web.env
    env/ingest.env
    forever-preview-assets/
      current -> releases/<snapshot-checksum>/
    world-snapshots/
      current -> releases/<product-build-extractor>/
    media/
    raw-uploads/
    backups/
```

- Release directories are immutable after activation.
- Environment files are mode `0600` and never live inside Git.
- `RAW_UPLOAD_DIR` points to `shared/raw-uploads`, so a release or rollback cannot delete evidence.
- `WOW_TRADER_MEDIA_ROOT` points to the verified shared item-icon directory.
- `FOREVER_ASSET_ROOT` points to the root of the verified shared Forever preview asset release. The
  root contains `manifest.json`, `icons/`, and `backgrounds/`; it is independent from TBC item media.
- `WOW_TRADER_WORLD_SNAPSHOT` points to the current immutable world snapshot manifest and
  `WOW_TRADER_WORLD_MEDIA_ROOT` points to that snapshot root. Review snapshots additionally set
  `WOW_TRADER_WORLD_PREFER_ARTIFACT=true`; the UI must retain its visible review-state label.
- Each release is built from an explicit immutable source snapshot with
  `pnpm install --frozen-lockfile`, `pnpm check`, and `pnpm format:check`. Once this repository has
  a Git history, use a committed Git SHA as the release ID and source of truth.
- The server does not run extraction, local bootstrap, seed data, or demo data.

### Publishing a reviewed Forever preview

Treat a Talents Forever revision like a catalog release, not a live API. Save the reviewed aggregate
JSON locally, use the owner connection through the SSH tunnel, and import the data plus its visual
assets without publishing:

```bash
pnpm forever:inspect /absolute/path/to/reviewed-data.json
pnpm forever:import /absolute/path/to/reviewed-data.json -- \
  --assets-dir artifacts/forever-preview-assets
```

Record the returned snapshot UUID and composite checksum. Review the validation report and visual
manifest, then promote that exact immutable snapshot; do not refetch it as part of promotion:

```bash
pnpm forever:publish -- <snapshot-uuid-or-checksum>
./scripts/sync-production-forever-assets.sh \
  artifacts/forever-preview-assets <snapshot-checksum>
```

The synchronization command verifies all manifest byte counts and SHA-256 values locally, copies to
a new immutable shared release, verifies again on the server, and only then changes
`shared/forever-preview-assets/current`. Set the root-owned web environment entry to:

```text
FOREVER_ASSET_ROOT=/home/wow-trader-system/shared/forever-preview-assets/current
```

Apply migration `0006` with the database owner before importing. The read-only web role needs
`SELECT` on the three `external_data_*` tables; verify the existing default privileges supplied it.
The server application only reads the selected snapshot and local assets. It never downloads the
third-party source at request time.

### Publishing a review-only Forever world snapshot

A snapshot with a missing hotfix cache cannot be promoted into the published world tables. It may
still be deployed for maintainer review because every world page exposes the `Review snapshot`
state. Synchronize only its manifest, normalized artifacts, and checksummed browser-map media:

```bash
./scripts/sync-production-world-snapshot.sh \
  /absolute/path/to/extractor-output \
  wow-classic-beta-69893-extractor-0.2.3 \
  <application-release-name>
```

The command audits the complete bundle locally, copies into a new immutable shared release, audits
it again using the staged production application, and changes `shared/world-snapshots/current` only
after verification. Configure the protected web environment with:

```text
WOW_TRADER_WORLD_SNAPSHOT=/home/wow-trader-system/shared/world-snapshots/current/manifest.json
WOW_TRADER_WORLD_MEDIA_ROOT=/home/wow-trader-system/shared/world-snapshots/current
WOW_TRADER_WORLD_PREFER_ARTIFACT=true
```

Replace artifact preference with a published database snapshot once hotfix-complete extraction and
the review gate pass. Never set a missing-hotfix snapshot to `published` in PostgreSQL.

## Phase 3: PM2 activation

The PM2 ecosystem should start only built production artifacts. Initial settings:

- `kfc-helper-web`: fork mode, one instance, `NODE_ENV=production`, port 19210, loopback hostname,
  approximately 600 MiB memory restart ceiling.
- `kfc-helper-ingest`: fork mode, one instance, `NODE_ENV=production`, port 19211, loopback hostname,
  approximately 350 MiB memory restart ceiling.
- Both: no watch mode, restart delay, timestamped logs, and enough shutdown time for open database
  work to finish.

Activate by stable process name with PM2's idempotent `startOrReload`, then run `pm2 save`. Never
script deployments against numeric ID 30. Verify that `kfc-website` remains online and still points
to `/home/kfc-website-system` before and after activation.

## Phase 4: DNS, TLS, and Nginx

1. Add an `A` record for `helper.kfcguild.online` pointing to `89.167.46.193`.
2. Wait for public DNS resolution from more than one resolver.
3. Add a dedicated Nginx server block and issue a Let's Encrypt certificate for the subdomain.
4. Redirect HTTP to HTTPS.
5. Proxy normal routes to `127.0.0.1:19210`.
6. Proxy `/v1/` to `127.0.0.1:19211`.
7. Set an upload-body limit compatible with the API's 32 MiB application limit and a timeout longer
   than the companion's 60-second request timeout.
8. Do not publicly proxy the API documentation or internal health endpoint.
9. Add normal forwarding headers and basic Nginx request throttling in front of the API's existing
   bearer-token authentication and rate limit.
10. Keep the ACME challenge prefix ahead of the generic dotfile rejection rule. Reject recognizable
    non-Google crawler user agents before proxying, and apply the crawler limiter only to
    Googlebot-shaped UI requests. Human browser traffic uses an empty Nginx key so it is not counted
    or delayed. User-agent matching is an origin-load control, not proof of crawler identity; verify
    actual Google traffic against Google's published IP ranges or forward-confirmed reverse DNS when
    an IP allowlist becomes necessary.

Only ports 22, 80, and 443 are required publicly for this product. Existing broad UFW rules for
application ports should be reviewed separately; the Helper does not need another one.

## Phase 5: Auction House sharing

The local companion sends completed SavedVariables scans to
`https://helper.kfcguild.online/v1/uploads/auction-scan` with a dedicated ingestion bearer key. This
is the supported recurring write path because it provides validation, checksums, idempotency,
conflict detection, and rate limiting.

Do not let the companion write directly to PostgreSQL. Do not distribute the owner or ingestion
database password. Additional trusted scanners receive separately rotatable API keys; later, store
key identifiers/hashes rather than growing one shared secret indefinitely.

The Fastify raw payload directory must be backed up with the database because the database stores
its evidence URI. A database row without the corresponding retained raw payload weakens auditability.

## Storage gate before 30-minute production scans

The current local proof gives a useful lower-bound measurement:

- Two stored TBC scans produced 117,310 `auction_price_level` rows occupying about 21.8 MiB.
- Each raw JSON envelope is approximately 5.1 MiB.
- One full scan therefore currently costs roughly 16 MiB before WAL, future indexes, summaries,
  backups, and filesystem overhead.
- At 48 scans per day, that is approximately 0.75 GiB per day or 135 GiB for 180 days.

The server has only 31 GiB free, so the documented goal of keeping full 30-minute depth for 180 days
does not fit this machine. At the current shape it could consume the remaining disk in roughly 40
days, likely sooner once safety margin and backups are included.

Recommended launch policy:

1. Build `market_observation_summary` during ingestion.
2. Keep full depth for 7 days for debugging and exact recent opportunity calculations.
3. Compact older observations into hourly aggregates, then daily aggregates for indefinite history.
4. Compress retained raw envelopes immediately and apply an explicit audited retention policy.
5. Alert at 70%, 80%, and 90% filesystem usage and on failed compaction/backup jobs.
6. Do not enable unattended 30-minute uploads until compaction and deletion tests prove that summary
   history survives and raw/level rows are removed together safely.

If full depth really must remain queryable for 180 days, expand dedicated database/storage capacity
to at least 200 GiB before launch and still implement partitioning and retention. Disk expansion does
not replace aggregation.

## Phase 6: KFC website integration

After the Helper passes its standalone smoke tests:

1. Add `Helper` to both desktop and mobile navigation in the KFC repository, linking to
   `https://helper.kfcguild.online` in the same tab.
2. Treat `helper.kfcguild.online` as a first-party host in KFC referral analytics.
3. Preserve the existing KFC site deployment and restart only the named `kfc-website` process after
   its own build/check succeeds.
4. Verify navigation in both directions and at mobile width.

This is the only code change required inside the existing process 30 application.

## Acceptance checklist

The initial release has passed every checked item below. The two unchecked operational gates are
deliberately visible rather than being implied by a successful application deployment.

- [x] `pnpm check` and formatting pass for the exact deployed source snapshot.
- [x] Database migration, grants, backup, and restore drill have passed.
- [x] Both Helper ports answer only on loopback.
- [x] `https://helper.kfcguild.online` has a valid certificate and redirects HTTP to HTTPS.
- [x] Root, TBC chooser, Trader, Encyclopedia, item, recipe, profession, and BiS candidate routes return
      successfully against the published server catalog.
- [x] Item icons are served from the synchronized media set with no systematic 404s.
- [x] An upload without a bearer token returns 401.
- [x] A real local scan uploads successfully over HTTPS, becomes `processed`, and an identical retry
      is reported as a duplicate without adding price-level rows.
- [x] The website shows the exact realm, build, completion time, and price-level counts from that scan.
- [x] PM2 reports `kfc-website`, `kfc-helper-web`, and `kfc-helper-ingest` online; `pm2 save` has captured
      the named process set.
- [ ] A controlled reboot/startup check restores all three applications. PM2 startup and the saved
      process list are configured, but the shared production server was not rebooted just for this
      deployment.
- [x] Mobile and desktop Playwright smoke tests pass through the public hostname, including decoded
      TBC and Forever chooser images.
- [x] The Forever overview, nine class calculators/spellbooks, reference pages, public export, and
      immutable visual asset route read the exact published checksum. Desktop allocation/tooltip and
      mobile touch-sheet tests pass without broken images or horizontal overflow.
- [ ] Disk, backup age, API errors, process restarts, and data freshness have alerts. This must ship
      with compaction before unattended scans are scheduled.

## Rollback

For an application-only failure, repoint `current` to the previous immutable release and reload only
`kfc-helper-web` and `kfc-helper-ingest`. The KFC process remains untouched.

For a bad catalog publication, retain the previous build and add an explicit catalog promotion/
demotion operation; never delete or overwrite its evidence. Repoint the matching media only after
the catalog status changes.

For a database migration failure, stop the Helper processes, restore the pre-migration backup into a
new database, verify it, and then switch connection strings. Do not overwrite the failed database in
place before its evidence is preserved.

## Remaining production order

1. Commit the verified repository once the maintainer is ready to establish its Git history. The
   GitHub remote was empty during the first deployment, so release r4 is an immutable source snapshot
   rather than a committed SHA.
2. Implement and test per-scan summaries, hourly/daily aggregation, coordinated raw/level retention,
   backup scheduling, and disk/data-freshness alerts.
3. Run a controlled PM2 startup/reboot drill during a maintenance window.
4. Only then enable the local companion's unattended 30-minute production schedule.
