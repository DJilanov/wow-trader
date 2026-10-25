package holy

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/stats"
	"google.golang.org/protobuf/encoding/protojson"
)

func TestKFCPaladinGapCatalogCurrentStatsAndObservedPrecedence(t *testing.T) {
	values := []float64{}
	for _, row := range []struct {
		id    int32
		stat  stats.Stat
		value float64
	}{
		{872, stats.Strength, 7}, {872, stats.NatureResistance, 7}, {1951, stats.Agility, 4},
		{2292, stats.ShadowPower, 14}, {2816, stats.ShadowPower, 28}, {6449, stats.NatureResistance, 2},
		{6463, stats.SpellPenetration, 2}, {6481, stats.Agility, 2}, {7709, stats.ShadowPower, 19},
		{7711, stats.FirePower, 16}, {10762, stats.FrostPower, 14}, {10762, stats.ShadowPower, 14},
		{16732, stats.BlockValue, 17}, {250490, stats.Defense, 3}, {250495, stats.Defense, 5},
		{250497, stats.Strength, 3}, {250500, stats.Defense, 7}, {250515, stats.Defense, 2},
	} {
		actual := core.ItemsByID[row.id].Stats[row.stat]
		kfcPaladinNear(t, actual, row.value)
		values = append(values, actual)
	}
	kfcPaladinNear(t, core.ItemsByID[272681].Stats[stats.HealingPower], 176)
	kfcPaladinNear(t, core.ItemsByID[272681].Stats[stats.SpellDamage], 58)
	kfcPaladinHeartMeasure("GAP_CURRENT_STATS", values)
}

func TestKFCPaladinGapQuestChoicesEquippedStats(t *testing.T) {
	for _, row := range []struct {
		id                 int32
		slot               proto.ItemSlot
		healing, intellect float64
	}{{20504, proto.ItemSlot_ItemSlotMainHand, 0, 0}, {20505, proto.ItemSlot_ItemSlotFinger1, 15, 7}} {
		item := core.ItemsByID[row.id]
		if item.ID != row.id {
			t.Fatal("Missing Paladin class-quest reward", row.id)
		}
		_, base := kfcPaladinUtilityFixture(t, nil)
		sim, healer := kfcPaladinUtilityFixture(t, map[int]int32{int(row.slot): row.id})
		if healer.Equipment[row.slot].ID != row.id {
			t.Fatal("Quest item shifted equipment slots")
		}
		spell := healer.GetSpell(core.ActionID{SpellID: 10329})
		kfcPaladinNear(t, spell.HealingPower(&healer.Unit)-base.GetSpell(core.ActionID{SpellID: 10329}).HealingPower(&base.Unit), row.healing)
		kfcPaladinNear(t, healer.GetStat(stats.Intellect)-base.GetStat(stats.Intellect), row.intellect*1.1)
		healer.RemoveHealth(sim, 2000)
		if !spell.Cast(sim, &healer.Unit) {
			t.Fatal("Quest-equipped healing cast failed")
		}
		kfcPaladinAdvance(t, sim, 2500*time.Millisecond)
		if healer.CurrentHealth() <= healer.MaxHealth()-2000 {
			t.Fatal("Quest-equipped spell did not heal")
		}
		kfcPaladinHeartMeasure(fmt.Sprintf("GAP_QUEST_%d", row.id), []float64{healer.GetStat(stats.Intellect), spell.HealingPower(&healer.Unit)})
	}
}

func kfcPaladinGapHealthResource(healer *HolyPaladin) (float64, float64) {
	raw, actual := 0.0, 0.0
	for _, row := range healer.Metrics.ToProto().Resources {
		if row.Id.Tag == 46 && row.Type == proto.ResourceType_ResourceTypeHealth {
			raw += row.Gain
			actual += row.ActualGain
		}
	}
	return raw, actual
}

