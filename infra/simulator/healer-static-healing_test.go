package healing

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
	"testing"
	"time"
)

func kfcStaticHealingFixture(t *testing.T, id int32, slot int) (*core.Simulation, *HealingPriest, *core.Unit) {
	t.Helper()
	request := kfcWorkloadRequest(100000, 1, 30)
	player := request.Raid.Parties[0].Players[0]
	player.Equipment = kfcItemEquipment()
	if id != 0 {
		player.Equipment.Items[slot] = &proto.ItemSpec{Id: id}
	}
	player.Rotation = &proto.APLRotation{Type: proto.APLRotation_TypeAPL}
	request.SimOptions.Interactive, request.SimOptions.IsTest = true, true
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	healer := sim.Raid.Parties[0].Players[0].(*HealingPriest)
	return sim, healer, &sim.Raid.GetFirstTargetDummy().Unit
}

func kfcStaticFlashAmount(t *testing.T, id int32, slot int) (float64, *HealingPriest) {
	t.Helper()
	sim, healer, target := kfcStaticHealingFixture(t, id, slot)
	target.RemoveHealth(sim, 4000)
	spell := healer.FlashHeal[7]
	spell.BonusCritRating = -10000
	if !spell.Cast(sim, target) {
		t.Fatal("Equipped current healing control failed to cast")
	}
	kfcPriestAdvance(t, sim, 1500*time.Millisecond)
	return spell.SpellMetrics[target.UnitIndex].TotalHealing, healer
}

func TestKFCPriestCurrentStaticHealingValues(t *testing.T) {
	baseline, baseHealer := kfcStaticFlashAmount(t, 0, 0)
	observations := map[int32]float64{}
	for _, tc := range []struct {
		id                  int32
		slot                int
		healing, spellPower float64
	}{
		{2816, 14, 68, 0},
		{4746, 4, 16, 0},
		{5202, 4, 11, 0},
		{6226, 4, 13, 0},
		{6324, 4, 18, 0},
		{6465, 4, 9, 0},
		{6682, 4, 20, 0},
		{6901, 3, 7, 0},
		{7691, 0, 24, 0},
		{7708, 16, 9, 0},
		{7720, 0, 20, 0},
		{9407, 8, 20, 0},
		{9415, 4, 29, 0},
		{9623, 4, 26, 0},
		{10359, 9, 10, 0},
		{16690, 4, 20, 0},
		{16691, 9, 11, 0},
		{16692, 6, 15, 0},
		{16693, 0, 20, 0},
		{16694, 8, 24, 0},
		{16695, 2, 11, 0},
		{16696, 7, 11, 0},
		{16697, 5, 11, 0},
		{19507, 2, 22, 0},
		{227862, 9, 44, 0},
	} {
		t.Run(fmt.Sprintf("item-%d", tc.id), func(t *testing.T) {
			amount, healer := kfcStaticFlashAmount(t, tc.id, tc.slot)
			kfcPriestNear(t, healer.GetStat(stats.HealingPower)-baseHealer.GetStat(stats.HealingPower), tc.healing)
			kfcPriestNear(t, amount-baseline, (tc.healing+tc.spellPower)*.429)
			observations[tc.id] = healer.GetStat(stats.HealingPower) - baseHealer.GetStat(stats.HealingPower)
		})
	}
	encoded, err := json.Marshal(observations)
	if err != nil {
		t.Fatal(err)
	}
	fmt.Printf("KFC_HEALER_STATIC_VALUES %s\n", encoded)
}

func TestKFCPriestObservedHealingMacePriority(t *testing.T) {
	baseline, baseHealer := kfcStaticFlashAmount(t, 0, 0)
	amount, healer := kfcStaticFlashAmount(t, 272681, 14)
	kfcPriestNear(t, healer.GetStat(stats.HealingPower)-baseHealer.GetStat(stats.HealingPower), 176)
	kfcPriestNear(t, healer.Equipment[14].WeaponDamageMin, 64)
	kfcPriestNear(t, healer.Equipment[14].WeaponDamageMax, 119)
	kfcPriestNear(t, healer.Equipment[14].Stats[stats.SpellDamage], 58)
	kfcPriestNear(t, amount-baseline, 176*.429)
}

func TestKFCPriestStaticHealingExternalInputs(t *testing.T) {
	jobs := map[string]KFCHealingJob{}
	for _, tc := range []struct {
		name string
		id   int32
		slot int
	}{{"staticDevout", 16690, 4}, {"staticScepter", 2816, 14}} {
		request := kfcWorkloadRequest(10000, 3, 30)
		request.Raid.Parties[0].Players[0].Equipment = kfcItemEquipment()
		request.Raid.Parties[0].Players[0].Equipment.Items[tc.slot] = &proto.ItemSpec{Id: tc.id}
		job := kfcHealingProtocolJob(t, "external-"+tc.name, request, kfcTankWorkload(30), false)
		reply := RunKFCHealingJob(context.Background(), kfcHealingJobJSON(t, job))
		if reply.Status != "complete" || reply.Result == nil || reply.Result.HPS <= 0 {
			t.Fatalf("Equipped static healing workload failed: %+v", reply.Error)
		}
		jobs[tc.name] = job
	}
	encoded, err := json.Marshal(jobs)
	if err != nil {
		t.Fatal(err)
	}
	fmt.Printf("KFC_HEALER_STATIC_INPUTS %s\n", encoded)
}
