package healing

import (
	"fmt"
	"math"
	"strings"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
	"github.com/wowsims/classic/sim/priest"
	"google.golang.org/protobuf/reflect/protoreflect"
)

func kfcActiveFixture(t *testing.T, talents *proto.PriestTalents) (*core.Simulation, *HealingPriest, *core.Unit) {
	t.Helper()
	sim, healer, target := kfcTalentedPriestFixture(t, talents)
	positions := map[int32]priest.KFCFriendlyPosition{}
	for _, unit := range sim.Raid.AllUnits {
		positions[unit.UnitIndex] = priest.KFCFriendlyPosition{X: float64(unit.UnitIndex)}
	}
	if err := healer.ConfigureKFCFriendlyPositions(positions); err != nil {
		t.Fatal(err)
	}
	return sim, healer, target
}

func kfcDamageTrigger(sim *core.Simulation, target *core.Unit, amount float64) {
	spell := sim.Encounter.TargetUnits[0].RegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: 1}, SpellSchool: core.SpellSchoolPhysical, ProcMask: core.ProcMaskSpellDamage, DamageMultiplier: 1})
	result := spell.NewResult(target)
	result.Damage = amount
	result.Outcome = core.OutcomeHit
	spell.DealDamage(sim, result)
}

func TestKFCPriestPenanceHealingTiming(t *testing.T) {
	sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{Penance: true})
	target.RemoveHealth(sim, 6000)
	parent := healer.Penance
	bolt := healer.GetSpell(core.ActionID{SpellID: 1316991})
	bolt.BonusCritRating = -10000
	before := target.CurrentHealth()
	if parent.ActionID.SpellID != 1316995 || !parent.Cast(sim, target) {
		t.Fatal("Highest healing Penance rank did not cast")
	}
	kfcPriestNear(t, target.CurrentHealth()-before, 520)
	kfcPriestAdvance(t, sim, 999*time.Millisecond)
	kfcPriestNear(t, target.CurrentHealth()-before, 520)
	kfcPriestAdvance(t, sim, time.Second)
	kfcPriestNear(t, target.CurrentHealth()-before, 1040)
	kfcPriestAdvance(t, sim, 2*time.Second)
	kfcPriestNear(t, target.CurrentHealth()-before, 1560)
	kfcPriestNear(t, healer.Metrics.ManaSpent, 385)
	if healer.IsChanneling(sim) {
		t.Fatal("Penance channel did not end after its third bolt")
	}
	if bolt.SpellMetrics[target.UnitIndex].Casts != 3 {
		t.Fatal("Penance did not deliver three direct-heal casts")
	}
	fmt.Printf("KFC_PRIEST_PENANCE %.8f\n", bolt.SpellMetrics[target.UnitIndex].TotalHealing)
}

func TestKFCPriestPenanceCancelAndSharedCooldown(t *testing.T) {
	sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{Penance: true})
	target.RemoveHealth(sim, 6000)
	bolt := healer.GetSpell(core.ActionID{SpellID: 1316991})
	bolt.BonusCritRating = -10000
	if !healer.Penance.Cast(sim, target) {
		t.Fatal("Penance cancellation setup failed")
	}
	kfcPriestAdvance(t, sim, 500*time.Millisecond)
	healer.Penance.Hot(target).Cancel(sim)
	kfcPriestAdvance(t, sim, 2*time.Second)
	kfcPriestNear(t, bolt.SpellMetrics[target.UnitIndex].TotalHealing, 520)
	lower := healer.GetSpell(core.ActionID{SpellID: 1240721})
	if lower.CanCast(sim, target) || healer.IsChanneling(sim) {
		t.Fatal("Cancellation bypassed Penance's shared cooldown or retained its channel")
	}
	kfcPriestAdvance(t, sim, 12*time.Second)
	if !lower.CanCast(sim, target) {
		t.Fatal("Penance shared cooldown did not expire")
	}
}

