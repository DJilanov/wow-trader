package core

import "github.com/wowsims/classic/sim/core/stats"

func kfcFeralheartBonusSupported(id, pieces int32) bool {
	return id == 513 && (pieces == 2 || pieces == 4 || pieces == 6 || pieces == 8)
}

func (character *Character) kfcFeralheartBonuses() []ActiveSetBonus {
	count := 0
	for _, item := range character.Equipment {
		if item.SetID == 513 {
			count++
		}
	}
	var active []ActiveSetBonus
	if count >= 2 {
		active = append(active, ActiveSetBonus{Name: "Feralheart Raiment", NumPieces: 2, BonusEffect: func(agent Agent) { agent.GetCharacter().AddResistances(8) }})
	}
	if count >= 4 {
		active = append(active, ActiveSetBonus{Name: "Feralheart Raiment", NumPieces: 4, BonusEffect: func(agent Agent) {
			c := agent.GetCharacter()
			id := ActionID{SpellID: 27798}
			mana, rage, energy := c.NewManaMetrics(id), c.NewRageMetrics(id), c.NewEnergyMetrics(id)
			MakeProcTriggerAura(&c.Unit, ProcTrigger{Name: "Base Feralheart Nature's Bounty", ActionID: ActionID{SpellID: 27781}, Callback: CallbackOnSpellHitTaken, ProcMask: ProcMaskMeleeOrRanged, Outcome: OutcomeLanded, ProcChance: .02,
				Handler: func(sim *Simulation, _ *Spell, _ *SpellResult) {
					if !c.IsEnabled() || (c.HasHealthBar() && c.CurrentHealth() <= 0) {
						return
					}
					switch c.GetCurrentPowerBar() {
					case ManaBar:
						if c.HasManaBar() {
							c.AddMana(sim, 300, mana)
						}
					case RageBar:
						if c.HasRageBar() {
							c.AddRage(sim, 10, rage)
						}
					case EnergyBar:
						if c.HasEnergyBar() {
							c.AddEnergy(sim, 40, energy)
						}
					}
				},
			})
		}})
	}
	if count >= 6 {
		active = append(active, ActiveSetBonus{Name: "Feralheart Raiment", NumPieces: 6, BonusEffect: func(agent Agent) {
			agent.GetCharacter().AddStats(stats.Stats{stats.SpellDamage: 15, stats.HealingPower: 15, stats.AttackPower: 26, stats.RangedAttackPower: 26})
		}})
	}
	if count >= 8 {
		active = append(active, ActiveSetBonus{Name: "Feralheart Raiment", NumPieces: 8, BonusEffect: func(agent Agent) { agent.GetCharacter().AddStat(stats.BonusArmor, 200) }})
	}
	return active
}
