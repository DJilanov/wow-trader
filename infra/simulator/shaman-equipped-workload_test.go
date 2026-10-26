package restoration

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"math"
	"testing"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	googleProto "google.golang.org/protobuf/proto"
)

func kfcShamanEquippedControl(t *testing.T, profileID string, replacements map[int]int32) (*proto.RaidSimRequest, KFCShamanEquippedHealingWorkload) {
	t.Helper()
	data := kfcShamanEquipmentTestData(t)
	var profile *kfcShamanEquippedTestProfile
	for index := range data.Profiles {
		if data.Profiles[index].ID == profileID {
			profile = &data.Profiles[index]
		}
	}
	if profile == nil {
		t.Fatal("missing source profile", profileID)
	}
	request, workload := kfcShamanWorkloadControl()
	request.Encounter.Duration = 12
	request.SimOptions.Iterations = 1
	workload.Damage = nil
	for second := int64(1); second < 12; second++ {
		workload.Damage = append(workload.Damage, KFCShamanHealingDamageEvent{AtMS: second * 1000, RaidIndex: 1, Amount: 100})
	}
	player := kfcShamanEquipmentTestPlayer(*profile, profile.Seed)
	player.TalentsString = kfcShamanHealingStudySeeds[0]
	player.Spec = request.Raid.Parties[0].Players[0].Spec
	for slot, id := range replacements {
		player.Equipment.Items[slot] = &proto.ItemSpec{Id: id}
	}
	request.Raid.Parties[0].Players[0] = player
	raid, party, individual, err := kfcShamanEquippedSupport()
	if err != nil {
		t.Fatal(err)
	}
	request.Raid.Buffs, request.Raid.Parties[0].Buffs, player.Buffs = raid, party, individual
	identity, err := KFCShamanEquippedRuntimeIdentity()
	if err != nil {
		t.Fatal(err)
	}
	frame := KFCShamanEquippedHealingWorkload{Schema: "kfc-shaman-equipped-workload.v1", RuntimeIdentity: identity, DomainIdentity: data.DomainIdentity, ProfileID: profileID, RaidSupport: "full-v2", MP5Model: "per-five-reference", Workload: workload}
	kfcShamanEquippedTestPolicies(t, player, &frame)
	return request, frame
}

