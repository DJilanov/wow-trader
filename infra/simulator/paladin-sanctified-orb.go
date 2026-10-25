package paladin

import (
	"fmt"
	"time"

	"github.com/wowsims/classic/sim/core"
)

type kfcSanctifiedOrbState struct {
	area       string
	configured bool
	started    bool
}

func registerKFCSanctifiedOrb(agent core.Agent) {
	paladin := agent.(PaladinAgent).GetPaladin()
	if paladin.kfcSanctifiedOrb != nil {
		return
	}
	if paladin.GetSpell(core.ActionID{ItemID: 20512}) != nil {
		panic("Legacy Sanctified Orb is already registered")
	}
	state := &kfcSanctifiedOrbState{area: "neutral"}
	paladin.kfcSanctifiedOrb = state
	multiplier := func() float64 {
		if state.area == "haunted" || state.area == "wasteland" {
			return 2
		}
		return 1
	}
	action := core.ActionID{ItemID: 20512}
	metrics := paladin.NewManaMetrics(action)
	spell := paladin.RegisterSpell(core.SpellConfig{ActionID: action, SpellSchool: core.SpellSchoolHoly, ProcMask: core.ProcMaskEmpty,
		Flags:              core.SpellFlagHelpful | core.SpellFlagNoOnCastComplete,
		Cast:               core.CastConfig{CD: core.Cooldown{Timer: paladin.NewTimer(), Duration: 5 * time.Minute}},
		ExtraCastCondition: func(_ *core.Simulation, _ *core.Unit) bool { return paladin.IsEnabled() && paladin.CurrentHealth() > 0 },
		ApplyEffects: func(sim *core.Simulation, _ *core.Unit, _ *core.Spell) {
			state.started = true
			paladin.AddMana(sim, sim.RollWithLabel(318.75, 361.25, "Sanctified Orb Mana")*multiplier(), metrics)
		},
	})
	paladin.AddMajorCooldown(core.MajorCooldown{Type: core.CooldownTypeMana, Spell: spell,
		ShouldActivate: func(_ *core.Simulation, _ *core.Character) bool {
			return paladin.MaxMana()-paladin.CurrentMana() >= 361.25*multiplier()
		},
	})
}

// ConfigureKFCSanctifiedOrbArea declares a reference area before any combat action.
func (paladin *Paladin) ConfigureKFCSanctifiedOrbArea(area string) error {
	if area != "neutral" && area != "haunted" && area != "wasteland" {
		return fmt.Errorf("invalid Sanctified Orb area")
	}
	state := paladin.kfcSanctifiedOrb
	if state == nil || state.configured || state.started || paladin.GCD.ReadyAt() > 0 || paladin.Hardcast.Expires > 0 {
		return fmt.Errorf("Sanctified Orb area requires a fresh equipped Paladin")
	}
	for _, spell := range paladin.Spellbook {
		for _, metric := range spell.SpellMetrics {
			if metric.Casts > 0 || metric.Ticks > 0 || metric.CritTicks > 0 {
				return fmt.Errorf("Sanctified Orb area cannot change after casting")
			}
		}
	}
	state.area, state.configured = area, true
	return nil
}

// KFCSanctifiedOrbArea reports the actual reference area, including the neutral default.
func (paladin *Paladin) KFCSanctifiedOrbArea() string {
	if paladin.kfcSanctifiedOrb == nil {
		return ""
	}
	return paladin.kfcSanctifiedOrb.area
}
