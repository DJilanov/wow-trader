package core

import "github.com/wowsims/classic/sim/core/stats"

func kfcDarkmantleBonusSupported(id, pieces int32) bool {
	return id == 512 && (pieces == 2 || pieces == 4 || pieces == 6 || pieces == 8)
}

// Base set 512 uses the current client payload. The inherited 1-PPM reference
// remains an explicit assumption until server cadence is observed.
func (character *Character) kfcDarkmantleBonuses() []ActiveSetBonus {
	count := 0
	for _, item := range character.Equipment {
		if item.SetID == 512 {
			count++
		}
	}
	var active []ActiveSetBonus
	if count >= 2 {
		active = append(active, ActiveSetBonus{
			Name: "Darkmantle Armor", NumPieces: 2,
			BonusEffect: func(agent Agent) { agent.GetCharacter().AddResistances(8) },
		})
	}
	if count >= 4 {
		active = append(active, ActiveSetBonus{
			Name: "Darkmantle Armor", NumPieces: 4,
			BonusEffect: func(agent Agent) {
				c := agent.GetCharacter()
				energy := c.NewEnergyMetrics(ActionID{SpellID: 27788})
				MakeProcTriggerAura(&c.Unit, ProcTrigger{
					Name: "Darkmantle Energy", ActionID: ActionID{SpellID: 27787},
					Callback: CallbackOnSpellHitDealt, Outcome: OutcomeLanded,
					ProcMask: ProcMaskMeleeWhiteHit, PPM: 1,
					Handler: func(sim *Simulation, _ *Spell, _ *SpellResult) {
						if c.HasEnergyBar() {
							c.AddEnergy(sim, 20, energy)
						}
					},
				})
			},
		})
	}
	if count >= 6 {
		active = append(active, ActiveSetBonus{
			Name: "Darkmantle Armor", NumPieces: 6,
			BonusEffect: func(agent Agent) {
				agent.GetCharacter().AddStats(stats.Stats{stats.AttackPower: 40, stats.RangedAttackPower: 40})
			},
		})
	}
	if count >= 8 {
		active = append(active, ActiveSetBonus{
			Name: "Darkmantle Armor", NumPieces: 8,
			BonusEffect: func(agent Agent) { agent.GetCharacter().AddStat(stats.BonusArmor, 200) },
		})
	}
	return active
}
