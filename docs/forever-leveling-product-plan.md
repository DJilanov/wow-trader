# WoW Forever leveling: browser guide, RestedXP edition and implementation plan

Status: first free browser route and calculation engine implemented and deployed as a preview. Updated October 4, 2026. Live route/addon validation and payment activation remain pending.

The next dungeon-preparation, chain-state, reward-choice and marginal/full-trip comparison phase is
specified in [the dungeon integration plan](forever-leveling-dungeon-integration-plan.md).
It is researched, not implemented; the deployed reader-quality release is recorded separately.

## Revised product direction: dedicated Forever Leveling

The owner's October 4 feedback supersedes the original Encyclopedia-first placement and
calculator-first entry flow. **Forever Leveling** is now live as a primary navigation product at
`/forever/leveling`: faction → race → Speed / Chill / Group → compatible small level brackets →
current ordered quest list. Keep pace separate from party size/readiness. Preserve current lists
before the later mode-specific route refactor; do not assume a premade removes travel or permits
ignoring quest requirements.

The inspected evidence, proposed screen hierarchy, catalog adapter, state/URL migration and
verification gates and implementation handoff are in `forever-leveling-experience-plan.md`.
This UX revision is deployed. The legacy Encyclopedia URLs documented below redirect to the new
dashboard/reader and explicitly preserve old saves. Release/rollback: `forever-leveling-release-2026-10-04.md`.

The owner subsequently confirmed redistribution authorization. The published implementation includes
all 157 decoded guide variants (22,604 source steps, 2,394 quest IDs), with readable chapters through
60 for all faction/race choices. Conditions, source controls, unresolved continuations and the beta
cap remain explicit. See `forever-leveling-archive.md` for the importer, safety boundaries and deployment
handoff. This does not extend the original Westfall calculator, supporter addon or playtested coverage.

## First slice implementation and dungeon timing

The first original release is Alliance Westfall 13–15, version `0.1.0`, authored in
`packages/leveling`. Browser pages, quest definitions, prerequisite checks and the RestedXP compiler
share that model. It is class-neutral quest/travel guidance, not a class-specific leveling simulator
or a full 1–60 guide. That original release does not include the decoded RestedXP collection;
the separate authorized local archive described above now powers the extended readers.

The owner's dungeon timing instruction uses the linked Wowhead guide's **At level** band as the
default visit target, independently of its Hard/Medium bands or minimum quest pickup level:

```text
plannedVisitLevel = max(At level, minimum pickup levels of selected unfinished quests)
```

Hall of Thanes defaults to 14 with Important Heirlooms and An Ancient Grudge. Selecting The Restless
Dead or Old Ironforge Incursion moves the bundle to 15; Treaty moves it to 16, outside this slice.
Deadmines is a later level-19 comparison, not an immediate level-13 replacement. Its preparation
remains available in Westfall. These targets are reference recommendations, not hard entry locks or
proof of optimal XP/hour; current pickups still require a beta check.

Before entry, only retained XP already earned by then counts. Dungeon rewards and post-visit catch-up
cannot unlock that earlier checkpoint. After the return, the calculator includes retained work,
additional rewards and explicitly timed catch-up before checking continuation. It excludes completed
rewards, subtracts rewards already in the original plan, groups shared XP once, checks preparation,
and includes travel in both directions. Blank rewards remain unknown and cannot produce an applyable
recommendation. A visit beyond level 15 can be compared but not applied to this browser slice.

The directory publishes fourteen early/midgame difficulty profiles through Uldaman, with beta-cap
warnings and explicit unauthored-route labels. Only Hall of Thanes and Deadmines have a selectable
quest bundle in the first calculator. Do not present other reference rows as implemented routes.

### Current evidence and developer operations

- `leveling-evidence` in the existing .NET extractor opens current Classic Beta CASC and extracts
  `QuestV2`, `QuestXP`, and `gametables/xp.txt`. Reports pin build, definitions, hotfix and curve hashes.
- The reviewed extraction is build **70205**, definitions
  `3e46d21a41a07ce7e63835fd79c561e0d5dce92b`, hotfix
  `513d4ee593b2b2d9d24819288b5316383ece102cef988a64a3978f21c65fef4b` and curve hash
  `935253a23756f0ab7a760e8e4ab22184e1aca49285944ea68efc0a8820e459e6`.
- The Total column supplies the level curve: 13→14 is 11,400 XP, 14→15 is 12,900 XP. These client
  values are **not runtime-confirmed**. Quest identity/difficulty tables do not bind each quest's
  individual reward or true prerequisite chain. The browser therefore asks for actual current XP.
