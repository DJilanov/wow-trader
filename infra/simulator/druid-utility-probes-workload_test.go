package restoration

import (
	"context"
	"encoding/json"
	"testing"
)

func TestKFCDruidUtilityProbeControllerUsesOwnedEnvelope(t *testing.T) {
	request, frame := kfcDruidWorkloadControl()
	request.Raid.Parties[0].Players[0] = kfcUtilityRequest(8346).Raid.Parties[0].Players[0]
	frame.Priorities[0].MinimumMissingHealth = 100000
	baseline := RunKFCDruidHealingJob(context.Background(), kfcDruidControlPayload(t, request, frame, "utility-disabled-controller", false))
	if baseline.Status != "complete" {
		t.Fatal(baseline.Error)
	}
	policy := kfcUtilityPolicy()
	policy.Gauntlets = true
	frame.UtilityProbe = &policy
	active := RunKFCDruidHealingJob(context.Background(), kfcDruidControlPayload(t, request, frame, "utility-active-controller", false))
	if active.Status != "complete" {
		t.Fatal(active.Error)
	}
	if baseline.Result.RawHPS != 0 || active.Result.RawHPS <= 0 || active.Result.MissingHealthSecondsMean >= baseline.Result.MissingHealthSecondsMean {
		t.Fatalf("Utility controller was not used: disabled=%+v active=%+v", baseline.Result, active.Result)
	}
	kfcDruidNear(t, active.Result.RawHPS, 25)
	kfcDruidAdvancedResult("UTILITY_CONTROLLER", []float64{baseline.Result.MissingHealthSecondsMean, active.Result.MissingHealthSecondsMean, active.Result.RawHPS, active.Result.EffectiveHealingHPS})
}

func TestKFCDruidUtilityProbeWireRejectsUnknownModesFieldsAndLongAssignments(t *testing.T) {
	request, frame := kfcDruidWorkloadControl()
	request.Raid.Parties[0].Players[0] = kfcUtilityRequest(8346).Raid.Parties[0].Players[0]
	policy := kfcUtilityPolicy()
	policy.Gauntlets = true
	frame.UtilityProbe = &policy
	payload := kfcDruidControlPayload(t, request, frame, "utility-unknown-field", false)
	var value map[string]interface{}
	if err := json.Unmarshal(payload, &value); err != nil {
		t.Fatal(err)
	}
	value["workload"].(map[string]interface{})["utilityProbe"].(map[string]interface{})["infiniteMana"] = true
	changed, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	unknown := RunKFCDruidHealingJob(context.Background(), changed)
	if unknown.Status != "error" {
		t.Fatal("Unknown utility field was ignored")
	}
	policy.Mode = "actual-server-rules"
	frame.UtilityProbe = &policy
	mode := RunKFCDruidHealingJob(context.Background(), kfcDruidControlPayload(t, request, frame, "utility-invalid-mode", false))
	if mode.Status != "error" {
		t.Fatal("Optimistic probe was promoted to server behavior")
	}
	policy = kfcUtilityPolicy()
	policy.Gauntlets = true
	frame.UtilityProbe = &policy
	request.Encounter.Duration = 301
	duration := RunKFCDruidHealingJob(context.Background(), kfcDruidControlPayload(t, request, frame, "utility-invalid-duration", false))
	if duration.Status != "error" {
		t.Fatal("One-use envelope accepted a longer assignment")
	}
	kfcDruidAdvancedResult("UTILITY_WIRE_GUARDS", []string{unknown.Status, mode.Status, duration.Status})
}
