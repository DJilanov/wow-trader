# Forever quest validation: review, audit and browser consumption

Status: implemented and verified locally on October 19, 2026. No real observation has been approved
by this task, no in-game test is claimed, and no production configuration or deployment was changed.
The [completed quest fetch](forever-leveling-quest-completion-2026-10-19.md) is a separate receipt.

## Implemented pipeline and evidence boundaries

`quest-validation-evidence.ts` validates private reviewed observations. The pure
`quest-validation-signals.ts` and `quest-validation-coverage.ts` modules derive proof from snapshots
and events, not summary flags. The continuous forecast and independent chapter audit share the
consumer. Accepted proof removes only the matching nonblocking annotation and records a receipt.
It never awards XP, changes saved quest state, lowers pickup/access gates or clears a blocking error.

Matching requires the same quest/code, guide release, compiler, declared runtime build, race/class
and applicable party context. Unknown identities stay unverified. The browser and legacy circuit
now expose party race/class settings, with the campaign leader fixed to the selected edition.
Invalid combinations are rejected; an incompatible race change resets class to Unknown. Settings
and backups retain actual XP, rewarded quests and prior history.

| Check                    | Required proof                                                                                                                                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personal eligibility     | Matching acceptance event and not-held→held snapshots for the covered race/class and party size. Unknown inventory/confirmation gates are not certified.                                                                                              |
| Pickup minimum           | Acceptance at or below the lowest disputed claim, without a level-up during the session. This does not discover an absolute minimum or automatically lower the route gate.                                                                            |
| Lifecycle                | Acceptance, ready objectives and rewarded turn-in, in order, on the same character/roster context. Unrelated characters, abandoned attempts and partial phases are not pooled.                                                                        |
| Older prerequisite gate  | Explicit unheld and unrewarded states for every disputed older quest immediately before and after acceptance. Missing API values, incomplete lists and item/confirmation gates remain unresolved.                                                     |
| Five-player named credit | Five distinct recorded roster members, matching known party composition, overlapping sessions, the same NPC instance and progress in the required objective. Repeated exports from one character, unrelated loot or another target cannot certify it. |

Named-target evidence establishes observed credit, not guaranteed drops or one-kill completion for
future groups. A current page marked source-ready is not itself an approved in-game observation.
Missing trusted NPC references also keep named-target evidence unresolved.

## Current recording package

Use review.3 for new recordings, not the older review.1/review.2 artifacts:

`artifacts/leveling/campaign-addon-review/kfc-premade5-human-warrior-3589f8e108c94fba/kfc-premade5-human-warrior-3589f8e108c94fba.zip`

- Version `0.2.0-review.3`, compiler `campaign-addon-20261019-v9`, runtime guard 70450,
  RestedXP v4.11.26, source archive/curve build 70205.
- ZIP SHA-256: `5256525275dedaa6dfe39ec12743df3e3c55b7b804ff9a8632da33a4de958855`.
- 2,445 actions and 852 distinct hand-ins; no historical hand-in reward fallback.
- The passive observer additionally captures public NPC-instance identity and the bounded older
  prerequisites declared by the compiled route. It never accepts, targets, moves, casts, clicks,
  turns in quests or makes network requests.

The reviewer exports source-bound character fingerprints and roster-scoped correlation hashes.
The latter distinguish real roster members across files without publishing GUIDs. NPC instances
also use a separate hash. Non-NPC target names are discarded. Raw SavedVariables remain private.
Legacy exports remain readable, but missing instance/prerequisite data cannot prove those checks,
and an old compiler cannot certify the current one.

The current recording plan is `artifacts/leveling/evidence/campaign-quest-validation-plan.json`,
SHA-256 `bb2357694ecd6e67905d3f825560d1c9b0e423508c6430bec06b422599a1efc7`.
It contains 112 task/code pairs across 65 quests. Follow the
[recording and explicit approval procedure](forever-leveling-quest-validation.md).
Approval is a separate human review step; synthetic test fixtures are never valid release evidence.

## Attach private approved evidence

The option is repeatable so separately reviewed client exports can be checked together. At most
20 bounded files are accepted. Foreign builds are rejected; foreign releases/compilers cannot clear
checks. Identical copies do not create extra observations; conflicting session copies are rejected.

```sh
pnpm --filter @wow-trader/leveling build
node scripts/audit-leveling-quest-xp.mjs \
  --destination=artifacts/leveling/audits/quest-observations \
  --rewards=artifacts/reference/questie/completion-20261019/published \
  --reward-import=artifacts/reference/questie/quest-xp-import.json \
  --runtime-build=70450 \
  --quest-validation-evidence=/private/reviewed/character-one.json \
  --quest-validation-evidence=/private/reviewed/character-two.json
```

Private observation files never enter `CampaignPlan` or browser props. The audit's
`questValidation.publicCoverage` receipt identifies a separate
`quest-validation-coverage-<sha256>.json`, its exact file hash and certificate count. That public
artifact contains only context keys, source hashes, counts and build/compiler identity. It omits
snapshots, GUIDs, character/roster fingerprints, loot/objective text and private session IDs.