func kfcShamanEquippedTestPolicies(t *testing.T, player *proto.Player, frame *KFCShamanEquippedHealingWorkload) {
	t.Helper()
	ids, sets := map[int32]bool{}, map[int32]int{}
	for _, spec := range player.Equipment.Items {
		if spec.Id != 0 {
			ids[spec.Id] = true
			sets[core.ItemsByID[spec.Id].SetID]++
		}
	}
	effects := KFCShamanEquippedEffects{}
	points, err := kfcShamanHealingStudyRanks(player.TalentsString)
	if err != nil {
		t.Fatal(err)
	}
	if ids[272431] || ids[22345] && points[2][15] > 0 {
		effects.Relic = &KFCShamanHealingRelicPolicy{CostStacking: "additive-percent-reference"}
	}
	if sets[187] >= 5 {
		effects.Elements = &KFCShamanElementsPolicy{ProcChance: "client-proc-record-reference", ProcRouting: "completed-class-healing-casts-reference"}
	}
	if sets[519] >= 4 {
		effects.FiveThunders = &KFCShamanFiveThundersPolicy{ProcRouting: "completed-class-healing-casts-reference"}
	}
	for _, id := range []int32{181, 182, 183, 185} {
		if sets[id] >= 5 {
			effects.CastSets = &KFCShamanCastResourceSetPolicy{ProcRouting: "completed-class-healing-casts-reference"}
			if id == 183 {
				effects.CastSets.DreadmistCriticals = "noncritical-reference"
			}
			if id == 185 {
				effects.CastSets.WildheartChance = "two-percent-reference"
			}
		}
	}
	if sets[kfcShamanHealthRegenerationSetID] >= kfcShamanHealthRegenerationThreshold {
		effects.HealthRegen = &KFCShamanHealthRegenerationPolicy{TickTiming: "two-second-ticks-reference"}
	}
	for id := range ids {
		if kfcShamanFlatItemHealthPerFive[id] > 0 {
			effects.FlatRegen = &KFCShamanHealthRegenerationPolicy{TickTiming: "two-second-ticks-reference"}
		}
	}
	if ids[kfcShamanHeartItemID] {
		chance := 1.0
		effects.Heart = &KFCShamanHealingItemEffectsPolicy{Schema: "kfc-shaman-item-effects-policy.v1", ID: "controlled-one-proc-reference", DormantHeartProcChance: &chance, DormantHeartHealingEvents: "completed-casts"}
	}
	if sets[162] >= 4 || sets[163] >= 6 || sets[182] >= 4 {
		effects.Reactive = &KFCShamanReactiveSetPolicy{Schema: "kfc-shaman-reactive-set-policy.v1", ID: "controlled-reactive-reference", ThresholdTiming: "after-hit", SelfDamageTriggers: true, DevoutChance: .02}
	}
	for _, id := range []int32{4262, 8346, 11808, 13937, 4381, 13143, 18637, 6323, 11923} {
		if ids[id] {
			effects.Utility = &KFCShamanUtilityPolicy{Schema: "kfc-shaman-utility-policy.v1", ID: "controlled-utility-reference", ResourceRolls: "independent-reference", HeadmasterIntellect: "disabled-reference", BaronTickPeriodMS: 2000}
		}
	}
	if ids[12930] || ids[18471] || ids[13968] {
		effects.Legacy = &KFCShamanLegacyItemPolicy{Schema: "kfc-shaman-legacy-item-policy.v1", ID: "controlled-legacy-reference"}
		if ids[12930] {
			value := 15.0
			effects.Legacy.BriarwoodSpellPower = &value
		}
		if ids[18471] {
			value := 18.0
			effects.Legacy.RoyalSealSpellPower = &value
		}
		if ids[13968] {
			effects.Legacy.EyeScriptReference = "captured-passive-unmodeled-script-reference"
		}
	}
	frame.Effects = effects
}

func kfcShamanEquippedResult(t *testing.T, request *proto.RaidSimRequest, frame KFCShamanEquippedHealingWorkload) *KFCShamanHealingWorkloadResult {
	t.Helper()
	result, err := RunKFCShamanEquippedHealingWorkload(context.Background(), request, frame)
	if err != nil {
		t.Fatal(err)
	}
	if result.Equipped == nil || result.ClassQualified || result.PublicationAllowed || result.Equipped.FullClassAdmission || result.Equipped.PublicationAllowed {
		t.Fatal("missing receipt or premature admission")
	}
	if result.Assignment == nil || result.Metrics == nil || !kfcFinite(result.Metrics.Hps.Avg) {
		t.Fatal("missing actual fight metrics")
	}
	return result
}

func kfcShamanEquippedItemUses(result *KFCShamanHealingWorkloadResult, itemID int32) int32 {
	var total int32
	for _, action := range result.Metrics.Parties[0].Players[0].Actions {
		if action.Id.GetItemId() == itemID {
			for _, target := range action.Targets {
				if action.IsPassive {
					total += target.Hits + target.Crits
				} else {
					total += target.Casts
				}
			}
		}
	}
	return total
}

func TestKFCShamanEquippedWorkloadActualCompleteProfiles(t *testing.T) {
	data := kfcShamanEquipmentTestData(t)
	for _, profile := range data.Profiles {
		request, frame := kfcShamanEquippedControl(t, profile.ID, nil)
		before := googleProto.Clone(request)
		result := kfcShamanEquippedResult(t, request, frame)
		if result.Assignment.SupportHpsMean <= 0 || result.SurvivalRate != 1 || !googleProto.Equal(before, request) {
			t.Fatal("invalid actual equipped profile fight", profile.ID)
		}
		kfcShamanNear(t, result.Assignment.DamageDemandMean, 1100)
		kfcShamanMeasure("EQUIPPED_WORKLOAD_PROFILE", result)
	}
}

