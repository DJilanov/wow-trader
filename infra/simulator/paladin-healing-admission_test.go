package holy

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/stats"
	"google.golang.org/protobuf/encoding/protojson"
	googleProto "google.golang.org/protobuf/proto"
)

// KFC_PALADIN_ADMISSION_FIXTURES

func kfcPaladinAdmissionFixture(t *testing.T, setID int32, pieces int, blacksmith bool) (*core.Simulation, *HolyPaladin) {
	t.Helper()
	equipment := map[int]int32{}
	for _, row := range kfcPaladinAdmissionEquipment[setID][:pieces] {
		if equipment[int(row.slot)] != 0 {
			t.Fatal("Repeated admission fixture slot")
		}
		equipment[int(row.slot)] = row.id
	}
	request := kfcPaladinRegenerationRequest(equipment)
	request.Raid.Parties[0].Players[0].Rotation = &proto.APLRotation{Type: proto.APLRotation_TypeAPL}
	if blacksmith {
		request.Raid.Parties[0].Players[0].Profession1 = proto.Profession_Blacksmithing
	}
	return kfcPaladinRegenerationFixture(t, request)
}

func TestKFCPaladinAdmissionAllOwnedCurrentSetNames(t *testing.T) {
	if len(kfcPaladinAdmittedSets) != 43 {
		t.Fatal("Incomplete current set inventory")
	}
	for setID, definition := range kfcPaladinAdmittedSets {
		pieces := len(kfcPaladinAdmissionEquipment[setID])
		_, healer := kfcPaladinAdmissionFixture(t, setID, pieces, true)
		names := healer.GetActiveSetBonusNames()
		want := []string{}
		for _, threshold := range definition.Thresholds {
			if !healer.KFCReviewedHealingSetThreshold(setID, threshold) {
				t.Fatal("Missing class-scoped threshold", setID, threshold)
			}
			if threshold <= int32(pieces) {
				want = append(want, fmt.Sprintf("%s (%dpc)", definition.Name, threshold))
			}
		}
		if strings.Join(names, "|") != strings.Join(want, "|") {
			t.Fatal("Actual current set names disagree", setID, names, want)
		}
	}
	kfcPaladinHeartMeasure("ADMISSION_ALL_SET_NAMES", 43)
}

func TestKFCPaladinAdmissionSoulforgeMetadataCannotDoubleApply(t *testing.T) {
	_, healer, _ := kfcPaladinSoulforgeFixture(t, 8, false)
	armor, ap, resistance := healer.GetStat(stats.BonusArmor), healer.GetStat(stats.AttackPower), healer.GetStat(stats.FireResistance)
	for i := 0; i < 3; i++ {
		names := healer.GetActiveSetBonusNames()
		for _, threshold := range []int32{2, 4, 6, 8} {
			if !healer.KFCReviewedHealingSetThreshold(516, threshold) || !strings.Contains(strings.Join(names, "|"), fmt.Sprintf("Soulforge Armor (%dpc)", threshold)) {
				t.Fatal("Soulforge inspector metadata is missing", threshold, names)
			}
		}
	}
	if core.ForeverEquipmentBonusSupported(516, 8) {
		t.Fatal("Class metadata falsely claimed a global handler")
	}
	kfcPaladinNear(t, healer.GetStat(stats.BonusArmor), armor)
	kfcPaladinNear(t, healer.GetStat(stats.AttackPower), ap)
	kfcPaladinNear(t, healer.GetStat(stats.FireResistance), resistance)
	if healer.KFCReviewedHealingSetThreshold(1673, 4) || healer.KFCReviewedHealingSetThreshold(516, 5) {
		t.Fatal("Unreviewed variant or threshold admitted")
	}
	for slot, item := range healer.Equipment {
		if item.SetID == 516 {
			healer.Equipment[slot].SetID = 1673
			break
		}
	}
	if healer.validateKFCPaladinSetAdmission() == nil {
		t.Fatal("Same-named unreviewed variant admitted")
	}
	kfcPaladinHeartMeasure("ADMISSION_SOULFORGE_METADATA", []float64{armor, ap, resistance})
}

