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
)

var kfcSelfSetIDs = map[int32][]int32{
	183: {16698, 16699, 16700, 16701, 16702, 16703, 16704, 16705},
	162: {6473, 10410, 10411, 10412, 10413},
	184: {16707, 16708, 16709, 16710, 16711, 16712, 16713, 16721},
}

func kfcSelfEffectsRequest(t *testing.T, set int32, count int, power float64) *proto.RaidSimRequest {
	t.Helper()
	request := kfcFeralheartRequest(0)
	request.Encounter.Duration = 360
	player := request.Raid.Parties[0].Players[0]
	player.BonusStats = &proto.UnitStats{Stats: stats.Stats{stats.HealingPower: power, stats.Mana: 10000}.ToFloatArray()}
	slots := map[proto.ItemType]int{1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7, 9: 8, 10: 9}
	for _, id := range kfcSelfSetIDs[set][:count] {
		item, exists := core.ItemsByID[id]
		slot, correctType := slots[item.Type]
		if !exists || !correctType || item.SetID != set {
			t.Fatalf("Missing compiled self-effect item %d", id)
		}
		player.Equipment.Items[slot] = &proto.ItemSpec{Id: id}
	}
	return request
}

func kfcSelfEffectsFixture(t *testing.T, set int32, count int, power float64) (*core.Simulation, *RestorationDruid) {
	t.Helper()
	sim := core.NewSim(kfcSelfEffectsRequest(t, set, count, power), simsignals.CreateSignals())
	sim.Reset()
	healer := sim.Raid.Parties[0].Players[0].(*RestorationDruid)
	if err := healer.ConfigureKFCHealingBenchmarkHealth(sim, 3000); err != nil {
		t.Fatal(err)
	}
	return sim, healer
}

func kfcSelfPolicy() KFCDruidSelfEffectsPolicy {
	return KFCDruidSelfEffectsPolicy{Schema: "kfc-druid-self-effects-policy.v1", ID: "self-effects-control", ViperThresholdTiming: "after-hit", VitalityTickMs: 2000}
}

func kfcSelfPolicyApply(t *testing.T, healer *RestorationDruid, policy KFCDruidSelfEffectsPolicy) {
	t.Helper()
	if err := healer.ConfigureKFCDruidSelfEffects(policy); err != nil {
		t.Fatal(err)
	}
}

func kfcSelfDamage(sim *core.Simulation, healer *RestorationDruid, amount float64) {
	incoming := sim.Encounter.TargetUnits[0].GetOrRegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: 1, Tag: 771}, SpellSchool: core.SpellSchoolHoly, ProcMask: core.ProcMaskSpellDamage, DamageMultiplier: 1})
	result := incoming.NewResult(&healer.Unit)
	result.Damage = amount
	result.Outcome = core.OutcomeHit
	incoming.DealDamage(sim, result)
}

func TestKFCDruidSelfEffectsExactThresholds(t *testing.T) {
	for _, entry := range []struct {
		set       int32
		threshold int
	}{{183, 5}, {162, 4}, {184, 6}} {
		for _, count := range []int{entry.threshold - 1, entry.threshold} {
			_, healer := kfcSelfEffectsFixture(t, entry.set, count, 0)
			if healer.selfEffects.hasAny != (count >= entry.threshold) {
				t.Fatal("Self-effect enabled at the wrong exact-set threshold")
			}
			if entry.set == 162 && (healer.selfEffects.viper != nil) != (count >= 4) {
				t.Fatal("Viper threshold mismatch")
			}
		}
	}
}

