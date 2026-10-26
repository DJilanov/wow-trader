package restoration

import (
	"testing"
	"time"
)

func TestKFCShamanFlatItemUnconfiguredOwnerCannotChooseTimingLate(t *testing.T) {
	sim, resto := kfcFlatItemRegenFixture(t, map[int]int32{14: 2816}, "")
	defer sim.Cleanup()
	kfcShamanAdvance(t, sim, time.Second)
	if resto.kfcFlatItemRegeneration.configured || resto.GCD.ReadyAt() > 0 || resto.Hardcast.Expires > 0 {
		t.Fatal("The late-time probe must retain an otherwise fresh, unconfigured owner")
	}
	for _, spell := range resto.Spellbook {
		for _, metric := range spell.SpellMetrics {
			if metric.Casts > 0 || metric.Hits > 0 || metric.Crits > 0 || metric.Ticks > 0 || metric.CritTicks > 0 {
				t.Fatal("The late-time probe must not be rejected by an earlier spell event")
			}
		}
	}
	if resto.ConfigureKFCShamanFlatItemRegeneration(sim, KFCShamanHealthRegenerationPolicy{TickTiming: "five-second-ticks-reference"}) == nil {
		t.Fatal("A late unconfigured owner selected a new cadence")
	}
}
