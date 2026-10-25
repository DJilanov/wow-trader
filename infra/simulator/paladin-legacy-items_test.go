package holy

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"math"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
	googleProto "google.golang.org/protobuf/proto"
)

func kfcPaladinLegacyPolicy(power, healing float64) KFCPaladinLegacyItemPolicy {
	return KFCPaladinLegacyItemPolicy{Schema: "kfc-paladin-legacy-item-policy.v1", ID: "declared-control", BriarwoodSpellPower: &power, RoyalSealHealingPower: &healing}
}

func kfcPaladinLegacyFixture(t *testing.T, owned bool) (*core.Simulation, *HolyPaladin) {
	t.Helper()
	equipment := map[int]int32{}
	if owned {
		equipment[12], equipment[13] = 12930, 18472
	}
	sim := core.NewSim(kfcPaladinRegenerationRequest(equipment), simsignals.CreateSignals())
	sim.Reset()
	return sim, sim.Raid.Parties[0].Players[0].(*HolyPaladin)
}

func TestKFCPaladinLegacyPolicyOwnershipAndValidation(t *testing.T) {
	for _, owned := range []bool{false, true} {
		sim, healer := kfcPaladinLegacyFixture(t, owned)
		if healer.kfcPaladinLegacyItemPolicyEcho() != nil {
			t.Fatal("Implicit legacy policy changed old requests")
		}
		err := healer.ConfigureKFCPaladinLegacyItems(sim, kfcPaladinLegacyPolicy(15, 0))
		if (err == nil) != owned {
			t.Fatal("Legacy policy lost equipment ownership", owned, err)
		}
		sim.Cleanup()
	}
	for _, kind := range []string{"empty", "schema", "id", "power", "healing", "nan", "infinite"} {
		sim, healer := kfcPaladinLegacyFixture(t, true)
		policy := kfcPaladinLegacyPolicy(15, 0)
		switch kind {
		case "empty":
			policy.BriarwoodSpellPower, policy.RoyalSealHealingPower = nil, nil
		case "schema":
			policy.Schema = "other"
		case "id":
			policy.ID = ""
		case "power":
			*policy.BriarwoodSpellPower = 44
		case "healing":
			*policy.RoyalSealHealingPower = 44
		case "nan":
			*policy.BriarwoodSpellPower = math.NaN()
		case "infinite":
			*policy.RoyalSealHealingPower = math.Inf(1)
		}
		if healer.ConfigureKFCPaladinLegacyItems(sim, policy) == nil {
			t.Fatal("Unreviewed legacy reference admitted", kind)
		}
		sim.Cleanup()
	}
	kfcPaladinHeartMeasure("LEGACY_VALIDATION", true)
}

func TestKFCPaladinLegacyExactDeltasResetAndCopies(t *testing.T) {
	for _, power := range []float64{15, 29, 30} {
		for _, healing := range []float64{0, 22} {
			sim, healer := kfcPaladinLegacyFixture(t, true)
			beforePower, beforeHealing := healer.GetStat(stats.SpellPower), healer.GetStat(stats.HealingPower)
			policy := kfcPaladinLegacyPolicy(power, healing)
			if err := healer.ConfigureKFCPaladinLegacyItems(sim, policy); err != nil {
				t.Fatal(err)
			}
			wantPower, wantHealing := beforePower+power-29, beforeHealing+healing-22
			kfcPaladinNear(t, healer.GetStat(stats.SpellPower), wantPower)
			kfcPaladinNear(t, healer.GetStat(stats.HealingPower), wantHealing)
			*policy.BriarwoodSpellPower = 999
			*healer.kfcPaladinLegacyItemPolicyEcho().RoyalSealHealingPower = 999
			kfcPaladinNear(t, *healer.kfcPaladinLegacyItemPolicyEcho().BriarwoodSpellPower, power)
			kfcPaladinNear(t, *healer.kfcPaladinLegacyItemPolicyEcho().RoyalSealHealingPower, healing)
			if healer.ConfigureKFCPaladinLegacyItems(sim, kfcPaladinLegacyPolicy(29, 22)) == nil {
				t.Fatal("Live policy replaced")
			}
			sim.Cleanup()
			sim.Reset()
			kfcPaladinNear(t, healer.GetStat(stats.SpellPower), wantPower)
			kfcPaladinNear(t, healer.GetStat(stats.HealingPower), wantHealing)
			kfcPaladinHeartMeasure("LEGACY_DELTAS", []float64{power, healing, wantPower, wantHealing})
			sim.Cleanup()
		}
	}
}