func TestKFCDruidDreadmistProbabilityCoefficientAndRecursion(t *testing.T) {
	outputs := [][]float64{}
	for _, power := range []float64{0, 1000} {
		sim, healer := kfcSelfEffectsFixture(t, 183, 5, power)
		oracle, _ := kfcSelfEffectsFixture(t, 183, 4, 0)
		healer.RemoveHealth(sim, 1000)
		aura := healer.GetAura("Druid Dreadmist Dark Reward")
		parent := healer.GetSpell(core.ActionID{SpellID: 5185})
		proc := healer.GetSpell(core.ActionID{SpellID: 450583})
		proc.BonusCritRating = 10000
		amounts := []float64{}
		for i := 0; i < 1000; i++ {
			before := healer.CurrentHealth()
			aura.OnCastComplete(aura, sim, parent)
			delta := healer.CurrentHealth() - before
			if oracle.Proc(.05, "Druid Dreadmist Dark Reward") {
				if delta < 270 || delta > 330 {
					t.Fatalf("Invalid flat proc healing %f", delta)
				}
				amounts = append(amounts, delta)
			} else {
				kfcDruidNear(t, delta, 0)
			}
			healer.RemoveHealth(sim, delta)
		}
		before := proc.SpellMetrics[healer.UnitIndex].TotalHealing
		for i := 0; i < 1000; i++ {
			aura.OnCastComplete(aura, sim, proc)
		}
		kfcDruidNear(t, proc.SpellMetrics[healer.UnitIndex].TotalHealing, before)
		outputs = append(outputs, amounts)
	}
	if len(outputs[0]) != len(outputs[1]) || len(outputs[0]) == 0 {
		t.Fatal("Dreadmist proc count changed with healing power")
	}
	for index := range outputs[0] {
		kfcDruidNear(t, outputs[0][index], outputs[1][index])
	}
	kfcDruidAdvancedResult("SELF_DREADMIST", outputs[0])
}

func TestKFCDruidDreadmistCritPolicy(t *testing.T) {
	amounts := []float64{}
	for _, crits := range []bool{false, true} {
		sim, healer := kfcSelfEffectsFixture(t, 183, 5, 0)
		policy := kfcSelfPolicy()
		policy.DreadmistCrits = crits
		kfcSelfPolicyApply(t, healer, policy)
		healer.RemoveHealth(sim, 1000)
		proc := healer.GetSpell(core.ActionID{SpellID: 450583})
		proc.BonusCritRating = 10000
		aura := healer.GetAura("Druid Dreadmist Dark Reward")
		parent := healer.GetSpell(core.ActionID{SpellID: 5185})
		for i := 0; i < 1000 && proc.SpellMetrics[healer.UnitIndex].TotalHealing == 0; i++ {
			aura.OnCastComplete(aura, sim, parent)
		}
		amounts = append(amounts, proc.SpellMetrics[healer.UnitIndex].TotalHealing)
	}
	kfcDruidNear(t, amounts[1], amounts[0]*1.5)
	kfcDruidAdvancedResult("SELF_DREADMIST_CRITS", amounts)
}

func TestKFCDruidViperHitTimingThresholdAndTicks(t *testing.T) {
	output := []float64{}
	for _, timing := range []string{"after-hit", "before-hit"} {
		for _, beforeHealth := range []float64{900, 750} {
			sim, healer := kfcSelfEffectsFixture(t, 162, 4, 1000)
			policy := kfcSelfPolicy()
			policy.ViperThresholdTiming = timing
			kfcSelfPolicyApply(t, healer, policy)
			healer.RemoveHealth(sim, 3000-beforeHealth)
			healer.SpendMana(sim, 1000, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 91}))
			kfcSelfDamage(sim, healer, 200)
			kfcDruidNear(t, healer.CurrentHealth(), beforeHealth-200)
			wantProc := timing == "after-hit" || beforeHealth <= 750
			if healer.selfEffects.viper.Hot(&healer.Unit).IsActive() != wantProc {
				t.Fatal("Low-health timing/threshold changed")
			}
			spell := healer.selfEffects.viper
			spell.BonusCritRating = 10000
			kfcDruidAdvance(t, sim, 5*time.Second)
			want := 0.0
			if wantProc {
				want = 100
			}
			kfcDruidNear(t, healer.CurrentHealth(), beforeHealth-200+want)
			metric := spell.SpellMetrics[healer.UnitIndex]
			kfcDruidNear(t, metric.TotalHealing, want)
			mana := 0.0
			for _, resource := range healer.Metrics.ToProto().Resources {
				if resource.Id.GetSpellId() == 1291797 && resource.Type == proto.ResourceType_ResourceTypeMana {
					mana += resource.ActualGain
				}
			}
			kfcDruidNear(t, mana, want)
			if metric.CritTicks != 0 {
				t.Fatal("Fixed Viper resource ticks crit")
			}
			output = append(output, beforeHealth, metric.TotalHealing)
		}
	}
	kfcDruidAdvancedResult("SELF_VIPER_TIMING", output)
}

