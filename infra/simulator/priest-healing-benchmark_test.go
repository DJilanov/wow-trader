package healing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/stats"
	"github.com/wowsims/classic/sim/priest"
	googleProto "google.golang.org/protobuf/proto"
)

func TestKFCPriestNovaRanksAndFriendlyRadius(t *testing.T) {
	sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{HolyNova: true, HolyReach: 2, SpiritualHealing: 3, TwinDisciplines: 5, MentalAgility: 3})
	second := &sim.Raid.Parties[0].Players[2].GetCharacter().Unit
	positions := map[int32]priest.KFCFriendlyPosition{healer.UnitIndex: {}, target.UnitIndex: {X: 11}, second.UnitIndex: {X: 13}}
	if err := healer.ConfigureKFCFriendlyPositions(positions); err != nil {
		t.Fatal(err)
	}
	healer.DistanceFromTarget = 20
	healer.RemoveHealth(sim, 1000)
	target.RemoveHealth(sim, 1000)
	second.RemoveHealth(sim, 1000)
	child := healer.GetSpell(core.ActionID{SpellID: 27805})
	child.BonusCritRating = -10000
	if len(healer.KFCNova) != 7 || healer.HolyNova.ActionID.SpellID != 27801 {
		t.Fatal("Holy Nova did not retain all current parent ranks")
	}
	if !healer.HolyNova.Cast(sim, &healer.Unit) {
		t.Fatal("Holy Nova failed")
	}
	if child.SpellMetrics[target.UnitIndex].TotalEffectiveHealing < 350 || child.SpellMetrics[healer.UnitIndex].TotalEffectiveHealing < 350 {
		t.Fatal("Holy Nova lost current healing modifiers or nearby recipients")
	}
	kfcPriestNear(t, child.SpellMetrics[second.UnitIndex].TotalHealing, 0)
	kfcPriestNear(t, child.SpellMetrics[target.UnitIndex].TotalThreat, 0)
	kfcPriestNear(t, healer.HolyNova.SpellMetrics[sim.Encounter.TargetUnits[0].UnitIndex].TotalDamage, 0)
	kfcPriestNear(t, healer.Metrics.ManaSpent, 750*.9)
}

func TestKFCPriestNovaFreeProcsRestoreEveryRank(t *testing.T) {
	sim, healer, _ := kfcActiveFixture(t, &proto.PriestTalents{HolyNova: true, SearingLight: 2, InnerFocus: true})
	if !healer.InnerFocus.Cast(sim, &healer.Unit) {
		t.Fatal("Nova focus setup failed")
	}
	healer.SearingLightAura.Activate(sim)
	for _, spell := range healer.KFCNova {
		if spell != nil {
			kfcPriestNear(t, spell.Cost.GetCurrentCost(), 0)
		}
	}
	if !healer.KFCNova[1].Cast(sim, &healer.Unit) {
		t.Fatal("Lower-rank free Nova failed")
	}
	kfcPriestNear(t, healer.Metrics.ManaSpent, 0)
	if healer.InnerFocusAura.IsActive() || healer.SearingLightAura.IsActive() {
		t.Fatal("Nova did not consume both independent free-cast effects")
	}
	for _, spell := range healer.KFCNova {
		if spell != nil {
			kfcPriestNear(t, spell.Cost.GetCurrentCost(), spell.Cost.BaseCost)
		}
	}
}

func TestKFCPriestFocusNewHealingMasks(t *testing.T) {
	sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{InnerFocus: true, BindingHeal: true, RenewedHope: 1})
	target.RemoveHealth(sim, 5000)
	healer.RemoveHealth(sim, 500)
	spell := healer.KFCBindingHeal[6]
	base := spell.HealingCritChance()
	observed := []float64{}
	observer := healer.GetAura("Renewed Hope healing trigger")
	previous := observer.OnHealDealt
	observer.OnHealDealt = func(a *core.Aura, s *core.Simulation, sp *core.Spell, result *core.SpellResult) {
		observed = append(observed, result.EffectiveCritChance)
		previous(a, s, sp, result)
	}
	if !healer.InnerFocus.Cast(sim, &healer.Unit) || !spell.Cast(sim, target) {
		t.Fatal("Focused Binding Heal failed")
	}
	kfcPriestAdvance(t, sim, 1500*time.Millisecond)
	if len(observed) != 2 {
		t.Fatal("Binding Heal did not report both focused outcomes")
	}
	for _, chance := range observed {
		kfcPriestNear(t, chance, base+.25)
	}
	kfcPriestNear(t, healer.Metrics.ManaSpent, 0)
	kfcPriestNear(t, spell.HealingCritChance(), base)
	if healer.InnerFocusAura.IsActive() {
		t.Fatal("Inner Focus did not expire after Binding Heal")
	}
	if healer.InnerFocus.CD.Duration != 3*time.Minute {
		t.Fatal("Inner Focus lost its client cooldown")
	}
}

