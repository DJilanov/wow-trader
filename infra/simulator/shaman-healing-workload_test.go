package restoration

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"math"
	"testing"

	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/stats"
	"google.golang.org/protobuf/encoding/protowire"
	googleProto "google.golang.org/protobuf/proto"
)

func kfcShamanWorkloadControl() (*proto.RaidSimRequest, KFCShamanHealingWorkload) {
	request := kfcShamanRequest(500)
	request.Raid.Parties[0].Players[0].TalentsString = kfcShamanHealingStudySeeds[0]
	request.Encounter.Duration = 30
	request.SimOptions.Iterations = 2
	frame := KFCShamanHealingWorkload{Schema: "kfc-shaman-healing-workload.v1", Name: "shaman-controller-control", DecisionIntervalMS: 50, BounceRange: 12.5, ChainRouting: "nearest-injured-reference", Water: kfcShamanWaterDefault(), Resources: kfcShamanResourceDefault(), Riptide: kfcRiptideDefault(),
		Targets:    []KFCShamanHealingTarget{{RaidIndex: 0}, {RaidIndex: 1, MaximumHealth: 18000, X: 2}, {RaidIndex: 2, MaximumHealth: 10000, X: 4}, {RaidIndex: 3, MaximumHealth: 10000, X: 6}, {RaidIndex: 4, MaximumHealth: 10000, X: 8}},
		Priorities: []KFCShamanHealingPriority{{SpellID: 10396, RaidIndex: 1, MinimumMissingHealth: 500}},
	}
	for second := int64(1); second < 30; second++ {
		frame.Damage = append(frame.Damage, KFCShamanHealingDamageEvent{AtMS: second * 1000, RaidIndex: 1, Amount: 100})
	}
	return request, frame
}

func kfcShamanWorkloadPayload(t *testing.T, request *proto.RaidSimRequest, frame KFCShamanHealingWorkload, detail bool) []byte {
	t.Helper()
	encoded, err := googleProto.Marshal(request)
	if err != nil {
		t.Fatal(err)
	}
	bytes, err := json.Marshal(KFCShamanHealingJob{Schema: "kfc-shaman-healing-job.v1", ID: "shaman-workload-control", RequestBase64: base64.StdEncoding.EncodeToString(encoded), Workload: frame, Detail: detail})
	if err != nil {
		t.Fatal(err)
	}
	return bytes
}

func kfcShamanWorkloadResult(t *testing.T, request *proto.RaidSimRequest, frame KFCShamanHealingWorkload) *KFCShamanHealingWorkloadResult {
	t.Helper()
	result, err := RunKFCShamanHealingWorkload(context.Background(), request, frame)
	if err != nil {
		t.Fatal(err)
	}
	if result.ClassQualified || result.PublicationAllowed || result.Assignment == nil || result.Metrics == nil {
		t.Fatal("Component granted qualification or lost measurements")
	}
	kfcShamanNear(t, result.Metrics.RawHealingHps.Avg, result.Metrics.EffectiveHealingHps.Avg+result.Metrics.OverhealingHps.Avg)
	kfcShamanNear(t, result.Metrics.Hps.Avg, result.Metrics.EffectiveHealingHps.Avg+result.Metrics.AbsorbedHps.Avg)
	return result
}

func kfcShamanWorkloadCasts(result *KFCShamanHealingWorkloadResult, id int32) int32 {
	var casts int32
	for _, action := range result.Metrics.Parties[0].Players[0].Actions {
		if action.Id.GetSpellId() == id {
			for _, target := range action.Targets {
				casts += target.Casts
			}
		}
	}
	return casts
}

