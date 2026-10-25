package core

// CalcKFCShamanPeriodicHealing keeps periodic semantics without changing the inherited helper's dispatch.
func (spell *Spell) CalcKFCShamanPeriodicHealing(sim *Simulation, target *Unit, baseHealing float64, outcome OutcomeApplier) *SpellResult {
	if spell.BonusCoefficient > 0 {
		baseHealing += spell.BonusCoefficient * spell.HealingPower(target)
	}
	return spell.calcHealingInternal(sim, target, baseHealing, spell.CasterHealingMultiplier(), true, outcome)
}
