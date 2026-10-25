package holy

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"testing"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"google.golang.org/protobuf/encoding/protojson"
	googleProto "google.golang.org/protobuf/proto"
)

// KFC_PALADIN_INACTIVE_GUARDIAN_JOB

func kfcPaladinGuardianInput(t *testing.T) (KFCPaladinHealingJob, *proto.RaidSimRequest) {
	t.Helper()
	var job KFCPaladinHealingJob
	if err := json.Unmarshal([]byte(kfcPaladinGuardianJobJSON), &job); err != nil {
		t.Fatal(err)
	}
	bytes, err := base64.StdEncoding.DecodeString(job.RequestBase64)
	if err != nil {
		t.Fatal(err)
	}
	request := &proto.RaidSimRequest{}
	if err := googleProto.Unmarshal(bytes, request); err != nil {
		t.Fatal(err)
	}
	return job, request
}

func TestKFCPaladinInactiveGuardianActualDragonCallHandJobs(t *testing.T) {
	for _, iterations := range []int32{2, 32} {
		job, request := kfcPaladinGuardianInput(t)
		request.SimOptions.Iterations = iterations
		bytes, err := googleProto.Marshal(request)
		if err != nil {
			t.Fatal(err)
		}
		job.RequestBase64 = base64.StdEncoding.EncodeToString(bytes)
		job.ID = "paladin-inactive-guardian-hand"
		job.Detail = true
		payload, _ := json.Marshal(job)
		reply := RunKFCPaladinHealingJob(context.Background(), payload)
		if reply.Status != "complete" {
			t.Fatalf("Actual legal Dragon's Call hand rejected: %+v", reply.Error)
		}
		if !reply.Result.LegalTalentBuild || reply.Result.Assignment == nil || reply.Result.Assignment.SupportHpsMean <= 0 {
			t.Fatal("Missing actual full-build assignment results")
		}
		kfcPaladinNear(t, reply.Result.SurvivalRate, 1)
		metrics := &proto.RaidMetrics{}
		if err := protojson.Unmarshal(reply.Result.Metrics, metrics); err != nil {
			t.Fatal(err)
		}
		pets := metrics.Parties[0].Players[0].Pets
		if len(pets) == 0 {
			t.Fatal("The actual equipment guardian was not registered")
		}
		for _, pet := range pets {
			kfcPaladinNear(t, pet.Dps.Avg, 0)
			kfcPaladinNear(t, pet.Hps.Avg, 0)
		}
		kfcPaladinHeartMeasure("INACTIVE_GUARDIAN_WORKLOAD_REQUEST", job)
		kfcPaladinHeartMeasure("INACTIVE_GUARDIAN_RESULT", reply.Result.Assignment)
	}
}

func TestKFCPaladinInactiveGuardianGeometryAndActiveRejection(t *testing.T) {
	job, request := kfcPaladinGuardianInput(t)
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	healer := sim.Raid.Parties[0].Players[0].(*HolyPaladin)
	defer sim.Cleanup()
	if len(healer.Pets) == 0 || len(sim.Raid.AllUnits) <= len(sim.Raid.AllPlayerUnits) {
		t.Fatal("Missing actual dormant equipment guardian")
	}
	positions := map[int32]KFCPaladinFriendlyPosition{}
	for _, unit := range healer.kfcPaladinHealingPlayerUnits() {
		positions[unit.UnitIndex] = KFCPaladinFriendlyPosition{}
	}
	if err := healer.ConfigureKFCPaladinActiveHealing(positions, job.Workload.VigilRefundMode); err != nil {
		t.Fatal(err)
	}
	if err := healer.validateKFCPaladinInactiveGuardians(); err != nil {
		t.Fatal(err)
	}
	pet := healer.Pets[0]
	if healer.kfcValidHealingTarget(&pet.Unit, 40) {
		t.Fatal("Dormant guardian became an assignment target")
	}
	if len(positions) != 5 {
		t.Fatal("Player agents do not match declared profiles", len(positions))
	}
	for _, unit := range healer.kfcPaladinHealingPlayerUnits() {
		if unit.Type != core.PlayerUnit {
			t.Fatal("Guardian leaked into actual player membership")
		}
	}
	kfcPaladinNear(t, healer.kfcExternalAssignmentMissing(), 0)
	positions[pet.UnitIndex] = KFCPaladinFriendlyPosition{}
	if healer.ConfigureKFCPaladinActiveHealing(positions, job.Workload.VigilRefundMode) == nil {
		t.Fatal("Pet geometry weakened exact player coverage")
	}
	var agent core.PetAgent
	for _, candidate := range healer.PetAgents {
		if candidate.GetPet() == pet {
			agent = candidate
		}
	}
	if agent == nil {
		t.Fatal("Actual guardian agent missing")
	}
	pet.Enable(sim, agent)
	if healer.validateKFCPaladinInactiveGuardians() == nil {
		t.Fatal("Active guardian silently admitted")
	}
	pet.Disable(sim)
	if err := healer.validateKFCPaladinInactiveGuardians(); err != nil {
		t.Fatal(err)
	}
	kfcPaladinHeartMeasure("INACTIVE_GUARDIAN_SCOPE", []int{len(healer.kfcPaladinHealingPlayerUnits()), len(sim.Raid.AllUnits)})
}

func TestKFCPaladinInactiveGuardianStillRequiresEveryPlayerProfile(t *testing.T) {
	job, _ := kfcPaladinGuardianInput(t)
	job.Workload.Targets = job.Workload.Targets[:len(job.Workload.Targets)-1]
	payload, _ := json.Marshal(job)
	reply := RunKFCPaladinHealingJob(context.Background(), payload)
	if reply.Status != "error" || reply.Error.Code != "workload_failed" {
		t.Fatal("Missing player profile admitted")
	}
	kfcPaladinHeartMeasure("INACTIVE_GUARDIAN_COMPLETE_PLAYERS", true)
}