func TestKFCShamanWorkloadActualCastsLedgerAndCallerPreservation(t *testing.T) {
	request, frame := kfcShamanWorkloadControl()
	before := googleProto.Clone(request)
	result := kfcShamanWorkloadResult(t, request, frame)
	if !googleProto.Equal(before, request) || result.SurvivalRate != 1 || result.Metrics.Hps.Avg <= 0 || result.ManaRemainingMean <= 0 {
		t.Fatal("Invalid actual controller outcome")
	}
	kfcShamanNear(t, result.DeliveredIncomingDamageMean, 2900)
	kfcShamanNear(t, result.Assignment.DamageDemandMean, 2900)
	kfcShamanNear(t, result.Assignment.SupportHpsMean, result.Metrics.EffectiveHealingHps.Avg)
	kfcShamanNear(t, result.Assignment.HealthRestoredHpsMean*30+result.Assignment.FinalExternalMissingHealthMean, 2900)
	if kfcShamanWorkloadCasts(result, 10396) < 2 {
		t.Fatal("No actual casts")
	}
	kfcShamanMeasure("WORKLOAD_TANK", result)
}

func TestKFCShamanWorkloadZeroDemandAndExactDeficitIntegral(t *testing.T) {
	request, frame := kfcShamanWorkloadControl()
	request.Encounter.Duration = 6
	frame.Damage = nil
	zero := kfcShamanWorkloadResult(t, request, frame)
	kfcShamanNear(t, zero.Assignment.SupportHpsMean, 0)
	kfcShamanNear(t, zero.MissingHealthSecondsMean, 0)
	if kfcShamanWorkloadCasts(zero, 10396) != 0 {
		t.Fatal("Healed a healthy raid")
	}
	frame.Damage = []KFCShamanHealingDamageEvent{{AtMS: 1000, RaidIndex: 1, Amount: 1000}}
	frame.Priorities[0].MinimumMissingHealth = 1000000
	result := kfcShamanWorkloadResult(t, request, frame)
	kfcShamanNear(t, result.Assignment.ExternalMissingHealthSecondsMean, 5000)
	kfcShamanNear(t, result.Assignment.FinalExternalMissingHealthMean, 1000)
	kfcShamanNear(t, result.Assignment.SupportHpsMean, 0)
	kfcShamanMeasure("WORKLOAD_INTEGRAL", result.Assignment)
}

func TestKFCShamanWorkloadDeathOverkillAndNoResurrection(t *testing.T) {
	request, frame := kfcShamanWorkloadControl()
	request.Encounter.Duration = 6
	frame.Damage = []KFCShamanHealingDamageEvent{{AtMS: 1000, RaidIndex: 1, Amount: 20000}, {AtMS: 2000, RaidIndex: 1, Amount: 100}}
	result := kfcShamanWorkloadResult(t, request, frame)
	kfcShamanNear(t, result.SurvivalRate, 0)
	kfcShamanNear(t, result.DeliveredIncomingDamageMean, 20000)
	kfcShamanNear(t, result.Assignment.DamageDemandMean, 18000)
	kfcShamanNear(t, result.Assignment.OverkillExcludedMean, 2000)
	kfcShamanNear(t, result.Assignment.SupportHpsMean, 0)
	kfcShamanNear(t, result.Assignment.ExternalMissingHealthSecondsMean, 90000)
	if kfcShamanWorkloadCasts(result, 10396) != 0 {
		t.Fatal("Cast on a dead target")
	}
	kfcShamanMeasure("WORKLOAD_DEATH", result.Assignment)
}

func TestKFCShamanWorkloadChainDemandCountsOnlyReachableBounces(t *testing.T) {
	request, frame := kfcShamanWorkloadControl()
	request.Encounter.Duration = 8
	frame.Damage = nil
	for index := int32(1); index <= 3; index++ {
		frame.Damage = append(frame.Damage, KFCShamanHealingDamageEvent{AtMS: 1000, RaidIndex: index, Amount: 2000})
	}
	frame.Priorities = []KFCShamanHealingPriority{{SpellID: 10623, RaidIndex: -1, MinimumMissingHealth: 100, MinimumInjuredTargets: 3, MinimumGroupMissingHealth: 3000}}
	near := kfcShamanWorkloadResult(t, request, frame)
	if kfcShamanWorkloadCasts(near, 10623) == 0 || near.Assignment.SupportHpsMean <= 0 {
		t.Fatal("Reachable Chain Heal was skipped")
	}
	frame.Targets[3].X = 50
	far := kfcShamanWorkloadResult(t, request, frame)
	if kfcShamanWorkloadCasts(far, 10623) != 0 {
		t.Fatal("Unreachable third recipient satisfied Chain Heal demand")
	}
	kfcShamanMeasure("WORKLOAD_CHAIN", []float64{near.Assignment.SupportHpsMean, far.Assignment.SupportHpsMean})
}