func TestKFCPriestFocusPersistsAcrossPenanceBolts(t *testing.T) {
	sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{InnerFocus: true, Penance: true, RenewedHope: 1})
	target.RemoveHealth(sim, 6000)
	bolt := healer.GetSpell(core.ActionID{SpellID: 1316991})
	base := bolt.HealingCritChance()
	observed := []float64{}
	observer := healer.GetAura("Renewed Hope healing trigger")
	previous := observer.OnHealDealt
	observer.OnHealDealt = func(a *core.Aura, s *core.Simulation, sp *core.Spell, result *core.SpellResult) {
		observed = append(observed, result.EffectiveCritChance)
		previous(a, s, sp, result)
	}
	if !healer.InnerFocus.Cast(sim, &healer.Unit) || !healer.Penance.Cast(sim, target) {
		t.Fatal("Focused Penance failed")
	}
	if healer.InnerFocusAura.IsActive() || !healer.KFCFocusChannelAura.IsActive() {
		t.Fatal("Inner Focus was not consumed while retaining linked channel crit")
	}
	kfcPriestNear(t, healer.FlashHeal[7].Cost.GetCurrentCost(), 380)
	kfcPriestAdvance(t, sim, 2*time.Second)
	if len(observed) != 3 {
		t.Fatal("Focused Penance did not deliver three direct bolts")
	}
	for _, chance := range observed {
		kfcPriestNear(t, chance, base+.25)
	}
	kfcPriestNear(t, bolt.HealingCritChance(), base)
	kfcPriestNear(t, healer.Metrics.ManaSpent, 0)
	if healer.KFCFocusChannelAura.IsActive() {
		t.Fatal("Inner Focus channel bonus survived its channel")
	}
}

func TestKFCPriestFocusChannelCancellation(t *testing.T) {
	sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{InnerFocus: true, Penance: true})
	bolt := healer.GetSpell(core.ActionID{SpellID: 1316991})
	base := bolt.HealingCritChance()
	if !healer.InnerFocus.Cast(sim, &healer.Unit) || !healer.Penance.Cast(sim, target) {
		t.Fatal("Focused channel cancellation setup failed")
	}
	kfcPriestAdvance(t, sim, 500*time.Millisecond)
	healer.Penance.Hot(target).Cancel(sim)
	kfcPriestNear(t, bolt.HealingCritChance(), base)
	if healer.KFCFocusChannelAura.IsActive() {
		t.Fatal("Cancelled Penance leaked a permanent crit bonus")
	}
}

func TestKFCPriestHealthDamageBeforeMending(t *testing.T) {
	sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{PrayerOfMending: true})
	healer.KFCMendingHeal.BonusCritRating = -10000
	if !healer.PrayerOfMending.Cast(sim, target) {
		t.Fatal("Health receiver Mending setup failed")
	}
	kfcPriestAdvance(t, sim, 1500*time.Millisecond)
	if !healer.PowerWordShield[10].Cast(sim, target) {
		t.Fatal("Health receiver shield setup failed")
	}
	kfcDamageTrigger(sim, target, 1000)
	kfcPriestNear(t, target.CurrentHealth(), target.MaxHealth())
	kfcPriestNear(t, healer.PowerWordShield[10].SpellMetrics[target.UnitIndex].TotalAbsorbedShielding, 978)
	kfcPriestNear(t, healer.KFCMendingHeal.SpellMetrics[target.UnitIndex].TotalEffectiveHealing, 22)
	kfcPriestNear(t, healer.KFCMendingHeal.SpellMetrics[target.UnitIndex].TotalOverhealing, 605.5)
}

func TestKFCPriestDeadCasterCannotFinishOrStartHealing(t *testing.T) {
	sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{})
	target.RemoveHealth(sim, 4000)
	spell := healer.FlashHeal[7]
	if !spell.Cast(sim, target) {
		t.Fatal("Dead-caster control setup failed")
	}
	kfcPriestAdvance(t, sim, 500*time.Millisecond)
	kfcDamageTrigger(sim, &healer.Unit, healer.MaxHealth()*2)
	kfcPriestAdvance(t, sim, 2*time.Second)
	kfcPriestNear(t, spell.SpellMetrics[target.UnitIndex].TotalHealing, 0)
	if !healer.Metrics.Died || spell.CanCast(sim, target) {
		t.Fatal("Dead caster could continue healing")
	}
	sim.Cleanup()
	sim.Reset()
	if healer.Metrics.Died || !spell.CanCast(sim, target) {
		t.Fatal("Healer death state leaked across iterations")
	}
}

