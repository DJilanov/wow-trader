package healing

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
	googleProto "google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
)

func kfcTalentedPriestFixture(t *testing.T, talents *proto.PriestTalents) (*core.Simulation, *HealingPriest, *core.Unit) {
	t.Helper()
	var allocation strings.Builder
	message := talents.ProtoReflect()
	for index := 0; index < 52; index++ {
		if index == 18 || index == 35 {
			allocation.WriteByte('-')
		}
		field := message.Descriptor().Fields().Get(index)
		value := int64(0)
		if field.Kind() == protoreflect.BoolKind {
			if message.Get(field).Bool() {
				value = 1
			}
		} else {
			value = message.Get(field).Int()
		}
		allocation.WriteByte(byte('0' + value))
	}
	bonus := stats.Stats{stats.HealingPower: 500, stats.Mana: 10000}
	sim := core.NewSim(&proto.RaidSimRequest{
		Raid: &proto.Raid{Parties: []*proto.Party{{Players: []*proto.Player{{
			Name: "Talented Priest control", Race: proto.Race_RaceHuman, Class: proto.Class_ClassPriest,
			Equipment: &proto.EquipmentSpec{}, BonusStats: &proto.UnitStats{Stats: bonus.ToFloatArray()},
			TalentsString: allocation.String(), Rotation: &proto.APLRotation{Type: proto.APLRotation_TypeAPL},
			Spec: &proto.Player_HealingPriest{HealingPriest: &proto.HealingPriest{Options: &proto.HealingPriest_Options{}}},
		}}}}, TargetDummies: 2},
		Encounter:  &proto.Encounter{Duration: 90, Targets: []*proto.Target{{Name: "Control enemy", Level: 63}}},
		SimOptions: &proto.SimOptions{Iterations: 1, RandomSeed: 7911, Ruleset: proto.Ruleset_RulesetForever, IsTest: true, Interactive: true},
	}, simsignals.CreateSignals())
	sim.Reset()
	priest := sim.Raid.Parties[0].Players[0].(*HealingPriest)
	if !googleProto.Equal(priest.Talents, talents) {
		t.Fatal("Control talent allocation did not round trip")
	}
	return sim, priest, &sim.Raid.GetFirstTargetDummy().Unit
}

func kfcTalentFlash(t *testing.T, talents *proto.PriestTalents) float64 {
	t.Helper()
	sim, priest, target := kfcTalentedPriestFixture(t, talents)
	target.RemoveHealth(sim, 8000)
	spell := priest.FlashHeal[7]
	spell.BonusCritRating = -10000
	before := target.CurrentHealth()
	if !spell.Cast(sim, target) {
		t.Fatal("Control Flash Heal failed")
	}
	kfcPriestAdvance(t, sim, 1500*time.Millisecond)
	return target.CurrentHealth() - before
}

func TestKFCPriestSpiritualHealingCurves(t *testing.T) {
	baseline := kfcTalentFlash(t, &proto.PriestTalents{})
	for rank, bonus := range []float64{.03, .07, .10} {
		got := kfcTalentFlash(t, &proto.PriestTalents{SpiritualHealing: int32(rank + 1)})
		kfcPriestNear(t, got, baseline*(1+bonus))
	}
	fmt.Printf("KFC_PRIEST_TALENT_BASE %.8f\n", baseline)
}

func TestKFCPriestRenewTalentComposition(t *testing.T) {
	sim, priest, target := kfcTalentedPriestFixture(t, &proto.PriestTalents{SpiritualHealing: 3, ImprovedRenew: 3, TwinDisciplines: 5, MentalAgility: 3})
	target.RemoveHealth(sim, 8000)
	before := target.CurrentHealth()
	if !priest.Renew[9].Cast(sim, target) {
		t.Fatal("Talented Renew cast failed")
	}
	kfcPriestAdvance(t, sim, 15*time.Second)
	kfcPriestNear(t, target.CurrentHealth()-before, 1170*1.30)
	kfcPriestNear(t, priest.Metrics.ManaSpent, 365*.9)
}

func TestKFCPriestCostAndCastMasks(t *testing.T) {
	_, priest, _ := kfcTalentedPriestFixture(t, &proto.PriestTalents{DivineFury: 5, ImprovedHealing: 3})
	for _, control := range []struct {
		id   int32
		mana float64
		cast time.Duration
	}{
		{2050, 30 * .85, 1500 * time.Millisecond}, {6064, 305 * .85, 2500 * time.Millisecond},
		{10965, 655 * .85, 2500 * time.Millisecond}, {10917, 380, 1500 * time.Millisecond}, {10929, 365, 0},
	} {
		spell := priest.GetSpell(core.ActionID{SpellID: control.id})
		if spell.DefaultCast.CastTime != control.cast {
			t.Fatalf("Wrong cast time for %d: %s", control.id, spell.DefaultCast.CastTime)
		}
		kfcPriestNear(t, spell.Cost.GetCurrentCost(), control.mana)
	}
}

