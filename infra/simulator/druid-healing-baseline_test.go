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

func init() { RegisterRestorationDruid() }

func kfcDruidFixture(power float64) (*core.Simulation, *RestorationDruid, *core.Unit) {
	bonus := stats.Stats{stats.HealingPower: power, stats.Mana: 10000}
	sim := core.NewSim(&proto.RaidSimRequest{
		Raid: &proto.Raid{Parties: []*proto.Party{{Players: []*proto.Player{{
			Name: "Druid spell control", Level: 60, Race: proto.Race_RaceNightElf, Class: proto.Class_ClassDruid,
			Equipment: &proto.EquipmentSpec{}, BonusStats: &proto.UnitStats{Stats: bonus.ToFloatArray()},
			Rotation: &proto.APLRotation{Type: proto.APLRotation_TypeAPL},
			Spec:     &proto.Player_RestorationDruid{RestorationDruid: &proto.RestorationDruid{Options: &proto.RestorationDruid_Options{}}},
		}}}}, TargetDummies: 2},
		Encounter:  &proto.Encounter{Duration: 60, Targets: []*proto.Target{{Name: "Synthetic spell-control enemy", Level: 63}}},
		SimOptions: &proto.SimOptions{Iterations: 1, RandomSeed: 7911, Ruleset: proto.Ruleset_RulesetForever, IsTest: true, Interactive: true},
	}, simsignals.CreateSignals())
	sim.Reset()
	return sim, sim.Raid.Parties[0].Players[0].(*RestorationDruid), &sim.Raid.GetFirstTargetDummy().Unit
}

func kfcDruidNear(t *testing.T, got, want float64) {
	t.Helper()
	if math.IsNaN(got) || math.Abs(got-want) > 1e-7 {
		t.Fatalf("got %.12f, want %.12f", got, want)
	}
}

func kfcDruidAdvance(t *testing.T, sim *core.Simulation, until time.Duration) {
	t.Helper()
	if until <= sim.CurrentTime {
		return
	}
	done := false
	sim.AddPendingAction(&core.PendingAction{NextActionAt: until, Priority: core.ActionPriorityLow, OnAction: func(_ *core.Simulation) { done = true }})
	for steps := 0; !done; steps++ {
		if steps > 100000 || sim.Step() {
			t.Fatal("Druid control did not reach its event")
		}
	}
}

func TestKFCDruidClientDirectParts(t *testing.T) {
	for _, test := range []struct {
		id                int32
		cast              time.Duration
		coefficient, mana float64
		baseLow, baseHigh float64
	}{
		{5185, 1500 * time.Millisecond, .429, 25, 40.19, 54.21}, {9889, 3500 * time.Millisecond, 1, 755, 1787.95, 2104.85}, {9858, 2 * time.Second, .286, 525, 965.18, 1076.82},
	} {
		amounts := []float64{}
		for _, power := range []float64{0, 500, 500} {
			sim, resto, target := kfcDruidFixture(power)
			target.RemoveHealth(sim, 9000)
			spell := resto.GetSpell(core.ActionID{SpellID: test.id})
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
			kfcDruidNear(t, target.CurrentHealth(), before)
			kfcDruidAdvance(t, sim, test.cast-time.Millisecond)
			kfcDruidNear(t, target.CurrentHealth(), before)
			kfcDruidAdvance(t, sim, test.cast)
			amounts = append(amounts, target.CurrentHealth()-before)
			kfcDruidNear(t, resto.Metrics.ManaSpent, test.mana)
		}
		if amounts[0] < test.baseLow || amounts[0] > test.baseHigh {
			t.Fatalf("Client base or clamped level growth changed for %d: %f", test.id, amounts[0])
		}
		kfcDruidNear(t, amounts[1]-amounts[0], 500*test.coefficient)
		kfcDruidNear(t, amounts[2], 1.5*amounts[1])
		payload, _ := json.Marshal(map[string]interface{}{"spellId": test.id, "amounts": amounts, "mana": test.mana})
		fmt.Printf("KFC_DRUID_DIRECT %s\n", payload)
	}
}

func TestKFCDruidRejuvenationSnapshotAndTicks(t *testing.T) {
	sim, resto, target := kfcDruidFixture(500)
	target.RemoveHealth(sim, 9000)
	spell := resto.GetSpell(core.ActionID{SpellID: 9841})
	spell.BonusCritRating = 10000
	before := target.CurrentHealth()
	if !spell.Cast(sim, target) {
		t.Fatal("Rejuvenation failed")
	}
	kfcDruidNear(t, target.CurrentHealth(), before)
	kfcDruidAdvance(t, sim, 2999*time.Millisecond)
	kfcDruidNear(t, target.CurrentHealth(), before)
	kfcDruidAdvance(t, sim, 3*time.Second)
	kfcDruidNear(t, target.CurrentHealth()-before, 261*1.5)
	resto.AddStatDynamic(sim, stats.HealingPower, 500)
	spell.BonusCritRating = -10000
	kfcDruidAdvance(t, sim, 12*time.Second)
	kfcDruidNear(t, target.CurrentHealth()-before, 4.5*261)
	if spell.Hot(target).IsActive() {
		t.Fatal("Rejuvenation outlived its duration")
	}
	kfcDruidNear(t, spell.SpellMetrics[target.UnitIndex].TotalCritHealing, 261*1.5)
	kfcDruidNear(t, resto.Metrics.ManaSpent, 335)
	fmt.Printf("KFC_DRUID_REJUVENATION %.8f\n", target.CurrentHealth()-before)
}

