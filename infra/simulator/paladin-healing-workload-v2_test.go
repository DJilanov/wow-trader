package holy

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/stats"
	"google.golang.org/protobuf/encoding/protojson"
	googleProto "google.golang.org/protobuf/proto"
)

func kfcPaladinReferencePolicy() *KFCPaladinHealingRankPolicy {
	return &KFCPaladinHealingRankPolicy{Schema: "kfc-paladin-rank-sensitivity.v1", ID: "captured-client", Kind: "unscaled-reference", ClassProcMode: "unchanged"}
}

func kfcPaladinWorkloadControl() (*proto.RaidSimRequest, KFCPaladinHealingWorkload) {
	request := &proto.RaidSimRequest{
		Raid: &proto.Raid{Parties: []*proto.Party{{Players: []*proto.Player{{Name: "Synthetic Paladin workload control", Class: proto.Class_ClassPaladin, Race: proto.Race_RaceHuman, Level: 60,
			Equipment: &proto.EquipmentSpec{}, BonusStats: &proto.UnitStats{Stats: stats.Stats{stats.HealingPower: 500, stats.Mana: 10000}.ToFloatArray()},
			Spec: &proto.Player_HolyPaladin{HolyPaladin: &proto.HolyPaladin{Options: &proto.PaladinOptions{}}}}}}}, TargetDummies: 4},
		Encounter:  &proto.Encounter{Duration: 30, Targets: []*proto.Target{{Name: "Synthetic declared post-mitigation damage", Level: 63}}},
		SimOptions: &proto.SimOptions{Iterations: 2, RandomSeed: 71911, Ruleset: proto.Ruleset_RulesetForever, IsTest: true},
	}
	frame := KFCPaladinHealingWorkload{Schema: "kfc-paladin-healing-workload.v1", Name: "paladin-workload-control", DecisionIntervalMS: 50,
		AllowConditionalSpellCandidates: true, VigilRefundMode: KFCPaladinVigilSingleRefund, RankScaling: kfcPaladinReferencePolicy(),
		Targets:    []KFCPaladinHealingTarget{{RaidIndex: 0}, {RaidIndex: 1, MaximumHealth: 18000, X: 2}, {RaidIndex: 2, MaximumHealth: 10000, X: 4}, {RaidIndex: 3, MaximumHealth: 10000, X: 6}, {RaidIndex: 4, MaximumHealth: 10000, X: 8}},
		Priorities: []KFCPaladinHealingPriority{{SpellID: 10329, RaidIndex: 1, MinimumMissingHealth: 500}},
	}
	for second := int64(1); second < 30; second++ {
		frame.Damage = append(frame.Damage, KFCPaladinHealingDamageEvent{AtMS: second * 1000, RaidIndex: 1, Amount: 100})
	}
	return request, frame
}

func kfcPaladinWorkloadPayload(t *testing.T, request *proto.RaidSimRequest, frame KFCPaladinHealingWorkload, id string, detail bool) []byte {
	t.Helper()
	encoded, err := googleProto.Marshal(request)
	if err != nil {
		t.Fatal(err)
	}
	bytes, err := json.Marshal(KFCPaladinHealingJob{Schema: "kfc-paladin-healing-job.v1", ID: id, RequestBase64: base64.StdEncoding.EncodeToString(encoded), Workload: frame, Detail: detail})
	if err != nil {
		t.Fatal(err)
	}
	return bytes
}

func kfcPaladinRequireReply(t *testing.T, reply KFCPaladinHealingJobReply) *KFCPaladinHealingJobResult {
	t.Helper()
	if reply.Status != "complete" || reply.Result == nil {
		t.Fatalf("Paladin workload failed: %+v", reply.Error)
	}
	result := reply.Result
	if result.ClassQualified || result.PublicationAllowed {
		t.Fatal("Workload claimed full class admission")
	}
	kfcPaladinNear(t, result.RawHPS, result.EffectiveHealingHPS+result.OverhealingHPS)
	kfcPaladinNear(t, result.HPS, result.EffectiveHealingHPS+result.AbsorbedHPS)
	return result
}

func kfcPaladinWorkloadCasts(t *testing.T, bytes []byte, id int32) int32 {
	t.Helper()
	metrics := &proto.RaidMetrics{}
	if err := protojson.Unmarshal(bytes, metrics); err != nil {
		t.Fatal(err)
	}
	var casts int32
	for _, action := range metrics.Parties[0].Players[0].Actions {
		if action.Id.GetSpellId() == id {
			for _, target := range action.Targets {
				casts += target.Casts
			}
		}
	}
	return casts
}

