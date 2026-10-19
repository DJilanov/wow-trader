# Required combat XP: implementation and operation

October 15, 2026. Implemented and, after owner approval, committed/pushed as `35137da` and deployed
web-only in `kfc-helper-combat-20261015-r9`. The provider import remains private/local; no crawler
restart, database change or installation into the player's WoW addon directory was performed.
[Deployment verification and rollback](forever-leveling-combat-release-2026-10-15.md).

## October 18 five-player integration hardening

The current campaign compiler now attaches combat evidence only after lifecycle-safe route
construction. Known dungeon quests that are not selected in a reviewed dungeon bundle are held in
the dungeon planner; their inside-instance objectives cannot leak into an outdoor chapter. Optional
XP pruning also retains every accepted quest and every quest needed by a later source-chain pickup.

The full private-reference matrix covers 33 editions and 132 scenarios with zero relevant
shortfalls, blockers or missing starts. Its immutable audit is
`artifacts/leveling/audits/2026-10-18/five-player-combat-reference/campaign-xp-audit-eab28d745222fb90.json`
(SHA-256 `eab28d745222fb9099b2a041575f5e9e366489d7ce6a0fc0ffe3e4fe74d26601`).
All chapter checks remain incomplete rather than falsely certified: the dataset still contains no
reviewed dungeon-clear profile or calibrated kill context, and source checkpoint XP remains an
unobserved amount until actual party bars are recorded.

Passive evidence is now session-scoped. Observer records include a bounded `sessionId` and public
`instanceType`, and the review command groups candidate observations without auto-approving them:

```sh
pnpm leveling:combat:review --input=/absolute/path/to/KFCForeverGuideEvidence.lua \
  --destination=artifacts/leveling/combat-review
```

The reviewer accepts only bounded SavedVariables input, rejects malformed/secret values, separates
outdoor and party-instance observations, and emits review candidates. A human must still establish
the killed NPC, un-rested payout context and repeated sample validity before producing calibrated
evidence.

## Delivered behavior

- Source quest readers for both factions expose a folded target panel: NPC links, level ranges,
  required shared kills and a solo/group XP preview. Existing party size selects the conservative
  share; no additional mandatory player configuration is introduced.
- Premade campaign forecasts automatically consume reconciled combat activities. Quest XP,
  outdoor combat and dungeon combat appear separately. Killing XP precedes the subsequent
  hand-in, so level-ups affect later rewards. Estimated combat never becomes a verified reward fact.
- Shared kills advance compatible, simultaneously accepted objectives once. A later accepted
  quest needs its own kills. Separate dungeon path accounting avoids counting a quest kill again
  as clear trash. A missing future clear cannot pay an earlier entry gate.
- A quest already accepted at the saved starting point has unknown remaining kills. The forecast
  excludes that uncertain combat rather than award its full quota again over the actual saved bar.
  Completing a quest in the forecast never fabricates a new measured XP bar.
- Conditional planning may omit unstarted optional filler after all participants reach the target,
  even when that scenario uses labeled combat estimates. Required unlocks and accepted chains
  remain; the simulator does not alter browser checkmarks or automatically delete guide steps.
- Source variants with conflicting quotas stay unresolved. Typed item objectives remain personal
  loot work; the importer does not assume one corpse serves five players or invent a drop rate.

Core modules are `combat-model.ts`, `combat-import.ts`, `combat-xp.ts` and `campaign-combat.ts`
in `packages/leveling/src`. `campaign-xp.ts` integrates them with the existing ledger.
The web loader is `apps/web/src/lib/leveling-combat.ts`.

## What the numbers mean

The default outdoor calculation is a **historical Classic mathematical estimate**, including
enemy/player level differences, gray enemies and an explicit rank factor. It is not a claim that
the current Forever server uses that exact formula or every creature awards normal XP.
Equal-level normal baseline is `45 + 5 × player level`; the implementation recalculates after
each kill. Unknown level distributions use the lower end of the modeled payout range for the
route forecast, not an invented uniform average.

