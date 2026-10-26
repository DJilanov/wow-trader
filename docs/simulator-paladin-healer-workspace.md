# Paladin healer workspace

The local Paladin preview loads complete source-measured builds for direct
healing, Vigil mobility and Vigil support. Each has tank, group and burst
assignments, two measured race profiles and 28 mechanics scenarios: 18 groups
and 504 configurations. Changing one of those selectors replaces gear, talents,
consumables, casting priorities, resource settings and the original request
template together. It does not reuse another scenario's reference score.

The scope is level 60, Engineering and Tailoring, stationary stacked assignments
lasting 180 seconds. Rank 14 is allowed; raid-dependent acquisition remains
excluded by the source catalog. Five-minute/spread assignments, all-profession
delivery and complete Paladin qualification remain open. Existing failed results
and the expired original numerical window are preserved.

## User controls

The build library appears first. All 17 slots have item selection, compatible
enchants and stats on hover/focus. The shared gear dialog closes with Escape or
an outside click. The page uses global scrolling; the mechanics selector spans
the full row on narrow screens.

The casting editor retains the Paladin-specific conditions: target, missing
health, injured-party count, party missing health, maintaining Vigil and requiring
Vigil. Divine Favor, resource thresholds, friendly item targeting and all seven
consumable fields are editable. Newly equipped supported resource items can be
added explicitly. Unequipped items and disabled potions/runes are ignored by the
request builder. Original encoded resource timings remain in the source request.

Talent edits use the existing class tree UI. Invalid equipment, incomplete or
inconsistent talents, unlearned spells and unsupported consumables block
simulation. Model assumptions are changed through a measured mechanics scenario;
a shared build cannot silently replace those assumptions or the incoming damage.

Preset results disappear after a numerical edit. Displayed healing and absorbs
use the external-assignment ledger, excluding self-damage from mana items. The
practical 2% comparison concerns missing friendly health under the declared
damage pattern; it is not a maximum-HPS or universal healer ranking.

## Save, sharing and worker lifecycle

Paladin uses version-three configurations with release/model/group/source
bindings. The full JSON is compressed into the share link without rebuilding
workload member order. All 504 source configurations retain exact request and
workload identities after round trips. The largest measured link is 5,364 base64
characters and the largest decoded configuration is 33,762 bytes.

Untrusted links are limited to 12,000 encoded characters and a fixed 65,537-byte
decompression buffer; decoded values above 65,536 bytes are rejected. Saved
builds use `kfc-healer-build:healing-paladin:v3:<release>`, separate from Priest,
Druid and older releases. Failed browser storage remains visibly unsaved.

Group downloads verify their exact byte length and SHA-256 before typed parsing.
Aborted or stale downloads cannot replace the latest combined race/build/scenario
selection. A failed download retains the current character and permits retry.

Simulate imports the pinned request codec and starts an isolated Worker. Stop
terminates that Worker and invalidates late callbacks. Loading and execution
have recovery timeouts; errors remain visible and Retry creates a fresh Worker.

## Release and current review

The SDK exports the archive, lazy payloads, workspace and release contracts.
`apps/web/src/lib/paladin-healer-simulator.ts` handles manifests, catalog-backed
presentation, individual groups and immutable raw/Brotli/gzip assets. Paths,
symlinks, sizes and checksums are verified. The class asset route preserves the
existing Druid branch. The new page is
`/tools/forever/simulator/healing-paladin`; explicit reviews and unavailable
installations are non-indexable.

The local review release is `11437e178d65d57e6bad6a3f`, under:

```text
artifacts/forever-simulator/optimization/healer-model-admission-v1/
  paladin-browser-preview-v1/candidate-6OiDjb/
```

It contains 25 raw assets and their compressed copies, the exact F0 WASM/runtime,
the legacy Paladin Worker and the real protobuf request codec. Compression round
trips pass. Its packaging report SHA-256 is
`415bc65007a976692817805ee69eecc74ce8550511b2a096d45fcbb99ccd46b4`.
No active pointer was written and no production release was selected.

An isolated Next.js dev snapshot runs on port 3037 with that candidate as
`FOREVER_SIMULATOR_ROOT`. The review URL is:

```text
http://localhost:3037/tools/forever/simulator/healing-paladin?release=11437e178d65d57e6bad6a3f
```

The source app and existing development server were not restarted. The first
snapshot attempt lacked the shared raid-default JSON import; that private
snapshot was corrected. Final page requests return 200. This was a preview
assembly issue, not a production outage.

## Verification and remaining gate

The focused suites passed 67 unit tests: 28 SDK archive/payload/workspace tests,
8 personal-configuration tests, 5 Paladin release-loader tests and 26 existing
Priest/Druid configuration/transport tests. Both data/web typechecks and scoped
ESLint pass. Formatting checks pass for the new implementation. The scoped diff
check is clean; the repository-wide check separately reports an existing blank
line at EOF in `docs/simulator-full-raid-update-plan-2026-10-22.md`, left unchanged.

Real Chromium passes 13 interaction cases covering defaults, global scrolling,
tooltips, dialog dismissal, saved/shared builds, scenario swaps, rapid selectors,
download failure/retry, talents, Stop, error recovery and mobile layout. Three
additional cases cover metadata/navigation, custom equipped-item controls and
320/390-pixel layout. Desktop/mobile screenshots were inspected.

Final reports inside the candidate:

- `workspace-review-R17x1a/report.json`, SHA-256
  `e98e19f0d97c02de0d9e79b872bebcd0e569f03731f15599a356b1cfe4371f57`.
- `detail-review-vrRg5J/report.json`, SHA-256
  `f7891f246cb041479bf4e1326209d7c5861a01b6ec09f17538f250d598457a2d`.

The interaction tests use a controlled real Worker transport for Stop/error
checks. They fetched no WASM and ran no combat calculations. They do not qualify
actual browser combat or substitute synthetic scores for measured results. A
separate capped 30-minute browser/native delivery-validation window was requested
after the preview became reviewable; no answer has been received. No new clock
or numerical request has started. Actual combat validation, scoped release
approval, activation, full remaining Paladin coverage and production delivery
remain pending. The complete DPS/tank/healer campaign remains active.
