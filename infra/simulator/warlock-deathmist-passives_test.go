//go:build with_db

package dps

import (
	"fmt"
	"math"
	"reflect"
	"sync"
	"testing"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
)

var deathmistPassiveRegistration sync.Once

func deathmistPassiveEquipment(pieces int, setID int32) core.Equipment {
	var equipment core.Equipment
	for i := 0; i < pieces; i++ {
		equipment[i] = core.Item{ID: int32(22070 + i), SetID: setID, SetName: "Deathmist Raiment"}
	}
	return equipment
}

func deathmistPassiveExpected(pieces int) stats.Stats {
	var expected stats.Stats
	if pieces >= 2 {
		expected[stats.ArcaneResistance], expected[stats.FireResistance] = 8, 8
		expected[stats.FrostResistance], expected[stats.NatureResistance], expected[stats.ShadowResistance] = 8, 8, 8
	}
	if pieces >= 6 {
		expected[stats.SpellPower] = 23
	}
	if pieces >= 8 {
		expected[stats.BonusArmor] = 200
	}
	return expected
}

func TestKfcDeathmistPassiveThresholds(t *testing.T) {
	for pieces := 0; pieces <= 8; pieces++ {
		t.Run(fmt.Sprint(pieces), func(t *testing.T) {
			equipment := deathmistPassiveEquipment(pieces, 518)
			before := equipment
			got := core.ForeverDeathmistPassiveStats(equipment, proto.Ruleset_RulesetForever)
			if got != deathmistPassiveExpected(pieces) || !reflect.DeepEqual(equipment, before) {
				t.Fatalf("wrong passive vector or mutated equipment: pieces=%d got=%v", pieces, got)
			}
		})
	}
}

func TestKfcDeathmistPassiveIdentityIsolation(t *testing.T) {
	for _, setID := range []int32{0, 1681, 517, 513} {
		if got := core.ForeverDeathmistPassiveStats(deathmistPassiveEquipment(8, setID), proto.Ruleset_RulesetForever); got != (stats.Stats{}) {
			t.Fatalf("same-name set %d contributed base passives: %v", setID, got)
		}
	}
	if got := core.ForeverDeathmistPassiveStats(deathmistPassiveEquipment(8, 518), proto.Ruleset_RulesetClassic); got != (stats.Stats{}) {
		t.Fatal("Forever component changed Classic", got)
	}
	if got := core.ForeverDeathmistPassiveStats(deathmistPassiveEquipment(8, 518), proto.Ruleset(999)); got != (stats.Stats{}) {
		t.Fatal("unknown ruleset received Forever passives", got)
	}
	equipment := deathmistPassiveEquipment(8, 1681)
	for i := 0; i < 3; i++ {
		equipment[i].SetID = 518
	}
	if got := core.ForeverDeathmistPassiveStats(equipment, proto.Ruleset_RulesetForever); got != deathmistPassiveExpected(3) {
		t.Fatal("alternate pieces contributed to base thresholds", got)
	}
	// ID, not the display name, is the dispatch key.
	for i := 0; i < 3; i++ {
		equipment[i].SetName = "localized display name"
	}
	if got := core.ForeverDeathmistPassiveStats(equipment, proto.Ruleset_RulesetForever); got != deathmistPassiveExpected(3) {
		t.Fatal("base passives depend on the English display name", got)
	}
}

func deathmistPassiveSim(delta stats.Stats, armor proto.WarlockOptions_Armor) (*core.Simulation, *DpsWarlock) {
	deathmistPassiveRegistration.Do(RegisterDpsWarlock)
	player := &proto.Player{Class: proto.Class_ClassWarlock, Race: proto.Race_RaceHuman, Level: 60,
		Equipment:  &proto.EquipmentSpec{},
		BonusStats: &proto.UnitStats{Stats: delta.ToFloatArray()},
		Rotation:   &proto.APLRotation{Type: proto.APLRotation_TypeAPL},
		Spec: &proto.Player_Warlock{Warlock: &proto.Warlock{Options: &proto.WarlockOptions{
			Armor: armor, Summon: proto.WarlockOptions_NoSummon}}}}
	encounter := core.MakeSingleTargetEncounter(0)
	encounter.Duration, encounter.DurationVariation = 180, 0
	run := core.NewSim(&proto.RaidSimRequest{Raid: core.SinglePlayerRaidProto(player, nil, nil, nil), Encounter: encounter,
		SimOptions: &proto.SimOptions{Iterations: 1, RandomSeed: 1337, Ruleset: proto.Ruleset_RulesetForever}}, simsignals.Signals{})
	run.Options.Interactive = true
	run.Reset()
	run.PrePull()
	return run, run.Raid.Parties[0].Players[0].(*DpsWarlock)
}

func TestKfcDeathmistPassiveWarlockStatsAndReset(t *testing.T) {
	for _, armor := range []proto.WarlockOptions_Armor{proto.WarlockOptions_NoArmor, proto.WarlockOptions_DemonArmor} {
		t.Run(fmt.Sprint(armor), func(t *testing.T) {
			_, baseline := deathmistPassiveSim(stats.Stats{}, armor)
			delta := core.ForeverDeathmistPassiveStats(deathmistPassiveEquipment(8, 518), proto.Ruleset_RulesetForever)
			run, warlock := deathmistPassiveSim(delta, armor)
			for reset := 0; reset < 3; reset++ {
				if reset > 0 {
					run.Cleanup()
					run.Reset()
					run.PrePull()
				}
				for stat := stats.Stat(0); stat < stats.Len; stat++ {
					want := delta[stat]
					if stat == stats.Armor {
						want = 200
					}
					if got := warlock.GetStat(stat) - baseline.GetStat(stat); math.Abs(got-want) > 1e-7 {
						t.Fatalf("reset=%d stat=%v got=%v want=%v", reset, stat, got, want)
					}
				}
				spell := &core.Spell{Unit: &warlock.Unit}
				baseSpell := &core.Spell{Unit: &baseline.Unit}
				if got := spell.HealingPower(&warlock.Unit) - baseSpell.HealingPower(&baseline.Unit); math.Abs(got-23) > 1e-7 {
					t.Fatal("spell power healing was missing or counted twice", got)
				}
				if warlock.GetAura("Dark Reward") != nil {
					t.Fatal("passive component registered the alternate spellcast heal")
				}
			}
		})
	}
}
