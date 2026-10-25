package restoration

import (
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
)

func TestKFCDruidNaturesGraceSwiftmendGCDScope(t *testing.T) {
	sim, resto := kfcDruidAdvancedFixture(500, map[string]int32{"naturesGrace": 1, "swiftmend": 1, "wildGrowth": 1}, 2)
	target := &sim.Raid.GetFirstTargetDummy().Unit
	target.RemoveHealth(sim, 9000)
	rejuvenation := resto.GetSpell(core.ActionID{SpellID: 9841})
	rejuvenation.BonusCritRating = -10000
	if !rejuvenation.Cast(sim, target) {
		t.Fatal("Swiftmend GCD setup failed")
	}
	kfcDruidAdvance(t, sim, 1500*time.Millisecond)
	resto.NaturesGraceHasteAura.Activate(sim)
	swift := resto.GetSpell(core.ActionID{SpellID: 18562})
	swift.BonusCritRating = -10000
	if swift.DefaultCast.GCD != 1500*time.Millisecond {
		t.Fatal("Nature's Grace's family GCD modifier incorrectly affected Swiftmend")
	}
	if rejuvenation.DefaultCast.GCD != 1350*time.Millisecond || resto.GetSpell(core.ActionID{SpellID: 1238215}).DefaultCast.GCD != 1350*time.Millisecond {
		t.Fatal("Eligible Nature's Grace GCD scope was lost")
	}
	if !swift.Cast(sim, target) {
		t.Fatal("Hasted Swiftmend failed")
	}
	baseDuration := float64(1500 * time.Millisecond)
	expected := 1500*time.Millisecond + time.Duration(baseDuration/1.1)
	kfcDruidNear(t, resto.GCD.ReadyAt().Seconds(), expected.Seconds())
	kfcDruidAdvancedResult("SWIFTMEND_GCD_SCOPE", []float64{swift.DefaultCast.GCD.Seconds(), resto.GCD.ReadyAt().Seconds()})
}
