package restoration

import (
	"encoding/json"
	"fmt"
	"math"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
)

func init() { RegisterKFCShamanDirectControls() }

func kfcShamanDirectFixture(level int32, power float64) (*core.Simulation, *KFCShamanDirectControls, *core.Unit) {
	bonus := stats.Stats{stats.HealingPower: power, stats.Mana: 10000}
	sim := core.NewSim(&proto.RaidSimRequest{
		Raid: &proto.Raid{Parties: []*proto.Party{{Players: []*proto.Player{{
			Name: "Shaman direct spell control", Level: level, Race: proto.Race_RaceTroll, Class: proto.Class_ClassShaman,
			Equipment: &proto.EquipmentSpec{}, BonusStats: &proto.UnitStats{Stats: bonus.ToFloatArray()},
			Rotation: &proto.APLRotation{Type: proto.APLRotation_TypeAPL},
			Spec:     &proto.Player_RestorationShaman{RestorationShaman: &proto.RestorationShaman{Options: &proto.RestorationShaman_Options{}}},
		}}}}, TargetDummies: 2},
		Encounter:  &proto.Encounter{Duration: 60, Targets: []*proto.Target{{Name: "Synthetic direct-control enemy", Level: 63}}},
		SimOptions: &proto.SimOptions{Iterations: 1, RandomSeed: 73123, Ruleset: proto.Ruleset_RulesetForever, IsTest: true, Interactive: true},
	}, simsignals.CreateSignals())
	sim.Reset()
	return sim, sim.Raid.Parties[0].Players[0].(*KFCShamanDirectControls), &sim.Raid.GetFirstTargetDummy().Unit
}

func kfcShamanDirectNear(t *testing.T, got, want float64) {
	t.Helper()
	if math.IsNaN(got) || math.IsInf(got, 0) || math.Abs(got-want) > 1e-7 {
		t.Fatalf("got %.12f, want %.12f", got, want)
	}
}

func kfcShamanDirectAdvance(t *testing.T, sim *core.Simulation, until time.Duration) {
	t.Helper()
	done := false
	sim.AddPendingAction(&core.PendingAction{NextActionAt: until, Priority: core.ActionPriorityLow, OnAction: func(_ *core.Simulation) { done = true }})
	for steps := 0; !done; steps++ {
		if steps > 100000 || sim.Step() {
			t.Fatal("Shaman control did not reach its event")
		}
	}
}

func TestKFCShamanEveryDirectRank(t *testing.T) {
	if len(kfcShamanDirectRanks) != 16 {
		t.Fatalf("Expected sixteen direct ranks, got %d", len(kfcShamanDirectRanks))
	}
	for _, rank := range kfcShamanDirectRanks {
		amounts := []float64{}
		for _, power := range []float64{0, 500, 500} {
			sim, healer, target := kfcShamanDirectFixture(60, power)
			target.RemoveHealth(sim, 9000)
			spell := healer.GetSpell(core.ActionID{SpellID: rank.ID})
			if spell == nil || spell.DefaultCast.CastTime != time.Duration(rank.CastMs)*time.Millisecond {
				t.Fatalf("Missing client spell or cast: %d", rank.ID)
			}
			if spell.DefaultCast.GCD != time.Duration(rank.GCDMs)*time.Millisecond {
				t.Fatalf("Wrong GCD for %d", rank.ID)
			}
			spell.BonusCritRating = -10000
			if len(amounts) == 2 {
				spell.BonusCritRating = 10000
			}
			before := target.CurrentHealth()
			if !spell.Cast(sim, target) {
				t.Fatalf("Cast rejected: %d", rank.ID)
			}
			kfcShamanDirectNear(t, target.CurrentHealth(), before)
			kfcShamanDirectAdvance(t, sim, time.Duration(rank.CastMs)*time.Millisecond-time.Millisecond)
			kfcShamanDirectNear(t, target.CurrentHealth(), before)
			kfcShamanDirectAdvance(t, sim, time.Duration(rank.CastMs)*time.Millisecond)
			amounts = append(amounts, target.CurrentHealth()-before)
			kfcShamanDirectNear(t, healer.Metrics.ManaSpent, rank.Mana)
		}
		low, high := rank.bounds(60)
		if amounts[0] < low || amounts[0] > high {
			t.Fatalf("Client range changed for %d: %f outside [%f,%f]", rank.ID, amounts[0], low, high)
		}
		kfcShamanDirectNear(t, amounts[1]-amounts[0], 500*rank.Coefficient)
		kfcShamanDirectNear(t, amounts[2], 1.5*amounts[1])
		payload, err := json.Marshal(map[string]interface{}{"spellId": rank.ID, "amounts": amounts, "mana": rank.Mana, "castMs": rank.CastMs, "gcdMs": rank.GCDMs})
		if err != nil {
			t.Fatal(err)
		}
		fmt.Printf("KFC_SHAMAN_DIRECT %s\n", payload)
	}
}

