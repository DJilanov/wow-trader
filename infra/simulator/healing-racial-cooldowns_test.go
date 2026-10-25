package healing

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
)

func kfcRacialActor(t *testing.T, race proto.Race) (*core.Simulation, *HealingPriest) {
	t.Helper()
	request := kfcResourceRequest(240)
	request.Raid.Parties[0].Players[0].Race = race
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	return sim, sim.Raid.Parties[0].Players[0].(*HealingPriest)
}

func TestKFCPriestRacialOwnershipAndPolicy(t *testing.T) {
	_, troll := kfcRacialActor(t, proto.Race_RaceTroll)
	if err := troll.validateKFCHealingCooldowns([]KFCHealingCooldown{{SpellID: 20554}}); err != nil {
		t.Fatal(err)
	}
	for _, policies := range [][]KFCHealingCooldown{
		{{SpellID: 20554, MinimumMissingMana: 1}},
		{{SpellID: 20554}, {SpellID: 20554}},
		{{SpellID: 20555}},
	} {
		if troll.validateKFCHealingCooldowns(policies) == nil {
			t.Fatal("Invalid racial policy accepted")
		}
	}
	_, human := kfcRacialActor(t, proto.Race_RaceHuman)
	if human.validateKFCHealingCooldowns([]KFCHealingCooldown{{SpellID: 20554}}) == nil {
		t.Fatal("Unowned racial accepted")
	}
}

func TestKFCPriestRacialActualSpeedExpiryAndReset(t *testing.T) {
	sim, healer := kfcRacialActor(t, proto.Race_RaceTroll)
	frame := kfcTankWorkload(240)
	frame.Cooldowns = []KFCHealingCooldown{{SpellID: 20554}}
	spell := healer.GetSpell(core.ActionID{SpellID: 20554})
	base := healer.CastSpeed
	mana, health := healer.CurrentMana(), healer.CurrentHealth()
	healer.useKFCHealingCooldowns(sim, frame)
	if spell.IsReady(sim) || spell.CD.ReadyAt() != 180*time.Second {
		t.Fatal("Racial did not consume its real cooldown")
	}
	kfcPriestNear(t, healer.CastSpeed, base/1.1)
	kfcPriestNear(t, healer.CurrentMana(), mana)
	kfcPriestNear(t, healer.CurrentHealth(), health)
	healer.useKFCHealingCooldowns(sim, frame)
	kfcPriestNear(t, healer.CastSpeed, base/1.1)
	kfcPriestAdvance(t, sim, 10*time.Second)
	kfcPriestNear(t, healer.CastSpeed, base)
	kfcPriestAdvance(t, sim, 180*time.Second)
	healer.useKFCHealingCooldowns(sim, frame)
	if spell.CD.ReadyAt() != 360*time.Second {
		t.Fatal("Racial did not respect its second cooldown")
	}
	kfcPriestNear(t, healer.CastSpeed, base/1.1)
	sim.Cleanup()
	sim.Reset()
	kfcPriestNear(t, healer.CastSpeed, base)
	if !spell.IsReady(sim) {
		t.Fatal("Racial cooldown leaked between iterations")
	}
	healer.useKFCHealingCooldowns(sim, frame)
	kfcPriestNear(t, healer.CastSpeed, base/1.1)
}

func TestKFCPriestRacialDemandAndBusyCaster(t *testing.T) {
	sim, healer := kfcRacialActor(t, proto.Race_RaceTroll)
	frame := kfcTankWorkload(240)
	frame.Cooldowns = []KFCHealingCooldown{{SpellID: 20554, RequireHealingDemand: true}}
	spell := healer.GetSpell(core.ActionID{SpellID: 20554})
	healer.useKFCHealingCooldowns(sim, frame)
	if !spell.IsReady(sim) {
		t.Fatal("Racial wasted without healing demand")
	}
	target := &sim.Raid.GetFirstTargetDummy().Unit
	target.RemoveHealth(sim, 2000)
	if !healer.FlashHeal[7].Cast(sim, target) {
		t.Fatal("Busy-caster control did not cast")
	}
	healer.useKFCHealingCooldowns(sim, frame)
	if !spell.IsReady(sim) {
		t.Fatal("Racial activated during a cast")
	}
	kfcPriestAdvance(t, sim, 1600*time.Millisecond)
	target.RemoveHealth(sim, 2000)
	healer.useKFCHealingCooldowns(sim, frame)
	if spell.IsReady(sim) {
		t.Fatal("Demand-gated racial was not activated")
	}
}

func TestKFCPriestRacialExplicitWorkloadAndExternalInputs(t *testing.T) {
	request := kfcWorkloadRequest(10000, 1, 240)
	request.Raid.Parties[0].Players[0].Race = proto.Race_RaceTroll
	jobs := map[string]KFCHealingJob{}
	for _, enabled := range []bool{false, true} {
		frame := kfcTankWorkload(240)
		for index := range frame.Damage {
			frame.Damage[index].Amount = 100
		}
		if enabled {
			frame.Cooldowns = []KFCHealingCooldown{{SpellID: 20554, RequireHealingDemand: true}}
		}
		result, err := RunKFCHealingWorkload(context.Background(), request, frame)
		if err != nil {
			t.Fatal(err)
		}
		if result.SurvivalRate != 1 || result.DeliveredIncomingDamageMean != result.PlannedIncomingPostMitigationDamage {
			t.Fatal("Racial lifecycle control must remain a feasible assignment")
		}
		casts := kfcResourceCasts(result, core.ActionID{SpellID: 20554})
		if (!enabled && casts != 0) || (enabled && casts != 2) {
			t.Fatalf("Incorrect explicit racial casts: enabled=%v casts=%v", enabled, casts)
		}
		name := "racialNone"
		if enabled {
			name = "racialBerserking"
		}
		jobs[name] = kfcHealingProtocolJob(t, "external-"+name, request, frame, true)
	}
	data, err := json.Marshal(jobs)
	if err != nil {
		t.Fatal(err)
	}
	fmt.Printf("KFC_HEALER_RACIAL_INPUTS %s\n", data)
}
