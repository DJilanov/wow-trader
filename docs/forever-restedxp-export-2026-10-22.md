# Current-route RestedXP export

October 23 follow-up: the dungeon-order correction advances the compiler to
`campaign-addon-20261023-v23`. The v22 review.6 package below remains an immutable
historical review, not a package of the newly reordered route. See the
[dungeon-order audit](forever-leveling-dungeon-order-audit-2026-10-23.md).
No replacement ZIP is installed or published by that code change.

Status: local implementation and software verification complete; awaiting owner client-build
confirmation and in-game acceptance. This is not an installed or published guide release.
Owner target: RestedXP **v4.11.27**. Client build **70450** remains the last confirmed
review target; a new addon version is not evidence of a new client build.

## Required outcome

Generate the current approved route from the same structured actions used by the browser,
as both a separate KFC addon ZIP and a stock RestedXP paste-import string. Preserve
race/class eligibility, personal starters, the shared party route, chosen optional dungeons,
real prerequisites, native waypoints/quest tracking and justified XP gates. Never infer that
an estimated XP bar is actual progress, invent missing dungeon quest IDs, or count a
one-time quest reward twice. Browser-only display preferences are not guide instructions.

The original supplied import is a private, account-bound reference, not an export template
to redistribute. Its checksum still matches the earlier analysis: 157 guides, 98 Alliance /
59 Horde, 22,604 raw steps including alternative branches, 1,508,930 encoded bytes and
6,603,218 decoded guide bytes. New exports must contain only authored or redistribution-
authorized content, never original account cache keys.

## Work and acceptance evidence

- [x] Pin the actual v4.11.27 loader/parser and record its identity.
- [x] Expose structured guide documents from the existing compiler; ZIP and import string
      must consume identical documents and chapter/action identities.
- [x] Preserve required native travel, training and quest-state semantics; reject unsafe
      or unsupported instructions instead of claiming full semantic fidelity.
- [x] Export the selected dungeon/route configuration rather than silently using defaults.
- [x] Implement bounded, versioned stock import encoding and independent decode verification.
      BattleTag/account context stays local and must never appear in logs or public manifests.
- [x] Verify malformed input, corruption, wrong account, UTF-8, size limits and deterministic
      route contents, using the actual pinned Lua loader as an independent oracle.
- [x] Build a fresh immutable full-route review package and repeat the supported edition
      matrix. The old review.3 ZIP uses compiler v9, not the current compiler.
- [x] Add a usable export/download flow with loading/error/copy/download states. Preserve the
      existing supporter/publication boundary; no unreviewed paid download is activated.
- [x] Check website/addon action parity and browser UX at desktop/mobile widths.
- [x] Document exact build commands, artifacts, checks and in-game acceptance steps.
- [x] Obtain a clean full-web typecheck, lint, test and production-build receipt without
      changing unrelated concurrent work or weakening checks.
- [ ] Owner verifies the import in the target game: registration, arrows, quest objectives,
      hand-ins, actual-level gates, optional dungeon skipping and next-chapter transitions.

Software tests, a Lua parser harness and an artifact manifest cannot prove an in-game
playthrough. Installation, public release, payment activation, commit/push and deployment
are separate operations and are not performed implicitly by this implementation.

## Current verification and review artifact

The pinned official RestedXP v4.11.27 source is Git revision
`ce1e51daf5e0f5cf727903d82e7269947ac27d73`; `GuideLoader.lua` SHA-256 is
`5b90faa702643687f040348b28f9ea41ba145809be33444dd93d10cc83449796`.
The independent harness runs its unmodified loader, Base64 and LibDeflate under Lua 5.1.5.
The Lua source archive is checksum-verified against the official lua.org release listing.
Only WoW APIs and native command constructors are test doubles.

On October 22, 2026:

- All **540 leveling tests**, **10 CLI/manifest verification tests** and the complete current
  **1,211-test web suite / 140 files** passed. The current web run used `--maxWorkers=1`, with
  unchanged assertions and timeouts, and finished in **588.81 seconds**. Leveling typecheck,
  lint and ESM/declaration build passed. Lint for the
  changed export/preparation web modules and all eight export/build/validation scripts passed.
  `git diff --check` passed.
- Compiler **`campaign-addon-20261022-v22`**, review version **`0.2.0-review.6`**: all **28**
  exact leader editions compile, plus the complete **784 leader/member pairings** (28 × 28),
  including same-edition and independent starters, with raid preparation both off and on.
  Each compilation validates the document
  schema, requested versus emitted role/starter inventories, exact duplicate-phase receipts,
  and sequential chapter chains. These are **1,624 structural compiler/manifest checks** across
  the two settings, not in-game playthroughs or every possible optional-quest combination.
  The earlier 84-case sample was expanded during the completion audit. A separate fixed-member
  run verified all 28 leader editions and the JSON report's pinned source/reward/selection context.
