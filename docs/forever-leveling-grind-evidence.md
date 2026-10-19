# Forever leveling grind evidence

The campaign audit currently marks adaptive XP checkpoints as playable but unmeasured. A release
measurement must identify the exact checkpoint, build, character/session, party context, camp,
attributed kill mix, XP gained, and duration. The optional `KFCForeverGuides` addon records that
information from normal public WoW events. It never starts combat, selects a target, moves the
character, casts, accepts a quest, or sends data over the network.

## Install the review addon

Build the exact campaign review package for the race/class being played. The generated
`KFCForeverGuides.toc` includes `GrindObserver.lua`, and `Guides.lua` contains an allowlist of the XP
checkpoint IDs in that package. RestedXP shows the exact start command in every XP-check step.

Quit WoW, install the generated `KFCForeverGuides` directory under the active client's
`Interface/AddOns` directory, then enable both RestedXP and KFC Forever Guides. Do not merge it into
RestedXP and do not overwrite an existing SavedVariables file.

## Record one checkpoint

At the beginning of the XP work, use the command printed in the current guide step:

```text
/kfcguide grind <checkpoint-id>
```

Play the checkpoint normally. For a reviewable session:

- keep the same party membership for the whole sample;
- do not turn in a quest during the sample;
- use a character without rested XP;
- remain in the intended camp or route area;
- finish enough normal XP-yielding kills to make the kill mix representative;
- avoid exploration, battleground, event, or other non-kill XP;
- stop at the requested level/XP bar with `/kfcguide grind stop`.

Use `/kfcguide grind status` at any time. If the sample was contaminated, use
`/kfcguide grind discard` before starting another one. `/kfcguide stop` also finalizes an active
grind, while logging out finalizes it as interrupted so the reviewer can reject it rather than lose
the provenance.

The observer retains the latest 250 sessions and at most 100 distinct NPC/level entries and 25 area
changes per session. It tracks active and combat seconds separately, records deaths and party
changes, and reconciles XP-bar movement with localized kill-XP messages when those messages can be
parsed. Target-name matches are NPC attribution candidates, not automatic proof; every clean
session still requires explicit review approval.

After the session, run `/reload` or log out so WoW writes:

```text
WTF/Account/<account>/SavedVariables/KFCForeverGuides.lua
```

## Review and approve

Build the leveling package first because the reviewer imports the safe Lua-literal parser from its
compiled output:

```sh
pnpm --filter @wow-trader/leveling build
pnpm leveling:grind:review -- \
  --saved-variables=/absolute/path/to/KFCForeverGuides.lua \
  --backlog=artifacts/leveling/audits/2026-10-19/evidence-backlog/campaign-evidence-backlog-6236cd9318e622b4.json \
  --destination=artifacts/leveling/evidence/grinds \
  --expected-build=70450
```

The first pass emits an immutable review report but no accepted evidence. Inspect each session's
issues, warnings, area sequence, XP reconciliation, party levels, and kill mix. Then approve only the
clean session IDs:

```sh
pnpm leveling:grind:review -- \
  --saved-variables=/absolute/path/to/KFCForeverGuides.lua \
  --backlog=artifacts/leveling/audits/2026-10-19/evidence-backlog/campaign-evidence-backlog-6236cd9318e622b4.json \
  --destination=artifacts/leveling/evidence/grinds \
  --expected-build=70450 \
  --approve=70450:1792400000:1
```

An approved `campaign-grind-evidence.v1` artifact excludes the character name, realm, and GUID. It
keeps a source-bound fingerprint so samples from the same character/session can be audited without
publishing identity. Approval cannot override structural contamination such as a wrong build,
unknown checkpoint, quest turn-in, party change, rested XP, discontinuous XP bar, or unreconciled
kill counts.

Attach the approved artifact to the normal route audit:

```sh
node scripts/audit-leveling-quest-xp.mjs \
  --destination=artifacts/leveling/audits/current \
  --rewards=/absolute/path/to/reference-published \
  --reward-import=artifacts/reference/questie/quest-xp-import.json \
  --reward-evidence=artifacts/leveling/evidence/rewards/reward-evidence-<hash>.json \
  --runtime-build=70450 \
  --grind-evidence=artifacts/leveling/evidence/grinds/grind-evidence-<hash>.json
```

The audit accepts a measurement only when its build and campaign release match, it was recorded in
the same five-player context as the campaign, and its observed XP path reaches the named checkpoint.
Nonmatching evidence remains preserved in its review report but does not clear the campaign task.

## Evidence limitations

One sample proves only its exact build, checkpoint, camp, character level, party composition, and
observed play. It does not prove that the same camp is optimal for every class or realm condition.
Prefer multiple clean sessions for checkpoints whose route scenarios have materially different
party sizes or XP deficits. Keep raw SavedVariables private and preserve their SHA-256-linked review
report for reproducibility.
