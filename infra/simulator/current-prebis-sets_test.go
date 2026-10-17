//go:build with_db

package common_test

import (
	"fmt"
	"testing"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/stats"
	_ "github.com/wowsims/classic/sim/rogue"
)

type kfcCurrentSetAgent struct {
	core.Agent
	character *core.Character
}

func (agent kfcCurrentSetAgent) GetCharacter() *core.Character { return agent.character }

func TestKfcCurrentPrebisPvPSet548(t *testing.T) {
	if core.HasForeverEquipmentSetDefinition(548) {
		t.Fatal("set 548 acquired a generated override; review its dispatch before admission")
	}
	for pieces := 0; pieces <= 6; pieces++ {
		t.Run(fmt.Sprint(pieces), func(t *testing.T) {
			character := &core.Character{Unit: core.Unit{Env: &core.Environment{Ruleset: proto.Ruleset_RulesetForever}}}
			for slot := 0; slot < pieces; slot++ {
				character.Equipment[slot] = core.Item{SetID: 548, SetName: "Lieutenant Commander's Guard"}
			}
			counts := make(map[int32]int)
			for _, bonus := range character.GetActiveSetBonuses() {
				if bonus.Name != "Lieutenant Commander's Guard" {
					t.Fatalf("unrelated set activated: %s", bonus.Name)
				}
				counts[bonus.NumPieces]++
				bonus.BonusEffect(kfcCurrentSetAgent{character: character})
			}
			want := stats.Stats{}
			if pieces >= 2 {
				want[stats.AttackPower], want[stats.RangedAttackPower] = 40, 40
			}
			if pieces >= 6 {
				want[stats.Stamina] = 20
			}
			if got := character.GetStats(); got != want {
				t.Fatalf("set 548/%d: got %v; want %v", pieces, got, want)
			}
			for _, threshold := range []int32{2, 4, 6} {
				expected := 0
				if int32(pieces) >= threshold {
					expected = 1
				}
				if counts[threshold] != expected {
					t.Fatalf("set 548/%d: threshold %d applied %d times, want %d", pieces, threshold, counts[threshold], expected)
				}
			}
		})
	}
}
