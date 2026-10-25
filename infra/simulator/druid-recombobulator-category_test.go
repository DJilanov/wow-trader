package restoration

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
)

func kfcDruidSharedRecombFixture(t *testing.T) (*core.Simulation, *RestorationDruid, *core.Spell, *core.Spell) {
	t.Helper()
	request := kfcUtilityRequest(18637)
	request.Encounter.Duration = 800
	request.Raid.Parties[0].Players[0].Consumes = &proto.Consumes{DefaultConjured: proto.Conjured_ConjuredDemonicRune}
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
	if err := healer.ConfigureKFCUtilityProbe(sim, kfcCoupledRecombobulatorPolicy()); err != nil {
		t.Fatal(err)
	}
	healer.RemoveHealth(sim, 1000)
	healer.SpendMana(sim, 3000, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 151}))
	return sim, healer, healer.GetSpell(core.ActionID{ItemID: 12662}), healer.utilityProbes.recombobUse
}

func TestKFCDruidRecombSharedRuneBlocksUseAndPreservesCharges(t *testing.T) {
	sim, healer, rune, item := kfcDruidSharedRecombFixture(t)
	if rune == nil || !rune.CanCast(sim, &healer.Unit) || !rune.Cast(sim, &healer.Unit) {
		t.Fatal("Configured Rune did not activate")
	}
	beforeMana, beforeHealth := healer.CurrentMana(), healer.CurrentHealth()
	healer.useKFCUtilityProbes(sim)
	if item.CanCast(sim, &healer.Unit) || healer.utilityProbes.recombobCharges != 10 || item.CD.ReadyAt() > sim.CurrentTime {
		t.Fatal("Rune did not block Major use without consuming its cooldown or charges")
	}
	kfcDruidNear(t, healer.CurrentMana(), beforeMana)
	kfcDruidNear(t, healer.CurrentHealth(), beforeHealth)
	kfcDruidAdvance(t, sim, 120*time.Second-time.Nanosecond)
	if item.CanCast(sim, &healer.Unit) {
		t.Fatal("Major became ready before the category boundary")
	}
	kfcDruidAdvance(t, sim, 120*time.Second)
	if !item.CanCast(sim, &healer.Unit) || !item.Cast(sim, &healer.Unit) {
		t.Fatal("Major failed at shared boundary")
	}
	if item.CD.ReadyAt() != 420*time.Second || rune.CanCast(sim, &healer.Unit) {
		t.Fatal("Major did not retain personal cooldown and block Rune")
	}
	kfcDruidAdvancedResult("RECOMB_SHARED_RUNE_FIRST", []int64{int64(item.CD.ReadyAt()), int64(item.SharedCD.ReadyAt()), int64(healer.utilityProbes.recombobCharges)})
}

func TestKFCDruidRecombSharedUseBlocksRuneAndKeepsFiveMinutePersonal(t *testing.T) {
	sim, healer, rune, item := kfcDruidSharedRecombFixture(t)
	if !item.CanCast(sim, &healer.Unit) || !item.Cast(sim, &healer.Unit) {
		t.Fatal("Major use failed")
	}
	if rune.CanCast(sim, &healer.Unit) {
		t.Fatal("Major and Rune incorrectly stack inside their shared category")
	}
	kfcDruidAdvance(t, sim, 120*time.Second-time.Nanosecond)
	if rune.CanCast(sim, &healer.Unit) {
		t.Fatal("Rune became ready before Major's category boundary")
	}
	kfcDruidAdvance(t, sim, 120*time.Second)
	if item.CanCast(sim, &healer.Unit) || !rune.CanCast(sim, &healer.Unit) || !rune.Cast(sim, &healer.Unit) {
		t.Fatal("Personal/shared cooldowns were merged")
	}
	kfcDruidAdvance(t, sim, 300*time.Second-time.Nanosecond)
	if item.CanCast(sim, &healer.Unit) {
		t.Fatal("Major lost its five-minute personal cooldown")
	}
	kfcDruidAdvance(t, sim, 300*time.Second)
	if !item.CanCast(sim, &healer.Unit) {
		t.Fatal("Major remained blocked after both cooldowns ended")
	}
	kfcDruidAdvancedResult("RECOMB_SHARED_ITEM_FIRST", []int64{int64(item.CD.ReadyAt()), int64(item.SharedCD.ReadyAt()), int64(healer.utilityProbes.recombobCharges)})
}

func TestKFCDruidRecombSharedResetAndActorIsolation(t *testing.T) {
	sim, healer, rune, item := kfcDruidSharedRecombFixture(t)
	otherSim, other, otherRune, otherItem := kfcDruidSharedRecombFixture(t)
	if !item.Cast(sim, &healer.Unit) {
		t.Fatal("Major use failed")
	}
	if !otherRune.CanCast(otherSim, &other.Unit) || !otherItem.CanCast(otherSim, &other.Unit) {
		t.Fatal("Category leaked between actors")
	}
	sim.Cleanup()
	sim.Reset()
	if !rune.CanCast(sim, &healer.Unit) || !item.CanCast(sim, &healer.Unit) || healer.utilityProbes.recombobCharges != 10 {
		t.Fatal("Reset retained shared cooldown or consumed charges")
	}
	kfcDruidAdvancedResult("RECOMB_SHARED_RESET", true)
}

func TestKFCDruidRecombSharedActualWorkloadTransport(t *testing.T) {
	request, frame := kfcDruidWorkloadControl()
	player := kfcUtilityRequest(18637).Raid.Parties[0].Players[0]
	player.Consumes = &proto.Consumes{DefaultConjured: proto.Conjured_ConjuredDemonicRune}
	request.Raid.Parties[0].Players[0] = player
	policy := kfcCoupledRecombobulatorPolicy()
	policy.RecombobulatorTarget = "most-injured"
	frame.UtilityProbe = &policy
	frame.Cooldowns = []KFCDruidHealingCooldown{{ItemID: 12662, MinimumMissingMana: 1}}
	job := kfcDruidControlPayload(t, request, frame, "druid-recomb-shared-rune", true)
	reply := RunKFCDruidHealingJob(context.Background(), job)
	if reply.Status != "complete" {
		t.Fatal("Combined Rune/Major workload failed", reply.Error)
	}
	var decoded interface{}
	if err := json.Unmarshal(job, &decoded); err != nil {
		t.Fatal(err)
	}
	kfcDruidAdvancedResult("RECOMB_SHARED_WORKLOAD_REQUEST", decoded)
	kfcDruidAdvancedResult("RECOMB_SHARED_WORKLOAD", reply.Result)
}