func TestKFCPriestPowerInfusionHealingAndExpiry(t *testing.T) {
	amounts := []float64{}
	for _, enabled := range []bool{false, true} {
		sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{PowerInfusion: true})
		target.RemoveHealth(sim, 5000)
		spell := healer.FlashHeal[7]
		spell.BonusCritRating = -10000
		if enabled {
			pi := healer.GetSpell(core.ActionID{SpellID: 10060, Tag: healer.Index})
			if !pi.Cast(sim, &healer.Unit) {
				t.Fatal("Power Infusion failed")
			}
			kfcPriestNear(t, healer.Metrics.ManaSpent, healer.BaseMana*.20)
		}
		before := target.CurrentHealth()
		if !spell.Cast(sim, target) {
			t.Fatal("Power Infusion heal control failed")
		}
		kfcPriestAdvance(t, sim, 1500*time.Millisecond)
		amounts = append(amounts, target.CurrentHealth()-before)
		kfcPriestAdvance(t, sim, 15*time.Second)
		kfcPriestNear(t, healer.PseudoStats.HealingDealtMultiplier, 1)
	}
	kfcPriestNear(t, amounts[1], amounts[0]*1.2)
}

func kfcWorkloadRequest(mana float64, iterations int32, duration float64) *proto.RaidSimRequest {
	bonus := stats.Stats{stats.HealingPower: 500, stats.Mana: mana}
	player := &proto.Player{
		Name: "Benchmark healer", Race: proto.Race_RaceHuman, Class: proto.Class_ClassPriest,
		Equipment: &proto.EquipmentSpec{}, BonusStats: &proto.UnitStats{Stats: bonus.ToFloatArray()},
		Spec: &proto.Player_HealingPriest{HealingPriest: &proto.HealingPriest{Options: &proto.HealingPriest_Options{}}},
	}
	return &proto.RaidSimRequest{
		Raid:       &proto.Raid{Parties: []*proto.Party{{Players: []*proto.Player{player}}}, TargetDummies: 2},
		Encounter:  &proto.Encounter{Duration: duration, Targets: []*proto.Target{{Name: "Synthetic benchmark enemy", Level: 63}}},
		SimOptions: &proto.SimOptions{Iterations: iterations, RandomSeed: 7911, Ruleset: proto.Ruleset_RulesetForever},
	}
}

func kfcTankWorkload(duration int) KFCHealingWorkload {
	frame := KFCHealingWorkload{Schema: "kfc-healing-workload.v1", Name: "synthetic-tank", DecisionIntervalMS: 50,
		Targets:    []KFCHealingTarget{{RaidIndex: 0}, {RaidIndex: 1, MaximumHealth: 10000, X: 5}, {RaidIndex: 2, MaximumHealth: 10000, X: 8}},
		Priorities: []KFCHealingPriority{{SpellID: 10917, RaidIndex: 1, MinimumMissingHealth: 500}},
	}
	for second := 1; second < duration; second++ {
		frame.Damage = append(frame.Damage, KFCHealingDamageEvent{AtMS: int64(second) * 1000, RaidIndex: 1, Amount: 400})
	}
	return frame
}

func TestKFCPriestWorkloadEffectiveHealingAndIsolation(t *testing.T) {
	request := kfcWorkloadRequest(10000, 3, 30)
	before := googleProto.Clone(request)
	frame := kfcTankWorkload(30)
	result, err := RunKFCHealingWorkload(context.Background(), request, frame)
	if err != nil {
		t.Fatal(err)
	}
	if !googleProto.Equal(request, before) {
		t.Fatal("Healing workload mutated the caller's request")
	}
	unit := result.Metrics.Parties[0].Players[0]
	if unit.Hps.Avg <= 0 || result.SurvivalRate != 1 || result.ManaRemainingMean <= 0 {
		t.Fatalf("No real feasible healing workload result: %+v", result)
	}
	kfcPriestNear(t, unit.RawHealingHps.Avg, unit.EffectiveHealingHps.Avg+unit.OverhealingHps.Avg)
	kfcPriestNear(t, unit.Hps.Avg, unit.EffectiveHealingHps.Avg+unit.AbsorbedHps.Avg)
	kfcPriestNear(t, result.Metrics.Hps.Avg, unit.Hps.Avg)
	if unit.Hps.Avg*30 > result.DeliveredIncomingDamageMean+1e-7 {
		t.Fatal("Healing workload credited more healing/absorption than delivered damage")
	}
	if result.ClassQualified || result.PublicationAllowed {
		t.Fatal("A controlled workload qualified an unfinished class")
	}
	bytes, err := json.Marshal(map[string]float64{"hps": unit.Hps.Avg, "rawHps": unit.RawHealingHps.Avg, "mana": result.ManaRemainingMean, "missingHealthSeconds": result.MissingHealthSecondsMean, "survival": result.SurvivalRate})
	if err != nil {
		t.Fatal(err)
	}
	fmt.Printf("KFC_PRIEST_WORKLOAD %s\n", bytes)
}

