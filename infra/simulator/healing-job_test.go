package healing

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/wowsims/classic/sim/core/proto"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/encoding/protowire"
	googleProto "google.golang.org/protobuf/proto"
)

func kfcHealingProtocolJob(t *testing.T, id string, request *proto.RaidSimRequest, workload KFCHealingWorkload, detail bool) KFCHealingJob {
	t.Helper()
	encoded, err := googleProto.Marshal(request)
	if err != nil {
		t.Fatal(err)
	}
	return KFCHealingJob{Schema: "kfc-healing-job.v1", ID: id, RequestBase64: base64.StdEncoding.EncodeToString(encoded), Workload: workload, Detail: detail}
}

func kfcHealingJobJSON(t *testing.T, job KFCHealingJob) []byte {
	t.Helper()
	encoded, err := json.Marshal(job)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}

func TestKFCHealingJobRealMeasurementsAndWireFormat(t *testing.T) {
	job := kfcHealingProtocolJob(t, "protocol-control", kfcWorkloadRequest(10000, 3, 30), kfcTankWorkload(30), true)
	reply := RunKFCHealingJob(context.Background(), kfcHealingJobJSON(t, job))
	if reply.Status != "complete" || reply.ID != job.ID || reply.Result == nil {
		t.Fatalf("Healing protocol did not complete: %+v", reply)
	}
	result := reply.Result
	if result.ClassQualified || result.PublicationAllowed || result.HPS <= 0 || result.SurvivalRate != 1 {
		t.Fatal("Healing protocol lost real measurements or granted qualification")
	}
	kfcPriestNear(t, result.HPS, result.EffectiveHealingHPS+result.AbsorbedHPS)
	kfcPriestNear(t, result.RawHPS, result.EffectiveHealingHPS+result.OverhealingHPS)
	metrics := &proto.RaidMetrics{}
	if err := protojson.Unmarshal(result.Metrics, metrics); err != nil {
		t.Fatal(err)
	}
	kfcPriestNear(t, metrics.Hps.Avg, result.HPS)
	encoded, err := json.Marshal(reply)
	if err != nil {
		t.Fatal(err)
	}
	var decoded struct {
		Result struct {
			RawHPS  float64                    `json:"rawHps"`
			Metrics map[string]json.RawMessage `json:"metrics"`
		} `json:"result"`
	}
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatal(err)
	}
	kfcPriestNear(t, decoded.Result.RawHPS, result.RawHPS)
	if _, ok := decoded.Result.Metrics["rawHealingHps"]; !ok {
		t.Fatal("Detailed metrics did not retain the protobuf JSON contract")
	}
	fmt.Printf("KFC_HEALING_PROTOCOL_REPLY %s\n", encoded)
}

func TestKFCHealingJobCompactAndZeroHealing(t *testing.T) {
	workload := kfcTankWorkload(5)
	workload.Damage = nil
	job := kfcHealingProtocolJob(t, "zero-healing", kfcWorkloadRequest(10000, 1, 5), workload, false)
	reply := RunKFCHealingJob(context.Background(), kfcHealingJobJSON(t, job))
	if reply.Status != "complete" || reply.Result == nil {
		t.Fatalf("Zero healing was rejected: %+v", reply.Error)
	}
	kfcPriestNear(t, reply.Result.HPS, 0)
	kfcPriestNear(t, reply.Result.RawHPS, 0)
	encoded, err := json.Marshal(reply)
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatal(err)
	}
	var result map[string]json.RawMessage
	if err := json.Unmarshal(decoded["result"], &result); err != nil {
		t.Fatal(err)
	}
	if _, exists := result["metrics"]; exists {
		t.Fatal("Compact protocol leaked the full protobuf metrics payload")
	}
}

func TestKFCHealingJobDeathsRemainFailedAssignments(t *testing.T) {
	workload := kfcTankWorkload(5)
	workload.Damage = []KFCHealingDamageEvent{{AtMS: 1000, RaidIndex: 1, Amount: 15000}}
	job := kfcHealingProtocolJob(t, "failed-survival", kfcWorkloadRequest(10000, 2, 5), workload, false)
	reply := RunKFCHealingJob(context.Background(), kfcHealingJobJSON(t, job))
	if reply.Status != "complete" || reply.Result == nil {
		t.Fatalf("Measured death did not return its evidence: %+v", reply.Error)
	}
	kfcPriestNear(t, reply.Result.SurvivalRate, 0)
	if reply.Result.FinalMissingHealthMean < 10000 || reply.Result.DeliveredIncomingDamageMean != 15000 {
		t.Fatal("The protocol hid the failed assignment behind its HPS")
	}
}