- Wowhead's October 2 pickup references override the installed Journal's earlier conflicting Hall
  levels for conservative scheduling, with the discrepancy disclosed. Prerequisite chain facts are
  separate reviewed reference data; none are inferred merely from ordered catalog rows.
- `pnpm leveling:addon` generates a deterministic maintainer ZIP and hash manifest under
  `artifacts/leveling/0.1.0/`. It requires the local `zip` executable. The compiler verifies quest
  action order, emits objective indexes required by the installed loader, and registers a separate
  KFC group against RestedXP v4.11.14 on build 70205. It does not modify the installed addon.
- After manual installation, `/kfcguide xp` records `UnitXPMax`; `/kfcguide observe` records up to
  100 quest turn-ins until reload, and `/kfcguide stop` unregisters collection. These are explicit
  observations, not scans. Secret values are rejected before comparison; saved state is validated.
  `/reload` writes the normal SavedVariables file. Observer mock tests are in
  `apps/addon/KFCForeverGuides/Observer.test.lua`; they are not a live WoW compatibility claim.
- Browser planning choices are schema/version-checked, saved locally and shareable in a URL without
  character identity. The ordered selected branch appears only after a positive, eligible comparison.
  The addon preview packages the default level-14 bundle; custom browser selections do not silently
  change an installed addon. Horde/later-zone coverage and checkout remain visibly unavailable.

Next release gates: verify the runtime curve and reward observations, play through pickups/objectives/
turn-ins/return on this build, extend the supported route, then implement and test the inspected
Revolut contribution/entitlement flow using supplied protected configuration. No payment endpoint,
database migration or supporter entitlement was added for this first preview.

The public directory/route and community `/addons` link are live. Helper release is
`kfc-helper-leveling-preview-20261004-r1`; community build is `.next-release-leveling-20261004-r1`.
Verification passed: 27 leveling tests, 105 web tests, 312 community tests, typechecks/lint, clean
Linux workspace check/build/formatting, .NET Release build, observer/registration Lua mocks,
nineteen desktop/mobile browser assertions and live metadata/quest-level checks. Maintainer ZIP is
4,999 bytes with matching Mac/Linux SHA-256
`e819d885263e2d9c361ce1af7186f71033b70e92b3a05ff29cb0bc07c6bd9df7`.

## Confirmed product decisions

- Target WoW Forever in the **Classic Beta** installation, with launch-day zone congestion as the
  main problem to solve.
- Publish **Forever Leveling as a primary KFC Helper product** at `/forever/leveling`, with free
  chapter browsing and optional XP/time comparison. The existing live preview remains at
  `/forever/encyclopedia/leveling` until the reviewed navigation/URL migration is implemented.
- Offer an optional **€9.99 contribution supporting the small team and its free community tools**.
  The RestedXP guide is a supporter benefit available after the contribution is confirmed.
- Follow the exact Revolut popup/confirmation flow in
  `/Users/dimitarjilanov/work/vrachka.bg/apps/web/src/features/checkout/checkout-sheet.tsx`.
  The implementation path is confirmed; protected production configuration will be supplied later.
- Use support/donation language in the player interface: **“Support the team · €9.99”**,
  **“Thank you for supporting the tools”** and **“Download your supporter guide.”** Explain the
  €9.99 contribution and guide access together. Browsing the guide and calculator remains free.
  Do not describe the contribution as tax-deductible or imply charitable registration.
- Link from primary Helper navigation, the Forever home screen,
  `https://www.wowforeverdiscord.online/addons` and an Encyclopedia cross-link. Keep the helper's
  current branding and infrastructure.
- Treat 25 minutes per dungeon and a visit every 2–3 levels as hypotheses to test. Recommend a visit
  when its quest rewards, entry requirements and total detour time support it.
- Start route validation with **Alliance Westfall 13–15**, then extend through the current playable
  beta range. Character class remains selectable; a particular class has not been confirmed.

The first public route should state its actual faction, class coverage, level range and tested build.
Do not advertise a short beta dungeon companion as a complete 1–60 guide. Expand coverage in reviewed
releases rather than implying that untested sections already exist. The proposed first supporter release
is the supported Alliance route through the playable beta range, with dungeon alternatives. Horde
routes follow the same validation process before being advertised as supported.

## Existing projects and source findings

