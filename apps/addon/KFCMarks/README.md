# KFC Marks

Standalone WoW Forever party/raid marker helper, version 0.1.0. No Trader,
Auctionator, RestedXP, Companion, or external library is required.

**Application is deliberately limited to a player click/key press before
combat.** Forever restricts automatic target assignment, and its secure handler
environment does not expose the next-free-marker query to addon snippets.
Combat events populate an observational queue; they never apply a mark. This is
not an unattended combat automarker.

## Use

1. Copy the `KFCMarks` folder into the Forever client's `Interface/AddOns`.
2. Restart WoW and enable **KFC Marks** in AddOns.
3. Click its skull minimap icon or run `/kfcmarks`.
4. In Keybindings, find **KFC Marks** and bind **Mark next eligible enemy
   (before combat)**. The binding works independently of the settings window.
5. Select a living enemy and press the key before pulling. The default order
   starts Skull, Cross, Triangle, Diamond, Circle, Star, Square, Moon.

The window supports current-target, mouseover-keybind and nearby-combat-queue
modes. One press requests one mark without changing your selected target.
The queue includes only readable, unmarked NPCs already in nearby combat. It
can be used before your character joins combat. Players and player-controlled
pets are excluded.

## Icon safety

- The native availability API checks the client marker registry, including
  marked enemies beyond nameplate range. Disappearing nameplates and expiring
  addon peers never free icons.
- Availability is checked again on the actual player press. Only a confirmed
  free, permitted icon is passed to Blizzard's secure `raidtarget` action.
- `set-unmarked` preserves an enemy's existing mark even when that mark cannot
  be inspected by addon Lua. There is no clear/toggle command in the addon.
- Dead hostile NPC marks may be reused through the native query's explicit
  dead-enemy option. Friendly/player marks are not deliberately freed.
- Reserve individual icons for crowd control/players. Every allowed icon
  occupied, every icon reserved, unreadable values or a missing API means no
  assignment. Never wrap around and steal Skull.
- A native secure combat-state driver clears the action type on both controls.
  Addon code makes no protected attribute changes in combat. The UI states
  **Locked in combat**; deferred opening/closing completes afterward.
- A reported Blizzard action block latches marking off for the session until
  an explicit `/kfcmarks retry` outside combat. No blocked-action popup is hidden.

The native query and secure-click path still need live launch-client validation.
Offline controls cannot prove Blizzard's in-game permissions or taint behaviour.
Network latency also means no addon can make icon assignment atomic with manual
marks from other players; use one agreed marker.

## Party and raid coordination

Installed copies exchange only versioned enabled/volunteer flags through party
or raid addon messages, outside combat. Messages from nonmembers, malformed
payloads and ambiguous short names are ignored. Character identities are resolved
from the current group roster rather than trusted from a payload.

Selection prefers the installed group leader, then raid assistants. A volunteer
takes precedence; ties use the same deterministic order on every copy. Normal
party members can volunteer. Raid members still need leader or assistant
permission. If communication fails, only the actual group leader may mark.
After a roster change there is a short discovery/stability pause.

This is cooperative coordination between KFC Marks copies. Other addons are
not controlled. Their occupied marks are handled by the native availability
check. No group member needs the addon merely to see the resulting icons.

## Controls and storage

| Command                       | Action                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| `/kfcmarks`                   | Toggle the window                                                                   |
| `/kfcmarks on` / `off`        | Enable or pause                                                                     |
| `/kfcmarks claim` / `release` | Volunteer or return to automatic coordinator selection                              |
| `/kfcmarks status`            | Print the current readiness/reason                                                  |
| `/kfcmarks probe`             | Print version/build, control readiness and readable icon states; never apply a mark |
| `/kfcmarks retry`             | Clear a compatibility block outside combat                                          |
| `/kfcmarks minimap`           | Restore the minimap icon after hiding it with right-click                           |

`KFC_MARKS_DB` saves configuration and window position only. No targets, GUIDs,
health, combat logs, or group history are persisted. There are no HTTP calls,
external uploads, targeting, attacks, spell casts or automatic key presses.

## Verification

From the repository root with Lua 5.1 installed:

```sh
node scripts/test-kfc-marks.mjs --lua=lua
```

For maintainers, `--ui-source=/path/to/SecureTemplates.lua` also runs the
actual pinned Blizzard dispatcher and `raidtarget` action under the harness.
The runner verifies SHA-256
`b6e91f1d54f269a8bd66312b368e6fd7706028d366eee0167161ace9004cae23`
before executing these controls. Review/re-pin deliberately for a different UI
revision. Production code contains no direct `SetRaidTarget()` call.

The controls cover hidden/alive icon ownership, dead/friendly ownership,
reservations, full and unknown pools, click-time changes, party/raid authority,
peer validation/expiry, secret values, native action blocking, settings, UI,
deferred window changes and key-up dispatch with `ActionButtonUseKeyDown=1`.

## First live check

Run `/kfcmarks probe` outside combat, then mark two different unmarked enemies
with the keybind while the settings window is closed. Expect Skull then Cross.
Confirm that pressing on an already marked target keeps its existing icon.
Have another group member mark a living enemy, including one beyond nameplate
range, and confirm that its icon is skipped. Confirm a dead hostile mark can be
reused, reserved icons stay unused, and a full pool produces no mark. Repeat in
a party and a raid with appropriate permissions. Start combat and confirm that
both click controls/keybindings remain locked without a Lua/blocked-action error.

If the native helper reports all unknown or the secure click is blocked, retain
the probe output and exact client build for the next compatibility pass. Do not
enable an unsafe icon-overwrite fallback.

Primary references:

- [Forever raid-marker API](https://github.com/Gethe/wow-ui-source/blob/forever/Interface/AddOns/Blizzard_APIDocumentationGenerated/RaidMarkersDocumentation.lua)
- [Forever secure action handlers](https://github.com/Gethe/wow-ui-source/blob/forever/Interface/AddOns/Blizzard_FrameXML/SecureTemplates.lua)
- [Restricted snippet environment](https://github.com/Gethe/wow-ui-source/blob/forever/Interface/AddOns/Blizzard_RestrictedAddOnEnvironment/RestrictedEnvironment.lua)
- [RestedXP's Forever marking adaptation](https://github.com/RestedXP/RXPGuides/blob/main/Targeting.lua)
