# Forever premade-five RestedXP review package

Status: local review artifact, not a public or playtested release. Updated October 18, 2026.

## Delivered

The campaign addon compiler consumes the same funded, source-ordered campaign actions as the web
guide. It emits a separate `KFCForeverGuides` addon without modifying RestedXP or its SavedVariables.
Each exact Alliance race/class edition contains:

- a leader group with personal starter and shared actions;
- a party group that omits the leader's personal starter actions and begins at the shared route;
- deterministic per-leg `#next` chains, retained map positions and accept/complete/turn-in steps;
- exact `.xp level+current` checkpoints, including the browser-confirmed all-five readiness rule;
- a runtime build guard, explicit source-build identity and a pinned RestedXP parser target; and
- the bounded quest/combat evidence observer already maintained by the KFC addon.

The compiler refuses generic class-null editions, unverified actions, unknown legs, duplicate action
IDs, incomplete or backward quest lifecycle transitions and multiline guide-directive injection.
When personal and shared source branches contain the same complete paid-once lifecycle, it emits
that lifecycle once for the affected role. A source guide update, reward snapshot update or target
build produces a new immutable semantic identity.

All 28 exact Alliance race/class editions compile successfully. Across that matrix, editions contain
2,091–2,451 actions, 723–862 distinct hand-ins, 66–71 leader chapters and 64–68 party chapters.
The five additional browser editions are class-neutral selectors and are deliberately not addon
editions.

## Current Human/Warrior receipt

The first review package is:

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

The ZIP contains only `Guides.lua`, `Observer.lua`, `KFCForeverGuides.toc` and `README.txt`. A
separate manifest binds every file hash, source/reward identities, selected edition and guide/action
inventory. Rebuilding unchanged inputs reuses the same release and hashes.

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
  --version=0.2.0-review.1
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
  --version=0.2.0-review.1 \
  --verify-all
```

`--raid-goals` is an explicit edition choice; omitting it keeps optional raid preparation disabled.
Never substitute a different current-client build or RestedXP version without rebuilding and
repeating the review.

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
   Stop collection with `/kfcguide stop` and `/reload` before copying SavedVariables for review.
9. Test rollback by quitting WoW, removing only this KFC folder and restoring the previous KFC copy.
   RestedXP core and its SavedVariables must remain untouched.

Record the client build, RestedXP version, selected groups, first/last tested action IDs, Lua errors,
checkpoint results, reload result and observer SavedVariables. A bounded successful review proves
the package loads and tracks available content; it does not certify an inaccessible 1–60 playthrough.

## Publication gate

Do not publish the ZIP until the bounded review above passes. The broader measured-route gate remains
separate: replace or observe the historical reward values, calibrate relevant combat/dungeon
profiles and collect actual five-player bars at unresolved checkpoints. Package installation success
must never be presented as measured XP, timing or full-route certification.
