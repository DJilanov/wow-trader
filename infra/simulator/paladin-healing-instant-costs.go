package holy

import (
	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	gproto "google.golang.org/protobuf/proto"
)

// KFC_PALADIN_INSTANT_COST_VALUES

func (holy *HolyPaladin) validateKFCInstantCostTalents() {
	if holy.Talents.Benediction < 0 || holy.Talents.Benediction > 5 {
		panic("Invalid Paladin Benediction rank")
	}
	original := holy.Talents
	active := gproto.Clone(original).(*proto.PaladinTalents)
	active.Benediction = 0
	holy.Talents = active
	defer func() { holy.Talents = original }()
	holy.validateKFCActiveTalents()
}

func (holy *HolyPaladin) registerKFCInstantCostModifiers() {
	if holy.Talents.Benediction == 0 {
		return
	}
	holy.OnSpellRegistered(func(spell *core.Spell) {
		if kfcPaladinInstantCostIDs[spell.ActionID.SpellID] && spell.DefaultCast.CastTime == 0 && spell.Cost != nil {
			spell.Cost.Multiplier -= kfcPaladinInstantCostReduction[holy.Talents.Benediction]
		}
	})
}
