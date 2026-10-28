# Dungeon quest XP audit — October 28, 2026

Status: committed as `0760377`, deployed and publicly verified. See the
[deployment receipt](forever-leveling-dungeon-xp-deployment-2026-10-28.md). This supersedes the earlier
planning-level defaults and the rule that replaced every later dungeon's page coefficient.
It does not turn estimates into measured Forever rewards.

## Corrections

Unidentified four-quest bundles now use the dungeon's maximum announced level, as originally
requested, rather than the guide's earlier entry level. Entry scheduling is unchanged. The
[announced ranges](https://www.wowhead.com/forever/blue-tracker/news/us/explore-the-new-dungeons-of-world-of-warcraft-forever-world-of-warcraft-blizzard-24301455)
are Drowned City 35–40, Krol'dok 40–45 and Alcaz 48–53.

| Dungeon             | Previous quest level | New quest level | Estimated XP per quest | Four quests per player |
| ------------------- | -------------------: | --------------: | ---------------------: | ---------------------: |
| Drowned City        |                   37 |              40 |                 11,150 |                 44,600 |
| Krol'dok Stronghold |                   42 |              45 |                 13,900 |                 55,600 |
| Alcaz Prison        |                   50 |              53 |                 18,750 |                 75,000 |

Alcaz's old 16,850 was rounded `7,100 × 2.375`, using level 50. The new estimate is rounded
`7,900 × 2.375`, using level 53. Both use Dalaran's difficulty-7 reward tier. The three dungeons'
actual quest IDs and reward tiers remain unidentified, so neither figure is a verified Alcaz reward.
All four faction slots remain selected; explicit saved levels and selections remain unchanged.
Players with a saved level-50 Alcaz override can change **Planning quest level** to 53.

Scaled page rewards now retain their captured coefficients at every dungeon level. A dungeon
being unplayed is no longer sufficient to replace an available page coefficient with 2.375.
At their configured stop levels this corrects:

| Quest                          | Previously calculated | Captured page reward retained |
| ------------------------------ | --------------------: | ----------------------------: |
| Mythology of the Titans (1050) |                 8,450 |      8,900 — base 3,550 × 2.5 |
| Agmond's Fate (704)            |                 6,750 |     5,000 — base 2,850 × 1.75 |
| Solution to Doom (709)         |                 7,500 |     6,150 — base 3,150 × 1.95 |

Unscaled dungeon tables still use the explicitly estimated 2.375 coefficient. Exact captured
overlevel rows, in-game observations, zero rewards, pickup minima and the level-60 cap retain their
existing precedence. The bundle estimator now calls the same rounding/reduction helper as real
unscaled dungeon quests. Raw captures and imported evidence were not edited.

## Sunken Temple comparison

The 10,600 figure for **Into the Depths (3446)** belongs to the
[WotLK edition](https://www.wowhead.com/wotlk/quest=3446/into-the-depths).
The [Forever listing](https://www.wowhead.com/forever/quests/min-req-level:42/max-req-level:46/side:1?filter=2;1;0)
and our captured Forever record use a 4,900 base; the
[Classic page](https://www.wowhead.com/classic/it/quest=3446/into-the-depths) agrees.
Do not apply the Forever planning coefficient to a different expansion's increased reward.
Direct Forever quest-page requests were challenged during this audit; the available listing and
checksummed local captures were used instead. This is not a fresh crawl of every quest page.

At a level-51 hand-in, the six selected core quests currently estimate:

| Quest                                 | Captured raw base | Estimated reward |
| ------------------------------------- | ----------------: | ---------------: |
| Into the Temple of Atal'Hakkar (1475) |             7,100 |           16,850 |
| Jammal'an the Prophet (1446)          |             6,550 |           15,550 |
| The Essence of Eranikus (3373)        |             2,800 |            6,650 |
| Into the Depths (3446)                |             4,900 |           11,650 |
| Secret of the Circle (3447)           |             6,100 |           14,500 |
| The God Hakkar (3528)                 |             7,900 |           18,750 |

These are per-player quest hand-ins, excluding kills, group splitting, rested XP and extra XP buffs.
Different quests have different base rewards; they should not all receive a flat dungeon reward.

## Scope and evidence

The expanded auditor inventories all **244 known quest IDs across 32 catalog entries**, including
wings, both factions, class quests and deferred quests, rather than only the Alliance premade list.
It checks levels 1–60, eligibility, overlevel reductions, zero/capped rewards and retained page
values. It also audits all six faction bundles and each captured full reward's base/coefficient
arithmetic. The main route is additionally forecast sequentially in core/default/all-listed modes.

The final source set contains **127 published page records and 117 historical Questie estimates**.
These are not 244 in-game measurements. The two public source snapshots date from October 19/25;
the historical import is pinned to Questie 1.0.4 commit
`365537a340473291f5af3b7a53a5eca94e2a5f1a`. The report records input hashes and per-quest source dates.
No crawler was started and no live queue, publication index or source capture was changed.

The public production dungeon planner was also fetched directly. Its 299 runtime reward facts
were extracted from the Next data stream without executing embedded JavaScript, schema-validated,
and audited with the corrected local resolver. All 244 catalog IDs are present, with exactly the
same 127/117 evidence split, no arithmetic mismatches and the same ten historical disagreements.
This confirmed the local inventory against the live site's inputs before deployment; the corrected
resolver and bundle defaults are now live. Evidence is retained as `public-dungeon-page.html`,
`public-dungeon-reward-facts.json` and `dungeon-quest-xp-live-source-audit.json` in the audit directory.
The public HTML SHA-256 is
`e2a23de54760ef071e64fe6e900f09994d7401dbd6f0dad8186577f64cec039c`.

All 60 difficulty-7 values were compared with the original build-70205 extracted QuestXP table.
The decompressed 100-row SHA-256 remains
`eaa48b977422e1b6e5444793bc26e0dc2b1e1c61a0a47f2949023df7d5cfa209`.
This verifies extraction and arithmetic, not current server-side tuning for unidentified quests.

The JSON report is
`artifacts/leveling/audits/2026-10-28/dungeon-quest-xp-final-audit.json`.
Earlier audit outputs remain unchanged. Reproduce into a new output file:

```sh
pnpm --filter @wow-trader/leveling build
node scripts/audit-dungeon-table-xp.mjs \
  --reference artifacts/reference/questie/completion-20261019/published \
  --records artifacts/leveling/audits/2026-10-25/public-dungeon-quest-snapshot.json \
  --historical artifacts/reference/questie/quest-xp-import.json \
  --output /tmp/dungeon-quest-xp-audit.json
```

The command validates schemas, published checksums, edition identity and duplicate capture claims.
It refuses to overwrite an existing report and exits nonzero for arithmetic mismatches.

## Outstanding source review

Ten historical records disagree with another stored reference: **962, 1806, 5125, 5213, 5262,
5723, 6521, 6561, 6564 and 6922**. The report includes both values and provenance for each.
Some may reflect changed rewards or differently scaled references; these are not automatically
treated as two equivalent raw bases. They require current Forever evidence before calling their
XP verified. Aurius' Reckoning (5125), for example, has Questie 8,300 versus the older reference's
9,950. The audit with the historical fallback consequently differs from the earlier page-only
audit; that difference is not an additional XP fix made in this change.

The three unidentified bundles still require actual quest IDs and rewards. Do not infer their
values from the WotLK Sunken Temple reward, or describe the full guide as measured end to end.
The ten conflicting IDs are isolated in
`artifacts/leveling/audits/2026-10-28/dungeon-xp-source-review.queue.json` for a targeted future
capture run. This is a prepared local queue; no running crawler or existing queue was changed.

## Verification

- Complete leveling suite: **574 tests passed**.
- Focused web integration/presentation suite: **34 tests passed** across eight files.
- Audit regression tests: **4 passed**, including deliberately inconsistent captured XP.
- Leveling build/typecheck, full web TypeScript, scoped ESLint and formatting passed.
- All **14,640** per-level reward/gate/cap checks and **122** captured-base/coefficient checks passed.
- The subsequent deployment passed a Linux production build, 202 focused web tests, and 18 candidate
  plus 18 public browser checks; see the linked deployment receipt. An accidentally
  expanded web test invocation was stopped after unrelated simulator timeout/temporary-directory
  failures; it is not claimed as a passing full web suite. The focused leveling checks above passed.