| Concern                    | Existing location                                                           | What the implementer should reuse                                                                                     |
| -------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Helper UI and public guide | `/Users/dimitarjilanov/work/test/wow-trader/apps/web`                       | Next.js App Router, Encyclopedia navigation, metadata helpers and KFC design tokens                                   |
| Quest/map reference data   | `apps/web/src/lib/forever-world.ts` and existing Forever data packages      | Build-specific identities and evidence; inspect current query contracts before extending them                         |
| Contribution persistence   | Existing PostgreSQL/Drizzle code in `packages/db`                           | Existing migration, transaction and role conventions                                                                  |
| Community listing          | `/Users/dimitarjilanov/work/test/discord-website`                           | `app/(site)/addons/page.tsx` and `content/community-tools.ts`                                                         |
| RestedXP runtime           | `/Applications/World of Warcraft/_classic_beta_/Interface/AddOns/RXPGuides` | Installed v4.11.14: `GuideLoader.lua`, `functions.lua`, `SettingsPanel.lua`, `DB/forever/db.lua`                      |
| Supplemental dungeon facts | Installed `ForeverDungeonJournal` v1.4.4                                    | Quest identities, pickup/turn-in locations and chain leads; current rewards still require observations                |
| Private analysis           | `/Users/dimitarjilanov/Desktop/restedxp-analysis`                           | Inventory, quest coverage, congestion candidates and math scenarios; keep private source exports out of public assets |
| Payment integration        | `/Users/dimitarjilanov/work/vrachka.bg`                                     | Existing Revolut implementation, order handling, webhook verification and secret configuration                        |

The supplied RestedXP file contains **157 guides**: 98 Alliance and 59 Horde. Its decoded content
matches the installed guide caches. The analysis found 22,604 raw steps, 2,197 dungeon-related steps
and 1,946 XP checks. These counts include alternative faction/race/class branches; they are not the
number of steps a single character will follow.

The import is an account-derived encrypted, compressed guide bundle. A universal download cannot
be made by handing other players that import string. Keep this bundle as a private reference for
analysis and personal comparisons. Public browser text and the supporter artifact should come from
original KFC-authored route data, or separately authorized material with confirmed distribution
rights. Do not publish account cache keys or the private decoded collection.

The current import does not include the Ruins of Lordaeron or Excavation quest entries in the
reviewed supplemental catalog. Hall of Thanes coverage is incomplete. Classic Deadmines routing is
already present, so those existing rewards must not be counted again as a new improvement.

## One route model for browser and addon

Author an original structured route once. Render it into the browser and compile it into the
RestedXP edition. Avoid maintaining separate handwritten routes that drift apart.

Use strict TypeScript and the repository's existing schema validation. Inspect the Forever packages
before choosing the owning module; extend an appropriate existing package or create a focused
leveling package only if it is needed by both the browser and compiler.

The model needs these records:

| Record             | Required fields and relationships                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route release      | Stable ID, version, faction/class/race coverage, level range, client product/build, publication state, evidence date and compatible addon versions       |
| Quest              | ID, title, faction/class/profession restrictions, minimum pickup level, objectives, pickups, turn-ins, required items and availability evidence          |
| Reward observation | Quest ID, XP, character/turn-in level, build, observed date, source and confidence; unknown must remain distinct from zero                               |
| Dependency         | Explicit predecessor ID, relation kind: mandatory prerequisite, breadcrumb, follow-up, mutually exclusive alternative or shared objective                |
| Route step         | Stable ID, action, relevant quests/objectives, position/travel context, conditions, dependencies and shared-objective group                              |
| Outdoor block      | Remaining quest rewards, remaining kill/exploration XP, travel/combat/collection time, congestion assumptions, skip candidates and retained dependencies |
| Dungeon visit      | Entry requirements, selected one-time quests, prerequisite work, pickup/turn-in route, expected kills, time components and rejoin checkpoint             |
| Checkpoint         | Required level/XP, required quest states, travel unlocks and class abilities before a later step or dungeon                                              |
| Artifact manifest  | Route release ID, format, supported build/addon, size, SHA-256, coverage and installation instructions                                                   |

Store source facts separately from planning estimates and player-entered values. Record prerequisite
edges explicitly: an ordered list in an addon catalog is not automatically a mandatory chain.
Some lists include the dungeon quest itself and later follow-ups; those must not become prerequisites.

Build/phase availability is separate from presence in the client or a third-party catalog. Reuse the
Encyclopedia's existing evidence vocabulary instead of inventing a contradictory status system.

## XP and time calculation

Calculate replacement of a remaining outdoor **block**, not each overlapping quest independently.
Count shared kills and travel once. XP already earned and time already spent are sunk values.

