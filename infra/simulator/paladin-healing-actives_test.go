package holy

import (
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

func kfcPaladinActiveTalents(values map[int]int) string {
	text := []byte("00000000000000000")
	for field, value := range values {
		text[field] = byte('0' + value)
	}
	return string(text)
}

func kfcPaladinActiveFixture(t *testing.T, power float64, values map[int]int, dummies int) (*core.Simulation, *HolyPaladin, []*core.Unit) {
	t.Helper()
	bonus := stats.Stats{stats.HealingPower: power, stats.Mana: 10000}
	sim := core.NewSim(&proto.RaidSimRequest{
		Raid: &proto.Raid{Parties: []*proto.Party{{Players: []*proto.Player{{
			Name: "Paladin active healing control", Level: 60, Race: proto.Race_RaceHuman, Class: proto.Class_ClassPaladin,
			TalentsString: kfcPaladinActiveTalents(values), Equipment: &proto.EquipmentSpec{}, BonusStats: &proto.UnitStats{Stats: bonus.ToFloatArray()},
			Rotation: &proto.APLRotation{Type: proto.APLRotation_TypeAPL},
			Spec:     &proto.Player_HolyPaladin{HolyPaladin: &proto.HolyPaladin{Options: &proto.PaladinOptions{}}},
		}}}, {}}, TargetDummies: int32(dummies)},
		Encounter:  &proto.Encounter{Duration: 60, Targets: []*proto.Target{{Name: "Synthetic active-control enemy", Level: 63}}},
		SimOptions: &proto.SimOptions{Iterations: 1, RandomSeed: 73119, Ruleset: proto.Ruleset_RulesetForever, IsTest: true, Interactive: true},
	}, simsignals.CreateSignals())
	sim.Reset()
	holy := sim.Raid.Parties[0].Players[0].(*HolyPaladin)
	positions := make(map[int32]KFCPaladinFriendlyPosition)
	for _, unit := range sim.Raid.AllUnits {
		positions[unit.UnitIndex] = KFCPaladinFriendlyPosition{}
	}
	if err := holy.ConfigureKFCPaladinActiveHealing(positions, KFCPaladinVigilSingleRefund); err != nil {
		t.Fatal(err)
	}
	return sim, holy, sim.Raid.AllUnits
}

func kfcPaladinActiveMeasure(label string, value interface{}) {
	bytes, _ := json.Marshal(value)
	fmt.Printf("KFC_PALADIN_%s %s\n", label, bytes)
}

func TestKFCPaladinShockHealingPayloads(t *testing.T) {
	for _, test := range []struct {
		id              int32
		low, high, mana float64
	}{
		{1311606, 109.69, 118.31, 160}, {20473, 150.11, 161.89, 225},
		{20929, 221.27, 238.73, 275}, {20930, 307.36, 332.64, 325},
	} {
		amounts := []float64{}
		for _, power := range []float64{0, 500, 500} {
			sim, holy, units := kfcPaladinActiveFixture(t, power, map[int]int{13: 1}, 2)
			target := units[1]
			target.RemoveHealth(sim, 9000)
			spell := holy.GetSpell(core.ActionID{SpellID: test.id})
			if spell == nil || spell.DefaultCast.CastTime != 0 {
				t.Fatal("Missing healing Shock", test.id)
			}
			spell.BonusCritRating = -10000
			if len(amounts) == 2 {
				spell.BonusCritRating = 10000
			}
			before := target.CurrentHealth()
			if !spell.Cast(sim, target) {
				t.Fatal("Shock cast failed", test.id)
			}
			amounts = append(amounts, target.CurrentHealth()-before)
			kfcPaladinNear(t, holy.Metrics.ManaSpent, test.mana)
		}
		if amounts[0] < test.low || amounts[0] > test.high {
			t.Fatal("Damage payload used as healing", test.id, amounts[0])
		}
		kfcPaladinNear(t, amounts[1]-amounts[0], 500*.429)
		kfcPaladinNear(t, amounts[2], 1.5*amounts[1])
		kfcPaladinActiveMeasure("SHOCK_HEAL", map[string]interface{}{"id": test.id, "amounts": amounts})
	}
}

func TestKFCPaladinShockSharedCooldownAndPassives(t *testing.T) {
	sim, holy, units := kfcPaladinActiveFixture(t, 500, map[int]int{2: 3, 13: 1, 15: 5}, 2)
	spell := holy.GetSpell(core.ActionID{SpellID: 20930})
	kfcPaladinNear(t, spell.DamageMultiplier, 1.12)
	kfcPaladinNear(t, spell.BonusCritRating, 10*core.SpellCritRatingPerCritChance)
	if !spell.Cast(sim, units[1]) {
		t.Fatal("Shock failed")
	}
	kfcPaladinAdvance(t, sim, 1500*time.Millisecond)
	for _, id := range []int32{1311606, 20473, 20929, 20930} {
		other := holy.GetSpell(core.ActionID{SpellID: id})
		if other.CD.ReadyAt() != 10*time.Second || other.CanCast(sim, units[1]) {
			t.Fatal("Shock ranks did not share their cooldown", id)
		}
	}
	kfcPaladinAdvance(t, sim, 10*time.Second)
	if !spell.CanCast(sim, units[1]) {
		t.Fatal("Shock remained locked after ten seconds")
	}
}

func TestKFCPaladinVigilPreparationAndMana(t *testing.T) {
	sim, holy, units := kfcPaladinActiveFixture(t, 500, map[int]int{13: 1, 16: 1}, 4)
	spell := holy.GetSpell(core.ActionID{SpellID: 1311595})
	shock := holy.GetSpell(core.ActionID{SpellID: 20930})
	heal := holy.GetSpell(core.ActionID{SpellID: 1311596})
	shock.BonusCritRating, heal.BonusCritRating = -10000, -10000
	target := units[1]
	for _, unit := range units {
		unit.RemoveHealth(sim, unit.MaxHealth()/2)
	}
	beforeHealth, beforeMana := target.CurrentHealth(), holy.CurrentMana()
	if !spell.Cast(sim, target) {
		t.Fatal("Vigil preparation failed")
	}
	kfcPaladinAdvance(t, sim, 1499*time.Millisecond)
	if len(holy.KFCHealing.marks) != 0 {
		t.Fatal("Vigil marked before cast completion")
	}
	kfcPaladinNear(t, target.CurrentHealth(), beforeHealth)
	kfcPaladinAdvance(t, sim, 1500*time.Millisecond)
	if len(holy.KFCHealing.marks) != 1 {
		t.Fatal("Vigil did not mark after cast completion")
	}
	if !shock.Cast(sim, target) {
		t.Fatal("Shock could not consume the completed mark")
	}
	if len(holy.KFCHealing.marks) != 0 || !shock.CD.IsReady(sim) {
		t.Fatal("Mark was not consumed or new Shock cooldown was not removed")
	}
	kfcPaladinNear(t, holy.Metrics.ManaSpent, 1665)
	kfcPaladinNear(t, holy.CurrentMana()-beforeMana, -1665)
	amounts := []float64{}
	for _, unit := range units {
		amount := heal.SpellMetrics[unit.UnitIndex].TotalHealing
		if amount < 755.71 || amount > 795.29 {
			t.Fatal("Vigil party payload or coefficient changed", amount)
		}
		amounts = append(amounts, amount)
	}
	if heal.CanCast(sim, target) {
		t.Fatal("Triggered Vigil payload can be cast manually")
	}
	kfcPaladinActiveMeasure("VIGIL_PREPARATION", amounts)
}

func TestKFCPaladinVigilPartyAndRange(t *testing.T) {
	sim, holy, units := kfcPaladinActiveFixture(t, 0, map[int]int{13: 1, 16: 1}, 7)
	positions := make(map[int32]KFCPaladinFriendlyPosition)
	for _, unit := range units {
		positions[unit.UnitIndex] = KFCPaladinFriendlyPosition{}
	}
	positions[units[2].UnitIndex] = KFCPaladinFriendlyPosition{X: 40}
	positions[units[3].UnitIndex] = KFCPaladinFriendlyPosition{X: 40.001}
	if err := holy.ConfigureKFCPaladinActiveHealing(positions, KFCPaladinVigilSingleRefund); err != nil {
		t.Fatal(err)
	}
	units[4].RemoveHealth(sim, units[4].MaxHealth())
	spell := holy.GetSpell(core.ActionID{SpellID: 1311595})
	heal := holy.GetSpell(core.ActionID{SpellID: 1311596})
	if !spell.Cast(sim, units[1]) {
		t.Fatal("Vigil failed")
	}
	kfcPaladinAdvance(t, sim, 1500*time.Millisecond)
	if !holy.GetSpell(core.ActionID{SpellID: 20930}).Cast(sim, units[1]) {
		t.Fatal("Shock failed")
	}
	for index, unit := range units {
		got := heal.SpellMetrics[unit.UnitIndex].TotalHealing > 0
		if got != (index <= 2) {
			t.Fatal("Vigil crossed party, range or life-state boundary", index, got)
		}
	}
}

func TestKFCPaladinVigilSharedCooldownReplacementAndReset(t *testing.T) {
	sim, holy, units := kfcPaladinActiveFixture(t, 0, map[int]int{13: 1, 16: 1}, 7)
	first := holy.GetSpell(core.ActionID{SpellID: 1311595})
	second := holy.GetSpell(core.ActionID{SpellID: 1310911})
	if !first.Cast(sim, units[1]) {
		t.Fatal("First mark failed")
	}
	kfcPaladinAdvance(t, sim, 1500*time.Millisecond)
	old := holy.KFCHealing.marks[0]
	if second.CanCast(sim, units[2]) || second.CD.ReadyAt() != 7500*time.Millisecond {
		t.Fatal("Vigil ranks did not share the cast-completion cooldown")
	}
	kfcPaladinAdvance(t, sim, 7500*time.Millisecond)
	if !second.Cast(sim, units[2]) {
		t.Fatal("Replacement mark failed")
	}
	kfcPaladinAdvance(t, sim, 9*time.Second)
	if old.aura.IsActive() || holy.KFCHealing.marks[0].aura.Unit != units[2] {
		t.Fatal("A second mark did not replace the first in its party")
	}
	kfcPaladinAdvance(t, sim, 15*time.Second)
	if !second.Cast(sim, units[5]) {
		t.Fatal("Other-party mark failed")
	}
	kfcPaladinAdvance(t, sim, 16500*time.Millisecond)
	if len(holy.KFCHealing.marks) != 2 {
		t.Fatal("Different parties could not keep separate marks")
	}
	sim.Cleanup()
	sim.Reset()
	if len(holy.KFCHealing.marks) != 0 || !first.CanCast(sim, units[1]) {
		t.Fatal("Marks or shared cooldown leaked across iterations")
	}
}

func TestKFCPaladinVigilMatchingAndExpiration(t *testing.T) {
	sim, holy, units := kfcPaladinActiveFixture(t, 0, map[int]int{13: 1, 16: 1}, 2)
	spell := holy.GetSpell(core.ActionID{SpellID: 1311595})
	shock := holy.GetSpell(core.ActionID{SpellID: 20930})
	if !spell.Cast(sim, units[1]) {
		t.Fatal("Vigil failed")
	}
	kfcPaladinAdvance(t, sim, 1500*time.Millisecond)
	if !shock.Cast(sim, units[2]) {
		t.Fatal("Unmarked Shock failed")
	}
	if len(holy.KFCHealing.marks) != 1 || shock.CD.IsReady(sim) {
		t.Fatal("Shock on another target consumed the mark")
	}
	kfcPaladinAdvance(t, sim, 31500*time.Millisecond)
	if len(holy.KFCHealing.marks) != 0 {
		t.Fatal("Mark outlived its thirty-second duration")
	}
	if !shock.Cast(sim, units[1]) || shock.CD.IsReady(sim) {
		t.Fatal("Expired mark incorrectly removed Shock cooldown")
	}
}

func TestKFCPaladinVigilRefundHypotheses(t *testing.T) {
	values := []float64{}
	for _, mode := range []KFCPaladinVigilRefundMode{KFCPaladinVigilNoRefund, KFCPaladinVigilSingleRefund, KFCPaladinVigilMultiRefund} {
		sim, holy, units := kfcPaladinActiveFixture(t, 0, map[int]int{10: 5, 13: 1, 16: 1}, 4)
		if err := holy.ConfigureKFCPaladinActiveHealing(holy.KFCHealing.positions, mode); err != nil {
			t.Fatal(err)
		}
		holy.SpendMana(sim, 5000, holy.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 99}))
		before := holy.CurrentMana()
		shock := holy.GetSpell(core.ActionID{SpellID: 20930})
		shock.BonusCritRating = -10000
		holy.GetSpell(core.ActionID{SpellID: 1311596}).BonusCritRating = 10000
		if !holy.GetSpell(core.ActionID{SpellID: 1311595}).Cast(sim, units[1]) {
			t.Fatal("Vigil failed")
		}
		kfcPaladinAdvance(t, sim, 1500*time.Millisecond)
		if !shock.Cast(sim, units[1]) {
			t.Fatal("Shock failed")
		}
		expected := -1665.0
		if mode == KFCPaladinVigilSingleRefund {
			expected += 670
		} else if mode == KFCPaladinVigilMultiRefund {
			expected += 5 * 670
		}
		kfcPaladinNear(t, holy.CurrentMana()-before, expected)
		values = append(values, holy.CurrentMana()-before)
	}
	kfcPaladinActiveMeasure("VIGIL_REFUND_CASES", values)
}

