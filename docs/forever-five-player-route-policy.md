# Five-player route: shared objectives and a fresh flight network

Updated October 31, 2026. Website/API source deployed as `9de6157` at 16:22 UTC.
See the [deployment receipt](forever-leveling-deployment-2026-10-31.md) for checks, data boundaries
and rollback. The private addon preview remains separate.

## Route goal

Build a practical five-player Alliance route using the archived instructions, with shared kill
credit ahead of personal item quotas. A first visit to a useful flight master is an investment
in later dungeon travel. Avoid repeatedly crossing continents for isolated low-value quests,
but do not reject a productive new zone solely because the flight network starts empty.

This is a selection policy over the available source routes. It is not a measured global
shortest-time optimizer. The archive does not contain an executable Alliance lifecycle for
every old quest, and static quest references do not establish current-server drop rates.

### Default finish: 55–60 in eight dungeon quest clears

The owner confirmed that one full quest clear of each of these eight dungeons is sufficient
to finish from around level 55: BRD, LBRS, Dire Maul East, West and North, Scholomance,
Stratholme Living and Stratholme Undead. This is the route's planning contract. A counted
quest-only endpoint around 56 is sufficient for the handoff; do not add outdoor farms to
make that isolated reward ledger reach 60.

The preceding BRD visit counts once. The default dungeon strategy hides the later mandatory
outdoor chapters, shows the eight-wing checklist first, and opens the chosen wing's quest
list. Extra runs for gear and the two announced alternative dungeons remain optional. XP and
repeat-run measurement tools are folded away and are not required to use the itinerary.
Actual keys and individual quest eligibility remain part of each wing's preparation.

The final level-60 task represents completing this circuit. It does not award a fixed XP
bonus on entry or invent a per-wing XP breakdown. Selecting a wing does not change players'
levels or mark their quests complete.

## Implemented

- Apply one policy to starter preparation, source-backbone additions and manual quest actions.
  Collection-heavy chapters cannot bypass it just because they were part of the solo route.
- Retain shared kill objectives and nearby interactions or short deliveries that support them.
  Nearby checks understand both map-percent coordinates and world coordinates.
- Evaluate collection cost for the complete five-player quota. The default admission budget
  is at most 20 expected kills and 40 kills in the slow loot scenario. Unknown quantities,
  rates, stack rules, loot sharing or creature selection do not qualify as easy collection work.
- Preserve selected core dungeon quests, their real prerequisites, explicit preparation
  chains, class unlocks and the early personal starter flow. These exceptions are recorded in
  `partyPolicy.decisions`; they are not classified as cheap farming.
- Remove every phase of rejected quests and rewrite mixed-step instructions. Remove rejected
  quests from combat objectives and library choices as well. An excluded default extra cannot
  silently return as a forecast blocker; explicit user opt-in still requires review.
- Prefer factual prerequisite metadata over an adjacent unrelated source hand-in. Select one
  available alternative for an OR prerequisite, preserve combined hand-in/pickup steps, and
  reorder stages within a leg after applying the corrected prerequisites. Missing required
  prerequisites remain visible in the policy receipt.
- Defer the ordinary early Westfall starter detour for Human, Dwarf, Gnome and Skyborne routes.
  Keep the Defias chain in its Deadmines preparation visit. Hunter/Druid starter branches keep
  their own class-specific source chapters.
- Add an early Darkshore circuit before Hall of Thanes: Plagued Lands → Cleansing of the
  Infected, the scouting → furbolg-kill chain, and the Ameth'Aran tablets. Keep Murkdeep for
  the later visit. Patrolling Westfall and Red Leather Bandanas are not default party farms.
- Retain source-authored flight-master visits in chapters actually used by the route. Track
  leader, party and optional raid branches separately. Do not add flight-master detours whose
  source step requires a dungeon outside the selected circuit, such as Wailing Caverns.
- Fill the missing Thadius Grimshade and Ancient Egg lead-ins with explicit reference steps,
  including the three distinct Witherbark cage objectives. These instructions remain reference
  lifecycles; they do not invent loot rates, live observations or XP rewards.
