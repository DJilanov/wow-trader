package restoration

import (
	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/stats"
	"math"
	"testing"
)

func TestKFCDruidUtilityLegacyCoefficientActualHealingAndMana(t *testing.T) {
	values := [][]float64{}
	for _, coefficient := range []float64{0, 1} {
		sim, healer := kfcUtilityFixture(t, 18637)
		healer.AddStatDynamic(sim, stats.HealingPower, 200)
		target := &sim.Raid.GetFirstTargetDummy().Unit
		target.RemoveHealth(sim, 4000)
		p := kfcUtilityPolicy()
		p.Recombobulator = true
		p.RecombobulatorHealingCoefficient = coefficient
		p.RecombobulatorManaCoefficient = coefficient
		if err := healer.ConfigureKFCUtilityProbe(sim, p); err != nil {
			t.Fatal(err)
		}
		healer.SpendMana(sim, 2000, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 81}))
		beforeMana, beforeHealth := healer.CurrentMana(), target.CurrentHealth()
		healing := healer.utilityProbes.recombob.HealingPower(target)
		healer.useKFCUtilityProbes(sim)
		kfcDruidNear(t, target.CurrentHealth()-beforeHealth, (832.5+coefficient*healing)*1.5)
		kfcDruidNear(t, healer.CurrentMana()-beforeMana, 380+coefficient*healing)
		values = append(values, []float64{coefficient, healing, target.CurrentHealth() - beforeHealth, healer.CurrentMana() - beforeMana})
	}
	kfcDruidAdvancedResult("UTILITY_LEGACY_COEFFICIENT_CONTROL", values)
}
func TestKFCDruidUtilityLegacyCoefficientRejectsUnreviewedAndUnusedValues(t *testing.T) {
	for _, value := range []float64{.5, -1, 2, math.NaN()} {
		p := kfcUtilityPolicy()
		p.Recombobulator = true
		p.RecombobulatorHealingCoefficient = value
		if p.Validate() == nil {
			t.Fatal("Unreviewed healing coefficient accepted", value)
		}
		p = kfcUtilityPolicy()
		p.Recombobulator = true
		p.RecombobulatorManaCoefficient = value
		if p.Validate() == nil {
			t.Fatal("Unreviewed mana coefficient accepted", value)
		}
	}
	p := kfcUtilityPolicy()
	p.RecombobulatorHealingCoefficient = 1
	if p.Validate() == nil {
		t.Fatal("Unused coefficient accepted")
	}
	kfcDruidAdvancedResult("UTILITY_LEGACY_COEFFICIENT_GUARDS", true)
}
