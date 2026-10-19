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
- The expanded audit also found extensionless race-icon API URLs missing that prefix. The
  shared icon component, directory map previews, Leaflet tiles and leveling SVG tiles/image
  probes now address `/tools/api/...` explicitly. The asset smoke checks every declared image,
  including URLs without a filename extension; an HTML response is not accepted as an image.

Two navigation boundaries also required corrections. The guild header must perform a document
navigation into the independently deployed `/tools` app. Next's guild router cannot consume the
Helper app's React Server Component response. Embedded simulator class/build links must navigate
the host route and preserve the selected `build` query; otherwise the iframe and its readiness
expectation disagree. The host now connects the engine menu to its router, supports named build
queries, and recognizes both valid proxy aliases for the same engine profile. Origin, release,
profile and query checks remain enforced. This changes navigation, not simulation model bytes.

The engine consumes a named `build` query after applying it, using `history.replaceState` inside
the iframe. Readiness accepts that consumption only for a single valid named-build parameter
after the normal initialized/visible checks. Other mismatched queries and foreign profiles or
releases remain blocked. The outer page retains the selected build for sharing and reloading.

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

Recovery verification: all 532 web tests, lint, typecheck and the production build passed for
the final Helper candidate. The asset smoke and simulator deployment gate unit tests also
passed (nine tests). The expanded public audit verified 59 assets across eight pages. Browser
checks at 1440×1080 and 390×844 verified the guild Tools link, loaded leveling imagery, simulator
class switching, named Arms builds, Arms/two-hand combat runs, Back/Forward and reload with no
engine asset failures. The model-aware deployment gate passed before activation and publicly
afterward, preserving all 2,591 simulator items and the approved Warrior/Rogue/Hunter libraries.
The recovery candidate `public-navigation-20261019-r3` was exported from pushed commit `ff5b214`.
The final active Helper release is `kfc-helper-item-skills-source-20261019-f953109`, which includes
that commit; its icon, map and simulator-frame sources match the verified recovery candidate.
The guild build is `.next-release-20261019-navigation-r1`. Only Helper web was restarted for the
final Helper releases; ingestion remains pinned to its own release. Existing static chunks were retained
for already-open tabs. The server's 768 MB runtime limit was insufficient for Next's build-time
TypeScript worker, so only the build command used a 2 GB heap; runtime settings were unchanged.

Cleanup must identify active directories from the saved and running process configuration.
For the guild site that means the actual PM2 `KFC_BUILD_DIR`, not an assumed `.next` directory
or the newest directory name. For Helper it means the resolved `current` symlink, the pinned
ingestion release and active shared asset pointers. Retain complete active builds, including
`BUILD_ID`, manifests, server files and static assets. A running process is not evidence that
deleting its build directory is safe.