```text
omittedXP = remaining outdoor quest rewards + omitted kill/exploration XP

addedXP = newly added dungeon quest rewards
        + additional dungeon kill XP
        + incremental prerequisite/other XP earned by the detour
        - XP already counted for those activities in the retained route

extraDungeonMinutes = clear + extra travel/pickups + idle group wait
                    + extra prerequisite work + extra turn-in travel

shortfallXP = max(0, omittedXP - addedXP)
catchupMinutes = 60 * shortfallXP / achievable alternative XP per hour
savedMinutes = remaining crowded outdoor minutes - extraDungeonMinutes - catchupMinutes
```

Only charge time and add XP that change relative to the retained route. Productive questing while
forming a party is not idle wait. Pickups already on the retained path are not another travel charge.
Include losses from skipping required prerequisite quests, or preserve them and remove them from
the omitted block. Do not count XP from a quest that cannot be completed during this visit.

Validate XP at **every intermediate checkpoint**, including before the dungeon. Obtain the active
Forever level curve from authoritative client/runtime data; do not silently use the Classic curve.
If `N(L)` is XP needed to advance from level L, sum its intervening values and current progress to
test reachability. If the curve or a required reward is unknown, show an incomplete calculation
rather than a confident recommendation.

Support unknown rewards, partial objectives, completed quests, existing dungeon visits, missing
prerequisites, faction/class restrictions, multi-dungeon quests and repeatable rewards. A one-time
quest may contribute only once across the entire plan. A zero catch-up rate is valid only when no
XP shortfall needs catching up. Reject blank, negative or non-finite numerical inputs as appropriate;
blank XP must not silently become zero.

Example scenarios are estimates, clearly labeled:

- 20,000 XP in 90 crowded outdoor minutes versus 20,000 added XP in a 25-minute clear plus 15-minute
  detour saves 50 minutes. Against a 30-minute outdoor block, the same visit costs 10 minutes.
- Alliance Crest of Lordaeron (95189) reportedly awarded **6,200 XP**. This is a player observation,
  not a verified universal current reward. Its full 6,200 XP is added if the quest was absent; its
  improvement over a plan already counting 2,600 XP is 3,600 XP.
- At an assumed alternative rate of 20,000 XP/hour, a 40-minute visit needs more than 13,333.33 added
  XP to improve time. The Crest alone does not establish that the full trip is worthwhile.

Blizzard changed dungeon quest bonus XP and spawn behavior on October 1. Do not apply a blanket
triple multiplier, and do not use RestedXP's global `#xprate` to represent a bonus confined to
dungeon quest rewards. Store real observations with their effective dates instead.

## Free browser experience

The revised main experience is the dedicated Leveling product, with no account or payment needed
to browse. Follow `forever-leveling-experience-plan.md` for the faction/race/style onboarding and
chapter-first reader. The capabilities below remain applicable inside that flow; the calculator
and contribution controls are not the initial screen.

1. **Choose a character and route.** Faction, class, race where needed, level/current XP, already
   completed quests, supported build and route coverage. A shareable URL preserves non-sensitive
   planning choices; browser-local progress can be added using existing app conventions.
2. **Read the ordered leveling route.** Show objectives, pickups, turn-ins, training/travel steps and
   rejoin checkpoints. Mark blocks that may become slow under crowds and explain their alternatives.
3. **Compare a dungeon detour.** Select eligible one-time quests, inspect prerequisites and enter or
   review evidenced XP, clear time, travel, waiting and catch-up rate. Offer quiet/busy/severe crowd
   scenarios as visible assumptions rather than guaranteed measurements.
4. **Review the result.** Show added versus omitted XP, extra time, catch-up work and estimated time
   saved. Explain blocking level/quest requirements and shared objectives. Preserve an incomplete
   state when important data is absent.
5. **Apply the browser branch.** Select the replacement only if the plan remains valid. Show the
   retained prerequisites and exact rejoin point. Keep the original alternative available.
6. **Support the team.** Explain how a **€9.99 contribution** helps maintain the free tools. Show the
   RestedXP supporter guide's version, coverage, compatibility and installation method before
   opening the same-page Revolut popup. Keep the free guide and calculator usable throughout.

Provide loading, empty faction/class coverage, unknown evidence, invalid inputs, unavailable dungeon,
infeasible checkpoint and successful comparison states. Use semantic labels, keyboard controls and
mobile layouts without horizontal overflow. Keep developer details out of the normal player flow.

### First route review: Westfall

These are candidates for observation and dependency review, not six unconditional skips:

