# Forever leveling browser test deployment — October 19, 2026

Status: deployed for browser testing. This does not publish the review addon or certify in-game
quest credit, eligibility, timings, inaccessible content or the full Horde campaign.

## Source and runtime identity

| Item                                            | Verified value                                                             |
| ----------------------------------------------- | -------------------------------------------------------------------------- |
| Feature/data commit                             | 5d72d7e5fc8712dcc4ef0745127515358ab31164                                   |
| Deployed application commit                     | 101882ac459de55a7917a70b655d0c62a76964ec                                   |
| Server release                                  | /home/wow-trader-system/releases/kfc-helper-leveling-test-20261019-101882a |
| Next build ID                                   | i8egrPy3Df1Z04Js4--jB                                                      |
| Immediate rollback release                      | /home/wow-trader-system/releases/kfc-helper-leveling-test-20261019-5d72d7e |
| Tracked source files verified against Git blobs | 1,086                                                                      |
| Source-file manifest SHA-256                    | fdd47678abd3905d4389d6869eece2288f16cb8dd02203bc2c3fdd11a87ab713           |

Both application commits were pushed before their server builds. The final commit changes only
guide request routing, feedback-origin validation and tests. Its package inputs are byte-identical
to the feature commit, so the validated package build artifacts were reused; Next was rebuilt on
the server from the final pushed source. No uncommitted source overlay was applied to the server.
A documentation-only follow-up does not change the deployed application revision.

Local main was fast-forwarded without stashing, resetting or discarding unrelated changes.
Overlapping local files were backed up and their bytes checked after synchronization: 86 files
for the feature update and five for the request-routing update. The temporary backups are
/tmp/wow-trader-preserve-before-ff-iQZKUO and /tmp/wow-trader-preserve-before-ff-2S9ctt.

## Published quest data

The existing publisher checked all 353 captured quest/reference pairs, updated 76 XP records and
held none. Quest 3343 remains the reviewed unavailable page, not an invented zero reward or proof
that it does not exist in game. No new Wowhead requests or crawler/profile/pacing changes were made.

The live feed has 1,652 identities: 1,505 available, 147 unknown and zero conflicts. Its complete
record array is identical to the locally audited snapshot, covering all 1,161 real hand-in IDs in
the supported 33-edition matrix. The unknown rows are outside those hand-ins.

- Live XP index file SHA-256: c1575845706be535c73c760e2ca2f5312cf1ea406c6f2909674cf56fc1c0990e.
- Shared audited/live record-array SHA-256: fc3bc41392c2870cebbd20e68f5aeaf196c21dc5e187ab5664555483b29de960.
- The index file hash differs from the local receipt only because publication timestamps differ;
  record identities, content hashes, capture times and ordering match.
- Publication receipt:
  /home/wow-trader-system/shared/leveling/quest-completion-20261019-5d72d7e/publication-receipt.json.

The previously unset WOW_TRADER_REFERENCE_DIRECTORY is now explicitly configured to
/home/wow-trader-reference-worker/shared/published in the existing private web environment.
The Human/Warrior browser response contains 892 published reward facts, zero historical fallbacks
and no missing-client or unconfigured-XP notice. These are active reward facts, not a claim that
this edition has 892 distinct hand-ins.

The follow-up fixes route reward-preview and feedback requests under /tools. Feedback accepts the
exact canonical KFC origin while retaining the configured legacy origin, rejects lookalikes and
cross-site requests, and validates reports before storage. Missing item stats return a structured
JSON error; no replacement stats are fabricated. The no-JavaScript preview link also uses /tools.

## Verification and operational boundary

Passed on the release scope: 311 leveling tests, 551 web tests, 16 world-data tests and 22 pipeline
tests; strict typechecks, lint, formatting checks, package builds and the production Next build.
Earlier local receipts include unrelated workspace work and therefore different web-test counts.

Candidate checks covered 1440px/390px controls, four default slots, level changes, slot skipping,
dungeon exclusion/restoration, save/reload, party identity and isolation from actual XP/quest state.
Public checks covered both widths, fresh local saving, bundle defaults, no page errors or horizontal
guide overflow, and actually clicking Load build in the Warrior simulator with the engine ready
and the loading notice gone. Mobile simulation controls can be inside a collapsed panel; a hidden
desktop Simulate button is not itself evidence that the engine failed to load.

Public asset checks passed for five pages and 55 assets: the guild homepage, Tools, Forever,
leveling and Warrior simulator. The legacy Helper guide URL retains its one-to-one 301 redirect.
The Discord site returned HTTP 200. Simulator model/presentation identities remain unchanged,
with all 2,591 items and nine reviewed builds across three profiles retained.

Only kfc-helper-web was restarted. Ingestion, the guild website, Discord website and reference
publisher retained their PIDs and online states. No database migration, Nginx change, media deletion,
game-file installation or public addon ZIP activation was performed.

The server release's source-deployment.json and source-files-verified.json retain machine-readable
identity and verification receipts. Runtime rollback metadata is under
/home/wow-trader-system/shared/leveling/web-test-20261019-101882a.
Temporary candidates and their private environment copies are removed after verification; the
active shared environment, valid quest feed and previous immutable release remain available.

## Test and remaining evidence

Open the [Human/Warrior test guide](https://kfcguild.online/tools/forever/leveling/premade?race=human&class=warrior)
or the [leveling setup](https://kfcguild.online/tools/forever/leveling). Refresh an already-open tab;
do not clear saved progress.

Review.3 remains the [separate in-game review package](forever-leveling-addon-review.md).
Fourteen source disagreements and three manual source checks remain explicit, and no real
quest-validation recording was approved by this deployment. Unidentified dungeon quest slots stay
labeled planning estimates; the full Horde itinerary and measured-route certification are not
claimed complete.

## Immediate web rollback

Run only while the active release is the one identified above. This restores the previous web
release and only the two changed public settings; it does not print credentials, rewind the valid
quest feed, reset player saves, touch ingestion or replace media.

The previous release was verified before activation. A forced rollback was not performed after
the successful final activation.

```sh
ssh root@89.167.46.193 bash -s <<'REMOTE'
set -euo pipefail
node --input-type=module <<'JS'
import { readFileSync, writeFileSync, renameSync, realpathSync } from "node:fs";
const root = "/home/wow-trader-system";
const release = root + "/releases/kfc-helper-leveling-test-20261019-101882a";
if (realpathSync(root + "/current") !== release) throw Error("Another release is active");
const before = JSON.parse(readFileSync(
  root + "/shared/leveling/web-test-20261019-101882a/web-public-env-before.json", "utf8",
));
const file = root + "/shared/env/web.env";
let raw = readFileSync(file, "utf8");
for (const [key, line] of Object.entries(before)) {
  const pattern = new RegExp("^" + key + "=.*$", "m");
  raw = line === null
    ? raw.replace(new RegExp("^" + key + "=.*\\n?", "m"), "")
    : pattern.test(raw) ? raw.replace(pattern, () => line) : raw + "\n" + line + "\n";
}
const temporary = file + ".rollback-leveling-101882a";
writeFileSync(temporary, raw, { flag: "wx", mode: 0o600 });
renameSync(temporary, file);
JS
ln -sfn /home/wow-trader-system/releases/kfc-helper-leveling-test-20261019-5d72d7e /home/wow-trader-system/current
WOW_TRADER_ENV_FILE=/home/wow-trader-system/shared/env/web.env pm2 restart kfc-helper-web --update-env
pm2 save
curl --fail --silent http://127.0.0.1:19210/tools/api/v1/data-status
REMOTE
```
