package restoration

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
)

var kfcSecondarySetIDs = map[int32][]int32{
	81:  {13388, 13389, 13390, 13391, 13392},
	122: {14626, 14629, 14631, 14632, 14633},
}

func kfcSecondarySetRequest(t *testing.T, set int32, count int) *proto.RaidSimRequest {
	t.Helper()
	request := kfcFeralheartRequest(0)
	slots := map[proto.ItemType]int{1: 0, 3: 2, 5: 4, 6: 5, 9: 8, 10: 9, 11: 10}
	for _, id := range kfcSecondarySetIDs[set][:count] {
		item, exists := core.ItemsByID[id]
		slot, correctType := slots[item.Type]
		if !exists || !correctType || item.SetID != set {
			t.Fatal("Incorrect compiled secondary set item")
		}
		request.Raid.Parties[0].Players[0].Equipment.Items[slot] = &proto.ItemSpec{Id: id}
	}
	return request
}

func kfcSecondarySetFixture(t *testing.T, set int32, count int) (*core.Simulation, *RestorationDruid) {
	t.Helper()
	sim := core.NewSim(kfcSecondarySetRequest(t, set, count), simsignals.CreateSignals())
	sim.Reset()
	return sim, sim.Raid.Parties[0].Players[0].(*RestorationDruid)
}

func TestKFCDruidSecondarySetExactHealingThresholds(t *testing.T) {
	_, bare := kfcSecondarySetFixture(t, 81, 0)
	output := []float64{}
	for _, set := range []int32{81, 122} {
		for count := 1; count <= 5; count++ {
			_, healer := kfcSecondarySetFixture(t, set, count)
			var equipment stats.Stats
			for _, id := range kfcSecondarySetIDs[set][:count] {
				equipment = equipment.Add(core.ItemsByID[id].Stats)
			}
			want := 0.0
			if set == 81 && count >= 3 || set == 122 && count >= 5 {
				want = 23
			}
			kfcDruidNear(t, healer.GetStat(stats.SpellPower)-bare.GetStat(stats.SpellPower)-equipment[stats.SpellPower], want)
			kfcDruidNear(t, healer.GetStat(stats.HealingPower)-bare.GetStat(stats.HealingPower)-equipment[stats.HealingPower], 0)
			output = append(output, float64(set), float64(count), want)
		}
	}
	kfcDruidAdvancedResult("SECONDARY_SET_THRESHOLDS", output)
}

func TestKFCDruidSecondarySetBonusFeedsActualHealingOnce(t *testing.T) {
	output := []float64{}
	for _, set := range []int32{81, 122} {
		amounts, powers := []float64{}, []float64{}
		for _, count := range []int{0, 5} {
			sim, healer := kfcSecondarySetFixture(t, set, count)
			target := &sim.Raid.GetFirstTargetDummy().Unit
			target.RemoveHealth(sim, 9000)
			spell := healer.GetSpell(core.ActionID{SpellID: 5185})
			spell.BonusCritRating = -10000
			powers = append(powers, spell.HealingPower(target))
			if !spell.Cast(sim, target) {
				t.Fatal("Secondary set healing cast rejected")
			}
			kfcDruidAdvance(t, sim, 1500*time.Millisecond)
			amounts = append(amounts, spell.SpellMetrics[target.UnitIndex].TotalHealing)
		}
		power := 23.0
		for _, id := range kfcSecondarySetIDs[set] {
			item := core.ItemsByID[id]
			power += item.Stats[stats.SpellPower] + item.Stats[stats.HealingPower]
		}
		kfcDruidNear(t, powers[1]-powers[0], power)
		kfcDruidNear(t, amounts[1]-amounts[0], .429*power)
		output = append(output, float64(set), power, amounts[1]-amounts[0])
	}
	kfcDruidAdvancedResult("SECONDARY_SET_CASTS", output)
}

func TestKFCDruidSecondarySetCapabilityMetadataAndReset(t *testing.T) {
	for _, set := range []int32{81, 122} {
		sim, healer := kfcSecondarySetFixture(t, set, 5)
		threshold := int32(3)
		if set == 122 {
			threshold = 5
		}
		if core.ForeverEquipmentBonusSupported(set, threshold) {
			t.Fatal("Capability metadata changed; recheck the actual dispatch path")
		}
		before := healer.GetStat(stats.SpellPower)
		sim.Cleanup()
		sim.Reset()
		kfcDruidNear(t, healer.GetStat(stats.SpellPower), before)
	}
}

func TestKFCDruidSecondarySetEquippedWorkloadControls(t *testing.T) {
	for _, test := range []struct {
		set   int32
		count int
	}{{81, 2}, {81, 3}, {122, 4}, {122, 5}} {
		request, frame := kfcDruidWorkloadControl()
		player := request.Raid.Parties[0].Players[0]
		player.BonusStats = nil
		player.Equipment = kfcSecondarySetRequest(t, test.set, test.count).Raid.Parties[0].Players[0].Equipment
		for slot, id := range kfcDruidEquippedControlIds {
			if player.Equipment.Items[slot].Id == 0 {
				player.Equipment.Items[slot] = &proto.ItemSpec{Id: id}
			}
		}
		player.Equipment.Items[16].Id = 22398
		payload := kfcDruidControlPayload(t, request, frame, fmt.Sprintf("secondary-set-%d-%d", test.set, test.count), false)
		reply := RunKFCDruidHealingJob(context.Background(), payload)
		if reply.Status != "complete" || reply.Result.SurvivalRate != 1 {
			t.Fatalf("Equipped secondary set workload failed: %+v", reply)
		}
		kfcDruidAdvancedResult("SECONDARY_SET_EQUIPPED_REQUEST", json.RawMessage(payload))
		kfcDruidAdvancedResult("SECONDARY_SET_EQUIPPED_RESULT", reply)
	}
}
