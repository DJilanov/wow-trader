# KFC Helper and Encyclopedia

## Product boundary

Publish this application under `https://kfcguild.online/tools`. The main guild application remains
responsible for guild identity, recruitment, raids, news, and guides; Nginx delegates only `/tools`
and `/tools/*` to the independently deployed Helper process. The Helper owns build-versioned game
data, catalog search, Auction House scans, and calculations without coupling its build or runtime to
the guild application.

`https://helper.kfcguild.online` is now a compatibility and ingestion host. Its authenticated `/v1/`
routes continue to reach the isolated ingestion process, while every public page receives a
one-to-one permanent redirect to the equivalent `/tools` URL. Do not redirect `/v1/` to the public
application path.

The helper uses the parent site's exact KFC mark, Cinzel/Inter/JetBrains Mono font stack, dark/amber
tokens, fixed navigation proportions, square controls, and card ornament language. It links back to
`https://kfcguild.online` in global navigation and the footer. In-game item tooltips deliberately keep
their familiar WoW presentation within that shared shell. No login or cross-host cookie is required
for the current public tools.

## Route contract

```text
/tools
├── /tools/tbc
│   ├── /tools/tbc/trader
│   └── /tools/tbc/encyclopedia
│       ├── /tools/tbc/encyclopedia/items/:itemId
│       ├── /tools/tbc/encyclopedia/recipes/:spellId
│       └── /tools/tbc/encyclopedia/professions/:slug
└── /tools/forever
    ├── /tools/forever/trader
    ├── /tools/forever/leveling
    ├── /tools/forever/simulator
    └── /tools/forever/encyclopedia
        ├── /tools/forever/encyclopedia/npcs[/page/:pageNumber]
        ├── /tools/forever/encyclopedia/npcs/:npcId
        ├── /tools/forever/encyclopedia/objects[/page/:pageNumber]
        ├── /tools/forever/encyclopedia/objects/:objectId
        └── /tools/forever/encyclopedia/changes/:fromBuild-to-:toBuild
```

The first choice is the game data universe. The second is the user job: make economic decisions in
Trader, or inspect build facts in Encyclopedia. Game-version routes must remain explicit because
item IDs, spell IDs, professions, rules, and market observations can overlap across products.

Legacy unscoped item, recipe, profession, and opportunity routes remain compatible for now, but all
new TBC links use the namespaced route contract.

## Encyclopedia v1

The first usable archive is server-rendered directly from the published TBC catalog and provides:

- one search box for item names/IDs, recipe spell names/IDs, and profession names/skill-line IDs;
- All, Items, Recipes, and Professions scopes;
- exact positive-ID lookup even for a one-digit ID, with a two-character minimum for name searches;
- item icons, quality borders, item level, required level, item class, and canonical item ID;
- recipe profession, required skill, cooldown indication, spell ID, and detail navigation;
- a complete profession directory with build-specific recipe counts;
- existing detail evidence for inputs, outputs, teaching items, cooldowns, extraction state, vendor
  values, AH observations, and client/source limitations;
- recipe details split the exact final formula from a recursive material-provenance chain, scale
  intermediate quantities to one final craft, show alternative producers with explicit `OR`
  branches, and stop cycles and overly deep paths;
- deterministic consumable item conversions, such as ten Motes becoming one Primal, are extracted
  separately from profession recipes and can participate in the chain;
- daily/shared cooldown and variable-output methods remain visible as collapsed client evidence but
  are explicitly excluded from profit and guaranteed-material calculations;
- collision-aware desktop item previews, viewport-bounded mobile previews, and a detail-page `Loot
info` placeholder that keeps source and drop probability unknown until the next phase;
- a hard result cap of 40 records per type to keep broad queries bounded.

All TBC catalog and scan lookups are explicitly restricted to the `wow_anniversary` client product.
A later Forever import therefore cannot silently become the build shown by a TBC URL.

## Evidence rules

The Encyclopedia is a build archive, not a claim that every shipped entity is currently obtainable.
Client extraction can prove that an item, recipe, relationship, or cooldown is shipped in a specific
build. It cannot independently prove server-side drop source, drop probability, phase activation, or
realm availability. Those claims need separately versioned observations or authoritative evidence.

Every future entity should retain:

- client product, build number, locale, hotfix state, and extraction provenance;
- stable entity ID plus build-specific fields;
- relationship evidence and extraction status;
- availability state distinct from client presence;
- observed/source claims with evidence and effective dates.

## Next Encyclopedia slices

1. Add cursor pagination and indexed PostgreSQL full-text/trigram search after measuring real queries;
   do not add a separate search service before the database becomes a demonstrated bottleneck.
2. Add filters for quality, item class/subclass, level, profession, skill, cooldown, output kind, and
   extraction/availability state.
3. Add remaining reverse relationship views: used by, teaches, and taught by. Produced-by and
   deterministic multi-step material chains are already available on recipe details.
4. Extend extraction only as needed for spells, quests, factions, zones, NPC references, and
   loot-table presence. Keep server-side source/drop-rate observations separate from client facts.
5. Add build comparison so maintainers can answer what was added, removed, or changed between TBC
   hotfixes and Forever releases.
6. Keep canonical metadata, sitemap entries, and structured data on the canonical `/tools` URLs;
   never emit the legacy Helper hostname as a canonical.

## Forever activation

Forever build 70450 is active with an audited published catalog, product-specific media, and an exact
accepted market scan. Every future build still passes the same extraction, audit, relationship,
media, and publication gates before its Encyclopedia becomes current. Trader rankings additionally
require a compatible accepted scan for that exact client product and build; an unmatched scan remains
visible as market evidence but fails closed for catalog-backed rankings.

## Deployment handoff

1. Deploy this Next.js application with `basePath: "/tools"` and its current PostgreSQL and media
   settings; keep ingestion on its independently pinned process.
2. Proxy apex `/tools` and `/tools/*` to the Helper web process without changing other guild routes.
3. Preserve legacy-host `/v1/` ingestion and redirect legacy public pages one-to-one to `/tools`.
4. Publish the Helper sitemap and catalog shards from the apex `robots.txt` response.
5. Verify TLS, guild routes, `/tools`, both game choosers, both Traders, both Encyclopedias, detail
   routes, static assets, canonical URLs, redirects, and an unauthenticated ingestion rejection.

The exact cutover, verification, and rollback procedure is recorded in
[`kfc-tools-site-migration-2026-10-18.md`](kfc-tools-site-migration-2026-10-18.md).
