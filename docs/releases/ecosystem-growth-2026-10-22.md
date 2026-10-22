# Scoped Growth Release

The owner approved the October 22 growth package, excluding concurrent simulator,
RestedXP and crawler work. The implementation already exists in upstream commits
`2489a71` and `4babc67`, which also contain unrelated changes.

The manifest below now describes a historical staging candidate, not an activation
target. A concurrent authorized release changed production while it was being
checked; the compare-and-swap guard stopped before any write. The older candidate
was never activated. Release sessions coordinated around the newer `4df02e9`
release, which retains the complete growth package and its final hardening.
Consult the running release's `source-deployment.json` and the KFC ecosystem
receipt before any later deployment; do not replace newer work with this old base.

For reproducibility, `ecosystem-growth-2026-10-22.json` pins the deployed production
base, the exact source commit, and 47 approved file hashes. Export the base commit,
then overlay only those listed files from the pinned source. Verify every hash
before building. This is intentionally not an export of the latest main tree.

The package covers quest discovery, contextual group hosting, local watchlists,
talent feeds and optional anonymous action measurement. No package, database or
reviewed simulator selection changes are required. Tool-action collection remains
disabled in production. The completion bridge was exercised with a separately
built immutable local candidate, not by changing the reviewed engine pointer.

Keep the existing public build, shared data, ingest process and worker definitions
unchanged until the candidate passes Linux compilation, asset checks, simulator
selection checks and public-browser smoke tests. Activate only the website and
its matching static-delivery selection. Retain the previous website and static
delivery pointers for rollback.