- The latest local full-route candidate is
  `artifacts/leveling/campaign-addon-review/kfc-premade5-human-warrior-6cc4dcb83c6e1f60/`:
  Human/Warrior leader, Dwarf/Priest member, **2,236 selected campaign actions**, **800 unique
  hand-in quest IDs**, **146 guide documents** (73 per role), no historical route XP fallback.
  ZIP SHA-256: `c00d4e1735e1739d6921b645e0bb645c79e58c637c14a90ae8371d566e9595ba`.
  Rebuilding the same inputs reused the immutable package after verifying manifest, addon
  files, guide documents and ZIP checksums; it did not overwrite the release.
- All 146 documents passed exact decoded-byte comparison, stock structural parsing,
  registration, cache and next-guide checks in their respective Human/Warrior and
  Dwarf/Priest contexts. Three synthetic accounts per context passed; all six corresponding
  wrong-account cases were rejected. Native command names are checked against pinned
  `functions.lua` before constructors are replaced by test doubles. No real BattleTag was used.
- A real Chromium 140 review session exercised ZIP download without a BattleTag, local paste
  generation and independent Node-zlib decoding, text download, clipboard-denial/manual-copy
  fallback, output invalidation, and an independent Dwarf/Priest starter. Guide document bytes
  matched between ZIP and paste output. Widths **1440, 390 and 320 px** passed horizontal-layout
  checks; desktop/mobile screenshots were inspected. Account input was cleared and absent
  from localStorage and sessionStorage. The strengthened HTTP guard checked all **22 outgoing
  requests**, including URLs, headers and bodies, for the raw and URL-encoded synthetic
  BattleTag; it would abort any match before forwarding. Only request counts and safe export
  metadata are recorded, not headers or payload dumps.
  Latest local receipt: `/var/folders/xw/7z04bfmn5cv5hl86pp_4dtnw0000gp/T/kfc-restedxp-browser-Skt1BC/verified.json`.
- An isolated optimized production build (`WOW_TRADER_BUILD_DIR=.next-restedxp-build`)
  passed compilation, TypeScript and all 57 prerendered pages. A local production HTTP smoke
  test deliberately set the review flag and still received **404 / `export_disabled`**, with
  `no-store` and `nosniff`. No public service or production deployment was changed.

Current full-web lint, typecheck and production build pass. The earlier encyclopedia
type errors and `tool-group-draft.ts` lint errors were resolved by concurrent work, not by
this export task. A subsequent full run, now containing 140 files / 1,211 tests, passed
1,209 tests but timed out on two five-second Mage simulator cases in
`forever-simulator-profile-model-updates-v3.test.ts`. That entire file then passed all 22
tests in isolation with one worker and unchanged assertions/timeouts. The complete serial
rerun then passed all **140 files / 1,211 tests** in **588.81 seconds**, closing the software
release-check gate. No simulator tests, fixtures or timeouts were modified for this export.

No addon was installed, no public download was enabled, and no export code was committed,
pushed or deployed. The separately requested Discord event was published, as recorded below.

## Architecture and semantic boundaries

The route compiler targets premade-five Alliance editions. `campaign-preparation.ts` owns
the shared reward inventory, supported catch-up filtering, combat attachment, pickup gates
and funding transformation used by the website and offline builder. Evidence readers retain
their separate identity/publication checks: an offline XP directory is not proof that it
matches the deployed website's current catalog. The browser export recompiles the actual
`getLevelingCampaign` plan and rejects a stale complete-action SHA-256 instead of substituting
a different route. Original account caches are neither read nor rebound.

The compiler's `canonical-sequential-v1` policy retains source waypoint arguments/order,
eligible travel/training, retained quest phases/reward choices, bound quest items and runtime
checks. It deliberately replaces the original sticky/parallel graph and optional grinding
with the selected website action sequence and actual prerequisite XP gates. Unsupported
commands, unsafe arguments and mismatched source identities fail closed. Source `#level`
training reminders become reverse-XP skips, not compulsory grinding.

Guide summaries list requested/emitted action IDs and each removed duplicate one-time quest
phase. The current leader output has 2,230 emitted actions after six duplicate-only actions;
the member has 2,174 after three. These removals are explicit normalization receipts, not
additional XP or silently discarded unique quests. Manifest/ZIP review metadata records them.

