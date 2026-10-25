package restoration

import (
	"context"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
	"github.com/wowsims/classic/sim/druid"
)

func kfcCoupledRecombobulatorPolicy() KFCDruidUtilityProbePolicy {
	p := kfcUtilityPolicy()
	p.Mode = "recombobulator-timed-use"
	p.Recombobulator = true
	p.RecombobulatorTarget = "self"
	return p
}

func TestKFCDruidRecombobulatorActualCoupledAmounts(t *testing.T) {
	values := [][]float64{}
	for _, coefficient := range []float64{0, 1} {
		for _, critical := range []bool{false, true} {
			sim, healer := kfcUtilityFixture(t, 18637)
			healer.AddStatDynamic(sim, stats.HealingPower, 200)
			healer.AddStatDynamic(sim, stats.SpellCrit, 100*core.SpellCritRatingPerCritChance)
			p := kfcCoupledRecombobulatorPolicy()
			p.RecombobulatorHealingCoefficient = coefficient
			p.RecombobulatorManaCoefficient = coefficient
			p.RecombobulatorCanCrit = critical
			if err := healer.ConfigureKFCUtilityProbe(sim, p); err != nil {
				t.Fatal(err)
			}
			healer.RemoveHealth(sim, 4000)
			healer.SpendMana(sim, 3000, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 91}))
			beforeHealth, beforeMana := healer.CurrentHealth(), healer.CurrentMana()
			power := healer.utilityProbes.recombobUse.HealingPower(&healer.Unit)
			healer.useKFCUtilityProbes(sim)
			health, mana := healer.CurrentHealth()-beforeHealth, healer.CurrentMana()-beforeMana
			multiplier := 1.0
			if critical {
				multiplier = 1.5
			}
			if health < (499.5+coefficient*power)*multiplier || health > (832.5+coefficient*power)*multiplier || mana < 228+coefficient*power || mana > 380+coefficient*power {
				t.Fatal("Incorrect coupled amounts", health, mana, power)
			}
			if healer.utilityProbes.recombobCharges != 9 || healer.GCD.ReadyAt() > sim.CurrentTime {
				t.Fatal("Wrong charges or unexpected GCD")
			}
			if healer.utilityProbes.recombobUse.CD.ReadyAt() != 5*time.Minute || healer.utilityProbes.recombobUse.SharedCD.ReadyAt() != 2*time.Minute {
				t.Fatal("Wrong item/category cooldown")
			}
			healer.useKFCUtilityProbes(sim)
			kfcDruidNear(t, healer.CurrentHealth(), beforeHealth+health)
			kfcDruidNear(t, healer.CurrentMana(), beforeMana+mana)
			values = append(values, []float64{coefficient, health, mana})
		}
	}
	kfcDruidAdvancedResult("RECOMBO_ACTUAL_COUPLING", values)
}

func TestKFCDruidRecombobulatorCannotSplitResourcesAcrossTargets(t *testing.T) {
	request := kfcUtilityRequest(18637)
	request.Raid.TargetDummies = 3
	request.Raid.Parties[0].Players = append(request.Raid.Parties[0].Players, &proto.Player{
		Name: "Actual friendly mana target", Level: 60, Race: proto.Race_RaceNightElf, Class: proto.Class_ClassDruid,
		Equipment: &proto.EquipmentSpec{}, Rotation: &proto.APLRotation{Type: proto.APLRotation_TypeAPL},
		Spec: &proto.Player_RestorationDruid{RestorationDruid: &proto.RestorationDruid{Options: &proto.RestorationDruid_Options{}}},
	})
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	healer := sim.Raid.Parties[0].Players[0].(*RestorationDruid)
	positions := map[int32]KFCDruidFriendlyPosition{}
	for _, unit := range sim.Raid.AllUnits {
		positions[unit.UnitIndex] = KFCDruidFriendlyPosition{}
		if err := unit.ConfigureKFCHealingBenchmarkHealth(sim, 5000); err != nil {
			t.Fatal(err)
		}
	}
	if err := healer.ConfigureKFCDruidHealing(positions, KFCDruidHealingPolicy{WildGrowthDecay: .1, SwiftmendSelection: "shortest"}); err != nil {
		t.Fatal(err)
	}
	p := kfcCoupledRecombobulatorPolicy()
	p.RecombobulatorTarget = "most-injured"
	if err := healer.ConfigureKFCUtilityProbe(sim, p); err != nil {
		t.Fatal(err)
	}
	target := &sim.Raid.Parties[0].Players[1].GetCharacter().Unit
	if !target.HasManaBar() {
		t.Fatal("Coupling control requires an actual friendly mana user")
	}
	target.RemoveHealth(sim, 4000)
	target.SpendMana(sim, 1000, target.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 92}))
	healer.SpendMana(sim, 1000, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 93}))
	beforeMana, beforeTargetMana, beforeHealth := healer.CurrentMana(), target.CurrentMana(), target.CurrentHealth()
	healer.useKFCUtilityProbes(sim)
	if target.CurrentHealth() <= beforeHealth {
		t.Fatal("Ally was not healed")
	}
	if gain := target.CurrentMana() - beforeTargetMana; gain < 228 || gain > 380 {
		t.Fatal("Friendly target did not receive the same-use mana", gain)
	}
	kfcDruidNear(t, healer.CurrentMana(), beforeMana)
	kfcDruidAdvancedResult("RECOMBO_ACTUAL_SAME_TARGET", []float64{target.CurrentHealth() - beforeHealth, target.CurrentMana() - beforeTargetMana, healer.CurrentMana() - beforeMana})
}

