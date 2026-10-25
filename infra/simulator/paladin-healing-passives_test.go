package holy

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
)

func kfcPaladinPassiveFixture(power float64, talents string) (*core.Simulation, *HolyPaladin, *core.Unit) {
	bonus := stats.Stats{stats.HealingPower: power, stats.Mana: 10000}
	sim := core.NewSim(&proto.RaidSimRequest{
		Raid: &proto.Raid{Parties: []*proto.Party{{Players: []*proto.Player{{
			Name: "Paladin spell control", Level: 60, Race: proto.Race_RaceHuman, Class: proto.Class_ClassPaladin,
			TalentsString: talents, Equipment: &proto.EquipmentSpec{}, BonusStats: &proto.UnitStats{Stats: bonus.ToFloatArray()},
			Rotation: &proto.APLRotation{Type: proto.APLRotation_TypeAPL},
			Spec:     &proto.Player_HolyPaladin{HolyPaladin: &proto.HolyPaladin{Options: &proto.PaladinOptions{}}},
		}}}}, TargetDummies: 2},
		Encounter:  &proto.Encounter{Duration: 60, Targets: []*proto.Target{{Name: "Synthetic spell-control enemy", Level: 63}}},
		SimOptions: &proto.SimOptions{Iterations: 1, RandomSeed: 73119, Ruleset: proto.Ruleset_RulesetForever, IsTest: true, Interactive: true},
	}, simsignals.CreateSignals())
	sim.Reset()
	return sim, sim.Raid.Parties[0].Players[0].(*HolyPaladin), &sim.Raid.GetFirstTargetDummy().Unit
}

func kfcPaladinPassiveString(field, points int) string {
	value := []byte("00000000000000000")
	value[field] = byte('0' + points)
	return string(value)
}

func TestKFCPaladinHealingLightRanks(t *testing.T) {
	amounts := []float64{}
	for points := 0; points <= 3; points++ {
		sim, holy, target := kfcPaladinPassiveFixture(500, kfcPaladinPassiveString(2, points))
		target.RemoveHealth(sim, 9000)
		spell := holy.GetSpell(core.ActionID{SpellID: 10329})
		spell.BonusCritRating = -10000
		before := target.CurrentHealth()
		if !spell.Cast(sim, target) {
			t.Fatal("Healing Light cast failed")
		}
		kfcPaladinAdvance(t, sim, 2500*time.Millisecond)
		amounts = append(amounts, target.CurrentHealth()-before)
		kfcPaladinNear(t, amounts[points], amounts[0]*(1+0.04*float64(points)))
	}
	payload, _ := json.Marshal(amounts)
	fmt.Printf("KFC_PALADIN_HEALING_LIGHT %s\n", payload)
}

func TestKFCPaladinCurrentStatPassives(t *testing.T) {
	_, base, _ := kfcPaladinPassiveFixture(0, "")
	_, intellect, _ := kfcPaladinPassiveFixture(0, kfcPaladinPassiveString(1, 5))
	_, crit, _ := kfcPaladinPassiveFixture(0, kfcPaladinPassiveString(15, 5))
	_, reverence, _ := kfcPaladinPassiveFixture(0, kfcPaladinPassiveString(7, 3))
	kfcPaladinNear(t, intellect.GetStat(stats.Intellect), base.GetStat(stats.Intellect)*1.1)
	kfcPaladinNear(t, intellect.MaxMana()-base.MaxMana(), (intellect.GetStat(stats.Intellect)-base.GetStat(stats.Intellect))*15)
	kfcPaladinNear(t, crit.GetStat(stats.SpellCrit)-base.GetStat(stats.SpellCrit), 5*core.SpellCritRatingPerCritChance)
	kfcPaladinNear(t, reverence.PseudoStats.SpiritRegenRateCasting, 0.3)
	kfcPaladinNear(t, reverence.ManaRegenPerSecondWhileCasting()-base.ManaRegenPerSecondWhileCasting(), base.SpiritManaRegenPerSecondDefault()*0.3)
	values := []float64{intellect.GetStat(stats.Intellect), intellect.MaxMana(), crit.GetStat(stats.SpellCrit), reverence.ManaRegenPerSecondWhileCasting()}
	payload, _ := json.Marshal(values)
	fmt.Printf("KFC_PALADIN_STAT_PASSIVES %s\n", payload)
}

