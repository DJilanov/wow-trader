package healing

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

func kfcPriestFixture(power float64) (*core.Simulation, *HealingPriest, *core.Unit) {
	bonus := stats.Stats{stats.HealingPower: power, stats.Mana: 10000}
	sim := core.NewSim(&proto.RaidSimRequest{
		Raid: &proto.Raid{Parties: []*proto.Party{{Players: []*proto.Player{{
			Name: "Priest control", Race: proto.Race_RaceHuman, Class: proto.Class_ClassPriest,
			Equipment: &proto.EquipmentSpec{}, BonusStats: &proto.UnitStats{Stats: bonus.ToFloatArray()},
			Rotation: &proto.APLRotation{Type: proto.APLRotation_TypeAPL},
			Spec:     &proto.Player_HealingPriest{HealingPriest: &proto.HealingPriest{Options: &proto.HealingPriest_Options{}}},
		}}}}, TargetDummies: 2},
		Encounter:  &proto.Encounter{Duration: 60, Targets: []*proto.Target{{Name: "Control enemy", Level: 63}}},
		SimOptions: &proto.SimOptions{Iterations: 1, RandomSeed: 7911, Ruleset: proto.Ruleset_RulesetForever, IsTest: true, Interactive: true},
	}, simsignals.CreateSignals())
	sim.Reset()
	priest := sim.Raid.Parties[0].Players[0].(*HealingPriest)
	return sim, priest, &sim.Raid.GetFirstTargetDummy().Unit
}

func kfcPriestAdvance(t *testing.T, sim *core.Simulation, until time.Duration) {
	t.Helper()
	if until <= sim.CurrentTime {
		return
	}
	done := false
	sim.AddPendingAction(&core.PendingAction{NextActionAt: until, Priority: core.ActionPriorityLow,
		OnAction: func(_ *core.Simulation) { done = true }})
	for steps := 0; !done; steps++ {
		if steps > 100000 || sim.Step() {
			t.Fatal("Healing control did not reach its scheduled event")
		}
	}
}

func kfcPriestNear(t *testing.T, got, want float64) {
	t.Helper()
	if math.IsNaN(got) || math.Abs(got-want) > 1e-7 {
		t.Fatalf("got %.12f; want %.12f", got, want)
	}
}

func TestKFCPriestDirectHealing(t *testing.T) {
	observed := []float64{}
	for _, power := range []float64{0, 500} {
		sim, priest, target := kfcPriestFixture(power)
		target.RemoveHealth(sim, 4000)
		spell := priest.FlashHeal[7]
		spell.BonusCritRating = -10000
		if spell.ActionID.SpellID != 10917 || spell.DefaultCast.CastTime != 1500*time.Millisecond {
			t.Fatal("Flash Heal did not use the captured rank/cast time")
		}
		beforeMana, beforeHealth := priest.CurrentMana(), target.CurrentHealth()
		if !spell.Cast(sim, target) {
			t.Fatal("Flash Heal cast was rejected")
		}
		kfcPriestNear(t, target.CurrentHealth(), beforeHealth)
		kfcPriestAdvance(t, sim, 1499*time.Millisecond)
		kfcPriestNear(t, target.CurrentHealth(), beforeHealth)
		kfcPriestAdvance(t, sim, 1500*time.Millisecond)
		amount := target.CurrentHealth() - beforeHealth
		if amount < 773 || amount > 910+500*.429 {
			t.Fatalf("Unexpected client-derived Flash Heal amount: %f", amount)
		}
		kfcPriestNear(t, priest.Metrics.ManaSpent, 380)
		kfcPriestNear(t, beforeMana-priest.CurrentMana(), 380)
		kfcPriestNear(t, spell.SpellMetrics[target.UnitIndex].TotalEffectiveHealing, amount)
		kfcPriestNear(t, spell.SpellMetrics[target.UnitIndex].TotalOverhealing, 0)
		observed = append(observed, amount)
	}
	kfcPriestNear(t, observed[1]-observed[0], 500*.429)
	bytes, err := json.Marshal(map[string]interface{}{"flash": observed, "coefficientDelta": observed[1] - observed[0], "mana": 380})
	if err != nil {
		t.Fatal(err)
	}
	fmt.Printf("KFC_PRIEST_DIRECT %s\n", bytes)
}