func TestKFCDruidRecombobulatorActualChargesRangeAndReset(t *testing.T) {
	sim, healer := kfcUtilityFixture(t, 18637)
	p := kfcCoupledRecombobulatorPolicy()
	if err := healer.ConfigureKFCUtilityProbe(sim, p); err != nil {
		t.Fatal(err)
	}
	spell := healer.utilityProbes.recombobUse
	target := &sim.Raid.GetFirstTargetDummy().Unit
	healer.positions[target.UnitIndex] = KFCDruidFriendlyPosition{X: 30.01}
	if spell.CanCast(sim, target) {
		t.Fatal("Out-of-range target accepted")
	}
	healer.positions[target.UnitIndex] = KFCDruidFriendlyPosition{X: 30}
	for i := 0; i < 10; i++ {
		spell.CD.Timer.Set(0)
		spell.SharedCD.Timer.Set(0)
		if !spell.Cast(sim, target) {
			t.Fatal("Available charge rejected", i)
		}
	}
	spell.CD.Timer.Set(0)
	spell.SharedCD.Timer.Set(0)
	if spell.CanCast(sim, target) {
		t.Fatal("Eleventh charge accepted")
	}
	sim.Cleanup()
	sim.Reset()
	if healer.utilityProbes.recombobCharges != 10 || !spell.CD.IsReady(sim) || !spell.SharedCD.IsReady(sim) {
		t.Fatal("Charge or cooldown state leaked")
	}
	target.RemoveHealth(sim, target.CurrentHealth())
	if spell.CanCast(sim, target) {
		t.Fatal("Dead target accepted")
	}
	kfcDruidAdvancedResult("RECOMBO_ACTUAL_LIFECYCLE", true)
}

func TestKFCDruidRecombobulatorRejectsInvalidModeAndMissingEngineering(t *testing.T) {
	for _, kind := range []string{"other-item", "target", "unused-target", "unused-critical"} {
		p := kfcCoupledRecombobulatorPolicy()
		switch kind {
		case "other-item":
			p.Gauntlets = true
		case "target":
			p.RecombobulatorTarget = "foreign-mana-and-tank-heal"
		case "unused-target":
			p.Mode = "optimistic-contender"
		case "unused-critical":
			p.Mode = "optimistic-contender"
			p.RecombobulatorTarget = ""
			p.RecombobulatorCanCrit = true
		}
		if p.Validate() == nil {
			t.Fatal("Invalid coupled policy accepted", kind)
		}
	}
	request := kfcUtilityRequest(18637)
	request.Raid.Parties[0].Players[0].Profession1 = proto.Profession_ProfessionUnknown
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	healer := sim.Raid.Parties[0].Players[0].(*RestorationDruid)
	if healer.ConfigureKFCUtilityProbe(sim, kfcCoupledRecombobulatorPolicy()) == nil {
		t.Fatal("Use without Engineering accepted")
	}
	kfcDruidAdvancedResult("RECOMBO_ACTUAL_GUARDS", true)
}

func TestKFCDruidRecombobulatorActualWorkloadController(t *testing.T) {
	request, frame := kfcDruidWorkloadControl()
	request.Raid.Parties[0].Players[0] = kfcUtilityRequest(18637).Raid.Parties[0].Players[0]
	frame.Priorities[0].MinimumMissingHealth = 100000
	baseline := RunKFCDruidHealingJob(context.Background(), kfcDruidControlPayload(t, request, frame, "recombo-actual-disabled", false))
	p := kfcCoupledRecombobulatorPolicy()
	p.RecombobulatorTarget = "most-injured"
	frame.UtilityProbe = &p
	active := RunKFCDruidHealingJob(context.Background(), kfcDruidControlPayload(t, request, frame, "recombo-actual-active", false))
	if baseline.Status != "complete" || active.Status != "complete" || active.Result.RawHPS <= 0 || active.Result.MissingHealthSecondsMean >= baseline.Result.MissingHealthSecondsMean {
		t.Fatal("Coupled controller was not used", baseline.Error, active.Error)
	}
	kfcDruidAdvancedResult("RECOMBO_ACTUAL_CONTROLLER", active.Result.RawHPS)
}

func TestKFCDruidRecombobulatorActualResearchDoesNotTriggerClassProcs(t *testing.T) {
	request, frame := kfcDruidWorkloadControl()
	player := kfcUtilityRequest(18637).Raid.Parties[0].Players[0]
	trees := []string{}
	for _, tree := range druid.ForeverTalentTreeFields {
		var value strings.Builder
		for _, field := range tree {
			rank := 0
			if field == "omenOfClarity" {
				rank = 1
			}
			value.WriteString(strconv.Itoa(rank))
		}
		trees = append(trees, strings.TrimRight(value.String(), "0"))
	}
	player.TalentsString = strings.TrimRight(strings.Join(trees, "-"), "-")
	request.Raid.Parties[0].Players[0] = player
	frame.Priorities[0].MinimumMissingHealth = 100000
	research := kfcDruidResearchReference()
	research.FullScalingGap = 17
	research.CoefficientLossPerLevel = .05
	research.ClassProcMode = "coefficient-factor"
	research.OmenProcChance = 1
	research.OmenEvents = "direct-heals"
	frame.Research = &research
	p := kfcCoupledRecombobulatorPolicy()
	p.RecombobulatorTarget = "most-injured"
	frame.UtilityProbe = &p
	result := RunKFCDruidHealingJob(context.Background(), kfcDruidControlPayload(t, request, frame, "recombo-class-proc-isolation", false))
	if result.Status != "complete" || result.Result == nil || result.Result.RawHPS <= 0 {
		t.Fatal("Item heal entered class-rank research", result.Error)
	}
	kfcDruidAdvancedResult("RECOMBO_ACTUAL_RESEARCH_ISOLATION", result.Result.RawHPS)
}
