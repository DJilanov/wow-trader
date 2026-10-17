# Wowhead browser-versus-crawler access issue

## Summary

The Forever quest page for quest 581 opens in an ordinary interactive browser, but the same public
URL returns HTTP 403 when requested by the transparent reference crawler. Testing from two unrelated
public IP addresses produced the same denial, so the evidence does not support a production-server
IP block.

This document records the observed behavior for source-owner support, an authorized infrastructure
review, or selection of a different evidence source. It is not a guide for impersonating a browser
or bypassing source access controls.

## Affected URLs

- `https://www.wowhead.com/forever/quest=581`
- `https://www.wowhead.com/forever/quest=581/hunt-for-yenniku`

Both forms are valid same-entity paths in the crawler. The slugged form does not change the crawler
result.

`forever` is Wowhead's edition slug for **WoW: Forever**, an official Blizzard product (Patch 1.60.1,
client product `wow_classic_beta`), not a private server. This matters for the resolution paths below:
there is no server operator to ask for a world-database export.

## Observed results

Crawler identity:

```text
User-Agent: KFC-Helper-Reference/1.0 (+https://kfcguild.online/about)
Accept: text/html,application/xml
Redirect policy: manual
```

Production request:

```text
Public source IP: 89.167.46.193
Host: debian-8gb-hel1-2
Result: HTTP 403
Response provider: AWS CloudFront
Redirect: none
Content-Type: text/html
Response size: 919 bytes
```

Independent request from the development Mac:

```text
Public source IP: 212.72.198.92
Result: HTTP 403
Response provider: AWS CloudFront
CloudFront endpoint observed: 18.165.72.46
Redirect: none
Content-Type: text/html
Response size: 919 bytes
```

The ordinary browser can display the slugged URL from `212.72.198.92`. Therefore, the differentiator
is somewhere in the request/client context rather than simply the public source IP. Possible factors
include the declared user-agent, browser client hints, cookies, JavaScript state or transport
fingerprint. The current evidence does not prove which factor CloudFront or the origin evaluates.
The response came from CloudFront, not Cloudflare.

## Transparent reproduction

This reproduces the crawler request without following redirects, adding cookies or pretending to be
a browser:

```sh
curl --silent --show-error --max-time 20 \
  --user-agent 'KFC-Helper-Reference/1.0 (+https://kfcguild.online/about)' \
  --header 'Accept: text/html,application/xml' \
  --output /dev/null \
  --write-out 'http_code=%{http_code}\nremote_ip=%{remote_ip}\nredirect_url=%{redirect_url}\ncontent_type=%{content_type}\nsize_download=%{size_download}\ntime_total=%{time_total}\n' \
  'https://www.wowhead.com/forever/quest=581/hunt-for-yenniku'
```

Do not repeatedly run this command while the managed worker has an active source cooldown.

## Current application behavior

The production crawler does not skip quest 581 or alter its identity after denial. Release
`crawl-20261017-r10-source-wait` records a durable six-hour cooldown and retries the exact checkpoint.
At the time of diagnosis:

```text
Archive cursor: 478 / 2535
Current key: forever-quest-581
Last completed key: forever-quest-580
State: waiting
Retry at: 2026-10-17T12:21:29.888Z
```

The publisher remains independent and online. See
[the deployment and recovery receipt](reference-crawler-source-recovery-2026-10-17.md) for the
implementation, verification and rollback boundary.

## Diagnosis update, 2026-10-17

Two follow-up findings changed the plan. Both are recorded here because they determine which
resolution paths are still open.

### 1. There is no operator-held world database to request

Earlier drafts treated Forever as a private server whose operator could supply `quest_template`
data. It is an official Blizzard beta, so no operator-held world database exists and "request an
operator export" is not an available path.

The publisher is still a candidate source. Blizzard documents a Game Data Quest API
(`/data/wow/quest/index`, `/data/wow/quest/{id}`) that returns quest requirements, including
minimum level, plus objectives and reward objects, under Battle.net OAuth client credentials. Quest
endpoints were historically not served for the Classic namespaces (`static-classic`,
`static-classic1x`), returning 403 or 404, so whether the Forever edition is exposed must be tested
before relying on it. That test is cheap, authorized and documented, and it is the first thing to
try.

### 2. The client supplies the curve but not the per-quest binding

The project's own extractor already reads the Forever client
(`tools/extractor-dotnet/WorldSnapshotCommand.cs:51-58`): `QuestV2`, `QuestV2CliTask`, `QuestInfo`,
`QuestObjective`, `QuestPackageItem`, `QuestMoneyReward`, `QuestXP`, `QuestFactionReward`,
`QuestSort`, `QuestLine`, `QuestLineXQuest`, `QuestPOI*` and `ContentTuning`.

Checked against the 1.60.1 DB2 definitions (WoWDBDefs layouts for builds `1.60.1.69876` through
`1.60.1.70450`):

- `QuestV2CliTask` carries `QuestInfoID`, `ContentTuningID`, titles, filters and flags, but **no
  quest level, no minimum level and no reward-XP difficulty**.
- `QuestXP` is only `ID` plus ten `Difficulty` values: level/difficulty curves without a per-quest
  binding.

So the binding that Wowhead displays is server-side. Wowhead obtains it through datamining and
beta-capture pipelines, not from a public client table. The client can therefore bound the problem
but cannot close it.

One defect was found while checking this. `WorldNormalizer.cs:161-162` reads `FiltMinLevel` and
`FiltMaxLevel`, which are absent from the 1.60.1 layout and were dropped in modern builds. The reads
yield `0`, so `WorldQuest.MinimumLevel` is silently always `0` for Forever. This is independent of
the access issue and should be fixed or explicitly recorded as a limitation.

