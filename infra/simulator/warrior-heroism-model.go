package core

import "github.com/wowsims/classic/sim/core/stats"

func kfcHeroismBonusSupported(id, pieces int32) bool {
	return id == 511 && (pieces == 2 || pieces == 4 || pieces == 6 || pieces == 8)
}

// Base set 511 differs from alternate set 1778. The reference 1-PPM cadence is
// inherited, not established by the client's placeholder proc chance or a server observation.
func (character *Character) kfcHeroismBonuses() []ActiveSetBonus {
	count := 0
	for _, item := range character.Equipment {
		if item.SetID == 511 {
			count++
		}
	}
	var active []ActiveSetBonus
	if count >= 2 {
		active = append(active, ActiveSetBonus{
			Name: "Battlegear of Heroism", NumPieces: 2,
			BonusEffect: func(agent Agent) { agent.GetCharacter().AddResistances(8) },
		})
	}
	if count >= 4 {
		active = append(active, ActiveSetBonus{
			Name: "Battlegear of Heroism", NumPieces: 4,
			BonusEffect: func(agent Agent) {
				c := agent.GetCharacter()
				health := c.NewHealthMetrics(ActionID{SpellID: 27418})
				MakeProcTriggerAura(&c.Unit, ProcTrigger{
					Name: "Heroism Health", ActionID: ActionID{SpellID: 27419},
					Callback: CallbackOnSpellHitDealt, Outcome: OutcomeLanded,
					ProcMask: ProcMaskMeleeWhiteHit, PPM: 1,
					Handler: func(sim *Simulation, _ *Spell, _ *SpellResult) {
						c.GainHealth(sim, sim.Roll(88, 132), health)
					},
				})
			},
		})
	}
	if count >= 6 {
		active = append(active, ActiveSetBonus{
			Name: "Battlegear of Heroism", NumPieces: 6,
			BonusEffect: func(agent Agent) {
				agent.GetCharacter().AddStats(stats.Stats{stats.AttackPower: 40, stats.RangedAttackPower: 40})
			},
		})
	}
	if count >= 8 {
		active = append(active, ActiveSetBonus{
			Name: "Battlegear of Heroism", NumPieces: 8,
			BonusEffect: func(agent Agent) { agent.GetCharacter().AddStat(stats.BonusArmor, 200) },
		})
	}
	return active
}
