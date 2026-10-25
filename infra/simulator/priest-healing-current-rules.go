package priest

import "github.com/wowsims/classic/sim/core"

func kfcRenewHealingTick(dot *core.Dot) core.OutcomeApplier {
	return func(sim *core.Simulation, result *core.SpellResult, table *core.AttackTable) {
		result.EffectiveCritChance = min(1, max(0, dot.Spell.HealingCritChance()))
		dot.Spell.OutcomeHealingCritNoHitCounter(sim, result, table)
		metrics := &dot.Spell.SpellMetrics[result.Target.UnitIndex]
		if result.DidCrit() {
			metrics.CritTicks++
		} else {
			metrics.Ticks++
		}
	}
}