func TestKFCPaladinLegacyPartialPolicyAndAreaIndependence(t *testing.T) {
	sim, healer := kfcPaladinLegacyFixture(t, true)
	defer sim.Cleanup()
	healing := 0.0
	policy := KFCPaladinLegacyItemPolicy{Schema: "kfc-paladin-legacy-item-policy.v1", ID: "seal-only", RoyalSealHealingPower: &healing}
	power, mp5 := healer.GetStat(stats.SpellPower), healer.GetStat(stats.MP5)
	if err := healer.ConfigureKFCPaladinLegacyItems(sim, policy); err != nil {
		t.Fatal(err)
	}
	kfcPaladinNear(t, healer.GetStat(stats.SpellPower), power)
	if healer.kfcPaladinLegacyItemPolicyEcho().BriarwoodSpellPower != nil {
		t.Fatal("Partial reference invented Briarwood hypothesis")
	}
	if err := healer.ConfigureKFCPaladinItemArea(sim, "haunted"); err != nil {
		t.Fatal(err)
	}
	kfcPaladinNear(t, healer.GetStat(stats.MP5), mp5+9)
	sim.Cleanup()
	sim.Reset()
	kfcPaladinNear(t, healer.GetStat(stats.MP5), mp5+9)
	kfcPaladinNear(t, healer.GetStat(stats.SpellPower), power)
	kfcPaladinHeartMeasure("LEGACY_AREA_INDEPENDENT", true)
}

func TestKFCPaladinLegacyRejectAfterCastAndTime(t *testing.T) {
	for _, cast := range []bool{false, true} {
		sim, healer := kfcPaladinLegacyFixture(t, true)
		if cast {
			if !healer.GetSpell(core.ActionID{SpellID: 19750}).Cast(sim, &healer.Unit) {
				t.Fatal("Control cast failed")
			}
		} else {
			sim.CurrentTime = time.Millisecond
		}
		if healer.ConfigureKFCPaladinLegacyItems(sim, kfcPaladinLegacyPolicy(15, 0)) == nil {
			t.Fatal("Legacy policy changed after combat started", cast)
		}
		sim.Cleanup()
	}
	kfcPaladinHeartMeasure("LEGACY_FRESH_ONLY", true)
}

func TestKFCPaladinLegacyActualWorkloadTransport(t *testing.T) {
	job, request := kfcPaladinGuardianInput(t)
	request.SimOptions.Iterations = 2
	request.Raid.Parties[0].Players[0].Equipment.Items[12].Id = 12930
	request.Raid.Parties[0].Players[0].Equipment.Items[13].Id = 18472
	encoded, err := googleProto.Marshal(request)
	if err != nil {
		t.Fatal(err)
	}
	job.RequestBase64 = base64.StdEncoding.EncodeToString(encoded)
	for index := len(job.Workload.Cooldowns) - 1; index >= 0; index-- {
		if job.Workload.Cooldowns[index].ItemID == 20512 || job.Workload.Cooldowns[index].SpellID == 15604 {
			job.Workload.Cooldowns = append(job.Workload.Cooldowns[:index], job.Workload.Cooldowns[index+1:]...)
		}
	}
	policy := kfcPaladinLegacyPolicy(15, 0)
	job.Workload.LegacyItemsPolicy = &policy
	payload, _ := json.Marshal(job)
	reply := RunKFCPaladinHealingJob(context.Background(), payload)
	if reply.Status != "complete" || reply.Result.LegacyItemsPolicy == nil || reply.Result.Assignment == nil {
		t.Fatalf("Missing actual assignment/item transport: %+v; error: %+v", reply, reply.Error)
	}
	kfcPaladinNear(t, *reply.Result.LegacyItemsPolicy.BriarwoodSpellPower, 15)
	kfcPaladinNear(t, *reply.Result.LegacyItemsPolicy.RoyalSealHealingPower, 0)
	kfcPaladinHeartMeasure("LEGACY_ACTUAL_JOB", job)
	kfcPaladinHeartMeasure("LEGACY_ACTUAL_RESULT", reply.Result)
	*policy.BriarwoodSpellPower = 44
	payload, _ = json.Marshal(job)
	invalid := RunKFCPaladinHealingJob(context.Background(), payload)
	if invalid.Status != "error" || invalid.Error.Code != "workload_failed" {
		t.Fatal("Invalid native job bypassed policy validation")
	}
}
