# Forever quest-reward evidence

Twenty-six campaign hand-ins currently use clearly labeled historical Questie values because no
published numeric Forever reward was available when the route was compiled. The optional
`KFCForeverGuides` observer can replace those estimates with exact current-build turn-in evidence.
It listens only to WoW's public `QUEST_TURNED_IN` event. It does not accept or hand in quests, move,
target, cast, inspect memory, or send data over the network.

## Record reward observations

Install an exact campaign review package and verify that the client build matches the package. Before
turning in one or more of the unresolved quests, run:

```text
/kfcguide observe
```

Turn in the quests normally. `/kfcguide stop` ends collection; `/reload` or logout writes the data
to:

```text
WTF/Account/<account>/SavedVariables/KFCForeverGuides.lua
```

The addon retains at most 100 reward observations and 20 reward sessions. Each observation records
the quest, exact XP, hand-in level, client build, timestamp and session ID. The linked session records
the exact guide release/compiler and private character provenance. When an old session is evicted,
its linked observations are evicted too, so the file never contains dangling evidence.

Raw SavedVariables contain character name, realm and GUID. Keep that file private. The reviewed
artifact replaces those fields with a source-bound fingerprint.

## Review before approval

First generate a report without approving anything:

```sh
pnpm leveling:reward:review -- \
  --saved-variables=/absolute/path/to/KFCForeverGuides.lua \
  --backlog=artifacts/leveling/audits/2026-10-19/evidence-backlog/campaign-evidence-backlog-6236cd9318e622b4.json \
  --quest-evidence=artifacts/leveling/evidence/campaign-quest-source-evidence.json \
  --destination=artifacts/leveling/evidence/rewards \
  --expected-build=70450
```

The immutable report shows reviewable and rejected sessions/observations, plus the expected quest
IDs that are still missing. It rejects a wrong build, missing package or character provenance,
unknown session, unexpected quest, impossible level, observation before session start, duplicate
session identity, and conflicting XP values for the same quest and hand-in level.

After inspecting the report, approve only exact clean session IDs:

```sh
pnpm leveling:reward:review -- \
  --saved-variables=/absolute/path/to/KFCForeverGuides.lua \
  --backlog=artifacts/leveling/audits/2026-10-19/evidence-backlog/campaign-evidence-backlog-6236cd9318e622b4.json \
  --quest-evidence=artifacts/leveling/evidence/campaign-quest-source-evidence.json \
  --destination=artifacts/leveling/evidence/rewards \
  --expected-build=70450 \
  --approve=70450:1792400000:1
```

Approval creates a `campaign-quest-reward-evidence.v1` file. An observation always establishes the
exact XP for its exact hand-in level. It establishes `fullXp` only when the quest level is known and
the observed character is no more than five levels above it. A higher-level scaled observation is
never promoted to base XP. Multiple clean characters may strengthen the same quest/level row; a
disagreement remains rejected rather than averaged or overwritten.

## Use reviewed evidence

Attach the reviewed artifact to the campaign audit:

```sh
node scripts/audit-leveling-quest-xp.mjs \
  --destination=artifacts/leveling/audits/current \
  --rewards=/absolute/path/to/reference-published \
  --reward-import=artifacts/reference/questie/quest-xp-import.json \
  --reward-evidence=artifacts/leveling/evidence/rewards/reward-evidence-<hash>.json \
  --runtime-build=70450
```

Or build the next review addon with the same evidence:

```sh
pnpm leveling:addon:campaign -- \
  --archive=artifacts/leveling/archive \
  --rewards=/absolute/path/to/reference-published \
  --reward-import=artifacts/reference/questie/quest-xp-import.json \
  --reward-evidence=artifacts/leveling/evidence/rewards/reward-evidence-<hash>.json \
  --destination=artifacts/leveling/campaign-addon-review \
  --race=human \
  --class=warrior \
  --runtime-build=70450 \
  --restedxp-version=v4.11.26
```

Reviewed exact rows override historical rows. If the observation proves full XP, it replaces the
historical base value. If it proves only a scaled level, the historical base and other historical
level rows are discarded rather than mislabeled as observed; unobserved hand-in levels remain
explicitly unresolved. Evidence from another runtime build is refused by both audit and compiler.

## Remaining boundary

Reward evidence proves only the event payload for the recorded build, quest, level and session. It
does not prove quest eligibility, prerequisites, party credit, route ordering, combat XP, or grind
timing. Those remain separate evidence tasks. Keep the raw SavedVariables and its SHA-256-linked
review report privately for reproducibility.
