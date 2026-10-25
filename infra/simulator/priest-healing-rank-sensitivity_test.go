package healing

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/priest"
)

func kfcRankPolicy() priest.KFCHealingRankScalingPolicy {
	return priest.KFCHealingRankScalingPolicy{Schema: "kfc-priest-rank-sensitivity.v1", ID: "speculative-gap-17", Kind: "level-distance-sensitivity", FullScalingGap: 17, CoefficientLossPerLevel: .05, ClassProcMode: "coefficient-factor"}
}

func kfcRankConfigure(t *testing.T, healer *HealingPriest, policy priest.KFCHealingRankScalingPolicy) {
	t.Helper()
	if err := healer.ConfigureKFCHealingRankScaling(policy); err != nil {
		t.Fatal(err)
	}
}

func TestKFCPriestRankPolicyValidationAndIsolation(t *testing.T) {
	_, healer, _ := kfcActiveFixture(t, &proto.PriestTalents{})
	_, other, _ := kfcActiveFixture(t, &proto.PriestTalents{})
	original := healer.Heal[4].BonusCoefficient
	for _, change := range []func(*priest.KFCHealingRankScalingPolicy){
		func(p *priest.KFCHealingRankScalingPolicy) { p.Schema = "verified" },
		func(p *priest.KFCHealingRankScalingPolicy) { p.ID = "" },
		func(p *priest.KFCHealingRankScalingPolicy) { p.Kind = "verified" },
		func(p *priest.KFCHealingRankScalingPolicy) { p.FullScalingGap = -1 },
		func(p *priest.KFCHealingRankScalingPolicy) { p.FullScalingGap = 61 },
		func(p *priest.KFCHealingRankScalingPolicy) { p.CoefficientLossPerLevel = math.NaN() },
		func(p *priest.KFCHealingRankScalingPolicy) { p.CoefficientLossPerLevel = math.Inf(1) },
		func(p *priest.KFCHealingRankScalingPolicy) { p.CoefficientLossPerLevel = 0 },
		func(p *priest.KFCHealingRankScalingPolicy) { p.CoefficientLossPerLevel = 1.1 },
		func(p *priest.KFCHealingRankScalingPolicy) { p.ClassProcMode = "verified" },
		func(p *priest.KFCHealingRankScalingPolicy) { p.Kind = "unscaled-reference" },
	} {
		policy := kfcRankPolicy()
		change(&policy)
		if healer.ConfigureKFCHealingRankScaling(policy) == nil {
			t.Fatalf("Accepted invalid rank policy: %+v", policy)
		}
		kfcPriestNear(t, healer.Heal[4].BonusCoefficient, original)
	}
	kfcRankConfigure(t, healer, kfcRankPolicy())
	kfcPriestNear(t, healer.Heal[4].BonusCoefficient, original*.55)
	kfcPriestNear(t, other.Heal[4].BonusCoefficient, original)
	if healer.ConfigureKFCHealingRankScaling(kfcRankPolicy()) == nil {
		t.Fatal("A second policy could compound coefficient scaling")
	}
	kfcPriestNear(t, healer.Heal[4].BonusCoefficient, original*.55)
}

func TestKFCPriestRankDirectBaseManaAndCast(t *testing.T) {
	amounts := []float64{}
	for _, scaled := range []bool{false, true} {
		for _, power := range []float64{0, 500} {
			sim, healer, target := kfcPriestFixture(power)
			if scaled {
				kfcRankConfigure(t, healer, kfcRankPolicy())
			}
			spell := healer.Heal[4]
			spell.BonusCritRating = -10000
			target.RemoveHealth(sim, 9000)
			if !spell.Cast(sim, target) {
				t.Fatal("Rank-sensitivity Heal did not cast")
			}
			kfcPriestAdvance(t, sim, 3*time.Second)
			amounts = append(amounts, spell.SpellMetrics[target.UnitIndex].TotalHealing)
			kfcPriestNear(t, healer.Metrics.ManaSpent, 305)
			if spell.DefaultCast.CastTime != 3*time.Second {
				t.Fatal("Rank sensitivity changed a cast time")
			}
		}
	}
	kfcPriestNear(t, amounts[0], amounts[2])
	kfcPriestNear(t, amounts[1]-amounts[0], 500*.857)
	kfcPriestNear(t, amounts[3]-amounts[2], 500*.857*.55)
	encoded, err := json.Marshal(amounts)
	if err != nil {
		t.Fatal(err)
	}
	fmt.Printf("KFC_HEALER_RANK_AMOUNTS %s\n", encoded)
}