The local player's real XP is checked by RestedXP. A separate manual party-ready step asks
for confirmation in party chat; a stock import cannot see other players' XP or website
progress. Unknown new-dungeon quest IDs remain clearly labeled planning-only instructions,
never invented accept/turn-in directives. Guide ZIPs generated in the browser have no
observers or SavedVariables; CLI review ZIPs include the existing bounded evidence observers.

The universal stock codec remains separate from the supported route compiler. `fflate`
0.8.3 is the sole added runtime dependency, for deterministic in-memory ZIP delivery; browser
paste encoding uses native compression streams. Public export remains disabled even if the
review flag is accidentally set in production; non-loopback review requests are also refused.
Bind the development preview explicitly to loopback as shown below. Supporter/payment entitlement is not invented
or bypassed by this local review feature.

User changes to `context.md` were already present when this task started and are preserved.

## Reproduce locally

From the repository root, prepare the pinned Lua/RestedXP oracle once:

```sh
pnpm leveling:restedxp:prepare
```

This downloads official pinned sources and builds Lua in ignored `.cache/restedxp/`; it
does not install or modify anything in the game. The existing CLI ZIP packager requires
the `zip` command. The browser ZIP path does not require an external ZIP program.

Build the full mixed-starter review package (choose the actual member race/class as needed):

```sh
pnpm leveling:addon:campaign -- \
  --archive=artifacts/leveling/archive \
  --rewards=artifacts/reference/questie/completion-20261019/published \
  --reward-import=artifacts/reference/questie/quest-xp-import.json \
  --runtime-build=70450 --restedxp-version=v4.11.27 \
  --destination=artifacts/leveling/campaign-addon-review \
  --race=human --class=warrior --party-race=dwarf --party-class=priest \
  --version=0.2.0-review.6
```

Add `--configuration=/absolute/path/selection.json` to export saved route choices. It accepts
only `selectedExtras`, `selectedBatches`, `guaranteedBundles`, `difficultyPolicy`, `raidGoals`
and `parityScenarios`, using the existing schemas. Actual names, bars, quest completion and
party progress are excluded. Unmodeled selected extras fail rather than disappearing.
Omit member flags for a shared-only party group. `--verify-all` checks editions in memory
without writing packages; without fixed member flags it also checks the two personal variants
per leader. Combat input remains an explicit `--combat=<authorized/review directory>` opt-in.

Check the complete leader/member cross-product before accepting a compiler or source update:

```sh
pnpm leveling:addon:campaign -- \
  --archive=artifacts/leveling/archive \
  --rewards=artifacts/reference/questie/completion-20261019/published \
  --reward-import=artifacts/reference/questie/quest-xp-import.json \
  --runtime-build=70450 --restedxp-version=v4.11.27 --version=0.2.0-review.6 \
  --verify-all --verify-party-matrix
```

Repeat with `--raid-goals` for the raid-preparation variant; both complete matrices passed
for the pinned source/reward inputs above. Without raid preparation the edition ranges are
1,952–2,265 actions / 686–812 hand-ins; with it they are 2,013–2,326 / 716–842.

This writes no ZIPs, prints progress to stderr, and emits a JSON summary on stdout,
including the selected options, source/reward identity and pinned compiler/addon target.
`--verify-party-matrix` requires `--verify-all` and refuses fixed member flags. The shared
review checker has negative regression tests for wrong starter inventories, changed action IDs,
cyclic chapter chains and missing/fabricated normalization receipts.

Verify the generated documents independently:

```sh
pnpm leveling:restedxp:verify -- \
  --documents=artifacts/leveling/campaign-addon-review/kfc-premade5-human-warrior-6cc4dcb83c6e1f60/guides.json
pnpm leveling:restedxp:test
```

Broader checks used for this review:

```sh
pnpm --filter @wow-trader/leveling test
pnpm --filter @wow-trader/leveling typecheck
pnpm --filter @wow-trader/leveling lint
pnpm --filter @wow-trader/web exec vitest run src --maxWorkers=2
pnpm --filter @wow-trader/web typecheck
pnpm --filter @wow-trader/web lint
WOW_TRADER_BUILD_DIR=.next-restedxp-build pnpm --filter @wow-trader/web build
```

For a shared busy development machine, use `--maxWorkers=1` if simulator evidence-fixture
I/O causes timeouts; do not increase or disable the test timeouts to hide failures. Avoid
running a leveling `--clean` package build concurrently with web typecheck; it temporarily
removes the package declarations the web check needs.