func TestKFCPaladinGapHealthPerFiveAllOwnedItemsAndTiming(t *testing.T) {
	for _, row := range []struct {
		id   int32
		slot proto.ItemSlot
		rate float64
	}{
		{2816, proto.ItemSlot_ItemSlotMainHand, 12}, {6320, proto.ItemSlot_ItemSlotOffHand, 4},
		{6459, proto.ItemSlot_ItemSlotFeet, 6}, {6461, proto.ItemSlot_ItemSlotShoulder, 10},
		{6910, proto.ItemSlot_ItemSlotLegs, 5}, {7684, proto.ItemSlot_ItemSlotShoulder, 9},
		{14149, proto.ItemSlot_ItemSlotBack, 5}, {16731, proto.ItemSlot_ItemSlotHead, 8},
	} {
		for _, period := range []int64{2000, 5000} {
			sim, healer := kfcPaladinUtilityFixture(t, map[int]int32{int(row.slot): row.id})
			if err := healer.ConfigureKFCPaladinItemHealthRegen(sim, &period); err != nil {
				t.Fatal(err)
			}
			healer.AddStatDynamic(sim, stats.HealingPower, 100000)
			healer.AddStatDynamic(sim, stats.SpellCrit, 10000)
			healer.RemoveHealth(sim, 1000)
			before := healer.CurrentHealth()
			kfcPaladinAdvance(t, sim, time.Duration(period)*time.Millisecond-time.Nanosecond)
			kfcPaladinNear(t, healer.CurrentHealth(), before)
			kfcPaladinAdvance(t, sim, time.Duration(period)*time.Millisecond)
			kfcPaladinNear(t, healer.CurrentHealth()-before, row.rate*float64(period)/5000)
			kfcPaladinAdvance(t, sim, 10*time.Second)
			kfcPaladinNear(t, healer.CurrentHealth()-before, row.rate*2)
			raw, actual := kfcPaladinGapHealthResource(healer)
			kfcPaladinNear(t, raw, row.rate*2)
			kfcPaladinNear(t, actual, row.rate*2)
			for _, spell := range healer.Spellbook {
				for _, metric := range spell.SpellMetrics {
					if metric.TotalHealing > 0 {
						t.Fatal("Regeneration became spell healing")
					}
				}
			}
			kfcPaladinHeartMeasure(fmt.Sprintf("GAP_HP5_%d_%d", row.id, period), []float64{raw, actual})
		}
	}
}

func TestKFCPaladinGapHealthPerFiveStacksCapsStopsOnDeathAndResets(t *testing.T) {
	sim, healer := kfcPaladinUtilityFixture(t, map[int]int32{int(proto.ItemSlot_ItemSlotMainHand): 2816, int(proto.ItemSlot_ItemSlotOffHand): 6320})
	healer.RemoveHealth(sim, 100)
	before := healer.CurrentHealth()
	kfcPaladinAdvance(t, sim, 10*time.Second)
	kfcPaladinNear(t, healer.CurrentHealth()-before, 32)
	healer.GainHealth(sim, healer.MaxHealth(), healer.NewHealthMetrics(core.ActionID{SpellID: 1, Tag: 161}))
	healer.RemoveHealth(sim, 1)
	rawBefore, actualBefore := kfcPaladinGapHealthResource(healer)
	kfcPaladinAdvance(t, sim, 12*time.Second)
	raw, actual := kfcPaladinGapHealthResource(healer)
	kfcPaladinNear(t, raw-rawBefore, 6.4)
	kfcPaladinNear(t, actual-actualBefore, 1)
	healer.RemoveHealth(sim, healer.CurrentHealth())
	kfcPaladinAdvance(t, sim, 20*time.Second)
	rawAfter, _ := kfcPaladinGapHealthResource(healer)
	kfcPaladinNear(t, healer.CurrentHealth(), 0)
	kfcPaladinNear(t, rawAfter, raw)
	sim.Cleanup()
	sim.Reset()
	healer.RemoveHealth(sim, 100)
	before = healer.CurrentHealth()
	kfcPaladinAdvance(t, sim, 2*time.Second)
	kfcPaladinNear(t, healer.CurrentHealth()-before, 6.4)
	kfcPaladinHeartMeasure("GAP_HP5_LIFECYCLE", []float64{raw, actual, healer.CurrentHealth() - before})
}

