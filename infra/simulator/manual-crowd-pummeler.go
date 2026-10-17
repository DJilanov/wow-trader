package common

import (
	"time"

	"github.com/wowsims/classic/sim/core"
)

func kfcRegisterManualCrowdPummeler(agent core.Agent) {
	character := agent.GetCharacter()
	forever := character.Env.IsForever()
	charges := 3
	cooldown := 30 * time.Second
	if forever {
		cooldown = 180 * time.Second
	}
	character.RegisterResetEffect(func(sim *core.Simulation) { charges = 3 })
	changeSpeed := func(sim *core.Simulation, multiplier float64) {
		if forever {
			character.MultiplyMeleeSpeed(sim, multiplier)
		} else {
			character.MultiplyAttackSpeed(sim, multiplier)
		}
	}
	actionID := core.ActionID{SpellID: 13494}
	aura := character.GetOrRegisterAura(core.Aura{
		Label: "Haste", ActionID: actionID, Duration: 30 * time.Second,
		OnGain:   func(aura *core.Aura, sim *core.Simulation) { changeSpeed(sim, 1.5) },
		OnExpire: func(aura *core.Aura, sim *core.Simulation) { changeSpeed(sim, 1.0/1.5) },
	})
	spell := character.RegisterSpell(core.SpellConfig{
		ActionID: actionID,
		Flags:    core.SpellFlagNoOnCastComplete | core.SpellFlagOffensiveEquipment,
		ExtraCastCondition: func(sim *core.Simulation, target *core.Unit) bool {
			return !forever || charges > 0
		},
		Cast: core.CastConfig{CD: core.Cooldown{Timer: character.NewTimer(), Duration: cooldown}},
		ApplyEffects: func(sim *core.Simulation, target *core.Unit, spell *core.Spell) {
			if forever {
				charges--
			}
			aura.Activate(sim)
		},
	})
	character.AddMajorCooldown(core.MajorCooldown{Type: core.CooldownTypeDPS, Spell: spell})
}
