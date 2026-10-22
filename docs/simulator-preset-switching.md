# Complete reviewed preset selection

The October 22 regression was not an invalid Tailoring restriction: the Rugged Mantle
of the Timbermaw requires Tailoring, and the reviewed caster builds already include it.
The embedded configuration and gear controls could leave professions from the previous
character behind while changing equipment. A clean default or a full share import did
not exercise that transition, so the original smoke tests missed it.

Reviewed selections now use one complete-scenario application path from the outer build
selector, embedded Preset Configurations and built-in Gear Sets. The host prevents the
engine's partial gear update, then imports the authenticated full build. Gear, enchants,
race, professions, talents, rotation, buffs, consumables and encounter change together.
Selecting never starts a simulation. Rapid selections use the latest requested build.

Opening a page still preserves a personal saved character. User-created gear sets are
not intercepted, renamed or deleted, even if their name resembles a reviewed preset.
Unknown starter presets keep the engine's behaviour; they are not presented as reviewed
results. Provisional proc consent remains explicit and is never enabled by a preset.

No immutable engine, item restriction, validation score or numerical request was changed.
The fix is in the host interaction layer. The initial default loadouts remain unchanged.

Regression checks:

```sh
pnpm --filter @wow-trader/web exec vitest run src/lib/forever-simulator-frame-navigation.test.ts src/lib/forever-simulator-build-selection.test.ts src/lib/forever-simulator-frame-controls.test.ts
SIMULATOR_TEST_URL=http://127.0.0.1:3334/tools \
  SIMULATOR_PRESET_REPORT=/tmp/preset-switching.json \
  node scripts/smoke-simulator-preset-switching.mjs
```

The browser sweep uses isolated characters. It tests fresh defaults for every character
profile, then deliberately replaces professions with Mining and Skinning before selecting
every measured standard build through both embedded controls, at desktop and mobile
widths. Each selected character must match the full reviewed protobuf state. Desktop
cases execute actual 25-fight simulations and reject visible validation notices; mobile
cases check full-state restoration. These are functional smoke fights, not new optimization
or independent validation evidence. Use the immutable artifacts matching the committed
public tier-list snapshot; do not substitute a newer local publication during a rollout.
