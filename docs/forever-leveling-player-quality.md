# Forever leveling: player-quality improvements

Implemented locally on 2026-10-04. This document does not record a production deployment.

## Player experience

- Continue playing/Resume my route open the exact last reading position, even after Next without
  completing anything. Each character has bookmarks keyed by chapter, guide version and client build.
  URL anchors take precedence over saved bookmarks. A stale bookmark cannot select an excluded step.
  Older saves without bookmarks remain readable; bookmarks never imply quest completion.
- Previous navigates visible applicable steps, without changing progress or wrapping at either end.
  Done completes and advances. Undo Done restores that button's most recent completion to its previous
  pending **or skipped** state and returns to it. Undo is session-local and resets on reload, character
  or release changes. Checkbox-only changes are not silently added to the button's undo history.
- Maps have bounded zoom, drag, keyboard pan, Fit locations, Full zone and optional Auto-fit on step
  changes. Coordinates and client POI outlines remain evidence, not measured quest radii or GPS.
  Selecting a marker reveals the matching instruction/coordinate list; map-only mobile/tablet mode
  switches to the quest list. Missing tiles retain the existing coordinate fallback.
- Chapter Settings offers All steps or Current + next step, plus larger text. Preferences are local
  and independent of progress. Unresolved conditions remain reviewable, not silently completed.
  Imported steps show action labels and NPC/enemy summaries without replacing their source wording.
- The last step offers Review chapter. The handoff lists unfinished non-optional instructions and
  skipped prerequisites; source-linked continuations must match the setup and be published.
  Unknown/missing conditions, self-links and unpublished continuations do not become next-chapter
  recommendations. Ahead/behind opens brackets; group changes edit the character's playstyle.

The Mulgore 6–13, Mage Wetlands→Duskwood Part 2 suffix and Horde Skyborne continuation gaps still
require evidence review. This implementation does not invent missing guides, automatically choose a
level bracket, or claim a playtested, uninterrupted 1–60 route. Dungeon daily cooldown/economy policy
and the independent XP/full-trip calculator are unchanged.

## Private progress backup

Progress backup & restore is available in the setup screen, chapter dashboard and reader settings.
Export is a private JSON download, not a server upload. Import validates the format/schema and size,
previews the number of characters, and requires explicit confirmation.

Merge rules: keep current character settings and active selection; existing saved chapter releases
win **in full**, including the absence of a checkmark after undo. Add missing releases and characters.
Reject conflicting faction/race/class identities or more than ten characters before changing state.
Persistence must succeed before an import is acknowledged. Corrupt files or denied storage leave the
previous save unchanged. Backups include character-local IDs, setup, bookmarks and progress; keep them
private. Version/build records remain distinct, never remapped by ordinal.

New code reads old v1 saves with defaults. Old deployments with a strict v1 parser cannot read the
new bookmark fields: retain an exported backup before rolling back the reader, and restore it using
the updated reader. Do not run old/new versions in tabs concurrently; cross-tab merge is not enabled.

## Durable feedback and moderation

Every instruction offers Report a problem. Categories: location, unavailable quest, confusing
instruction, chapter transition and other. The submitted context contains only chapter/step/version/
build, faction/race/class/level/pace/party/XP setup, a random idempotency UUID and the message. It does
not include a character name, local character ID or completion history. Users are warned not to enter
personal information. Feedback is never automatically applied to route content or coordinates.

`POST /api/v1/leveling-feedback` requires same-origin JSON, caps actual streamed bytes at 8 KiB,
validates the strict report schema and the real published chapter/step/version/build, then saves to
PostgreSQL. It returns received only after insertion or an identical retry. Changed payloads reusing
a UUID get 409; unknown releases get 422; five new reports per daily client bucket per 30 minutes get
429/Retry-After; unavailable storage/evidence gets 503. Clients retain text and retry the same UUID
after unconfirmed requests. Responses expose no database details or submitted context.

Nginx must overwrite `X-Real-IP` and keep the app loopback-only, as in the existing deployment. The
app HMACs this address using the server database configuration plus the UTC day; raw addresses are
not saved. Never put this key or database URL in a browser bundle/log. Anonymous submissions are
untrusted reports, not verified player facts. No public report-list or moderation endpoint exists.

### Database and operator commands

Build `@wow-trader/db` and apply migration `0016_white_runaways.sql` before enabling submissions in a
new deployment. The migration adds only `leveling_feedback`, its uniqueness/check constraints and
two indexes; it does not alter market/catalog data.

```sh
pnpm --filter @wow-trader/db build
pnpm db:migrate
pnpm leveling:feedback --limit 50
pnpm leveling:feedback --status reviewed --limit 50
pnpm leveling:feedback --mark REPORT_UUID reviewed
pnpm leveling:feedback --mark REPORT_UUID resolved
```

Use a protected `DATABASE_URL` for the intended environment. Listing is read-only and bounded;
`--mark` explicitly changes only the named report's review status. No IP/hash fields are printed.
The migration was generated and inspected locally; applying it locally could not be verified because
PostgreSQL on localhost:5432 was stopped. Production has not been migrated for this feature.

## Optional account sync: later, not an invented login

Helper currently has no player authentication/session system. Manual private export/import delivers
cross-device transfer now. Discord sync needs a separately approved implementation:

1. Reuse a server-verified guild/community Discord session; verify identity and membership server-side,
   never trust a browser Discord ID. Establish authenticated Helper sessions with CSRF protection.
2. Keep account progress private and opt-in. Give every character a stable ID and each document a
   revision. Scope every read/write by the authenticated owner; expose export and account-data deletion.
3. Use revision-based compare-and-swap and explicit conflicts, not timestamp-only last-writer-wins.
   Pending/undo needs explicit per-step revisioned states so it cannot be resurrected by an old device.
   Keep guide versions and client builds isolated. A rejected write cannot erase the local save.
4. Test forged ownership, expired sessions, membership loss, parallel devices, offline reconnect,
   storage limits and rollback before publishing. Never upload private local progress automatically.

## Verification

Focused regressions live in `apps/web/src/lib/leveling-player-quality.test.ts` and
`leveling-feedback-route.test.ts`, with transaction/evidence/rate/idempotency mocks in
`leveling-feedback-store.test.ts`; existing navigation/experience/archive/map tests remain in place.
Browser regressions live alongside the existing Helper suites in sibling `discord-website`:
`tests/e2e/leveling-quality.spec.ts`. Run them against a local/staged Helper, not production mutations.
Database failure is a real unavailable state, never a fabricated report success.

Passed strict web/database typechecks and lint, 165 web unit tests, the complete isolated-feature
`pnpm check` (including production build), and all 30 Chrome regressions against the production-mode
build. Screenshot review also led to compact accessible mobile map controls and a minimum visible
map-area regression across portrait/landscape layouts. Real local PostgreSQL integration remains
unverified because the local service is stopped; no production data or process was changed.
