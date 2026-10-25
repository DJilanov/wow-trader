package holy

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
)

func kfcPaladinHeartPolicy(chance float64, events string) KFCPaladinHealingItemEffectsPolicy {
	return KFCPaladinHealingItemEffectsPolicy{Schema: "kfc-paladin-item-effects-policy.v1", ID: fmt.Sprintf("heart-%g-%s", chance, events), DormantHeartProcChance: &chance, DormantHeartHealingEvents: events}
}

func kfcPaladinHeartFixture(t *testing.T, owned bool) (*core.Simulation, *HolyPaladin, *core.Unit) {
	t.Helper()
	request, _ := kfcPaladinWorkloadControl()
	request.SimOptions.Interactive, request.SimOptions.IsTest = true, true
	request.Encounter.Duration = 180
	player := request.Raid.Parties[0].Players[0]
	player.TalentsString = ""
	player.Equipment = &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
	for index := range player.Equipment.Items {
		player.Equipment.Items[index] = &proto.ItemSpec{}
	}
	if owned {
		player.Equipment.Items[12].Id = 249473
	}
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	healer := sim.Raid.Parties[0].Players[0].(*HolyPaladin)
	positions := map[int32]KFCPaladinFriendlyPosition{}
	for _, unit := range sim.Raid.AllUnits {
		positions[unit.UnitIndex] = KFCPaladinFriendlyPosition{}
	}
	if err := healer.ConfigureKFCPaladinActiveHealing(positions, KFCPaladinVigilSingleRefund); err != nil {
		t.Fatal(err)
	}
	return sim, healer, &sim.Raid.GetFirstTargetDummy().Unit
}

func kfcPaladinHeartRanks(healer *HolyPaladin) []*core.Spell {
	result := []*core.Spell{}
	for _, id := range []int32{635, 639, 647, 1026, 1042, 3472, 10328, 10329, 25292} {
		result = append(result, healer.GetSpell(core.ActionID{SpellID: id}))
	}
	return result
}

func kfcPaladinHeartMeasure(label string, value interface{}) {
	bytes, _ := json.Marshal(value)
	fmt.Printf("KFC_PALADIN_HEART_%s %s\n", label, bytes)
}

func TestKFCPaladinHeartOwnershipAndPolicyValidation(t *testing.T) {
	for _, owned := range []bool{false, true} {
		_, healer, _ := kfcPaladinHeartFixture(t, owned)
		if (healer.GetAura("Paladin Eternal Power") != nil) != owned || (healer.kfcItemEffectsPolicyEcho() != nil) != owned {
			t.Fatal("Dormant Heart ownership/implicit policy changed")
		}
	}
	for _, kind := range []string{"nil", "negative", "large", "nan", "infinite", "events", "schema", "id"} {
		_, healer, _ := kfcPaladinHeartFixture(t, true)
		policy := kfcPaladinHeartPolicy(1, "completed-casts")
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
		if healer.ConfigureKFCPaladinHealingItemEffects(policy) == nil {
			t.Fatal("Invalid Paladin item policy admitted", kind)
		}
	}
}

func TestKFCPaladinHeartExactProbabilityAndStats(t *testing.T) {
	values := []float64{}
	for _, chance := range []float64{0, .02, .05, .1, 1} {
		sim, healer, _ := kfcPaladinHeartFixture(t, true)
		oracle, _, _ := kfcPaladinHeartFixture(t, false)
		if err := healer.ConfigureKFCPaladinHealingItemEffects(kfcPaladinHeartPolicy(chance, "completed-casts")); err != nil {
			t.Fatal(err)
		}
		aura, buff := healer.GetAura("Paladin Dormant Heart trigger"), healer.GetAura("Paladin Eternal Power")
		healing, damage, power := healer.GetStat(stats.HealingPower), healer.GetStat(stats.SpellDamage), healer.GetStat(stats.SpellPower)
		count := 0
		for i := 0; i < 1000; i++ {
			aura.OnCastComplete(aura, sim, healer.GetSpell(core.ActionID{SpellID: 635}))
			expected := chance > 0 && oracle.Proc(chance, "Paladin Eternal Power")
			if buff.IsActive() != expected {
				t.Fatal("Paladin Heart RNG differs from exact seeded oracle")
			}
			if expected {
				count++
				kfcPaladinNear(t, healer.GetStat(stats.HealingPower)-healing, 40)
				kfcPaladinNear(t, healer.GetStat(stats.SpellDamage)-damage, 13)
				kfcPaladinNear(t, healer.GetStat(stats.SpellPower), power)
			}
			buff.Deactivate(sim)
			kfcPaladinNear(t, healer.GetStat(stats.HealingPower), healing)
		}
		values = append(values, chance, float64(count))
	}
	kfcPaladinHeartMeasure("PROBABILITY", values)
}

