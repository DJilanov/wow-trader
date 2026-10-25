package healing

import (
	"fmt"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/stats"
)

func TestKFCPriestRenewLivePeriodicCrit(t *testing.T) {
	sim, priest, target := kfcPriestFixture(500)
	target.RemoveHealth(sim, 9000)
	spell := priest.GetSpell(core.ActionID{SpellID: 10929})
	spell.BonusCritRating = 10000
	before := target.CurrentHealth()
	if !spell.Cast(sim, target) {
		t.Fatal("Renew cast failed")
	}
	kfcPriestAdvance(t, sim, 3*time.Second)
	kfcPriestNear(t, target.CurrentHealth()-before, 234*1.5)
	priest.AddStatDynamic(sim, stats.HealingPower, 500)
	spell.BonusCritRating = -10000
	kfcPriestAdvance(t, sim, 6*time.Second)
	kfcPriestNear(t, target.CurrentHealth()-before, 234*2.5)
	kfcPriestNear(t, spell.SpellMetrics[target.UnitIndex].TotalCritHealing, 234*1.5)
	fmt.Printf("KFC_PRIEST_RENEW_LIVE_CRIT %.8f\n", target.CurrentHealth()-before)
}