func TestKFCShamanDirectTargetGuards(t *testing.T) {
	sim, healer, target := kfcShamanDirectFixture(60, 500)
	spell := healer.GetSpell(core.ActionID{SpellID: 10468})
	if spell.CanCast(sim, nil) || spell.CanCast(sim, healer.Env.Encounter.TargetUnits[0]) {
		t.Fatal("Direct healing accepted nil or enemy target")
	}
	target.RemoveHealth(sim, target.CurrentHealth())
	if spell.CanCast(sim, target) {
		t.Fatal("Direct healing accepted a dead ally")
	}
	kfcShamanDirectNear(t, healer.Metrics.ManaSpent, 0)
	fmt.Println("KFC_SHAMAN_TARGET_GUARDS true")
}

func TestKFCShamanDirectGCDAndMana(t *testing.T) {
	sim, healer, target := kfcShamanDirectFixture(60, 0)
	spell := healer.GetSpell(core.ActionID{SpellID: 10468})
	if !spell.Cast(sim, target) {
		t.Fatal("Initial direct cast failed")
	}
	if spell.CanCast(sim, target) {
		t.Fatal("Another cast bypassed the GCD")
	}
	kfcShamanDirectAdvance(t, sim, 1500*time.Millisecond)
	healer.SpendMana(sim, healer.CurrentMana(), healer.NewManaMetrics(core.ActionID{SpellID: 1}))
	if spell.CanCast(sim, target) {
		t.Fatal("Direct healing accepted insufficient mana")
	}
	fmt.Println("KFC_SHAMAN_RESOURCE_GUARDS true")
}

func TestKFCShamanDirectRankLevelAndScope(t *testing.T) {
	_, healer, _ := kfcShamanDirectFixture(1, 0)
	for _, rank := range kfcShamanDirectRanks {
		available := healer.GetSpell(core.ActionID{SpellID: rank.ID}) != nil
		if available != (rank.RequiredLevel <= 1) {
			t.Fatalf("Rank level gate changed: %d", rank.ID)
		}
	}
	_, healer, _ = kfcShamanDirectFixture(60, 0)
	for _, id := range []int32{1064, 10622, 10623, 408521, 1239242, 1239243} {
		if healer.GetSpell(core.ActionID{SpellID: id}) != nil {
			t.Fatalf("Unreviewed heal registered: %d", id)
		}
	}
	fmt.Println("KFC_SHAMAN_LEVEL_AND_SCOPE true")
}

func TestKFCShamanDirectLevelGrowth(t *testing.T) {
	var first kfcShamanDirectRank
	for _, rank := range kfcShamanDirectRanks {
		if rank.ID == 331 {
			first = rank
		}
	}
	if first.ID == 0 {
		t.Fatal("Missing Healing Wave rank one")
	}
	low, high := first.bounds(1)
	kfcShamanDirectNear(t, (low+high)/2, 39)
	low, high = first.bounds(5)
	kfcShamanDirectNear(t, (low+high)/2, 41.8)
	lastLow, lastHigh := first.bounds(60)
	kfcShamanDirectNear(t, lastLow, low)
	kfcShamanDirectNear(t, lastHigh, high)
	fmt.Printf("KFC_SHAMAN_LEVEL_GROWTH [%g,%g]\n", low, high)
}
