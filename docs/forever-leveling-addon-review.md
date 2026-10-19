# Forever premade-five RestedXP review package

Status: local review artifact, not a public or playtested release. Updated October 19, 2026.

For new recordings use review.3 from the
[quest-validation consumer receipt](forever-leveling-quest-validation-consumer.md):
`kfc-premade5-human-warrior-3589f8e108c94fba.zip`, compiler `campaign-addon-20261019-v9`, ZIP SHA-256
`5256525275dedaa6dfe39ec12743df3e3c55b7b804ff9a8632da33a4de958855`.
It adds the passive prerequisite/NPC-instance context required by the consumer. Older package
receipts below are retained for provenance and rollback, not as the current recording instructions.

The earlier completed-quest review.2 ZIP is
`artifacts/leveling/campaign-addon-review/kfc-premade5-human-warrior-aeaf87d7cab25c8c/kfc-premade5-human-warrior-aeaf87d7cab25c8c.zip`.
It contains 2,445 actions and 852 distinct hand-ins with no historical route-reward fallback.
All 28 exact editions compile; the matrix now spans 2,109–2,469 actions and 725–864 hand-ins.
See the [completion receipt](forever-leveling-quest-completion-2026-10-19.md) for checksums and data
identity. Older package counts below are historical receipts, not the current reward state.

## Delivered

The campaign addon compiler consumes the same funded, source-ordered campaign actions as the web
guide. It emits a separate `KFCForeverGuides` addon without modifying RestedXP or its SavedVariables.
Each exact Alliance race/class edition contains:

- a leader group with personal starter and shared actions;
- a party group that omits the leader's personal starter actions and begins at the shared route;
- deterministic per-leg `#next` chains, retained map positions and accept/complete/turn-in steps;
- exact `.xp level+current` checkpoints, including the browser-confirmed all-five readiness rule;
- a runtime build guard, explicit source-build identity and a pinned RestedXP parser target; and
- bounded quest/combat evidence plus opt-in adaptive-grind and quest-validation observers.
- build/session-bound quest-reward evidence with an explicit offline approval step.

The compiler refuses generic class-null editions, unverified actions, unknown legs, duplicate action
IDs, incomplete or backward quest lifecycle transitions and multiline guide-directive injection.
When personal and shared source branches contain the same complete paid-once lifecycle, it emits
that lifecycle once for the affected role. A source guide update, reward snapshot update or target
build produces a new immutable semantic identity.

All 28 exact Alliance race/class editions compile successfully. Across the current matrix, editions contain
2,109–2,469 actions, 725–864 distinct hand-ins, 69–74 leader chapters and 67–71 party chapters.
The five additional browser editions are class-neutral selectors and are deliberately not addon
editions.

## Previous Human/Warrior receipt

The first immutable review package is retained at:

`artifacts/leveling/campaign-addon-review/kfc-premade5-human-warrior-a9e3928bc2d11770/`

- compiler revision: `campaign-addon-20261018-v4`
- semantic SHA-256: `a9e3928bc2d11770ab3e65cf0b939e2dbd51900b89e6ebffb7494bd344f93196`
- ZIP: `kfc-premade5-human-warrior-a9e3928bc2d11770.zip`
- ZIP SHA-256: `419adfb546521ac99e0c6edf87822462f1dbbe43ff56bf106994d5a19025ae83`
- source archive build: 70205
- review runtime build: 70450
- parser target: RestedXP v4.11.26, interface 16001
- route: 2,427 actions, 850 distinct hand-ins, 71 leader chapters and 67 party chapters
- evidence boundary: 23 scheduled rewards in this edition still use labeled historical references;
  combat and late-beta content remain unverified

That receipt predates `GrindObserver.lua` and `QuestObserver.lua`; it must not be used to collect
adaptive-checkpoint or structured quest-validation measurements. The next build contains
`Guides.lua`, `Observer.lua`, `GrindObserver.lua`, `QuestObserver.lua`, `KFCForeverGuides.toc` and
`README.txt`. A separate manifest binds every file hash,
source/reward identities, selected edition and guide/action inventory. The new observer changes the
semantic identity, so it correctly creates a new immutable release rather than modifying this one.

## Build commands

Set `WOW_TRADER_REFERENCE_PUBLISHED` to a local copy of the checksum-valid published reference root.
The build refuses missing records, failed checksums and unauthorized or modified route archives.

```sh
export WOW_TRADER_REFERENCE_PUBLISHED=/absolute/path/to/reference-published

pnpm leveling:addon:campaign -- \
  --archive=artifacts/leveling/archive \
  --rewards="$WOW_TRADER_REFERENCE_PUBLISHED" \
  --reward-import=artifacts/reference/questie/quest-xp-import.json \
  --destination=artifacts/leveling/campaign-addon-review \
  --race=human \
  --class=warrior \
  --runtime-build=70450 \
  --restedxp-version=v4.11.26 \
  --interface=16001 \
  --version=0.2.0-review.3
```

Before making any edition available, compile the entire exact-edition matrix:

```sh
pnpm leveling:addon:campaign -- \
  --archive=artifacts/leveling/archive \
  --rewards="$WOW_TRADER_REFERENCE_PUBLISHED" \
  --reward-import=artifacts/reference/questie/quest-xp-import.json \
  --runtime-build=70450 \
  --restedxp-version=v4.11.26 \
  --interface=16001 \
  --version=0.2.0-review.3 \
  --verify-all
```

