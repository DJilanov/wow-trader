# KFC Marks delivery — November 4, 2026

The independent `apps/addon/KFCMarks` addon is implemented and installed locally
as version 0.1.0, interface 16001. It supports ordinary parties and raids with a
safe native click/keybinding path for pre-pull marks and an observational nearby
combat queue. It is independent of Trader, RestedXP and the desktop Companion.

## Scope and client boundary

The original request was unattended marking when enemies enter combat, without
taking an icon from a living mob. Source research found that Forever restricts
`SetRaidTarget`, returns secret marker values, and does not expose the next-free
marker query in the restricted snippet environment. RestedXP also disables its
automatic marking on Forever and uses player-clicked macros.

This release therefore requires one genuine player click/key press **before the
player enters combat**. It does not claim unattended or in-combat application.
Combat detection updates the queue and readiness UI. Native secure state and
pre/post-click guards only disable/disarm actions. They do not automate protected
input or forward combat-derived decisions into secure snippets.

## Delivered behaviour

- Native free-slot queries check all permitted icons, including ownership beyond
  visible nameplates. The explicit dead-hostile option permits reuse after death.
  Nameplate disappearance and peer expiry never release an icon in addon logic.
- Default order is Skull, Cross, Triangle, Diamond, Circle, Star, Square, Moon.
  Players can reorder all eight and reserve individual icons for CC or players.
  Full, reserved, secret/unreadable and unsupported states stop assignment.
- The actual key press rechecks availability. Blizzard's `set-unmarked` action
  preserves the selected enemy's existing mark. No clear/toggle operation and no
  direct `SetRaidTarget()` call are shipped in addon Lua.
- A transparent, shown binding target is independent of the settings window;
  the visible panel button uses the same policy. Both controls explicitly use
  key-up dispatch, avoiding `ActionButtonUseKeyDown=1` silently suppressing input.
- Party/raid copies coordinate through bounded, member-validated addon messages,
  outside combat. Leader/assistant preference, volunteering and deterministic
  tie-breaking pick one cooperative marker. Raid authority remains mandatory.
  Failed communication falls back to actual-leader-only marking.
- Minimap launcher, readable readiness/occupancy, settings, priority validation,
  target/mouseover/queue modes, diagnostic probe, blocked-action latch/retry and
  deferred combat-safe window operations are included. Reloading in combat does
  not create protected controls until combat ends.
- Only configuration and window position are saved. No target/health/combat
  records, private identities or group history are persisted or uploaded.

## Validation and evidence

Passed 12 policy controls, 18 core/coordination controls, UI harnesses from both
normal and in-combat startup, all shipped Lua 5.1 syntax checks, TOC/binding
validation, XML parsing, Node syntax, scoped ESLint and scoped Prettier checks.
The core count includes actual captured Blizzard dispatcher and `raidtarget`
handler controls; these are source-level controls, not live API validation.

The tests cover unseen living ownership, friendly/dead marks, all eight occupied,
reservations, click-time changes, secret values, cooperative membership and
expiry, transport failure, party/raid permissions, stale-action disarming,
window lifecycle and protected-attribute changes during combat.

Run from the repository root:

```sh
node scripts/test-kfc-marks.mjs --lua=artifacts/trader-buy-20261031/tools/lua-5.1.5/src/lua --ui-source=artifacts/kfc-marks-20261104/SecureTemplates.lua
```

The optional captured UI source is hash-checked before test execution. Its
SHA-256 is `b6e91f1d54f269a8bd66312b368e6fd7706028d366eee0167161ace9004cae23`.
References and the first live test checklist are in
[the addon README](../apps/addon/KFCMarks/README.md).

Actual launch-client API behaviour, group permissions and taint remain
**unverified in game**. The owner previously reported no game access until the
servers open. Do not describe automatic combat marking as implemented or the
live check as passed. Do not enable an icon-overwrite fallback if the native
helper is unavailable or secret.

## Local delivery

- Installed: `/Applications/World of Warcraft/_forever_/Interface/AddOns/KFCMarks`.
- ZIP: `artifacts/kfc-marks-20261104/KFCMarks-0.1.0.zip`.
- ZIP SHA-256: `743b4ecc04cdb8fba1f7dbeae938cfc1827086917af6f5e92d04f120683d4a74`.
- Six shipped files: TOC, three Lua modules, bindings XML and README. Tests and
  captured Blizzard source are excluded from the ZIP and installation.
- Manifest, install receipt, captured source and test evidence are under
  `artifacts/kfc-marks-20261104/`. Installed bytes match the source manifest.

There was no running WoW process during installation. No existing addon or WTF
SavedVariables file was modified. No package dependency, Collector/Companion
bundle, database, website deployment or Git commit/push was required.

Start WoW, enable **KFC Marks**, run `/kfcmarks`, and assign its marking keybinding.
When game access is available, start with `/kfcmarks probe` outside combat and
the live checklist in the README. To remove this release, remove only the
`Interface/AddOns/KFCMarks` folder while WoW is closed. Its optional saved
configuration can be retained; no Trader data needs restoring.
