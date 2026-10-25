package restoration

import (
	"context"
	"math"
	"reflect"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
)

func kfcDruidResearchReference() KFCDruidHealingResearchPolicy {
	return KFCDruidHealingResearchPolicy{Schema: "kfc-druid-healing-research.v1", ID: "control-reference", ClassProcMode: "unchanged", OmenProcChance: .2, OmenEvents: "direct-heals", RegrowthPeriodicCrits: true}
}
func kfcDruidResearchApply(t *testing.T, resto *RestorationDruid, policy KFCDruidHealingResearchPolicy) {
	t.Helper()
	if err := resto.ConfigureKFCDruidHealingResearch(policy); err != nil {
		t.Fatal(err)
	}
}

func TestKFCDruidResearchValidationAndFreshActor(t *testing.T) {
	for _, kind := range []string{"nan", "chance", "events", "gap", "mode", "reference"} {
		_, resto := kfcDruidAdvancedFixture(500, nil, 2)
		policy := kfcDruidResearchReference()
		switch kind {
		case "nan":
			policy.OmenProcChance = math.NaN()
		case "chance":
			policy.OmenProcChance = 1.1
		case "events":
			policy.OmenEvents = "periodic-guaranteed"
		case "gap":
			policy.FullScalingGap = -1
		case "mode":
			policy.ClassProcMode = "free-procs"
		case "reference":
			policy.FullScalingGap = 17
		}
		if err := resto.ConfigureKFCDruidHealingResearch(policy); err == nil {
			t.Fatalf("Invalid research accepted: %s", kind)
		}
	}
	sim, resto := kfcDruidAdvancedFixture(500, nil, 2)
	policy := kfcDruidResearchReference()
	kfcDruidResearchApply(t, resto, policy)
	if err := resto.ConfigureKFCDruidHealingResearch(policy); err == nil {
		t.Fatal("Research reconfigured twice")
	}
	sim, resto = kfcDruidAdvancedFixture(500, nil, 2)
	resto.GetSpell(core.ActionID{SpellID: 9841}).Cast(sim, &resto.Unit)
	if err := resto.ConfigureKFCDruidHealingResearch(policy); err == nil {
		t.Fatal("Research changed after casting")
	}
}

func TestKFCDruidResearchDirectAndPeriodicCoefficients(t *testing.T) {
	output := []float64{}
	for _, entry := range []struct {
		id          int32
		duration    time.Duration
		coefficient float64
	}{{5185, 1500 * time.Millisecond, 0}, {774, 3 * time.Second, 0}, {8936, 5 * time.Second, 0}, {740, 2 * time.Second, .067 * .35}, {408120, time.Second, .033 * .85}} {
		amounts := []float64{}
		for _, power := range []float64{0, 500} {
			sim, resto := kfcDruidAdvancedFixture(power, map[string]int32{"wildGrowth": 1}, 2)
			policy := kfcDruidResearchReference()
			policy.FullScalingGap = 17
			policy.CoefficientLossPerLevel = .05
			policy.OmenProcChance = 0
			kfcDruidResearchApply(t, resto, policy)
			target := &sim.Raid.GetFirstTargetDummy().Unit
			if entry.id == 740 {
				target = &resto.Unit
			}
			target.RemoveHealth(sim, math.Min(9000, target.MaxHealth()/2))
			spell := resto.GetSpell(core.ActionID{SpellID: entry.id})
			spell.BonusCritRating = -10000
			if !spell.Cast(sim, target) {
				t.Fatal("Research cast failed")
			}
			kfcDruidAdvance(t, sim, entry.duration)
			amount := spell.SpellMetrics[target.UnitIndex].TotalHealing
			amounts = append(amounts, amount)
			if entry.id == 5185 {
				kfcDruidNear(t, spell.Cost.GetCurrentCost(), 25)
			}
		}
		expected := 500 * entry.coefficient
		if entry.id == 408120 {
			expected *= 1.3
		}
		kfcDruidNear(t, amounts[1]-amounts[0], expected)
		output = append(output, amounts...)
	}
	kfcDruidAdvancedResult("RESEARCH_COEFFICIENTS", output)
}