func TestKFCPaladinInfusionCastTimeAndConsumption(t *testing.T) {
	values := []float64{}
	for points := 1; points <= 2; points++ {
		sim, holy, units := kfcPaladinActiveFixture(t, 0, map[int]int{9: points}, 2)
		flash := holy.GetSpell(core.ActionID{SpellID: 19943})
		light := holy.GetSpell(core.ActionID{SpellID: 10329})
		flash.BonusCritRating = 10000
		light.BonusCritRating = -10000
		if !flash.Cast(sim, units[1]) {
			t.Fatal("Flash failed")
		}
		kfcPaladinAdvance(t, sim, 1500*time.Millisecond)
		expected := time.Duration(2500-500*points) * time.Millisecond
		if light.DefaultCast.CastTime != expected || !holy.KFCHealing.infusion.IsActive() {
			t.Fatal("Infusion did not reduce Holy Light", points)
		}
		if !light.Cast(sim, units[1]) || light.CurCast.CastTime != expected {
			t.Fatal("Infused Holy Light did not use the reduced real cast time")
		}
		kfcPaladinAdvance(t, sim, 1500*time.Millisecond+expected)
		if holy.KFCHealing.infusion.IsActive() || light.DefaultCast.CastTime != 2500*time.Millisecond {
			t.Fatal("Infusion was not consumed exactly once")
		}
		values = append(values, float64(expected.Milliseconds()))
	}
	kfcPaladinActiveMeasure("INFUSION_CASTS", values)
}