`--raid-goals` is an explicit edition choice; omitting it keeps optional raid preparation disabled.
After approving an observation artifact, add
`--reward-evidence=artifacts/leveling/evidence/rewards/reward-evidence-<hash>.json`; omit that optional
argument until the file exists. The dedicated reward-evidence runbook documents its review gate.
Never substitute a different current-client build or RestedXP version without rebuilding and
repeating the review.

The compiler was also exercised against the checksum-valid but incomplete October 15 local reward
snapshot. It produced the build-70450 observer smoke package at
`artifacts/leveling/campaign-addon-review/kfc-premade5-human-warrior-5b742b1472cc9a42/` (ZIP
SHA-256 `1b887343da0ffbe3c8c331dabbc844f4de103626fd6bfc1fb13d860d686c7b92`). Its manifest correctly
reports 567 route rewards falling back to historical data, so it is suitable for bounded observer
API tests only—not route certification or publication. Rebuild from the newer complete published
reward root before the full in-game route review.

## Bounded in-game review

1. Quit WoW completely. Preserve any existing `KFCForeverGuides` directory as the rollback copy.
2. Expand the ZIP so `KFCForeverGuides` is directly inside the active client's
   `Interface/AddOns/` directory. Do not place the release directory or ZIP around that addon folder.
3. Confirm RestedXP v4.11.26 and KFC Forever Guides are enabled for every test character. Start
   Forever client build 70450. A different build must refuse to register the guide.
4. On the designated Human Warrior, select `KFC Forever Premade 5 · Human Warrior · Leader`. On the
   other four characters, finish their normal personal starter routes, meet at the stated
   rendezvous and then select the matching `Party` group.
5. Confirm the first and next chapters load without a Lua error. Verify accept, objective, hand-in,
   retained coordinate and exact fractional XP steps against the browser route.
6. At each party checkpoint, continue only after the browser confirms every participating player is
   ready. Verify optional XP work cannot bypass accepted chains, prerequisites or dungeon setup.
7. Reload during an accepted quest and at a chapter boundary. Confirm both RestedXP progression and
   KFC evidence persist without duplicate rewards or a reset to chapter one.
8. Use `/kfcguide xp`, then bounded `/kfcguide observe` and `/kfcguide combat` sessions where useful.
   At XP steps, use the exact `/kfcguide grind <checkpoint-id>` command printed by the guide and
   finish it with `/kfcguide grind stop`. Follow the contamination and approval procedure in
   [`forever-leveling-grind-evidence.md`](forever-leveling-grind-evidence.md).
   Review quest turn-ins separately with
   [`forever-leveling-reward-evidence.md`](forever-leveling-reward-evidence.md); never publish raw
   SavedVariables containing character identity.
   Follow [`forever-leveling-quest-validation.md`](forever-leveling-quest-validation.md) for named
   targets, eligibility, lifecycle and disputed pickup/gate sessions.
9. Stop remaining collection with `/kfcguide stop` and `/reload` before copying SavedVariables for
   review.
10. Test rollback by quitting WoW, removing only this KFC folder and restoring the previous KFC copy.
    RestedXP core and its SavedVariables must remain untouched.

Record the client build, RestedXP version, selected groups, first/last tested action IDs, Lua errors,
checkpoint results, reload result and observer SavedVariables. A bounded successful review proves
the package loads and tracks available content; it does not certify an inaccessible 1–60 playthrough.

## Publication gate

Do not publish the ZIP until the bounded review above passes. The broader measured-route gate remains
separate: replace or observe the historical reward values, calibrate relevant combat/dungeon
profiles and collect actual five-player bars at unresolved checkpoints. Package installation success
must never be presented as measured XP, timing or full-route certification.

## Web test deployment — 2026-10-19

The browser campaign and reward-evidence changes are deployed for maintainer testing as
`kfc-helper-leveling-campaign-test-20261019-r1`. The leveling implementation is committed in
`fbc0d36`; identity-conflict handling is corrected in `0e0541b`. The release was layered over the
previous active source so unrelated, newer KFC web work was preserved. Only `kfc-helper-web` was
reloaded; ingestion remains pinned to its independent release.

The optional historical import is installed outside the application release at
`/home/wow-trader-reference-worker/shared/imports/quest-xp-import.json`. Its verified SHA-256 is
`ec63dbbbdbe00acea0fc4845d84826b01a5def17c1a7326d6b20bf4612e7a01c`. A current-client identity
conflict now holds the quest even when that import contains a numeric estimate; historical evidence
cannot bypass the conflict gate.

Server verification passed 252 leveling tests and 396 web tests, package typechecks, package lints,
and both production builds. Public smoke checks returned HTTP 200 for data status, leveling and the
premade planner; the legacy Helper URL retained its one-to-one HTTP 301 redirect. The default live
edition reports 414 of 438 routed quests from published Forever evidence and 24 labeled historical
estimates. This web deployment does not open the addon ZIP publication gate described above.

Immediate web rollback is `kfc-helper-leveling-quest-completion-20261018-r1`. Its release directory
and the pre-activation web environment backup are retained on the server.
