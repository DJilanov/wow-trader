package core

import (
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/stats"
)

// ForeverDeathmistPassiveStats returns only the sourced flat bonuses for base
// set 518. This component does not register a set handler or qualify the fear
// effect; callers must not treat its result as a complete set simulation.
func ForeverDeathmistPassiveStats(equipment Equipment, ruleset proto.Ruleset) stats.Stats {
	var result stats.Stats
	if ruleset != proto.Ruleset_RulesetForever {
		return result
	}
	pieces := 0
	for _, item := range equipment {
		if item.SetID == 518 {
			pieces++
		}
	}
	if pieces >= 2 {
		for _, resistance := range []stats.Stat{stats.ArcaneResistance, stats.FireResistance,
			stats.FrostResistance, stats.NatureResistance, stats.ShadowResistance} {
			result[resistance] = 8
		}
	}
	if pieces >= 6 {
		// SpellPower contributes to healing too; adding HealingPower would count it twice.
		result[stats.SpellPower] = 23
	}
	if pieces >= 8 {
		// Warlock already has the BonusArmor -> Armor dependency.
		result[stats.BonusArmor] = 200
	}
	return result
}
