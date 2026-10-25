package restoration

import (
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/stats"
)

func TestKFCDruidCurrentStaticHealingCatalogValues(t *testing.T) {
	output := []float64{}
	for _, row := range []struct {
		id              int32
		healing, damage float64
	}{{9450, 11, 4}, {16706, 11, 4}, {16715, 11, 4}, {16718, 20, 7}, {16719, 24, 8}, {16720, 15, 5}} {
		item := core.ItemsByID[row.id]
		kfcDruidNear(t, item.Stats[stats.HealingPower], row.healing)
		kfcDruidNear(t, item.Stats[stats.SpellDamage], row.damage)
		kfcDruidNear(t, item.Stats[stats.SpellPower], 0)
		output = append(output, float64(row.id), item.Stats[stats.HealingPower], item.Stats[stats.SpellDamage])
	}
	observed := core.ItemsByID[272681]
	kfcDruidNear(t, observed.Stats[stats.HealingPower], 176)
	kfcDruidNear(t, observed.Stats[stats.SpellDamage], 58)
	kfcDruidAdvancedResult("STATIC_HEALING_CATALOG", output)
}

func TestKFCDruidStaticHealingFeedsActualCasts(t *testing.T) {
	amounts, powers := []float64{}, []float64{}
	for _, count := range []int{0, 8} {
		sim, healer := kfcWildheartFixture(t, count)
		kfcWildheartConfigure(t, healer, 0, "completed-casts")
		target := &sim.Raid.GetFirstTargetDummy().Unit
		target.RemoveHealth(sim, 9000)
		spell := healer.GetSpell(core.ActionID{SpellID: 5185})
		spell.BonusCritRating = -10000
		powers = append(powers, spell.HealingPower(target))
		if !spell.Cast(sim, target) {
			t.Fatal("Static-healing cast rejected")
		}
		kfcDruidAdvance(t, sim, 1500*time.Millisecond)
		amounts = append(amounts, spell.SpellMetrics[target.UnitIndex].TotalHealing)
	}
	// Preserve 31 on the other pieces, recover 81, and apply the current 18-point set bonus once.
	kfcDruidNear(t, powers[1]-powers[0], 130)
	kfcDruidNear(t, amounts[1]-amounts[0], .429*130)
	kfcDruidAdvancedResult("STATIC_HEALING_CASTS", append(powers, amounts...))
}