func TestKFCPaladinAdmissionProfessionMetadata(t *testing.T) {
	for _, blacksmith := range []bool{false, true} {
		_, healer := kfcPaladinAdmissionFixture(t, 444, 3, blacksmith)
		if healer.KFCReviewedHealingSetThreshold(444, 3) != blacksmith {
			t.Fatal("Profession metadata mismatch")
		}
		if (len(healer.GetActiveSetBonusNames()) > 0) != blacksmith {
			t.Fatal("Unqualified profession set displayed as active")
		}
	}
	kfcPaladinHeartMeasure("ADMISSION_PROFESSION", true)
}

func TestKFCPaladinAdmissionExistingCastManaThresholds(t *testing.T) {
	for _, row := range []struct{ setID, spellID int32 }{{181, 450527}, {182, 450576}} {
		for _, pieces := range []int{4, 5} {
			sim, healer := kfcPaladinAdmissionFixture(t, row.setID, pieces, false)
			spell := healer.GetSpell(core.ActionID{SpellID: 10329})
			refill := healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 221})
			for count := 0; count < 500; count++ {
				healer.AddMana(sim, healer.MaxMana(), refill)
				if !spell.Cast(sim, &healer.Unit) {
					t.Fatal("Class healing cast failed")
				}
				kfcPaladinAdvance(t, sim, sim.CurrentTime+2500*time.Millisecond)
			}
			raw, actual := kfcPaladinRegenerationMana(healer, row.spellID)
			want := 0.0
			if pieces == 5 {
				want = 4800
			}
			kfcPaladinNear(t, raw, want)
			kfcPaladinNear(t, actual, want)
			kfcPaladinHeartMeasure(fmt.Sprintf("ADMISSION_CAST_MANA_%d_%d", row.setID, pieces), []float64{raw, actual})
		}
	}
}

func TestKFCPaladinAssignmentConservationOverkillUnusedAndVariance(t *testing.T) {
	state, err := newKFCPaladinAssignment("external-demand-v1")
	if err != nil {
		t.Fatal(err)
	}
	for _, damage := range []float64{100, 200} {
		state.resetIteration()
		state.observeDamage(damage, &core.SpellResult{Damage: damage})
		if err := state.finishIteration(10, 50); err != nil {
			t.Fatal(err)
		}
	}
	value := state.result()
	kfcPaladinNear(t, value.SupportHpsMean, 10)
	kfcPaladinNear(t, value.SupportHpsStdev, 5)
	state, _ = newKFCPaladinAssignment("external-demand-v1")
	state.observeDamage(100, &core.SpellResult{Damage: 1000})
	if err := state.finishIteration(10, 100); err != nil {
		t.Fatal(err)
	}
	kfcPaladinNear(t, state.result().SupportHpsMean, 0)
	kfcPaladinNear(t, state.result().OverkillExcludedMean, 900)
	state, _ = newKFCPaladinAssignment("external-demand-v1")
	state.observeDamage(100, &core.SpellResult{Damage: 70, AbsorbedDamage: 30})
	if err := state.finishIteration(10, 50); err != nil {
		t.Fatal(err)
	}
	kfcPaladinNear(t, state.result().SupportHpsMean, 5)
	kfcPaladinNear(t, state.result().HealthRestoredHpsMean, 2)
	kfcPaladinNear(t, state.result().AbsorbedHpsMean, 3)
	state, _ = newKFCPaladinAssignment("external-demand-v1")
	if err := state.finishIteration(10, 0); err != nil {
		t.Fatal(err)
	}
	kfcPaladinNear(t, state.result().SupportHpsMean, 0)
	if err := state.finishIteration(10, 1); err == nil {
		t.Fatal("Inconsistent health ledger admitted")
	}
	if _, err := newKFCPaladinAssignment("unknown"); err == nil {
		t.Fatal("Unknown assignment policy admitted")
	}
	kfcPaladinHeartMeasure("ASSIGNMENT_CONSERVATION", []float64{10, 5, 900, 5, 2, 3})
}