func TestKFCShamanWorkloadRiptideMaintenanceAndChainRequirement(t *testing.T) {
	request, frame := kfcShamanWorkloadControl()
	request.Encounter.Duration = 12
	frame.Damage = []KFCShamanHealingDamageEvent{{AtMS: 1000, RaidIndex: 1, Amount: 9000}}
	frame.Priorities = []KFCShamanHealingPriority{{SpellID: 1239243, RaidIndex: 1, MinimumMissingHealth: 100, KeepHot: true}, {SpellID: 10623, RaidIndex: 1, MinimumMissingHealth: 100, RequireHot: true}}
	frame.Riptide.ConsumeHot = false
	result := kfcShamanWorkloadResult(t, request, frame)
	if kfcShamanWorkloadCasts(result, 1239243) != request.SimOptions.Iterations || kfcShamanWorkloadCasts(result, 10623) == 0 {
		t.Fatal("HoT maintenance or primary Chain Heal requirement failed")
	}
	frame.Priorities = frame.Priorities[1:]
	noHot := kfcShamanWorkloadResult(t, request, frame)
	if kfcShamanWorkloadCasts(noHot, 10623) != 0 {
		t.Fatal("Required own Riptide was ignored")
	}
	kfcShamanMeasure("WORKLOAD_RIPTIDE", []float64{result.Assignment.SupportHpsMean, noHot.Assignment.SupportHpsMean})
}

func TestKFCShamanWorkloadRangeSelectionAndTieOrder(t *testing.T) {
	request, frame := kfcShamanWorkloadControl()
	request.Encounter.Duration = 8
	frame.Targets[1].X = 41
	frame.Damage = []KFCShamanHealingDamageEvent{{AtMS: 1000, RaidIndex: 1, Amount: 10000}, {AtMS: 1000, RaidIndex: 2, Amount: 1000}}
	frame.Priorities[0].RaidIndex = -1
	result := kfcShamanWorkloadResult(t, request, frame)
	if result.Assignment.SupportHpsMean <= 0 || result.FinalMissingHealthMean < 10000 {
		t.Fatal("Unreachable most injured player blocked reachable healing")
	}
	kfcShamanMeasure("WORKLOAD_RANGE", result.Assignment)
}

func TestKFCShamanWorkloadSwiftnessGCDAndActualOwnership(t *testing.T) {
	request, frame := kfcShamanWorkloadControl()
	request.Encounter.Duration = 2
	frame.Damage = []KFCShamanHealingDamageEvent{{AtMS: 1000, RaidIndex: 1, Amount: 5000}}
	without := kfcShamanWorkloadResult(t, request, frame)
	kfcShamanNear(t, without.Assignment.SupportHpsMean, 0)
	frame.UseNaturesSwiftness = true
	frame.NaturesSwiftnessMinimumMissingHealth = 3000
	with := kfcShamanWorkloadResult(t, request, frame)
	if with.Assignment.SupportHpsMean <= 0 || kfcShamanWorkloadCasts(with, 16188) != request.SimOptions.Iterations || kfcShamanWorkloadCasts(with, 10396) != request.SimOptions.Iterations {
		t.Fatal("NS did not produce one real instant heal within the fight")
	}
	kfcShamanMeasure("WORKLOAD_SWIFTNESS", with.Assignment)
}