func TestKFCPriestRankShieldActualCapacityAndReplacement(t *testing.T) {
	capacities := []float64{}
	for _, scaled := range []bool{false, true} {
		sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{})
		if scaled {
			kfcRankConfigure(t, healer, kfcRankPolicy())
		}
		if !healer.PowerWordShield[7].Cast(sim, target) {
			t.Fatal("Rank shield did not cast")
		}
		capacities = append(capacities, healer.PowerWordShield[7].Shield(target).RemainingAbsorb())
	}
	kfcPriestNear(t, capacities[0]-capacities[1], 500*.1*.05)
	sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{})
	kfcRankConfigure(t, healer, kfcRankPolicy())
	healer.PowerWordShield[10].Shield(target).Apply(sim, (capacities[0]+capacities[1])/2)
	if healer.PowerWordShield[7].CanCast(sim, target) {
		t.Fatal("Replacement compared the unscaled coefficient")
	}
	kfcDamageTrigger(sim, target, 10)
	if !healer.PowerWordShield[7].CanCast(sim, target) {
		t.Fatal("A weaker depleted shield could not be replaced")
	}
}

func TestKFCPriestRankRenewSnapshot(t *testing.T) {
	amounts := []float64{}
	for _, scaled := range []bool{false, true} {
		sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{})
		if scaled {
			kfcRankConfigure(t, healer, kfcRankPolicy())
		}
		spell := healer.Renew[6]
		spell.BonusCritRating = -10000
		target.RemoveHealth(sim, 9000)
		if !spell.Cast(sim, target) {
			t.Fatal("Rank Renew did not cast")
		}
		kfcPriestAdvance(t, sim, 15*time.Second)
		amounts = append(amounts, spell.SpellMetrics[target.UnitIndex].TotalHealing)
	}
	kfcPriestNear(t, amounts[0]-amounts[1], 500*.2*5*.25)
}

func TestKFCPriestRankBindingBothRecipients(t *testing.T) {
	amounts := [][2]float64{}
	for _, scaled := range []bool{false, true} {
		sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{BindingHeal: true})
		if scaled {
			kfcRankConfigure(t, healer, kfcRankPolicy())
		}
		spell := healer.KFCBindingHeal[3]
		spell.BonusCritRating = -10000
		if !spell.Cast(sim, target) {
			t.Fatal("Rank Binding Heal did not cast")
		}
		kfcPriestAdvance(t, sim, 1500*time.Millisecond)
		amounts = append(amounts, [2]float64{spell.SpellMetrics[target.UnitIndex].TotalHealing, spell.SpellMetrics[healer.UnitIndex].TotalHealing})
	}
	for index := range amounts[0] {
		kfcPriestNear(t, amounts[0][index]-amounts[1][index], 500*.429*.25)
	}
}

func TestKFCPriestRankPenanceAndNovaChildCoefficients(t *testing.T) {
	_, healer, _ := kfcActiveFixture(t, &proto.PriestTalents{Penance: true, HolyNova: true})
	kfcRankConfigure(t, healer, kfcRankPolicy())
	for _, row := range []struct {
		id          int32
		coefficient float64
	}{
		{402289, .19 * .35}, {1240723, .19 * .85}, {1316991, .19},
		{15237, 0}, {23455, 0}, {15431, .107 * .65}, {23459, .107 * .65}, {27805, .107},
	} {
		spell := healer.GetSpell(core.ActionID{SpellID: row.id})
		if spell == nil {
			t.Fatalf("Missing rank payload %d", row.id)
		}
		kfcPriestNear(t, spell.BonusCoefficient, row.coefficient)
	}
}

