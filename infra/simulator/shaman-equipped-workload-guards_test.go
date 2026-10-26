package restoration

import (
	"context"
	"testing"

	"github.com/wowsims/classic/sim/core/proto"
)

func TestKFCShamanEquippedWorkloadCooldownUseLimitAndEarliestTime(t *testing.T) {
	for _, entry := range []struct {
		maximum  int
		earliest int64
	}{{1, 0}, {2, 0}, {1, 120000}} {
		request, frame := kfcShamanEquippedControl(t, "2-4-11", nil)
		request.Encounter.Duration = 250
		request.Raid.Parties[0].Players[0].Consumes = &proto.Consumes{DefaultConjured: proto.Conjured_ConjuredDemonicRune}
		frame.Workload.Damage = nil
		frame.Workload.Priorities = []KFCShamanHealingPriority{{SpellID: 10396, RaidIndex: -1, MinimumMissingHealth: 1}}
		frame.Cooldowns = []KFCShamanEquippedCooldown{{ItemID: 12662, RaidIndex: -1, EarliestMS: entry.earliest, MaximumUses: entry.maximum}}
		result := kfcShamanEquippedResult(t, request, frame)
		if kfcShamanEquippedItemUses(result, 12662) != int32(entry.maximum) || result.Equipped.CooldownUsesMean[0] != float64(entry.maximum) || result.SurvivalRate != 1 {
			t.Fatal("cooldown use limit/earliest time failed", entry, result.Equipped.CooldownUsesMean)
		}
		kfcShamanNear(t, result.Assignment.SupportHpsMean, 0)
		kfcShamanMeasure("EQUIPPED_WORKLOAD_USE_LIMIT", result)
	}
}

func TestKFCShamanEquippedWorkloadRejectsPartialTalentBuilds(t *testing.T) {
	request, frame := kfcShamanEquippedControl(t, "2-4-11", nil)
	request.Raid.Parties[0].Players[0].TalentsString = "--5"
	kfcShamanEquippedTestPolicies(t, request.Raid.Parties[0].Players[0], &frame)
	if _, err := RunKFCShamanEquippedHealingWorkload(context.Background(), request, frame); err == nil {
		t.Fatal("component-only partial talents accepted as a full equipped build")
	}
	if _, err := RunKFCShamanEquippedHealingWorkload(nil, request, frame); err == nil {
		t.Fatal("nil cancellation context accepted")
	}
	if _, err := RunKFCShamanEquippedHealingWorkload(context.Background(), nil, frame); err == nil {
		t.Fatal("nil equipped request accepted")
	}
	kfcShamanMeasure("EQUIPPED_WORKLOAD_PARTIAL_BUILD_REJECTION", 3)
}

func TestKFCShamanEquippedWorkloadUtilityRecipientRangeAndManaThreshold(t *testing.T) {
	for _, manaFloor := range []float64{0, 1000} {
		request, frame := kfcShamanEquippedControl(t, "2-4-11", map[int]int32{6: 8346})
		frame.Workload.Damage = []KFCShamanHealingDamageEvent{{AtMS: 0, RaidIndex: 1, Amount: 1000}, {AtMS: 0, RaidIndex: 2, Amount: 5000}}
		frame.Workload.Targets[2].X = 41
		frame.Workload.Priorities[0].MinimumMissingHealth = 1000000
		frame.Cooldowns = []KFCShamanEquippedCooldown{{ItemID: 8346, RaidIndex: -1, MinimumMissingHealth: 100, MinimumMissingMana: manaFloor, MaximumUses: 1}}
		result := kfcShamanEquippedResult(t, request, frame)
		if manaFloor > 0 {
			if result.Equipped.CooldownUsesMean[0] != 0 || result.Assignment.SupportHpsMean != 0 {
				t.Fatal("mana threshold used a recipient without a mana bar")
			}
		} else {
			if result.Equipped.CooldownUsesMean[0] != 1 || result.Assignment.SupportHpsMean <= 0 {
				t.Fatal("out-of-range injured player blocked a reachable utility recipient")
			}
			for _, action := range result.Metrics.Parties[0].Players[0].Actions {
				if action.Id.GetItemId() == 8346 {
					for _, target := range action.Targets {
						if target.Hits+target.Crits > 0 && target.UnitIndex != 2 {
							t.Fatal("utility healed the wrong recipient", target.UnitIndex)
						}
					}
				}
			}
		}
		kfcShamanMeasure("EQUIPPED_WORKLOAD_UTILITY_RECIPIENT", result)
	}
}