func TestKFCDruidResearchSwiftmendUsesScaledSnapshotOnce(t *testing.T) {
	sim, resto := kfcDruidAdvancedFixture(500, map[string]int32{"swiftmend": 1}, 2)
	policy := kfcDruidResearchReference()
	policy.FullScalingGap = 17
	policy.CoefficientLossPerLevel = .05
	policy.OmenProcChance = 0
	kfcDruidResearchApply(t, resto, policy)
	target := &sim.Raid.GetFirstTargetDummy().Unit
	target.RemoveHealth(sim, 9000)
	resto.GetSpell(core.ActionID{SpellID: 774}).Cast(sim, target)
	kfcDruidAdvance(t, sim, 1500*time.Millisecond)
	swift := resto.GetSpell(core.ActionID{SpellID: 18562})
	swift.BonusCritRating = -10000
	before := target.CurrentHealth()
	if !swift.Cast(sim, target) {
		t.Fatal("Swiftmend failed")
	}
	kfcDruidNear(t, target.CurrentHealth()-before, 32)
	kfcDruidAdvancedResult("RESEARCH_SWIFTMEND", target.CurrentHealth()-before)
}

func TestKFCDruidResearchRegrowthPeriodicCritScope(t *testing.T) {
	direct, ticks := []float64{}, []float64{}
	for _, allow := range []bool{false, true} {
		sim, resto := kfcDruidAdvancedFixture(500, nil, 2)
		policy := kfcDruidResearchReference()
		policy.OmenProcChance = 0
		policy.RegrowthPeriodicCrits = allow
		kfcDruidResearchApply(t, resto, policy)
		target := &sim.Raid.GetFirstTargetDummy().Unit
		target.RemoveHealth(sim, 9000)
		spell := resto.GetSpell(core.ActionID{SpellID: 9858})
		spell.BonusCritRating = 10000
		spell.Cast(sim, target)
		kfcDruidAdvance(t, sim, 2*time.Second)
		direct = append(direct, spell.SpellMetrics[target.UnitIndex].TotalHealing)
		before := target.CurrentHealth()
		kfcDruidAdvance(t, sim, 5*time.Second)
		ticks = append(ticks, target.CurrentHealth()-before)
	}
	kfcDruidNear(t, direct[0], direct[1])
	kfcDruidNear(t, ticks[1], ticks[0]*1.5)
	kfcDruidAdvancedResult("RESEARCH_REGROWTH_CRITS", append(direct, ticks...))
}

func TestKFCDruidResearchOmenChargeICDAndPeriodicExclusion(t *testing.T) {
	sim, resto := kfcDruidAdvancedFixture(500, nil, 2)
	policy := kfcDruidResearchReference()
	policy.OmenProcChance = 1
	kfcDruidResearchApply(t, resto, policy)
	target := &sim.Raid.GetFirstTargetDummy().Unit
	target.RemoveHealth(sim, 9000)
	ht := resto.GetSpell(core.ActionID{SpellID: 5185})
	ht.Cast(sim, target)
	kfcDruidAdvance(t, sim, 1500*time.Millisecond)
	if !resto.ClearcastingAura.IsActive() {
		t.Fatal("Certain direct-heal policy did not grant Omen")
	}
	rejuv := resto.GetSpell(core.ActionID{SpellID: 9841})
	kfcDruidNear(t, rejuv.Cost.GetCurrentCost(), 0)
	before := resto.CurrentMana()
	rejuv.Cast(sim, target)
	kfcDruidNear(t, resto.CurrentMana(), before)
	if resto.ClearcastingAura.IsActive() {
		t.Fatal("Free instant heal did not consume the charge")
	}
	kfcDruidAdvance(t, sim, 10500*time.Millisecond)
	if resto.ClearcastingAura.IsActive() {
		t.Fatal("Periodic ticks or ICD granted another Omen")
	}
	kfcDruidAdvance(t, sim, 11500*time.Millisecond)
	ht.Cast(sim, target)
	kfcDruidAdvance(t, sim, 13*time.Second)
	if !resto.ClearcastingAura.IsActive() {
		t.Fatal("Omen did not become available after its ICD")
	}
	kfcDruidAdvancedResult("RESEARCH_OMEN_ICD", resto.GetAura("Omen of Clarity").Icd.ReadyAt().Seconds())
}

