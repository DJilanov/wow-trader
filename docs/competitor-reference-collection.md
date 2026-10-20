# Competitor reference collection

Last validated: 2026-10-18.

## Purpose

The Forever beta client is not a practical way to rediscover every trainer, vendor, quest, and
drop source. It remains authoritative for the exact `70450` recipe catalog, while public competitor
pages can supply review evidence for acquisition facts that the client does not contain. A small
in-game sample then validates representative source types and resolves conflicts; it is not an
exhaustive recording job.

Competitor evidence is deliberately isolated from exact client facts, community snapshots, the
permissioned Wowhead crawler, and public production data. A collected competitor record is a claim
with source URL, capture time, response checksum, parser version, and `review_required` rights state.
There is no automatic publication or database-import path.

## Source survey

| Public source       | Public surface                                          | Current value                                                                                               | Use in this project                                                  |
| ------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| StillSixty          | Recipe sitemap plus one server-rendered page per recipe | 1,769 sitemap recipes; 1,768 intersect the 2,228 unresolved build-70450 recipes                             | Primary staged acquisition reference                                 |
| ForeverDB           | 12 server-rendered Forever profession pages             | Aggregate source category, teaching item, trainer NPC IDs, and vendor NPC IDs; its public API is disallowed | Next corroboration adapter, especially for the 460 StillSixty misses |
| WoW Forever Recipes | Public database sitemap and recipe pages                | 38 unique English recipe detail pages in the current sitemap                                                | Low-volume corroboration only                                        |

The measured StillSixty intersection is 79.35%. Its additional sitemap recipe is retained only in
the coverage count because it is absent from the exact-build queue. The 460 unmatched exact-build
recipes remain unresolved rather than being guessed.

StillSixty discloses CMaNGOS Classic database data, Forever changes, and client data as its inputs.
This provenance is recorded in the plan, but the site does not expose a blanket data license for
all assembled Forever facts. Public crawl permission and reuse/publication permission are separate:
bulk results stay staged until a source partnership or rights review approves the intended use.

## Implemented StillSixty workflow

Generate a deterministic plan from the exact-build unresolved queue. This fetches only
`robots.txt` and the advertised recipe sitemap:

```bash
pnpm --filter @wow-trader/reference-data competitors stillsixty-plan \
  --queue artifacts/reference/recipes/forever-70450-acquisition.json \
  --output artifacts/reference/competitors/stillsixty-70450-plan.json
```

Run a small review sample first:

```bash
pnpm --filter @wow-trader/reference-data competitors stillsixty-crawl \
  --plan artifacts/reference/competitors/stillsixty-70450-plan.json \
  --staging artifacts/reference/competitors/stillsixty-staging \
  --status artifacts/reference/competitors/stillsixty-status.json \
  --limit 10 \
  --requests-per-hour 48
```

After the sample and reuse rights are reviewed, resume the same status with `--all` instead of
`--limit`. Already completed recipe IDs are skipped. At 48 requests per hour the full current plan
takes about 36 hours; the maximum accepted rate is 60 requests per hour.

The collector has these fixed controls:

- an honest, product-specific user agent and only canonical HTTPS URLs from the public sitemap;
- a fresh `robots.txt` check before sitemap planning and every crawl run;
- no calls to `/api/`, search, authentication, editor, or undocumented endpoints;
- one sequential entity request at a time with a deterministic minimum interval;
- a 2 MB response ceiling, 30-second timeout, canonical identity check, and schema validation;
- normalized facts only in staging; raw HTML is not retained;
- immediate stop on redirects, parser drift, network errors, 403, or other HTTP errors;
- a persisted cooldown of at least five minutes on 429, honoring a longer `Retry-After` value;
- atomic status and evidence files so an interrupted run resumes without replaying completed IDs.

The current real smoke run successfully staged recipe spell `2149` as a trainer-acquired recipe and
wrote a resumable status with no failures. That validates access and parsing, not the content rights
or correctness of all 1,768 pages.

## Merge and confidence rules

1. Exact build `70450` client values always win for spell ID, recipe name, profession, skill ranks,
   reagents, outputs, quantities, cast time, and cooldown.
2. A competitor record may add only acquisition claims: trainer, vendor, quest, drop, teaching item,
   or reputation.
3. A source-build mismatch or unknown source build is corroboration, never silently relabeled as
   exact-build evidence.
4. Agreement between independent public sources raises review confidence. Disagreement creates a
   conflict record; majority voting does not overwrite exact or observed evidence.
5. Live-game observations can confirm what was visible on the running build. Absence from one trainer,
   merchant, or loot session is not proof that a source does not exist.
6. Only a separately reviewed import/publish operation may move approved facts out of competitor
   staging. This collector intentionally provides neither operation.

## Next adapters

ForeverDB is the best next coverage source because its 12 profession pages contain a bounded recipe
payload in their ordinary HTML. Its adapter should fetch only profession URLs advertised in the
public sitemap, decode the inert server payload without executing scripts, and validate a narrow
schema containing `spellId`, `source`, `sourceItemId`, `trainerNpcIds`, and `vendorNpcIds`. Its
`robots.txt` disallows `/api/`, so the adapter must not call that path even if the browser application
does internally.

After that adapter produces a coverage report, request individual WoW Forever Recipes pages only for
IDs still unresolved and present in its public sitemap. Do not use one competitor to clone unrelated
descriptions, comments, media, guides, or market data; the scope is the minimum factual acquisition
graph needed by the trader.

The preferred long-term path is a direct data-sharing agreement with source attribution. It is
faster, less fragile than HTML parsing, and resolves the commercial-reuse question explicitly.