| Quest                       | Potential launch-day delay                | Shared work or preservation concern                                                             |
| --------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 64 — The Forgotten Heirloom | Many players converge on one wardrobe     | Check while passing; respawn behavior changed in October 1 notes                                |
| 151 — Poor Old Blanchy      | Eight contested oats objects              | Collect opportunistically on retained travel; update any quest-state branch                     |
| 9 — The Killing Fields      | Tagging twenty Harvest Watchers           | Shares Okra with Westfall Stew and oil with Keeper of the Flame (103)                           |
| 22 — Goretusk Liver Pie     | Repeated kills for eight livers           | Boars also provide snouts for Westfall Stew                                                     |
| 38 — Westfall Stew          | Several ingredient loops and drop targets | Shares birds/boars, Watchers and murlocs; Murloc Gills (92744) contributes to a Deadmines chain |
| 102 — Patrolling Westfall   | Gnoll targets and paw drops               | Include the XP from gnoll kills actually omitted                                                |

Preserve the Defias Brotherhood path 65 → 132 → 135 → 141 → 142 → 155 when counting the final
Deadmines reward (166). Review its relationship to Red Silk Bandanas (214); conservatively retain
Red Leather Bandanas (153) until the active server gate is confirmed.

Destruction in Deadmines (92753) has the Toxic Soil path through 92742, 92744, 92745, 92747, 92748,
92749, 92750, 92751 and 92752. It costs outdoor time. Include it only if its whole contribution is
worthwhile, rather than preserving every long chain merely because it ends in a dungeon.

The analyzed source already disables Harvesting the Harvesters (92909). Do not count that existing
omission as a new improvement. Preserve class training, travel unlocks, and the level checkpoint
before accepting the Defias chain. Before modifying any personal guide, check all accept/complete/
turn-in steps, quest-state conditions, labels, `#requires` and `#completewith` references together.

## RestedXP supporter guide and installer

The supporter edition implements the same reviewed route and dungeon branches in game. The browser's
public content and downloadable artifact must identify the same release and coverage. Contributions
support the team's work across the community tools; browser math and basic route instructions remain
freely available. Guide access is the stated benefit after a confirmed €9.99 contribution.

### Packaging decision

The installed import textbox accepts account-derived encrypted bundles. Plain guide text is not a
drop-in replacement for that encoded input. Do not promise a generic copy/paste import until a
supported custom-guide import/export workflow has been verified.

The recommended first packaging path is a small **KFC guide addon** installed alongside RestedXP:

```text
Interface/AddOns/KFCForeverGuides/
  KFCForeverGuides.toc
  Guides.lua
  README.txt
```

Declare the appropriate Classic Beta interface version and dependency on `RXPGuides`. Register
original guide content through the exposed `RXPGuides.RegisterGuide` API under a separate KFC group.
Confirm lifecycle and version compatibility with the installed loader. Use existing supported
quest/progress directives, faction/class conditions and XP checkpoints; verify exact syntax from
the runtime before emitting it.

The current Forever addon registry lacks several new dungeon tags, and standard dungeon selection
is hidden in Forever settings. Do not emit unsupported `.dungeon` tags and assume the branches will
work. Prefer separate named dungeon alternatives in the KFC group for the first release; validate
selection and return-to-route behavior without changing RestedXP core. A later integrated selector
requires explicit compatibility work, tests and a documented update strategy.

The compiler must validate unique step IDs, dependency cycles, quest restrictions, ordering and
rejoin checkpoints. Emit deterministic artifacts with a manifest and SHA-256. Do not grant XP in
guide code: `.xp` checks progress; it does not award it. Do not represent a supported full route by a
file containing only reminders or a quest catalog.

### Install and update flow

Start with a ZIP download and accurate manual instructions: exit/reload as needed, extract the KFC
folder into the selected installation's `Interface/AddOns`, enable both addons and select the KFC
guide group. Show Windows and macOS locations, the intended Classic Beta product and how to verify
the loaded release. Do not overwrite RestedXP files or SavedVariables.

If “implementator” includes a one-click installer, make that a later adapter in the **existing KFC
Companion**, after inspecting its architecture. It should select the correct WoW installation,
check compatibility and the artifact checksum, install only the KFC-owned folder, preserve/restore
its prior version and report missing RestedXP or a running-game conflict. This is optional; the
manual ZIP path must fully work first. Do not build a second desktop application solely for this.

No addon should attempt to collect a player's WoW credentials. Supporter authorization belongs to
the website download service; the installed guide is Lua content and cannot be made uncopyable.
Account binding or obfuscation is not a prerequisite for a reliable supporter guide.

## Team support, Revolut checkout and guide fulfillment

### Player-facing copy

