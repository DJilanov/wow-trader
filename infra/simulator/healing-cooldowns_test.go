package healing

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	googleProto "google.golang.org/protobuf/proto"
)

func kfcResourceRequest(duration float64) *proto.RaidSimRequest {
	request := kfcWorkloadRequest(0, 1, duration)
	player := request.Raid.Parties[0].Players[0]
	player.Equipment = kfcItemEquipment()
	player.Equipment.Items[12] = &proto.ItemSpec{Id: 11819}
	player.Consumes = &proto.Consumes{DefaultPotion: proto.Potions_MajorManaPotion, DefaultConjured: proto.Conjured_ConjuredDemonicRune}
	player.Rotation = &proto.APLRotation{Type: proto.APLRotation_TypeAPL}
	request.SimOptions.Interactive, request.SimOptions.IsTest = true, true
	return request
}

func kfcResourceFixture(t *testing.T) (*core.Simulation, *HealingPriest) {
	t.Helper()
	sim := core.NewSim(kfcResourceRequest(300), simsignals.CreateSignals())
	healer := sim.Raid.Parties[0].Players[0].(*HealingPriest)
	policies := []KFCHealingCooldown{{ItemID: 13444}, {ItemID: 12662}, {SpellID: 15604}}
	if err := healer.validateKFCHealingCooldowns(policies); err != nil {
		t.Fatal(err)
	}
	sim.Reset()
	return sim, healer
}

func kfcResourceSpend(sim *core.Simulation, healer *HealingPriest, amount float64) {
	healer.SpendMana(sim, amount, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 772}))
}

func TestKFCPriestResourceCooldownPolicyValidation(t *testing.T) {
	_, healer := kfcResourceFixture(t)
	for _, policies := range [][]KFCHealingCooldown{
		{{}}, {{ItemID: -1}}, {{SpellID: -1}}, {{ItemID: 13444, SpellID: 15604}},
		{{ItemID: 13444, MinimumMissingMana: math.NaN()}}, {{ItemID: 13444, MinimumMissingMana: math.Inf(1)}},
		{{ItemID: 13444, MinimumMissingMana: -1}}, {{ItemID: 13444, MinimumMissingMana: 1000001}},
		{{ItemID: 19288}}, {{ItemID: 22268}}, {{SpellID: 10060}}, {{SpellID: 14751}},
		{{ItemID: 6149}}, {{ItemID: 13444}, {ItemID: 13444}}, make([]KFCHealingCooldown, 17),
	} {
		if err := healer.validateKFCHealingCooldowns(policies); err == nil {
			t.Fatalf("Accepted invalid, duplicate, unavailable or unreviewed cooldown: %+v", policies)
		}
	}
	request := kfcResourceRequest(30)
	request.Raid.Parties[0].Players[0].Equipment.Items[12] = &proto.ItemSpec{}
	sim := core.NewSim(request, simsignals.CreateSignals())
	unowned := sim.Raid.Parties[0].Players[0].(*HealingPriest)
	if err := unowned.validateKFCHealingCooldowns([]KFCHealingCooldown{{SpellID: 15604}}); err == nil {
		t.Fatal("An unequipped Second Wind was admitted")
	}
}

func TestKFCPriestResourceCooldownSecondWindThresholdAndReset(t *testing.T) {
	sim, healer := kfcResourceFixture(t)
	frame := kfcTankWorkload(30)
	frame.Cooldowns = []KFCHealingCooldown{{SpellID: 15604, MinimumMissingMana: 630}}
	spell := healer.GetSpell(core.ActionID{SpellID: 15604})
	healer.useKFCHealingCooldowns(sim, frame)
	if !spell.IsReady(sim) {
		t.Fatal("Second Wind was wasted at full mana")
	}
	kfcResourceSpend(sim, healer, 629)
	healer.useKFCHealingCooldowns(sim, frame)
	if !spell.IsReady(sim) {
		t.Fatal("Second Wind ignored the missing-mana threshold")
	}
	kfcResourceSpend(sim, healer, 1000)
	before := healer.CurrentMana()
	healer.useKFCHealingCooldowns(sim, frame)
	if spell.IsReady(sim) || spell.CD.ReadyAt() != 15*time.Minute {
		t.Fatal("Second Wind did not use its actual fifteen-minute cooldown")
	}
	kfcPriestNear(t, healer.CurrentMana(), before)
	kfcPriestAdvance(t, sim, 1100*time.Millisecond)
	kfcPriestNear(t, healer.CurrentMana()-before, 63)
	healer.useKFCHealingCooldowns(sim, frame)
	kfcPriestAdvance(t, sim, 1999*time.Millisecond)
	kfcPriestNear(t, healer.CurrentMana()-before, 63)
	sim.Cleanup()
	sim.Reset()
	if !spell.IsReady(sim) {
		t.Fatal("A prior iteration's cooldown leaked")
	}
	kfcResourceSpend(sim, healer, 1500)
	healer.useKFCHealingCooldowns(sim, frame)
	if spell.IsReady(sim) {
		t.Fatal("Reset did not recreate a usable major cooldown")
	}
}