func TestKFCShamanWorkloadWaterShieldAndTotemMaintenance(t *testing.T) {
	request, frame := kfcShamanWorkloadControl()
	request.Encounter.Duration = 8
	frame.Damage = []KFCShamanHealingDamageEvent{{AtMS: 1000, RaidIndex: 1, Amount: 1000}}
	frame.Priorities = []KFCShamanHealingPriority{{SpellID: 408510, RaidIndex: -1}, {SpellID: 10463, RaidIndex: -1}, {SpellID: 10396, RaidIndex: 1, MinimumMissingHealth: 1000000}}
	result := kfcShamanWorkloadResult(t, request, frame)
	if kfcShamanWorkloadCasts(result, 408510) != request.SimOptions.Iterations || kfcShamanWorkloadCasts(result, 10463) != request.SimOptions.Iterations || result.Assignment.SupportHpsMean <= 0 {
		t.Fatal("Shield or Stream maintenance refreshed every decision or never healed")
	}
	kfcShamanMeasure("WORKLOAD_MAINTENANCE", result.Assignment)
}

func TestKFCShamanWorkloadManaTideReplacementAndUsefulMana(t *testing.T) {
	request, frame := kfcShamanWorkloadControl()
	request.Encounter.Duration = 20
	frame.Damage = []KFCShamanHealingDamageEvent{{AtMS: 1000, RaidIndex: 1, Amount: 9000}}
	frame.Priorities = []KFCShamanHealingPriority{{SpellID: 1325256, RaidIndex: -1, MinimumMissingMana: 1000}, {SpellID: 10463, RaidIndex: -1}, {SpellID: 10396, RaidIndex: 1, MinimumMissingHealth: 100}}
	result := kfcShamanWorkloadResult(t, request, frame)
	if kfcShamanWorkloadCasts(result, 1325256) != request.SimOptions.Iterations || result.Assignment.UsefulOwnManaTideManaMean <= 0 {
		t.Fatal("Tide did not replace Stream after real mana use")
	}
	kfcShamanNear(t, result.Assignment.UsefulOtherManaTideManaMean, 0)
	if kfcShamanWorkloadCasts(result, 10463) > 2*request.SimOptions.Iterations {
		t.Fatal("Stream interrupted active Tide")
	}
	kfcShamanMeasure("WORKLOAD_TIDE", result.Assignment)
}

func TestKFCShamanWorkloadOOMAccounting(t *testing.T) {
	request, frame := kfcShamanWorkloadControl()
	request.Encounter.Duration = 60
	request.Raid.Parties[0].Players[0].BonusStats = &proto.UnitStats{Stats: stats.Stats{stats.Mana: -2000}.ToFloatArray()}
	frame.Damage = nil
	for second := int64(1); second < 60; second++ {
		frame.Damage = append(frame.Damage, KFCShamanHealingDamageEvent{AtMS: second * 1000, RaidIndex: 1, Amount: 500})
	}
	result := kfcShamanWorkloadResult(t, request, frame)
	if result.ManaBlockedSecondsMean <= 0 || result.ManaBlockedSecondsMean > 60 {
		t.Fatal("No bounded real mana-blocked time")
	}
	kfcShamanMeasure("WORKLOAD_OOM", []float64{result.ManaBlockedSecondsMean, result.ManaRemainingMean, result.SurvivalRate})
}

