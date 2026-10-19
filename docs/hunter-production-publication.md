# Hunter production publication

Owner authorization: October19,2026 — commit, push and deploy Hunter. The owner separately
approved a disclosed2% retained-contender margin for subsequent practical-pass work.

## Reviewed scope

Ship Beast Mastery only. Numerical source `e14af46d79721e1ad50a6f04`, approved UI
`94239fb7240949919b83f8ad`, browser approval
`6e63226596355ceb80e2592abc2e42352d480ddb4f3c0256d1d396f0a8f5acfd`.
Publication `published-reviews/hunter-2fc8515fa792da25.json`, semantic SHA-256
`2fc8515fa792da25d50e209a7aab3024ef9b122c67c8067a1aa6e4e781efc870`.
One build: `hunter-beast-mastery-static`,863.5544911736677 modeled DPS across two fresh
20,000-fight ranges. This is scenario-specific, not a cross-class ranking or global-optimum proof.

The production reader now preserves the optional reviewed rotation introduction, priorities
and caveats while keeping older guide-less publications compatible. Gear, enchants, talents,
Raptor/ammo/consumes and the approved fresh-character defaults remain byte-pinned to the
existing reviewed UI; no new optimization or engine release is part of this deployment.

Marksmanship's original1% result remains failed and unchanged. Its approved2% policy/delivery
update is still pending. Survival and other unfinished specs are not promoted.

## Rollout and verification

Stage from the current production release plus only the intended simulator source overlay.
Preserve unrelated source and Warrior's existing live presentation/publication entries.
Use internal dependency hardlinks only, never hardlink source or mutable build output.
Verify every immutable Hunter asset against its manifest before activation. Test with isolated
staging pointers before replacing the two public simulator pointers. Retain backups of the
previous pointers, web release and private environment file. Reload `kfc-helper-web` only.

From the prepared local simulator workspace:

```sh
node scripts/prepare-simulator-publication.mjs --profile=hunter --write
SIMULATOR_TEST_URL=http://127.0.0.1:3021/tools SIMULATOR_SMOKE_COMBAT=1 node scripts/smoke-simulator-reviewed-profile.mjs --profile=hunter
SIMULATOR_SMOKE_COMBAT=1 node scripts/smoke-simulator-reviewed-profile.mjs --profile=hunter
```

The staging origin must proxy root `/forever-sim/` requests to `/tools/forever-sim/`, just as
the production Nginx bridge does. Verify desktop/mobile full share imports, reload persistence,
Preset Configurations/Gear Sets, visible exact rotation text, proc consent OFF, no automatic
combat/overflow, hidden private proof and a real25-fight browser run. Those smoke fights are
functional checks, not fresh numerical optimization validation.

Status: preparing the staged release; no successful deployment claimed yet.
