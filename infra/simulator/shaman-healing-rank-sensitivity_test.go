package restoration

import (
	"context"
	"encoding/json"
	"math"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	googleProto "google.golang.org/protobuf/proto"
)

func kfcShamanRankPolicy() KFCShamanRankScalingPolicy {
	return KFCShamanRankScalingPolicy{Schema: "kfc-shaman-rank-sensitivity.v1", ID: "speculative-gap-17", Kind: "level-distance-sensitivity", FullScalingGap: 17, CoefficientLossPerLevel: .05, ClassProcMode: "coefficient-factor"}
}

func kfcShamanRankConfigure(t *testing.T, sim *core.Simulation, resto *RestorationShaman, policy KFCShamanRankScalingPolicy) {
	t.Helper()
	if err := resto.ConfigureKFCShamanRankScaling(sim, policy); err != nil {
		t.Fatal(err)
	}
}

func TestKFCShamanRankValidationIsolationAndOneTimeApplication(t *testing.T) {
	sim, resto, _ := kfcShamanFixture(t, 500, "nearest-injured-reference")
	defer sim.Cleanup()
	otherSim, other, _ := kfcShamanFixture(t, 500, "nearest-injured-reference")
	defer otherSim.Cleanup()
	spell := resto.GetSpell(core.ActionID{SpellID: 959})
	original := spell.BonusCoefficient
	for _, change := range []func(*KFCShamanRankScalingPolicy){
		func(p *KFCShamanRankScalingPolicy) { p.Schema = "verified" },
		func(p *KFCShamanRankScalingPolicy) { p.ID = "" },
		func(p *KFCShamanRankScalingPolicy) { p.Kind = "verified" },
		func(p *KFCShamanRankScalingPolicy) { p.FullScalingGap = -1 },
		func(p *KFCShamanRankScalingPolicy) { p.FullScalingGap = 61 },
		func(p *KFCShamanRankScalingPolicy) { p.CoefficientLossPerLevel = math.NaN() },
		func(p *KFCShamanRankScalingPolicy) { p.CoefficientLossPerLevel = math.Inf(1) },
		func(p *KFCShamanRankScalingPolicy) { p.CoefficientLossPerLevel = 0 },
		func(p *KFCShamanRankScalingPolicy) { p.CoefficientLossPerLevel = 1.1 },
		func(p *KFCShamanRankScalingPolicy) { p.ClassProcMode = "verified" },
		func(p *KFCShamanRankScalingPolicy) { p.Kind = "unscaled-reference" },
	} {
		policy := kfcShamanRankPolicy()
		change(&policy)
		if resto.ConfigureKFCShamanRankScaling(sim, policy) == nil {
			t.Fatalf("Accepted invalid rank policy: %+v", policy)
		}
		kfcShamanNear(t, spell.BonusCoefficient, original)
	}
	kfcShamanRankConfigure(t, sim, resto, kfcShamanRankPolicy())
	kfcShamanNear(t, spell.BonusCoefficient, original*.45)
	kfcShamanNear(t, other.GetSpell(core.ActionID{SpellID: 959}).BonusCoefficient, original)
	if resto.ConfigureKFCShamanRankScaling(sim, kfcShamanRankPolicy()) == nil {
		t.Fatal("Repeated configuration could compound scaling")
	}
	kfcShamanNear(t, spell.BonusCoefficient, original*.45)
}

func TestKFCShamanRankDirectAndChainBaseManaCastUnchanged(t *testing.T) {
	for _, row := range []struct {
		id                        int32
		factor, coefficient, mana float64
		cast                      time.Duration
	}{{959, .45, .857, 265, 3 * time.Second}, {8010, .65, .429, 185, 1500 * time.Millisecond}, {1064, .85, .714, 260, 2500 * time.Millisecond}} {
		amounts := []float64{}
		for _, scaled := range []bool{false, true} {
			for _, power := range []float64{0, 500} {
				sim, resto, units := kfcShamanFixture(t, power, "nearest-injured-reference")
				if scaled {
					kfcShamanRankConfigure(t, sim, resto, kfcShamanRankPolicy())
				}
				target := units[1]
				target.RemoveHealth(sim, 9000)
				spell := resto.GetSpell(core.ActionID{SpellID: row.id})
				spell.BonusCritRating = -10000
				before := target.CurrentHealth()
				if !spell.Cast(sim, target) {
					t.Fatal("Rank control failed to cast", row.id)
				}
				kfcShamanAdvance(t, sim, row.cast)
				amounts = append(amounts, target.CurrentHealth()-before)
				kfcShamanNear(t, resto.Metrics.ManaSpent, row.mana)
				if spell.DefaultCast.CastTime != row.cast {
					t.Fatal("Rank policy changed cast time")
				}
				sim.Cleanup()
			}
		}
		kfcShamanNear(t, amounts[0], amounts[2])
		kfcShamanNear(t, amounts[1]-amounts[0], 500*row.coefficient)
		kfcShamanNear(t, amounts[3]-amounts[2], 500*row.coefficient*row.factor)
		kfcShamanMeasure("RANK_DIRECT", struct {
			ID      int32
			Amounts []float64
		}{row.id, amounts})
	}
}