func TestKFCPriestResourceCooldownDemandAndCastBoundaries(t *testing.T) {
	sim, healer := kfcResourceFixture(t)
	frame := kfcTankWorkload(30)
	frame.Cooldowns = []KFCHealingCooldown{{SpellID: 15604, MinimumMissingMana: 630, RequireHealingDemand: true}}
	spell := healer.GetSpell(core.ActionID{SpellID: 15604})
	kfcResourceSpend(sim, healer, 1500)
	healer.useKFCHealingCooldowns(sim, frame)
	if !spell.IsReady(sim) {
		t.Fatal("A demand-gated effect activated on a full-health raid")
	}
	target := &sim.Raid.GetFirstTargetDummy().Unit
	target.RemoveHealth(sim, 1000)
	if !healer.FlashHeal[7].Cast(sim, target) {
		t.Fatal("Cast-boundary control did not cast")
	}
	healer.useKFCHealingCooldowns(sim, frame)
	if !spell.IsReady(sim) {
		t.Fatal("The driver used a cooldown while busy casting")
	}
	kfcPriestAdvance(t, sim, 1600*time.Millisecond)
	target.RemoveHealth(sim, 1000)
	kfcResourceSpend(sim, healer, healer.CurrentMana())
	healer.useKFCHealingCooldowns(sim, frame)
	if spell.IsReady(sim) {
		t.Fatal("Healing demand incorrectly required having enough mana to heal")
	}
}

func TestKFCPriestResourceCooldownManagerThresholdsAndTimers(t *testing.T) {
	sim, healer := kfcResourceFixture(t)
	frame := kfcTankWorkload(30)
	frame.Cooldowns = []KFCHealingCooldown{{ItemID: 13444}}
	potion := healer.GetSpell(core.ActionID{ItemID: 13444})
	healer.useKFCHealingCooldowns(sim, frame)
	if !potion.IsReady(sim) {
		t.Fatal("The driver bypassed the potion's full-mana guard")
	}
	kfcResourceSpend(sim, healer, 1000)
	healer.useKFCHealingCooldowns(sim, frame)
	if !potion.IsReady(sim) {
		t.Fatal("The driver bypassed the potion's existing maximum-roll/regen guard")
	}
	kfcResourceSpend(sim, healer, healer.CurrentMana())
	before := healer.CurrentMana()
	healer.useKFCHealingCooldowns(sim, frame)
	if gain := healer.CurrentMana() - before; gain < 1350 || gain > 2250 || potion.CD.ReadyAt() != 2*time.Minute {
		t.Fatalf("Actual potion gain/timer was not respected: %f", gain)
	}
	kfcResourceSpend(sim, healer, healer.CurrentMana())
	healer.useKFCHealingCooldowns(sim, frame)
	kfcPriestNear(t, healer.CurrentMana(), 0)
	kfcPriestAdvance(t, sim, 120*time.Second)
	kfcResourceSpend(sim, healer, healer.CurrentMana())
	healer.useKFCHealingCooldowns(sim, frame)
	if healer.CurrentMana() < 1350 || potion.CD.ReadyAt() != 240*time.Second {
		t.Fatal("A second potion ignored its real two-minute cooldown")
	}
}

