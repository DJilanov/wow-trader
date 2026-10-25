package core

// CalcKFCShamanSnapshotPeriodicHealing retains a cast's explicit caster snapshot while target modifiers stay current.
func (spell *Spell) CalcKFCShamanSnapshotPeriodicHealing(sim *Simulation, target *Unit, baseHealing, casterMultiplier float64, outcome OutcomeApplier) *SpellResult {
	return spell.calcHealingInternal(sim, target, baseHealing, casterMultiplier, true, outcome)
}
