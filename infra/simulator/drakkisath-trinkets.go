package common

import (
	"fmt"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/stats"
)

func init() {
	core.NewItemEffect(13968, func(agent core.Agent) {
		character := agent.GetCharacter()
		if !character.Env.IsForever() {
			return
		}
		register := core.MakeTemporaryStatsOnUseCDRegistration(
			"Eye of the Beast", stats.Stats{stats.SpellHit: 7 * core.SpellHitRatingPerHitChance},
			20*time.Second,
			core.SpellConfig{ActionID: core.ActionID{ItemID: 13968}, Flags: core.SpellFlagOffensiveEquipment | core.SpellFlagNoOnCastComplete},
			func(character *core.Character) core.Cooldown {
				return core.Cooldown{Timer: character.NewTimer(), Duration: 5 * time.Minute}
			},
			func(character *core.Character) core.Cooldown {
				return core.Cooldown{Timer: character.GetOffensiveTrinketCD(), Duration: 20 * time.Second}
			},
		)
		register(agent)
	})
	core.NewItemEffect(13965, func(agent core.Agent) {
		character := agent.GetCharacter()
		if !character.Env.IsForever() {
			return
		}
		var marked *core.Aura
		auras := character.NewEnemyAuraArray(func(target *core.Unit) *core.Aura {
			return target.GetOrRegisterAura(core.Aura{
				Label:    fmt.Sprintf("Blackhand's Breadth-%d", character.UnitIndex),
				ActionID: core.ActionID{SpellID: 1318944}, Duration: 20 * time.Second,
				OnGain: func(aura *core.Aura, sim *core.Simulation) {
					for _, table := range character.AttackTables[target.UnitIndex] {
						table.BonusCritChanceTaken += 0.05
					}
				},
				OnExpire: func(aura *core.Aura, sim *core.Simulation) {
					for _, table := range character.AttackTables[target.UnitIndex] {
						table.BonusCritChanceTaken -= 0.05
					}
				},
			})
		})
		spell := character.RegisterSpell(core.SpellConfig{
			ActionID: core.ActionID{ItemID: 13965},
			Flags:    core.SpellFlagOffensiveEquipment | core.SpellFlagNoOnCastComplete,
			Cast: core.CastConfig{
				CD:       core.Cooldown{Timer: character.NewTimer(), Duration: 5 * time.Minute},
				SharedCD: core.Cooldown{Timer: character.GetOffensiveTrinketCD(), Duration: 20 * time.Second},
			},
			ApplyEffects: func(sim *core.Simulation, target *core.Unit, spell *core.Spell) {
				if marked != nil {
					marked.Deactivate(sim)
				}
				marked = auras.Get(target)
				marked.Activate(sim)
			},
		})
		character.RegisterResetEffect(func(sim *core.Simulation) { marked = nil })
		character.AddMajorCooldown(core.MajorCooldown{Spell: spell, Type: core.CooldownTypeDPS})
	})
}