func TestKFCShamanWorkloadInputAndPolicyGuards(t *testing.T) {
	for _, kind := range []string{"partial-talents", "equipment", "consumes", "external-mana", "external-tide", "raid-book", "unowned-riptide", "unowned-swiftness", "foreign-options", "duplicate-target", "missing-target", "self-damage", "nan-damage", "invalid-time", "invalid-geometry", "invalid-water", "invalid-resource", "invalid-riptide", "invalid-hot", "invalid-chain-count", "mana-on-heal", "health-on-shield", "inactive-swiftness", "unscheduled-enemy"} {
		request, frame := kfcShamanWorkloadControl()
		player := request.Raid.Parties[0].Players[0]
		switch kind {
		case "partial-talents":
			player.TalentsString = ""
		case "equipment":
			player.Equipment = &proto.EquipmentSpec{Items: []*proto.ItemSpec{{Id: 12930}}}
		case "consumes":
			player.Consumes = &proto.Consumes{DefaultPotion: proto.Potions_MajorManaPotion}
		case "external-mana":
			player.Buffs = &proto.IndividualBuffs{Innervates: 1}
		case "external-tide":
			request.Raid.Parties[0].Buffs = &proto.PartyBuffs{ManaTideTotems: 1}
		case "raid-book":
			frame.Priorities[0].SpellID = 25357
		case "unowned-riptide":
			player.TalentsString = kfcShamanHealingStudySeeds[2]
			frame.Priorities[0].SpellID = 1239243
		case "unowned-swiftness":
			player.TalentsString = kfcShamanStudyEdit(kfcShamanStudyEdit(player.TalentsString, "naturesSwiftness", -1), "naturalGrace", 1)
			frame.UseNaturesSwiftness = true
		case "foreign-options":
			player.GetRestorationShaman().Options.EarthShieldPPM = 1
		case "duplicate-target":
			frame.Targets[4] = frame.Targets[3]
		case "missing-target":
			frame.Targets = frame.Targets[:4]
		case "self-damage":
			frame.Damage[0].RaidIndex = 0
		case "nan-damage":
			frame.Damage[0].Amount = math.NaN()
		case "invalid-time":
			frame.Damage[0].AtMS = 30000
		case "invalid-geometry":
			frame.Targets[1].X = 1000001
		case "invalid-water":
			frame.Water.FirstPulse = "guessed"
		case "invalid-resource":
			frame.Resources.ShieldTriggers = "guessed"
		case "invalid-riptide":
			frame.Riptide.HotCadence = "guessed"
		case "invalid-hot":
			frame.Priorities[0].KeepHot = true
		case "invalid-chain-count":
			frame.Priorities[0] = KFCShamanHealingPriority{SpellID: 10623, RaidIndex: -1, MinimumInjuredTargets: 4}
		case "mana-on-heal":
			frame.Priorities[0].MinimumMissingMana = 1
		case "health-on-shield":
			frame.Priorities[0] = KFCShamanHealingPriority{SpellID: 408510, RaidIndex: -1, MinimumMissingHealth: 1}
		case "inactive-swiftness":
			frame.NaturesSwiftnessMinimumMissingHealth = 1
		case "unscheduled-enemy":
			request.Encounter.Targets[0].SwingSpeed = 2
		}
		if _, err := RunKFCShamanHealingWorkload(context.Background(), request, frame); err == nil {
			t.Fatal("Unsupported input admitted", kind)
		}
	}
	kfcShamanMeasure("WORKLOAD_REJECT", 24)
}

func TestKFCShamanWorkloadProtocolStrictnessCancellationAndRecovery(t *testing.T) {
	request, frame := kfcShamanWorkloadControl()
	payload := kfcShamanWorkloadPayload(t, request, frame, true)
	reply := RunKFCShamanHealingJob(context.Background(), payload)
	if reply.Status != "complete" || reply.Result == nil || len(reply.Result.Metrics) == 0 || reply.Result.Assignment == nil {
		t.Fatalf("Missing real protocol result: %+v", reply.Error)
	}
	unknown := googleProto.Clone(request).(*proto.RaidSimRequest)
	unknown.SimOptions.ProtoReflect().SetUnknown(protowire.AppendVarint(protowire.AppendTag(nil, 2047, protowire.VarintType), 1))
	for _, body := range [][]byte{append(append([]byte{}, payload...), []byte(" {}")...), append([]byte(`{"unknown":1,`), payload[1:]...), kfcShamanWorkloadPayload(t, unknown, frame, false), []byte(`{"schema":"kfc-shaman-healing-job.v1","id":"bad","requestBase64":"!"}`)} {
		bad := RunKFCShamanHealingJob(context.Background(), body)
		if bad.Status != "error" || bad.Error == nil {
			t.Fatal("Malformed job accepted")
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if result, err := RunKFCShamanHealingWorkload(ctx, request, frame); result != nil || err != context.Canceled {
		t.Fatal("Cancelled workload ran")
	}
	if result, err := RunKFCShamanHealingWorkload(nil, request, frame); result != nil || err == nil {
		t.Fatal("Nil context accepted")
	}
	if next := RunKFCShamanHealingJob(context.Background(), payload); next.Status != "complete" {
		t.Fatal("Worker did not recover after bad jobs")
	}
	kfcShamanMeasure("WORKLOAD_PROTOCOL", reply)
}