func TestKFCPaladinWorkloadActualCastsAndProtocol(t *testing.T) {
	request, frame := kfcPaladinWorkloadControl()
	before := googleProto.Clone(request)
	payload := kfcPaladinWorkloadPayload(t, request, frame, "paladin-tank-control", false)
	reply := RunKFCPaladinHealingJob(context.Background(), payload)
	result := kfcPaladinRequireReply(t, reply)
	if result.SurvivalRate != 1 || result.EffectiveHealingHPS <= 0 || result.ManaRemainingMean <= 0 || len(result.Metrics) != 0 {
		t.Fatal("Invalid basic workload outcome")
	}
	kfcPaladinNear(t, result.DeliveredIncomingDamageMean, 2900)
	if !googleProto.Equal(before, request) {
		t.Fatal("Workload changed the caller's request")
	}
	kfcPaladinActiveMeasure("WORKLOAD_REQUEST", json.RawMessage(payload))
	kfcPaladinActiveMeasure("WORKLOAD_TANK", reply)
}

func kfcPaladinVigilWorkload() (*proto.RaidSimRequest, KFCPaladinHealingWorkload) {
	request, frame := kfcPaladinWorkloadControl()
	request.Raid.Parties[0].Players[0].TalentsString = kfcPaladinActiveTalents(map[int]int{13: 1, 16: 1})
	request.Encounter.Duration = 12
	frame.Damage = nil
	for index := int32(1); index <= 4; index++ {
		frame.Damage = append(frame.Damage, KFCPaladinHealingDamageEvent{AtMS: 1000, RaidIndex: index, Amount: 2500})
	}
	frame.Priorities = []KFCPaladinHealingPriority{
		{SpellID: 1311595, RaidIndex: -1, MinimumMissingHealth: 100, MaintainVigil: true, MinimumPartyTargets: 3, MinimumPartyMissingHealth: 3000},
		{SpellID: 20930, RaidIndex: -1, RequireVigil: true},
	}
	return request, frame
}

func TestKFCPaladinWorkloadVigilPartyDemandAndDetails(t *testing.T) {
	request, frame := kfcPaladinVigilWorkload()
	reply := RunKFCPaladinHealingJob(context.Background(), kfcPaladinWorkloadPayload(t, request, frame, "paladin-vigil-control", true))
	result := kfcPaladinRequireReply(t, reply)
	if result.SurvivalRate != 1 || result.EffectiveHealingHPS <= 0 || len(result.Metrics) == 0 {
		t.Fatal("Missing complete party result")
	}
	kfcPaladinNear(t, result.DeliveredIncomingDamageMean, 10000)
	if casts := kfcPaladinWorkloadCasts(t, result.Metrics, 1311595); casts != 2*request.SimOptions.Iterations {
		t.Fatal("Vigil cast count or shared cooldown changed", casts)
	}
	if casts := kfcPaladinWorkloadCasts(t, result.Metrics, 20930); casts != 2*request.SimOptions.Iterations {
		t.Fatal("Marked Shock count changed", casts)
	}
	kfcPaladinActiveMeasure("WORKLOAD_VIGIL", []float64{result.HPS, result.RawHPS, result.MissingHealthSecondsMean, result.ManaRemainingMean})
	frame.Priorities[0].MinimumPartyTargets = 5
	none := kfcPaladinRequireReply(t, RunKFCPaladinHealingJob(context.Background(), kfcPaladinWorkloadPayload(t, request, frame, "paladin-party-threshold", true)))
	kfcPaladinNear(t, none.HPS, 0)
	if kfcPaladinWorkloadCasts(t, none.Metrics, 1311595) != 0 {
		t.Fatal("Party-demand threshold was ignored")
	}
}

func TestKFCPaladinWorkloadSkipsUnreachablePriorityTargets(t *testing.T) {
	request, frame := kfcPaladinWorkloadControl()
	request.Encounter.Duration = 8
	frame.Targets[1].X = 41
	frame.Damage = []KFCPaladinHealingDamageEvent{{AtMS: 1000, RaidIndex: 1, Amount: 5000}, {AtMS: 1000, RaidIndex: 2, Amount: 1000}}
	frame.Priorities[0].RaidIndex = -1
	result := kfcPaladinRequireReply(t, RunKFCPaladinHealingJob(context.Background(), kfcPaladinWorkloadPayload(t, request, frame, "paladin-range-selection", false)))
	if result.EffectiveHealingHPS <= 0 || result.FinalMissingHealthMean < 5000 {
		t.Fatal("Unreachable most-injured target blocked reachable healing")
	}
	kfcPaladinActiveMeasure("WORKLOAD_RANGE", []float64{result.HPS, result.FinalMissingHealthMean})
}