func TestKFCPriestOverhealingAndTargets(t *testing.T) {
	sim, priest, target := kfcPriestFixture(500)
	spell := priest.FlashHeal[7]
	spell.BonusCritRating = -10000
	if spell.CanCast(sim, sim.Encounter.TargetUnits[0]) {
		t.Fatal("Healing an enemy was allowed")
	}
	if spell.CanCast(sim, nil) {
		t.Fatal("Healing a nil target was allowed")
	}
	target.RemoveHealth(sim, 100)
	if !spell.Cast(sim, target) {
		t.Fatal("Injured target cast failed")
	}
	kfcPriestAdvance(t, sim, 1500*time.Millisecond)
	metrics := spell.SpellMetrics[target.UnitIndex]
	kfcPriestNear(t, metrics.TotalEffectiveHealing, 100)
	kfcPriestNear(t, metrics.TotalOverhealing, metrics.TotalHealing-100)
	kfcPriestNear(t, target.CurrentHealth(), target.MaxHealth())
	target.RemoveHealth(sim, target.MaxHealth())
	if spell.CanCast(sim, target) || spell.Cast(sim, target) {
		t.Fatal("Ordinary healing could resurrect a dead target")
	}
	priest.SpendMana(sim, priest.CurrentMana(), priest.NewManaMetrics(core.ActionID{SpellID: 10917, Tag: 99}))
	if spell.CanCast(sim, &priest.Unit) {
		t.Fatal("Healing without sufficient mana was allowed")
	}
}

func TestKFCPriestOtherDirectFamiliesAndCrits(t *testing.T) {
	for _, test := range []struct {
		id                int32
		coefficient, mana float64
		cast              time.Duration
	}{{2050, .429, 30, 1500 * time.Millisecond}, {6064, .857, 305, 3 * time.Second},
		{10965, .857, 655, 3 * time.Second}, {25314, .857, 710, 3 * time.Second}} {
		amounts := []float64{}
		for _, power := range []float64{0, 500, 500} {
			sim, priest, target := kfcPriestFixture(power)
			target.RemoveHealth(sim, 9000)
			spell := priest.GetSpell(core.ActionID{SpellID: test.id})
			if spell == nil || spell.DefaultCast.CastTime != test.cast {
				t.Fatalf("Missing direct rank %d", test.id)
			}
			spell.BonusCritRating = -10000
			if len(amounts) == 2 {
				spell.BonusCritRating = 10000
			}
			before := target.CurrentHealth()
			if !spell.Cast(sim, target) {
				t.Fatalf("Direct rank %d did not cast", test.id)
			}
			kfcPriestAdvance(t, sim, test.cast)
			amounts = append(amounts, target.CurrentHealth()-before)
			kfcPriestNear(t, priest.Metrics.ManaSpent, test.mana)
		}
		kfcPriestNear(t, amounts[1]-amounts[0], 500*test.coefficient)
		kfcPriestNear(t, amounts[2], amounts[1]*1.5)
	}
}