func TestKFCPaladinInfusionRefreshExpirationAndReset(t *testing.T) {
	sim, holy, units := kfcPaladinActiveFixture(t, 0, map[int]int{9: 2}, 2)
	flash := holy.GetSpell(core.ActionID{SpellID: 19943})
	light := holy.GetSpell(core.ActionID{SpellID: 10329})
	flash.BonusCritRating = 10000
	if !flash.Cast(sim, units[1]) {
		t.Fatal("Flash failed")
	}
	kfcPaladinAdvance(t, sim, 1500*time.Millisecond)
	if !flash.Cast(sim, units[1]) {
		t.Fatal("Second Flash failed")
	}
	kfcPaladinAdvance(t, sim, 3*time.Second)
	if light.DefaultCast.CastTime != 1500*time.Millisecond {
		t.Fatal("Repeated crit stacked cast-time reduction")
	}
	kfcPaladinAdvance(t, sim, 17999*time.Millisecond)
	if !holy.KFCHealing.infusion.IsActive() {
		t.Fatal("Refreshed Infusion expired early")
	}
	kfcPaladinAdvance(t, sim, 18*time.Second)
	if holy.KFCHealing.infusion.IsActive() || light.DefaultCast.CastTime != 2500*time.Millisecond {
		t.Fatal("Infusion did not expire at fifteen seconds")
	}
	if !flash.Cast(sim, units[1]) {
		t.Fatal("Reset setup cast failed")
	}
	kfcPaladinAdvance(t, sim, 19500*time.Millisecond)
	sim.Cleanup()
	sim.Reset()
	if light.DefaultCast.CastTime != 2500*time.Millisecond || holy.KFCHealing.infusion.IsActive() {
		t.Fatal("Infusion reduction leaked across iterations")
	}
}

