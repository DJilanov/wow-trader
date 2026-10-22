# Leveling reader: stable chapter browsing

Status: implemented and verified locally on 22 October 2026. Not committed, pushed or deployed
by this task. No production service or reference dataset was changed.

## Report and cause

The reported [Loch Modan source chapter](https://kfcguild.online/tools/forever/leveling/routes/alliance-human/chapters/chapter-117-11-13-loch-modan?edition=source#guide-source-step-0020)
defaulted to **Current + next**. A fresh live browser showed only steps 20 and 21 in the main
list; selecting step 21 replaced them with steps 21 and 22. This was a display reflow, not a
quest-title click marking a task complete. **All steps** immediately restored the full eligible
list on the existing live site.

The shared workspace also scrolled back to the selected task on every window resize. That
prevents stable browsing away from the selected task and can interfere with mobile viewport
changes. Neither scrolling nor resizing should be a request to resume a task.

## Changed behavior

- **All steps** is the default and the first reading-mode control. Absent, corrupt or invalid
  display preferences also use the full list.
- An explicitly saved **Current + next** preference remains respected. Existing users can
  choose **All steps** to persist the full-list setting; no character/storage migration is needed.
- Selecting a card changes its highlight, map and reading bookmark, without hiding surrounding
  tasks in All steps or completing any quest. Mouse-wheel and keyboard browsing do not change
  the selection.
- Resize no longer scrolls back to the selected quest. Explicit Previous, Next, Done, Undo,
  map reveals and deep links retain their deliberate navigation behavior.
- Optional focus mode aligns the card just selected after the preceding card disappears, so
  reflow does not leave the viewport displaying the following instruction instead. Pending
  explicit map/line jumps take precedence over that alignment.

The changes are limited to `leveling-reader-workspace.tsx`, reader preferences and their tests.
The new `scripts/check-leveling-reader-browsing.mjs` is a reusable browser regression check.
Quest eligibility, source order, progress semantics, XP forecasts, saved characters and reference
publication controls are unchanged. No dependency or schema change is required.

## Verification

- **152 leveling web tests passed** across 27 files with one worker, including 13 focused
  reader-preference/navigation tests.
- Browser acceptance passed at **1440, 390 and 320 px** on the exact reported chapter: full list
  by default, wheel/PageDown scrolling, stable card selection, unchanged gameplay data while
  browsing, no resize snap, opt-in focus alignment, preference/reload persistence, explicit
  Next versus Done, Undo and no horizontal overflow. No browser page errors were observed.
- Receipt/screenshots: local temporary directory
  `/var/folders/xw/7z04bfmn5cv5hl86pp_4dtnw0000gp/T/wow-trader-reader-browsing-BqPvkJ`.
  The desktop/mobile reader screenshots were visually reviewed.
- Focused application/script lint, scoped formatting and strict web typecheck passed.
  No optimized production build or deployment was performed.
- The isolated local preview did not have extracted zone-map media configured and displayed
  the existing map-unavailable fallback. These browser checks verify quest-list behavior, not
  map rendering or map-point jumps; the explicit reveal path was preserved in the code review.

A test command initially selected the entire web suite instead of just reader tests. That run
finished with **1,144 passing and 33 failing tests**, across 116 passing / 14 failing files;
the failures were simulator test timeouts under default parallel execution. It is not a passing
full-suite result. One affected Mage legacy-approval case passed when rerun alone with one
worker and its unchanged timeout; the other simulator cases were not individually rerun.
No simulator code, assertion or timeout was changed by this reader fix.

Re-run the targeted browser check against an isolated local preview:

```sh
LEVELING_TEST_HELPER=http://127.0.0.1:3332 \
  node scripts/check-leveling-reader-browsing.mjs \
  --playwright-package=.cache/forever-sim-upstream/package.json
```

Use an installed Playwright package location if the local cache is unavailable. The check
refuses non-local targets and uses synthetic browser storage, not a real user's saved character.
The owned port-3332 preview was stopped after verification; the existing port-3017 server was
left untouched.
