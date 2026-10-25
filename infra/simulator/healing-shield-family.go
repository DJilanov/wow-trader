package core

// KFCActiveShieldFamily returns an independent slice so replacing a family can safely deactivate its pools.
func (unit *Unit) KFCActiveShieldFamily(sim *Simulation, spellIDs map[int32]bool) []*Shield {
	var matches []*Shield
	for _, shield := range unit.activeShields {
		if shield.IsActive() && shield.ExpiresAt() > sim.CurrentTime && spellIDs[shield.Spell.ActionID.SpellID] {
			matches = append(matches, shield)
		}
	}
	return matches
}