func TestKFCShamanRankRiptideDirectAndBothPeriodicPowerModes(t *testing.T) {
	for _, mode := range []string{"snapshot-reference", "dynamic-reference"} {
		amounts := [][2]float64{}
		for _, scaled := range []bool{false, true} {
			for _, power := range []float64{0, 500} {
				policy := kfcRiptideDefault()
				policy.HotPower = mode
				sim, resto, units := kfcRiptideFixture(t, map[string]int32{"riptide": 1}, power, policy)
				if scaled {
					kfcShamanRankConfigure(t, sim, resto, kfcShamanRankPolicy())
				}
				target := units[1]
				target.RemoveHealth(sim, 9000)
				spell := resto.kfcRiptide.spells[408521]
				spell.BonusCritRating = -10000
				if !spell.Cast(sim, target) {
					t.Fatal("Rank Riptide rejected")
				}
				kfcShamanAdvance(t, sim, 15*time.Second)
				amounts = append(amounts, [2]float64{spell.SpellMetrics[target.UnitIndex].TotalHealing, resto.kfcRiptide.pulses[408521].SpellMetrics[target.UnitIndex].TotalHealing})
				kfcShamanNear(t, resto.Metrics.ManaSpent, 245)
				sim.Cleanup()
			}
		}
		for index, coefficient := range []float64{.214, .5} {
			kfcShamanNear(t, amounts[0][index], amounts[2][index])
			kfcShamanNear(t, amounts[1][index]-amounts[0][index], 500*coefficient)
			kfcShamanNear(t, amounts[3][index]-amounts[2][index], 500*coefficient*.85)
		}
		kfcShamanMeasure("RANK_RIPTIDE", struct {
			Mode    string
			Amounts [][2]float64
		}{mode, amounts})
	}
}

func TestKFCShamanRankStreamScalesOnlyBonusInBothTalentModes(t *testing.T) {
	for _, mode := range []string{"base-only-reference", "base-and-power-reference"} {
		amounts := []float64{}
		for _, scaled := range []bool{false, true} {
			for _, power := range []float64{0, 500} {
				policy := kfcShamanWaterDefault()
				policy.HealingScaling = mode
				sim, resto, units := kfcShamanWaterFixture(t, nil, power, policy, false)
				if scaled {
					kfcShamanRankConfigure(t, sim, resto, kfcShamanRankPolicy())
				}
				target := units[1]
				target.RemoveHealth(sim, 1000)
				before := target.CurrentHealth()
				if !resto.HealingStreamTotem[2].Cast(sim, &resto.Unit) {
					t.Fatal("Rank Stream rejected")
				}
				kfcShamanAdvance(t, sim, 2*time.Second)
				amounts = append(amounts, target.CurrentHealth()-before)
				sim.Cleanup()
			}
		}
		kfcShamanNear(t, amounts[0], amounts[2])
		if amounts[1] <= amounts[0] {
			t.Fatal("Stream control had no bonus healing")
		}
		kfcShamanNear(t, amounts[3]-amounts[2], (amounts[1]-amounts[0])*.35)
		kfcShamanMeasure("RANK_STREAM", struct {
			Mode    string
			Amounts []float64
		}{mode, amounts})
	}
}

