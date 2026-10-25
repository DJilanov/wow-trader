package core

import "github.com/wowsims/classic/sim/core/stats"

func kfcBeastmasterBonusSupported(id, pieces int32) bool {
	return id == 515 && (pieces == 2 || pieces == 4 || pieces == 6 || pieces == 8)
}

func (character *Character) kfcBeastmasterBonuses() []ActiveSetBonus {
	count := 0
	for _, item := range character.Equipment {
		if item.SetID == 515 {
			count++
		}
	}
	var active []ActiveSetBonus
	if count >= 2 {
		active = append(active, ActiveSetBonus{Name: "Beastmaster Armor", NumPieces: 2,
			BonusEffect: func(agent Agent) { agent.GetCharacter().AddResistances(8) }})
	}
	if count >= 4 {
		active = append(active, ActiveSetBonus{Name: "Beastmaster Armor", NumPieces: 4,
			BonusEffect: func(agent Agent) {
				c := agent.GetCharacter()
				mana := c.NewManaMetrics(ActionID{SpellID: 27786})
				MakeProcTriggerAura(&c.Unit, ProcTrigger{
					Name: "Beastmaster Mana", ActionID: ActionID{SpellID: 27785},
					Callback: CallbackOnSpellHitDealt, Outcome: OutcomeLanded,
					ProcMask: ProcMaskRangedAuto, ProcChance: 0.04,
					Handler: func(sim *Simulation, _ *Spell, _ *SpellResult) {
						if c.HasManaBar() {
							c.AddMana(sim, 200, mana)
						}
					},
				})
			}})
	}
	if count >= 6 {
		active = append(active, ActiveSetBonus{Name: "Beastmaster Armor", NumPieces: 6,
			BonusEffect: func(agent Agent) {
				agent.GetCharacter().AddStats(stats.Stats{stats.AttackPower: 40, stats.RangedAttackPower: 40})
			}})
	}
	if count >= 8 {
		active = append(active, ActiveSetBonus{Name: "Beastmaster Armor", NumPieces: 8,
			BonusEffect: func(agent Agent) { agent.GetCharacter().AddStat(stats.BonusArmor, 200) }})
	}
	return active
}
