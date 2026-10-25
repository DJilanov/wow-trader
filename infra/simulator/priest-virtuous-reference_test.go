package healing

import (
	"fmt"
	"math"
	"reflect"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
)

func virtuousReferenceEquipment(pieces int, setID int32) core.Equipment {
	var equipment core.Equipment
	for index := 0; index < pieces; index++ {
		equipment[index] = core.Item{ID: int32(22078 + index), SetID: setID, SetName: "localized set name"}
	}
	return equipment
}

func TestKFCVirtuousReferenceThresholds(t *testing.T) {
	for pieces := 0; pieces <= 8; pieces++ {
		t.Run(fmt.Sprint(pieces), func(t *testing.T) {
			equipment := virtuousReferenceEquipment(pieces, 514)
			before := equipment
			got := core.ForeverVirtuousPassiveStats(equipment, proto.Ruleset_RulesetForever)
			var expected stats.Stats
			if pieces >= 2 {
				for _, stat := range []stats.Stat{stats.ArcaneResistance, stats.FireResistance, stats.FrostResistance, stats.NatureResistance, stats.ShadowResistance} {
					expected[stat] = 8
				}
			}
			if pieces >= 6 {
				expected[stats.SpellPower] = 23
			}
			if pieces >= 8 {
				expected[stats.BonusArmor] = 200
			}
			if got != expected || !reflect.DeepEqual(before, equipment) {
				t.Fatal("incorrect thresholds or mutated equipment", got)
			}
		})
	}
	for _, setID := range []int32{0, 182, 1675, 513} {
		if got := core.ForeverVirtuousPassiveStats(virtuousReferenceEquipment(8, setID), proto.Ruleset_RulesetForever); got != (stats.Stats{}) {
			t.Fatal("unrelated or same-name alternate set received base bonuses", setID, got)
		}
	}
	if got := core.ForeverVirtuousPassiveStats(virtuousReferenceEquipment(8, 514), proto.Ruleset_RulesetClassic); got != (stats.Stats{}) {
		t.Fatal("Forever passive reference changed Classic", got)
	}
	mixed := virtuousReferenceEquipment(8, 1675)
	for index := 0; index < 3; index++ {
		mixed[index].SetID = 514
	}
	if got := core.ForeverVirtuousPassiveStats(mixed, proto.Ruleset_RulesetForever); got[stats.SpellPower] != 0 || got[stats.MP5] != 0 || got[stats.ArcaneResistance] != 8 {
		t.Fatal("mixed-set pieces crossed a base threshold", got)
	}
}

// Direct, landed events are a controlled reference mapping, not a server claim.
func virtuousReferenceEligible(spell *core.Spell, result *core.SpellResult) bool {
	return spell.ProcMask.Matches(core.ProcMaskDirect) && result.Landed()
}

var virtuousReferenceInitialization sync.Once
var virtuousReferencePolicies sync.Map
var virtuousReferenceSequence atomic.Uint64

func virtuousReferenceFixture(t *testing.T, multiplier, power float64) (*core.Simulation, *HealingPriest, *core.Spell, *core.Aura, *core.Spell) {
	t.Helper()
	virtuousReferenceInitialization.Do(func() {
		// The existing belt is only a test-time initialization hook. Its stats and
		// set metadata are unchanged; ordinary characters do not receive a shield.
		core.NewItemEffect(16696, func(agent core.Agent) {
			character := agent.GetCharacter()
			if policy, ok := virtuousReferencePolicies.Load(character.Name); ok {
				core.RegisterForeverVirtuousShieldReference(character, policy.(core.ForeverVirtuousShieldReferencePolicy))
			}
		})
	})
	request := kfcWorkloadRequest(10000, 1, 120)
	name := fmt.Sprintf("Virtuous reference control %d", virtuousReferenceSequence.Add(1))
	virtuousReferencePolicies.Store(name, core.ForeverVirtuousShieldReferencePolicy{
		EligibleIncoming: virtuousReferenceEligible, FamilyMultiplier: multiplier,
	})
	defer virtuousReferencePolicies.Delete(name)
	request.Raid.Parties[0].Players[0].Name = name
	request.Raid.Parties[0].Players[0].Equipment = kfcItemEquipment()
	request.Raid.Parties[0].Players[0].Equipment.Items[7] = &proto.ItemSpec{Id: 16696}
	request.Raid.Parties[0].Players[0].BonusStats = &proto.UnitStats{Stats: stats.Stats{stats.SpellPower: power, stats.Mana: 10000}.ToFloatArray()}
	request.Raid.Parties[0].Players[0].Rotation = &proto.APLRotation{Type: proto.APLRotation_TypeAPL}
	request.SimOptions.Interactive, request.SimOptions.IsTest = true, true
	sim := core.NewSim(request, simsignals.CreateSignals())
	healer := sim.Raid.Parties[0].Players[0].(*HealingPriest)
	shield := healer.GetSpell(core.ActionID{SpellID: 27779})
	trigger := healer.GetAura("Virtuous incoming shield reference")
	if shield == nil || trigger == nil {
		t.Fatal("reference component was not installed during character initialization")
	}
	incoming := sim.Encounter.TargetUnits[0].RegisterSpell(core.SpellConfig{
		ActionID: core.ActionID{SpellID: 1, Tag: 514}, SpellSchool: core.SpellSchoolPhysical,
		ProcMask: core.ProcMaskMeleeMHAuto, DamageMultiplier: 1,
	})
	sim.Reset()
	return sim, healer, shield, trigger, incoming
}

