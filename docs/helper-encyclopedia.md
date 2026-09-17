# KFC Helper and Encyclopedia

## Product boundary

Deploy this application at `helper.kfcguild.online`. The main guild website remains responsible for
guild identity, recruitment, raids, news, and guides; it needs only a `Helper` link to the subdomain.
The helper deployment owns build-versioned game data, catalog search, Auction House scans, and
calculations. Keeping those concerns on a subdomain avoids coupling the data pipeline or its release
cadence to the guild website.

The helper uses the parent site's exact KFC mark, Cinzel/Inter/JetBrains Mono font stack, dark/amber
tokens, fixed navigation proportions, square controls, and card ornament language. It links back to
`https://kfcguild.online` in global navigation and the footer. In-game item tooltips deliberately keep
their familiar WoW presentation within that shared shell. No login or cross-subdomain cookie is
required for the current public tools.

## Route contract

```text
/
├── /tbc
│   ├── /tbc/trader
│   └── /tbc/encyclopedia
│       ├── /tbc/encyclopedia/items/:itemId
│       ├── /tbc/encyclopedia/recipes/:spellId
│       └── /tbc/encyclopedia/professions/:slug
└── /forever
    ├── Trader              (disabled until catalog + AH scan exist)
    └── Encyclopedia        (disabled until an audited catalog exists)
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
6. Add canonical metadata, sitemap entries, and structured data once the public hostname and stable
   route policy are confirmed.

## Forever activation

Forever cards remain visibly unavailable rather than serving TBC data under a Forever label. At
release, run the existing extraction/audit/publish checklist, bind the confirmed client product key
to the Forever route, extract its icons, and enable Encyclopedia only after the published-build
queries and golden relationships pass. Trader additionally requires a compatible collector payload
and at least one accepted market scan for the same client product and build.

## Deployment handoff

1. Deploy this Next.js application with its current PostgreSQL, icon-media, and ingestion settings.
2. Point `helper.kfcguild.online` to that deployment using the hosting provider's required DNS record.
3. Add a `Helper` navigation link on `kfcguild.online` targeting the HTTPS subdomain.
4. Verify TLS, the reciprocal KFC Guild link, `/`, `/tbc`, `/tbc/trader`, `/tbc/encyclopedia`, and
   namespaced detail routes before exposing the link publicly.