func TestKFCPaladinWorkloadRejectsUnsupportedSpellsAndOptions(t *testing.T) {
	for _, kind := range []string{"raid-book", "payload", "unowned-shock", "unowned-vigil", "unowned-favor", "conditional", "missing-policy", "invalid-policy", "foreign-rank-schema", "invalid-vigil", "foreign-mana", "foreign-options", "bad-maintenance", "bad-marked-target", "bad-party-count", "incomplete-targets"} {
		request, frame := kfcPaladinWorkloadControl()
		player := request.Raid.Parties[0].Players[0]
		switch kind {
		case "raid-book":
			frame.Priorities[0].SpellID = 25292
		case "payload":
			frame.Priorities[0].SpellID = 25903
		case "unowned-shock":
			frame.Priorities[0].SpellID = 20930
		case "unowned-vigil":
			frame.Priorities[0].SpellID = 1311595
		case "unowned-favor":
			frame.UseDivineFavor = true
		case "conditional":
			frame.AllowConditionalSpellCandidates = false
		case "missing-policy":
			frame.RankScaling = nil
		case "invalid-policy":
			frame.RankScaling.CoefficientLossPerLevel = .1
		case "foreign-rank-schema":
			frame.RankScaling.Schema = "kfc-priest-rank-sensitivity.v1"
		case "invalid-vigil":
			frame.VigilRefundMode = "unknown"
		case "foreign-mana":
			player.Buffs = &proto.IndividualBuffs{Innervates: 1}
		case "foreign-options":
			player.GetHolyPaladin().Options.PrimarySeal = proto.PaladinSeal_Righteousness
		case "bad-maintenance":
			frame.Priorities[0].MaintainVigil = true
		case "bad-marked-target":
			frame.Priorities[0].RequireVigil = true
		case "bad-party-count":
			frame.Priorities[0].MinimumPartyTargets = 6
		case "incomplete-targets":
			frame.Targets = frame.Targets[:4]
		}
		reply := RunKFCPaladinHealingJob(context.Background(), kfcPaladinWorkloadPayload(t, request, frame, "invalid-"+kind, false))
		if reply.Status != "error" || reply.Error == nil || reply.Error.Code != "workload_failed" || reply.Result != nil {
			t.Fatal("Unsupported Paladin input accepted", kind, reply)
		}
	}
}

func TestKFCPaladinWorkloadFavorOwnedUseAndMana(t *testing.T) {
	request, frame := kfcPaladinWorkloadControl()
	request.Raid.Parties[0].Players[0].TalentsString = kfcPaladinActiveTalents(map[int]int{11: 1})
	frame.UseDivineFavor, frame.DivineFavorMinimumBaseCost = true, 500
	result := kfcPaladinRequireReply(t, RunKFCPaladinHealingJob(context.Background(), kfcPaladinWorkloadPayload(t, request, frame, "paladin-owned-favor", true)))
	if casts := kfcPaladinWorkloadCasts(t, result.Metrics, 20216); casts != request.SimOptions.Iterations {
		t.Fatal("Owned Favor was not activated for its declared cost", casts)
	}
	kfcPaladinActiveMeasure("WORKLOAD_FAVOR", []float64{result.HPS, result.ManaRemainingMean})
}

