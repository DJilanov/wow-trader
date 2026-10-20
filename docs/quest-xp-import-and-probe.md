# Quest XP sources and probes

Six operator tools are available while Wowhead returns HTTP 403 or a challenge to the reference
crawler: `questie-quest-xp`, `blizzard-probe`, `blizzard-quest-xp`, `import-quest-xp`,
`import-saved-html`, and `probe`.

## Current leveling consumption (October 18, 2026)

Superseded for local guide verification by the
[October 19 completion receipt](forever-leveling-quest-completion-2026-10-19.md): 353/354 queue pages
captured (3343 confirmed unavailable), all 83 route-evidence pages, all 1,161 real hand-in IDs covered
by Forever rewards and zero historical hand-in fallbacks. Production publication is a separate step.
The October 18 figures below are retained as historical context.

The completed 278-item fallback queue yielded 277 valid published numeric Forever records and one
reviewed not-found quest (3343). The five-player Alliance compiler's 33-edition union currently has
1,159 hand-in IDs: 1,133 published numeric Forever rewards, 26 historical Questie estimates and zero
unresolved numeric planning values. The historical rows are never relabeled as Forever evidence.

Production/runtime fallback is opt-in through
`WOW_TRADER_LEVELING_QUEST_XP_IMPORT=/absolute/path/to/quest-xp-import.json`. Published available or
conflicting Forever facts always win. Only a missing/unknown primary may receive a schema-validated,
size-bounded historical fallback, and the browser shows the resulting estimate count. The same
semantics are available to the offline matrix:

```sh
pnpm --filter @wow-trader/leveling build
pnpm --filter @wow-trader/reference-data build
node scripts/audit-leveling-quest-xp.mjs \
  --destination=artifacts/leveling/audits/current \
  --rewards=/absolute/path/to/published \
  --reward-import=artifacts/reference/questie/quest-xp-import.json \
  --reward-evidence=artifacts/leveling/evidence/rewards/reward-evidence-<hash>.json \
  --runtime-build=70450
```

`--reward-evidence` is optional and accepts only explicitly approved current-build observations.
See [`forever-leveling-reward-evidence.md`](forever-leveling-reward-evidence.md). Exact observed
level rows override historical estimates; a scaled observation never becomes an observed base value.

