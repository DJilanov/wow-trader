# Hunter raid-default deployment — October 20, 2026

Status: deployed and publicly verified, October20 17:50UTC.

## Production receipt

| Field               | Verified value                                                                    |
| ------------------- | --------------------------------------------------------------------------------- |
| Application commit  | `c8265bc83f6afd6fb826953b04e6e6de99719139`                                        |
| Next build          | `vhpM-M2aA9XUerueM6Q6o`                                                           |
| Source              | `/home/wow-trader-system/releases/kfc-helper-hunter-raid-20261020-c8265bc`        |
| Simulator root      | `/home/wow-trader-system/shared/simulator-releases/hunter-raid-20261020-c8265bc`  |
| Operational receipt | `/home/wow-trader-system/shared/backups/hunter-raid-20261020-c8265bc`             |
| Web process         | PID3721788, restart155                                                            |
| Previous source     | `/home/wow-trader-system/releases/kfc-helper-simulator-reviewed-20261020-91b06f5` |

Public page: https://kfcguild.online/tools/forever/simulator/hunter . Reload and choose
Load build to apply the refreshed benchmark; personal saved characters remain unchanged.

All1,255 committed source blobs and28,186 required artifact checksums passed before and
after build/activation/public testing. Candidate and public route gates pass all seven
profiles, their actual selected databases and private-proof404s. Both browser sweeps pass
all34 desktop/mobile build checks and15 genuine25-fight combat runs, with identical loaded
settings and same-seed result arrays. `verified.json` records their exact comparison in the
operational receipt and local `optimization/deployment-20261020-qGG9Ou` directory.

Full local web suite:852tests/113suites. Linux production compile/typecheck and all11
dependency builds pass; Linux deployment-gate11tests also pass. The initial build inherited
the768MB runtime heap and exhausted it during TypeScript. A temporary2GB build-only limit
completed successfully; production's768MB limit and private settings are unchanged.

Only Helper web restarted. Ingestion, publisher, official updates, stopped crawler and
guild web retain their exact PIDs/status/restart counts. No DB migration or Nginx change
occurred. The two public environment changes are simulator root and SEO build identifier.
Twelve older valid immutable releases remain available through hardlinks. One old directory
had only a safety JSON and no manifest; it was already unservable and was not copied or
deleted. The temporary preview, local tunnel and mount proxy are stopped; the unrelated
existing preview on19212 was untouched. Final live health, guild home, Trader and Leveling
are HTTP200. Disk is70% used with22GB free.

During rapid public navigation/reload tests, the live log recorded destination-stream-closed
messages; the completed browser sweep had no page errors or failed asset requests and the
web PID/restart count stayed stable. These are recorded separately, not described as a
clean backend error log or used to suppress monitoring.

Guarded rollback, only while this exact release remains active:

```sh
ssh root@89.167.46.193 \
  'node /home/wow-trader-system/shared/backups/hunter-raid-20261020-c8265bc/activate-hunter-raid-deployment-20261020.mjs --rollback'
```

The controller refuses a changed active source, restores the preceding source and only
the two previous public settings, restarts Helper web, and checks health. It does not
reverse data or saved characters. Do not run it blindly after a later deployment.

The owner authorized commit → push → deploy after all three Hunter specs were ready.
This release also carries the previously committed Feral raid-default handoff from648282c.
Warrior, Rogue, Balance, Mage and Demonology retain their existing publications.

## Verified local delivery

| Build         | Talents | Fresh modeled DPS | Validation fights |
| ------------- | ------- | ----------------: | ----------------: |
| Beast Mastery | 31/20/0 |            905.72 |            40,000 |
| Marksmanship  | 7/40/4  |            910.62 |            40,000 |
| Survival      | 16/4/31 |            868.53 |            40,000 |

All use Moonkin Aura, Leader of the Pack, Trueshot Aura, Battle Shout, Strength of Earth,
Grace of Air and Windfury once, plus their other recorded assumptions. Greater Mageblood
provides20MP5 instead of stacking with legacy12MP5. Gear excludes raid dependencies;
item weapon-skill bonuses are ignored. These are conditional first-pass results with the
owner's2% retained-contender tolerance, not global optimality or a cross-class tier ranking.

Approved presentation: `c98e5e028954b29c1ee0354e`, source model `a4eabfa5c89f3813c1b74bde`.
Actual staged browser receipt: `profile-model-browser-bcce79ed9cde286e.json`.
Local main-page receipt: `hunter-main-page-023e1389ee3af1ff.json`.

All15 staged pages and28 starter sets pass; all3 Hunter configurations,4 gear sets,
six desktop/mobile full imports and three actual short native/browser combat comparisons
pass. The actual main Helper page passes six build/viewport cases, default/configuration/
gear/guide/tooltip checks, reload persistence, one global scroller and real Simulate.
The desktop BM Stop test cancels gracefully, preserves settings and re-enables Simulate.
Separate safe Pet/Melee remains a starter, not a newly qualified spec. Existing saves are
not overwritten; users choose Load build to apply the complete benchmark.

The first UI candidate correctly failed: minimal BM GUI metadata omitted ruleset, so the
browser loaded Classic while measured requests used Forever. V2 adds only the verified
Forever GUI setting after checking all12 measured wire templates. No combat input, gear,
model, selected winner or fresh validation sample changed. Two regressions pass. Failed
candidate `95a2072e301460243d5d4f12` is retained unapproved and must never be deployed.

Checks: full web852 tests/113 suites, including22 Hunter profile and11 Hunter reader tests.
Typecheck, scoped lint/format,11 deployment-gate
tests, preset/GUI regressions and actual staged/main browser handoff pass.

## Activation boundary

Deployment inventory: `optimization/deployment-20261020-qGG9Ou/manifest.json`,28,186 files,
1,010,639,461 bytes, eight required source/presentation releases. Every artifact size and
SHA-256 and all seven strict runtime profile readers were checked. The generated archive
contains only the finite inventory, not raw optimization journals or simulation caches.

Before activation, production was
`/home/wow-trader-system/releases/kfc-helper-simulator-reviewed-20261020-91b06f5`.
Build the pushed source on Linux in an isolated release/artifact root. Verify committed
Git blobs, candidate routes, asset integrity, private-proof404s, all34 desktop/mobile build
imports and15 short combat runs before changing production. Recheck the active release;
stop if another deployment moved it. Keep the prior source/artifact root for rollback and
retain old immutable asset URLs by hardlink where appropriate.

Only `kfc-helper-web` may restart. Preserve private env values and all database/ingestion/
crawler/guild services. Repeat the same route/browser checks publicly and compare candidate
versus public settings/results. Record actual commit, build, source/artifact paths and
rollback receipt after successful activation; do not describe staging as deployed.
