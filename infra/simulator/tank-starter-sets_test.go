package core

import (
	"testing"

	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/stats"
)

func TestKfcTankStarterSetThresholds(t *testing.T) {
	for _, tc := range []struct {
		id    int32
		stat  stats.Stat
		value float64
	}{
		{281, stats.AttackPower, 40},
		{382, stats.AttackPower, 40},
		{2086, stats.SpellPower, 23},
	} {
		set := foreverEquipmentSets[tc.id]
		if set.Bonuses[2].Stats[tc.stat] != tc.value || set.Bonuses[6].Stats[stats.Stamina] != 20 || set.Bonuses[4].Supported {
			t.Fatalf("incorrect starter thresholds for set %d", tc.id)
		}
		for _, count := range []int{1, 2, 5, 6} {
			character := &Character{Unit: Unit{Env: &Environment{Ruleset: proto.Ruleset_RulesetForever}}}
			for slot := 0; slot < count; slot++ {
				character.Equipment[slot] = Item{SetID: tc.id, SetName: set.Name}
			}
			bonuses := character.GetActiveSetBonuses()
			want := 0
			if count >= 2 {
				want++
			}
			if count >= 6 {
				want++
			}
			if len(bonuses) != want {
				t.Fatalf("set %d/%d: got %d bonuses, want %d; legacy bonuses must not leak", tc.id, count, len(bonuses), want)
			}
		}
	}
}