func TestKFCPaladinHeartOnlyActualHolyLightFamily(t *testing.T) {
	counts := []float64{}
	for _, events := range []string{"completed-casts", "direct-heals"} {
		sim, healer, _ := kfcPaladinHeartFixture(t, true)
		if err := healer.ConfigureKFCPaladinHealingItemEffects(kfcPaladinHeartPolicy(1, events)); err != nil {
			t.Fatal(err)
		}
		aura, buff := healer.GetAura("Paladin Dormant Heart trigger"), healer.GetAura("Paladin Eternal Power")
		count := 0
		for _, spell := range healer.Spellbook {
			isGreater := false
			for _, candidate := range kfcPaladinHeartRanks(healer) {
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
				t.Fatal("Paladin Heart family restriction violated", events, spell.ActionID)
			}
			if buff.IsActive() {
				count++
			}
			buff.Deactivate(sim)
		}
		if count == 0 {
			t.Fatal("No Holy Light ranks admitted")
		}
		counts = append(counts, float64(count))
	}
	kfcPaladinHeartMeasure("FAMILY", counts)
}

func TestKFCPaladinHeartActualRanksAndNextHealCoefficient(t *testing.T) {
	_, reference, _ := kfcPaladinHeartFixture(t, true)
	values := []float64{}
	for _, rank := range kfcPaladinHeartRanks(reference) {
		if rank == nil {
			continue
		}
		heals := [][]float64{}
		for _, chance := range []float64{0, 1} {
			sim, healer, target := kfcPaladinHeartFixture(t, true)
			if err := healer.ConfigureKFCPaladinHealingItemEffects(kfcPaladinHeartPolicy(chance, "completed-casts")); err != nil {
				t.Fatal(err)
			}
			spell := healer.GetSpell(rank.ActionID)
			spell.BonusCritRating = -10000
			amounts := []float64{}
			for cast := 0; cast < 2; cast++ {
				target.RemoveHealth(sim, max(0, target.CurrentHealth()-1))
				before := spell.SpellMetrics[target.UnitIndex].TotalHealing
				if !spell.Cast(sim, target) {
					t.Fatal("Actual Holy Light rank cast failed", rank.ActionID)
				}
				kfcPaladinAdvance(t, sim, sim.CurrentTime+spell.DefaultCast.CastTime)
				amounts = append(amounts, spell.SpellMetrics[target.UnitIndex].TotalHealing-before)
			}
			heals = append(heals, amounts)
		}
		kfcPaladinNear(t, heals[1][0]-heals[0][0], 0)
		kfcPaladinNear(t, heals[1][1]-heals[0][1], 40*rank.BonusCoefficient*rank.DamageMultiplier)
		values = append(values, heals[1][1]-heals[0][1])
	}
	kfcPaladinHeartMeasure("RANK_HEALS", values)
}

func TestKFCPaladinHeartRefreshExpiryAndIterationReset(t *testing.T) {
	sim, healer, target := kfcPaladinHeartFixture(t, true)
	spell := healer.GetSpell(core.ActionID{SpellID: 635})
	spell.BonusCritRating = -10000
	before := healer.GetStat(stats.HealingPower)
	for i := 0; i < 2; i++ {
		if !spell.Cast(sim, target) {
			t.Fatal("Refresh cast failed")
		}
		kfcPaladinAdvance(t, sim, sim.CurrentTime+spell.DefaultCast.CastTime)
		kfcPaladinNear(t, healer.GetStat(stats.HealingPower)-before, 40)
	}
	buff := healer.GetAura("Paladin Eternal Power")
	expiry := buff.ExpiresAt()
	if !healer.GetSpell(core.ActionID{SpellID: 19750}).Cast(sim, target) {
		t.Fatal("Flash of Light refresh-exclusion cast failed")
	}
	kfcPaladinAdvance(t, sim, sim.CurrentTime+1500*time.Millisecond)
	if buff.ExpiresAt() != expiry {
		t.Fatal("Flash of Light refreshed the Holy Light buff")
	}
	kfcPaladinAdvance(t, sim, expiry-time.Millisecond)
	if !buff.IsActive() {
		t.Fatal("Eternal Power expired early")
	}
	kfcPaladinAdvance(t, sim, expiry)
	if buff.IsActive() {
		t.Fatal("Eternal Power did not expire")
	}
	kfcPaladinNear(t, healer.GetStat(stats.HealingPower), before)
	if !spell.Cast(sim, target) {
		t.Fatal("Reset setup cast failed")
	}
	kfcPaladinAdvance(t, sim, sim.CurrentTime+spell.DefaultCast.CastTime)
	sim.Cleanup()
	sim.Reset()
	if buff.IsActive() {
		t.Fatal("Eternal Power leaked across iterations")
	}
	kfcPaladinNear(t, healer.GetStat(stats.HealingPower), before)
}