func TestKFCPriestSoulWardingAndShieldTalents(t *testing.T) {
	sim, priest, target := kfcTalentedPriestFixture(t, &proto.PriestTalents{SpiritualHealing: 3, ImprovedPowerWordShield: 3, SoulWarding: true, MentalAgility: 3})
	spell := priest.PowerWordShield[10]
	if !spell.Cast(sim, target) {
		t.Fatal("Talented shield cast failed")
	}
	kfcPriestNear(t, spell.Shield(target).RemainingAbsorb(), 978*1.2)
	kfcPriestNear(t, priest.Metrics.ManaSpent, 500*.75)
	if spell.CD.Duration != 0 {
		t.Fatal("Soul Warding left a shield cooldown")
	}
	kfcPriestAdvance(t, sim, 1500*time.Millisecond)
	second := &sim.Raid.Parties[0].Players[2].GetCharacter().Unit
	if !priest.PowerWordShield[9].Cast(sim, second) {
		t.Fatal("Soul Warding did not allow another target after the GCD")
	}
	kfcPriestAdvance(t, sim, 3*time.Second)
	if !priest.WeakenedSouls.Get(target).IsActive() || spell.CanCast(sim, target) {
		t.Fatal("Soul Warding incorrectly removed Weakened Soul")
	}
}

func TestKFCPriestInspirationCritAndArmor(t *testing.T) {
	sim, priest, target := kfcTalentedPriestFixture(t, &proto.PriestTalents{Inspiration: 3})
	target.AddStatDynamic(sim, stats.Armor, 1000)
	target.RemoveHealth(sim, 8000)
	spell := priest.FlashHeal[7]
	spell.BonusCritRating = -10000
	if !spell.Cast(sim, target) {
		t.Fatal("Noncritical control failed")
	}
	kfcPriestAdvance(t, sim, 1500*time.Millisecond)
	if priest.KFCInspiration.Get(target).IsActive() {
		t.Fatal("Noncritical heal triggered Inspiration")
	}
	spell.BonusCritRating = 10000
	if !spell.Cast(sim, target) {
		t.Fatal("Critical control failed")
	}
	kfcPriestAdvance(t, sim, 3*time.Second)
	kfcPriestNear(t, target.GetStat(stats.Armor), 1250)
	kfcPriestNear(t, target.PseudoStats.SchoolDamageTakenMultiplier[stats.SchoolIndexPhysical], 1)
	kfcPriestAdvance(t, sim, 18*time.Second)
	kfcPriestNear(t, target.GetStat(stats.Armor), 1000)
	if priest.KFCInspiration.Get(target).IsActive() {
		t.Fatal("Inspiration did not expire")
	}
}

func TestKFCPriestDivineAegisActualAbsorption(t *testing.T) {
	sim, priest, target := kfcTalentedPriestFixture(t, &proto.PriestTalents{DivineAegis: 3})
	target.RemoveHealth(sim, 8000)
	spell := priest.FlashHeal[7]
	spell.BonusCritRating = -10000
	if !spell.Cast(sim, target) {
		t.Fatal("Noncritical Aegis control failed")
	}
	kfcPriestAdvance(t, sim, 1500*time.Millisecond)
	shield := priest.KFCDivineAegis.Shield(target)
	if shield.IsActive() {
		t.Fatal("Noncritical heal triggered Divine Aegis")
	}
	spell.BonusCritRating = 10000
	before := spell.SpellMetrics[target.UnitIndex].TotalHealing
	if !spell.Cast(sim, target) {
		t.Fatal("Critical Aegis control failed")
	}
	kfcPriestAdvance(t, sim, 3*time.Second)
	want := (spell.SpellMetrics[target.UnitIndex].TotalHealing - before) * .15
	kfcPriestNear(t, shield.RemainingAbsorb(), want)
	kfcPriestNear(t, priest.KFCDivineAegis.SpellMetrics[target.UnitIndex].TotalAbsorbedShielding, 0)
	incoming := sim.Encounter.TargetUnits[0].RegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: 1}, SpellSchool: core.SpellSchoolPhysical, ProcMask: core.ProcMaskSpellDamage, DamageMultiplier: 1})
	result := incoming.NewResult(target)
	result.Damage = 100
	result.Outcome = core.OutcomeHit
	incoming.DealDamage(sim, result)
	kfcPriestNear(t, shield.RemainingAbsorb(), want-100)
	kfcPriestNear(t, priest.KFCDivineAegis.SpellMetrics[target.UnitIndex].TotalAbsorbedShielding, 100)
	for index := 0; index < 8; index++ {
		if !spell.Cast(sim, target) {
			t.Fatal("Aegis stacking cast failed")
		}
		kfcPriestAdvance(t, sim, sim.CurrentTime+1500*time.Millisecond)
	}
	kfcPriestNear(t, shield.RemainingAbsorb(), 1200)
	kfcPriestAdvance(t, sim, sim.CurrentTime+12*time.Second)
	if shield.IsActive() {
		t.Fatal("Divine Aegis did not expire")
	}
	kfcPriestNear(t, shield.RemainingAbsorb(), 0)
	fmt.Printf("KFC_PRIEST_AEGIS %.8f\n", want)
}

