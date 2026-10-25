package holy

import (
	"fmt"
	"math"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/stats"
)

// KFC_PALADIN_CAST_SET_FIXTURES

func kfcPaladinCastSetFixture(t *testing.T, setID int32, pieces int) (*core.Simulation, *HolyPaladin) {
	t.Helper()
	all := kfcPaladinCastSetEquipment[setID]
	if pieces < 0 || pieces > len(all) {
		t.Fatal("Invalid cast set threshold fixture")
	}
	equipment := map[int]int32{}
	for _, row := range all[:pieces] {
		equipment[int(row.slot)] = row.id
	}
	sim, healer := kfcPaladinUtilityFixture(t, equipment)
	count := 0
	for _, item := range healer.Equipment {
		if item.SetID == setID {
			count++
		}
	}
	if count != pieces {
		t.Fatal("Set equipment moved slots", setID, count, pieces)
	}
	return sim, healer
}

func TestKFCPaladinCastSetsOwnedThresholdAndPowerLifecycle(t *testing.T) {
	for _, setID := range []int32{187, 188} {
		for _, pieces := range []int{4, 5} {
			sim, healer := kfcPaladinCastSetFixture(t, setID, pieces)
			chance := 1.0
			err := healer.ConfigureKFCPaladinCastSets(sim, &KFCPaladinCastSetPolicy{SpellPowerChance: &chance})
			if pieces < 5 {
				if err == nil {
					t.Fatal("Unowned fifth-piece policy admitted")
				}
				continue
			}
			if err != nil {
				t.Fatal(err)
			}
			cast := healer.GetSpell(core.ActionID{SpellID: 10329})
			baseline := cast.HealingPower(&healer.Unit)
			if !cast.Cast(sim, &healer.Unit) {
				t.Fatal("Set-equipped class cast failed")
			}
			kfcPaladinAdvance(t, sim, 2500*time.Millisecond)
			kfcPaladinNear(t, cast.HealingPower(&healer.Unit)-baseline, 65)
			kfcPaladinNear(t, healer.GetStat(stats.SpellDamage)-healer.Equipment.Stats()[stats.SpellDamage], 65+18)
			kfcPaladinAdvance(t, sim, 12499*time.Millisecond)
			kfcPaladinNear(t, cast.HealingPower(&healer.Unit)-baseline, 65)
			kfcPaladinAdvance(t, sim, 12500*time.Millisecond)
			kfcPaladinNear(t, cast.HealingPower(&healer.Unit)-baseline, 0)
			sim.Cleanup()
			sim.Reset()
			kfcPaladinNear(t, cast.HealingPower(&healer.Unit)-baseline, 0)
			kfcPaladinHeartMeasure(fmt.Sprintf("CAST_SET_POWER_%d", setID), []float64{baseline, 65, 10000})
		}
	}
}

func TestKFCPaladinCastSetsWildheartManaBoundsCapsAndReset(t *testing.T) {
	for _, chance := range []float64{0, .02, .05, 1} {
		sim, healer := kfcPaladinCastSetFixture(t, 185, 5)
		if err := healer.ConfigureKFCPaladinCastSets(sim, &KFCPaladinCastSetPolicy{WildheartManaChance: &chance}); err != nil {
			t.Fatal(err)
		}
		cast := healer.GetSpell(core.ActionID{SpellID: 10329})
		refill := healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 192})
		for i := 0; i < 100; i++ {
			healer.AddMana(sim, healer.MaxMana(), refill)
			if !cast.Cast(sim, &healer.Unit) {
				t.Fatal("Wildheart class cast failed")
			}
			kfcPaladinAdvance(t, sim, sim.CurrentTime+2500*time.Millisecond)
		}
		raw, actual := kfcPaladinRegenerationMana(healer, 27782)
		if chance == 0 {
			kfcPaladinNear(t, raw, 0)
		} else if chance == 1 {
			kfcPaladinNear(t, raw, 20000)
			kfcPaladinNear(t, actual, 20000)
		} else if raw <= 0 || raw >= 20000 {
			t.Fatal("Wildheart reference rate is not represented", chance, raw)
		}
		kfcPaladinHeartMeasure(fmt.Sprintf("CAST_SET_MANA_%.2f", chance), []float64{raw, actual})
	}
}

