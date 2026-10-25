package holy

import (
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/paladin"
)

// KFC_PALADIN_LIBRAM_VALUES

func (holy *HolyPaladin) registerKFCHealingLibrams() {
	if holy.Ranged().ID == kfcPaladinEconomyID {
		holy.OnSpellRegistered(func(spell *core.Spell) {
			if kfcPaladinLibramLightIDs[spell.ActionID.SpellID] && spell.Cost != nil {
				spell.Cost.Multiplier -= kfcPaladinEconomyReduction
			}
		})
	}
	if holy.Ranged().ID != kfcPaladinAlacrityID {
		return
	}
	var affected []*core.Spell
	holy.OnSpellRegistered(func(spell *core.Spell) {
		if kfcPaladinLibramLightIDs[spell.ActionID.SpellID] {
			affected = append(affected, spell)
		}
	})
	reduction := time.Duration(kfcPaladinAlacrityReductionMs) * time.Millisecond
	buff := holy.RegisterAura(core.Aura{
		Label: "Paladin healing Holy Alacrity", ActionID: core.ActionID{SpellID: kfcPaladinAlacrityAuraID},
		Duration: time.Duration(kfcPaladinAlacrityDurationMs) * time.Millisecond,
		OnGain: func(_ *core.Aura, _ *core.Simulation) {
			for _, spell := range affected {
				spell.DefaultCast.CastTime -= reduction
			}
		},
		OnExpire: func(_ *core.Aura, _ *core.Simulation) {
			for _, spell := range affected {
				spell.DefaultCast.CastTime += reduction
			}
		},
		OnCastComplete: func(aura *core.Aura, sim *core.Simulation, spell *core.Spell) {
			if kfcPaladinLibramLightIDs[spell.ActionID.SpellID] {
				aura.Deactivate(sim)
			}
		},
	})
	core.MakePermanent(holy.RegisterAura(core.Aura{
		Label: "Paladin healing Holy Alacrity trigger",
		OnCastComplete: func(_ *core.Aura, sim *core.Simulation, spell *core.Spell) {
			if spell.SpellCode == paladin.SpellCode_PaladinHolyShock && spell.Flags.Matches(core.SpellFlagHelpful) {
				buff.Activate(sim)
			}
		},
	}))
}