func TestKFCPriestRenewedHopeTargetAndDuration(t *testing.T) {
	sim, priest, target := kfcTalentedPriestFixture(t, &proto.PriestTalents{RenewedHope: 3})
	spell := priest.FlashHeal[7]
	baseline := spell.HealingCritChance()
	observed := []float64{}
	observer := priest.GetAura("Renewed Hope healing trigger")
	previous := observer.OnHealDealt
	observer.OnHealDealt = func(aura *core.Aura, sim *core.Simulation, spell *core.Spell, result *core.SpellResult) {
		observed = append(observed, result.EffectiveCritChance)
		previous(aura, sim, spell, result)
	}
	if !priest.PowerWordShield[10].Cast(sim, target) {
		t.Fatal("Weakened Soul setup failed")
	}
	kfcPriestAdvance(t, sim, 1500*time.Millisecond)
	if !spell.Cast(sim, target) {
		t.Fatal("Renewed Hope heal failed")
	}
	kfcPriestAdvance(t, sim, 3*time.Second)
	kfcPriestNear(t, priest.WeakenedSouls.Get(target).ExpiresAt().Seconds(), 12)
	second := &sim.Raid.Parties[0].Players[2].GetCharacter().Unit
	if !spell.Cast(sim, second) {
		t.Fatal("Untargeted Renewed Hope control failed")
	}
	kfcPriestAdvance(t, sim, 4500*time.Millisecond)
	if len(observed) != 2 {
		t.Fatalf("Missing critical probability observations: %v", observed)
	}
	kfcPriestNear(t, observed[0], baseline+.06)
	kfcPriestNear(t, observed[1], baseline)
	kfcPriestNear(t, spell.HealingCritChance(), baseline)
}

func TestKFCPriestLitanySequenceAndRankIdentity(t *testing.T) {
	sim, priest, target := kfcTalentedPriestFixture(t, &proto.PriestTalents{LitanyOfLight: 2})
	metrics := priest.KFCLitanyMetrics
	for _, step := range []struct {
		id     int32
		refund float64
	}{
		{10917, 0}, {10916, 0}, {10929, 36.5}, {10928, 0}, {10917, 38}, {10901, 0}, {10916, 0},
	} {
		spell := priest.GetSpell(core.ActionID{SpellID: step.id})
		before := metrics.ActualGainForCurrentIteration()
		if !spell.Cast(sim, target) {
			t.Fatalf("Litany sequence cast %d failed", step.id)
		}
		kfcPriestAdvance(t, sim, sim.CurrentTime+max(spell.DefaultCast.CastTime, 1500*time.Millisecond))
		kfcPriestNear(t, metrics.ActualGainForCurrentIteration()-before, step.refund)
	}
	sim.Cleanup()
	sim.Reset()
	if !priest.Renew[9].Cast(sim, target) {
		t.Fatal("Litany reset cast failed")
	}
	kfcPriestNear(t, metrics.ActualGainForCurrentIteration(), 0)
}

func TestKFCPriestHealingProcReset(t *testing.T) {
	sim, priest, target := kfcTalentedPriestFixture(t, &proto.PriestTalents{Inspiration: 3, DivineAegis: 3, RenewedHope: 3, LitanyOfLight: 2})
	target.AddStatDynamic(sim, stats.Armor, 1000)
	target.RemoveHealth(sim, 8000)
	if !priest.PowerWordShield[10].Cast(sim, target) {
		t.Fatal("Proc reset shield setup failed")
	}
	kfcPriestAdvance(t, sim, 1500*time.Millisecond)
	spell := priest.FlashHeal[7]
	spell.BonusCritRating = 10000
	if !spell.Cast(sim, target) {
		t.Fatal("Proc reset critical heal failed")
	}
	kfcPriestAdvance(t, sim, 3*time.Second)
	if !priest.KFCInspiration.Get(target).IsActive() || !priest.KFCDivineAegis.Shield(target).IsActive() {
		t.Fatal("Healing proc reset did not have active procs")
	}
	kfcPriestNear(t, target.GetStat(stats.Armor), 1250)
	sim.Cleanup()
	sim.Reset()
	if priest.KFCInspiration.Get(target).IsActive() || priest.KFCDivineAegis.Shield(target).IsActive() || priest.WeakenedSouls.Get(target).IsActive() {
		t.Fatal("Healing proc aura leaked into the next iteration")
	}
	kfcPriestNear(t, priest.KFCDivineAegis.Shield(target).RemainingAbsorb(), 0)
	kfcPriestNear(t, priest.KFCLitanyMetrics.ActualGainForCurrentIteration(), 0)
	kfcPriestNear(t, target.CurrentHealth(), target.MaxHealth())
	kfcPriestNear(t, target.GetStat(stats.Armor), 0)
	target.AddStatDynamic(sim, stats.Armor, 1000)
	kfcPriestNear(t, target.GetStat(stats.Armor), 1000)
}