func TestKFCPriestPenanceDirectHealingProcs(t *testing.T) {
	sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{Penance: true, DivineAegis: 3, Inspiration: 3, RenewedHope: 1, SpiritualHealing: 3, TwinDisciplines: 5, HolySpecialization: 5, ImprovedHealing: 3})
	target.RemoveHealth(sim, 8000)
	if !healer.PowerWordShield[10].Cast(sim, target) {
		t.Fatal("Penance proc shield setup failed")
	}
	kfcPriestAdvance(t, sim, 1500*time.Millisecond)
	bolt := healer.GetSpell(core.ActionID{SpellID: 1316991})
	bolt.BonusCritRating = 10000
	if !healer.Penance.Cast(sim, target) {
		t.Fatal("Talented Penance failed")
	}
	kfcPriestAdvance(t, sim, 3500*time.Millisecond)
	kfcPriestNear(t, bolt.SpellMetrics[target.UnitIndex].TotalHealing, 3*520*1.15*1.5)
	kfcPriestNear(t, healer.KFCDivineAegis.Shield(target).RemainingAbsorb(), 3*520*1.15*1.5*.15)
	kfcPriestNear(t, healer.WeakenedSouls.Get(target).ExpiresAt().Seconds(), 12)
	kfcPriestNear(t, healer.Metrics.ManaSpent, 500+385*.85)
	if !healer.KFCInspiration.Get(target).IsActive() {
		t.Fatal("Direct Penance crits did not trigger Inspiration")
	}
}

func TestKFCPriestBindingHealTwoRecipients(t *testing.T) {
	sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{BindingHeal: true})
	target.RemoveHealth(sim, 5000)
	healer.RemoveHealth(sim, 500)
	spell := healer.KFCBindingHeal[6]
	spell.BonusCritRating = -10000
	if spell.CanCast(sim, &healer.Unit) {
		t.Fatal("Binding Heal allowed self-targeting")
	}
	if !spell.Cast(sim, target) {
		t.Fatal("Binding Heal failed")
	}
	kfcPriestAdvance(t, sim, 1500*time.Millisecond)
	if spell.SpellMetrics[target.UnitIndex].TotalEffectiveHealing < 700 {
		t.Fatal("Binding Heal did not heal its target")
	}
	kfcPriestNear(t, spell.SpellMetrics[healer.UnitIndex].TotalEffectiveHealing, 500)
	if spell.SpellMetrics[healer.UnitIndex].TotalOverhealing <= 0 {
		t.Fatal("Binding Heal lost separate caster overhealing")
	}
	kfcPriestNear(t, healer.Metrics.ManaSpent, 380)
}

func TestKFCPriestFriendlyPositionValidation(t *testing.T) {
	sim, healer, target := kfcTalentedPriestFixture(t, &proto.PriestTalents{BindingHeal: true})
	spell := healer.KFCBindingHeal[6]
	if spell.CanCast(sim, target) {
		t.Fatal("Missing friendly coordinates silently allowed an in-range cast")
	}
	if healer.ConfigureKFCFriendlyPositions(map[int32]priest.KFCFriendlyPosition{}) == nil {
		t.Fatal("Incomplete friendly positions were accepted")
	}
	positions := map[int32]priest.KFCFriendlyPosition{}
	for _, unit := range sim.Raid.AllUnits {
		positions[unit.UnitIndex] = priest.KFCFriendlyPosition{}
	}
	positions[target.UnitIndex] = priest.KFCFriendlyPosition{X: 41}
	if err := healer.ConfigureKFCFriendlyPositions(positions); err != nil {
		t.Fatal(err)
	}
	positions[target.UnitIndex] = priest.KFCFriendlyPosition{}
	if spell.CanCast(sim, target) {
		t.Fatal("Mutating the caller's position map changed validated spell range")
	}
	if err := healer.ConfigureKFCFriendlyPositions(positions); err != nil {
		t.Fatal(err)
	}
	if !spell.CanCast(sim, target) {
		t.Fatal("A valid in-range Binding Heal was rejected")
	}
	positions[target.UnitIndex] = priest.KFCFriendlyPosition{X: math.NaN()}
	if healer.ConfigureKFCFriendlyPositions(positions) == nil {
		t.Fatal("Nonfinite friendly coordinates were accepted")
	}
}

