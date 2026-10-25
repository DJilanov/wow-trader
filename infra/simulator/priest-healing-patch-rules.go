package priest

import "github.com/wowsims/classic/sim/core"

var kfcPowerWordShieldFamily = func() map[int32]bool {
	family := map[int32]bool{}
	for _, rank := range kfcHealingRanks {
		if rank.Family == "shield" {
			family[rank.ID] = true
		}
	}
	return family
}()

func kfcRenewCriticalTick(dot *core.Dot) core.OutcomeApplier {
	return func(sim *core.Simulation, result *core.SpellResult, table *core.AttackTable) {
		result.EffectiveCritChance = dot.SnapshotCritChance
		dot.OutcomeSnapshotCrit(sim, result, table)
	}
}

func (priest *Priest) kfcCanReplacePowerWordShield(sim *core.Simulation, target *core.Unit, rank kfcHealingRank) bool {
	spell := priest.GetSpell(core.ActionID{SpellID: rank.ID})
	if spell == nil {
		return false
	}
	low, _ := rank.amountBounds(int(priest.Level))
	// Match Shield.Apply's spell and caster shield multipliers, including talents.
	capacity := max(0, (low+rank.Coefficient*spell.HealingPower(target))*spell.DamageMultiplier*priest.PseudoStats.ShieldDealtMultiplier)
	for _, existing := range target.KFCActiveShieldFamily(sim, kfcPowerWordShieldFamily) {
		if existing.RemainingAbsorb() > capacity {
			return false
		}
	}
	return true
}
