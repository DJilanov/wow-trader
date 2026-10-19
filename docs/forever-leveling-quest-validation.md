# Forever quest validation sessions

The [audit/browser consumer](forever-leveling-quest-validation-consumer.md) is now implemented
locally. Use its current review.3 package and latest backlog. Real observations and explicit
approval are still required; no actual recording was approved by the implementation.

The browser consumer is now [deployed for testing](forever-leveling-test-deployment-2026-10-19.md).
That release does not approve recordings or open the addon publication gate.

The route audit separates five kinds of in-game quest uncertainty from reward XP and grind
measurements:

- named-target loot or objective credit for all five party members;
- race, class, item, or character-specific pickup eligibility;
- incomplete pickup/objective/turn-in lifecycle evidence;
- disputed minimum pickup levels; and
- a build-specific pickup that conflicts with an older prerequisite gate.

The review addon includes a passive `QuestObserver.lua` for these checks. It records public quest-log
transitions, the stable one-to-five-player roster, current target, gossip availability, location and
bounded loot-message hashes. It does not target, accept, complete, turn in, move, cast, click, or send
anything over the network.

## Generate the exact recording plan

The generated build-70450 plan is
`artifacts/leveling/evidence/campaign-quest-validation-plan.json`. Regenerate it whenever the audit
backlog or compiled quest evidence changes:

```sh
pnpm leveling:quest:plan -- \
  --backlog=artifacts/leveling/audits/2026-10-19/quest-validation-consumer/campaign-evidence-backlog-6f3c9ebbb9f42e67.json \
  --quest-evidence=artifacts/leveling/evidence/campaign-quest-source-evidence.json \
  --output=artifacts/leveling/evidence/campaign-quest-validation-plan.json \
  --runtime-build=70450
```

The current plan has 112 task/code pairs across 65 quests: 8 named-target, 46 personal-eligibility,
45 lifecycle, 12 pickup-level and 1 source-gate check. Eight named-target quests are not part of the
separate current-page source queue, so their title/source metadata is explicitly null; their quest
IDs, route actions, affected editions and recording commands still come from the audit backlog.

## Record a session

Every plan row contains its exact command. The general form is:

```text
/kfcguide validate <quest-id> <named-target|personal-eligibility|lifecycle|pickup-level|source-gate>
```

Run it immediately before the action being tested. Perform the action normally, use
`/kfcguide validate capture` after opening the relevant gossip or selecting the named target when
useful, then finish with:

```text
/kfcguide validate stop
```

Use `validate status` to inspect the active session and `validate discard` if unrelated quest/party
activity contaminated it. `/kfcguide stop` also finalizes it. Run `/reload` or log out before copying
`WTF/Account/<account>/SavedVariables/KFCForeverGuides.lua`.

Protocol by task:

- For named targets, all five clients must start the same quest/code session before the kill and keep
  the exact roster. Select the named NPC and capture once before combat. Each account's file is
  reviewed separately; the exported stable party-set fingerprint lets the five privacy-redacted
  observations be correlated later without exposing individual GUIDs.
- For personal eligibility, record on every affected race/class context immediately before normal
  acceptance. One character cannot establish eligibility for every edition listed in the plan.
- For lifecycle, capture the acceptance, objective transition and turn-in. These may be separate
  reviewed sessions if the quest is long; none alone is mislabeled as the complete lifecycle.
- For pickup-level conflicts, use a fresh otherwise-eligible character at the lower disputed level.
  An over-level character cannot prove the lower boundary.
- For source-gate conflict, use a character that intentionally has not completed the disputed older
  prerequisite, then accept normally if the current build offers it.

## Review and approve

First produce an immutable report with no approval:

```sh
pnpm leveling:quest:review -- \
  --saved-variables=/absolute/path/to/KFCForeverGuides.lua \
  --backlog=artifacts/leveling/audits/2026-10-19/quest-validation-consumer/campaign-evidence-backlog-6f3c9ebbb9f42e67.json \
  --destination=artifacts/leveling/evidence/quest-validations \
  --expected-build=70450
```

Inspect the session's build, release/compiler, level, class/race, party-set fingerprint, snapshots,
location, target and derived signals. Then approve only clean session IDs:

```sh
pnpm leveling:quest:review -- \
  --saved-variables=/absolute/path/to/KFCForeverGuides.lua \
  --backlog=artifacts/leveling/audits/2026-10-19/quest-validation-consumer/campaign-evidence-backlog-6f3c9ebbb9f42e67.json \
  --destination=artifacts/leveling/evidence/quest-validations \
  --expected-build=70450 \
  --approve=70450:1792500000:1
```

The reviewer accepts only bounded Lua data literals and rejects an unknown backlog task, wrong build,
missing package/character context, changed party, interrupted/empty session, missing relevant quest
transition, or malformed timestamps/objectives. Character name, realm, GUID, objective text and loot
text are absent from the exported evidence. Character fingerprints remain source-bound; the party-set
fingerprint is stable only to correlate the same five-member test roster across account files.

## Evidence boundary

An approved artifact is an observation, not an automatic route correction. The consumer clears only
matching quest/code, build, release/compiler and covered character/party contexts. Five-player credit
requires five distinct correlated members and the same NPC instance; an acceptance by one class
does not certify other classes, and partial lifecycle phases are not complete proof. A failed pickup
attempt still needs visual/NPC context before it can establish a negative. See the consumer runbook
for the repeatable audit option, public coverage artifact and browser checksum/runtime configuration.
Actual XP, completion state and legal pickup/access gates are never changed by an approval.