func TestKFCPaladinGapHealthTimingFreshnessOwnershipAndCopy(t *testing.T) {
	value := int64(5000)
	sim, none := kfcPaladinUtilityFixture(t, nil)
	if none.ConfigureKFCPaladinItemHealthRegen(sim, &value) == nil {
		t.Fatal("Unowned timing admitted")
	}
	for _, invalid := range []int64{0, 1, 1000, 2001, 5001} {
		sim, healer := kfcPaladinUtilityFixture(t, map[int]int32{14: 2816})
		if healer.ConfigureKFCPaladinItemHealthRegen(sim, &invalid) == nil {
			t.Fatal("Invalid timing admitted")
		}
	}
	sim, healer := kfcPaladinUtilityFixture(t, map[int]int32{14: 2816})
	if err := healer.ConfigureKFCPaladinItemHealthRegen(sim, &value); err != nil {
		t.Fatal(err)
	}
	value = 2000
	if *healer.itemHealthRegen.echo != 5000 || healer.itemHealthRegen.tickMs != 5000 {
		t.Fatal("Caller mutated timing policy")
	}
	if healer.ConfigureKFCPaladinItemHealthRegen(sim, &value) == nil {
		t.Fatal("Timing changed twice")
	}
	sim, healer = kfcPaladinUtilityFixture(t, map[int]int32{14: 2816})
	kfcPaladinAdvance(t, sim, 2*time.Second)
	if healer.ConfigureKFCPaladinItemHealthRegen(sim, &value) == nil {
		t.Fatal("Timing changed after regeneration")
	}
	sim, healer = kfcPaladinUtilityFixture(t, map[int]int32{14: 2816})
	healer.GetSpell(core.ActionID{SpellID: 10329}).Cast(sim, &healer.Unit)
	if healer.ConfigureKFCPaladinItemHealthRegen(sim, &value) == nil {
		t.Fatal("Timing changed after casting")
	}
	kfcPaladinHeartMeasure("GAP_HP5_POLICY", true)
}

func TestKFCPaladinGapActualWorkloadAndTimingEcho(t *testing.T) {
	for _, period := range []int64{2000, 5000} {
		request, frame := kfcPaladinWorkloadControl()
		request.Raid.Parties[0].Players[0] = kfcPaladinRegenerationRequest(map[int]int32{0: 11808, 14: 2816}).Raid.Parties[0].Players[0]
		frame.Cooldowns = []KFCPaladinHealingCooldown{{ItemID: 11808, MinimumMissingMana: 100}}
		frame.ItemHealthRegenTickMs = &period
		job := kfcPaladinWorkloadPayload(t, request, frame, fmt.Sprintf("paladin-gap-hp5-%d", period), true)
		reply := RunKFCPaladinHealingJob(context.Background(), job)
		if reply.Status != "complete" {
			t.Fatal("Health regeneration workload failed", reply.Error)
		}
		if reply.Result.ItemHealthRegenTickMs == nil || *reply.Result.ItemHealthRegenTickMs != period {
			t.Fatal("Timing reference echo missing")
		}
		metrics := &proto.RaidMetrics{}
		if err := protojson.Unmarshal(reply.Result.Metrics, metrics); err != nil {
			t.Fatal(err)
		}
		found := false
		for _, row := range metrics.Parties[0].Players[0].Resources {
			if row.Id.GetItemId() == 2816 && row.Id.Tag == 46 && row.ActualGain > 0 {
				found = true
			}
		}
		if !found {
			t.Fatal("Circle self-damage was not regenerated")
		}
		var decoded interface{}
		if err := json.Unmarshal(job, &decoded); err != nil {
			t.Fatal(err)
		}
		kfcPaladinHeartMeasure("GAP_WORKLOAD_REQUEST", decoded)
		kfcPaladinHeartMeasure(fmt.Sprintf("GAP_WORKLOAD_%d", period), reply.Result)
	}
}
