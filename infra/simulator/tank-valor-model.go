package core

import "time"

// Set 189 uses the current client thresholds, not the similarly named Heroism set.
// The client defines the mask/payload, not the server's proc cadence. Retain the
// inherited same-spell 1-PPM reference; frequency remains server-unverified.
func (character *Character) kfcValorBonuses() []ActiveSetBonus {
	count := 0
	for _, item := range character.Equipment {
		if item.SetID == 189 {
			count++
		}
	}
	var active []ActiveSetBonus
	if count >= 5 {
		active = append(active, ActiveSetBonus{
			Name: "Battlegear of Valor", NumPieces: 5,
			BonusEffect: func(agent Agent) {
				c := agent.GetCharacter()
				health := c.NewHealthMetrics(ActionID{SpellID: 450589})
				rage := c.NewRageMetrics(ActionID{SpellID: 450589})
				MakeProcTriggerAura(&c.Unit, ProcTrigger{
					Name: "Valor Warrior's Resolve", ActionID: ActionID{SpellID: 450587},
					Callback: CallbackOnSpellHitDealt, Outcome: OutcomeLanded,
					ProcMask: ProcMaskMeleeWhiteHit, PPM: 1,
					Handler: func(sim *Simulation, _ *Spell, _ *SpellResult) {
						c.GainHealth(sim, sim.Roll(88, 132), health)
						if c.HasRageBar() {
							c.AddRage(sim, 10, rage)
						}
					},
				})
			},
		})
	}
	if count >= 6 {
		active = append(active, ActiveSetBonus{
			Name: "Battlegear of Valor", NumPieces: 6,
			BonusEffect: func(agent Agent) {
				c := agent.GetCharacter()
				health := c.NewHealthMetrics(ActionID{SpellID: 21347})
				c.RegisterResetEffect(func(sim *Simulation) {
					StartPeriodicAction(sim, PeriodicActionOptions{
						Period:   5 * time.Second,
						OnAction: func(sim *Simulation) { c.GainHealth(sim, 15, health) },
					})
				})
			},
		})
	}
	return active
}
