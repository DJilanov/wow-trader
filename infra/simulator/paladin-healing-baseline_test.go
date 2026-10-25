package holy

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

func init() { RegisterHolyPaladin() }

func kfcPaladinFixture(power float64) (*core.Simulation, *HolyPaladin, *core.Unit) {
	bonus := stats.Stats{stats.HealingPower: power, stats.Mana: 10000}
	sim := core.NewSim(&proto.RaidSimRequest{
		Raid: &proto.Raid{Parties: []*proto.Party{{Players: []*proto.Player{{
			Name: "Paladin spell control", Level: 60, Race: proto.Race_RaceHuman, Class: proto.Class_ClassPaladin,
			Equipment: &proto.EquipmentSpec{}, BonusStats: &proto.UnitStats{Stats: bonus.ToFloatArray()},
			Rotation: &proto.APLRotation{Type: proto.APLRotation_TypeAPL},
			Spec:     &proto.Player_HolyPaladin{HolyPaladin: &proto.HolyPaladin{Options: &proto.PaladinOptions{}}},
		}}}}, TargetDummies: 2},
		Encounter:  &proto.Encounter{Duration: 60, Targets: []*proto.Target{{Name: "Synthetic spell-control enemy", Level: 63}}},
		SimOptions: &proto.SimOptions{Iterations: 1, RandomSeed: 73119, Ruleset: proto.Ruleset_RulesetForever, IsTest: true, Interactive: true},
	}, simsignals.CreateSignals())
	sim.Reset()
	return sim, sim.Raid.Parties[0].Players[0].(*HolyPaladin), &sim.Raid.GetFirstTargetDummy().Unit
}

func kfcPaladinNear(t *testing.T, got, want float64) {
	t.Helper()
	if math.IsNaN(got) || math.Abs(got-want) > 1e-7 {
		t.Fatalf("got %.12f, want %.12f", got, want)
	}
}

func kfcPaladinAdvance(t *testing.T, sim *core.Simulation, until time.Duration) {
	t.Helper()
	if until <= sim.CurrentTime {
		return
	}
	done := false
	sim.AddPendingAction(&core.PendingAction{NextActionAt: until, Priority: core.ActionPriorityLow, OnAction: func(_ *core.Simulation) { done = true }})
	for steps := 0; !done; steps++ {
		if steps > 100000 || sim.Step() {
			t.Fatal("Paladin control did not reach its event")
		}
	}
}

func TestKFCPaladinClientDirectHealing(t *testing.T) {
	for _, test := range []struct {
		id                int32
		cast              time.Duration
		coefficient, mana float64
		low, high         float64
	}{
		{635, 2500 * time.Millisecond, .714, 35, 42.199, 50.201},
		{1042, 2500 * time.Millisecond, .714, 275, 440.65, 494.35},
		{10329, 2500 * time.Millisecond, .714, 580, 1177.39, 1308.61},
		{19943, 1500 * time.Millisecond, .429, 140, 291.505, 324.895},
	} {
		amounts := []float64{}
		for _, power := range []float64{0, 500, 500} {
			sim, holy, target := kfcPaladinFixture(power)
			target.RemoveHealth(sim, 9000)
			spell := holy.GetSpell(core.ActionID{SpellID: test.id})
			if spell == nil || spell.DefaultCast.CastTime != test.cast {
				t.Fatalf("Missing client rank/cast: %d", test.id)
			}
			spell.BonusCritRating = -10000
			if len(amounts) == 2 {
				spell.BonusCritRating = 10000
			}
			before := target.CurrentHealth()
			if !spell.Cast(sim, target) {
				t.Fatalf("Cast rejected: %d", test.id)
			}
			kfcPaladinAdvance(t, sim, test.cast-time.Millisecond)
			kfcPaladinNear(t, target.CurrentHealth(), before)
			kfcPaladinAdvance(t, sim, test.cast)
			amounts = append(amounts, target.CurrentHealth()-before)
			kfcPaladinNear(t, holy.Metrics.ManaSpent, test.mana)
		}
		if amounts[0] < test.low || amounts[0] > test.high {
			t.Fatalf("Wrong base/level growth for %d: %f", test.id, amounts[0])
		}
		kfcPaladinNear(t, amounts[1]-amounts[0], 500*test.coefficient)
		kfcPaladinNear(t, amounts[2], 1.5*amounts[1])
		payload, _ := json.Marshal(map[string]interface{}{"spellId": test.id, "amounts": amounts, "mana": test.mana})
		fmt.Printf("KFC_PALADIN_DIRECT %s\n", payload)
	}
}

