# October 31 leveling and Trader deployment

Production activated at **2026-10-31 16:22 UTC**. Application source is
`9de6157c893119042ed7c78ca3f6f4ef1eba5ff5`; the release and static-delivery label is
`kfc-helper-leveling-trader-20261031-9de6157`, with Next build
`8P9gnLGNLbQ-Zfp8BbKlE`.

The live guide is
<https://kfcguild.online/tools/forever/leveling/routes/alliance-human?plan=premade&class=warrior>.
Its campaign revision is `campaign-20261031-v3`. The finishing chapter presents eight
first-clear choices for the owner's 55–60 dungeon circuit; the earlier BRD run counts once.

## Included source and data

- `9d86e15` captured all 106 pending repository files, including the five-player route policy,
  early Darkshore circuit, flight-path instructions, dungeon preparation, first-clear UI,
  grouped RestedXP export helpers, Trader account/auction-lot foundations and storage updates.
- `d67abdc` fixes addon packaging and state compatibility. Both generated market data and
  account preferences survive a collector reinstall; packaged files remain checksum-verified.
- `9de6157` fixes production startup without published combat references. Source steps keep
  their own prerequisites; alternative pickup paths are not combined into an inferred AND gate.
  The failed candidate stayed private and was never activated.
- Additive migration `0023_trader_account_and_auction_lots` creates six account tables and adds
  auction-lot evidence and upload-installation ownership. It ran transactionally with a five-second
  lock timeout after an isolated PostgreSQL test and a schema-only backup. Web permissions cover
  the new account tables; ingestion receives only installation read/update access.
- The historical quest XP import now contains 2,179 records, restoring quest 2990 from the
  unchanged source export. Its SHA-256 is
  `9363d9a676d372556d969e6a83cbc087780cfe44db6d7b388c869e5b92a8f58f`.
  Production selects the immutable file under
  `shared/leveling/xp-imports/quest-xp-<sha256>.json`; the preceding import is preserved.

The private Questie combat dataset was not published, and its publication gate remains intact.
Historical estimates retain their provenance and freshness checks. This release does not certify
live-server XP, loot sharing or a gameplay playtest. Existing desktop downloads are unchanged;
the updated Electron source was built and tested without publishing a new installer.

Other Trader work continued in the shared checkout after the release snapshot. Those later edits
are preserved separately and must receive their own checks, commit and deployment. In particular,
this deployment does not claim completion of the ongoing personal gold-plan and onboarding work.

## Verification

- Frozen source: all 26 workspace test tasks passed; the web suite passed 2,191 tests, with four
  opt-in integration cases skipped. All 15 lint tasks and all 26 typecheck/build dependency tasks
  passed. Changed files passed Prettier; full-tree formatting found unrelated baseline violations,
  which were preserved.
- After the fallback correction: all 610 leveling tests, package lint/typecheck/build and 11 focused
  web tests passed. All 28 race/class editions and 33 starter projections built without private
  combat data. The regression test rejects replacement of per-step prerequisites by inferred
  source-library dependencies.
- Real PostgreSQL: all migrations plus 14 ingestion/history checks passed; six additional account
  checks covered owner binding, single-use pairing, watch isolation, sync idempotency, rate limiting
  and revocation. The disposable database was removed afterward.
- Addon parity: 120 exact JavaScript/Lua cases passed. Full application builds and the frozen
  Electron/Companion package build passed. The Linux web build retried a transient Google Fonts
  loader error successfully; no font implementation or dependency was patched.
- Private and public Chrome checks passed at 1440 and 390 pixels: eight choices, quest-panel
  navigation, persistence after reload, unchanged member XP/quest state, no overflow or page errors.
- Public smoke checks passed for eight pages and 112 assets, including guild home, tools,
  Forever, Warrior/Smite Priest simulators, Trader, the guide and the Discord website.
- Nginx's worker can read raw/compressed public assets and cannot read the private web environment.
  Only Helper web and ingestion restarted; unrelated PM2 process IDs were preserved.

## Operations and rollback

The authoritative activation, migration, source-checksum, browser, asset and cleanup receipts are in
`/home/wow-trader-system/shared/operations/deploy-all-20261031/` on the server. Small local verification
receipts are in `.cache/deploy-all-20261031/`.

The preceding application/API release and static delivery are both
`kfc-helper-trader-buy-20261031-c496dcb`. Restore their pointers, the previous web environment values
and the API's explicit release working directory together when rolling back. Migration 0023 is
backward-compatible and remains applied; do not drop account data during application rollback.
The configured simulator root, numerical evidence, authorized guide archive and publisher were
preserved. Generated inactive caches were cleaned before staging. The failed private candidate,
its asset mirror, preview processes, transfer archive and test database were removed afterward.
The server had approximately 2.9 GiB free after cleanup; the live and rollback releases were retained.