func TestKFCPriestRankMendingUsesSelectedParent(t *testing.T) {
	for _, rank := range []int{1, 3} {
		amounts := []float64{}
		for _, scaled := range []bool{false, true} {
			sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{PrayerOfMending: true})
			if scaled {
				kfcRankConfigure(t, healer, kfcRankPolicy())
			}
			healer.KFCMendingHeal.BonusCritRating = -10000
			if !healer.KFCMending[rank].Cast(sim, target) {
				t.Fatal("Rank Mending did not cast")
			}
			kfcPriestAdvance(t, sim, 100*time.Millisecond)
			kfcDamageTrigger(sim, target, 1000)
			amounts = append(amounts, healer.KFCMendingHeal.SpellMetrics[target.UnitIndex].TotalHealing)
		}
		loss := 0.0
		if rank == 1 {
			loss = 500 * .429 * .15
		}
		kfcPriestNear(t, amounts[0]-amounts[1], loss)
	}
}

func TestKFCPriestRankClassProcBoundaries(t *testing.T) {
	for _, low := range []bool{false, true} {
		sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{Inspiration: 3, DivineAegis: 3, RenewedHope: 1})
		kfcRankConfigure(t, healer, kfcRankPolicy())
		healer.WeakenedSouls.Get(target).Activate(sim)
		spell := healer.FlashHeal[7]
		if low {
			spell = healer.LesserHeal[1]
		}
		spell.BonusCritRating = 10000
		if !spell.Cast(sim, target) {
			t.Fatal("Rank class-proc test did not cast")
		}
		kfcPriestAdvance(t, sim, 1500*time.Millisecond)
		aegis := healer.KFCDivineAegis.Shield(target).RemainingAbsorb()
		if low {
			kfcPriestNear(t, aegis, 0)
			kfcPriestNear(t, healer.WeakenedSouls.Get(target).ExpiresAt().Seconds(), 15)
			if healer.KFCInspiration.Get(target).IsActive() {
				t.Fatal("A zero-factor downrank triggered Inspiration")
			}
		} else {
			if aegis <= 0 || !healer.KFCInspiration.Get(target).IsActive() {
				t.Fatal("A full rank lost its critical-healing procs")
			}
			kfcPriestNear(t, healer.WeakenedSouls.Get(target).ExpiresAt().Seconds(), 14)
		}
	}
}

func TestKFCPriestRankLitanySequenceAfterSuppressedRefund(t *testing.T) {
	sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{LitanyOfLight: 2})
	kfcRankConfigure(t, healer, kfcRankPolicy())
	kfcResourceSpend(sim, healer, 1000)
	for index, spell := range []*core.Spell{healer.FlashHeal[7], healer.LesserHeal[1], healer.FlashHeal[7]} {
		if !spell.Cast(sim, target) {
			t.Fatal("Rank Litany sequence did not cast")
		}
		kfcPriestAdvance(t, sim, time.Duration(index+1)*1500*time.Millisecond)
		if index < 2 {
			kfcPriestNear(t, float64(healer.KFCLitanyMetrics.EventsForCurrentIteration()), 0)
		}
	}
	kfcPriestNear(t, float64(healer.KFCLitanyMetrics.EventsForCurrentIteration()), 1)
}

func TestKFCPriestRankIntermediateProcSensitivity(t *testing.T) {
	sim, healer, target := kfcHealingDungeonSetFixture(t, 182, 0, &proto.PriestTalents{Inspiration: 3, DivineAegis: 3, RenewedHope: 1})
	kfcRankConfigure(t, healer, kfcRankPolicy())
	spell := healer.FlashHeal[4]
	spell.BonusCritRating = 10000
	counts := [3]int{}
	for cast := 0; cast < 200; cast++ {
		healer.KFCDivineAegis.Shield(target).Deactivate(sim)
		healer.KFCInspiration.Get(target).Deactivate(sim)
		healer.WeakenedSouls.Get(target).Deactivate(sim)
		healer.WeakenedSouls.Get(target).Activate(sim)
		expires := healer.WeakenedSouls.Get(target).ExpiresAt()
		if !spell.Cast(sim, target) {
			t.Fatal("Intermediate-rank proc test did not cast")
		}
		kfcPriestAdvance(t, sim, sim.CurrentTime+1500*time.Millisecond)
		if healer.KFCDivineAegis.Shield(target).RemainingAbsorb() > 0 {
			counts[0]++
		}
		if healer.KFCInspiration.Get(target).IsActive() {
			counts[1]++
		}
		if healer.WeakenedSouls.Get(target).ExpiresAt() < expires {
			counts[2]++
		}
	}
	for _, count := range counts {
		if count < 100 || count > 190 {
			t.Fatalf("Intermediate class-proc sensitivity did not sample its declared factor: %v", counts)
		}
	}
	encoded, err := json.Marshal(counts)
	if err != nil {
		t.Fatal(err)
	}
	fmt.Printf("KFC_HEALER_RANK_PROCS %s\n", encoded)
}

