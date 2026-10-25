package restoration

import (
	"context"
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

func kfcLegacyPolicy(heal, power float64, forest bool) KFCDruidLegacyItemPolicy {
	return KFCDruidLegacyItemPolicy{Schema: "kfc-druid-legacy-item-policy.v1", ID: fmt.Sprintf("legacy-%g-%g-%t", heal, power, forest), RoyalSealHealingPower: &heal, BriarwoodSpellPower: &power, RoyalSealForestSpirit: forest}
}

func kfcLegacyRequest(owned bool) *proto.RaidSimRequest {
	request := kfcFeralheartRequest(0)
	request.Raid.Parties[0].Players[0].BonusStats = nil
	if owned {
		request.Raid.Parties[0].Players[0].Equipment.Items[12].Id = 18470
		request.Raid.Parties[0].Players[0].Equipment.Items[13].Id = 12930
	}
	return request
}

func TestKFCDruidLegacyActualHealingAndOwnedStats(t *testing.T) {
	output := [][]float64{}
	for _, values := range [][3]float64{{44, 29, 0}, {44, 15, 0}, {0, 15, 0}, {44, 29, 1}, {0, 15, 1}, {44, 30, 0}} {
		sim := core.NewSim(kfcLegacyRequest(true), simsignals.CreateSignals())
		sim.Reset()
		healer := sim.Raid.Parties[0].Players[0].(*RestorationDruid)
		before := healer.GetStat(stats.Spirit)
		policy := kfcLegacyPolicy(values[0], values[1], values[2] == 1)
		if err := healer.ConfigureKFCDruidLegacyItems(sim, policy); err != nil {
			t.Fatal(err)
		}
		target := &sim.Raid.GetFirstTargetDummy().Unit
		target.RemoveHealth(sim, 9000)
		spell := healer.GetSpell(core.ActionID{SpellID: 5185})
		spell.BonusCritRating = -10000
		kfcDruidNear(t, spell.HealingPower(target), values[0]+values[1])
		kfcDruidNear(t, healer.GetStat(stats.Spirit)-before, values[2]*16)
		if !spell.Cast(sim, target) {
			t.Fatal("Legacy test cast failed")
		}
		kfcDruidAdvance(t, sim, 1500*time.Millisecond)
		output = append(output, []float64{spell.HealingPower(target), healer.GetStat(stats.Spirit) - before, spell.SpellMetrics[target.UnitIndex].TotalHealing})
	}
	for index := 1; index < len(output); index++ {
		kfcDruidNear(t, output[index][2]-output[0][2], .429*(output[index][0]-output[0][0]))
	}
	sim := core.NewSim(kfcLegacyRequest(false), simsignals.CreateSignals())
	sim.Reset()
	healer := sim.Raid.Parties[0].Players[0].(*RestorationDruid)
	before := healer.GetStats()
	if err := healer.ConfigureKFCDruidLegacyItems(sim, kfcLegacyPolicy(0, 15, true)); err != nil {
		t.Fatal(err)
	}
	if healer.GetStats() != before {
		t.Fatal("Unowned item sensitivity changed player stats")
	}
	kfcDruidAdvancedResult("LEGACY_ACTUAL_HEALING", output)
}

func TestKFCDruidLegacyMultiplierResetAndFreshPolicy(t *testing.T) {
	request := kfcLegacyRequest(true)
	player := request.Raid.Parties[0].Players[0]
	player.TalentsString = "053-05-5050035133113251"
	player.Buffs = &proto.IndividualBuffs{BlessingOfKings: true}
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	healer := sim.Raid.Parties[0].Players[0].(*RestorationDruid)
	base := healer.GetStat(stats.Spirit)
	policy := kfcLegacyPolicy(0, 15, true)
	if err := healer.ConfigureKFCDruidLegacyItems(sim, policy); err != nil {
		t.Fatal(err)
	}
	want := base + 16*1.15*1.1
	kfcDruidNear(t, healer.GetStat(stats.Spirit), want)
	*policy.RoyalSealHealingPower = 44
	*policy.BriarwoodSpellPower = 29
	kfcDruidNear(t, *healer.kfcResolvedLegacyItemPolicy().RoyalSealHealingPower, 0)
	if healer.ConfigureKFCDruidLegacyItems(sim, kfcLegacyPolicy(44, 29, false)) == nil {
		t.Fatal("Policy changed after configuration")
	}
	for iteration := 0; iteration < 3; iteration++ {
		sim.Cleanup()
		sim.Reset()
		kfcDruidNear(t, healer.GetStat(stats.Spirit), want)
		kfcDruidNear(t, healer.GetStat(stats.HealingPower), 0)
		kfcDruidNear(t, healer.GetStat(stats.SpellPower), 15)
	}
	kfcDruidAdvancedResult("LEGACY_RESET_MULTIPLIERS", []float64{base, want, healer.GetStat(stats.Spirit)})
}

func TestKFCDruidLegacyPolicyValidationAndTiming(t *testing.T) {
	for _, policy := range []KFCDruidLegacyItemPolicy{kfcLegacyPolicy(45, 15, false), kfcLegacyPolicy(44, 31, false), kfcLegacyPolicy(math.NaN(), 15, false), {Schema: "kfc-druid-legacy-item-policy.v1", ID: "nil"}} {
		if policy.Validate() == nil {
			t.Fatal("Unreviewed values admitted")
		}
	}
	sim := core.NewSim(kfcLegacyRequest(true), simsignals.CreateSignals())
	sim.Reset()
	healer := sim.Raid.Parties[0].Players[0].(*RestorationDruid)
	target := &sim.Raid.GetFirstTargetDummy().Unit
	target.RemoveHealth(sim, 1000)
	if !healer.GetSpell(core.ActionID{SpellID: 5185}).Cast(sim, target) {
		t.Fatal("Timing control cast rejected")
	}
	if healer.ConfigureKFCDruidLegacyItems(sim, kfcLegacyPolicy(0, 15, false)) == nil {
		t.Fatal("Sensitivity changed during an active cast")
	}
}

func TestKFCDruidLegacyEquippedWorkloadPolicies(t *testing.T) {
	for index, policy := range []KFCDruidLegacyItemPolicy{kfcLegacyPolicy(44, 29, false), kfcLegacyPolicy(0, 15, false), kfcLegacyPolicy(44, 30, true)} {
		request, frame := kfcDruidWorkloadControl()
		player := request.Raid.Parties[0].Players[0]
		player.BonusStats = nil
		player.Equipment = &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
		for slot, id := range kfcDruidEquippedControlIds {
			player.Equipment.Items[slot] = &proto.ItemSpec{Id: id}
		}
		player.Equipment.Items[12].Id = 18470
		player.Equipment.Items[13].Id = 12930
		player.Equipment.Items[16].Id = 22398
		frame.LegacyItemsPolicy = &policy
		payload := kfcDruidControlPayload(t, request, frame, fmt.Sprintf("legacy-equipped-%d", index), false)
		reply := RunKFCDruidHealingJob(context.Background(), payload)
		if reply.Status != "complete" || reply.Result == nil || reply.Result.LegacyItemsPolicy == nil {
			t.Fatalf("Legacy workload failed: %+v", reply)
		}
		kfcDruidNear(t, *reply.Result.LegacyItemsPolicy.RoyalSealHealingPower, *policy.RoyalSealHealingPower)
		kfcDruidNear(t, *reply.Result.LegacyItemsPolicy.BriarwoodSpellPower, *policy.BriarwoodSpellPower)
		if reply.Result.Iterations != 2 {
			t.Fatal("Legacy workload did not repeat iterations")
		}
		kfcDruidAdvancedResult("LEGACY_EQUIPPED_REQUEST", json.RawMessage(payload))
		kfcDruidAdvancedResult("LEGACY_EQUIPPED_RESULT", reply)
	}
}