### Scope correction

The beta is capped at level 30 at the time of writing. The archive queue of 2,535 quests includes
large amounts of unreleased content. Most of the remaining 2,057 records are outside the live game
and cannot be verified in-game even if the source becomes reachable. The archive phase should be
re-scoped to live content before any further access work.

## Tooling added, 2026-10-17

Implemented in `packages/reference-data`. Both tools keep the declared crawler identity; neither
changes headers, user agent, cookies, TLS profile or source address.

- `import-quest-xp` — imports quest level, minimum level and reward binding from an export, in its
  own `quest-xp-import-set.v1` evidence type. It never claims to be a Wowhead capture, retains the
  input SHA-256 and source reference, flags `reward_xp_id = 0` and unknown ids instead of dropping
  them, and reports disagreements with staged Wowhead records as conflicts rather than overwriting
  them.
- `probe` — issues exactly one request under the same identity and the same durable pacing gate,
  then records status, redirect, duration, body size and hash, page title, challenge markers and
  response headers (excluding `set-cookie`). It refuses to run during an active cooldown. Its only
  purpose is to distinguish a broad denial from an entity-specific one.

Usage, provenance rules and the probe decision table are documented in
[the import and probe guide](quest-xp-import-and-probe.md).

Verification at the time of writing: TypeScript typecheck passed, ESLint passed, 88/88 package tests
passed (9 new), and the production build succeeded. The probe was exercised against an active
cooldown and sent no request, confirming it cannot be used to step around the pacing gate.

### What the probe does not prove

A 403 from any single probe is a data point, not a verdict. Repeating the six-hour retry, or varying
one header per attempt, does not distinguish the two cases, and the second is the excluded
"header-combination search". The broad-versus-specific question is answered by comparing one
previously successful entity against one denied entity, once, under the unchanged identity.

## Recommended resolution paths

### 1. Query the Blizzard Game Data Quest API

This is the preferred authorized API path, so try it first. It is authoritative for the Blizzard
edition exposed by the selected namespace, not automatically for a different Forever build. Retain
the namespace and raw response so edition mismatches remain visible.

**Validation result, 2026-10-17:** Classic Era EU uses `static-classic1x-eu`, and a known Classic
Game Data endpoint returned `200`, but both the Quest index and quest 581 returned
`404 BLZWEBAPI00000404`. The Quest API is not exposed for Classic Era, so this path cannot currently
supply the archive's quest XP. The collector preflights the Quest index and stops without producing a
fallback queue when the resource is unavailable.

1. Create a Battle.net developer client and request an OAuth token with `client_credentials`.
2. Request `/data/wow/quest/581` with the static namespace for the Forever edition. The edition's
   namespace string is not assumed here: read it from the namespace guide or from any endpoint that
   links the current static namespace, then substitute it.
3. If the response is `200`, record whether it carries quest level, minimum level and an experience
   reward. Coverage and fields differ per edition, so capture one known quest end to end rather than
   sampling by field name.

If the Forever namespace answers with the required fields, use it as the primary quest source and
send only confirmed missing quests or missing XP bindings to the Wowhead fallback. If authorization
fails, stop rather than treating the entire queue as absent. Record the response with the build or
edition in the filename and do not retry it in a loop.

### 2. Ask the source owner for approved access

Provide Wowhead support with:

- the two affected URLs;
- the declared crawler identity and contact URL;
- production source IP `89.167.46.193`;
- the one-worker, one-request-per-minute pacing policy;
- the UTC failure timestamp and 403/CloudFront response details;
- the edition: WoW: Forever, Patch 1.60.1, edition slug `forever`;
- the requested scope: quest level, minimum level and reward XP for live, bounded content only, not
  the full 2,535-key list.

Narrowing the requested scope to content that is actually live is both a better ask and a smaller
compliance surface. It also means a single approved batch would be enough, rather than a long-running
archive phase.

Ask for an API, data export, IP/user-agent allowlisting, or an explicitly approved request profile.
Record the written authorization and its rate/scope limits before changing production behavior.

### 3. Derive what the client can supply, and bound the rest

This replaces the earlier private-server export path, which does not exist for an official edition.

The Forever client can supply quest identity, title, `QuestInfoID`, `ContentTuningID`, objectives,
rewards and the `QuestXP` curve. Quest level can be derived from the `ContentTuning` row the quest
points at. The per-quest `RewardXPDifficulty` binding is server-side and is not in any public client
table, so a purely client-derived value is an approximation and must be labelled as one.

Recommended use:

1. extract the quest and `ContentTuning` tables from the client install that is already in use;
2. derive quest level and the XP curve, and record the build, definitions revision and the exact
   derivation rule;
3. capture a validating sample of real reward values from the live game, at minimum the quests the
   leveling route actually uses;
4. report the derivation error against that sample, and publish only values that fall inside the
   accepted tolerance.

This is slower than an export and covers less, but it is authoritative about its inputs and
reproducible from a build identifier. The import format already accepts the result.

### 4. Import a page saved manually by an authorized user

For isolated records, open the accessible page normally and use the browser's **Save Page As**
feature to save HTML. An offline importer can validate the canonical quest identity and parse the
saved document without automating the browser session. Preserve the capture time, original URL and
permission/provenance reference alongside the derived record.

This is suitable for a small number of urgent gaps, not a scalable replacement for approved source
access or an authoritative export.
