package core

import "github.com/wowsims/classic/sim/core/stats"

func kfcSorcererBonusSupported(id, pieces int32) bool {
	return id == 517 && (pieces == 2 || pieces == 4 || pieces == 6 || pieces == 8)
}

func (character *Character) kfcSorcererBonuses() []ActiveSetBonus {
	count := 0
	for _, item := range character.Equipment {
		if item.SetID == 517 {
			count++
		}
	}
	var active []ActiveSetBonus
	if count >= 2 {
		active = append(active, ActiveSetBonus{Name: "Sorcerer's Regalia", NumPieces: 2,
			BonusEffect: func(agent Agent) { agent.GetCharacter().AddResistances(8) }})
	}
	if count >= 4 {
		active = append(active, ActiveSetBonus{Name: "Sorcerer's Regalia", NumPieces: 4,
			BonusEffect: func(agent Agent) { agent.GetCharacter().kfcRegisterSorcererFreeze() }})
	}
	if count >= 6 {
		active = append(active, ActiveSetBonus{Name: "Sorcerer's Regalia", NumPieces: 6,
			BonusEffect: func(agent Agent) { agent.GetCharacter().AddStat(stats.SpellPower, 23) }})
	}
	if count >= 8 {
		active = append(active, ActiveSetBonus{Name: "Sorcerer's Regalia", NumPieces: 8,
			BonusEffect: func(agent Agent) { agent.GetCharacter().AddStat(stats.BonusArmor, 200) }})
	}
	return active
}