The call to action is **“Support the team · €9.99.”** Explain: “Your contribution helps our small
team build and maintain free tools that improve the experience for everyone. As a thank-you,
confirmed supporters can download the KFC RestedXP guide.” Show exactly which guide edition and
coverage the supporter receives. The free browser route and calculator are available without
contributing.

Use “contribution,” “support,” “supporter guide” and “thank you” for normal player-facing text.
Keep internal Revolut billing/order status names unchanged so confirmation remains compatible with
the existing code. Do not imply a registered charity, tax deduction, recurring donation, variable
amount or unconditional guide access: this plan is a one-time €9.99 contribution with a stated
supporter benefit. If the contribution amount later becomes optional, revise entitlement rules
and copy together.

### Exact implementation reference, inspected

The source project is `/Users/dimitarjilanov/work/vrachka.bg`:

| Source                                                                            | Verified behavior to reuse                                                                                                                                                             |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/features/checkout/checkout-sheet.tsx`                               | Same-page dialog, email, accepted terms, product summary, server-created order, Revolut popup and server status confirmation                                                           |
| `apps/api/src/billing/billing.controller.ts`                                      | `POST /billing/checkout`, `GET /billing/orders/:orderId/status`, `POST /billing/webhook`; raw webhook body and signature/timestamp headers                                             |
| `apps/api/src/billing/billing.service.ts`                                         | Server product/price validation, pending order persistence, Revolut order creation, provider reconciliation, signed webhook checks, duplicate-event handling and paid-order processing |
| `packages/types/src/index.ts`                                                     | Checkout request/response and `pending`, `paid`, `failed`, `cancelled`, `refunded` order contracts                                                                                     |
| `packages/db/prisma/schema.prisma`                                                | Existing order/payment persistence relationships; map these concepts into Helper's Drizzle/PostgreSQL conventions                                                                      |
| `apps/api/src/billing/billing.service.spec.ts`, `tests/billing-lifecycle.spec.ts` | Existing lifecycle/reconciliation test scenarios to adapt for guide delivery                                                                                                           |

The frontend loads `https://merchant.revolut.com/embed.js`, initializes `RevolutCheckout` with the
server-issued order token and selected environment, and calls `payWithPopup`. Its exact state
sequence is `idle → creating → waiting → confirming → paid`, with an error branch. Popup success
starts confirmation; it does not grant the product by itself. Status polling starts after 900 ms,
continues every 2 seconds and stops after 30 attempts, preserving the order when confirmation is
late. Retain this behavior and its cancellation/error handling, with KFC styling and support copy.

