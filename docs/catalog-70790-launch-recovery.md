# Forever launch catalog recovery — build 70790

## Cause and repair

The November 6 Auction House scan uploaded and its history synchronized, but
crafting correctly required a published catalog for its exact build. Production
still had build 70532. The previous catalog LaunchAgent/release installation was
absent from the maintainer Mac, and the launch client now identifies itself as
`wowf` under `_forever_` rather than `wow_classic_beta` under `_classic_beta_`.

`scripts/catalog-client.mjs` now resolves active launch installs for the stable
Forever catalog key, preferring launch over beta when both are installed. The
guardian and its installer share that resolution. Duplicate active builds,
ambiguous folders, malformed metadata and missing products fail closed. The
native extractor and icon reader use the same alias while retaining the existing
catalog/scan identifier. No game files or upload identifiers are rewritten.

The guardian searches only its catalog directories, avoiding the unrelated
simulation archive. Its immutable release includes Node, a self-contained native
extractor, compiled catalog tooling and checksum verification. The restored
LaunchAgent checks every five minutes and watches the build manifest and launch
hotfix cache. Compatible changes can publish automatically. Material recipe or
extractor changes still require review of one exact manifest.

## Recipe correction

The independent review found that the old normalizer ignored
`EffectBasePointsF`. It therefore treated multi-output Forever crafts as one
item. The corrected extractor retains those quantities; Smelt Bronze produces
two bars, and ammunition can produce 200 units. Legacy Classic/TBC integer
base-point handling remains covered by the native controls.

For modern output records with integral quantity bounds, the normalizer derives
the range from the recorded base amount and variance. This interpretation follows
the [reference spell-effect calculation](https://github.com/TrinityCore/TrinityCore/blob/master/src/server/game/Spells/SpellInfo.cpp),
and is a client-data interpretation rather than a live craft observation. Outputs
with unsupported fractional/scaled bounds are withheld and logged. The two
affected spell IDs are `435964` and `435966` (High-Yield and Ez-Thro Radiation
Bomb); no invented quantity replaces them.

The exact candidate contains 22,667 named readable items, 32,109 spells, 12
professions, 2,227 supported recipes, 7,417 inputs and 2,227 outputs. An independent
raw-data pass checked every published recipe's reagents and output quantities.
Compared with 70532, 100 retained recipes change only their normalized output
quantities; one Enchant Boots - Speed recipe is added and the two unsupported
recipes are withheld. All 15 cooldown recipes retain their cooldown data; Trader
continues excluding cooldown crafts from rankings and alt-material chains.

This remains a client-readable catalog. There are 9,115 source IDs without usable
localized names and 5,134 reported encrypted DB2 records. No encryption is bypassed
and no older metadata is presented as verified for this build. Item-stat,
item-effect and teaching-item normalization gaps already present in the 70532
source remain separate follow-up work; this repair does not claim they were fixed.

## Maintenance and validation

```sh
node --test scripts/catalog-client.test.mjs scripts/catalog-review-approval.test.mjs scripts/catalog-runtime.test.mjs scripts/verify-item-media.test.mjs
pnpm catalog:extractor:test
pnpm --filter @wow-trader/catalog test
pnpm --filter @wow-trader/catalog typecheck
```

Use the installed release for operational checks, not a mutable development
checkout. Its location is recorded in
`~/Library/Application Support/WowTraderCatalogGuardian/deployment.json`.
`status.json`, the LaunchAgent logs and its exact manifest describe a pending
review. The existing SHA-bound approval flow is documented in
[production deployment](production-deployment.md#automatic-compatible-catalog-promotion).

The reviewed manifest SHA-256 is
`011b15956ba41183cbc875a215a04156b83ac3c6f6aa4b6aa80ef72fb29cd032`.
The exact definitions revision is
`a936b2d4f4db7bd591a77fdc3e5148052a9ecd95`, hotfix SHA-256 is
`5ee4d0014739df39c6d12053eb0a043d275b2d508211b368471805390614129e`.
The audit verifies 106 artifacts. Item-media validation covers 3,108 referenced
icons: 3,107 PNGs and one reported unreadable client asset. Private review and
publication evidence is retained in `artifacts/catalog-70790-20261106/`.

## Production delivery

Build ID `4bb8b8f0-11a3-48eb-b38f-90f9a4bcd8c8` was published on November 6 at
06:45:43 UTC after a SHA-bound dry run, verified PostgreSQL backup, repeated
server audit/validation, staged import and icon verification. Only
`kfc-helper-web` was reloaded. The same-build rerun reports `current` and performs
no repeated import. Guardian release `b8666a02e350a61067aa046cd5aaa7af74aa6887ce61cadc564bc7c41e18aa5c`
and compiled server tooling `4412458475c6eb65dede64a8addce422a61656b819f2f9f8d57619d36ea89809`
verify successfully.

Actual desktop and mobile browser checks returned HTTP 200 and rendered 50
crafting results for the uploaded EU Alliance market, with readable item icons,
no page errors and no catalog-review/database banner. The scan did not need to
be uploaded again. The pre-import backup is
`/home/wow-trader-system/shared/backups/wow_trader-pre-wow_classic_beta-70790-5ee4d001-catalog-20261106.dump`.

Passed 25 native product/yield/normalization controls, 27 Node client/runtime/
approval/media tests and 15 catalog tests, plus catalog typecheck, scoped lint,
formatting, native builds and the full independent 2,227-recipe evidence check.
No source commit/push or unrelated application deployment was requested.