func TestKFCPaladinIlluminationBaseCostAndCriticalGate(t *testing.T) {
	observed := []float64{}
	for _, critical := range []bool{false, true} {
		for _, discount := range []int32{100, 50} {
			sim, holy, target := kfcPaladinPassiveFixture(500, kfcPaladinPassiveString(10, 5))
			spell := holy.GetSpell(core.ActionID{SpellID: 10329})
			spell.Cost.Multiplier = discount
			spell.BonusCritRating = -10000
			if critical {
				spell.BonusCritRating = 10000
			}
			// A full-health critical heal must still produce its one eligible refund.
			before := holy.CurrentMana()
			if !spell.Cast(sim, target) {
				t.Fatal("Illumination cast failed")
			}
			kfcPaladinAdvance(t, sim, 2500*time.Millisecond)
			refund := 0.0
			if critical {
				refund = 290
			}
			kfcPaladinNear(t, holy.Metrics.ManaSpent, 580*float64(discount)/100)
			kfcPaladinNear(t, holy.CurrentMana()-before, -580*float64(discount)/100+refund)
			observed = append(observed, holy.CurrentMana()-before)
		}
	}
	payload, _ := json.Marshal(observed)
	fmt.Printf("KFC_PALADIN_ILLUMINATION_COST %s\n", payload)
}

func TestKFCPaladinIlluminationRankedChanceAndUnrelatedHealing(t *testing.T) {
	counts := []int{}
	for points := 1; points <= 5; points++ {
		sim, holy, target := kfcPaladinPassiveFixture(0, kfcPaladinPassiveString(10, points))
		spell := holy.GetSpell(core.ActionID{SpellID: 10329})
		spell.BonusCritRating = 10000
		procs := 0
		for index := 0; index < 1000; index++ {
			holy.SpendMana(sim, 400, holy.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 99}))
			before := holy.CurrentMana()
			spell.CalcAndDealHealing(sim, target, 1, spell.OutcomeHealingCrit)
			gain := holy.CurrentMana() - before
			if gain > 0 {
				kfcPaladinNear(t, gain, 290)
				procs++
			}
			if holy.CurrentMana() < 1000 {
				holy.AddMana(sim, 5000, holy.NewManaMetrics(core.ActionID{SpellID: 2, Tag: 99}))
			}
		}
		if procs < 200*points-60 || procs > 200*points+60 {
			t.Fatal("Ranked Illumination probability changed", points, procs)
		}
		if points == 5 && procs != 1000 {
			t.Fatal("Max-rank refund was not guaranteed")
		}
		counts = append(counts, procs)
	}
	sim, holy, target := kfcPaladinPassiveFixture(0, kfcPaladinPassiveString(10, 5))
	unrelated := holy.RegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: 10000077}, SpellSchool: core.SpellSchoolHoly, DefenseType: core.DefenseTypeMagic, ProcMask: core.ProcMaskSpellHealing, Flags: core.SpellFlagHelpful, DamageMultiplier: 1, ThreatMultiplier: 1})
	unrelated.BonusCritRating = 10000
	holy.SpendMana(sim, 1000, holy.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 99}))
	before := holy.CurrentMana()
	unrelated.CalcAndDealHealing(sim, target, 100, unrelated.OutcomeHealingCrit)
	kfcPaladinNear(t, holy.CurrentMana(), before)
	payload, _ := json.Marshal(counts)
	fmt.Printf("KFC_PALADIN_ILLUMINATION_PROCS %s\n", payload)
}

func TestKFCPaladinPassiveIterationReset(t *testing.T) {
	sim, holy, target := kfcPaladinPassiveFixture(500, kfcPaladinPassiveString(10, 5))
	spell := holy.GetSpell(core.ActionID{SpellID: 19943})
	spell.BonusCritRating = 10000
	for iteration := 0; iteration < 2; iteration++ {
		before := holy.CurrentMana()
		if !spell.Cast(sim, target) {
			t.Fatal("Iteration heal failed")
		}
		kfcPaladinAdvance(t, sim, 1500*time.Millisecond)
		kfcPaladinNear(t, holy.CurrentMana()-before, -70)
		sim.Cleanup()
		sim.Reset()
		kfcPaladinNear(t, holy.CurrentMana(), holy.MaxMana())
	}
}
