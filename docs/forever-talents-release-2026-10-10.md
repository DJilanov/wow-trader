# Forever talents: October 10 release

## Published data

- Source: [Talents Forever structured export](https://talentsforever.com/data.json),
  generated October 8, 2026; reported beta build `1.60.1.70291`.
- Attribution and `CC-BY-4.0` licensing remain attached to the import. Source confirmation is
  not independent client verification; the canonical extracted client catalog is unchanged.
- Published at `2026-10-10T04:47:43.695Z`.
- Snapshot ID: `20fe44d9-cb84-4e9d-b711-36c96c025fe6`.
- Snapshot checksum: `856fdf6ea022b322d6ba81ee44fe2bb683228d31b545d9917b7ce429e8a1444e`.
- Raw export SHA-256: `c72b0e1f9357260b63c5d5d738627c6984f28e8737a3e8d3888648c8c9e1518b`.
- Rechecked the upstream export after publication: its checksum was unchanged.
- Validated without errors or warnings: 9 classes, 27 trees, 466 complete talents,
  71 prerequisite relationships, 1,816 spellbook entries/descriptions and 27 Legacy perks.
- The export includes Warrior's restored Deep Wounds requirement for Impale and the
  Druid Natural Instinct rename, alongside the earlier beta talent revisions.

The importer now accepts beta spellbooks with a build instead of a demo race, per-class icons,
beta spell descriptions and structured Legacy ranks. Demo spellbooks and Legacy tuples remain
supported. Parser version is `talents-forever.v2`; reviewed v1 snapshots remain readable and
eligible for rollback. The preview API reports `beta_preview` and its source build for beta data.

## Code and deployment

- `61dbb31`: beta schema, assets, evidence labels and regression coverage.
- `838554c`: historical lookup no longer selects an unjoined publication-table column.
- `5fcef5e`: touch sheets survive blur/mouse-leave; touch-generated hover/focus events do not
  intercept a tap before its click handler opens the sheet.
- Active release: `/home/wow-trader-system/releases/kfc-helper-talents-20261010-61dbb31`.
  The release contains all three commits' changes, overlaid on the previous deployed baseline.
- Only the 23 intended source files changed. Existing deployed catalog/market work was retained;
  unrelated local changes were not committed or uploaded.
- Reloaded only `kfc-helper-web`, then saved PM2. Ingestion, reference publication, KFC's
  guild website and the Discord services were not restarted.
- Verified 660 current assets plus 69 retained historical assets, including each byte checksum.
  Historical snapshots and their shared links remain available without silent migration.
- Kept prior immutable Next assets for existing browser sessions.
- The initial build inherited the 384 MiB runtime heap cap and failed during type checking.
  Rebuilding with a build-only 1,536 MiB limit passed; runtime settings were not changed.

## Verification

- 19 Forever data tests and 204 web tests passed on the final local source.
- Forever data typecheck/lint, changed web-file lint and web typecheck passed.
- The production package tests and optimized Next build passed on the staged Linux release.
- Four staged desktop/touch checks passed against the old publication before activation.
- 36 public desktop/mobile checks passed: all nine classes, saved/shared builds, historical
  builds, spellbooks, Legacy, racials, abilities, changes, sources and the encyclopedia.
- No browser exceptions, missing rendered images or horizontal page overflow were detected.
- Desktop and mobile Warrior screenshots were inspected. Browser evidence is under
  `artifacts/forever-talents-20261010/` locally and remains outside Git.

## Recovery

- Previous code: `/home/wow-trader-system/releases/kfc-helper-reference-auto-20261008-r1`.
- Previous publication checksum:
  `f9922e4e878491421d418565ec368032749dafa4d70ca0b4823f50dd7dbcc213`.
- Restricted, verified custom backup of the three external-data tables:
  `/home/wow-trader-system/shared/backups/forever-talents-before-20261010-61dbb31.dump`.
- Captures, review, activation and publication scripts:
  `/home/wow-trader-system/shared/forever-preview-data/20261010/`.

To roll back, use the current v2 CLI and owner environment to republish the previous checksum
before restoring old code. Restore the previous asset and application symlinks, reload only the
web process and verify its preview API. Prefer this pointer rollback over restoring database
tables, which would discard subsequent imports. The activation script has the same failure
recovery order. Keep owner credentials out of command arguments, output and Git.