func TestKFCPaladinInfusionTriggerScope(t *testing.T) {
	sim, holy, units := kfcPaladinActiveFixture(t, 0, map[int]int{9: 2, 13: 1, 16: 1}, 4)
	light := holy.GetSpell(core.ActionID{SpellID: 10329})
	light.BonusCritRating = 10000
	if !light.Cast(sim, units[1]) {
		t.Fatal("Holy Light failed")
	}
	kfcPaladinAdvance(t, sim, 2500*time.Millisecond)
	if holy.KFCHealing.infusion.IsActive() {
		t.Fatal("Holy Light crit triggered Infusion")
	}
	shock := holy.GetSpell(core.ActionID{SpellID: 20930})
	shock.BonusCritRating = -10000
	holy.GetSpell(core.ActionID{SpellID: 1311596}).BonusCritRating = 10000
	if !holy.GetSpell(core.ActionID{SpellID: 1311595}).Cast(sim, units[1]) {
		t.Fatal("Vigil failed")
	}
	kfcPaladinAdvance(t, sim, 4*time.Second)
	if !shock.Cast(sim, units[1]) || holy.KFCHealing.infusion.IsActive() {
		t.Fatal("Vigil crit triggered Infusion")
	}
	kfcPaladinAdvance(t, sim, 5500*time.Millisecond)
	shock.BonusCritRating = 10000
	if !shock.Cast(sim, units[1]) || !holy.KFCHealing.infusion.IsActive() {
		t.Fatal("Shock crit did not trigger Infusion")
	}
}

