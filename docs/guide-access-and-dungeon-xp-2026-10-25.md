# Guide access and dungeon XP

## Delivery State

Implemented locally. This document is not a production activation, completed OAuth sign-in,
Revolut payment acceptance or in-game addon certification receipt. No live payment has been created.
The existing public web planner and chapter reader remain free. Only the packaged addon ZIP and
RestedXP paste-import documents are access-controlled; free web content is intentionally readable
and this is not DRM against someone authoring their own addon from public instructions.

## Access Rule

Free downloads require Discord role `1411680778185736242` (`KFC Certified`) in guild
`1411533815356194968`. Ordinary Discord membership, server ownership and unrelated roles do not
grant access. The bot verified this exact role against the owner's real Discord account.
Role checks are server-side and uncached on every download, including the documents endpoint.

Supporter access requires a server-created US$9.99 Revolut order associated with the authenticated
Discord ID, provider-confirmed settlement and staff approval. It does not require the certified role.
Returning from checkout, a client-provided Discord ID/price, an OAuth session alone or a pending
payment never grants access. A role removal, explicit revocation, refund or provider verification
failure prevents subsequent downloads. Already downloaded files cannot be recalled.

Helper uses its own Auth.js instance and encrypted HttpOnly session cookie, separate from staff
login and the community site's member login. Discord requests use only `identify`, with PKCE and
state checks. No BattleTag, email, card details or provider tokens are sent to the browser session.
BattleTag input for RestedXP's account-bound codec remains browser-only, as before.

## Deployment Configuration

Use `apps/web/.env.guides.example` for the server-only settings; real credentials belong in the
existing protected environment, never source, chat, screenshots or command arguments. The OAuth
client may be the existing WoWForeverBot application. Use a new, separate `GUIDE_AUTH_SECRET`.
Auth.js is the sole added runtime dependency; `tsx` is a development dependency for the staff CLI.

Register this additional Discord OAuth redirect without removing existing redirects:

`https://kfcguild.online/tools/api/guide-auth/callback/discord`

The browser account page is `/tools/forever/leveling/access`. Local tests need their own matching
loopback `GUIDE_SITE_ORIGIN` and OAuth redirect; production only accepts HTTPS.

Review and apply migration `0020_unique_chronomancer.sql`, which only creates the dedicated
`guide_support_order` table and its constraints/index. Audit existing production migration history
before running the migration tool; do not replay older cleanup migrations. The web database role
needs SELECT on this table, INSERT only for `discord_id`/`environment`, and UPDATE only for
`provider_order_id`/`checkout_url`/`state`; approval/revocation columns remain writable only through
the protected staff database role.
Do not put owner database credentials in the web environment. No production migration has been run
as part of this implementation.

Keep both `LEVELING_GUIDE_DOWNLOADS_ENABLED` and `GUIDE_SUPPORT_PAYMENTS_ENABLED` off until the
actual guide package/client acceptance is complete. The previous confirmed review target remains
build 70450 / RestedXP v4.11.27; the current public catalog build is not proof of an installed-game
acceptance test. Compiler `campaign-addon-20261025-v24` includes the new quest-selection behavior.
Do not relabel historical review ZIPs as a new release.

For a bounded production preview, `GUIDE_DOWNLOAD_PREVIEW_IDS` accepts at most ten comma-separated
Discord user IDs while the global download flag remains off. Preview accounts must still pass the
same certified-role or approved-supporter check. This never enables checkout, grants a role or
opens downloads to other certified members. Clear the allowlist when the preview ends.

