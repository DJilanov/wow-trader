package restoration

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"testing"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/stats"
	"google.golang.org/protobuf/encoding/protojson"
	googleProto "google.golang.org/protobuf/proto"
)

func kfcDruidWorkloadControl() (*proto.RaidSimRequest, KFCDruidHealingWorkload) {
	request := &proto.RaidSimRequest{Raid: &proto.Raid{Parties: []*proto.Party{{Players: []*proto.Player{{Name: "Synthetic Druid workload control", Class: proto.Class_ClassDruid, Race: proto.Race_RaceNightElf, Level: 60,
		Equipment: &proto.EquipmentSpec{}, BonusStats: &proto.UnitStats{Stats: stats.Stats{stats.HealingPower: 500, stats.Mana: 10000}.ToFloatArray()},
		Spec: &proto.Player_RestorationDruid{RestorationDruid: &proto.RestorationDruid{Options: &proto.RestorationDruid_Options{}}}}}}}, TargetDummies: 4},
		Encounter:  &proto.Encounter{Duration: 30, Targets: []*proto.Target{{Name: "Synthetic incoming damage schedule", Level: 63}}},
		SimOptions: &proto.SimOptions{Iterations: 2, RandomSeed: 71911, Ruleset: proto.Ruleset_RulesetForever, IsTest: true}}
	frame := KFCDruidHealingWorkload{Schema: "kfc-druid-healing-workload.v1", Name: "druid-workload-control", DecisionIntervalMS: 50,
		HealingPolicy: KFCDruidHealingPolicy{WildGrowthDecay: .1, SwiftmendSelection: "shortest"},
		Targets:       []KFCDruidHealingTarget{{RaidIndex: 0}, {RaidIndex: 1, MaximumHealth: 18000, X: 2}, {RaidIndex: 2, MaximumHealth: 10000, X: 4}, {RaidIndex: 3, MaximumHealth: 10000, X: 6}, {RaidIndex: 4, MaximumHealth: 10000, X: 8}},
		Priorities:    []KFCDruidHealingPriority{{SpellID: 9889, RaidIndex: 1, MinimumMissingHealth: 500}}}
	for second := int64(1); second < 30; second++ {
		frame.Damage = append(frame.Damage, KFCDruidHealingDamageEvent{AtMS: second * 1000, RaidIndex: 1, Amount: 100})
	}
	return request, frame
}

func kfcDruidControlPayload(t *testing.T, request *proto.RaidSimRequest, frame KFCDruidHealingWorkload, id string, detail bool) []byte {
	t.Helper()
	encoded, err := googleProto.Marshal(request)
	if err != nil {
		t.Fatal(err)
	}
	payload, err := json.Marshal(KFCDruidHealingJob{Schema: "kfc-druid-healing-job.v1", ID: id, RequestBase64: base64.StdEncoding.EncodeToString(encoded), Workload: frame, Detail: detail})
	if err != nil {
		t.Fatal(err)
	}
	return payload
}

func TestKFCDruidWorkloadActualCastsAccountingAndProtocol(t *testing.T) {
	request, frame := kfcDruidWorkloadControl()
	payload := kfcDruidControlPayload(t, request, frame, "druid-tank-control", false)
	reply := RunKFCDruidHealingJob(context.Background(), payload)
	if reply.Status != "complete" || reply.Result == nil {
		t.Fatalf("Druid job failed: %+v", reply.Error)
	}
	result := reply.Result
	if result.ClassQualified || result.PublicationAllowed || result.SurvivalRate != 1 || result.EffectiveHealingHPS <= 0 || result.ManaRemainingMean <= 0 {
		t.Fatalf("Invalid Druid workload outcome: %+v", result)
	}
	kfcDruidNear(t, result.DeliveredIncomingDamageMean, 2900)
	kfcDruidNear(t, result.RawHPS, result.EffectiveHealingHPS+result.OverhealingHPS)
	kfcDruidNear(t, result.HPS, result.EffectiveHealingHPS+result.AbsorbedHPS)
	if len(result.Metrics) != 0 {
		t.Fatal("Unexpected detailed metrics")
	}
	encoded, err := json.Marshal(reply)
	if err != nil {
		t.Fatal(err)
	}
	var output map[string]interface{}
	if err = json.Unmarshal(encoded, &output); err != nil {
		t.Fatal(err)
	}
	kfcDruidAdvancedResult("WORKLOAD_TANK", output)
	kfcDruidAdvancedResult("WORKLOAD_REQUEST", json.RawMessage(payload))
}