func TestKFCPriestWorkloadManaEndurance(t *testing.T) {
	frame := kfcTankWorkload(120)
	results := []*KFCHealingWorkloadResult{}
	for _, mana := range []float64{0, 20000} {
		result, err := RunKFCHealingWorkload(context.Background(), kfcWorkloadRequest(mana, 3, 120), frame)
		if err != nil {
			t.Fatal(err)
		}
		results = append(results, result)
	}
	weak, strong := results[0], results[1]
	if strong.Metrics.Parties[0].Players[0].Hps.Avg <= weak.Metrics.Parties[0].Players[0].Hps.Avg || strong.SurvivalRate < weak.SurvivalRate || weak.ManaBlockedSecondsMean <= strong.ManaBlockedSecondsMean {
		t.Fatal("Actual mana resources did not limit the sustained workload")
	}
}

func TestKFCPriestWorkloadInitializationHasNoFakeHealing(t *testing.T) {
	frame := kfcTankWorkload(5)
	frame.Damage = nil
	frame.Targets[1].MaximumHealth = 25000
	result, err := RunKFCHealingWorkload(context.Background(), kfcWorkloadRequest(0, 2, 5), frame)
	if err != nil {
		t.Fatal(err)
	}
	kfcPriestNear(t, result.Metrics.Parties[0].Players[0].Hps.Avg, 0)
	kfcPriestNear(t, result.FinalMissingHealthMean, 0)
}

func TestKFCPriestWorkloadBoundaryValidationAndCancellation(t *testing.T) {
	request := kfcWorkloadRequest(0, 1, 5)
	frame := kfcTankWorkload(5)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := RunKFCHealingWorkload(ctx, request, frame); !errors.Is(err, context.Canceled) {
		t.Fatal("Canceled workload did not stop before simulation")
	}
	bad := frame
	bad.Damage = []KFCHealingDamageEvent{{AtMS: 1000, RaidIndex: 0, Amount: 1}}
	if _, err := RunKFCHealingWorkload(context.Background(), request, bad); err == nil {
		t.Fatal("Unadmitted caster-damage scenario was accepted")
	}
	bad = frame
	bad.Priorities = []KFCHealingPriority{{SpellID: 10060, RaidIndex: 1}}
	if _, err := RunKFCHealingWorkload(context.Background(), request, bad); err == nil {
		t.Fatal("Unavailable utility spell was treated as healing")
	}
}

func TestKFCPriestWorkloadGroupHealing(t *testing.T) {
	frame := kfcTankWorkload(30)
	frame.Name = "synthetic-party"
	frame.Damage = nil
	frame.Priorities = []KFCHealingPriority{{SpellID: 10961, RaidIndex: 1, MinimumMissingHealth: 100}}
	for second := 3; second < 30; second += 3 {
		for _, index := range []int32{1, 2} {
			frame.Damage = append(frame.Damage, KFCHealingDamageEvent{AtMS: int64(second) * 1000, RaidIndex: index, Amount: 500})
		}
	}
	result, err := RunKFCHealingWorkload(context.Background(), kfcWorkloadRequest(20000, 3, 30), frame)
	if err != nil {
		t.Fatal(err)
	}
	unit := result.Metrics.Parties[0].Players[0]
	if unit.Hps.Avg < 250 || result.SurvivalRate != 1 {
		t.Fatal("Party workload did not perform feasible multi-recipient healing")
	}
	if unit.Hps.Avg*30 > result.DeliveredIncomingDamageMean+1e-7 {
		t.Fatal("Party workload counted full-health bystanders as effective healing")
	}
}