func TestKFCHealingJobRejectsUnsupportedInput(t *testing.T) {
	request := kfcWorkloadRequest(10000, 1, 5)
	good := kfcHealingProtocolJob(t, "input-guard", request, kfcTankWorkload(5), false)
	unknown := googleProto.Clone(request).(*proto.RaidSimRequest)
	unknown.SimOptions.ProtoReflect().SetUnknown(protowire.AppendVarint(protowire.AppendTag(nil, 2047, protowire.VarintType), 1))
	debug := googleProto.Clone(request).(*proto.RaidSimRequest)
	debug.SimOptions.Debug = true
	wrongSchema := good
	wrongSchema.Schema = "kfc-dps-job.v1"
	badBase64 := good
	badBase64.RequestBase64 = "!not-protobuf!"
	unknownJob := kfcHealingProtocolJob(t, good.ID, unknown, good.Workload, false)
	debugJob := kfcHealingProtocolJob(t, good.ID, debug, good.Workload, false)
	valid := kfcHealingJobJSON(t, good)
	for name, payload := range map[string][]byte{
		"unknown-schema":                kfcHealingJobJSON(t, wrongSchema),
		"invalid-protobuf":              kfcHealingJobJSON(t, badBase64),
		"unknown-nested-protobuf-field": kfcHealingJobJSON(t, unknownJob),
		"debug-stdout":                  kfcHealingJobJSON(t, debugJob),
		"trailing-json":                 append(append([]byte{}, valid...), []byte(" {}")...),
		"unknown-envelope-field":        append([]byte(`{"unrecognised":1,`), valid[1:]...),
		"oversized-envelope":            make([]byte, 4*1024*1024+1),
	} {
		t.Run(name, func(t *testing.T) {
			reply := RunKFCHealingJob(context.Background(), payload)
			if reply.Status != "error" || reply.Result != nil || reply.Error == nil || reply.Error.Code == "" {
				t.Fatalf("Unsupported input was accepted: %+v", reply)
			}
		})
	}
}

func TestKFCHealingJobCancellationAndRecovery(t *testing.T) {
	job := kfcHealingProtocolJob(t, "cancelled-control", kfcWorkloadRequest(10000, 1, 5), kfcTankWorkload(5), false)
	payload := kfcHealingJobJSON(t, job)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	reply := RunKFCHealingJob(ctx, payload)
	if reply.Status != "error" || reply.Error == nil || reply.Error.Code != "cancelled" {
		t.Fatalf("Cancellation was not preserved: %+v", reply)
	}
	reply = RunKFCHealingJob(context.Background(), payload)
	if reply.Status != "complete" || reply.Result == nil {
		t.Fatalf("A cancelled job poisoned the next simulation: %+v; error=%+v", reply, reply.Error)
	}
}

func TestKFCHealingJobExternalExecutorInputs(t *testing.T) {
	request := kfcWorkloadRequest(10000, 3, 30)
	normal := kfcHealingProtocolJob(t, "external-normal", request, kfcTankWorkload(30), true)
	compact := normal
	compact.ID, compact.Detail = "external-compact", false
	zeroWorkload := kfcTankWorkload(5)
	zeroWorkload.Damage = nil
	zero := kfcHealingProtocolJob(t, "external-zero", kfcWorkloadRequest(10000, 1, 5), zeroWorkload, false)
	fatalWorkload := kfcTankWorkload(5)
	fatalWorkload.Damage = []KFCHealingDamageEvent{{AtMS: 1000, RaidIndex: 1, Amount: 15000}}
	fatal := kfcHealingProtocolJob(t, "external-fatal", kfcWorkloadRequest(10000, 2, 5), fatalWorkload, false)
	bad := compact
	bad.ID = "external-invalid"
	bad.Workload = kfcTankWorkload(30)
	bad.Workload.Priorities[0].SpellID = 1
	long := normal
	long.ID = "external-stop"
	longRequest := kfcWorkloadRequest(10000, 10000, 300)
	long = kfcHealingProtocolJob(t, long.ID, longRequest, kfcTankWorkload(300), false)
	encoded, err := json.Marshal(map[string]KFCHealingJob{"normal": normal, "compact": compact, "zero": zero, "fatal": fatal, "invalid": bad, "stop": long})
	if err != nil {
		t.Fatal(err)
	}
	fmt.Printf("KFC_HEALING_PROTOCOL_INPUTS %s\n", encoded)
}