func TestKFCPaladinFavorCostScopeAndConsumption(t *testing.T) {
	values := []float64{}
	for _, id := range []int32{10329, 19943, 20930} {
		sim, holy, units := kfcPaladinActiveFixture(t, 0, map[int]int{11: 1, 13: 1}, 2)
		spell := holy.GetSpell(core.ActionID{SpellID: id})
		spell.BonusCritRating = -holy.GetStat(stats.SpellCrit)
		beforeBonus, beforeMana := spell.BonusCritRating, holy.CurrentMana()
		favor := holy.GetSpell(core.ActionID{SpellID: 20216})
		if !favor.Cast(sim, &holy.Unit) || !holy.GCD.IsReady(sim) || favor.CD.ReadyAt() != 2*time.Minute {
			t.Fatal("Favor cost/GCD/cooldown failed")
		}
		kfcPaladinNear(t, beforeMana-holy.CurrentMana(), holy.BaseMana*.04)
		kfcPaladinNear(t, spell.BonusCritRating-beforeBonus, 100*core.SpellCritRatingPerCritChance)
		if !spell.Cast(sim, units[1]) {
			t.Fatal("Favored heal failed", id)
		}
		kfcPaladinAdvance(t, sim, spell.CurCast.CastTime)
		if holy.KFCHealing.favor.IsActive() || spell.SpellMetrics[units[1].UnitIndex].Crits != 1 {
			t.Fatal("Favor did not produce and consume its one critical heal", id)
		}
		kfcPaladinNear(t, spell.BonusCritRating, beforeBonus)
		values = append(values, holy.BaseMana*.04)
	}
	kfcPaladinActiveMeasure("FAVOR_COST", values)
}