`quest-validation-certificates.ts` binds proof to objective/NPC IDs, minimum claims, prerequisite
gates and covered character contexts. Named credit also binds party race/class composition.
Changed inputs invalidate stale coverage. Certificates are emitted only for proof consumed by the
audit, not simply because someone approved a session.

## Browser configuration after approved publication

Install only the public coverage artifact in the deployment's reviewed data area. Set its path,
exact file hash and reviewed runtime build together:

```dotenv
WOW_TRADER_LEVELING_QUEST_VALIDATION_COVERAGE=/absolute/path/to/quest-validation-coverage-<sha256>.json
WOW_TRADER_LEVELING_QUEST_VALIDATION_COVERAGE_SHA256=<exact-file-sha256>
WOW_TRADER_LEVELING_RUNTIME_BUILD=70450
```

The runtime pin is separate from an older compatible world/source artifact, not automatic
detection of a running client. Without a pin, the verified world build is used; build-70450 proof
cannot silently certify build 70205. Review the pin and compiler when updating the application.

The server reader checks the bounded regular file, checksum, schema and build/compiler. Missing,
private, corrupt or mismatched input leaves conditions unverified and shows a notice; XP/progress
are not changed. Logs omit private input contents. Browser forecasts use the same certificate
matcher and show scoped reviewed-condition counts alongside outstanding evidence.

Only supported route/optional work enters the active reward inventory. Held library rows stay
visible as source work, without misleading active-route historical-XP warnings. A quest referenced
by any real action stays in the reward inventory even if its library row is held, so this filter
cannot conceal that action's missing reward.

## Verification and remaining work

Passed: 311 leveling tests; 586 web tests; 22 source/reviewer/queue/checklist script tests; 19
world-data tests; strict package/web typechecks; package and modified-file lint; package builds;
production Next build; all 28 exact addon editions. Lua 5.1 quest/grind observer mock tests passed, and all four Lua files in
the review ZIP passed syntax checks. A temporary Lua 5.1.5 runner was built outside the repository
after checking the archive against the [official checksums](https://www.lua.org/ftp/); no project
runtime dependency was added.

Desktop/mobile browser checks covered bundle defaults, overrides, skips, exclusion/restoration,
reload persistence, fresh mobile saving, party identity persistence and incompatible-class reset.
Identity/planning edits did not alter actual XP or quest state. The preview used the new validated
reward root and real local world snapshot, not empty reward fixtures. No real browser profile was
used, and no addon was installed into the game.

The new 33-edition/132-scenario matrix still covers all 1,161 real hand-in rewards, with zero
historical hand-in fallbacks and no audience-relevant blockers or shortfalls:

- Audit: `artifacts/leveling/audits/2026-10-19/quest-validation-consumer/campaign-xp-audit-6ff7f6a18f980d4b.json`.
  Canonical-JSON SHA-256: `6ff7f6a18f980d4b7d720bb1d907d957ca63890e3fa9d58c1ae2281c32aaf52c`.
- Backlog: `campaign-evidence-backlog-6f3c9ebbb9f42e67.json`, canonical-JSON SHA-256
  `6f3c9ebbb9f42e67d851fef6f73af85825d27ba79f93d8c8aaf8f37a356c8796`.
- Its reward-index file hash now binds the verified snapshot correctly:
  `3c86986a7072ad6a584c6638937de22000d7696290719e192b2ec84aa5272205`.
- Attached real private observation files: **zero**. The baseline therefore still has 121
  validation and 106 measurement tasks, and certification remains false. Passing consumer tests
  is not substitute in-game evidence.

The final source-only reconciliation retains all 83 captured pages and now reports 66 source-ready,
14 conflict and three manual-review rows. The pickup parser uses explicit `zoneID` when compact
Questie spawn tables decode as arrays; array offsets are never treated as area IDs. Ragnar
Thunderbrew's quest 4126 pickup is now correctly classified before BRD. Selected starter items also
retain their direct NPC/object drop sources: 3373 from Shade of Eranikus in area 1477, and 5089 from
Overlord Wyrmthalak in area 1583. Those historical relations do not fill in missing current-page
starter relations or prove party credit, so both item-start quests remain under review. Mixed or
partly unknown pickup origins remain unknown rather than being promoted by one known location.

The baked reader includes only those bounded direct sources, not recursive drop dependencies, and
its checksum now binds the extraction policy, giver-selection flag and extracted entities. The
refreshed source report's exact file SHA-256 is
`8e68dbc9285d76b9ce0ac6b347d800abaf3ea2928590740cf0905b44361bb5fc`.
The recording plan above was regenerated against it; its 112 tasks across 65 quests are unchanged.
These source-context changes do not change the XP index, compiled actions or review.3 ZIP.

Remaining work includes explicit source-disagreement review, actual bounded recordings,
install/parser/tracking/reload checks, unidentified new-dungeon IDs and an authorized release.
The full Horde campaign remains separate. Engineering completion does not imply deployment or a
playtested/measured optimal guide.
