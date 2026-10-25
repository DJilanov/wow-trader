# Priest ring model and incremental comparison

Mark of the Dragon Lord (13143, spell 17252) now has a class-owned Priest use.
Its captured effect provides a 500 self shield and 22 mana every five seconds
while the shield holds. Both duration and personal cooldown are 30 minutes;
there is no shared item category or GCD. Depletion, manual cancellation or
death stops mana. Natural expiry credits the final due tick once in the
reference. Healing power does not scale either effect. Unused shielding and
capped mana contribute no effective benefit. Historical base statistics,
acquisition and unobserved server timing remain assumptions.

`infra/simulator/priest-dragon-mark.mjs` reuses the authenticated shared source
extractor and derives two changes to a frozen Priest parent: actor registration
and explicit owned cooldown admission. The Go helper and regression controls
are `priest-dragon-mark.go` and `priest-dragon-mark_test.go`. The old actor fails
the actual equipped-item regression. The corrected model passes 145 native/
Chromium controls, 9 core controls, 28 worker comparisons and four deliberately
broken variants. All 48 parent measurement groups and all catalog bytes survive.
Exact source hashes and private receipts are in context.md.

The numerical update holds other slots, enchants, talents, consumes and spell
priorities fixed. It pairs Mark with every legal catalog ring in both slots,
plus each current baseline: 124 legal candidates per preset, 40 presets and 14
rank/Heart cases. Two initial confirmations miss the 2% target. Their retained
candidates receive fresh 64-fight training and four fresh 32-fight confirmation
batches. Confirmation results do not select a replacement winner. All 40 final
choices survive and pass observed 2%; maximum relative regret is 1.32244% against
retained alternatives. Twenty-seven defaults change rings.

The exact replay reconstructs all 79,422 distinct actual jobs, candidate legality,
fingerprints, replies, training and confirmation selections. Native searches
finish at 2026-10-24T20:29:42.721Z, before the original class deadline. Later
browser/type/schema checks validate delivery rather than launch new optimization.
This is a bounded incremental comparison, not a global-optimum or server claim.

The delivered references contain 64 independent fights per case, or 128 for the
two follow-up presets. Every benchmark starts with item cooldowns available.
The casting guidance therefore explains Mark's 30-minute cooldown and lists the
tested baseline ring pair for its downtime. It does not invent another ready
use between raid bosses.

The optional `itemEffectsVersion` contract now admits versions 1 and 2. Both retain
the existing Heart/resource policies; only 2 adds automatic Mark use. A version 2
default must equip the ring if and only if its workload includes spell 17252.
The character editor adds the use at 22 missing mana while healing is needed,
after its existing Rune policy, and removes it when the ring is unequipped.
Older libraries and saved engine releases retain their earlier behavior.
Unique-item, quest-choice, faction and enchant validation remain enforced.

Local release `82489a30494be3b4eff67cc0` passes 20 actual workspace checks and 17
native/browser comparisons, including a fresh equipped/removed item flow,
rejected Unique duplicates, Stop/recovery, gear/talents/race, saved builds and
desktop/mobile layouts. Existing releases and source snapshots are preserved.
No production deployment accompanies this local update.

Repeat the fast source/transport controls with `pnpm simulator:healers:test`.
The focused contract tests are `src/healing-simulator.test.ts` in forever-data
and `src/lib/healer-configuration.test.ts` in web. New future searches require a
new reviewed model/campaign definition and budget; do not alter these frozen
receipts or reset their original deadline.