func TestKFCShamanEquippedWorkloadNoImplicitActives(t *testing.T) {
	request, frame := kfcShamanEquippedControl(t, "2-4-11", map[int]int32{12: 18371, 13: 11819})
	request.Raid.Parties[0].Players[0].Consumes = &proto.Consumes{DefaultPotion: proto.Potions_MajorManaPotion, DefaultConjured: proto.Conjured_ConjuredDemonicRune}
	result := kfcShamanEquippedResult(t, request, frame)
	for _, item := range []int32{12662, 13444} {
		if kfcShamanEquippedItemUses(result, item) != 0 {
			t.Fatal("unrequested consume", item)
		}
	}
	for _, spell := range []int32{1302205, 15604} {
		if kfcShamanWorkloadCasts(result, spell) != 0 {
			t.Fatal("unrequested equipped item", spell)
		}
	}
	kfcShamanMeasure("EQUIPPED_WORKLOAD_NO_IMPLICIT_USE", result)
}

func TestKFCShamanEquippedWorkloadRuneSelfHealingExcludedFromExternalLedger(t *testing.T) {
	request, frame := kfcShamanEquippedControl(t, "2-4-11", nil)
	request.Raid.Parties[0].Players[0].Consumes = &proto.Consumes{DefaultConjured: proto.Conjured_ConjuredDemonicRune}
	frame.Workload.Damage = nil
	frame.Workload.Priorities = []KFCShamanHealingPriority{{SpellID: 10396, RaidIndex: -1, MinimumMissingHealth: 1}}
	frame.Cooldowns = []KFCShamanEquippedCooldown{{ItemID: 12662, RaidIndex: -1, MaximumUses: 1}}
	result := kfcShamanEquippedResult(t, request, frame)
	if kfcShamanEquippedItemUses(result, 12662) != 1 || result.Metrics.EffectiveHealingHps.Avg <= 0 || result.SurvivalRate != 1 {
		t.Fatal("Rune did not produce real safe self healing")
	}
	kfcShamanNear(t, result.Assignment.SupportHpsMean, 0)
	kfcShamanNear(t, result.Assignment.DamageDemandMean, 0)
	kfcShamanNear(t, result.Assignment.ExternalMissingHealthSecondsMean, 0)
	kfcShamanMeasure("EQUIPPED_WORKLOAD_RUNE_LEDGER", result)
}

func TestKFCShamanEquippedWorkloadRecombobulatorAndRuneShareCooldown(t *testing.T) {
	for _, recombFirst := range []bool{true, false} {
		request, frame := kfcShamanEquippedControl(t, "2-4-11", map[int]int32{12: 18637, 13: 11819})
		request.Raid.Parties[0].Players[0].Consumes = &proto.Consumes{DefaultConjured: proto.Conjured_ConjuredDemonicRune}
		frame.Cooldowns = []KFCShamanEquippedCooldown{{ItemID: 18637, RaidIndex: -1, MaximumUses: 1}, {ItemID: 12662, RaidIndex: -1, MaximumUses: 1}}
		if !recombFirst {
			frame.Cooldowns[0], frame.Cooldowns[1] = frame.Cooldowns[1], frame.Cooldowns[0]
		}
		result := kfcShamanEquippedResult(t, request, frame)
		if kfcShamanEquippedItemUses(result, 18637)+kfcShamanEquippedItemUses(result, 12662) != 1 || (kfcShamanEquippedItemUses(result, 18637) == 1) != recombFirst {
			t.Fatal("shared conjured timer or declared resource order ignored")
		}
		kfcShamanMeasure("EQUIPPED_WORKLOAD_CONJURED_ORDER", result)
	}
}

