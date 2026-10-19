# Item-skill source deployment — October 19

The owner's requested **commit → push → build → verify → deploy** flow is complete. No compiled
Mac web bundle was uploaded. Production source is commit
`4d043d38c545c5242c6e02217dc85af38152ce4c` on `origin/main`.

## Live release

- Release: `/home/wow-trader-system/releases/kfc-helper-item-skills-source-20261019-4d043d3`.
- Build ID: `1jnaeGW0m9oD-Wy4VrpYq`.
- Activated: `2026-10-19T13:07:22.741Z`; verified: `2026-10-19T13:09:26.914Z`.
- Receipt: `/home/wow-trader-system/current/source-deployment.json`, status `verified-live`.
- Numerical model: `81d964b453f4e6abb50a81e7`; presentation: `8df7a7e5afd43f588d6ca257`.
- Five Warrior, three Rogue and one Hunter reviewed builds. All 2,591 items remain; item-granted
  weapon skill is ignored. Other stats/procs, talent/racial bonuses and acquisition limits remain.
- No database migration, ingestion/crawler/guild restart, numerical rerun or model regeneration.

Only `kfc-helper-web` restarted. The guild, ingestion and reference-publisher PIDs remained
3542598, 3528524 and 3390339. The immediate rollback source is
`kfc-helper-item-skills-source-20261019-f953109`; keep shared approved models and selection pointers.

## Failure and protection

A later stale-source release still selected the historical presentation. The approved Build library
was empty, and the corrected database returned HTTP 500 because its strict manifest reader did not
recognize `itemWeaponSkillPolicy`. Shared reviewed data was intact. The complete source reader,
manifest schema, navigation dependencies, item-skill preparation/guards and regression tests are now
committed together.

`verify-simulator-deployment.mjs` rejects the wrong selected iframe, missing approved builds,
incorrect public database bytes/count/skills, removed affected items, exposed private proofs or
selection changes during verification. Activation requires a candidate URL when the model-update
pointer exists. A seventh regression proves the CLI actually runs through a `current` symlink;
the old entrypoint comparison could silently return success without performing checks.

Both initial and final candidate checks ran against explicit immutable release paths. The final
origin and public checks also ran through `current` and produced actual successful gate output.
An activation attempt safely aborted when another deployment changed `current`; the later source
was compared and preserved before retrying. There was no forced push or overwrite of concurrent work.

## Verification

- 532 committed-source web tests, 216 simulator tests and four manifest tests passed. The final
  checker-only change has seven passing deployment tests on Linux. Application source is unchanged
  from the tested `f953109` tree; the final `4d043d3` source was separately built on the server.
- Strict TypeScript, scoped lint/format checks and Linux production builds passed. The first build
  hit the existing 768 MB runtime heap cap. Builds used `NODE_OPTIONS=--max-old-space-size=3072`;
  the live runtime cap was not changed and checks were not disabled.
- Candidate imports verified all Warrior/Rogue shares and Hunter BM at desktop/mobile widths,
  exact settings, Gear Sets/configurations, reload preservation and consent OFF.
- Public navigation/history/share, named links, logo, one global scroller, Arms and two-hand
  combat passed at both widths. Unpublished MM/SV links were not mislabeled as reviewed builds.
- Public Stop/retry passed with one/four workers, recovering in 1,790/2,002 ms with edited
  characters preserved. QA accepts normal cooperative cancellation or fallback recovery, but
  requires an idle engine, cleared results and a successful subsequent combat.
- The final release passed the public database/library/privacy gate, desktop/mobile Warrior
  import checks, a real 25-fight simulation and all 21 assets discovered across three public pages.
  These fights are smoke tests, not new optimization evidence or a cross-class comparison.

## Local source and research

Unrelated local edits were excluded from the simulator commit. Concurrent committed artwork/map
and navigation fixes were merged using the clean detached checkout
`/tmp/wow-trader-release-20261019.wFHiXR`, preserving the primary dirty worktree. Its `main` cannot
fast-forward safely while four modified icon/map files overlap upstream changes. Do not reset,
automatically stash or overwrite those files. Remote `main` and production contain the pushed fix.

Local MM/SV presentation `55df45f3c2594aaff0493243` and unconfirmed Feral research were not published.
The original Druid budget and all frozen optimization evidence remain unchanged. Closing gear
feedback and fresh confirmation are still required before Feral delivery; the all-class goal remains
active. Future deployment steps are in [the source deployment guide](simulator-source-deployment.md).