func TestKFCPaladinCastSetsExcludeItemTriggeredPeriodicHostileAndDeadEvents(t *testing.T) {
	for _, setID := range []int32{185, 187, 188} {
		sim, healer := kfcPaladinCastSetFixture(t, setID, 5)
		one := 1.0
		policy := &KFCPaladinCastSetPolicy{SpellPowerChance: &one}
		if setID == 185 {
			policy = &KFCPaladinCastSetPolicy{WildheartManaChance: &one}
		}
		if err := healer.ConfigureKFCPaladinCastSets(sim, policy); err != nil {
			t.Fatal(err)
		}
		aura := healer.GetAura("Paladin current healing cast set procs")
		class := healer.GetSpell(core.ActionID{SpellID: 10329})
		baseline := class.HealingPower(&healer.Unit)
		for _, row := range []struct {
			id    int32
			mask  core.ProcMask
			flags core.SpellFlag
		}{
			{1, core.ProcMaskSpellHealing, core.SpellFlagHelpful},
			{10329, core.ProcMaskSpellHealing, core.SpellFlagHelpful | core.SpellFlagPassiveSpell},
			{10329, core.ProcMaskSpellHealing, core.SpellFlagHelpful | core.SpellFlagNoOnCastComplete},
			{10329, core.ProcMaskSpellDamage, 0},
		} {
			aura.OnCastComplete(aura, sim, &core.Spell{ActionID: core.ActionID{SpellID: row.id}, ProcMask: row.mask, Flags: row.flags})
		}
		healer.RemoveHealth(sim, healer.CurrentHealth())
		aura.OnCastComplete(aura, sim, class)
		raw, _ := kfcPaladinRegenerationMana(healer, 27782)
		kfcPaladinNear(t, raw, 0)
		kfcPaladinNear(t, class.HealingPower(&healer.Unit)-baseline, 0)
		kfcPaladinHeartMeasure(fmt.Sprintf("CAST_SET_EVENT_GUARDS_%d", setID), true)
	}
}

func TestKFCPaladinCastSetsDreadmistBoundsCriticalsAndNoScaling(t *testing.T) {
	for _, critical := range []bool{false, true} {
		sim, healer := kfcPaladinCastSetFixture(t, 183, 5)
		if err := healer.ConfigureKFCPaladinCastSets(sim, &KFCPaladinCastSetPolicy{DreadmistCanCrit: &critical}); err != nil {
			t.Fatal(err)
		}
		heal := healer.GetSpell(core.ActionID{SpellID: 450583})
		if heal == nil || heal.BonusCoefficient != 0 {
			t.Fatal("Dreadmist heal is missing or scales")
		}
		healer.AddStatDynamic(sim, stats.HealingPower, 100000)
		heal.BonusCritRating = 10000
		outcome := heal.OutcomeHealing
		factor := 1.0
		if critical {
			outcome = heal.OutcomeHealingCrit
			factor = 1.5
		}
		for _, amount := range []float64{270, 300, 330} {
			healer.RemoveHealth(sim, 1000)
			before := healer.CurrentHealth()
			heal.CalcAndDealHealing(sim, &healer.Unit, amount, outcome)
			kfcPaladinNear(t, healer.CurrentHealth()-before, amount*factor)
		}
		kfcPaladinHeartMeasure(fmt.Sprintf("CAST_SET_DREAD_CRIT_%t", critical), factor)
	}
}

func TestKFCPaladinCastSetsPolicyOwnershipFreshnessAndCopy(t *testing.T) {
	one := 1.0
	for _, pieces := range []int{0, 4} {
		sim, healer := kfcPaladinCastSetFixture(t, 185, pieces)
		if healer.ConfigureKFCPaladinCastSets(sim, &KFCPaladinCastSetPolicy{WildheartManaChance: &one}) == nil {
			t.Fatal("Unowned Wildheart policy admitted")
		}
	}
	for _, value := range []float64{-1, 1.01, math.NaN(), math.Inf(1)} {
		sim, healer := kfcPaladinCastSetFixture(t, 185, 5)
		if healer.ConfigureKFCPaladinCastSets(sim, &KFCPaladinCastSetPolicy{WildheartManaChance: &value}) == nil {
			t.Fatal("Invalid chance admitted")
		}
	}
	sim, healer := kfcPaladinCastSetFixture(t, 185, 5)
	if healer.ConfigureKFCPaladinCastSets(sim, &KFCPaladinCastSetPolicy{}) == nil {
		t.Fatal("Empty policy admitted")
	}
	if err := healer.ConfigureKFCPaladinCastSets(sim, &KFCPaladinCastSetPolicy{WildheartManaChance: &one}); err != nil {
		t.Fatal(err)
	}
	one = .05
	kfcPaladinNear(t, *healer.castSets.policy.WildheartManaChance, 1)
	kfcPaladinNear(t, *healer.castSets.echo.WildheartManaChance, 1)
	if healer.ConfigureKFCPaladinCastSets(sim, &KFCPaladinCastSetPolicy{WildheartManaChance: &one}) == nil {
		t.Fatal("Policy changed twice")
	}
	sim, healer = kfcPaladinCastSetFixture(t, 185, 5)
	healer.GetSpell(core.ActionID{SpellID: 10329}).Cast(sim, &healer.Unit)
	if healer.ConfigureKFCPaladinCastSets(sim, &KFCPaladinCastSetPolicy{WildheartManaChance: &one}) == nil {
		t.Fatal("Policy changed after casting")
	}
	kfcPaladinHeartMeasure("CAST_SET_POLICY_GUARDS", true)
}
