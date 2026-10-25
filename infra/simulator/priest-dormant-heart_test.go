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
	"github.com/wowsims/classic/sim/core/stats"
	"github.com/wowsims/classic/sim/priest"
)

func kfcPriestHeartPolicy(chance float64, events string) KFCHealingItemEffectsPolicy {
	return KFCHealingItemEffectsPolicy{Schema: "kfc-priest-item-effects-policy.v1", ID: fmt.Sprintf("heart-%g-%s", chance, events), DormantHeartProcChance: &chance, DormantHeartHealingEvents: events}
}

func kfcPriestHeartFixture(t *testing.T, owned bool) (*core.Simulation, *HealingPriest, *core.Unit) {
	t.Helper()
	request := kfcWorkloadRequest(100000, 1, 120)
	player := request.Raid.Parties[0].Players[0]
	player.TalentsString = kfcItemTalents(&proto.PriestTalents{})
	player.Rotation = &proto.APLRotation{Type: proto.APLRotation_TypeAPL}
	player.Equipment = kfcItemEquipment()
	if owned {
		player.Equipment.Items[12].Id = 249473
	}
	request.SimOptions.Interactive, request.SimOptions.IsTest = true, true
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	healer := sim.Raid.Parties[0].Players[0].(*HealingPriest)
	positions := map[int32]priest.KFCFriendlyPosition{}
	for _, unit := range sim.Raid.AllUnits {
		positions[unit.UnitIndex] = priest.KFCFriendlyPosition{}
	}
	if err := healer.ConfigureKFCFriendlyPositions(positions); err != nil {
		t.Fatal(err)
	}
	return sim, healer, &sim.Raid.GetFirstTargetDummy().Unit
}

func kfcPriestHeartMeasure(label string, value interface{}) {
	bytes, _ := json.Marshal(value)
	fmt.Printf("KFC_PRIEST_HEART_%s %s\n", label, bytes)
}

func TestKFCPriestHeartOwnershipAndPolicyValidation(t *testing.T) {
	for _, owned := range []bool{false, true} {
		_, healer, _ := kfcPriestHeartFixture(t, owned)
		if (healer.GetAura("Priest Eternal Power") != nil) != owned || (healer.kfcItemEffectsPolicyEcho() != nil) != owned {
			t.Fatal("Dormant Heart ownership/implicit policy changed")
		}
	}
	for _, kind := range []string{"nil", "negative", "large", "nan", "infinite", "events", "schema", "id"} {
		_, healer, _ := kfcPriestHeartFixture(t, true)
		policy := kfcPriestHeartPolicy(1, "completed-casts")
		switch kind {
		case "nil":
			policy.DormantHeartProcChance = nil
		case "negative":
			*policy.DormantHeartProcChance = -1
		case "large":
			*policy.DormantHeartProcChance = 1.1
		case "nan":
			*policy.DormantHeartProcChance = math.NaN()
		case "infinite":
			*policy.DormantHeartProcChance = math.Inf(1)
		case "events":
			policy.DormantHeartHealingEvents = "periodic"
		case "schema":
			policy.Schema = "other"
		case "id":
			policy.ID = ""
		}
		if healer.ConfigureKFCHealingItemEffects(policy) == nil {
			t.Fatal("Invalid Priest item policy admitted", kind)
		}
	}
}

func TestKFCPriestHeartExactProbabilityAndStats(t *testing.T) {
	values := []float64{}
	for _, chance := range []float64{0, .02, .05, .1, 1} {
		sim, healer, _ := kfcPriestHeartFixture(t, true)
		oracle, _, _ := kfcPriestHeartFixture(t, false)
		if err := healer.ConfigureKFCHealingItemEffects(kfcPriestHeartPolicy(chance, "completed-casts")); err != nil {
			t.Fatal(err)
		}
		aura, buff := healer.GetAura("Priest Dormant Heart trigger"), healer.GetAura("Priest Eternal Power")
		healing, damage, power := healer.GetStat(stats.HealingPower), healer.GetStat(stats.SpellDamage), healer.GetStat(stats.SpellPower)
		count := 0
		for i := 0; i < 1000; i++ {
			aura.OnCastComplete(aura, sim, healer.GreaterHeal[1])
			expected := chance > 0 && oracle.Proc(chance, "Priest Eternal Power")
			if buff.IsActive() != expected {
				t.Fatal("Priest Heart RNG differs from exact seeded oracle")
			}
			if expected {
				count++
				kfcPriestNear(t, healer.GetStat(stats.HealingPower)-healing, 40)
				kfcPriestNear(t, healer.GetStat(stats.SpellDamage)-damage, 13)
				kfcPriestNear(t, healer.GetStat(stats.SpellPower), power)
			}
			buff.Deactivate(sim)
			kfcPriestNear(t, healer.GetStat(stats.HealingPower), healing)
		}
		values = append(values, chance, float64(count))
	}
	kfcPriestHeartMeasure("PROBABILITY", values)
}