For payments, configure dedicated `GUIDE_REVOLUT_API_KEY` and an explicit
`GUIDE_REVOLUT_ENVIRONMENT=sandbox|production`. Credentials are not silently borrowed from Gadatel
or the KFC shop. Checkout follows the existing Gadatel server-created-order pattern, using the
[Revolut hosted checkout API](https://developer.revolut.com/docs/guides/merchant/accept-payments/online-payments/hosted-checkout-page/api)
and pinned Merchant API version 2026-08-17. Fixed price is 999 minor units / USD in both code and DB.
Real provider IDs use GUID-shaped validation, not an assumed RFC UUID version.
Production requests never accept sandbox grants. Sandbox acceptance testing must run in a private
development environment.

Checkout reuses an existing pending order under a per-account PostgreSQL advisory transaction lock;
it never automatically retries an uncertain provider POST. The client can resume checkout without
creating a second payment. New order creation is capped at three per account in 30 minutes. Provider
creation and retrieval validate the local reference, amount, currency and environment-specific HTTPS
checkout host. No payment completion is trusted from redirect parameters or an unsigned webhook.
Verification uses the provider's GET order endpoint, so there is no unauthenticated payment webhook
to configure. Fully settled payments await staff approval; partially refunded payments do not pass.

Complete actual sandbox success/failure/duplicate/return/refund checks before production payment
activation. The companion KFC privacy-page update describes Discord IDs, role checks, order
identifiers, amount/currency, staff approval/revocation audit and browser-only BattleTag handling;
deploy it alongside the feature before taking payments. Revolut hosts card entry. This code has
not performed a real or sandbox card transaction.

## Staff Operations

Run from `apps/web` with the existing protected staff environment loaded; do not put secrets into
the command line. The actor ID and reason form the audit record and should identify the operator.

```sh
pnpm exec tsx scripts/guide-supporter-access.ts --mode list
pnpm exec tsx scripts/guide-supporter-access.ts --mode approve \
  --order ORDER_UUID --actor STAFF_DISCORD_ID --reason "Verified supporter payment"
pnpm exec tsx scripts/guide-supporter-access.ts --mode revoke \
  --order ORDER_UUID --actor STAFF_DISCORD_ID --reason "Supporter access revoked"
```

Approval retrieves the exact Revolut order and refuses pending, unrelated, underpaid, refunded or
wrong-environment payments. Repeated approval/revocation preserves the original audit. Revocation
changes access only; it does not issue a bank refund. Process any refund in Revolut separately.
Order lists are private operational data and must not be posted publicly.

## Dungeon XP Policy

The owner confirmed Gnomeregan is the highest dungeon actually completed. Higher-level dungeon
rewards are planning estimates, not in-game measurements. Use raw table XP × 2.375, rounded in
10-XP steps below 1,000 or 50-XP steps otherwise, with the existing overlevel-reduction model. Never
multiply a scaled page value again; an actual observed reward takes precedence. Earlier dungeon
pages retain their own coefficients, such as Gnomeregan's 1.8 and the Crest's 2.375.

The live captured Crest record was already correct: base 2,600 × 2.375 rounds to 6,200. Gnomeregan's
24.4% was a three-quest speed-core subtotal at level 33, not a whole-clear calculation. Ordinary
collection quests are now selected by default; explicit saved false choices remain false. Separate
preparation exceptions are Destruction in Deadmines (92753), Green Glow (2962), Haze of Evil (4143),
The Love Potion (4201) and Of Love and Family (5848). They remain selectable after their prerequisites
are prepared. Raid-only/deferred rewards, personal/class eligibility and actual quest states remain
separate. No selection records a quest as completed.

Gnomeregan, starting at level 33 / 0 XP, per player and before kills:

| Package                                              | Quests | Quest XP | Level Progress |
| ---------------------------------------------------- | -----: | -------: | -------------: |
| Speed core                                           |      3 |   14,350 |          24.4% |
| Default quest clear                                  |      8 |   39,750 |          67.8% |
| All listed, including separately prepared Green Glow |      9 |   44,150 |          75.3% |

The final figures include explicitly labelled estimates where an unscaled table needs the planning
coefficient. They are not a timed clear, all possible faction/class quests, or earned XP. Kill XP is
additional and unknown where unmeasured. Five players each receive their own quest rewards; never
multiply a player's XP by five. A prepared follow-up is not promised as a first-visit reward.

Both the standalone dungeon planner and the campaign expose quest packages and base/coefficient
breakdowns. Campaign action filtering preserves opt-outs in the browser and addon documents, rather
than merely changing the displayed subtotal. Missing combat now labels the result a partial subtotal.
The guide's raw native/crawled evidence remains unchanged.

The 21-stop report uses 106 existing published quest records and makes no new crawl requests:
`artifacts/leveling/audits/2026-10-25/dungeon-table-xp-audit.json`. Reproduce after rebuilding packages:

```sh
node scripts/audit-dungeon-table-xp.mjs \
  --records artifacts/leveling/audits/2026-10-25/public-dungeon-quest-snapshot.json \
  --output artifacts/leveling/audits/2026-10-25/dungeon-table-xp-audit.json
```

Bundle-only stops retain their independent identity gaps. Unknown XP and unknown pickup/lifecycle
facts stay unknown; coefficient arithmetic does not certify that an unplayed quest is runnable.

## Verification

The complete leveling suite passed 552 tests; the focused access, payment, export, reward-adapter
and XP-presentation checks passed 43 tests. Database/leveling/web typechecks, targeted lint and the
isolated optimized Next build passed. A full source-archive compiler check passed all 28 supported
leader editions and 56 same-edition/independent-starter pairings with the new defaults. This is not
the full 784-pair matrix or an in-game playthrough.

Playwright passed eight boundary/layout checks at 1440, 390 and 320 pixels, including real Auth.js
PKCE/state handoff, denied anonymous ZIP/documents, cross-origin denial, quest-package selection,
saved-selection persistence and screenshots. No actual Discord account was authorized during the
browser test. The expanded XP table was moved outside the scrolling task panel after visual review
to avoid sticky task controls obscuring rows. Browser evidence is under
`artifacts/leveling/audits/2026-10-25/browser/`.

Local preview: `http://127.0.0.1:19440/tools/forever/leveling/access`. Its session secret is generated
in memory, existing OAuth credentials are passed only to the loopback process, and payments are
disabled. Register the corresponding loopback callback for a real local Discord account test.
The preview uses the separately identified archived world snapshot, not a claim of current live
client compatibility. The production PostgreSQL migration, real OAuth callback and sandbox/real
card payment remain unverified; local PostgreSQL was unavailable. No deployment, commit or push
has been performed for this change.
The companion KFC privacy-page regression test and targeted lint also passed.