func TestKFCPriestRankItemProcsRemainIndependent(t *testing.T) {
	counts := []int{}
	for _, scaled := range []bool{false, true} {
		sim, healer, target := kfcHealingDungeonSetFixture(t, 182, 5, &proto.PriestTalents{})
		if scaled {
			kfcRankConfigure(t, healer, kfcRankPolicy())
		}
		aura, count := healer.GetAura("Sudden Insight"), 0
		original := aura.OnCastComplete
		aura.OnCastComplete = func(a *core.Aura, s *core.Simulation, spell *core.Spell) {
			before := healer.CurrentMana()
			original(a, s, spell)
			if healer.CurrentMana()-before > 0 {
				count++
			}
		}
		for cast := 0; cast < 200; cast++ {
			if !healer.FlashHeal[1].Cast(sim, target) {
				t.Fatal("Downrank item-proc test did not cast")
			}
			kfcPriestAdvance(t, sim, sim.CurrentTime+1500*time.Millisecond)
		}
		counts = append(counts, count)
	}
	if counts[0] == 0 || counts[0] != counts[1] {
		t.Fatalf("Class-proc sensitivity changed the item-proc rule: %v", counts)
	}
}

func TestKFCPriestRankResetAndFreshActorGuard(t *testing.T) {
	sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{})
	kfcRankConfigure(t, healer, kfcRankPolicy())
	coefficient := healer.Heal[4].BonusCoefficient
	if !healer.Heal[4].Cast(sim, target) {
		t.Fatal("Rank reset test did not cast")
	}
	kfcPriestAdvance(t, sim, 3*time.Second)
	sim.Cleanup()
	sim.Reset()
	kfcPriestNear(t, healer.Heal[4].BonusCoefficient, coefficient)
	if !healer.Heal[4].Cast(sim, target) {
		t.Fatal("Rank policy did not survive reset")
	}
	freshSim, fresh, recipient := kfcActiveFixture(t, &proto.PriestTalents{})
	// Cast completion is not needed to reject changing coefficients mid-cast.
	if !fresh.Heal[4].Cast(freshSim, recipient) {
		t.Fatal("Fresh-actor guard setup failed")
	}
	if fresh.ConfigureKFCHealingRankScaling(kfcRankPolicy()) == nil {
		t.Fatal("A policy changed after casting began")
	}
}

func TestKFCPriestRankWorkloadEchoReferenceAndRejection(t *testing.T) {
	request, frame := kfcWorkloadRequest(10000, 2, 20), kfcTankWorkload(20)
	before, err := RunKFCHealingWorkload(context.Background(), request, frame)
	if err != nil {
		t.Fatal(err)
	}
	reference := priest.KFCHealingRankScalingPolicy{Schema: "kfc-priest-rank-sensitivity.v1", ID: "unscaled-reference", Kind: "unscaled-reference", ClassProcMode: "unchanged"}
	frame.RankScaling = &reference
	after, err := RunKFCHealingWorkload(context.Background(), request, frame)
	if err != nil {
		t.Fatal(err)
	}
	if before.RankScaling != nil || after.RankScaling == frame.RankScaling || after.RankScaling == nil || *after.RankScaling != reference {
		t.Fatal("Rank scenario provenance was lost or aliased")
	}
	kfcPriestNear(t, before.Metrics.Hps.Avg, after.Metrics.Hps.Avg)
	kfcPriestNear(t, before.ManaRemainingMean, after.ManaRemainingMean)
	frame.RankScaling.ID = "changed-by-caller"
	if after.RankScaling.ID != "unscaled-reference" {
		t.Fatal("The caller could relabel an existing result")
	}
	frame.RankScaling.Kind = "verified"
	if result, err := RunKFCHealingWorkload(context.Background(), request, frame); result != nil || err == nil {
		t.Fatal("An invalid rank scenario was accepted")
	}
}
