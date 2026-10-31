# Trader accounts, whole-stack plans and private records

## Access and ownership

The public market remains available at `/tools/forever/trader?mode=items` and its
TBC equivalent. Personal account settings live at `/tools/forever/trader/account`;
shared-budget suggestions live at each product's `/trader/plan`.

Companion 0.3.7 connects through Discord browser approval. A ten-minute code must
match the installation being approved. Approval never happens merely by opening
a link. The device receives a random credential once, stores it through the OS's
encrypted storage, and sends it only in authorization headers. The database holds
its SHA-256 hash. Five active installations are supported per account; revoke an
installation on the account page or disconnect it in Companion.

Character uploads are associated with the authenticated installation by the API,
not by an owner field supplied in a scan. Existing anonymous maintainer uploads
are not retroactively claimed. After connecting, open each character's professions
and `/reload` to create a new owned snapshot. Public prices are shared; character
inventory, known recipes, receipts and watches are scoped to the Discord owner.
Revoking an installation prevents future access but retains historical records.
Account responses are not cached. Browser mutations require the canonical Origin
and an account fingerprint, preventing a queued edit from reaching another login.

Migration `0023_trader_account_and_auction_lots` is additive and retains existing
maintainer-token ingestion. It adds exact lot evidence and private account tables.
The web database role needs CRUD on the six new Trader tables; ingest needs
SELECT on `trader_installation` for authentication and the existing upload grants.

## Market readiness and executable purchases

Six independent half-hour observations in seven days, an accepted complete scan,
a known AH cut and a scan under one hour old are prerequisites for buying advice.
The interface separates stale scans, missing history, missing exact stacks and
limits that exclude otherwise available items. View all item prices remains an
inspection path even when no purchase qualifies.

Collector 0.14.0 preserves each auction's stack size, exact total buyout and count.
A bounded quantity optimizer chooses whole auctions under the budget. Fractional
unit-price rounding cannot alter the actual purchase total. Old snapshots without
stack evidence remain usable for price history but cannot invent an executable
stack purchase. Large unsupported books are excluded from executable advice.

## One shared budget

The suggested plan compares qualified flips and known, eligible character recipes.
It shares one upfront gold budget, actual auction stock and fresh observed inventory
across all actions. Future resale proceeds never fund later steps. Partial purchased
stacks remain available to later actions, while each whole auction is charged once.
Owned materials carry their after-fee resale opportunity value rather than being
counted as free. Inventory older than one hour or from another build/market is excluded.
Daily-cooldown recipes are excluded, including intermediate production steps.

Crafting still requires the exact published catalog and observed profession/recipe
eligibility. The current bounded planner considers up to 100 qualified buys and 100
ranked craft candidates, compares profit/return orderings, and emits up to 20 actions.
It is a feasible suggestion, not a proof of a globally optimal portfolio. Output
liquidity caps are shared across recipes. Resale, proc yields and unobserved deposits
remain conditional; confirm auctions and character stock before acting.

## Watches and alerts

Guests keep their existing browser watchlist. Signed-in users have up to 50 private
synced watches, with optional maximum unit buy price, minimum total profit, maximum
quantity and alert interval. Browser watches can be imported explicitly; existing
server preferences win for matching items. Bulk clear is atomic; writes serialize
so delayed responses cannot restore removed items.

Companion refreshes account preferences at least once per minute while watching,
including unchanged SavedVariables files. It writes `AccountData.lua` atomically
without credentials. `/reload` loads that file in WoW. The addon applies the same
history, freshness, whole-stack and fee policy, followed by personal limits and
per-market alert cooldowns. Alerts do not automate purchases.

## Supported actual receipts

Trade receipt collection is off by default. Enable it in the addon panel, choose
the actual AH scope, then collect completed buyer/seller mail normally. The collector
observes successful supported invoice collections and exact quantities/money/fees;
it never clicks or invokes protected mail actions. Pending invoices, secret values,
missing quantities, mismatched totals, failed collections and ambiguous overlapping
collections do not become trades. Unsupported cases stay unrecorded rather than
being estimated. Expiry/deposit losses can be entered manually.

Mailbox observations and manual records remain distinct. FIFO purchase matching
is partitioned by product, build, market, character and item. Missing purchase
costs, unknown fees and unknown expiry deposits are explicit. The displayed margin
covers only matched sales with known fees, less recorded expiry/cancellation losses;
it is not a complete profit claim. Mail collection time is not auction sale time.
Disappeared public listings never count as confirmed sales or demand.

Invalid private records cannot block valid market uploads. Private sync errors stay
visible, acknowledgement IDs persist across restart, and retries do not duplicate
records or resurrect acknowledged watches. Disconnect clears generated private
preferences; addon updates preserve both generated data files.

## Signing without full Xcode

This Mac already has Apple's Command Line Tools, including `codesign`, `notarytool`
and `stapler`. Full Xcode is unnecessary. Publisher signing requires a Developer ID
Application certificate in Keychain and an Apple notarization credential profile.
Create the profile interactively with `xcrun notarytool store-credentials wow-trader`;
never put passwords or private keys in repository files or chat.

Set the non-secret selectors `WOW_TRADER_MAC_SIGN_IDENTITY` (the Keychain Developer
ID Application identity) and `WOW_TRADER_NOTARY_PROFILE=wow-trader` when packaging.
Both are required together. Forge signs and notarizes through Keychain. Packaged
apps and mounted release DMGs must pass strict signature, stapled ticket and
Gatekeeper checks before their manifest can claim publisher signing. With no
certificate, macOS packaging uses an ad-hoc integrity signature and the release
remains accurately labelled alpha, without publisher-signing claims.

On a Windows signing runner, `WOW_TRADER_WINDOWS_CERT_SHA1` selects an installed
certificate/store-backed key; optional `WOW_TRADER_SIGNTOOL_PATH` locates SignTool.
No private-key export or certificate password is stored. SHA-256 Authenticode and
timestamping are configured; packaging never silently falls back after a signing
failure. Release preparation verifies the extracted executable's certificate and
signature. Windows signing requires its own identity and Windows runner. Linux
ZIPs retain per-artifact SHA-256 without claiming a platform publisher signature.

Companion checks the trusted release manifest and selects the correct architecture.
Updates are explicit downloads with version, SHA-256 and signing status; an unsigned
alpha is never silently installed. Every asset ID includes its release version.

## Validation and delivery state

Evidence is stored under `artifacts/trader-ecosystem-20261031/`. Focused checks cover
stack budgets, FIFO cost conservation, unknown fees, shared-stock conservation,
output caps, account ownership/CSRF, watch ordering, sync acknowledgement/restart,
failed private data isolation, pairing URL trust and optional signing configuration.

Delivery remains in progress until the isolated PostgreSQL and browser checks,
four-platform packaging, local installation and public deployment are verified.