func TestKFCPaladinWorkloadManaBlockedAndOwnedCooldown(t *testing.T) {
	request, frame := kfcPaladinWorkloadControl()
	request.Raid.Parties[0].Players[0].BonusStats.Stats[stats.Mana] = 2000
	request.Encounter.Duration = 60
	frame.Damage = nil
	for second := int64(1); second < 60; second++ {
		frame.Damage = append(frame.Damage, KFCPaladinHealingDamageEvent{AtMS: second * 1000, RaidIndex: 1, Amount: 300})
	}
	base := kfcPaladinRequireReply(t, RunKFCPaladinHealingJob(context.Background(), kfcPaladinWorkloadPayload(t, request, frame, "paladin-mana-blocked", false)))
	if base.ManaBlockedSecondsMean <= 0 {
		t.Fatal("Unfunded ready casts were not tracked")
	}
	frame.Cooldowns = []KFCPaladinHealingCooldown{{ItemID: 13444, MinimumMissingMana: 1000, RequireHealingDemand: true}}
	if reply := RunKFCPaladinHealingJob(context.Background(), kfcPaladinWorkloadPayload(t, request, frame, "paladin-unowned-potion", false)); reply.Status != "error" {
		t.Fatal("Unconfigured potion activated")
	}
	request.Raid.Parties[0].Players[0].Consumes = &proto.Consumes{DefaultPotion: proto.Potions_MajorManaPotion}
	result := kfcPaladinRequireReply(t, RunKFCPaladinHealingJob(context.Background(), kfcPaladinWorkloadPayload(t, request, frame, "paladin-owned-potion", true)))
	metrics := &proto.RaidMetrics{}
	if err := protojson.Unmarshal(result.Metrics, metrics); err != nil {
		t.Fatal(err)
	}
	gained := 0.0
	for _, resource := range metrics.Parties[0].Players[0].Resources {
		if resource.Id.GetItemId() == 13444 {
			gained += resource.Gain
		}
	}
	if gained <= 0 {
		t.Fatal("Owned potion supplied no actual mana")
	}
	kfcPaladinActiveMeasure("WORKLOAD_RESOURCE", []float64{base.ManaBlockedSecondsMean, result.ManaBlockedSecondsMean, gained})
}

func TestKFCPaladinRankPolicyChangesCoefficientsAndPreservesReference(t *testing.T) {
	values := []float64{}
	for _, kind := range []string{"reference", "coefficient", "coefficient-procs"} {
		_, holy, _ := kfcPaladinActiveFixture(t, 0, map[int]int{13: 1, 16: 1}, 2)
		policy := *kfcPaladinReferencePolicy()
		if kind != "reference" {
			policy.Kind, policy.CoefficientLossPerLevel = "level-distance-sensitivity", .02
		}
		if kind == "coefficient-procs" {
			policy.ClassProcMode = "coefficient-factor"
		}
		if err := holy.ConfigureKFCPaladinHealingRankScaling(policy); err != nil {
			t.Fatal(err)
		}
		factor := 1.0
		if kind != "reference" {
			factor = .88
		}
		light := holy.GetSpell(core.ActionID{SpellID: 10329})
		kfcPaladinNear(t, light.BonusCoefficient, .714*factor)
		kfcPaladinNear(t, holy.GetSpell(core.ActionID{SpellID: 1311596}).BonusCoefficient, .143)
		if kind == "coefficient-procs" {
			kfcPaladinNear(t, holy.kfcRankProcFactor(10329), .88)
		} else {
			kfcPaladinNear(t, holy.kfcRankProcFactor(10329), 1)
		}
		if holy.ConfigureKFCPaladinHealingRankScaling(policy) == nil {
			t.Fatal("Rank policy changed twice")
		}
		values = append(values, light.BonusCoefficient)
	}
	kfcPaladinActiveMeasure("RANK_COEFFICIENTS", values)
}

func TestKFCPaladinRankPolicyControlsIlluminationAndInfusion(t *testing.T) {
	for _, mode := range []string{"unchanged", "coefficient-factor"} {
		sim, holy, units := kfcPaladinActiveFixture(t, 0, map[int]int{9: 2, 10: 5}, 2)
		policy := *kfcPaladinReferencePolicy()
		policy.Kind, policy.CoefficientLossPerLevel, policy.ClassProcMode = "level-distance-sensitivity", .03, mode
		if err := holy.ConfigureKFCPaladinHealingRankScaling(policy); err != nil {
			t.Fatal(err)
		}
		flash := holy.GetSpell(core.ActionID{SpellID: 19750})
		flash.BonusCritRating = 10000
		before := holy.CurrentMana()
		if !flash.Cast(sim, units[1]) {
			t.Fatal("Low-rank Flash failed")
		}
		kfcPaladinAdvance(t, sim, 1500*time.Millisecond)
		expected := -35.0
		if mode == "unchanged" {
			expected += 17.5
		}
		kfcPaladinNear(t, holy.CurrentMana()-before, expected)
		if holy.KFCHealing.infusion.IsActive() != (mode == "unchanged") {
			t.Fatal("Rank-sensitive Infusion scope changed")
		}
	}
}

