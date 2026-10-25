package healing

import "github.com/wowsims/classic/sim/core"

// KFC_PRIEST_ENERGETIC_ROD_VALUES

func (healer *HealingPriest) registerKFCEnergeticRod() {
	owned := false
	for _, item := range healer.Equipment {
		owned = owned || item.ID == kfcEnergeticRodItemID
	}
	if !owned {
		return
	}
	if core.HasItemEffect(kfcEnergeticRodItemID) {
		panic("Energetic Rod acquired a generic handler; re-admit the Priest effect")
	}
	mana := healer.NewManaMetrics(core.ActionID{SpellID: kfcEnergeticRodManaSpellID})
	core.MakePermanent(healer.RegisterAura(core.Aura{
		Label: "Priest Energetic Rod trigger", ActionID: core.ActionID{SpellID: kfcEnergeticRodTriggerID},
		OnCastComplete: func(_ *core.Aura, sim *core.Simulation, spell *core.Spell) {
			if sim.CurrentTime < 0 || healer.CurrentHealth() <= 0 || spell == nil || !spell.ProcMask.Matches(core.ProcMaskSpellDamage) || spell.Flags.Matches(core.SpellFlagPassiveSpell|core.SpellFlagNoOnCastComplete) {
				return
			}
			registered := false
			for _, candidate := range healer.Spellbook {
				registered = registered || candidate == spell
			}
			if !registered {
				return
			}
			healer.itemEffects.started = true
			healer.AddMana(sim, kfcEnergeticRodMana, mana)
		},
	}))
}
