# Dungeon-order release — 23 October 2026

Status: `a719aa67776f948a045a052af49c8fcf88c0520c` is deployed and publicly verified.
Build: `4wYB6nmYbtEH_xoCT5YGB`.
Release: `kfc-helper-leveling-dungeon-order-20261023-a719aa6`.
Server receipts: `/home/wow-trader-system/shared/backups/leveling-dungeon-order-20261023-a719aa6`.

The committed source archive (1,452 Git blobs) was built on Linux. All 546 leveling
tests, 1,445 web tests and 38 deployment/export support tests passed, together with
both package typechecks and lint. The full web evidence suite used its established
15-second Linux per-test budget; all assertions ran.

Candidate and public Chromium checks at 1440, 390 and 320 pixels passed all 21
dungeon positions and 126 numeric entry/finish-bar continuity checks per environment.
BFD projects entry25, before Stockade26 and Excavation29. The actual production
quest references were used; this is not an in-game leveling-time measurement.

The candidate/public simulator verifier passed all 11 published profiles and23
library entries. All16 simulator frame/library selections remained identical.
Warrior and Smite completed real fixed-seed25-fight WASM runs, including preset
switching, at all three widths. Candidate/public result texts match exactly:
Warrior836.08DPS and Smite518.22DPS for these smoke-test setups. DNT/GPC and blocked
non-read requests ensured QA sent no production usage events.

Public assets passed across10pages/95assets, including both website homes, the
guide, simulators, tier list and previously reported recipe images. Static delivery
verified48,758files/2,610compressed variants before activation; prior chunks remain
available for existing tabs. All49,265 frozen simulator files passed checksums
before and after deployment. The numerical root remains `results-20261022-2489a71`.
The768MB runtime heap and enabled anonymous usage collection are preserved.

The first activation attempt safely stopped before any pointer changed because an
independent Discord-site release replaced its PID during QA. The new committed
Discord runtime `735837d` passed its own two-page/59-asset sweep. Only that sibling
baseline was refreshed; the original snapshot remains in `before.json`. Every
Helper source/static/environment/artifact check and all other protected process
identities remained unchanged. Activation then restarted only `kfc-helper-web`.

The initial preview browser harness requested an absent fallback font while frames
were being replaced. Waiting for initialized frames and font readiness passed the
complete rerun; no application source or immutable simulator asset was changed to
make this check pass.

Rollback is retained in the receipt's `control.mjs --rollback`, guarded against a
later deployment. No crawler, ingest service, publisher or other site was restarted
by this release. The loopback candidate used for the separately requested21-build
Solo/Raid benchmark work has been stopped after those jobs.

The new Solo/Raid tier lists are not part of this deployed commit. Their source,
measurements and publication verification are a separate change.