func TestKFCPriestRenewTicksAndReplacement(t *testing.T) {
	sim, priest, target := kfcPriestFixture(500)
	target.RemoveHealth(sim, 5000)
	spell := priest.Renew[9]
	before := target.CurrentHealth()
	if !spell.Cast(sim, target) {
		t.Fatal("Renew cast failed")
	}
	kfcPriestNear(t, target.CurrentHealth(), before)
	kfcPriestAdvance(t, sim, 2999*time.Millisecond)
	kfcPriestNear(t, target.CurrentHealth(), before)
	kfcPriestAdvance(t, sim, 3000*time.Millisecond)
	kfcPriestNear(t, target.CurrentHealth()-before, 134+.2*500)
	kfcPriestAdvance(t, sim, 15000*time.Millisecond)
	kfcPriestNear(t, target.CurrentHealth()-before, 5*(134+.2*500))
	kfcPriestNear(t, spell.SpellMetrics[target.UnitIndex].TotalCritHealing, 0)
	if spell.Hot(target).IsActive() {
		t.Fatal("Renew remained active beyond its client duration")
	}
	if !spell.Cast(sim, target) {
		t.Fatal("Renew refresh failed")
	}
	kfcPriestAdvance(t, sim, 16500*time.Millisecond)
	if !priest.Renew[8].Cast(sim, target) {
		t.Fatal("Lower-rank Renew replacement failed")
	}
	if spell.Hot(target).IsActive() || !priest.Renew[8].Hot(target).IsActive() {
		t.Fatal("Different Renew ranks stacked")
	}
	fmt.Printf("KFC_PRIEST_RENEW %.8f\n", 5*(134+.2*500))
}

func TestKFCPriestShieldAbsorptionAndLockout(t *testing.T) {
	sim, priest, target := kfcPriestFixture(500)
	spell := priest.PowerWordShield[10]
	if !spell.Cast(sim, target) {
		t.Fatal("Shield cast failed")
	}
	kfcPriestNear(t, spell.Shield(target).RemainingAbsorb(), 978)
	kfcPriestNear(t, spell.SpellMetrics[target.UnitIndex].TotalAbsorbedShielding, 0)
	kfcPriestNear(t, priest.Metrics.ManaSpent, 500)
	kfcPriestAdvance(t, sim, 4000*time.Millisecond)
	if spell.CanCast(sim, target) {
		t.Fatal("Weakened Soul did not block a new shield")
	}
	enemy := sim.Encounter.TargetUnits[0]
	incoming := enemy.RegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: 1}, SpellSchool: core.SpellSchoolPhysical,
		ProcMask: core.ProcMaskSpellDamage, DamageMultiplier: 1, ThreatMultiplier: 1})
	result := incoming.NewResult(target)
	result.Damage, result.Outcome = 300, core.OutcomeHit
	incoming.DealDamage(sim, result)
	kfcPriestNear(t, spell.Shield(target).RemainingAbsorb(), 678)
	kfcPriestNear(t, spell.SpellMetrics[target.UnitIndex].TotalAbsorbedShielding, 300)
	kfcPriestAdvance(t, sim, 15000*time.Millisecond)
	if !priest.PowerWordShield[9].Cast(sim, target) {
		t.Fatal("Shield lockout did not expire")
	}
	if spell.Shield(target).IsActive() {
		t.Fatal("Two shield ranks stacked")
	}
	kfcPriestAdvance(t, sim, 45000*time.Millisecond)
	if priest.PowerWordShield[9].Shield(target).IsActive() {
		t.Fatal("Shield did not expire")
	}
	fmt.Printf("KFC_PRIEST_SHIELD %d\n", 300)
}

func TestKFCPriestIterationReset(t *testing.T) {
	sim, priest, target := kfcPriestFixture(500)
	target.RemoveHealth(sim, 5000)
	if !priest.Renew[9].Cast(sim, target) {
		t.Fatal("Initial Renew cast failed")
	}
	kfcPriestAdvance(t, sim, 1500*time.Millisecond)
	if !priest.PowerWordShield[10].Cast(sim, target) {
		t.Fatal("Initial shield cast failed")
	}
	sim.Cleanup()
	sim.Reset()
	kfcPriestNear(t, target.CurrentHealth(), target.MaxHealth())
	kfcPriestNear(t, priest.CurrentMana(), priest.MaxMana())
	kfcPriestNear(t, priest.Metrics.ManaSpent, 0)
	if priest.Renew[9].Hot(target).IsActive() || priest.PowerWordShield[10].Shield(target).IsActive() || priest.WeakenedSouls.Get(target).IsActive() {
		t.Fatal("Healing effects leaked across iterations")
	}
	kfcPriestNear(t, priest.PowerWordShield[10].Shield(target).RemainingAbsorb(), 0)
}