func TestKFCDruidResearchOmenHealingCastAlternative(t *testing.T) {
	observed := []float64{}
	for _, mode := range []string{"direct-heals", "healing-casts"} {
		sim, resto := kfcDruidAdvancedFixture(500, nil, 2)
		policy := kfcDruidResearchReference()
		policy.OmenProcChance = 1
		policy.OmenEvents = mode
		kfcDruidResearchApply(t, resto, policy)
		target := &sim.Raid.GetFirstTargetDummy().Unit
		target.RemoveHealth(sim, 9000)
		resto.GetSpell(core.ActionID{SpellID: 9841}).Cast(sim, target)
		active := resto.ClearcastingAura.IsActive()
		if active != (mode == "healing-casts") {
			t.Fatal("HoT application did not follow declared Omen event policy")
		}
		value := 0.0
		if active {
			value = 1
		}
		observed = append(observed, value)
	}
	kfcDruidAdvancedResult("RESEARCH_OMEN_EVENTS", observed)
}

func TestKFCDruidResearchScaledClassProcsAndReset(t *testing.T) {
	for _, id := range []int32{5185, 9889} {
		sim, resto := kfcDruidAdvancedFixture(500, map[string]int32{"naturesGrace": 1}, 2)
		policy := kfcDruidResearchReference()
		policy.FullScalingGap = 17
		policy.CoefficientLossPerLevel = .05
		policy.ClassProcMode = "coefficient-factor"
		policy.OmenProcChance = 1
		kfcDruidResearchApply(t, resto, policy)
		target := &sim.Raid.GetFirstTargetDummy().Unit
		target.RemoveHealth(sim, 9000)
		spell := resto.GetSpell(core.ActionID{SpellID: id})
		spell.BonusCritRating = 10000
		coefficient := spell.BonusCoefficient
		spell.Cast(sim, target)
		duration := 1500 * time.Millisecond
		if id == 9889 {
			duration = 3500 * time.Millisecond
		}
		kfcDruidAdvance(t, sim, duration)
		if resto.ClearcastingAura.IsActive() != (id == 9889) || resto.NaturesGraceHasteAura.IsActive() != (id == 9889) {
			t.Fatal("Class proc did not follow declared rank factor")
		}
		sim.Cleanup()
		sim.Reset()
		kfcDruidNear(t, spell.BonusCoefficient, coefficient)
		if resto.ClearcastingAura.IsActive() || resto.NaturesGraceHasteAura.IsActive() {
			t.Fatal("Research proc leaked across reset")
		}
	}
}

func TestKFCDruidResearchWorkloadEchoAndZeroChance(t *testing.T) {
	request, frame := kfcDruidWorkloadControl()
	policy := kfcDruidResearchReference()
	policy.OmenProcChance = 0
	frame.Research = &policy
	reply := RunKFCDruidHealingJob(context.Background(), kfcDruidControlPayload(t, request, frame, "research-control", true))
	if reply.Status != "complete" {
		t.Fatalf("Research job failed: %+v", reply.Error)
	}
	if !reflect.DeepEqual(reply.Result.Research, &policy) || reply.Result.SurvivalRate != 1 {
		t.Fatal("Research policy not preserved in workload result")
	}
	kfcDruidAdvancedResult("RESEARCH_WORKLOAD", []float64{reply.Result.HPS, reply.Result.ManaRemainingMean, reply.Result.DeliveredIncomingDamageMean})
}