func TestKFCPaladinFavorIgnoresPreparationAndUnrelatedHealing(t *testing.T) {
	sim, holy, units := kfcPaladinActiveFixture(t, 0, map[int]int{11: 1, 13: 1, 16: 1}, 2)
	if !holy.GetSpell(core.ActionID{SpellID: 20216}).Cast(sim, &holy.Unit) {
		t.Fatal("Favor failed")
	}
	if !holy.GetSpell(core.ActionID{SpellID: 1311595}).Cast(sim, units[1]) {
		t.Fatal("Vigil failed")
	}
	kfcPaladinAdvance(t, sim, 1500*time.Millisecond)
	if !holy.KFCHealing.favor.IsActive() {
		t.Fatal("Preparation consumed Favor")
	}
	unrelated := holy.RegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: 10000078}, SpellSchool: core.SpellSchoolHoly, DefenseType: core.DefenseTypeMagic,
		ProcMask: core.ProcMaskSpellHealing, Flags: core.SpellFlagHelpful, DamageMultiplier: 1, ThreatMultiplier: 1})
	unrelated.CalcAndDealHealing(sim, units[1], 1, unrelated.OutcomeHealingCrit)
	if !holy.KFCHealing.favor.IsActive() {
		t.Fatal("Unrelated heal consumed Favor")
	}
	sim.Cleanup()
	sim.Reset()
	if holy.KFCHealing.favor.IsActive() || !holy.GetSpell(core.ActionID{SpellID: 20216}).CanCast(sim, &holy.Unit) {
		t.Fatal("Favor charge or cooldown leaked across iterations")
	}
}

func TestKFCPaladinActiveInvalidTargetsAndConfiguration(t *testing.T) {
	sim, holy, units := kfcPaladinActiveFixture(t, 0, map[int]int{13: 1, 16: 1}, 2)
	before := holy.KFCHealing.positions
	if holy.ConfigureKFCPaladinActiveHealing(map[int32]KFCPaladinFriendlyPosition{}, KFCPaladinVigilSingleRefund) == nil {
		t.Fatal("Partial geometry accepted")
	}
	invalid := make(map[int32]KFCPaladinFriendlyPosition)
	for key, value := range before {
		invalid[key] = value
	}
	invalid[units[1].UnitIndex] = KFCPaladinFriendlyPosition{X: math.NaN()}
	if holy.ConfigureKFCPaladinActiveHealing(invalid, KFCPaladinVigilSingleRefund) == nil || holy.ConfigureKFCPaladinActiveHealing(before, "unknown") == nil {
		t.Fatal("Invalid configuration accepted")
	}
	if holy.KFCHealing.positions[units[1].UnitIndex].X != 0 {
		t.Fatal("Rejected geometry changed the active frame")
	}
	positions := make(map[int32]KFCPaladinFriendlyPosition)
	for key, value := range before {
		positions[key] = value
	}
	positions[units[1].UnitIndex] = KFCPaladinFriendlyPosition{X: 40.001}
	if err := holy.ConfigureKFCPaladinActiveHealing(positions, KFCPaladinVigilSingleRefund); err != nil {
		t.Fatal(err)
	}
	for _, id := range []int32{10329, 20930, 1311595} {
		spell := holy.GetSpell(core.ActionID{SpellID: id})
		if spell.CanCast(sim, nil) || spell.CanCast(sim, sim.Encounter.TargetUnits[0]) || spell.CanCast(sim, units[1]) {
			t.Fatal("Invalid or out-of-range healing target accepted", id)
		}
	}
	holy.RemoveHealth(sim, holy.MaxHealth())
	if holy.GetSpell(core.ActionID{SpellID: 20930}).CanCast(sim, units[2]) {
		t.Fatal("Dead healer could cast")
	}
}

func TestKFCPaladinTargetDeathDuringCast(t *testing.T) {
	for _, id := range []int32{10329, 1311595} {
		sim, holy, units := kfcPaladinActiveFixture(t, 0, map[int]int{13: 1, 16: 1}, 2)
		spell := holy.GetSpell(core.ActionID{SpellID: id})
		if !spell.Cast(sim, units[1]) {
			t.Fatal("Initial cast failed")
		}
		units[1].RemoveHealth(sim, units[1].MaxHealth())
		kfcPaladinAdvance(t, sim, spell.CurCast.CastTime)
		if units[1].CurrentHealth() > 0 || len(holy.KFCHealing.marks) > 0 {
			t.Fatal("A completed cast healed or marked a dead target", id)
		}
	}
}
