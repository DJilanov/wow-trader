# Simulator source deployment

Simulator runtime changes follow **commit → push → build that commit → candidate checks → activate → public smoke**.
Do not deploy a copied working tree or only copy compiled web files. Generated immutable simulator
models and private review evidence are managed data, separate from the committed application source.

An October 19 deployment based on stale application source removed the compatible model reader.
The selected corrected model and all its data remained intact, but approved builds disappeared,
the old engine was selected and requests for the new database returned HTTP 500. A healthy process
or HTTP 200 simulator page alone did not detect this regression.

This server's environment caps runtime Node heaps at 768 MB. Use a build-only override such as
`NODE_OPTIONS=--max-old-space-size=3072` for compilation/type checking; keep the live runtime
limit unchanged. Do not skip checks to fit the smaller runtime heap.

## Release checks

1. Commit the complete reader, manifest schema, navigation changes and their tests. Push the commit.
2. Export that exact pushed commit into a **new** server release directory. Install dependencies
   using its lockfile and build workspace dependencies before the web application. Never build in
   the active release directory. Record the source commit in the release metadata.
3. Preserve the shared simulator directory and its selection pointers. Do not replace them with
   historical `active.json` or the developer's unapproved selection.
4. Start the new standalone application on an unused loopback port with the production environment
   and the existing shared data roots. Copy its own `.next/static` and `public` into its standalone
   tree, including the current `/tools` artwork fixes.
5. Run the committed gate against the **candidate**, using the production shared data:

   ```sh
   node scripts/verify-simulator-deployment.mjs \
     --base-url=http://127.0.0.1:19212/tools \
     --artifact-root=/home/wow-trader-system/shared/forever-simulator
   ```

   It requires the exact selected iframe, every approved Build library option, a checksum-matching
   database with all items retained and zero item weapon skill, hidden private proofs and stable
   selection pointers. `activate-production.sh` requires this gate via
   `WOW_TRADER_CANDIDATE_URL` when a model update is selected. No assertion is bypassed to deploy.

6. Run real desktop/mobile browser checks: full-share imports, class URL navigation, saved build
   preservation, Arms and two-hand simulation, Stop/retry, global scrolling and logo loading.
   Pin `SIMULATOR_PRESET_SAFETY_RELEASE` to the **server's** selected release when local research
   has a newer selection that is not yet being published.
7. Confirm the current-release symlink has not changed during staging. Switch only after the
   checks pass, restart only Helper web, rerun the gate and browser smoke publicly, and record the
   deployed source commit. Do not restart ingestion, crawlers or the guild service for this change.

Rollback restores the previous source symlink and restarts Helper web. Keep shared reviewed models
and saved characters intact. Do not roll back to an application version that cannot parse the selected
model manifest; rerun the same gate against any rollback candidate.
