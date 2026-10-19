# Public asset recovery — October 19, 2026

Two independent failures affected public pages while their HTML still returned HTTP 200.

- The guild homepage process selected `.next-release-20261018-tools-migration-r1` through
  `KFC_BUILD_DIR`, but that directory had lost its build manifests, JavaScript, CSS and fonts.
  Remaining server-rendered cache files made the homepage appear healthy to an HTML-only probe.
  Rebuilding the deployed source into `.next-release-20261019-asset-recovery-r1` restored all
  referenced assets. The isolated preview verified every homepage script, stylesheet and font
  before switching only `kfc-website` to the fresh directory and saving its PM2 selection.
- Helper selection cards, the header logo, leveling/download logos and TBC directory artwork
  supplied root-relative image sources without the `/tools` base path. Next's optimizer returned
  HTTP 400 even though the source artwork existed under `/tools/wow-assets`. These components
  now use the existing idempotent `withHelperBasePath` helper. Simulator class artwork already
  used the correct paths. This issue is separate from catalog item PNG extraction.

Run the asset smoke after a public deployment or disk cleanup:

```sh
node scripts/smoke-site-assets.mjs
```

The default checks the guild homepage, Helper home and Forever home. Additional pages can be
passed as URL arguments. The smoke fetches same-origin images, scripts, stylesheets and fonts
declared in each page, checks response status and media type, and fails if HTML succeeds while
its assets fail. It deduplicates assets and limits concurrency to four. Production activation
runs this check after service health checks; browser verification should additionally confirm
hydration, lazy-loaded artwork and navigation on desktop and mobile.

Cleanup must identify active directories from the saved and running process configuration.
For the guild site that means the actual PM2 `KFC_BUILD_DIR`, not an assumed `.next` directory
or the newest directory name. For Helper it means the resolved `current` symlink, the pinned
ingestion release and active shared asset pointers. Retain complete active builds, including
`BUILD_ID`, manifests, server files and static assets. A running process is not evidence that
deleting its build directory is safe.
