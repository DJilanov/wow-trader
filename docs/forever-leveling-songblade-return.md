# Songblade Search and Fallen in the Fen

The selected Excavation package now includes both stages. [Current validation and remaining work](forever-leveling-product-plan.md#current-local-review--group-program-boundaries-v200). Local code/data only; the full guide is unfinished and undeployed.

| Stage | Actual task | Reference reward/player |
| --- | --- | --- |
| 95772 Songblade Search | Accept from Dorin in Lakeshire before the dungeon; find Daewyn's body inside Excavation and complete the hand-in | 6,150 XP |
| 95795 Fallen in the Fen | Each player accepts at the body after the first hand-in; return to Dorin in Lakeshire | 6,150 XP |

The return belongs to the ordinary core package, including saved settings that formerly disabled it as an extra. No class quest or private item farm is added. It requires the first stage to be rewarded. Finding the body does not pay the second reward; reaching the actual Lakeshire hand-in does. The existing published reward and per-level curve stay unchanged and receive no second coefficient.

Both matching client records have zero numbered objectives. Generated `.complete 95772,1` and `.complete 95795,1` tasks are therefore removed, preserving the real accepts/returns. Source-owned objectives and explicitly scoped manual phases are retained. No corpse ID, exact inside coordinate or new kill quota is guessed. Minimum level is 24; quest level is 31. This is source-qualified reference behavior, not an observed current-server payout guarantee.

Sources: [Fallen in the Fen](https://www.wowhead.com/forever/quest=95795/fallen-in-the-fen), [published localized reward](https://www.wowhead.com/forever/fr/quest=95795/chute-dans-les-marais), [Excavation quest relationship](https://www.wowhead.com/forever/zone=16732/excavation-site-wetlands), and matching 70205/70450 query records from [Efficient Games](https://github.com/JIVESCORP/eg-link-output-wowf/tree/9c3f82fc7c8ce60760e933db529fd629c2f682d7), CC BY 4.0, https://efficient.games. Original data and field changes remain in `.cache/leveling-no-grind-20261031/fallen-fen-v193/qualification.json`.

Twelve focused regressions cover client identities, access, core selection, body ordering, outside destination, absence of early reward, no added combat, forty slots, bookmark redirects and five class native exports. Full eight-setting replay and independent workload/native checks pass. Post-Excavation city ordering, the 95647 inside label and removed-placeholder redirects are corrected. The 6,150 XP/player still pays only in Lakeshire. The current expected route remains short of level 29, the fast case stops earlier at a level-28 combat requirement, while actual timed completion and physical payouts remain unobserved. The full route and original other groups are not ready.

The V196 replay retains these component handoffs and native inventories. Its independent numerical/native and deadline-contract checks pass. The fast-loot combat gate and expected level-29 deficit remain unresolved; these component results do not make the full guide ready.