func kfcPartyHealingFixture(t *testing.T, reach int32) (*core.Simulation, *HealingPriest) {
	t.Helper()
	talents := &proto.PriestTalents{HolyReach: reach}
	message := talents.ProtoReflect()
	var allocation strings.Builder
	for index := 0; index < 52; index++ {
		if index == 18 || index == 35 {
			allocation.WriteByte('-')
		}
		field := message.Descriptor().Fields().Get(index)
		value := int64(0)
		if field.Kind() != protoreflect.BoolKind {
			value = message.Get(field).Int()
		}
		allocation.WriteByte(byte('0' + value))
	}
	bonus := stats.Stats{stats.HealingPower: 500, stats.Mana: 10000}
	sim := core.NewSim(&proto.RaidSimRequest{Raid: &proto.Raid{Parties: []*proto.Party{{Players: []*proto.Player{{Name: "Party healer", Race: proto.Race_RaceHuman, Class: proto.Class_ClassPriest, TalentsString: allocation.String(), Equipment: &proto.EquipmentSpec{}, BonusStats: &proto.UnitStats{Stats: bonus.ToFloatArray()}, Rotation: &proto.APLRotation{Type: proto.APLRotation_TypeAPL}, Spec: &proto.Player_HealingPriest{HealingPriest: &proto.HealingPriest{Options: &proto.HealingPriest_Options{}}}}}}, {}}, TargetDummies: 6}, Encounter: &proto.Encounter{Duration: 60, Targets: []*proto.Target{{Name: "Control enemy", Level: 63}}}, SimOptions: &proto.SimOptions{Iterations: 1, RandomSeed: 7911, Ruleset: proto.Ruleset_RulesetForever, IsTest: true, Interactive: true}}, simsignals.CreateSignals())
	sim.Reset()
	return sim, sim.Raid.Parties[0].Players[0].(*HealingPriest)
}

func TestKFCPriestPrayerPartyAndTargetCenteredRadius(t *testing.T) {
	for _, reach := range []int32{0, 2} {
		sim, healer := kfcPartyHealingFixture(t, reach)
		party := sim.Raid.Parties[1]
		anchor := &party.Players[0].GetCharacter().Unit
		other := &party.Players[1].GetCharacter().Unit
		positions := map[int32]priest.KFCFriendlyPosition{}
		for _, unit := range sim.Raid.AllUnits {
			positions[unit.UnitIndex] = priest.KFCFriendlyPosition{}
			if unit != &healer.Unit {
				unit.RemoveHealth(sim, 5000)
			}
		}
		positions[anchor.UnitIndex] = priest.KFCFriendlyPosition{X: 30}
		positions[other.UnitIndex] = priest.KFCFriendlyPosition{X: 75}
		if err := healer.ConfigureKFCFriendlyPositions(positions); err != nil {
			t.Fatal(err)
		}
		spell := healer.PrayerOfHealing[4]
		spell.BonusCritRating = -10000
		if !spell.Cast(sim, anchor) {
			t.Fatal("Prayer of Healing target in another party was rejected")
		}
		kfcPriestAdvance(t, sim, 3*time.Second)
		if spell.SpellMetrics[anchor.UnitIndex].TotalEffectiveHealing <= 0 {
			t.Fatal("Prayer of Healing missed its anchor")
		}
		if (spell.SpellMetrics[other.UnitIndex].TotalEffectiveHealing > 0) != (reach == 2) {
			t.Fatal("Prayer of Healing ignored target-centered Holy Reach radius")
		}
		if spell.SpellMetrics[healer.UnitIndex].TotalHealing != 0 {
			t.Fatal("Prayer of Healing healed the caster's different party")
		}
		kfcPriestNear(t, healer.Metrics.ManaSpent, 1030)
	}
}