func TestKFCPaladinHeartPrecombatDeathAndPolicyFreshness(t *testing.T) {
	for _, events := range []string{"completed-casts", "direct-heals"} {
		sim, healer, _ := kfcPaladinHeartFixture(t, true)
		policy := kfcPaladinHeartPolicy(1, events)
		if err := healer.ConfigureKFCPaladinHealingItemEffects(policy); err != nil {
			t.Fatal(err)
		}
		*policy.DormantHeartProcChance = 0
		kfcPaladinNear(t, *healer.kfcResolvedItemEffectsPolicy().DormantHeartProcChance, 1)
		if healer.ConfigureKFCPaladinHealingItemEffects(policy) == nil {
			t.Fatal("Configured item policy changed")
		}
		aura, buff, spell := healer.GetAura("Paladin Dormant Heart trigger"), healer.GetAura("Paladin Eternal Power"), healer.GetSpell(core.ActionID{SpellID: 635})
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
	for _, id := range []int32{635, 19750} {
		sim, healer, target := kfcPaladinHeartFixture(t, true)
		spell := healer.GetSpell(core.ActionID{SpellID: id})
		if !spell.Cast(sim, target) {
			t.Fatal("Policy freshness setup failed")
		}
		kfcPaladinAdvance(t, sim, max(1500*time.Millisecond, spell.DefaultCast.CastTime))
		if healer.ConfigureKFCPaladinHealingItemEffects(kfcPaladinHeartPolicy(0, "completed-casts")) == nil {
			t.Fatal("Policy changed after casting")
		}
	}
}

func TestKFCPaladinHeartActualWorkloadAndWirePolicy(t *testing.T) {
	for _, chance := range []float64{0, .02, .05, .1, 1} {
		request, frame := kfcPaladinWorkloadControl()
		player := request.Raid.Parties[0].Players[0]
		player.Equipment = &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
		for index := range player.Equipment.Items {
			player.Equipment.Items[index] = &proto.ItemSpec{}
		}
		player.Equipment.Items[12].Id = 249473
		frame.Priorities = []KFCPaladinHealingPriority{{SpellID: 635, RaidIndex: 1, MinimumMissingHealth: 1}}
		policy := kfcPaladinHeartPolicy(chance, "completed-casts")
		frame.ItemEffectsPolicy = &policy
		id := fmt.Sprintf("paladin-heart-workload-%g", chance)
		payload := kfcPaladinWorkloadPayload(t, request, frame, id, true)
		reply := RunKFCPaladinHealingJob(context.Background(), payload)
		if reply.Status != "complete" || reply.Result == nil || reply.Result.ItemEffectsPolicy == nil {
			t.Fatalf("Item-policy workload failed: %+v", reply.Error)
		}
		kfcPaladinNear(t, *reply.Result.ItemEffectsPolicy.DormantHeartProcChance, chance)
		var job KFCPaladinHealingJob
		if err := json.Unmarshal(payload, &job); err != nil {
			t.Fatal(err)
		}
		kfcPaladinHeartMeasure("WORKLOAD_REQUEST", job)
		kfcPaladinHeartMeasure("WORKLOAD_RESULT", reply)
		var decoded map[string]interface{}
		if err := json.Unmarshal(payload, &decoded); err != nil {
			t.Fatal(err)
		}
		decoded["workload"].(map[string]interface{})["itemEffectsPolicy"].(map[string]interface{})["extra"] = 1
		bad, _ := json.Marshal(decoded)
		if RunKFCPaladinHealingJob(context.Background(), bad).Status != "error" {
			t.Fatal("Unknown item policy field admitted")
		}
	}
}