func TestKFCShamanEquippedWorkloadCircleAndHealthFloor(t *testing.T) {
	request, frame := kfcShamanEquippedControl(t, "2-4-11", map[int]int32{0: 11808})
	request.Encounter.Duration = 16
	frame.Workload.Damage = nil
	frame.Workload.Priorities = []KFCShamanHealingPriority{{SpellID: 10396, RaidIndex: -1, MinimumMissingHealth: 1}}
	frame.Cooldowns = []KFCShamanEquippedCooldown{{ItemID: 11808, RaidIndex: -1, MaximumUses: 1}}
	used := kfcShamanEquippedResult(t, request, frame)
	if kfcShamanEquippedItemUses(used, 11808) != 1 || kfcShamanWorkloadCasts(used, 10396) == 0 {
		t.Fatal("actual Circle channel or subsequent healing missing")
	}
	kfcShamanNear(t, used.Assignment.SupportHpsMean, 0)
	frame.Cooldowns[0].MinimumOwnHealth = 1000000
	blocked := kfcShamanEquippedResult(t, request, frame)
	if kfcShamanEquippedItemUses(blocked, 11808) != 0 || kfcShamanWorkloadCasts(blocked, 10396) != 0 {
		t.Fatal("own-health threshold ignored")
	}
	kfcShamanMeasure("EQUIPPED_WORKLOAD_CIRCLE", []*KFCShamanHealingWorkloadResult{used, blocked})
}

func TestKFCShamanEquippedWorkloadManaItemsSharedTimer(t *testing.T) {
	request, frame := kfcShamanEquippedControl(t, "2-4-11", map[int]int32{12: 18371, 13: 11819})
	request.Encounter.Duration = 20
	frame.Cooldowns = []KFCShamanEquippedCooldown{{ItemID: 18371, RaidIndex: -1, MaximumUses: 1}, {ItemID: 11819, RaidIndex: -1, MaximumUses: 1}}
	result := kfcShamanEquippedResult(t, request, frame)
	if kfcShamanWorkloadCasts(result, 1302205) != 1 || kfcShamanWorkloadCasts(result, 15604) != 1 {
		t.Fatal("owned mana actions missing")
	}
	kfcShamanMeasure("EQUIPPED_WORKLOAD_MANA_ITEMS", result)
}

func TestKFCShamanEquippedWorkloadAnalyzerEyeSharedTimer(t *testing.T) {
	request, frame := kfcShamanEquippedControl(t, "2-4-11", map[int]int32{12: 272438, 13: 13968})
	request.Encounter.Duration = 24
	frame.Cooldowns = []KFCShamanEquippedCooldown{{ItemID: 272438, RaidIndex: -1, MaximumUses: 1}, {ItemID: 13968, RaidIndex: -1, MaximumUses: 1}}
	result := kfcShamanEquippedResult(t, request, frame)
	if kfcShamanEquippedItemUses(result, 272438) != 1 || kfcShamanEquippedItemUses(result, 13968) != 1 {
		t.Fatal("shared crit/hit item decisions missing")
	}
	kfcShamanMeasure("EQUIPPED_WORKLOAD_CRIT_ITEMS", result)
}