func TestKFCPriestMendingRequiresAnActualTrigger(t *testing.T) {
	sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{PrayerOfMending: true})
	target.RemoveHealth(sim, 5000)
	healer.KFCMendingHeal.BonusCritRating = -10000
	if !healer.PrayerOfMending.Cast(sim, target) {
		t.Fatal("Prayer of Mending failed")
	}
	kfcPriestAdvance(t, sim, 5*time.Second)
	kfcPriestNear(t, healer.KFCMendingHeal.SpellMetrics[target.UnitIndex].TotalHealing, 0)
	if healer.KFCMendingRemaining != 5 {
		t.Fatal("Mending used charges without damage or direct healing")
	}
	kfcPriestAdvance(t, sim, 31*time.Second)
	if healer.KFCMendingTarget != nil || healer.KFCMendingRemaining != 0 {
		t.Fatal("Mending did not expire without healing")
	}
}

func TestKFCPriestMendingDamageAndBoundedBounces(t *testing.T) {
	sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{PrayerOfMending: true})
	for _, unit := range sim.Raid.AllUnits {
		if unit != &healer.Unit {
			unit.RemoveHealth(sim, 8000)
		}
	}
	healer.KFCMendingHeal.BonusCritRating = -10000
	if !healer.PrayerOfMending.Cast(sim, target) {
		t.Fatal("Mending trigger setup failed")
	}
	kfcPriestAdvance(t, sim, 50*time.Millisecond)
	for index := 0; index < 5; index++ {
		current := healer.KFCMendingTarget
		if current == nil {
			t.Fatal("Mending lost an eligible in-range bounce")
		}
		before := healer.KFCMendingHeal.SpellMetrics[current.UnitIndex].TotalHealing
		kfcDamageTrigger(sim, current, 1)
		kfcPriestNear(t, healer.KFCMendingHeal.SpellMetrics[current.UnitIndex].TotalHealing-before, 627.5)
		if healer.KFCMendingRemaining != 4-index {
			t.Fatal("Mending charge count or recursive self-trigger is wrong")
		}
	}
	if healer.KFCMendingTarget != nil {
		t.Fatal("Mending exceeded its modeled total triggers")
	}
	fmt.Printf("KFC_PRIEST_MENDING %.8f\n", 5*627.5)
}

func TestKFCPriestMendingHealTriggerAndFormula(t *testing.T) {
	sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{PrayerOfMending: true, TwinDisciplines: 5, SpiritualHealing: 3, MentalAgility: 3, ImprovedHealing: 3})
	target.RemoveHealth(sim, 5000)
	healer.KFCMendingHeal.BonusCritRating = -10000
	if !healer.PrayerOfMending.Cast(sim, target) {
		t.Fatal("Mending formula setup failed")
	}
	kfcPriestNear(t, healer.Metrics.ManaSpent, 390*.75)
	kfcPriestAdvance(t, sim, 1500*time.Millisecond)
	healer.FlashHeal[7].BonusCritRating = -10000
	if !healer.FlashHeal[7].Cast(sim, target) {
		t.Fatal("Mending direct-heal trigger failed")
	}
	kfcPriestAdvance(t, sim, 3*time.Second)
	kfcPriestNear(t, healer.KFCMendingHeal.SpellMetrics[target.UnitIndex].TotalHealing, (413+.429*500)*1.05*1.10)
	if healer.KFCMendingRemaining != 4 {
		t.Fatal("Direct healing did not consume exactly one Mending charge")
	}
}