- Defer Lost Tablets of Will (1139), which needs an earlier Uldaman visit and its return
  chain, and the LBRS Final Tablets quest (4788), which needs an extra Eastern Plaguelands →
  Tanaris collection trip. The decision receipt records these exceptions to the older core
  list. The four-quest bundles for the new dungeons are retained.
- Run the website, addon builder and XP audit through `prepareCampaignPlan` so an audit cannot
  accidentally approve the old unfiltered solo backbone.

## Source and evidence boundaries

The archive has 61 Alliance questing source chapters. The authored Questie export used for the
local review has 5,232 quest references and 13,391 NPC references, from revision
`e9a67d1a2753a0e64c4c96bf7864788fac7b765f`. Those counts do not mean that every quest has a
complete route, a measured drop model or an up-to-date Forever XP capture.

The combat importer now preserves prerequisite groups, class masks and interaction-only
objectives. Existing datasets remain readable; regenerate the reference dataset with the
existing `scripts/import-leveling-combat.mjs` workflow to supply these additional fields.
Do not use a generated export that omitted the provider's authored corrections.

Group Loot is the intended party setting. It does not, by itself, prove whether a particular
quest item has independent personal rolls or one pooled drop. For example, ten items per
player at a 20% drop rate means about 250 group kills if all five quotas use one pooled
single-item drop stream. It is not a ten-item party objective.

The local review starts with the frozen October 25 XP snapshot and supplements it with
checksum-validated archived quest captures and the existing historical XP import. The omitted
2990 row was restored to that import from the exact same XP source bytes: source hash and
all 2,178 prior records are preserved; the import now has 2,179 records. Its minimum level,
and the Ancient Egg minimum, come from the authored quest reference rather than an XP-only
table. Historical values remain labeled as estimates.

Some original captures have passed the publisher's freshness window. Freshness checks have
not been relaxed and old capture timestamps have not been changed. A successful compile or
import-parser check is not proof of current-server numerical accuracy.

## Verification and release checklist

The focused regressions cover complete quota arithmetic, source/manual selection parity,
class-condition bypasses, mixed hand-in/pickup steps, factual prerequisites, flight-path
audiences, dungeon-gated detours and the added dungeon lead-ins. Run:

```sh
pnpm --filter @wow-trader/leveling test
pnpm --filter @wow-trader/leveling lint
pnpm --filter @wow-trader/leveling typecheck
pnpm --filter @wow-trader/leveling build
pnpm --filter @wow-trader/web exec vitest run src --passWithNoTests --maxWorkers=2
pnpm --filter @wow-trader/web typecheck
```

Before publishing a revised guide:

1. Refresh/validate the selected reward facts through the existing publisher.
2. Run the continuous XP audit using the new combat metadata and inspect actual blockers,
   missing prerequisites and any leveling needed before the dungeon handoff. Retain the
   owner's eight-clear finish instead of adding outdoor work to fund level 60.
3. Compile and independently verify both leader and member documents, then check the native
   RestedXP parser and chapter links. Preserve the 1–20 / 20–40 / 40–60 grouping in a new
   test export; do not silently overwrite the older October 31 TBC flow string.
4. Check the resulting route in the browser and test the changed early circuit in game.

Raw review artifacts are private local outputs under `.cache/leveling-kill-first-20261031/`.
They include the selection receipt, prepared plan and independent compilation check. See
`flow-review.json` for the distinction between a forecast with planned grinding and a
forecast that assumes no extra grinding. Neither result is a live-server certification.

### October 31 local verification

- 609 leveling tests, package lint, typecheck and build passed.
- 180 focused leveling web tests passed. Web typechecking and scoped lint passed.
- All 28 exact race/class editions compiled and passed independent document coverage checks.
- Native v4.11.29 loader checks passed for the 56-chapter TBC flow preview in Human/Warrior
  and NightElf/Druid contexts, including all next links and the two level-group transitions.
- Real Chrome checks passed at 1440 and 390 pixels: eight first-clear selectors, working
  quest-panel navigation, saved selection after reload, no overflow or browser errors, and
  unchanged party XP/quest state when selecting a wing.

The preview string and its receipt are under
`artifacts/leveling/tbc-flow-test-kill-first-20261031-v26/`. It is a private flow preview;
no addon was installed. The subsequent website rollout is recorded in the deployment receipt above.