func TestKFCDruidWorkloadTranquilityGroupDemandAndDetails(t *testing.T) {
	request, frame := kfcDruidWorkloadControl()
	request.Encounter.Duration = 12
	frame.Damage = nil
	for index := int32(1); index <= 4; index++ {
		frame.Damage = append(frame.Damage, KFCDruidHealingDamageEvent{AtMS: 1000, RaidIndex: index, Amount: 2500})
	}
	frame.Priorities = []KFCDruidHealingPriority{{SpellID: 9863, RaidIndex: 0, MinimumMissingHealth: 1000}, {SpellID: 9841, RaidIndex: -1, MinimumMissingHealth: 300, KeepHot: true}}
	reply := RunKFCDruidHealingJob(context.Background(), kfcDruidControlPayload(t, request, frame, "druid-group-control", true))
	if reply.Status != "complete" || reply.Result == nil {
		t.Fatalf("Group job failed: %+v", reply.Error)
	}
	if len(reply.Result.Metrics) == 0 || reply.Result.EffectiveHealingHPS <= 0 || reply.Result.SurvivalRate != 1 {
		t.Fatalf("Missing detailed group result: hps=%v survival=%v delivered=%v mana=%v", reply.Result.HPS, reply.Result.SurvivalRate, reply.Result.DeliveredIncomingDamageMean, reply.Result.ManaRemainingMean)
	}
	if casts := kfcDruidWorkloadCasts(t, reply.Result.Metrics, 9863); casts != request.SimOptions.Iterations {
		t.Fatalf("Full-health caster did not channel for injured party: %d casts", casts)
	}

	kfcDruidNear(t, reply.Result.DeliveredIncomingDamageMean, 10000)
	kfcDruidAdvancedResult("WORKLOAD_GROUP", []float64{reply.Result.HPS, reply.Result.RawHPS, reply.Result.MissingHealthSecondsMean, reply.Result.ManaRemainingMean})
}

func TestKFCDruidWorkloadRejectsUnsupportedSpellsAndPolicies(t *testing.T) {
	for _, kind := range []string{"raid-book", "unowned-wild-growth", "unowned-swiftness", "external-mana", "foreign-options", "invalid-sensitivity", "invalid-hot"} {
		request, frame := kfcDruidWorkloadControl()
		player := request.Raid.Parties[0].Players[0]
		switch kind {
		case "raid-book":
			frame.Priorities[0].SpellID = 25297
		case "unowned-wild-growth":
			frame.Priorities[0].SpellID = 1238215
		case "unowned-swiftness":
			frame.UseNaturesSwiftness = true
		case "external-mana":
			player.Buffs = &proto.IndividualBuffs{Innervates: 1}
		case "foreign-options":
			player.GetRestorationDruid().Options.InnervateTarget = &proto.UnitReference{Type: proto.UnitReference_Player, Index: 0}
		case "invalid-sensitivity":
			frame.HealingPolicy.WildGrowthDecay = .9
		case "invalid-hot":
			frame.Priorities[0].KeepHot = true
		}
		reply := RunKFCDruidHealingJob(context.Background(), kfcDruidControlPayload(t, request, frame, "invalid-"+kind, false))
		if reply.Status != "error" || reply.Error == nil || reply.Error.Code != "workload_failed" {
			t.Fatalf("Unsupported policy %s was not rejected cleanly: %+v", kind, reply)
		}
	}
}

func TestKFCDruidWorkloadEligibleTargetSelection(t *testing.T) {
	sim, healer := kfcDruidAdvancedFixture(500, map[string]int32{"swiftmend": 1}, 2)
	a, b := sim.Raid.AllUnits[1], sim.Raid.AllUnits[2]
	a.RemoveHealth(sim, 9000)
	b.RemoveHealth(sim, 4000)
	heal := healer.GetSpell(core.ActionID{SpellID: 9841})
	if !heal.Cast(sim, b) {
		t.Fatal("HoT failed")
	}
	priority := KFCDruidHealingPriority{SpellID: 9841, RaidIndex: -1, MinimumMissingHealth: 100, KeepHot: true}
	if healer.kfcDruidPriorityTarget(sim, priority) != a {
		t.Fatal("keepHot failed to select another injured target")
	}
	if healer.kfcDruidPriorityTarget(sim, KFCDruidHealingPriority{SpellID: 18562, RaidIndex: -1, MinimumMissingHealth: 100}) != b {
		t.Fatal("Swiftmend selected an injured target without its required HoT")
	}
}