func TestKFCPriestMendingHotExclusionAndRange(t *testing.T) {
	sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{PrayerOfMending: true})
	target.RemoveHealth(sim, 5000)
	healer.KFCMendingHeal.BonusCritRating = -10000
	if !healer.Renew[9].Cast(sim, target) {
		t.Fatal("Mending periodic control setup failed")
	}
	kfcPriestAdvance(t, sim, 1500*time.Millisecond)
	if !healer.PrayerOfMending.Cast(sim, target) {
		t.Fatal("Mending periodic control cast failed")
	}
	kfcPriestAdvance(t, sim, 3*time.Second)
	if healer.KFCMendingRemaining != 5 {
		t.Fatal("Periodic Renew tick triggered Mending")
	}
	positions := map[int32]priest.KFCFriendlyPosition{}
	for _, unit := range sim.Raid.AllUnits {
		positions[unit.UnitIndex] = priest.KFCFriendlyPosition{X: 100}
	}
	positions[target.UnitIndex] = priest.KFCFriendlyPosition{}
	if err := healer.ConfigureKFCFriendlyPositions(positions); err != nil {
		t.Fatal(err)
	}
	kfcDamageTrigger(sim, target, 1)
	if healer.KFCMendingTarget != nil || healer.KFCMendingRemaining != 0 {
		t.Fatal("Mending bounced outside its declared jump radius")
	}
}

func TestKFCPriestMendingRecastAndIterationReset(t *testing.T) {
	sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{PrayerOfMending: true})
	if !healer.PrayerOfMending.Cast(sim, target) {
		t.Fatal("Mending replacement setup failed")
	}
	kfcPriestAdvance(t, sim, 10*time.Second)
	second := &sim.Raid.Parties[0].Players[2].GetCharacter().Unit
	if !healer.KFCMending[2].Cast(sim, second) {
		t.Fatal("Mending rank replacement failed")
	}
	kfcPriestAdvance(t, sim, 10100*time.Millisecond)
	if healer.KFCMendingAuras.Get(target).IsActive() || !healer.KFCMendingAuras.Get(second).IsActive() {
		t.Fatal("Mending ranks stacked instead of replacing the caster's aura")
	}
	sim.Cleanup()
	sim.Reset()
	if healer.KFCMendingTarget != nil || healer.KFCMendingRank != nil || healer.KFCMendingRemaining != 0 || healer.KFCMendingBusy {
		t.Fatal("Mending state leaked across iterations")
	}
}

func TestKFCPriestMendingFriendlyTravelAndPendingReset(t *testing.T) {
	sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{PrayerOfMending: true})
	positions := map[int32]priest.KFCFriendlyPosition{}
	for _, unit := range sim.Raid.AllUnits {
		positions[unit.UnitIndex] = priest.KFCFriendlyPosition{}
	}
	positions[target.UnitIndex] = priest.KFCFriendlyPosition{X: 20}
	if err := healer.ConfigureKFCFriendlyPositions(positions); err != nil {
		t.Fatal(err)
	}
	if !healer.PrayerOfMending.Cast(sim, target) {
		t.Fatal("Mending travel setup failed")
	}
	kfcPriestAdvance(t, sim, 499*time.Millisecond)
	if healer.KFCMendingTarget != nil {
		t.Fatal("Mending ignored its friendly-distance missile travel")
	}
	kfcPriestAdvance(t, sim, 500*time.Millisecond)
	if healer.KFCMendingTarget != target {
		t.Fatal("Mending did not arrive after its actual travel time")
	}
	sim.Cleanup()
	sim.Reset()
	if !healer.PrayerOfMending.Cast(sim, target) {
		t.Fatal("Pending Mending reset setup failed")
	}
	sim.Cleanup()
	sim.Reset()
	kfcPriestAdvance(t, sim, time.Second)
	if healer.KFCMendingTarget != nil {
		t.Fatal("A previous iteration's pending Mending arrived after reset")
	}
}
