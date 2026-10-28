package priest

// The captured item-shield mask matches Improved PWS capacity, but not general
// healing modifiers. A free passive cast has no cost or cast cooldown to modify;
// its separate proc ICD is owned by the core reference.
func (priest *Priest) KFCVirtuousShieldMultiplier() float64 {
	if priest == nil || priest.Talents == nil {
		panic("Virtuous requires native Priest talents")
	}
	multipliers := [...]float64{1, 1.07, 1.14, 1.2}
	rank := priest.Talents.ImprovedPowerWordShield
	if rank < 0 || int(rank) >= len(multipliers) {
		panic("Invalid Improved Power Word Shield rank")
	}
	return multipliers[rank]
}