func TestKFCDruidWorkloadDeathsCannotCountAsSurvival(t *testing.T) {
	request, frame := kfcDruidWorkloadControl()
	request.Encounter.Duration = 6
	frame.Damage = []KFCDruidHealingDamageEvent{{AtMS: 1000, RaidIndex: 1, Amount: 20000}, {AtMS: 2000, RaidIndex: 1, Amount: 100}}
	reply := RunKFCDruidHealingJob(context.Background(), kfcDruidControlPayload(t, request, frame, "death-control", false))
	if reply.Status != "complete" || reply.Result == nil {
		t.Fatalf("Death workload failed: %+v", reply.Error)
	}
	if reply.Result.SurvivalRate != 0 || reply.Result.DeliveredIncomingDamageMean >= reply.Result.PlannedIncomingPostMitigationDamage {
		t.Fatalf("Dead target was treated as a completed assignment: survival=%v delivered=%v planned=%v", reply.Result.SurvivalRate, reply.Result.DeliveredIncomingDamageMean, reply.Result.PlannedIncomingPostMitigationDamage)
	}
	kfcDruidAdvancedResult("WORKLOAD_DEATH", []float64{reply.Result.SurvivalRate, reply.Result.DeliveredIncomingDamageMean, reply.Result.PlannedIncomingPostMitigationDamage})
}

func TestKFCDruidWorkloadProtocolRejectsMalformedAndCancelledJobs(t *testing.T) {
	request, frame := kfcDruidWorkloadControl()
	payload := kfcDruidControlPayload(t, request, frame, "druid-valid-envelope", false)
	invalid := append(append([]byte{}, payload...), []byte(" {}")...)
	if reply := RunKFCDruidHealingJob(context.Background(), invalid); reply.Status != "error" || reply.Error.Code != "invalid_job" {
		t.Fatal("Trailing JSON accepted")
	}
	var job map[string]interface{}
	if err := json.Unmarshal(payload, &job); err != nil {
		t.Fatal(err)
	}
	job["workload"].(map[string]interface{})["useInnerFocus"] = true
	unknown, err := json.Marshal(job)
	if err != nil {
		t.Fatal(err)
	}
	if reply := RunKFCDruidHealingJob(context.Background(), unknown); reply.Status != "error" || reply.Error.Code != "invalid_job" {
		t.Fatal("Priest-only field accepted")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if reply := RunKFCDruidHealingJob(ctx, payload); reply.Status != "error" || reply.Error.Code != "cancelled" {
		t.Fatal("Cancellation ignored")
	}
	if reply := RunKFCDruidHealingJob(nil, payload); reply.Status != "error" || reply.Error.Code != "workload_failed" {
		t.Fatal("Missing context accepted")
	}
}

func kfcDruidWorkloadCasts(t *testing.T, body json.RawMessage, id int32) int32 {
	t.Helper()
	var metrics proto.RaidMetrics
	if err := protojson.Unmarshal(body, &metrics); err != nil {
		t.Fatal(err)
	}
	casts := int32(0)
	for _, party := range metrics.Parties {
		for _, player := range party.Players {
			for _, action := range player.Actions {
				if action.Id.GetSpellId() == id {
					for _, target := range action.Targets {
						casts += target.Casts
					}
				}
			}
		}
	}
	return casts
}

func TestKFCDruidWorkloadInnervateRequiresExplicitPolicy(t *testing.T) {
	counts := []float64{}
	for _, enabled := range []bool{false, true} {
		request, frame := kfcDruidWorkloadControl()
		if enabled {
			threshold := 500.0
			frame.InnervateMinimumMissingMana = &threshold
		}
		reply := RunKFCDruidHealingJob(context.Background(), kfcDruidControlPayload(t, request, frame, "owned-mana-control", true))
		if reply.Status != "complete" {
			t.Fatalf("Owned mana policy failed: %+v", reply.Error)
		}
		casts := kfcDruidWorkloadCasts(t, reply.Result.Metrics, 29166)
		if (!enabled && casts != 0) || (enabled && casts != request.SimOptions.Iterations) {
			t.Fatalf("Explicit owned policy=%v produced %d Innervate casts", enabled, casts)
		}
		counts = append(counts, float64(casts), reply.Result.ManaRemainingMean)
	}
	kfcDruidAdvancedResult("WORKLOAD_OWNED_MANA", counts)
}