func virtuousReferenceDamage(sim *core.Simulation, incoming *core.Spell, target *core.Unit, amount float64) {
	result := incoming.NewResult(target)
	result.Damage, result.Outcome = amount, core.OutcomeHit
	incoming.DealDamage(sim, result)
}

func TestKFCVirtuousReferenceCapacityAndAccounting(t *testing.T) {
	for _, policy := range []struct{ multiplier, power float64 }{{1, 0}, {1, 1000}, {1.2, 1000}} {
		t.Run(fmt.Sprintf("%g/%g", policy.multiplier, policy.power), func(t *testing.T) {
			sim, healer, shield, trigger, incoming := virtuousReferenceFixture(t, policy.multiplier, policy.power)
			trigger.Deactivate(sim)
			mana, health := healer.CurrentMana(), healer.CurrentHealth()
			if !shield.Cast(sim, &healer.Unit) {
				t.Fatal("reference shield failed to apply")
			}
			capacity := 488 * policy.multiplier
			kfcPriestNear(t, shield.SelfShield().RemainingAbsorb(), capacity)
			virtuousReferenceDamage(sim, incoming, &healer.Unit, 100)
			kfcPriestNear(t, shield.SelfShield().RemainingAbsorb(), capacity-100)
			kfcPriestNear(t, healer.CurrentHealth(), health)
			if !shield.Cast(sim, &healer.Unit) {
				t.Fatal("reference shield failed to replace the remaining pool")
			}
			kfcPriestNear(t, shield.SelfShield().RemainingAbsorb(), capacity)
			virtuousReferenceDamage(sim, incoming, &healer.Unit, capacity+50)
			kfcPriestNear(t, healer.CurrentHealth(), health-50)
			if shield.SelfShield().IsActive() {
				t.Fatal("depleted shield remained active")
			}
			metrics := shield.SpellMetrics[healer.UnitIndex]
			kfcPriestNear(t, metrics.TotalShielding, 2*capacity)
			kfcPriestNear(t, metrics.TotalAbsorbedShielding, capacity+100)
			kfcPriestNear(t, metrics.TotalHealing, 0)
			kfcPriestNear(t, metrics.TotalEffectiveHealing, 0)
			kfcPriestNear(t, healer.CurrentMana(), mana)
			if !healer.GCD.IsReady(sim) {
				t.Fatal("item-owned shield consumed the global cooldown")
			}
		})
	}
}

func TestKFCVirtuousReferenceExpirationAndReset(t *testing.T) {
	sim, healer, shield, trigger, _ := virtuousReferenceFixture(t, 1, 500)
	trigger.Deactivate(sim)
	shield.Cast(sim, &healer.Unit)
	kfcPriestAdvance(t, sim, 30*time.Second-time.Nanosecond)
	if !shield.SelfShield().IsActive() {
		t.Fatal("shield expired before its sourced duration")
	}
	kfcPriestAdvance(t, sim, 30*time.Second)
	if shield.SelfShield().IsActive() || shield.SelfShield().RemainingAbsorb() != 0 {
		t.Fatal("shield survived its sourced duration")
	}
	shield.Cast(sim, &healer.Unit)
	sim.Cleanup()
	sim.Reset()
	if shield.SelfShield().IsActive() || shield.SelfShield().RemainingAbsorb() != 0 || !trigger.IsActive() || !trigger.Icd.IsReady(sim) {
		t.Fatal("shield or proc state leaked across iterations")
	}
}

