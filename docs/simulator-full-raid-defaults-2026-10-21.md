# Full raid-support defaults — October 21, 2026

Status: deployed and publicly verified, October21 05:50UTC.

The owner's default scenario is the raid-supported happy path, not an unbuffed or
five-player-only character. `infra/simulator/raid-buff-defaults.v2.json` is the
versioned shared contract for every individual DPS, healer and tank workspace.

## Default support

- Moonkin Aura, Leader of the Pack, Trueshot Aura and Windfury.
- Improved Strength of Earth, Grace of Air, Mana Spring and Battle Shout settings.
- Arcane Brilliance, Divine Spirit, improved Gift of the Wild and Fortitude, Blood Pact.
- Individual Blessing of Kings, improved Might and improved Wisdom. These belong in
  `player.buffs`, not `raidBuffs`; putting Kings in the latter does nothing.
- Supported improved defensive/reflective auras and standard resistance coverage.

Windfury and Flametongue remain mutually exclusive. Grace of Air is compatible with
Windfury. The engine resolves overlapping buffs; selecting full support must not add
duplicate copies. Do not impose a 16-buff limit on the player. The owner's 16-slot limit
concerns boss debuffs, which this defaults adapter does not modify or newly enforce.

World buffs remain separate: the current Forever raid model ignores them. Removed
talents/abilities such as Sanctity Aura are not invented. Assigned Power Infusion,
Innervate and Mana Tide counts retain their existing settings, rather than assuming an
unbounded number of external providers. Consumables, encounter, gear, talents, rotation,
race and faction are unchanged.

The Forever engine intentionally ignores some old Vanilla improvement multipliers and
folds some improvements into base values. `TristateEffectImproved` is the strongest UI
selection, not permission to add an extra unsupported multiplier to those values.
For example, the current model resets Strength/Grace multipliers to 1 in Forever.
Changing that numerical behavior requires separate current-client evidence and a new
authenticated engine release, not an edit to a frozen model.

## Saved characters and historical evidence

`raidDefaults=full-v2` versions the adapted engine HTML and its ETag. The original
immutable release files are untouched. Existing current characters migrate once even
when the old `core-v1` marker is present. Subsequent manual opt-outs, named saved builds
and full settings/share imports are preserved. Selecting a preset or race through a
query is not a full settings import and must not skip this migration.

Historical Load build imports remain the exact measured settings. Their existing DPS
values are not relabelled as full-v2 results. New numerical runs must read the new JSON
contract, apply the raid/party/individual sections to the corresponding protobuf owners,
and pin both the contract and exact resulting request. They need new controls,
qualification and browser parity before publishing updated reference DPS. Do not edit
old `raid-core-buffs-v1.mjs`, completed studies, source hashes or cached requests to
pretend those runs used full-v2.

## Verification and deployment

Run the raid-default, frame-navigation, readiness and asset-service tests; then run
`scripts/smoke-simulator-raid-defaults.mjs` against the candidate and public Helper mount.
The browser sweep covers all 15 individual profiles at desktop/mobile widths, visible
presets, reloads, regular-to-improved/Kings migration, later opt-outs and historical
benchmark preservation. Short combat smoke tests are functional checks, not fresh BiS
qualification.

Use commit → push → committed-source Linux build → isolated candidate verification →
Helper-web-only activation → public verification. Reuse the authenticated immutable
simulator artifact root; no database migration or numerical model rebuild is needed.
Record actual source/build identities and a guarded rollback receipt after activation.

## Verified production receipt

Application commit: `02ace4654afda36d418b89e1a8d5bc63db0ab836`.
Next build: `yWC11NQoY8J_92V-Fny0U`.
Source: `/home/wow-trader-system/releases/kfc-helper-full-raid-defaults-20261021-02ace46`.
The existing `hunter-raid-20261020-c8265bc` simulator artifact root is reused unchanged.
Receipts are under `shared/backups/full-raid-defaults-20261021-02ace46` on the server and
`artifacts/forever-simulator/optimization/full-raid-defaults-deployment-20261021-02ace46`
locally.

All865 web tests pass with2workers, as do49 focused regressions, lint/format, typecheck,
Linux dependency/production builds and11 deployment-gate tests. All1266 committed source
blobs and28186 simulator asset checksums pass. Candidate and public each pass30 desktop/
mobile cases,58 preset selections and8 genuine25-fight combat runs. Their actual check
arrays, buff settings and same-seed results match exactly (`verified.json`). These smoke
fights do not qualify new BiS references. Guild home, Trader and Leveling return200.

The first public attempts timed out alongside a second controlled Helper-web restart at
05:39:44UTC, after activation. Its caller is not established; no engine exception/OOM was
recorded. Isolated checks and the full repeated sweep passed with PID3786548/restart158
stable. Do not present the failed attempts as passes or claim a proven memory fix. No
memory/watchdog, Nginx, database, worker or numerical-model setting was changed. Protected
guild/ingestion/publisher/update/crawler processes were checked separately. The owned
preview, local dev server, proxy and tunnel have been stopped.

Guarded rollback, only while this exact release remains active:

```sh
ssh root@89.167.46.193 \
  'node /home/wow-trader-system/shared/backups/full-raid-defaults-20261021-02ace46/activate-full-raid-defaults-deployment-v2.mjs --rollback'
```

The controller restores the preceding source and public build label, restarts only Helper
web and checks health. It does not reverse data or saved characters. Stop if a later
deployment has moved production.
