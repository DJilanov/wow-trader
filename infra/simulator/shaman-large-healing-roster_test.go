package restoration

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"testing"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	googleProto "google.golang.org/protobuf/proto"
)

func kfcShamanLargeRosterRequest(t *testing.T, count int) (*proto.RaidSimRequest, KFCShamanEquippedHealingWorkload) {
	t.Helper()
	request, frame := kfcShamanEquippedControl(t, "2-4-11", nil)
	request.Encounter.Duration = 14
	request.SimOptions.Iterations = 2
	request.Raid.TargetDummies = int32(count)
	for len(request.Raid.Parties)*5 < count+1 {
		request.Raid.Parties = append(request.Raid.Parties, &proto.Party{Buffs: googleProto.Clone(request.Raid.Parties[0].Buffs).(*proto.PartyBuffs)})
	}
	for index := len(frame.Workload.Targets); index <= count; index++ {
		frame.Workload.Targets = append(frame.Workload.Targets, KFCShamanHealingTarget{RaidIndex: int32(index), MaximumHealth: 10000, X: float64(index%6) * 2, Y: float64(index/6) * 2})
	}
	return request, frame
}

func TestKFCShamanRecipientManaLargeRosterConstructor(t *testing.T) {
	for _, count := range []int{24, 25, 39} {
		for _, mana := range []bool{false, true} {
			request, _ := kfcShamanLargeRosterRequest(t, count)
			var pools []core.KFCManaRecipientPool
			if mana {
				pools = []core.KFCManaRecipientPool{{RaidIndex: int32(count), MaximumMana: 1000}}
			}
			sim, err := core.NewKFCManaRecipientSimulation(request, simsignals.CreateSignals(), pools)
			if err != nil {
				t.Fatal(err)
			}
			if sim.Raid.Size() != count+1 || len(sim.Raid.AllPlayerUnits) != count+1 || len(sim.AllUnits) != count+2 {
				t.Fatalf("declared roster was clipped: requested%d, players%d, units%d", count+1, sim.Raid.Size(), len(sim.AllUnits))
			}
			seen := map[int32]bool{}
			for index, unit := range sim.AllUnits {
				if unit.Env != sim.Environment || unit.UnitIndex != int32(index) || seen[unit.UnitIndex] {
					t.Fatal("expanded unit graph has stale environment/index references")
				}
				seen[unit.UnitIndex] = true
			}
			for index, unit := range sim.Raid.AllPlayerUnits {
				if unit.Index != int32(index) || unit.CurrentTarget != sim.Encounter.TargetUnits[0] {
					t.Fatal("expanded player order or target differs")
				}
				if index == count && mana {
					if !unit.HasManaBar() {
						t.Fatal("last declared recipient lost its actual mana bar")
					}
					kfcShamanNear(t, unit.MaxMana(), 1000)
				}
			}
			sim.Reset()
			sim.Cleanup()
			kfcShamanMeasure("RECIPIENT_MANA_LARGE_CONSTRUCTOR", struct {
				Recipients int
				Mana       bool
			}{count, mana})
		}
	}
}

func TestKFCShamanRecipientManaLargeRosterActualWorkloadAndWire(t *testing.T) {
	for _, mana := range []bool{false, true} {
		request, frame := kfcShamanLargeRosterRequest(t, 39)
		frame.Workload.Water.Recipients = "raid-reference"
		frame.Workload.Priorities = append([]KFCShamanHealingPriority{{SpellID: 16190, RaidIndex: -1}}, frame.Workload.Priorities...)
		if mana {
			policy := kfcShamanRecipientManaReference(1, 1000, 0)
			policy.Recipients = nil
			for index := int32(1); index <= 39; index++ {
				row := kfcShamanRecipientManaReference(index, 1000, 0, KFCShamanRecipientManaCost{AtMS: 4000, Amount: 100}, KFCShamanRecipientManaCost{AtMS: 8000, Amount: 100})
				policy.Recipients = append(policy.Recipients, row.Recipients[0])
			}
			frame.RecipientMana = &policy
		}
		original := googleProto.Clone(request)
		result := kfcShamanEquippedResult(t, request, frame)
		if !googleProto.Equal(original, request) || result.SurvivalRate != 1 || len(result.Metrics.Parties) != 8 {
			t.Fatal("large actual workload mutated its request, lost recipients or failed survival")
		}
		if mana {
			kfcShamanNear(t, result.Assignment.UsefulOtherManaTideManaMean, 39*352)
			kfcShamanNear(t, result.Assignment.RecipientManaDemandMean, 39*200)
			kfcShamanNear(t, result.Assignment.RecipientManaSpentMean, 39*100)
			kfcShamanNear(t, result.Assignment.RecipientUnpaidManaMean, 39*100)
			kfcShamanNear(t, result.Assignment.FinalLivingRecipientManaMean, 39*252)
		} else {
			kfcShamanNear(t, result.Assignment.UsefulOtherManaTideManaMean, 0)
			kfcShamanNear(t, result.Assignment.RecipientManaDemandMean, 0)
		}
		if result.Assignment.SupportHpsMean*14 > result.Assignment.DamageDemandMean+1e-7 {
			t.Fatal("large resource utility inflated external healing")
		}
		kfcShamanMeasure("RECIPIENT_MANA_LARGE_WORKLOAD", result.Assignment)
		if mana {
			encoded, err := (googleProto.MarshalOptions{Deterministic: true}).Marshal(request)
			if err != nil {
				t.Fatal(err)
			}
			job := KFCShamanEquippedHealingJob{Schema: "kfc-shaman-equipped-job.v1", ID: "large-recipient-mana-control", RequestBase64: base64.StdEncoding.EncodeToString(encoded), Workload: frame, Detail: true}
			payload, err := json.Marshal(job)
			if err != nil {
				t.Fatal(err)
			}
			reply := RunKFCShamanEquippedHealingJob(context.Background(), payload)
			if reply.Status != "complete" || reply.Result == nil || reply.Result.Iterations != 2 {
				t.Fatal("large native/browser wire rejected the actual roster", reply.Error)
			}
			kfcShamanMeasure("RECIPIENT_MANA_LARGE_WIRE", struct {
				Payload KFCShamanEquippedHealingJob      `json:"payload"`
				Reply   KFCShamanEquippedHealingJobReply `json:"reply"`
			}{job, reply})
		}
	}
}

func TestKFCShamanRecipientManaLargeRosterScopeAndCapacityGuards(t *testing.T) {
	for _, edit := range []func(*proto.RaidSimRequest){
		func(request *proto.RaidSimRequest) { request.Raid.TargetDummies = 40 },
		func(request *proto.RaidSimRequest) { request.Raid.Parties = request.Raid.Parties[:7] },
		func(request *proto.RaidSimRequest) { request.Raid.NumActiveParties = 6 },
		func(request *proto.RaidSimRequest) { request.Raid.Parties[7] = nil },
		func(request *proto.RaidSimRequest) { request.SimOptions.Ruleset = proto.Ruleset_RulesetClassic },
		func(request *proto.RaidSimRequest) { request.Raid.Debuffs = &proto.Debuffs{} },
		func(request *proto.RaidSimRequest) { request.Raid.Tanks = []*proto.UnitReference{{Index: 0}} },
	} {
		request, _ := kfcShamanLargeRosterRequest(t, 39)
		edit(request)
		if _, err := core.NewKFCManaRecipientSimulation(request, simsignals.CreateSignals(), nil); err == nil {
			t.Fatal("unadmitted expanded roster accepted")
		}
	}
	kfcShamanMeasure("RECIPIENT_MANA_LARGE_GATES", 7)
}