The backend checks pending orders against Revolut when the status endpoint is read, so a missed
webhook can still reconcile a confirmed contribution. It verifies webhook signatures against the
raw body, applies a timestamp tolerance and deduplicates events. Adapt those reviewed mechanisms,
not just the frontend sheet. Provider callbacks are not sufficient for fulfillment, consistent with
[Revolut's popup documentation](https://developer.revolut.com/docs/sdks/merchant-web-sdk/payment-methods/pop-up).

The referenced server currently declares API version `2026-04-20` and uses `REVOLUT_ENVIRONMENT`,
`REVOLUT_API_KEY`, `REVOLUT_SANDBOX_API_KEY` and `REVOLUT_WEBHOOK_SECRET`. These are inspected
configuration names, not supplied credentials. Reuse approved configuration through protected
server settings. Confirm the SDK/API option compatibility during implementation; do not blindly
copy local type declarations as the complete provider contract.

### Adaptation into Helper

Set the server-controlled contribution to **999 euro cents**, **EUR**, quantity one. Add a dedicated
supporter product and route release binding. Replace tarot/reading delivery with guide entitlement
and download delivery. Remove unrelated reading/context requirements, Vrachka branding, receipt
wording and the existing `GADATEL` statement descriptor; use the team's actual approved merchant
settings. Keep the checkout mechanics and confirmation behavior exactly as referenced.

Helper uses Next.js and Drizzle. Adapt the billing adapter to that architecture rather than adding
NestJS/Prisma merely to reproduce the reference application. Do not direct Helper contributors to
Vrachka's production product endpoints or require accounts on that unrelated site. Existing
provider account/configuration can be reused through an appropriately scoped deployment.

Implement the complete flow:

1. The support sheet shows guide coverage and €9.99, collects email and appropriate accepted terms,
   and submits the dedicated product/source path to the server. Store an internal pending order
   tied to the released guide and a buyer-bound access proof.
2. The backend fixes amount/currency, creates the Revolut order and returns the existing-style
   response: amount, currency, environment, local/provider order IDs, product and popup token.
3. Open Revolut over the current page using `payWithPopup`. Use the reference success, cancel and
   error callbacks. No separate hosted-checkout redirect is the primary user experience.
4. On popup success, enter `confirming` and poll the server using the reference timing. Display
   “Confirming your contribution” until the backend has verified the final order status.
5. The verified webhook and status reconciliation update the local order. Validate the expected
   order/product, EUR amount and completed capture before granting access. Use transactions and
   idempotent entitlement creation; handle duplicate, late and out-of-order events.
6. On confirmed support, show “Thank you for supporting the team” and “Download your supporter
   guide” inside the sheet. Paid artifacts stay outside `public/`, public route payloads and static
   assets. Issue buyer-authorized or short-lived protected download access.
7. Keep order/status and recovery links working if the sheet closes or confirmation times out.
   A status/order ID lookup alone must not serve the private file. Use buyer authorization or a
   verified recovery mechanism. Refresh/retry must not force another contribution for a completed
   order. An independent retrieval page can reuse the reference order/receipt pattern.
8. Permit authorized re-download and define update eligibility before release. Proposed default:
   updates within the supported edition, with later editions named separately. Revoke new download
   access on a completed refund/reversal, preserving an audit trail; downloaded ZIPs cannot be
   withdrawn remotely.

Support states include unconfigured checkout, creating, waiting for Revolut, canceled, failed,
confirming, confirmation delayed, confirmed support, artifact unavailable, expired access and
refunded. The guide artifact and payment fulfillment must work before activating the support
button. The polling timeout is not evidence that the contribution failed or that another one is
required.

No provider secrets belong in the plan, source control or client responses. The existing order
popup token is different from the secret API key. Extend the existing notification/recovery pattern
only as needed for supporter guide access; do not carry over unrelated tarot/report workflows.

## Work packages for the implementer

These are implementation responsibilities and dependency order, not authorization to spawn agents.
Read the applicable `AGENTS.md` files and the installed Next.js documentation. Both repositories have
existing uncommitted work: inspect it first, preserve it, and deploy only changes belonging to this
product. Do not create commits or branches without an explicit request.

| Order | Package                       | Concrete output                                                                                                          | Completion evidence                                                                                   |
| ----- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| 1     | Source and reward audit       | Reviewed quest IDs, true prerequisite edges, current XP observations, level curve, available dungeons and route coverage | Build/date/source recorded; unknowns remain unknown; playable route scope stated                      |
| 2     | Original route authoring      | Ordered Alliance route with congestion alternatives, dungeon visits, class conditions and rejoin checkpoints             | Dependency review and playthrough; pickups/turn-ins work; no private bundle republished               |
| 3     | Calculation engine            | Pure typed functions for incremental XP/time, overlapping objectives, one-time rewards and checkpoint reachability       | Focused regression tests including impossible and unknown states                                      |
| 4     | Browser guide                 | Dedicated Leveling entry, faction/race/style onboarding, chapter dashboard, current-list reader and optional comparisons | Desktop/mobile, keyboard, profile isolation, preserved quest order and real-data checks               |
| 5     | RestedXP compiler and package | Original KFC addon ZIP, manifest, deterministic build and installation instructions                                      | Loader/parser checks and actual Classic Beta import/install/playthrough with the stated addon version |
| 6     | Existing Revolut support flow | €9.99 support sheet/popup, verified contribution, entitlement, protected guide download and recovery                     | Reference flow parity, sandbox lifecycle/access tests and protected configuration supplied            |
| 7     | Community discovery           | Primary navigation, Forever home card, Encyclopedia cross-link, metadata/sitemap and addons listing link                 | Correct destination and coverage/contribution wording; no link advertises an unavailable product      |
| 8     | Release                       | Versioned route/artifact, reviewed migrations/configuration, staged deployment and rollback                              | Staged smoke tests, artifact checksums and required product/payment readiness confirmed               |

Likely Helper touchpoints are the new `apps/web/src/app/forever/leveling/` routes, the existing
Encyclopedia leveling routes for redirects, `site-header.tsx`, the Forever home screen,
`forever-encyclopedia-nav.tsx`, overview cross-links and sitemap, focused leveling components and
shared catalog/profile/route/math modules. Contribution/download handlers and database migrations
remain a separate later supporter work package, not a requirement of the chapter-first UX revision.
Helper handler locations must follow local conventions; the inspected Vrachka billing contracts and
popup/status behavior are the required reference.

The community site's change stays limited to direct navigation/tool links and their shared
destination constants; the revised plan proposes a visible Leveling entry there as well.
Guide content, calculations and supporter artifacts belong to Helper. The installer adapter belongs to the
existing Companion only if that later phase is selected.

## Verification and release conditions

### Calculations and route

- Prove the 90-minute/40-minute example saves 50 minutes, and the 30-minute/40-minute example costs
  10 minutes. These are test scenarios, not public run measurements.
- Check baseline subtraction: 6,200 minus 2,600 equals 3,600 incremental XP.
- Count shared kills/travel once; ensure completed and already-planned quests do not add XP again.
- Reject duplicate one-time quest rewards across visits and unsupported faction/class choices.
- Handle unknown reward, unknown curve, zero catch-up rate, partial completion and missing chain states.
- A positive final XP balance must still fail an unreachable pre-dungeon checkpoint.
- Review every skipped quest's accept, objective, turn-in, condition and label references together.
- Validate multi-dungeon class quests and repeatable conversions separately from one-time rewards.

### Browser and guide package

- Run relevant existing typecheck, lint, test and build commands in each modified repository.
- Verify input names, keyboard operation, error/empty states, mobile layout and faction/class changes.
- Confirm browser and compiled route have identical stable step/release IDs and branch semantics.
- Smoke-test the actual addon on Classic Beta with existing RestedXP installed; verify missing-addon
  behavior, guide selection, quest tracking, checkpoints, update and rollback.
- Do not claim live-game compatibility based solely on a compiler or mocked parser test.

### Contributions and downloads

- Sandbox: exact €9.99 EUR contribution, popup cancellation, failure, delayed completion, duplicate/invalid
  webhook, retry after refresh, refund and supporter recovery.
- A forged return URL, another player's order ID or unconfirmed/authorized-only order cannot download.
- Private downloads use appropriate cache controls and never appear in publicly cached HTML/JSON.
- Verify correct artifact version, full bytes and SHA-256 after confirmed contribution and after re-download.
- Release only the advertised tested route scope. Keep the support checkout unavailable until fulfillment and
  the guide artifact work. Stage and smoke-test the existing applications before activation.

## Outstanding inputs and next execution order

The **Revolut implementation path is supplied and inspected**:
`/Users/dimitarjilanov/work/vrachka.bg/apps/web/src/features/checkout/checkout-sheet.tsx`, with its
backend billing service and controller. Only protected deployment configuration remains pending.
The owner has specified team-support/donation wording, not a purchase-focused player flow.

Before the first supporter release, confirm the exact level/faction/class coverage, observe current dungeon
quest rewards and level requirements, establish the active XP curve, and finish a real route and
addon playthrough. Coverage expansion, update entitlement policy and optional Companion installation
must be reflected in the product description. These decisions do not prevent starting the data,
original route, calculation and browser work.

Execution starts with the source/reward audit and one validated Westfall replacement. Use that slice
to prove shared-objective accounting, prerequisites and a real rejoin checkpoint. Then author the
remaining supported beta route, build its browser and RestedXP outputs, connect Revolut, and publish
the matching listing only after the stated readiness checks pass.

## Reference material

- Private analysis: `analysis.txt`, `summary.json`, `dungeon_quest_catalog.csv`, `dungeon_coverage.json`,
  `launch_day_analysis.txt`, `launch_day_westfall_candidates.csv` and
  `launch_day_protected_dependencies.json` in the Desktop analysis directory.
- [Blizzard October 1 beta changes](https://us.forums.blizzard.com/en/wow/t/wow-forever-beta-development-notes-%E2%80%93-updated-october-1/2360696/4).
- [Dungeon quest reference, updated October 2](https://www.wowhead.com/forever/guide/dungeons/every-dungeon-quest-location).
- [Alliance Crest of Lordaeron, quest 95189](https://www.wowhead.com/forever/quest=95189/crest-of-lordaeron).
- [RestedXP source](https://github.com/RestedXP/RXPGuides); reconcile with the installed v4.11.14 files.
- [Revolut popup integration](https://developer.revolut.com/docs/sdks/merchant-web-sdk/payment-methods/pop-up).
- Owner-specified checkout reference:
  `/Users/dimitarjilanov/work/vrachka.bg/apps/web/src/features/checkout/checkout-sheet.tsx`,
  `apps/api/src/billing/billing.service.ts` and `apps/api/src/billing/billing.controller.ts`.
- Existing repository documents: `docs/helper-encyclopedia.md`, `docs/forever-encyclopedia-plan.md`,
  `docs/production-deployment.md` and the Companion architecture documentation.
