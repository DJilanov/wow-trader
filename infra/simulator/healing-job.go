package healing

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"regexp"

	"github.com/wowsims/classic/sim/core/proto"
	"google.golang.org/protobuf/encoding/protojson"
	googleProto "google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
)

type KFCHealingJob struct {
	Schema        string             `json:"schema"`
	ID            string             `json:"id"`
	RequestBase64 string             `json:"requestBase64"`
	Workload      KFCHealingWorkload `json:"workload"`
	Detail        bool               `json:"detail"`
}

type KFCHealingJobError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type KFCHealingJobResult struct {
	*KFCHealingWorkloadResult
	Metrics             json.RawMessage `json:"metrics,omitempty"`
	HPS                 float64         `json:"hps"`
	HPSStdev            float64         `json:"hpsStdev"`
	RawHPS              float64         `json:"rawHps"`
	EffectiveHealingHPS float64         `json:"effectiveHealingHps"`
	OverhealingHPS      float64         `json:"overhealingHps"`
	AbsorbedHPS         float64         `json:"absorbedHps"`
}

type KFCHealingJobReply struct {
	Schema string               `json:"schema"`
	ID     string               `json:"id"`
	Status string               `json:"status"`
	Result *KFCHealingJobResult `json:"result,omitempty"`
	Error  *KFCHealingJobError  `json:"error,omitempty"`
}

var kfcHealingJobID = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$`)

func kfcHealingUnknownFields(message protoreflect.Message) bool {
	if len(message.GetUnknown()) > 0 {
		return true
	}
	unknown := false
	message.Range(func(field protoreflect.FieldDescriptor, value protoreflect.Value) bool {
		if field.IsMap() && field.MapValue().Kind() == protoreflect.MessageKind {
			value.Map().Range(func(_ protoreflect.MapKey, entry protoreflect.Value) bool {
				unknown = kfcHealingUnknownFields(entry.Message())
				return !unknown
			})
		} else if field.IsList() && field.Kind() == protoreflect.MessageKind {
			list := value.List()
			for index := 0; index < list.Len() && !unknown; index++ {
				unknown = kfcHealingUnknownFields(list.Get(index).Message())
			}
		} else if field.Kind() == protoreflect.MessageKind && !field.IsMap() {
			unknown = kfcHealingUnknownFields(value.Message())
		}
		return !unknown
	})
	return unknown
}

// RunKFCHealingJob is the shared, versioned native/browser benchmark boundary.
func RunKFCHealingJob(ctx context.Context, payload []byte) (reply KFCHealingJobReply) {
	reply.Schema = "kfc-healing-job-result.v1"
	fail := func(code, message string) KFCHealingJobReply {
		return KFCHealingJobReply{Schema: reply.Schema, ID: reply.ID, Status: "error", Error: &KFCHealingJobError{Code: code, Message: message}}
	}
	defer func() {
		if failure := recover(); failure != nil {
			reply = fail("engine_failure", fmt.Sprint(failure))
		}
	}()
	if len(payload) == 0 || len(payload) > 4*1024*1024 {
		return fail("invalid_job", "Healing job must contain at most 4 MiB of JSON")
	}
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	var job KFCHealingJob
	if err := decoder.Decode(&job); err != nil {
		reply.ID = job.ID
		return fail("invalid_job", "Invalid healing job JSON: "+err.Error())
	}
	reply.ID = job.ID
	if decoder.Decode(new(json.RawMessage)) != io.EOF || job.Schema != "kfc-healing-job.v1" || !kfcHealingJobID.MatchString(job.ID) {
		return fail("invalid_job", "Unsupported healing job schema, identifier or trailing data")
	}
	encoded, err := base64.StdEncoding.Strict().DecodeString(job.RequestBase64)
	if err != nil || len(encoded) == 0 {
		return fail("invalid_request", "Invalid encoded healing request")
	}
	request := &proto.RaidSimRequest{}
	if err = (googleProto.UnmarshalOptions{RecursionLimit: 100}).Unmarshal(encoded, request); err != nil || kfcHealingUnknownFields(request.ProtoReflect()) {
		return fail("invalid_request", "Invalid or unsupported healing request fields")
	}
	if request.SimOptions != nil && (request.SimOptions.Debug || request.SimOptions.DebugFirstIteration) {
		return fail("invalid_request", "Debug logging is unavailable in the healing worker protocol")
	}
	result, err := RunKFCHealingWorkload(ctx, request, job.Workload)
	if err != nil {
		if ctx != nil && ctx.Err() != nil {
			return fail("cancelled", ctx.Err().Error())
		}
		return fail("workload_failed", err.Error())
	}
	metrics := result.Metrics
	if metrics == nil || metrics.Hps == nil || metrics.RawHealingHps == nil || metrics.EffectiveHealingHps == nil || metrics.OverhealingHps == nil || metrics.AbsorbedHps == nil {
		return fail("invalid_metrics", "Healing engine did not return its required metrics")
	}
	for name, value := range map[string]float64{"hps": metrics.Hps.Avg, "hpsStdev": metrics.Hps.Stdev, "rawHps": metrics.RawHealingHps.Avg, "effectiveHealingHps": metrics.EffectiveHealingHps.Avg, "overhealingHps": metrics.OverhealingHps.Avg, "absorbedHps": metrics.AbsorbedHps.Avg, "survivalRate": result.SurvivalRate, "manaRemainingMean": result.ManaRemainingMean, "missingHealthSecondsMean": result.MissingHealthSecondsMean, "finalMissingHealthMean": result.FinalMissingHealthMean, "manaBlockedSecondsMean": result.ManaBlockedSecondsMean, "plannedIncomingPostMitigationDamage": result.PlannedIncomingPostMitigationDamage, "deliveredIncomingDamageMean": result.DeliveredIncomingDamageMean} {
		if !kfcFinite(value) || value < 0 {
			return fail("invalid_metrics", fmt.Sprintf("Healing engine returned invalid %s: %v", name, value))
		}
	}
	wire := &KFCHealingJobResult{KFCHealingWorkloadResult: result, HPS: metrics.Hps.Avg, HPSStdev: metrics.Hps.Stdev, RawHPS: metrics.RawHealingHps.Avg, EffectiveHealingHPS: metrics.EffectiveHealingHps.Avg, OverhealingHPS: metrics.OverhealingHps.Avg, AbsorbedHPS: metrics.AbsorbedHps.Avg}
	if job.Detail {
		wire.Metrics, err = (protojson.MarshalOptions{EmitUnpopulated: true}).Marshal(metrics)
		if err != nil {
			return fail("invalid_metrics", "Could not encode detailed healing metrics")
		}
	}
	reply.Status, reply.Result = "complete", wire
	return reply
}