func TestKFCPriestHeartOnlyActualGreaterHealFamily(t *testing.T) {
	counts := []float64{}
	for _, events := range []string{"completed-casts", "direct-heals"} {
		sim, healer, _ := kfcPriestHeartFixture(t, true)
		if err := healer.ConfigureKFCHealingItemEffects(kfcPriestHeartPolicy(1, events)); err != nil {
			t.Fatal(err)
		}
		aura, buff := healer.GetAura("Priest Dormant Heart trigger"), healer.GetAura("Priest Eternal Power")
		count := 0
		for _, spell := range healer.Spellbook {
			isGreater := false
			for _, candidate := range healer.GreaterHeal {
				isGreater = isGreater || (candidate != nil && candidate == spell)
			}
			if events == "completed-casts" {
				aura.OnCastComplete(aura, sim, spell)
			} else {
				result := spell.NewResult(&healer.Unit)
				result.DirectDamageOrHealing = true
				aura.OnHealDealt(aura, sim, spell, result)
				spell.DisposeResult(result)
			}
			if buff.IsActive() != isGreater {
				t.Fatal("Priest Heart family restriction violated", events, spell.ActionID)
			}
			if buff.IsActive() {
				count++
			}
			buff.Deactivate(sim)
		}
		if count == 0 {
			t.Fatal("No Greater Heal ranks admitted")
		}
		counts = append(counts, float64(count))
	}
	kfcPriestHeartMeasure("FAMILY", counts)
}

func TestKFCPriestHeartActualRanksAndNextHealCoefficient(t *testing.T) {
	_, reference, _ := kfcPriestHeartFixture(t, true)
	values := []float64{}
	for _, rank := range reference.GreaterHeal {
		if rank == nil {
			continue
		}
		heals := [][]float64{}
		for _, chance := range []float64{0, 1} {
			sim, healer, target := kfcPriestHeartFixture(t, true)
			if err := healer.ConfigureKFCHealingItemEffects(kfcPriestHeartPolicy(chance, "completed-casts")); err != nil {
				t.Fatal(err)
			}
			spell := healer.GetSpell(rank.ActionID)
			spell.BonusCritRating = -10000
			amounts := []float64{}
			for cast := 0; cast < 2; cast++ {
				target.RemoveHealth(sim, max(0, target.CurrentHealth()-1))
				before := spell.SpellMetrics[target.UnitIndex].TotalHealing
				if !spell.Cast(sim, target) {
					t.Fatal("Actual Greater Heal rank cast failed", rank.ActionID)
				}
				kfcPriestAdvance(t, sim, sim.CurrentTime+spell.DefaultCast.CastTime)
				amounts = append(amounts, spell.SpellMetrics[target.UnitIndex].TotalHealing-before)
			}
			heals = append(heals, amounts)
		}
		kfcPriestNear(t, heals[1][0]-heals[0][0], 0)
		kfcPriestNear(t, heals[1][1]-heals[0][1], 40*rank.BonusCoefficient*rank.DamageMultiplier)
		values = append(values, heals[1][1]-heals[0][1])
	}
	kfcPriestHeartMeasure("RANK_HEALS", values)
}

func TestKFCPriestHeartRefreshExpiryAndIterationReset(t *testing.T) {
	sim, healer, target := kfcPriestHeartFixture(t, true)
	spell := healer.GreaterHeal[1]
	spell.BonusCritRating = -10000
	before := healer.GetStat(stats.HealingPower)
	for i := 0; i < 2; i++ {
		if !spell.Cast(sim, target) {
			t.Fatal("Refresh cast failed")
		}
		kfcPriestAdvance(t, sim, sim.CurrentTime+spell.DefaultCast.CastTime)
		kfcPriestNear(t, healer.GetStat(stats.HealingPower)-before, 40)
	}
	buff := healer.GetAura("Priest Eternal Power")
	expiry := buff.ExpiresAt()
	if !healer.Renew[1].Cast(sim, target) {
		t.Fatal("Renew refresh-exclusion cast failed")
	}
	kfcPriestAdvance(t, sim, sim.CurrentTime+1500*time.Millisecond)
	if buff.ExpiresAt() != expiry {
		t.Fatal("Renew refreshed the Greater Heal buff")
	}
	kfcPriestAdvance(t, sim, expiry-time.Millisecond)
	if !buff.IsActive() {
		t.Fatal("Eternal Power expired early")
	}
	kfcPriestAdvance(t, sim, expiry)
	if buff.IsActive() {
		t.Fatal("Eternal Power did not expire")
	}
	kfcPriestNear(t, healer.GetStat(stats.HealingPower), before)
	if !spell.Cast(sim, target) {
		t.Fatal("Reset setup cast failed")
	}
	kfcPriestAdvance(t, sim, sim.CurrentTime+spell.DefaultCast.CastTime)
	sim.Cleanup()
	sim.Reset()
	if buff.IsActive() {
		t.Fatal("Eternal Power leaked across iterations")
	}
	kfcPriestNear(t, healer.GetStat(stats.HealingPower), before)
}

