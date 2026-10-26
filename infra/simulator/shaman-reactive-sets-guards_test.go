package restoration

import (
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/stats"
)

func TestKFCShamanReactiveDeadViperOwnerWithManaDeficit(t *testing.T) {
	policy := kfcShamanReactivePolicy("after-hit", false, .02)
	sim, resto := kfcShamanReactiveFixture(t, 162, 4, &policy)
	defer sim.Cleanup()
	resto.RemoveHealth(sim, resto.MaxHealth()*.81)
	resto.SpendMana(sim, 1000, resto.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 1117}))
	kfcShamanReactiveDamage(sim, resto, &resto.Unit, 1, false, true)
	if !resto.kfcReactiveSets.viper.Hot(&resto.Unit).IsActive() {
		t.Fatal("Death guard requires an active recovery effect")
	}
	resto.RemoveHealth(sim, resto.CurrentHealth())
	kfcShamanAdvance(t, sim, 5*time.Second)
	kfcShamanNear(t, resto.CurrentHealth(), 0)
	kfcShamanNear(t, resto.kfcReactiveSets.viperMana.Gain, 0)
	kfcShamanNear(t, resto.kfcReactiveSets.viperMana.ActualGainForCurrentIteration(), 0)
	kfcShamanMeasure("REACTIVE_DEAD_MANA_DEFICIT", 0)
}

func TestKFCShamanReactiveDevoutDurationAndCooldownBoundary(t *testing.T) {
	policy := kfcShamanReactivePolicy("after-hit", false, 1)
	sim, resto := kfcShamanReactiveFixture(t, 182, 4, &policy)
	defer sim.Cleanup()
	resto.AddStatDynamic(sim, stats.HealingPower, 100000)
	kfcShamanReactiveDamage(sim, resto, &resto.Unit, 1, false, false)
	shield := resto.kfcReactiveSets.devout.SelfShield()
	kfcShamanNear(t, shield.RemainingAbsorb(), 488)
	kfcShamanAdvance(t, sim, 30*time.Second-time.Millisecond)
	if !shield.IsActive() {
		t.Fatal("Devout shield expired early")
	}
	kfcShamanAdvance(t, sim, 30*time.Second)
	if shield.IsActive() {
		t.Fatal("Devout shield exceeded thirty seconds")
	}
	kfcShamanAdvance(t, sim, 60*time.Second-time.Millisecond)
	kfcShamanReactiveDamage(sim, resto, &resto.Unit, 1, false, false)
	if shield.IsActive() {
		t.Fatal("Devout shield ignored its internal cooldown")
	}
	kfcShamanAdvance(t, sim, 60*time.Second)
	kfcShamanReactiveDamage(sim, resto, &resto.Unit, 1, false, false)
	if !shield.IsActive() {
		t.Fatal("Devout shield did not rearm at the exact cooldown boundary")
	}
	kfcShamanNear(t, shield.RemainingAbsorb(), 488)
	kfcShamanMeasure("REACTIVE_DEVOUT_DURATION_COOLDOWN", []int{30, 60, 488})
}