func TestKFCShamanEquippedWorkloadResetMatchesFreshIterations(t *testing.T) {
	request, frame := kfcShamanEquippedControl(t, "2-4-11", map[int]int32{0: 11808, 12: 12930, 13: 18471, 14: 6323, 15: 0})
	request.SimOptions.Iterations = 2
	request.Encounter.Duration = 24
	request.Raid.Parties[0].Players[0].Consumes = &proto.Consumes{DefaultConjured: proto.Conjured_ConjuredDemonicRune, MainHandImbue: proto.WeaponImbue_LesserManaOil}
	frame.Workload.Priorities[0].RaidIndex = -1
	frame.Cooldowns = []KFCShamanEquippedCooldown{{ItemID: 12662, RaidIndex: -1, MaximumUses: 1}, {ItemID: 11808, RaidIndex: -1, EarliestMS: 5000, MaximumUses: 1}}
	combined := kfcShamanEquippedResult(t, request, frame)
	var support, mana, raw, effective, missing float64
	hps := []float64{}
	for iteration := int32(0); iteration < 2; iteration++ {
		single := googleProto.Clone(request).(*proto.RaidSimRequest)
		single.SimOptions.Iterations = 1
		single.SimOptions.RandomSeed += int64(iteration)
		result := kfcShamanEquippedResult(t, single, frame)
		support += result.Assignment.SupportHpsMean / 2
		mana += result.ManaRemainingMean / 2
		raw += result.Metrics.RawHealingHps.Avg / 2
		effective += result.Metrics.EffectiveHealingHps.Avg / 2
		missing += result.MissingHealthSecondsMean / 2
		hps = append(hps, result.Assignment.SupportHpsMean)
	}
	kfcShamanNear(t, combined.Assignment.SupportHpsMean, support)
	kfcShamanNear(t, combined.ManaRemainingMean, mana)
	kfcShamanNear(t, combined.Metrics.RawHealingHps.Avg, raw)
	kfcShamanNear(t, combined.Metrics.EffectiveHealingHps.Avg, effective)
	kfcShamanNear(t, combined.MissingHealthSecondsMean, missing)
	kfcShamanNear(t, combined.Assignment.SupportHpsStdev, math.Abs(hps[0]-hps[1])/2)
	kfcShamanMeasure("EQUIPPED_WORKLOAD_RESET", combined)
}

func TestKFCShamanEquippedWorkloadStrictRequestAndPolicyOwnership(t *testing.T) {
	changes := []func(*proto.RaidSimRequest, *KFCShamanEquippedHealingWorkload){
		func(_ *proto.RaidSimRequest, frame *KFCShamanEquippedHealingWorkload) {
			frame.RuntimeIdentity = "wrong"
		},
		func(_ *proto.RaidSimRequest, frame *KFCShamanEquippedHealingWorkload) { frame.DomainIdentity = "wrong" },
		func(_ *proto.RaidSimRequest, frame *KFCShamanEquippedHealingWorkload) { frame.Effects.Relic = nil },
		func(_ *proto.RaidSimRequest, frame *KFCShamanEquippedHealingWorkload) {
			frame.Effects.Legacy = &KFCShamanLegacyItemPolicy{Schema: "kfc-shaman-legacy-item-policy.v1", ID: "unowned", EyeScriptReference: "captured-passive-unmodeled-script-reference"}
		},
		func(_ *proto.RaidSimRequest, frame *KFCShamanEquippedHealingWorkload) {
			frame.Workload.Targets[0].MaximumHealth = 1000000
		},
		func(request *proto.RaidSimRequest, _ *KFCShamanEquippedHealingWorkload) {
			request.Raid.Parties[0].Players[0].BonusStats = &proto.UnitStats{Stats: []float64{999}}
		},
		func(request *proto.RaidSimRequest, _ *KFCShamanEquippedHealingWorkload) {
			request.Raid.Parties[0].Players[0].ForeverTier1Bonuses = true
		},
		func(request *proto.RaidSimRequest, _ *KFCShamanEquippedHealingWorkload) {
			request.Raid.Parties[0].Players[0].Database = &proto.SimDatabase{Items: []*proto.SimItem{{Id: 3836, Stats: []float64{999}}}}
		},
		func(request *proto.RaidSimRequest, _ *KFCShamanEquippedHealingWorkload) {
			request.Raid.Parties[0].Players[0].GetRestorationShaman().Options = &proto.RestorationShaman_Options{MainHandImbue: 1}
		},
		func(request *proto.RaidSimRequest, _ *KFCShamanEquippedHealingWorkload) {
			request.Raid.Parties[0].Players[0].Buffs.BlessingOfKings = false
		},
		func(request *proto.RaidSimRequest, _ *KFCShamanEquippedHealingWorkload) {
			request.Raid.Parties[0].Players[0].Buffs.Innervates = 1
		},
		func(request *proto.RaidSimRequest, _ *KFCShamanEquippedHealingWorkload) {
			request.Raid.Buffs.StrengthOfEarthTotem = proto.TristateEffect_TristateEffectRegular
		},
		func(request *proto.RaidSimRequest, _ *KFCShamanEquippedHealingWorkload) {
			request.Raid.Parties[0].Players[0].Consumes = &proto.Consumes{Food: 5}
		},
		func(request *proto.RaidSimRequest, _ *KFCShamanEquippedHealingWorkload) {
			request.Raid.Parties[0].Players[0].Consumes = &proto.Consumes{MainHandImbue: 21}
		},
		func(request *proto.RaidSimRequest, _ *KFCShamanEquippedHealingWorkload) {
			request.Raid.Parties[0].Players[0].Consumes = &proto.Consumes{DefaultConjured: 1}
		},
		func(request *proto.RaidSimRequest, _ *KFCShamanEquippedHealingWorkload) {
			request.Raid.Parties[0].Players[0].Consumes = &proto.Consumes{SpellPowerBuff: 2}
		},
		func(request *proto.RaidSimRequest, _ *KFCShamanEquippedHealingWorkload) {
			request.Raid.Parties[0].Players[0].ForeverMp5PerSecond = true
		},
		func(request *proto.RaidSimRequest, _ *KFCShamanEquippedHealingWorkload) {
			request.SimOptions.Debug = true
		},
	}
	for index, edit := range changes {
		request, frame := kfcShamanEquippedControl(t, "2-4-11", nil)
		edit(request, &frame)
		if _, err := RunKFCShamanEquippedHealingWorkload(context.Background(), request, frame); err == nil {
			t.Fatal("invalid request accepted", index)
		}
	}
	kfcShamanMeasure("EQUIPPED_WORKLOAD_STRICT_INPUTS", len(changes))
}