Group planning divides the modeled solo payout by party size, flooring per kill. Quest hand-ins
remain whole per eligible player. No unverified party bonus is added. Missing party levels or
an overleveled member that may trigger suppression prevent a shared payout estimate. This
approximation is not a guaranteed lower bound on a server with unknown tuning.

The historical formula/rank constants are reference assumptions, not copied server code or a
new software dependency. The independent implementation is versioned by `COMBAT_XP_RULE`.
[Historical implementation reference](https://github.com/cmangos/mangos-classic/blob/master/src/game/Tools/Formulas.h).

Dungeon kill tuning is **not inferred** from the 2.375 quest-reward fallback. The October 8
approximately-20% combat increase is not automatically added to current measured payouts.
[Official combat change](https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-october-8/2360696/5).

## Imported coverage and limitations

Pinned provider: `Questie/QuestieDB@49e7dbca1f18eb3b8e57ee5d9562ac3e5c9adcc4`.
The provider's own offline export included inherited, generated, trace and authored **Static**
corrections. Character-specific Dynamic corrections, derived passes and localization are not
applied; do not call this a complete character-specific public-API snapshot. All values remain
reference evidence. Provider provenance and redistribution compatibility still need review before
authorizing public use of this new dataset.

Local normalized data contains 13,391 named NPC records and 5,232 quests. One unnamed provider
NPC is omitted; the inverted Infernal range (NPC 89, 51–50) is held as unknown, not silently swapped.
Name-based credit-proxy exclusions are also held as unknown eligibility, not verified zero XP.
Goal text and typed NPC IDs can recover numeric quotas when the guide omits its comments.
Numeric source/goal disagreements and non-unique matches do not become XP credit.

The archive audit reconciles 1,383 variant objective rows across 205 distinct quest IDs:
120 Alliance and 138 Horde IDs, with overlapping shared quests. These are reference coverage
counts across 157 variants, not a sum of work in one playable route. The existing coordinated
premade circuit remains Alliance-only; Horde source readers receive the same target/XP previews,
not an invented Horde dungeon circuit.

There are currently **zero calibrated kill contexts and zero reviewed dungeon-clear profiles**
in the local import. Known dungeon targets can be displayed, but missing population/tuning is
reported as unmeasured and excluded from numeric totals. Consequently this does not certify that
the whole 1–60 route is funded. Live observations, missing objective identities and the continuing
quest-reward crawl are separate remaining data work.

## Refresh the reference data

Use a trusted, pinned provider checkout. Its documented command
`lua tools/export-forever.lua --include-authored` creates the three required standalone inputs
under `src/corrections/Forever/combined`. Our importer never executes provider Lua; it accepts
only bounded literal exports with the authored-correction marker, preserving sparse tuples.
There is no new production runtime dependency on Lua or .NET.

```sh
pnpm leveling:combat:import --provider-root=/absolute/path/to/combined --revision=49e7dbca1f18eb3b8e57ee5d9562ac3e5c9adcc4
```

Defaults: target build 70205, destination `artifacts/leveling/combat`, publication
`private-reference`. The command builds the TypeScript package, validates the data, writes an
immutable SHA-256-named payload and atomically activates its manifest. Repeating the same import
is idempotent. Raw provider files and the normalized payload remain ignored local artifacts.

The existing `pnpm dev` needs no additional combat service: the web reader discovers this root.
Local web development uses webpack and inline React debug metadata. This avoids the observed
Turbopack font-resolution failure and hydration stalling when the dev debug WebSocket is blocked;
production build and security policies are unchanged.
Override it with `LEVELING_COMBAT_ROOT` if needed. Inspect coverage without network requests:

```sh
pnpm leveling:combat:audit
```

`--destination=/new/audit/directory` preserves the full audit, including unresolved objectives.
The audit checksum-validates every chapter and data artifact. It does not change crawler queues,
publish XP facts, mutate a character or claim a playtest. A combat build mismatch is rejected.

Production refuses `private-reference` data, including data previously cached by a development
reader. After actual source authorization/provenance review, the maintainer can supply
`--authorization-note="recorded permission or compatible licensing basis"` and provision that
authorized artifact separately. The flag records authorization; it does not create permission.
Do not commit private provider exports or silently bypass the production gate.

## Supplying dungeon paths and controlled kill evidence

`--dungeon-profiles=/absolute/file.json` accepts an array validated by
`dungeonCombatProfileSchema`: stable profile/stop IDs, title, `scope`, `basis`, source, source build,
NPC/count packs and a declared dungeon multiplier relative to the historical rank-adjusted model.
Count real required packs/bosses or clearly identified historical path estimates. Coordinates do
not establish a population. Never label a guessed population as observed.

Only a single unambiguous `quest-path` profile can activate automatically for a stop. It is placed
before the first hand-in after the objective sequence. Unscoped full clears, ambiguous paths and
multi-visit sequences such as BRD remain held instead of paying a whole clear at the wrong stage.
Existing quest kills within that path are subtracted from its remaining combat population.
Repeated/overlapping visits still need separately reviewed activity boundaries before activation.

`--kill-xp-evidence=/absolute/file.json` accepts reviewed `killXpEvidenceSchema` records:

- Creature ID, client build, player and creature levels, environment and party size/levels.
- Exact un-rested **per-player** payout, at least three controlled samples and source provenance.
- Explicit verified context; the initial adapter accepts controlled equal-level parties only.

Matching evidence takes precedence over the historical formula and is not divided again, given
another rested factor, or multiplied by the October 8 increase. Other builds, levels and party
contexts do not inherit that measured value. Conflicting calibration contexts fail validation.
An observed party payout is not a reusable solo coefficient. These reviewed records are not
generated automatically from ambiguous chat text.

## Passive addon evidence, off by default

The optional `KFCForeverGuides/Observer.lua` now supports `/kfcguide combat` until reload.
It records at most 2,000 system kill-XP messages with public player/party levels, build, map/instance
and rested-at-capture context. Natural target changes can attach an NPC ID/level candidate if the
message contains a very recent public target name. That candidate is not verified kill attribution.

`/kfcguide stop` stops both combat and existing quest-reward observation; `/reload` saves the
existing `KFCForeverGuideEvidence` SavedVariables root. Collection is never automatically resumed.
Secret values are checked before type/number/string operations. Unavailable APIs stop the relevant
collector safely. There are no NPC/quest query scans, targeting operations, health reads, combat-log
hooks or protected UI actions. The existing trader addon remains untouched.

Review raw messages and their context before producing calibrated evidence. Rested-at-capture is
not proof of the rested contribution to that kill, and target-name matching does not prove an NPC
ID during AoE or rapid target changes. Mixed, ambiguous, boosted and bonus-affected samples stay
unverified. The observer is prepared in the repository, not installed into WoW by this task, and
its live Forever API behavior still needs testing.

## Verification

Regression coverage includes sharing, gray/cap behavior, mixed levels, rank/tuning boundaries,
level-ups, quota recovery/conflicts, shared-objective overlap, new acceptances, actual-bar rebasing,
future-entry checks, clear/quest overlap, calibrated values not divided twice, and optional-filler
pruning. Web tests cover checksum/path/build/publication boundaries. Lua mocks cover bounded
collection, secret values, attribution candidates and safe API failure.

`scripts/check-leveling-combat.mjs` performs local-only browser checks for both factions in solo
and five-player modes, exact displayed estimates/NPC links, mobile layout, accessibility and no
mutation of actual completion/XP progress. Use its `--playwright-package` option as with the other
browser scripts. See `context.md` for the final executed check results and any remaining caveats.
