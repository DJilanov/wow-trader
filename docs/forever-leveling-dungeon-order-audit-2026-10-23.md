# Premade dungeon progression audit — 23 October 2026

Status: implemented locally; not committed, pushed or deployed by this change.
Scope: all 21 stops included in the five-player Alliance campaign, not additional
dungeons outside that selected circuit. The dungeon catalog itself is unchanged.

## Cause and correction

The original circuit placed Excavation before BFD and stored late targets for several
other dungeons. Conservative difficulty raised Excavation from 27 to 29 but retained
BFD at 28. The public route's forecast actually reached BFD at level 30 + 66%.
This was an execution-order problem, not merely a descending badge.

`premade.ts` now builds one level-ordered circuit from the corrected stop definitions.
Each successor's level is derived rather than copied into a stale `nextLevel` field.
The campaign compiler, chapter reader and checklist consume that same sequence.
Quest eligibility and selected difficulty remain independent checks; no gate was
removed or weakened to force an earlier run.

| Order | Dungeon                         | Default entry target | Experienced party |
| ----- | ------------------------------- | -------------------: | ----------------: |
| 1     | Hall of Thanes                  |                   16 |                16 |
| 2     | Ruins of Lordaeron              |                   19 |                18 |
| 3     | Deadmines                       |                   20 |                20 |
| 4     | Blackfathom Deeps               |                   25 |                25 |
| 5     | Stockade                        |                   26 |                26 |
| 6     | Excavation Site                 |                   29 |                27 |
| 7     | City of Dalaran                 |                   31 |                30 |
| 8     | Razorfen Kraul                  |                   31 |                31 |
| 9     | Gnomeregan                      |                   33 |                33 |
| 10    | Drowned City — planning only    |                   37 |                37 |
| 11    | Scarlet Monastery, three wings  |                   38 |                38 |
| 12    | Razorfen Downs                  |                   39 |                39 |
| 13    | Krol'dok — planning only        |                   42 |                42 |
| 14    | Uldaman                         |                   42 |                42 |
| 15    | Zul'Farrak                      |                   44 |                44 |
| 16    | Maraudon                        |                   46 |                46 |
| 17    | Alcaz Prison — planning only    |                   50 |                50 |
| 18    | Sunken Temple                   |                   51 |                51 |
| 19    | Blackrock Depths, scoped visits |                   55 |                55 |
| 20    | Lower Blackrock Spire           |                   60 |                57 |
| 21    | Stratholme                      |                   60 |                59 |

Targets are not observed player levels or universal game-access minima. In particular,
the existing conservative level-60 recommendations for LBRS/Stratholme are preserved;
their pre-60 experienced-party choices still require explicit selection. Thanes retains
16 for its selected quests. RFD retains Bring the Light's recorded level-39 minimum.
The three unknown-ID dungeons retain all four optional, owner-confirmed planning slots;
their levels are planning inputs, not verified quest/access facts.

## Preparation and continuity

- BFD's Ironforge/Kalimdor pickups now follow Deadmines, before Stockade's eastern
  quest preparation. Excavation's relic delivery no longer appears as a BFD prerequisite.
- RFK retains Lonebrow → Thalanaar → Crone. The higher-level Brother Anton/Scarlet
  chain moves after Gnomeregan and before the Monastery, rather than delaying RFK.
- RFD gets its own Stormwind/entry preparation after SM. Level-40-and-up Tanaris
  kill work moves to the later Zul'Farrak preparation.
- Uldaman precedes ZF. ZF and its Yeh'kinya chain precede Maraudon; the Temple
  continuation retains those completed rewards without paying them twice.
- Outgoing instructions and outdoor preparation ranges follow the new successors.
  Required chains remain required even if a party is already ahead on XP.
- Existing stop/action identities and the campaign release key remain stable, so
  reported XP and saved action bookmarks are not reset. Actual completion remains
  a user report; predictions do not complete or resurrect moved steps.
- The prepared workflow is `workflow-20261023-v11`; the native export compiler is
  `campaign-addon-20261023-v23`. Existing v22 review ZIPs are not overwritten or
  relabeled as current. No game installation or new distributed package is included.

## Verification

- 546 leveling tests / 46 files passed, including new sequence, both difficulty
  policies, raid/extras combinations, preparation placement, unique quest phases,
  successor consistency and saved-progress preservation regressions.
- Leveling typecheck, lint and ESM/declaration build passed. Web typecheck passed;
  18 focused web routing/presentation/handoff/export tests and 10 CLI/review tests passed.
- The authorized full archive and published quest rewards compiled all 28 leader
  editions plus same-edition and independent starters without creating a ZIP.
- Both complete 28 × 28 leader/member matrices passed, with raid preparation off
  and on: 1,624 structural compiler/manifest checks in total, not game playthroughs.
- Local Chromium checked the actual 21-stop overview and every chapter target at
  1440, 390 and 320 pixels, with no descending targets, overflow or page errors.
  Checks without reward configuration retain the existing missing-data state;
  loaded reward references produce real numeric projections. BFD projects entry 25
  and finish 25 + 59% in the full-input Human/Warrior preview. This is a forecast,
  not an observed game result.
- Repeated the three-width check with combat references deliberately absent, matching
  the production policy of excluding private combat data. Both reward-loaded scenarios
  passed 126 numeric entry/finish-bar continuity checks each (21 dungeons × two bars ×
  three widths). The preview uses the existing local build-70205 world identity snapshot;
  it is not a byte-for-byte copy of the live database. Candidate/public acceptance with
  actual production evidence remains a deployment gate.

Reproduce the structural matrix without writing packages:

```sh
node scripts/build-leveling-campaign-addon.mjs \
  --archive=artifacts/leveling/archive \
  --rewards=artifacts/reference/questie/completion-20261019/published \
  --reward-import=artifacts/reference/questie/quest-xp-import.json \
  --runtime-build=70450 --restedxp-version=v4.11.27 \
  --version=0.2.0-review.7 --verify-all --verify-party-matrix
```

Repeat with `--raid-goals` for the second matrix. These checks require the existing
authorized local archive and published reward files; they do not install an AddOn.

Operational browser/matrix reports are in
`/tmp/kfc-dungeon-order-20261023-2kdfPL/`. No private combat dataset, model output,
simulator pointer, production environment or unrelated worktree edit was changed.

Before deployment, use the normal committed-source release workflow and repeat the
candidate/public guide checks with the selected production evidence. Unit and parser
checks do not certify unknown dungeon access or an in-game playthrough.