func TestKFCShamanEquippedWorkloadActualWireAndCancellation(t *testing.T) {
	request, frame := kfcShamanEquippedControl(t, "2-4-11", map[int]int32{12: 18637})
	request.Raid.Parties[0].Players[0].Consumes = &proto.Consumes{DefaultPotion: proto.Potions_MajorManaPotion, DefaultConjured: proto.Conjured_ConjuredDemonicRune}
	frame.Cooldowns = []KFCShamanEquippedCooldown{{ItemID: 18637, RaidIndex: -1, MaximumUses: 1}, {ItemID: 12662, RaidIndex: -1, MaximumUses: 1}, {ItemID: 13444, RaidIndex: -1, MaximumUses: 1}}
	encoded, err := googleProto.Marshal(request)
	if err != nil {
		t.Fatal(err)
	}
	job := KFCShamanEquippedHealingJob{Schema: "kfc-shaman-equipped-job.v1", ID: "equipped-transport-control", RequestBase64: base64.StdEncoding.EncodeToString(encoded), Workload: frame, Detail: true}
	payload, err := json.Marshal(job)
	if err != nil {
		t.Fatal(err)
	}
	reply := RunKFCShamanEquippedHealingJob(context.Background(), payload)
	if reply.Status != "complete" || reply.Result == nil || reply.Result.Equipped == nil || len(reply.Result.Metrics) == 0 {
		t.Fatal("actual equipped job failed", reply.Error)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if cancelled := RunKFCShamanEquippedHealingJob(ctx, payload); cancelled.Status != "error" || cancelled.Error == nil || cancelled.Error.Code != "cancelled" {
		t.Fatal("cancellation lost", cancelled)
	}
	var value map[string]interface{}
	if err = json.Unmarshal(payload, &value); err != nil {
		t.Fatal(err)
	}
	value["unsupported"] = true
	invalid, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	if result := RunKFCShamanEquippedHealingJob(context.Background(), invalid); result.Status != "error" || result.Error.Code != "invalid_job" {
		t.Fatal("unknown JSON accepted")
	}
	kfcShamanMeasure("EQUIPPED_WORKLOAD_WIRE", struct {
		Payload json.RawMessage                  `json:"payload"`
		Reply   KFCShamanEquippedHealingJobReply `json:"reply"`
	}{payload, reply})
}