func TestKFCPriestResourceCooldownRuneSelfDamageAndDeadCaster(t *testing.T) {
	sim, healer := kfcResourceFixture(t)
	frame := kfcTankWorkload(30)
	frame.Cooldowns = []KFCHealingCooldown{{ItemID: 12662}}
	kfcResourceSpend(sim, healer, healer.CurrentMana())
	health := healer.CurrentHealth()
	healer.useKFCHealingCooldowns(sim, frame)
	if lost := health - healer.CurrentHealth(); lost <= 0 || lost > 1000 {
		t.Fatalf("Incorrect post-mitigation rune damage: %f", lost)
	}
	sim.Cleanup()
	sim, healer = kfcResourceFixture(t)
	frame.Cooldowns = []KFCHealingCooldown{{ItemID: 12662}, {ItemID: 13444}, {SpellID: 15604}}
	healer.RemoveHealth(sim, healer.CurrentHealth()-1)
	kfcResourceSpend(sim, healer, healer.CurrentMana())
	healer.useKFCHealingCooldowns(sim, frame)
	if healer.CurrentHealth() != 0 {
		t.Fatal("Rune self-damage did not kill the one-health caster")
	}
	if healer.CurrentMana() < 900 || healer.CurrentMana() > 1500 {
		t.Fatal("The rune did not supply its actual mana")
	}
	for _, action := range []core.ActionID{{ItemID: 13444}, {SpellID: 15604}} {
		if !healer.GetSpell(action).IsReady(sim) {
			t.Fatal("The driver continued activating cooldowns after caster death")
		}
	}
	damage := healer.GetSpell(core.ActionID{SpellID: 16666, Tag: 1})
	kfcPriestNear(t, damage.SpellMetrics[sim.Encounter.TargetUnits[0].UnitIndex].TotalDamage, 0)
}

func kfcResourceCasts(result *KFCHealingWorkloadResult, id core.ActionID) int32 {
	var casts int32
	for _, action := range result.Metrics.Parties[0].Players[0].Actions {
		if action.Id.GetItemId() == id.ItemID && action.Id.GetSpellId() == id.SpellID {
			for _, target := range action.Targets {
				casts += target.Casts
			}
		}
	}
	return casts
}

func TestKFCPriestResourceCooldownWorkloadIntegration(t *testing.T) {
	request := kfcResourceRequest(180)
	before := googleProto.Clone(request)
	frame := kfcTankWorkload(180)
	without, err := RunKFCHealingWorkload(context.Background(), request, frame)
	if err != nil {
		t.Fatal(err)
	}
	frame.Cooldowns = []KFCHealingCooldown{{ItemID: 13444}, {SpellID: 15604, MinimumMissingMana: 630}, {ItemID: 12662}}
	with, err := RunKFCHealingWorkload(context.Background(), request, frame)
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []core.ActionID{{ItemID: 13444}, {SpellID: 15604}, {ItemID: 12662}} {
		if kfcResourceCasts(without, id) != 0 || kfcResourceCasts(with, id) < 1 {
			t.Fatalf("The workload did not honor explicit resource activation: %v", id)
		}
	}
	if !googleProto.Equal(request, before) || with.ClassQualified || with.PublicationAllowed || with.Metrics.Hps.Avg <= without.Metrics.Hps.Avg {
		t.Fatal("Resource workload mutated input, granted admission or failed to improve sustained healing")
	}
	fmt.Printf("KFC_HEALER_RESOURCE_CONTROL %.8f %.8f %.8f\n", without.Metrics.Hps.Avg, with.Metrics.Hps.Avg, with.ManaRemainingMean)
}

func TestKFCPriestResourceCooldownExternalInputs(t *testing.T) {
	jobs := map[string]KFCHealingJob{}
	for _, tc := range []struct {
		name      string
		cooldowns []KFCHealingCooldown
	}{{"resourceNone", nil}, {"resourcePotion", []KFCHealingCooldown{{ItemID: 13444}}}, {"resourceSecondWind", []KFCHealingCooldown{{SpellID: 15604, MinimumMissingMana: 630}}}, {"resourceCombined", []KFCHealingCooldown{{ItemID: 13444}, {SpellID: 15604, MinimumMissingMana: 630}, {ItemID: 12662}}}} {
		frame := kfcTankWorkload(180)
		frame.Cooldowns = tc.cooldowns
		job := kfcHealingProtocolJob(t, "external-"+tc.name, kfcResourceRequest(180), frame, true)
		reply := RunKFCHealingJob(context.Background(), kfcHealingJobJSON(t, job))
		if reply.Status != "complete" || reply.Result == nil || reply.Result.HPS <= 0 {
			t.Fatalf("Resource executor control failed: %+v", reply.Error)
		}
		jobs[tc.name] = job
	}
	encoded, err := json.Marshal(jobs)
	if err != nil {
		t.Fatal(err)
	}
	fmt.Printf("KFC_HEALER_RESOURCE_INPUTS %s\n", encoded)
}
