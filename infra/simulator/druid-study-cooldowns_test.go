package restoration

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
	"google.golang.org/protobuf/encoding/protojson"
)

func TestKFCDruidSerenityOwnershipPayloadAndTimers(t *testing.T) {
	request := kfcFeralheartRequest(0)
	request.Raid.Parties[0].Players[0].BonusStats = nil
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	unowned := sim.Raid.Parties[0].Players[0].(*RestorationDruid)
	if unowned.validateKFCDruidHealingCooldowns([]KFCDruidHealingCooldown{{ItemID: 272439}}) == nil {
		t.Fatal("Unowned Serenity admitted")
	}
	request.Raid.Parties[0].Players[0].Equipment.Items[12].Id = 272439
	sim = core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	healer := sim.Raid.Parties[0].Players[0].(*RestorationDruid)
	if err := healer.validateKFCDruidHealingCooldowns([]KFCDruidHealingCooldown{{ItemID: 272439}}); err != nil {
		t.Fatal(err)
	}
	if healer.validateKFCDruidHealingCooldowns([]KFCDruidHealingCooldown{{SpellID: 1291103}}) == nil || healer.validateKFCDruidHealingCooldowns([]KFCDruidHealingCooldown{{ItemID: 272439}, {ItemID: 272439}}) == nil {
		t.Fatal("Invalid Serenity selectors accepted")
	}
	spell := healer.GetSpell(core.ActionID{ItemID: 272439})
	base := healer.GetStat(stats.Spirit)
	regen := healer.ManaRegenPerSecondWhileNotCasting()
	if spell == nil || !spell.Cast(sim, &healer.Unit) {
		t.Fatal("Serenity effect unavailable")
	}
	kfcDruidNear(t, healer.GetStat(stats.Spirit)-base, 72)
	if healer.ManaRegenPerSecondWhileNotCasting() <= regen || spell.CD.ReadyAt() != 90*time.Second || spell.SharedCD.ReadyAt() != 15*time.Second {
		t.Fatal("Serenity regen or timers differ from source")
	}
	if spell.Cast(sim, &healer.Unit) {
		t.Fatal("Serenity bypassed its cooldown")
	}
	kfcDruidAdvance(t, sim, 15*time.Second)
	kfcDruidNear(t, healer.GetStat(stats.Spirit), base)
	kfcDruidNear(t, healer.ManaRegenPerSecondWhileNotCasting(), regen)
	sim.Cleanup()
	sim.Reset()
	kfcDruidNear(t, healer.GetStat(stats.Spirit), base)
	if !spell.IsReady(sim) {
		t.Fatal("Serenity cooldown survived iteration reset")
	}
	kfcDruidAdvancedResult("SERENITY_PAYLOAD", []float64{base, regen, 72, 15, 90})
}

func TestKFCDruidSerenityEquippedPolicy(t *testing.T) {
	for index := 0; index < 3; index++ {
		request, frame := kfcDruidWorkloadControl()
		player := request.Raid.Parties[0].Players[0]
		player.BonusStats = nil
		player.Equipment = &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
		for slot, id := range kfcDruidEquippedControlIds {
			player.Equipment.Items[slot] = &proto.ItemSpec{Id: id}
		}
		player.Equipment.Items[12].Id = 272439
		player.Equipment.Items[16].Id = 22398
		if index > 0 {
			frame.Cooldowns = []KFCDruidHealingCooldown{{ItemID: 272439, RequireHealingDemand: true}}
		}
		if index == 2 {
			frame.Damage = nil
		}
		payload := kfcDruidControlPayload(t, request, frame, fmt.Sprintf("serenity-policy-%d", index), true)
		reply := RunKFCDruidHealingJob(context.Background(), payload)
		if reply.Status != "complete" || reply.Result == nil || reply.Result.Metrics == nil {
			t.Fatalf("Serenity workload failed: %+v", reply)
		}
		casts := int32(0)
		metrics := &proto.RaidMetrics{}
		if err := protojson.Unmarshal(reply.Result.Metrics, metrics); err != nil {
			t.Fatal(err)
		}
		for _, action := range metrics.Parties[0].Players[0].Actions {
			if action.Id.GetItemId() == 272439 {
				for _, target := range action.Targets {
					casts += target.Casts
				}
			}
		}
		if (casts > 0) != (index == 1) {
			t.Fatal("Serenity ignored explicit activation or demand policy")
		}
		kfcDruidAdvancedResult("SERENITY_REQUEST", json.RawMessage(payload))
		kfcDruidAdvancedResult("SERENITY_RESULT", reply)
	}
}