func TestKFCVirtuousReferenceChanceAndCooldown(t *testing.T) {
	sim, healer, shield, trigger, incoming := virtuousReferenceFixture(t, 1, 0)
	result := &core.SpellResult{Target: &healer.Unit, Damage: 1, Outcome: core.OutcomeHit}
	procs := 0
	for attempt := 0; attempt < 5000; attempt++ {
		// Isolate chance from cooldown; the real sixty-second gate is tested below.
		trigger.Icd.Timer.Set(0)
		before := shield.SpellMetrics[healer.UnitIndex].Casts
		trigger.OnSpellHitTaken(trigger, sim, incoming, result)
		if shield.SpellMetrics[healer.UnitIndex].Casts > before {
			procs++
		}
	}
	if procs < 60 || procs > 150 {
		t.Fatal("sourced two-percent chance was not preserved", procs)
	}
	for attempt := 0; attempt < 10000 && trigger.Icd.IsReady(sim); attempt++ {
		trigger.OnSpellHitTaken(trigger, sim, incoming, result)
	}
	if trigger.Icd.IsReady(sim) {
		t.Fatal("reference did not reach a proc for the cooldown control")
	}
	before := shield.SpellMetrics[healer.UnitIndex].Casts
	sim.CurrentTime = 60*time.Second - time.Nanosecond
	for attempt := 0; attempt < 5000; attempt++ {
		trigger.OnSpellHitTaken(trigger, sim, incoming, result)
	}
	if shield.SpellMetrics[healer.UnitIndex].Casts != before {
		t.Fatal("incoming event bypassed the sixty-second internal cooldown")
	}
	sim.CurrentTime = 60 * time.Second
	if !trigger.Icd.IsReady(sim) {
		t.Fatal("internal cooldown exceeded sixty seconds")
	}
	for attempt := 0; attempt < 5000 && shield.SpellMetrics[healer.UnitIndex].Casts == before; attempt++ {
		trigger.OnSpellHitTaken(trigger, sim, incoming, result)
	}
	if shield.SpellMetrics[healer.UnitIndex].Casts != before+1 {
		t.Fatal("shield failed to proc after the cooldown boundary")
	}
	fmt.Printf("KFC_VIRTUOUS_REFERENCE_CHANCE %d\n", procs)
}

func TestKFCVirtuousReferenceEventIsolation(t *testing.T) {
	sim, healer, shield, trigger, incoming := virtuousReferenceFixture(t, 1, 0)
	control, _, _, _, _ := virtuousReferenceFixture(t, 1, 0)
	result := &core.SpellResult{Target: &healer.Unit, Damage: 1, Outcome: core.OutcomeMiss}
	for attempt := 0; attempt < 1000; attempt++ {
		trigger.OnSpellHitTaken(trigger, sim, incoming, result)
	}
	result.Outcome = core.OutcomeHit
	unrelated := *incoming
	unrelated.ProcMask = core.ProcMaskSpellHealing
	trigger.OnSpellHitTaken(trigger, sim, &unrelated, result)
	unrelated.Unit = &healer.Unit
	unrelated.ProcMask = core.ProcMaskSpellDamage
	trigger.OnSpellHitTaken(trigger, sim, &unrelated, result)
	trigger.OnSpellHitTaken(trigger, sim, nil, result)
	trigger.OnSpellHitTaken(trigger, sim, incoming, nil)
	if trigger.OnPeriodicDamageTaken != nil || trigger.OnHealDealt != nil || trigger.OnCastComplete != nil {
		t.Fatal("reference installed unrelated event callbacks")
	}
	if shield.SpellMetrics[healer.UnitIndex].Casts != 0 || !trigger.Icd.IsReady(sim) {
		t.Fatal("ineligible events changed the shield or cooldown")
	}
	kfcPriestNear(t, sim.RandomFloat("Virtuous incoming shield reference"), control.RandomFloat("Virtuous incoming shield reference"))
}

func TestKFCVirtuousReferencePolicyAndDuplicateGuards(t *testing.T) {
	for _, multiplier := range []float64{0, -1, math.NaN(), math.Inf(1)} {
		t.Run(fmt.Sprint(multiplier), func(t *testing.T) {
			defer func() {
				if recover() == nil {
					t.Fatal("unreviewed family policy was silently defaulted")
				}
			}()
			virtuousReferenceFixture(t, multiplier, 0)
		})
	}
	_, healer, _, _, _ := virtuousReferenceFixture(t, 1, 0)
	for _, policy := range []core.ForeverVirtuousShieldReferencePolicy{
		{FamilyMultiplier: 1},
		{FamilyMultiplier: 1, EligibleIncoming: virtuousReferenceEligible},
	} {
		func() {
			defer func() {
				if recover() == nil {
					t.Fatal("nil event policy or duplicate registration was accepted")
				}
			}()
			core.RegisterForeverVirtuousShieldReference(healer.GetCharacter(), policy)
		}()
	}
}