func kfcPaladinAssignmentMeasureJob(t *testing.T, request *proto.RaidSimRequest, frame KFCPaladinHealingWorkload, id string) *KFCPaladinHealingJobResult {
	t.Helper()
	frame.AssignmentScoring = "external-demand-v1"
	payload := kfcPaladinWorkloadPayload(t, request, frame, id, true)
	reply := RunKFCPaladinHealingJob(context.Background(), payload)
	if reply.Status != "complete" || reply.Result.Assignment == nil {
		t.Fatalf("Assignment failed: %+v", reply.Error)
	}
	var job interface{}
	if err := json.Unmarshal(payload, &job); err != nil {
		t.Fatal(err)
	}
	kfcPaladinHeartMeasure("ASSIGNMENT_WORKLOAD_REQUEST", job)
	kfcPaladinHeartMeasure("ASSIGNMENT_RESULT_"+id, reply.Result.Assignment)
	return reply.Result
}

func TestKFCPaladinAssignmentActualSelfCostsEarnNoExternalCredit(t *testing.T) {
	for _, mark := range []bool{false, true} {
		request, frame := kfcPaladinWorkloadControl()
		player := kfcPaladinSelfSetRequest(162, 4).Raid.Parties[0].Players[0]
		player.Consumes.DefaultConjured = proto.Conjured_ConjuredDemonicRune
		if mark {
			player.Equipment.Items[10].Id = 13143
			frame.Cooldowns = append(frame.Cooldowns, KFCPaladinHealingCooldown{SpellID: 17252})
		}
		request.Raid.Parties[0].Players[0] = player
		request.SimOptions.Iterations = 32
		probe, healer := kfcPaladinRegenerationFixture(t, googleProto.Clone(request).(*proto.RaidSimRequest))
		player.BonusStats.Stats[stats.Health] += 1100 - healer.MaxHealth()
		probe.Cleanup()
		frame.Cooldowns = append(frame.Cooldowns, KFCPaladinHealingCooldown{ItemID: 12662, MinimumMissingMana: 1500})
		frame.Priorities = []KFCPaladinHealingPriority{{SpellID: 10329, RaidIndex: 0}}
		result := kfcPaladinAssignmentMeasureJob(t, request, frame, fmt.Sprintf("paladin-external-self-mark-%t", mark))
		if result.HPS <= 0 {
			t.Fatal("Control did not restore health or consume its self shield")
		}
		if mark && result.AbsorbedHPS <= 0 {
			t.Fatal("Self shield was not consumed")
		}
		kfcPaladinNear(t, result.Assignment.SupportHpsMean, 0)
		kfcPaladinNear(t, result.Assignment.AbsorbedHpsMean, 0)
		kfcPaladinNear(t, result.Assignment.FinalExternalMissingHealthMean, 2900)
	}
}

func TestKFCPaladinAssignmentActualPartyRegenerationCounts(t *testing.T) {
	request, frame := kfcPaladinWorkloadControl()
	request.Raid.Parties[0].Players[0] = kfcPaladinRegenerationRequest(map[int]int32{14: 6323}).Raid.Parties[0].Players[0]
	frame.Priorities[0].MinimumMissingHealth = 1000000
	result := kfcPaladinAssignmentMeasureJob(t, request, frame, "paladin-external-party-regeneration")
	metrics := &proto.RaidMetrics{}
	if err := protojson.Unmarshal(result.Metrics, metrics); err != nil {
		t.Fatal(err)
	}
	actual := 0.0
	for _, player := range metrics.Parties[0].Players {
		for _, resource := range player.Resources {
			if resource.Id.GetSpellId() == 1292142 {
				actual += resource.ActualGain
			}
		}
	}
	if actual <= 0 || result.Assignment.HealthRestoredHpsMean <= 0 {
		t.Fatal("Useful external regeneration was discarded")
	}
	kfcPaladinNear(t, result.Assignment.HealthRestoredHpsMean, actual/float64(request.SimOptions.Iterations)/request.Encounter.Duration)
	kfcPaladinNear(t, result.HPS, 0)
}

func TestKFCPaladinAssignmentActualHealingNoSelfCostMatches(t *testing.T) {
	request, frame := kfcPaladinWorkloadControl()
	result := kfcPaladinAssignmentMeasureJob(t, request, frame, "paladin-external-direct-healing")
	kfcPaladinNear(t, result.Assignment.SupportHpsMean, result.HPS)
	kfcPaladinNear(t, result.Assignment.ExternalMissingHealthSecondsMean, result.MissingHealthSecondsMean)
	kfcPaladinNear(t, result.Assignment.FinalExternalMissingHealthMean, result.FinalMissingHealthMean)
}