func TestKFCDruidViperCooldownDeathAndReset(t *testing.T) {
	sim, healer := kfcSelfEffectsFixture(t, 162, 4, 0)
	healer.RemoveHealth(sim, 2300)
	kfcSelfDamage(sim, healer, 1)
	if healer.selfEffects.viperICD.ReadyAt() != 5*time.Minute {
		t.Fatal("Wrong five-minute Viper cooldown")
	}
	kfcDruidAdvance(t, sim, time.Second)
	kfcSelfDamage(sim, healer, 1)
	kfcDruidAdvance(t, sim, 6*time.Second)
	kfcDruidNear(t, healer.selfEffects.viper.SpellMetrics[healer.UnitIndex].TotalHealing, 100)
	kfcDruidAdvance(t, sim, 299*time.Second)
	kfcSelfDamage(sim, healer, 1)
	if healer.selfEffects.viper.Hot(&healer.Unit).IsActive() {
		t.Fatal("Viper cooldown bypassed")
	}
	kfcDruidAdvance(t, sim, 300*time.Second)
	healer.RemoveHealth(sim, healer.CurrentHealth()-700)
	kfcSelfDamage(sim, healer, 1)
	if !healer.selfEffects.viper.Hot(&healer.Unit).IsActive() {
		t.Fatal("Viper cooldown did not expire")
	}
	kfcSelfDamage(sim, healer, healer.CurrentHealth())
	kfcDruidAdvance(t, sim, 302*time.Second)
	kfcDruidNear(t, healer.CurrentHealth(), 0)
	if !healer.Metrics.Died {
		t.Fatal("Caster death not recorded")
	}
	sim.Cleanup()
	sim.Reset()
	if !healer.selfEffects.viperICD.IsReady(sim) || healer.selfEffects.viper.Hot(&healer.Unit).IsActive() {
		t.Fatal("Viper leaked across iterations")
	}
	kfcDruidAdvancedResult("SELF_VIPER_RESET", true)
}

func TestKFCDruidVitalityCombatCadenceAndDeath(t *testing.T) {
	output := []float64{}
	for _, cadence := range []int{2000, 5000} {
		sim := core.NewSim(kfcSelfEffectsRequest(t, 184, 6, 1000), simsignals.CreateSignals())
		healer := sim.Raid.Parties[0].Players[0].(*RestorationDruid)
		policy := kfcSelfPolicy()
		policy.VitalityTickMs = cadence
		kfcSelfPolicyApply(t, healer, policy)
		sim.Reset()
		if err := healer.ConfigureKFCHealingBenchmarkHealth(sim, 3000); err != nil {
			t.Fatal(err)
		}
		healer.RemoveHealth(sim, 500)
		kfcDruidAdvance(t, sim, 2*time.Second)
		want := 2500.0
		if cadence == 2000 {
			want += 6
		}
		kfcDruidNear(t, healer.CurrentHealth(), want)
		kfcDruidAdvance(t, sim, 10*time.Second)
		kfcDruidNear(t, healer.CurrentHealth(), 2530)
		kfcDruidNear(t, healer.kfcSelfRegenerationForIteration(), 30)
		kfcSelfDamage(sim, healer, healer.CurrentHealth())
		kfcDruidAdvance(t, sim, 15*time.Second)
		kfcDruidNear(t, healer.CurrentHealth(), 0)
		output = append(output, float64(cadence), healer.kfcSelfRegenerationForIteration())
	}
	kfcDruidAdvancedResult("SELF_VITALITY", output)
}

