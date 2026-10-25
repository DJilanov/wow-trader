package holy

import (
	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	gproto "google.golang.org/protobuf/proto"
)

// KFC_PALADIN_PASSIVE_VALUES

func (holy *HolyPaladin) validateKFCPassiveTalents() {
	remaining := gproto.Clone(holy.Talents).(*proto.PaladinTalents)
	remaining.DivineIntellect, remaining.HealingLight, remaining.Reverence = 0, 0, 0
	remaining.HolyPower, remaining.Illumination = 0, 0
	if !gproto.Equal(remaining, &proto.PaladinTalents{}) {
		panic("Paladin passive controls do not admit unverified active healing talents")
	}
	for _, rank := range []struct{ value, maximum int32 }{
		{holy.Talents.DivineIntellect, 5}, {holy.Talents.HealingLight, 3},
		{holy.Talents.Reverence, 3}, {holy.Talents.HolyPower, 5}, {holy.Talents.Illumination, 5},
	} {
		if rank.value < 0 || rank.value > rank.maximum {
			panic("Invalid Paladin healing passive rank")
		}
	}
}

func (holy *HolyPaladin) ApplyTalents() {
	holy.Paladin.ApplyTalents()
	baseCosts := make(map[int32]float64, len(kfcPaladinHealingRanks))
	for _, rank := range kfcPaladinHealingRanks {
		baseCosts[rank.ID] = rank.Mana
	}
	if holy.Talents.HealingLight > 0 {
		holy.OnSpellRegistered(func(spell *core.Spell) {
			if _, supported := baseCosts[spell.ActionID.SpellID]; supported {
				spell.DamageMultiplier *= kfcPaladinHealingLight[holy.Talents.HealingLight]
			}
		})
	}
	if holy.Talents.Illumination == 0 {
		return
	}
	metrics := holy.NewManaMetrics(core.ActionID{SpellID: 20210})
	core.MakePermanent(holy.RegisterAura(core.Aura{
		Label: "Paladin healing Illumination", ActionID: core.ActionID{SpellID: 20210},
		OnHealDealt: func(_ *core.Aura, sim *core.Simulation, spell *core.Spell, result *core.SpellResult) {
			cost, supported := baseCosts[spell.ActionID.SpellID]
			if !supported || !result.DidCrit() || !sim.Proc(kfcPaladinIlluminationChance[holy.Talents.Illumination], "Healing Illumination") {
				return
			}
			holy.AddMana(sim, cost*kfcPaladinIlluminationRefund, metrics)
		},
	}))
}
