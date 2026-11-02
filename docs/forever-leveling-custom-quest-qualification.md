# Published custom-quest reward qualification

On November 1, 2026, normal browser reads recovered the seven custom-quest rewards that were missing from the funding candidate review. These are public reference values, not observed current-build payouts or proof that a character can accept the quests.

| Quest                                                                                                | Full published XP | Qualification against the pinned catalog                          |
| ---------------------------------------------------------------------------------------------------- | ----------------: | ----------------------------------------------------------------- |
| [91723 · Delicate Instruments](https://www.wowhead.com/forever/quest=91723/delicate-instruments)     |               530 | Held: race restrictions, quest level and pickup minimum disagree  |
| [91724 · Delicate Instruments](https://www.wowhead.com/forever/quest=91724/delicate-instruments)     |               840 | Held: race restrictions and pickup minimum disagree               |
| [98013 · Swelling Forces](https://www.wowhead.com/forever/quest=98013/swelling-forces)               |             1,550 | Held: race restrictions disagree                                  |
| [98291 · Death to the Dragonmaw](https://www.wowhead.com/forever/quest=98291/death-to-the-dragonmaw) |             3,050 | Compatible published reward; other route requirements still apply |
| [98386 · Alther's Mill](https://www.wowhead.com/forever/quest=98386/althers-mill)                    |             1,650 | Held: race restrictions disagree                                  |
| [98418 · Shared Fury](https://www.wowhead.com/forever/quest=98418/shared-fury)                       |             2,450 | Compatible published reward; other route requirements still apply |
| [99160 · Rime's Wrath](https://www.wowhead.com/forever/quest=99160/rimes-wrath)                      |               700 | Held: race restrictions disagree                                  |

## Identity and eligibility

The two Delicate Instruments pages have the same title but different IDs and rewards. The “See also” row on 91723 links to 91724; its 840 XP cannot replace 91723's 530 XP. The current page gives 91723 quest level 8 and pickup minimum 6, compared with 10 and 7 in the pinned catalog. Quest 91724 has pickup minimum 6, compared with 7 in the catalog.

Five pages publish race mask `4294967372`, excluding Human, whereas the catalog uses `4294967373`, including Human. The capture is retained as a conflict rather than choosing whichever source would fund the route. The two compatible pages publish no extra race mask and remain Alliance-only through their separate side field; their levels and class restrictions match the catalog.

The replacement reward snapshot retains all 1,621 existing facts unchanged and appends seven facts. Five have `status: "conflict"`; the resolver returns no numeric reward for them below the level cap. Two have `status: "available"`. The catalog, combat records, loot rules, prior rewards and observations remain unchanged. This conservative hold also excludes the conflicting candidates from funding non-Human editions until their source eligibility is reconciled.

## Source and renderer checks

Only the canonical URL, title, three relevant public metadata statements, renderer URLs and rendered Gains text were exported from each page. The immutable source bundle contains these excerpts with capture times. It contains no browser identity, cookies, recordings, page comments or original full HTML. Normalized records use `sourceKind: "manual-capture"`; they do not claim to be original crawler captures.

The current page uses `quest.js?5f36c4ad` with `global-core.js?c9c7803e`. The quest renderer's SHA-256 is `5f36c4ad6b8159cef34450542f3264c877c07f2c1c2079815ade2fd712101bdf`; the new core's SHA-256 is `c9c7803e543749cb70a3798e3d945b61c336d2d99bc8e82543349678c2a3ba01`. Its quest-XP rounding helper is byte-identical to the previously verified `154e707b` core helper, SHA-256 `69c5fa24cce8b0cee8f0405ff71ba1c0d239ff74647947f386a22dd394cc94bf`.

An isolated execution of the pinned reward renderer agrees with all **293** parsed level-specific rewards across these seven pages. Rendered default Gains also agree with each primary reward and scaling table. This checks reference arithmetic, not server behavior. The production parser accepts only the exact verified script URLs and still holds unknown revisions or lookalike URLs. Parser v5 retains support for existing v1–v4 evidence.

## Prepared files and activation

`artifacts/leveling/authorized-custom-quest-references/review.json` identifies the immutable DOM-excerpt bundle, normalized import, 1,628-fact snapshot, original snapshot hash, catalog hash, renderer hashes and per-quest conflict fields. The input used for local route checks is `.cache/leveling-no-grind-20261031/guide-required-reward-facts-qualified-custom.json`.

These are separate prepared files. Do not configure the manual-capture import as `WOW_TRADER_LEVELING_QUEST_XP_IMPORT`: that existing runtime entry point treats imports as historical fallback evidence and does not carry these published eligibility holds into the primary evidence store. A matching publication path and the normal release checks are required before activation. No live pointer, crawler or installed addon changed.

The [current no-grinding audit](forever-leveling-no-grind-audit-2026-10-31.md) records the matrix result and remaining release gates. Finding a missing reward does not itself fund a route or establish its travel and quest flow.