func TestKFCDruidRegrowthDirectAndHoTAreIndependent(t *testing.T) {
	observed := []float64{}
	for _, power := range []float64{0, 500} {
		sim, resto, target := kfcDruidFixture(power)
		target.RemoveHealth(sim, 9000)
		spell := resto.GetSpell(core.ActionID{SpellID: 9858})
		spell.BonusCritRating = -10000
		if !spell.Cast(sim, target) {
			t.Fatal("Regrowth failed")
		}
		kfcDruidAdvance(t, sim, 2*time.Second)
		beforeTicks := target.CurrentHealth()
		kfcDruidAdvance(t, sim, 4999*time.Millisecond)
		kfcDruidNear(t, target.CurrentHealth(), beforeTicks)
		kfcDruidAdvance(t, sim, 5*time.Second)
		one := target.CurrentHealth() - beforeTicks
		kfcDruidAdvance(t, sim, 23*time.Second)
		kfcDruidNear(t, target.CurrentHealth()-beforeTicks, 7*one)
		if spell.Hot(target).IsActive() {
			t.Fatal("Regrowth HoT outlived 21 seconds after cast completion")
		}
		observed = append(observed, one)
	}
	kfcDruidNear(t, observed[1]-observed[0], 500*.071)
	payload, _ := json.Marshal(observed)
	fmt.Printf("KFC_DRUID_REGROWTH_TICKS %s\n", payload)
}

func TestKFCDruidSameFamilyReplacesRanksAndDifferentHoTsCoexist(t *testing.T) {
	sim, resto, target := kfcDruidFixture(500)
	target.RemoveHealth(sim, 9000)
	high := resto.GetSpell(core.ActionID{SpellID: 9841})
	low := resto.GetSpell(core.ActionID{SpellID: 9839})
	regrowth := resto.GetSpell(core.ActionID{SpellID: 9858})
	if !high.Cast(sim, target) {
		t.Fatal("Rejuvenation failed")
	}
	kfcDruidAdvance(t, sim, 1500*time.Millisecond)
	if !low.Cast(sim, target) {
		t.Fatal("Rejuvenation replacement failed")
	}
	if high.Hot(target).IsActive() || !low.Hot(target).IsActive() {
		t.Fatal("Different Rejuvenation ranks stacked")
	}
	kfcDruidAdvance(t, sim, 3*time.Second)
	if !regrowth.Cast(sim, target) {
		t.Fatal("Regrowth failed")
	}
	kfcDruidAdvance(t, sim, 5*time.Second)
	if !low.Hot(target).IsActive() || !regrowth.Hot(target).IsActive() {
		t.Fatal("Regrowth displaced Rejuvenation")
	}
}

func TestKFCDruidTargetsResourcesAndOverhealing(t *testing.T) {
	sim, resto, target := kfcDruidFixture(500)
	spell := resto.GetSpell(core.ActionID{SpellID: 9889})
	if spell.CanCast(sim, nil) || spell.CanCast(sim, sim.Encounter.TargetUnits[0]) {
		t.Fatal("Invalid friendly target accepted")
	}
	spell.BonusCritRating = -10000
	target.RemoveHealth(sim, 100)
	if !spell.Cast(sim, target) {
		t.Fatal("Injured target cast failed")
	}
	kfcDruidAdvance(t, sim, 3500*time.Millisecond)
	metrics := spell.SpellMetrics[target.UnitIndex]
	kfcDruidNear(t, metrics.TotalEffectiveHealing, 100)
	kfcDruidNear(t, metrics.TotalOverhealing, metrics.TotalHealing-100)
	target.RemoveHealth(sim, target.MaxHealth())
	if spell.CanCast(sim, target) || spell.Cast(sim, target) {
		t.Fatal("Healing resurrected a dead target")
	}
	resto.SpendMana(sim, resto.CurrentMana(), resto.NewManaMetrics(core.ActionID{SpellID: 9889, Tag: 99}))
	if spell.CanCast(sim, &resto.Unit) {
		t.Fatal("Unfunded heal accepted")
	}
}

func TestKFCDruidHealingIterationReset(t *testing.T) {
	sim, resto, target := kfcDruidFixture(500)
	target.RemoveHealth(sim, 9000)
	spell := resto.GetSpell(core.ActionID{SpellID: 9841})
	if !spell.Cast(sim, target) {
		t.Fatal("Initial HoT failed")
	}
	kfcDruidAdvance(t, sim, 1500*time.Millisecond)
	sim.Cleanup()
	sim.Reset()
	kfcDruidNear(t, target.CurrentHealth(), target.MaxHealth())
	kfcDruidNear(t, resto.CurrentMana(), resto.MaxMana())
	kfcDruidNear(t, resto.Metrics.ManaSpent, 0)
	if spell.Hot(target).IsActive() {
		t.Fatal("HoT leaked across iterations")
	}
}
