package core

import "github.com/wowsims/classic/sim/core/stats"

// Current-client PvP thresholds replace the older Classic name-based definitions.
// The outdoor movement / stun cooldown utilities are deliberately not simulated.
func init() {
	foreverEquipmentSets[382] = foreverEquipmentSet{
		Name: "Champion's Sanctuary",
		Bonuses: map[int32]foreverEquipmentBonus{
			2: {Supported: true, Stats: stats.Stats{stats.AttackPower: 40, stats.RangedAttackPower: 40}},
			4: {Supported: false},
			6: {Supported: true, Stats: stats.Stats{stats.Stamina: 20}},
		},
	}
	foreverEquipmentSets[2086] = foreverEquipmentSet{
		Name: "Lieutenant Commander's Vindication",
		Bonuses: map[int32]foreverEquipmentBonus{
			2: {Supported: true, Stats: stats.Stats{stats.SpellPower: 23}},
			4: {Supported: false},
			6: {Supported: true, Stats: stats.Stats{stats.Stamina: 20}},
		},
	}
}
