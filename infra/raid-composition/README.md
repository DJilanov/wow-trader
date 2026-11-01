# Raid-manager composition overlay

`discord-manager.patch` contains only the reviewed composition changes for the
existing Discord raid manager. Its baseline implementation is deployed but is
still untracked in the sibling checkout. Committing that entire checkout would
also capture unrelated work. This overlay keeps the composition release scoped
and records its source in the same pushed commit as the Helper planner.

`discord-manager.json` pins the baseline release, patch SHA-256 and each affected
file's before/after SHA-256. Apply it only to a new isolated copy of that exact
baseline, after checking every before hash and confirming new files are absent.
Check the resulting after hashes before building and again before activation.
Do not apply the patch directly to the live release or the shared development
checkout. Normal rollback activates the prior application build; no database
migration or worker restart is required.

The generated support registry in the patch must match
`scripts/sync-raid-composition-rules.mjs` and the canonical JSON registry. The patch
does not contain the concurrent signup class/spec editor or other unrelated work.
Once the raid-manager baseline is committed normally, migrate these changes into
its source and retire the pinned overlay through a separate reviewed release.