func TestKFCDruidSelfPolicyAndCasterDamageContracts(t *testing.T) {
	for _, kind := range []string{"schema", "timing", "cadence", "id"} {
		_, healer := kfcSelfEffectsFixture(t, 162, 4, 0)
		policy := kfcSelfPolicy()
		switch kind {
		case "schema":
			policy.Schema = "other"
		case "timing":
			policy.ViperThresholdTiming = "guaranteed"
		case "cadence":
			policy.VitalityTickMs = 1
		case "id":
			policy.ID = ""
		}
		if healer.ConfigureKFCDruidSelfEffects(policy) == nil {
			t.Fatal("Invalid self policy accepted")
		}
	}
	_, healer := kfcSelfEffectsFixture(t, 162, 4, 0)
	policy := kfcSelfPolicy()
	kfcSelfPolicyApply(t, healer, policy)
	policy.VitalityTickMs = 5000
	if healer.kfcResolvedSelfEffectsPolicy().VitalityTickMs != 2000 || healer.ConfigureKFCDruidSelfEffects(policy) == nil {
		t.Fatal("Policy ownership/freshness failed")
	}
	request, frame := kfcDruidWorkloadControl()
	request.Encounter.Duration = 12
	frame.Damage = []KFCDruidHealingDamageEvent{{AtMS: 1000, RaidIndex: 0, Amount: 200}, {AtMS: 2000, RaidIndex: 1, Amount: 500}}
	frame.Targets[0].MaximumHealth = 1000
	frame.Priorities = []KFCDruidHealingPriority{{SpellID: 774, RaidIndex: 0, MinimumMissingHealth: 100, KeepHot: true}, {SpellID: 9889, RaidIndex: 1, MinimumMissingHealth: 100}}
	if reply := RunKFCDruidHealingJob(context.Background(), kfcDruidControlPayload(t, request, frame, "caster-not-opted-in", false)); reply.Status != "error" {
		t.Fatal("Caster damage admitted without opt-in")
	}
	frame.AllowCasterDamage = true
	reply := RunKFCDruidHealingJob(context.Background(), kfcDruidControlPayload(t, request, frame, "caster-opted-in", false))
	if reply.Status != "complete" || reply.Result.SurvivalRate != 1 || !reply.Result.CasterDamageEnabled {
		t.Fatalf("Caster workload failed: %+v", reply)
	}
	frame.Damage = []KFCDruidHealingDamageEvent{{AtMS: 0, RaidIndex: 1, Amount: 5000}, {AtMS: 1000, RaidIndex: 0, Amount: 1000}, {AtMS: 2000, RaidIndex: 1, Amount: 100}}
	reply = RunKFCDruidHealingJob(context.Background(), kfcDruidControlPayload(t, request, frame, "caster-killed-during-cast", false))
	if reply.Status != "complete" || reply.Result.SurvivalRate != 0 || reply.Result.HPS != 0 {
		t.Fatalf("Caster death allowed ghost healing: %+v", reply)
	}
	kfcDruidAdvancedResult("SELF_CASTER_DEATH", reply.Result.SurvivalRate)
}

func TestKFCDruidSelfEquippedWorkloadsAndPolicyEcho(t *testing.T) {
	policies := []KFCDruidSelfEffectsPolicy{kfcSelfPolicy(), kfcSelfPolicy(), kfcSelfPolicy(), kfcSelfPolicy()}
	policies[1].ID = "before-hit"
	policies[1].ViperThresholdTiming = "before-hit"
	policies[2].ID = "five-second"
	policies[2].VitalityTickMs = 5000
	policies[3].ID = "crit"
	policies[3].DreadmistCrits = true
	for _, set := range []int32{183, 162, 184} {
		for index, policy := range policies {
			threshold := map[int32]int{183: 5, 162: 4, 184: 6}[set]
			request, frame := kfcDruidWorkloadControl()
			request.Encounter.Duration = 12
			player := request.Raid.Parties[0].Players[0]
			player.BonusStats = nil
			player.Equipment = kfcSelfEffectsRequest(t, set, threshold, 0).Raid.Parties[0].Players[0].Equipment
			for slot, id := range kfcDruidEquippedControlIds {
				if player.Equipment.Items[slot].Id == 0 {
					player.Equipment.Items[slot] = &proto.ItemSpec{Id: id}
				}
			}
			player.Equipment.Items[16].Id = 22398
			frame.AllowCasterDamage = true
			frame.SelfEffectsPolicy = &policy
			frame.Targets[0].MaximumHealth = 1000
			frame.Damage = []KFCDruidHealingDamageEvent{{AtMS: 1000, RaidIndex: 0, Amount: 750}, {AtMS: 2000, RaidIndex: 1, Amount: 500}}
			frame.Priorities = []KFCDruidHealingPriority{{SpellID: 774, RaidIndex: 0, MinimumMissingHealth: 100, KeepHot: true}, {SpellID: 9889, RaidIndex: 1, MinimumMissingHealth: 100}}
			payload := kfcDruidControlPayload(t, request, frame, fmt.Sprintf("self-effects-%d-%d", set, index), false)
			reply := RunKFCDruidHealingJob(context.Background(), payload)
			if reply.Status != "complete" || reply.Result == nil || reply.Result.SurvivalRate != 1 || reply.Result.SelfEffectsPolicy == nil || reply.Result.SelfEffectsPolicy.ID != policy.ID {
				t.Fatalf("Equipped self-effects workload failed: %+v", reply)
			}
			kfcDruidAdvancedResult("SELF_EQUIPPED_REQUEST", json.RawMessage(payload))
			kfcDruidAdvancedResult("SELF_EQUIPPED_RESULT", reply)
		}
	}
}