func TestKFCPriestWorkloadBurstRecovery(t *testing.T) {
	frame := kfcTankWorkload(15)
	frame.Name = "synthetic-burst"
	frame.Damage = []KFCHealingDamageEvent{{AtMS: 1000, RaidIndex: 1, Amount: 3500}, {AtMS: 1000, RaidIndex: 2, Amount: 3500}}
	frame.Priorities = []KFCHealingPriority{{SpellID: 10961, RaidIndex: 1, MinimumMissingHealth: 100}}
	results := []*KFCHealingWorkloadResult{}
	for _, power := range []float64{0, 1500} {
		request := kfcWorkloadRequest(20000, 3, 15)
		request.Raid.Parties[0].Players[0].BonusStats.Stats[stats.HealingPower] = power
		result, err := RunKFCHealingWorkload(context.Background(), request, frame)
		if err != nil {
			t.Fatal(err)
		}
		results = append(results, result)
	}
	if results[1].MissingHealthSecondsMean >= results[0].MissingHealthSecondsMean || results[1].FinalMissingHealthMean >= results[0].FinalMissingHealthMean {
		t.Fatal("Spell healing did not improve actual burst recovery")
	}
}

func TestKFCPriestWorkloadDeathsAreInfeasible(t *testing.T) {
	frame := kfcTankWorkload(5)
	frame.Name = "fatal-damage-control"
	frame.Damage = []KFCHealingDamageEvent{{AtMS: 1000, RaidIndex: 1, Amount: 15000}}
	result, err := RunKFCHealingWorkload(context.Background(), kfcWorkloadRequest(20000, 2, 5), frame)
	if err != nil {
		t.Fatal(err)
	}
	kfcPriestNear(t, result.SurvivalRate, 0)
	kfcPriestNear(t, result.Metrics.Parties[0].Players[0].Hps.Avg, 0)
	if result.FinalMissingHealthMean < 10000 {
		t.Fatal("A dead assignment was hidden by the healing workload")
	}
}

func TestKFCPriestWorkloadRenewAndConsumedShields(t *testing.T) {
	frame := kfcTankWorkload(30)
	frame.Priorities = []KFCHealingPriority{{SpellID: 10901, RaidIndex: 1}, {SpellID: 10929, RaidIndex: 1, MinimumMissingHealth: 1, KeepRenew: true}, {SpellID: 10917, RaidIndex: 1, MinimumMissingHealth: 500}}
	result, err := RunKFCHealingWorkload(context.Background(), kfcWorkloadRequest(20000, 2, 30), frame)
	if err != nil {
		t.Fatal(err)
	}
	unit := result.Metrics.Parties[0].Players[0]
	if unit.AbsorbedHps.Avg <= 0 || unit.Hps.Avg*30 > result.DeliveredIncomingDamageMean+1e-7 {
		t.Fatal("Shield capacity was not distinguished from consumed absorption")
	}
	casts := int32(0)
	for _, action := range unit.Actions {
		if action.Id.GetSpellId() == 10929 {
			for _, target := range action.Targets {
				casts += target.Casts
			}
		}
	}
	if casts <= 0 || casts > 4 {
		t.Fatalf("Renew was not maintained without unnecessary refresh: %d casts", casts)
	}
}

func TestKFCPriestWorkloadOwnedCooldowns(t *testing.T) {
	frame := kfcTankWorkload(30)
	frame.Priorities = []KFCHealingPriority{{SpellID: 10961, RaidIndex: 1, MinimumMissingHealth: 500}}
	frame.InnerFocusMinimumCost = 1000
	results := []*KFCHealingWorkloadResult{}
	for _, enabled := range []bool{false, true} {
		request := kfcWorkloadRequest(20000, 2, 30)
		request.Raid.Parties[0].Players[0].TalentsString = "000000001--"
		frame.UseInnerFocus = enabled
		result, err := RunKFCHealingWorkload(context.Background(), request, frame)
		if err != nil {
			t.Fatal(err)
		}
		results = append(results, result)
	}
	if results[1].ManaRemainingMean <= results[0].ManaRemainingMean {
		t.Fatal("Owned Inner Focus did not conserve actual mana")
	}
	request := kfcWorkloadRequest(20000, 2, 30)
	request.Raid.Parties[0].Players[0].TalentsString = strings.Repeat("0", 17) + "1--"
	frame.UseInnerFocus = false
	frame.UsePowerInfusion = true
	result, err := RunKFCHealingWorkload(context.Background(), request, frame)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, action := range result.Metrics.Parties[0].Players[0].Actions {
		if action.Id.GetSpellId() == 10060 {
			for _, target := range action.Targets {
				if target.Casts > 0 {
					found = true
				}
			}
		}
	}
	if !found {
		t.Fatal("Owned Power Infusion was never cast by the workload")
	}
}
