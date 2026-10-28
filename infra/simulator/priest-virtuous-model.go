package core

import "github.com/wowsims/classic/sim/core/stats"

// This client-mask reference excludes periodic, friendly and unclassified events.
// Proc-mask routing and shield application order remain disclosed model assumptions.
func ForeverVirtuousIncomingReference(spell *Spell, result *SpellResult) bool {
	return spell != nil && result != nil && result.Landed() && spell.ProcMask.Matches(ProcMaskDirect)
}

func (character *Character) kfcForeverVirtuousBonuses() []ActiveSetBonus {
	if character.Env == nil || !character.Env.IsForever() {
		return nil
	}
	pieces := 0
	for _, item := range character.Equipment {
		if item.SetID == kfcVirtuousSetID {
			pieces++
		}
	}
	var bonuses []ActiveSetBonus
	add := func(threshold int32, effect ApplyEffect) {
		if pieces >= int(threshold) {
			bonuses = append(bonuses, ActiveSetBonus{Name: "Vestments of the Virtuous", NumPieces: threshold, BonusEffect: effect})
		}
	}
	add(2, func(agent Agent) {
		agent.GetCharacter().AddStats(stats.Stats{
			stats.ArcaneResistance: kfcVirtuousResistance, stats.FireResistance: kfcVirtuousResistance,
			stats.FrostResistance: kfcVirtuousResistance, stats.NatureResistance: kfcVirtuousResistance,
			stats.ShadowResistance: kfcVirtuousResistance,
		})
	})
	add(4, func(agent Agent) {
		RegisterForeverVirtuousShieldReference(agent.GetCharacter(), ForeverVirtuousShieldReferencePolicy{
			EligibleIncoming: ForeverVirtuousIncomingReference, FamilyMultiplier: 1,
		})
	})
	add(6, func(agent Agent) { agent.GetCharacter().AddStat(stats.SpellPower, kfcVirtuousSpellPower) })
	add(8, func(agent Agent) { agent.GetCharacter().AddStat(stats.BonusArmor, kfcVirtuousBonusArmor) })
	return bonuses
}