func TestKFCPaladinAllRanksAndGrowthCaps(t *testing.T) {
	sim, holy, _ := kfcPaladinFixture(0)
	if len(kfcPaladinHealingRanks) != 15 {
		t.Fatal("Incomplete client rank sequence")
	}
	for _, rank := range kfcPaladinHealingRanks {
		spell := holy.GetSpell(core.ActionID{SpellID: rank.ID})
		if spell == nil || spell.Rank != rank.Rank || spell.RequiredLevel != rank.RequiredLevel {
			t.Fatalf("Missing or mismatched rank: %d", rank.ID)
		}
		low, high := rank.bounds(rank.MaxLevel)
		laterLow, laterHigh := rank.bounds(rank.MaxLevel + 20)
		kfcPaladinNear(t, laterLow, low)
		kfcPaladinNear(t, laterHigh, high)
		if !spell.CanCast(sim, &holy.Unit) {
			t.Fatalf("Owned rank cannot cast: %d", rank.ID)
		}
	}
	fmt.Printf("KFC_PALADIN_RANKS %d\n", len(kfcPaladinHealingRanks))
}

func TestKFCPaladinTargetsAndResources(t *testing.T) {
	sim, holy, target := kfcPaladinFixture(500)
	spell := holy.GetSpell(core.ActionID{SpellID: 10329})
	if spell.CanCast(sim, nil) || spell.CanCast(sim, sim.Encounter.TargetUnits[0]) {
		t.Fatal("Invalid friendly target accepted")
	}
	target.RemoveHealth(sim, target.MaxHealth())
	if spell.CanCast(sim, target) || spell.Cast(sim, target) {
		t.Fatal("Healing resurrected a dead target")
	}
	holy.SpendMana(sim, holy.CurrentMana(), holy.NewManaMetrics(core.ActionID{SpellID: 10329, Tag: 99}))
	if spell.CanCast(sim, &holy.Unit) || spell.Cast(sim, &holy.Unit) {
		t.Fatal("Unfunded heal accepted")
	}
}

func TestKFCPaladinEffectiveHealingAndOverhealing(t *testing.T) {
	sim, holy, target := kfcPaladinFixture(500)
	spell := holy.GetSpell(core.ActionID{SpellID: 10329})
	spell.BonusCritRating = -10000
	target.RemoveHealth(sim, 100)
	if !spell.Cast(sim, target) {
		t.Fatal("Injured target cast failed")
	}
	kfcPaladinAdvance(t, sim, 2500*time.Millisecond)
	metrics := spell.SpellMetrics[target.UnitIndex]
	kfcPaladinNear(t, metrics.TotalEffectiveHealing, 100)
	kfcPaladinNear(t, metrics.TotalOverhealing, metrics.TotalHealing-100)
	kfcPaladinNear(t, target.CurrentHealth(), target.MaxHealth())
	fmt.Printf("KFC_PALADIN_EFFECTIVE %.8f\n", metrics.TotalEffectiveHealing)
}

func TestKFCPaladinCastLockAndIterationReset(t *testing.T) {
	sim, holy, target := kfcPaladinFixture(500)
	spell := holy.GetSpell(core.ActionID{SpellID: 10329})
	target.RemoveHealth(sim, 9000)
	if !spell.Cast(sim, target) {
		t.Fatal("Initial heal failed")
	}
	other := holy.GetSpell(core.ActionID{SpellID: 19943})
	if other.CanCast(sim, target) {
		t.Fatal("Hard cast did not lock the next heal")
	}
	kfcPaladinAdvance(t, sim, 2500*time.Millisecond)
	if !other.CanCast(sim, target) {
		t.Fatal("Completed hard cast left the next heal locked")
	}
	sim.Cleanup()
	sim.Reset()
	kfcPaladinNear(t, target.CurrentHealth(), target.MaxHealth())
	kfcPaladinNear(t, holy.CurrentMana(), holy.MaxMana())
	kfcPaladinNear(t, holy.Metrics.ManaSpent, 0)
	if !other.CanCast(sim, target) {
		t.Fatal("Cast lock leaked across iterations")
	}
}