func TestKFCPriestHeartPrecombatDeathAndPolicyFreshness(t *testing.T) {
	for _, events := range []string{"completed-casts", "direct-heals"} {
		sim, healer, _ := kfcPriestHeartFixture(t, true)
		policy := kfcPriestHeartPolicy(1, events)
		if err := healer.ConfigureKFCHealingItemEffects(policy); err != nil {
			t.Fatal(err)
		}
		*policy.DormantHeartProcChance = 0
		kfcPriestNear(t, *healer.kfcResolvedItemEffectsPolicy().DormantHeartProcChance, 1)
		if healer.ConfigureKFCHealingItemEffects(policy) == nil {
			t.Fatal("Configured item policy changed")
		}
		aura, buff, spell := healer.GetAura("Priest Dormant Heart trigger"), healer.GetAura("Priest Eternal Power"), healer.GreaterHeal[1]
		for _, phase := range []string{"precombat", "dead"} {
			if phase == "precombat" {
				sim.CurrentTime = -time.Second
			} else {
				sim.CurrentTime = 0
				healer.RemoveHealth(sim, healer.CurrentHealth())
			}
			aura.OnCastComplete(aura, sim, spell)
			result := spell.NewResult(&healer.Unit)
			result.DirectDamageOrHealing = true
			aura.OnHealDealt(aura, sim, spell, result)
			spell.DisposeResult(result)
			if buff.IsActive() {
				t.Fatal("Ineligible caster triggered Heart", phase)
			}
		}
		sim.CurrentTime = 0
	}
	for _, id := range []int32{2060, 139} {
		sim, healer, target := kfcPriestHeartFixture(t, true)
		spell := healer.GetSpell(core.ActionID{SpellID: id})
		if !spell.Cast(sim, target) {
			t.Fatal("Policy freshness setup failed")
		}
		kfcPriestAdvance(t, sim, max(1500*time.Millisecond, spell.DefaultCast.CastTime))
		if healer.ConfigureKFCHealingItemEffects(kfcPriestHeartPolicy(0, "completed-casts")) == nil {
			t.Fatal("Policy changed after casting")
		}
	}
}

func TestKFCPriestHeartActualWorkloadAndWirePolicy(t *testing.T) {
	for _, chance := range []float64{0, .02, .05, .1, 1} {
		request := kfcWorkloadRequest(100000, 2, 30)
		request.Raid.Parties[0].Players[0].Equipment = kfcItemEquipment()
		request.Raid.Parties[0].Players[0].Equipment.Items[12].Id = 249473
		frame := kfcTankWorkload(30)
		frame.Priorities = []KFCHealingPriority{{SpellID: 2060, RaidIndex: 1, MinimumMissingHealth: 100}}
		policy := kfcPriestHeartPolicy(chance, "completed-casts")
		frame.ItemEffectsPolicy = &policy
		job := kfcHealingProtocolJob(t, fmt.Sprintf("priest-heart-workload-%g", chance), request, frame, true)
		reply := RunKFCHealingJob(context.Background(), kfcHealingJobJSON(t, job))
		if reply.Status != "complete" || reply.Result == nil || reply.Result.ItemEffectsPolicy == nil {
			t.Fatalf("Item-policy workload failed: %+v", reply.Error)
		}
		kfcPriestNear(t, *reply.Result.ItemEffectsPolicy.DormantHeartProcChance, chance)
		kfcPriestHeartMeasure("WORKLOAD_REQUEST", job)
		kfcPriestHeartMeasure("WORKLOAD_RESULT", reply)
		bad := kfcHealingJobJSON(t, job)
		var decoded map[string]interface{}
		if err := json.Unmarshal(bad, &decoded); err != nil {
			t.Fatal(err)
		}
		decoded["workload"].(map[string]interface{})["itemEffectsPolicy"].(map[string]interface{})["extra"] = 1
		payload, _ := json.Marshal(decoded)
		if RunKFCHealingJob(context.Background(), payload).Status != "error" {
			t.Fatal("Unknown item policy field admitted")
		}
	}
}