The current route audit and the exact 26 estimated IDs are documented in
[`forever-leveling-full-route-audit.md`](forever-leveling-full-route-audit.md#october-18-five-player-route-compiler-completion).

## Route-evidence quest queue

The Questie fallback queue is an XP queue, not a complete route-metadata queue. A quest with usable
Questie XP can therefore still need its current Wowhead page for pickup level, faction/race/class
restrictions, quest giver, turn-in target, objectives, prerequisite context, or current reward
evidence.

Generate a deduplicated crawler queue from a campaign evidence backlog and merge it with the original
XP fallback queue:

```sh
pnpm leveling:evidence:queue -- \
  --backlog=artifacts/leveling/audits/2026-10-19/evidence-backlog/campaign-evidence-backlog-6236cd9318e622b4.json \
  --base-queue=artifacts/reference/questie/unresolved.json \
  --queue=artifacts/reference/questie/leveling-evidence-unresolved.json \
  --report=artifacts/reference/questie/leveling-evidence-unresolved.report.json
```

The report records why each quest was selected and the fields expected from its page. It deliberately
excludes named-target party-credit checks and adaptive-grind measurements because a page cannot prove
those behaviors; they remain in-game evidence tasks.

The October 19 evidence backlog selects 83 unique quest pages from 130 evidence issues. Seven were
already in the 278-quest XP queue, so the merged queue contains 354 quests and adds 76 new page
captures. The local operator launcher uses the merged queue by default:

```sh
~/wow-trader-reference/run-questie-crawl.sh
~/wow-trader-reference/status-questie.sh
```

The status output has a separate `leveling route evidence` section so unrelated quality gaps from
the original archive do not hide the route collection count. After the route pages finish, compile
the current Wowhead facts together with the selected, non-executed local QuestieDB lifecycle rows:

```sh
~/wow-trader-reference/compile-leveling-evidence.sh
```

The compiler keeps four states distinct: `source-ready`, `pending-current-page`, `manual-review`, and
`conflict`. A current page does not silently override a disagreeing curated minimum, and historical
QuestieDB data cannot by itself certify current Forever behavior. Personal party eligibility and
party-credit behavior remain in-game checks even when their source restrictions are complete.

## Local QuestieDB import and flavor filtering

`questie-quest-xp` reads the generated data from an installed QuestieDB without executing Lua. It
matches only ids in the reviewed leveling queue, records the SHA-256 and QuestieDB TOC revision, and
compares imported values with staged Wowhead evidence when `--staging` is supplied.

The same operation reads QuestieDB's generated SoD base-quest table as explicit flavor evidence.
SoD-only identities are written to a separate exclusion queue and never silently treated as missing
Forever data. All other unresolved quests enter the fallback queue. High quest ids are not excluded by
heuristic; an id must occur in the SoD dataset.

Build the archive queue, then resolve it from the local addon:

```sh
pnpm --filter @wow-trader/leveling build
node scripts/leveling-archive-xp-queue.mjs \
  --archive artifacts/leveling/archive \
  --destination artifacts/reference/questie/queue

pnpm --filter @wow-trader/reference-data dev questie-quest-xp \
  --queue artifacts/reference/questie/queue/forever-archive-xp-<hash>.json \
  --questie-root "/Applications/World of Warcraft/_anniversary_/Interface/AddOns/QuestieDB" \
  --output artifacts/reference/questie/quest-xp-import.json \
  --fallback-queue artifacts/reference/questie/unresolved.json \
  --excluded-queue artifacts/reference/questie/excluded-sod.json \
  --filter-report artifacts/reference/questie/filter-report.json \
  --staging /absolute/path/to/wowhead-staging
```

On Windows, pass the installed `Interface\\AddOns\\QuestieDB` directory to `--questie-root`. Linux
paths work the same way. `--target-flavor` currently accepts only `forever`; this prevents a caller
from accidentally applying the Forever exclusion policy to another edition.

Outputs:

- `quest-xp-import.json` uses `sourceKind: "addon-database"` and preserves unknown zero-XP rows.
- `unresolved.json` contains only non-SoD quests without usable Questie XP.
- `excluded-sod.json` remains a valid reference-task queue for review.
- `filter-report.json` records both input hashes, the QuestieDB revision, excluded ids, and counts.

The 2026-10-17 validation against the authorized 2,535-quest archive produced 2,178 usable Questie
records, 79 explicit SoD exclusions, and 278 unresolved Forever candidates. No queued Questie record
had a zero or otherwise unusable XP value. Quest 581 resolved to quest level 34 and base XP 2,000.

The importer reads the user's existing addon installation; it does not download or redistribute
QuestieDB. Do not bundle QuestieDB data in a commercial distribution without confirming its license or
obtaining permission from its maintainers.

## Blizzard Game Data API

The Blizzard commands use OAuth client credentials from the local environment. Create a dedicated
client in [Battle.net API Access](https://community.developer.battle.net/access/clients). If a secret
is pasted into chat, an issue, a terminal recording, or a committed file, revoke it and generate a
replacement before use.

Put the replacement credentials in the repository-root `.env.local` or `.env`; both are ignored by
Git, and `.env.local` takes precedence when it contains both credentials:

```dotenv
BLIZZARD_CLIENT_ID=replace_with_the_new_client_id
BLIZZARD_CLIENT_SECRET=replace_with_the_new_client_secret
BLIZZARD_API_REGION=eu
BLIZZARD_API_LOCALE=en_US
BLIZZARD_API_NAMESPACE=replace_with_the_exact_static_namespace
```

The namespace is deliberately not guessed. It must be the static namespace for the target Classic
edition shown by Blizzard's namespace/API documentation. The CLI validates that it begins with
`static-`. Credentials and temporary OAuth tokens are never written to evidence or console output.

Run one quest before starting a batch:

```sh
pnpm --filter @wow-trader/reference-data dev blizzard-probe \
  --quest-id 581 \
  --output artifacts/reference/blizzard/probe-581.json
```

The probe writes the complete public response with its URL, namespace, locale, timestamp, and SHA-256.
It reports one of `available`, `missing`, or `missing_xp`. Continue to a batch only when the probe is
`available` and the returned quest title/value match the intended edition.

After a successful probe, resolve a bounded queue through Blizzard and create a smaller Wowhead queue:

```sh
pnpm --filter @wow-trader/reference-data dev blizzard-quest-xp \
  --queue /absolute/path/to/forever-archive-queue.json \
  --evidence-directory artifacts/reference/blizzard/quests \
  --output artifacts/reference/blizzard/quest-xp-import.json \
  --fallback-queue artifacts/reference/blizzard/wowhead-fallback.json \
  --staging /absolute/path/to/wowhead-staging
```

The batch is sequential and defaults to 150 ms between Blizzard requests. Each public response is
written atomically and reused on restart. A confirmed `404` or a `200` response without an experience
reward enters the fallback queue. Authentication failures, authorization failures, rate limits, and
server errors stop or retry the Blizzard run; they never generate a large Wowhead fallback. If a
multi-quest run finds no usable XP at all, it stops and asks the operator to verify the namespace.

The normalized output uses `sourceKind: "blizzard-api"` and remains separate from Wowhead evidence.
Supplying `--staging` reports disagreements as conflicts without overwriting either source.

### Classic Era result, 2026-10-17

The authenticated EU check established that `static-classic1x-eu` is a valid Classic Era namespace:

- `/data/wow/playable-class/index` returned `200`;
- `/data/wow/quest/index` returned `404 BLZWEBAPI00000404`;
- `/data/wow/quest/581` returned the same `404`.

This is an unsupported Quest resource, not evidence that quest 581 alone is absent. Blizzard's Quest
Game Data endpoints were originally released for retail with an explicit note that they were not
available for Classic. Therefore the Blizzard-first batch is not currently usable for Classic Era
quest XP. Keep the adapter for future API support, but do not generate the Wowhead fallback from a
Classic Era Blizzard sweep.

The batch command now checks `/data/wow/quest/index` before requesting any quest. A failed capability
check stops the run immediately and creates no fallback queue.

## `import-quest-xp`

Imports per-quest reward XP, level and minimum level from an authoritative export instead of the web.
The importer is source-agnostic and records where each value came from.

Accepted sources, in order of preference:

1. **Blizzard Game Data Quest API.** Documented and authorized, with Battle.net client credentials.
   Export the same fields to CSV/JSON and record the endpoint and edition namespace in `sourceRef`.
   Whether the Forever namespace serves quests must be verified first.
2. **An approved export from the publisher.** For WoW: Forever this is the only source that carries
   the real per-quest reward binding if the API does not.
3. **A world-database export** where the deployment actually has one (`quest_template.RewardXPId`
   joined to the `QuestXP` curve from `tools/extractor-dotnet/CascTableExtractor.cs`). This does not
   apply to Forever, which is an official Blizzard product with no operator-held world database.
4. **A client-derived export**, with the limitation below.

`--source-kind` records which of these produced the file: `blizzard-api`, `addon-database`,
`client-derived`, `server-database`, `operator-export` or `manual-capture`. The value is stored on
every record.

> **Known limitation for Forever.** The 1.60.1 client exposes quest identity, titles, `QuestInfoID`
> and `ContentTuningID`, but `QuestV2CliTask` has no quest level, minimum level or reward difficulty,
> and `QuestXP` is only the level/difficulty curve. A client-derived export must therefore state how
> `reward_xp_id` and `xp` were derived, and must be validated against values captured in-game.
> Imported values are labelled with `sourceKind` and `revision` for exactly this reason.

### Accepted input

CSV with a header row, or JSON (an array, or `{ "records": [ ... ] }`). Column names are matched
case-insensitively and ignore `_`/`-`, so `reward_xp_id`, `rewardXpId` and `RewardXPID` are equivalent.

| Field          | Aliases                                        | Meaning                                                                       |
| -------------- | ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `id`           | `quest_id`                                     | Quest identity                                                                |
| `level`        | `quest_level`                                  | Quest level                                                                   |
| `min_level`    | `minimum_level`, `req_level`, `required_level` | Minimum player level                                                          |
| `reward_xp_id` | `xp_id`                                        | Reward binding id (world-DB `RewardXPId`; a derived value for client exports) |
| `xp`           | `full_xp`, `reward_xp`                         | Joined reward XP for the quest level                                          |
| `xp_by_level`  | JSON only                                      | Optional curve, `[{ "level": 32, "xp": 2450 }]`                               |

Interpretation rules:

- `min_level = 0` means "no requirement" and is stored as `null`, not as a value.
- `reward_xp_id = 0` means the reward is formula-derived; the record is retained with
  `formula_derived_reward` and is not presented as a bound value.
- A row with no `xp` and no curve is `unknown`, never zero.
- Ids outside a supplied `--queue` are retained with `unexpected_id`, not dropped.
- Duplicate ids, malformed integers and inconsistent row widths abort the whole import.

### Provenance

Imported evidence uses its own schema, `quest-xp-import-set.v1` / `quest-xp-import.v1`. It never claims
to be a Wowhead capture and is stored separately from `quest-xp-evidence.v1` records, so a crawl and an
export cannot be confused downstream. Every record carries `sourceKind`, `sourceRef`, `revision`,
`importedAt` and the SHA-256 of the exact input file.

When `--staging` points at the live staging directory, imported values are compared with any staged
Wowhead record. A disagreement sets `status: "conflict"` and adds `wowhead_conflict:<key>`, mirroring the
existing publication convention. Nothing is overwritten; the conflict report is printed to stdout.

### Usage

```sh
node dist/cli.js import-quest-xp \
  --input quest-rewards-export.csv \
  --format csv \
  --game forever \
  --source-ref 'Approved publisher export, ticket 2026-10-17' \
  --source-kind operator-export \
  --revision 'forever-1.60.1.69876' \
  --queue archive-queue.json \
  --staging /home/wow-trader-reference-worker/shared/staging \
  --output /home/wow-trader-reference-worker/shared/imports/quest-xp-20261017.json
```

`--queue` and `--staging` are optional; both are recommended so unexpected ids and disagreements are
visible before the import is used.

## Saved-page import (manual capture)

This is the offline path for isolated pages opened normally in an authorized browser. It reads only
the HTML file you saved; it does not automate, reuse or replay the browser session, and it makes no
network requests.

1. Open the page in Brave.
2. Use **File → Save Page As** and choose **Webpage, HTML Only** or **Webpage, Complete**. Save the
   rendered entity page, not a challenge, login or error page.
3. Put the `.html`/`.htm` files in a directory outside Git. Chrome's `_files` sidecar directories are
   ignored.
4. Import the directory:

```sh
pnpm --filter @wow-trader/reference-data dev import-saved-html \
  --input /absolute/path/to/saved-pages \
  --staging /absolute/path/to/wowhead-staging \
  --permission-ref manual-capture-2026-10-17 \
  --captured-at 2026-10-17T14:30:00Z \
  --output /absolute/path/to/manual-capture-report.json
```

The canonical URL in the page determines `game`, `kind` and `id`; the filename is irrelevant. Each
record keeps the page SHA-256, canonical URL, capture time and permission reference. Quests also get
a typed XP record when the saved page contains the normal Wowhead XP payload.

- A file without a canonical Wowhead entity URL is rejected and does not write anything.
- An existing staged record with a different page hash is reported as a conflict and is not
  overwritten. Re-run with `--force` only after reviewing the conflict.
- `--captured-at` is optional; when omitted, the file modification time is recorded.
- The result JSON lists `imported`, `skipped`, `conflicts` and `rejected` entries.
- MHTML (`.mhtml`) captures are not supported; save HTML.

This is suitable for a small number of reviewed gaps, not a scalable replacement for approved source
access or an authoritative export.

## `probe`

Issues exactly one request with the unchanged declared crawler identity and the durable pacing gate, then
records the response as evidence. It exists to answer one question: is the denial broad, or specific to
one entity?

It shares `.request-pacing.json` with the crawler, so an active cooldown stops the probe before any
request is sent. It does not retry, rotate identity or follow redirects. It only accepts `robots.txt` or
an exact `/{game}/{kind}={id}` entity URL, with or without a slug.

Captured fields: status, `ok`, redirect target, duration, body size and SHA-256, page title, challenge
markers, and the response headers minus `set-cookie`. Cookies are excluded deliberately: the probe
documents the transport, not a session.

### Usage

```sh
node dist/cli.js probe \
  --url 'https://www.wowhead.com/forever/quest=581/hunt-for-yenniku' \
  --staging /home/wow-trader-reference-worker/shared/staging \
  --output /home/wow-trader-reference-worker/shared/evidence/probe-20261017T062129Z.json
```

Exit `0` records a response of any status. Exit `2` means a durable cooldown is active and no request was
sent; the JSON line contains `state: "waiting"` and `retryAt`.

### Reading the result

Run the probe against a record that succeeded before the incident, after the cooldown expires:

| Observation                                    | Conclusion                                                 | Action                                                                      |
| ---------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| The previously successful URL also returns 403 | Denial is broad and attached to the client, not the entity | Stop the archive phase; use the import or request approved access           |
| Only the failing entity returns 403            | Denial is entity-specific                                  | Record the gap with the evidence file, then continue once from the next key |
| Any later key returns 403                      | Broad denial arrived late                                  | Stop immediately; do not sweep                                              |

Do not repeat the probe while a cooldown is active, and do not run it to search for a header combination
that is accepted.

## Boundaries

Neither tool changes the request identity, stores cookies, impersonates a browser, rotates source
addresses or resumes a denied sweep. The importer replaces the _source_ of the data, which changes what
the project knows rather than what it pretends to be.
