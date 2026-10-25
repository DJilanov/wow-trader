//go:build with_db

package core

import (
	"testing"

	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/stats"
)

func TestKfcDarkmantleDispatchIsolation(t *testing.T) {
	old, existed := foreverEquipmentSets[512]
	foreverEquipmentSets[512] = foreverEquipmentSet{
		Name: "Darkmantle Armor",
		Bonuses: map[int32]foreverEquipmentBonus{
			2: {Supported: true, Stats: stats.Stats{stats.ArcaneResistance: 8}},
			6: {Supported: true, Stats: stats.Stats{stats.AttackPower: 40}},
			8: {Supported: true, Stats: stats.Stats{stats.BonusArmor: 200}},
		},
	}
	t.Cleanup(func() {
		if existed {
			foreverEquipmentSets[512] = old
		} else {
			delete(foreverEquipmentSets, 512)
		}
	})
	c := &Character{}
	c.Env = &Environment{Ruleset: proto.Ruleset_RulesetForever}
	for i := 0; i < 8; i++ {
		c.Equipment[i] = Item{SetID: 512, SetName: "Darkmantle Armor"}
	}
	counts := map[int32]int{}
	for _, bonus := range c.GetActiveSetBonuses() {
		if bonus.Name == "Darkmantle Armor" {
			counts[bonus.NumPieces]++
		}
	}
	for _, threshold := range []int32{2, 4, 6, 8} {
		if counts[threshold] != 1 {
			t.Fatalf("explicit and generated static bonuses overlapped: %v", counts)
		}
	}
	for _, threshold := range []int32{0, 1, 3, 5, 7, 9} {
		if ForeverEquipmentBonusSupported(512, threshold) {
			t.Fatalf("unsupported base threshold accepted: %d", threshold)
		}
	}
}