For a stock paste import, put your BattleTag in a private local file (permissions 0600 on
macOS/Linux), not in an argument, chat, source file or environment variable:

```sh
pnpm leveling:restedxp:export -- \
  --documents=artifacts/leveling/campaign-addon-review/kfc-premade5-human-warrior-6cc4dcb83c6e1f60/guides.json \
  --role=leader \
  --account-file=/absolute/private/battletag.txt \
  --output=/absolute/private/kfc-import.txt
```

Use `--role=party` for the member. Mixed-starter document sets refuse `--role=all`. Account
input can alternatively arrive on stdin. The encoder independently decodes and compares
all guide bytes before writing a new 0600 file; existing output is never overwritten.
The import is account-bound for stock compatibility, not a security or payment entitlement.

For the website UI:

```sh
WOW_TRADER_BUILD_DIR=.next-restedxp-review \
LEVELING_RESTEDXP_REVIEW_EXPORT=1 \
pnpm --filter @wow-trader/web exec next dev --webpack --hostname 127.0.0.1 --port 3334
```

Open `http://localhost:3334/tools/forever/leveling/routes/alliance-human?plan=premade&class=warrior`.
Use the normal local evidence environment if comparing XP forecasts; the export must match
the route displayed in that same preview. Select Leader or Party member; for Party, choose
your own race/class. Download ZIP needs no BattleTag. Create paste import uses your BattleTag
only in the browser and clears the input on success or failure. Clipboard-denial falls back
to selecting the import and offering a text download. No public environment is enabled here.

## Owner in-game acceptance — still required

1. Confirm the actual Forever client build and RestedXP version before installing anything.
   A version change requires a new target and repeat verification; do not relabel the old ZIP.
2. Back up any existing KFC addon folder. Test either the ZIP or paste import, not both at
   once. Never overwrite RestedXP or its SavedVariables. A paste import cannot enforce an
   exact client build; the ZIP bootstrap checks build 70450.
3. Confirm the correct race/class group appears, the leader starts in the correct personal
   area, and a different-race/class member gets their own starter followed by shared chapters.
4. Check actual arrows, radius/order, flight paths, hearthstone/training steps, quest accepts,
   objective counters, reward choices and hand-ins. Stock command constructors were mocked
   in the software oracle; these game-specific behaviors are not certified by that test.
5. Check a real required-level gate both below and above its level, the separate party-ready
   checkbox, a skipped optional dungeon, and an automatic next-chapter transition.
6. Report build/version, group/chapter/action label, expected versus observed behavior and a
   screenshot or Lua error. Validate XP tuning and late/new dungeon availability separately;
   software import success is not proof of an entire level-1-to-60 playthrough.

Software checks are complete, but the goal remains unachieved until owner acceptance exists.
The current client build and real import/arrow/quest-tracking results are still missing.
Owner-only in-game validation cannot be replaced with additional mocked software tests.
Keep the requested code-only boundary until the owner confirms readiness. Installation,
paid publication, commit/push and deployment still require their respective explicit requests.

## Follow-up requested during implementation

The owner requested a separate **November 14, 2026** group-leveling event using the
November 5 event's time, timezone and other details, then requested publication in a
third Discord destination. This event follow-up is now published; it does not imply
that the RestedXP export review or in-game acceptance is finished.

- Canonical event: https://www.wowforeverdiscord.online/raids/cmvjfk2eb0000jw4sauv4y7yl
- Main Forever signup post: https://discord.com/channels/1554316932948172940/1562782678384779415/1562782678384779415
- KFC announcement: https://discord.com/channels/1411533815356194968/1562733881571024977/1562782904600371281
- Additional group-leveling forum post: https://discord.com/channels/1554316932948172940/1562783171203047505/1562783171203047505

The event runs **08:30–20:30 CET (Europe/Berlin)**. The sole initial signup is
**djilanov**, **Druid / Feral / tank**, using a separate character record. The
admission policy remains open signup, as on November 5; registered does not mean
organizer-confirmed. No other attendees, confirmations or signup state were copied.

Live verification: the main post and KFC mirror both delivered event revision 3
with no delivery error and the same one-person roster. The third forum post is a
linked announcement, not an auto-synchronized roster copy; it directs participants
to the same live signup page and main Discord signup. Its static text and status tag
need an explicit edit if those announcement details change. All three bot-owned
messages were read back and their canonical links verified; the event page returned
HTTP 200. The November 5 event remained at revision 13 with its five existing
signups, including the owner's unchanged Warrior / Protection signup.