func TestKFCPaladinRankPolicyDoesNotScaleUnrelatedItems(t *testing.T) {
	_, holy, _ := kfcPaladinActiveFixture(t, 0, map[int]int{}, 2)
	unrelated := holy.RegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: 10000081}, SpellSchool: core.SpellSchoolHoly, ProcMask: core.ProcMaskSpellHealing, Flags: core.SpellFlagHelpful, BonusCoefficient: 1, DamageMultiplier: 1, ThreatMultiplier: 1})
	policy := *kfcPaladinReferencePolicy()
	policy.Kind, policy.CoefficientLossPerLevel = "level-distance-sensitivity", 1
	if err := holy.ConfigureKFCPaladinHealingRankScaling(policy); err != nil {
		t.Fatal(err)
	}
	kfcPaladinNear(t, unrelated.BonusCoefficient, 1)
}

func TestKFCPaladinJobRejectsMalformedWireAndCancellation(t *testing.T) {
	request, frame := kfcPaladinWorkloadControl()
	valid := kfcPaladinWorkloadPayload(t, request, frame, "paladin-wire", false)
	for _, payload := range [][]byte{[]byte(`{}`), append(append([]byte{}, valid...), []byte(` {}`)...), []byte(strings.Replace(string(valid), `"detail":false`, `"detail":false,"unknown":true`, 1))} {
		reply := RunKFCPaladinHealingJob(context.Background(), payload)
		if reply.Status != "error" || reply.Error == nil || reply.Error.Code != "invalid_job" {
			t.Fatal("Invalid JSON envelope accepted")
		}
	}
	request.SimOptions.Debug = true
	if reply := RunKFCPaladinHealingJob(context.Background(), kfcPaladinWorkloadPayload(t, request, frame, "paladin-debug", false)); reply.Error == nil || reply.Error.Code != "invalid_request" {
		t.Fatal("Debug output entered worker stdout")
	}
	request.SimOptions.Debug = false
	request.Raid.Parties[0].Players[0].ProtoReflect().SetUnknown([]byte{0x98, 0x06, 0x01})
	if reply := RunKFCPaladinHealingJob(context.Background(), kfcPaladinWorkloadPayload(t, request, frame, "paladin-unknown-proto", false)); reply.Error == nil || reply.Error.Code != "invalid_request" {
		t.Fatal("Unknown nested protobuf data accepted")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if reply := RunKFCPaladinHealingJob(ctx, valid); reply.Error == nil || reply.Error.Code != "cancelled" {
		t.Fatal("Cancelled job did not report cancellation")
	}
}

func TestKFCPaladinWorkloadDeliversOnlyScheduledDamageUntilDeath(t *testing.T) {
	request, frame := kfcPaladinWorkloadControl()
	frame.Targets[1].MaximumHealth = 100
	frame.Damage = []KFCPaladinHealingDamageEvent{{AtMS: 1000, RaidIndex: 1, Amount: 200}, {AtMS: 2000, RaidIndex: 1, Amount: 200}}
	frame.Priorities[0].MinimumMissingHealth = 1000000
	result := kfcPaladinRequireReply(t, RunKFCPaladinHealingJob(context.Background(), kfcPaladinWorkloadPayload(t, request, frame, "paladin-death", false)))
	kfcPaladinNear(t, result.SurvivalRate, 0)
	kfcPaladinNear(t, result.PlannedIncomingPostMitigationDamage, 400)
	kfcPaladinNear(t, result.DeliveredIncomingDamageMean, 200)
	if result.MissingHealthSecondsMean < 2800 {
		t.Fatal("Post-death deficit was lost")
	}
	kfcPaladinActiveMeasure("WORKLOAD_DEATH", []float64{result.SurvivalRate, result.DeliveredIncomingDamageMean, result.MissingHealthSecondsMean})
}

func TestKFCPaladinWorkloadIlluminationMetricsStayBounded(t *testing.T) {
	sim, holy, _ := kfcPaladinActiveFixture(t, 0, map[int]int{10: 5, 13: 1}, 2)
	spend := holy.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 99})
	for index := 0; index < 100; index++ {
		holy.SpendMana(sim, 200, spend)
		holy.kfcProcActiveIllumination(sim, 325, 20930)
	}
	sim.Cleanup()
	count := 0
	for _, resource := range sim.Raid.GetMetrics().Parties[0].Players[0].Resources {
		if resource.Id.GetSpellId() == 20210 {
			count++
		}
	}
	if count != 1 {
		t.Fatal("Illumination allocated resource rows per proc", count)
	}
}