func TestKFCShamanRankShieldProcRejectPreservesChargeAndICD(t *testing.T) {
	for _, mode := range []string{"unchanged", "coefficient-factor"} {
		sim, resto, units := kfcShamanResourceFixture(t, map[string]int32{"water_shield": 1}, kfcShamanResourceDefault())
		policy := kfcShamanRankPolicy()
		policy.ClassProcMode = mode
		kfcShamanRankConfigure(t, sim, resto, policy)
		resto.SpendMana(sim, 5000, resto.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 775}))
		if !resto.WaterShield.Cast(sim, &resto.Unit) {
			t.Fatal("Rank Shield rejected")
		}
		kfcShamanRawCriticalHeal(t, sim, resto, units[1], "class-direct")
		want := int32(2)
		if mode == "coefficient-factor" {
			want = 3
		}
		if resto.WaterShieldAura.GetStacks() != want {
			t.Fatal("Rank proc used wrong charge count")
		}
		if mode == "coefficient-factor" {
			spell := resto.GetSpell(core.ActionID{SpellID: 10468})
			spell.BonusCritRating = 10000
			spell.CalcAndDealHealing(sim, units[1], 1, spell.OutcomeHealingCrit)
			if resto.WaterShieldAura.GetStacks() != 2 {
				t.Fatal("Rejected low rank consumed internal cooldown")
			}
		}
		kfcShamanNear(t, resto.kfcActives.shieldMetrics.ActualGainForCurrentIteration(), resto.MaxMana()*.02)
		sim.Cleanup()
	}
}

func TestKFCShamanRankProcProbabilityAndEquipmentIsolation(t *testing.T) {
	sim, resto, _ := kfcShamanResourceFixture(t, map[string]int32{"water_shield": 1}, kfcShamanResourceDefault())
	defer sim.Cleanup()
	kfcShamanRankConfigure(t, sim, resto, kfcShamanRankPolicy())
	spell := resto.GetSpell(core.ActionID{SpellID: 1064})
	count := 0
	for index := 0; index < 10000; index++ {
		if resto.kfcShamanRankProc(sim, spell) {
			count++
		}
	}
	if count < 8200 || count > 8800 {
		t.Fatal("Partial rank proc probability not applied", count)
	}
	item := &core.Spell{ActionID: core.ActionID{ItemID: 18371}}
	if !resto.kfcShamanRankProc(sim, item) {
		t.Fatal("Class rank penalty leaked to equipment")
	}
	for _, id := range []int32{331, 10468} {
		spell := resto.GetSpell(core.ActionID{SpellID: id})
		want := id == 10468
		for index := 0; index < 10; index++ {
			if resto.kfcShamanRankProc(sim, spell) != want {
				t.Fatal("Certain rank proc outcome changed")
			}
		}
	}
	kfcShamanMeasure("RANK_PROC", count)
}

func TestKFCShamanRankWorkloadEchoReferenceAndInputPreservation(t *testing.T) {
	request, frame := kfcShamanWorkloadControl()
	before := googleProto.Clone(request)
	reference := kfcShamanWorkloadResult(t, request, frame)
	if reference.RankScaling != nil {
		t.Fatal("Omitted policy was invented")
	}
	unscaled := KFCShamanRankScalingPolicy{Schema: "kfc-shaman-rank-sensitivity.v1", ID: "unscaled-reference", Kind: "unscaled-reference", ClassProcMode: "unchanged"}
	frame.RankScaling = &unscaled
	actual := kfcShamanWorkloadResult(t, request, frame)
	if actual.RankScaling == frame.RankScaling || *actual.RankScaling != unscaled {
		t.Fatal("Policy echo is missing or aliases caller")
	}
	actual.RankScaling = nil
	a, _ := json.Marshal(actual)
	b, _ := json.Marshal(reference)
	if string(a) != string(b) {
		t.Fatal("Unscaled policy changed reference outcomes")
	}
	policy := kfcShamanRankPolicy()
	frame.RankScaling = &policy
	result := kfcShamanWorkloadResult(t, request, frame)
	if result.RankScaling == nil || *result.RankScaling != policy || !googleProto.Equal(request, before) {
		t.Fatal("Rank workload lost policy or changed input")
	}
	policy.Schema = "verified"
	if _, err := RunKFCShamanHealingWorkload(context.Background(), request, frame); err == nil {
		t.Fatal("Workload accepted invalid rank policy")
	}
	kfcShamanMeasure("RANK_WORKLOAD", result)
}
