package core

import "testing"

func TestKFCHealingPrecisionBounds(t *testing.T) {
	for _, amount := range []float64{1.1, 1e-14, 773.123456789} {
		for _, periodic := range []bool{false, true} {
			f := kfcNewHealingFixture()
			target := f.targets[0]
			target.RemoveHealth(f.sim, 1000)
			result := kfcDeliverHeal(f, f.spell, target, amount, true, periodic)
			if result.EffectiveHealing < 0 || result.EffectiveHealing > amount || result.Overhealing < 0 {
				t.Fatalf("Floating-point healing exceeded its raw amount: raw=%v, effective=%v, overhealing=%v", amount, result.EffectiveHealing, result.Overhealing)
			}
			kfcRequireHealing(t, result.EffectiveHealing+result.Overhealing, amount)
			metrics := kfcFinishHealing(f).RaidMetrics
			if metrics.OverhealingHps.Avg < 0 || metrics.EffectiveHealingHps.Avg > metrics.RawHealingHps.Avg {
				t.Fatal("Nonphysical healing escaped into the aggregate metrics")
			}
		}
	}
}
