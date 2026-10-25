package restoration

import (
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
)

func kfcViperManaGain(healer *RestorationDruid) float64 {
	gain := 0.0
	for _, resource := range healer.Metrics.ToProto().Resources {
		if resource.Id.GetSpellId() == 1291797 && resource.Type == proto.ResourceType_ResourceTypeMana {
			gain += resource.Gain
		}
	}
	return gain
}

func TestKFCDruidViperCannotTriggerOnLethalHitOrGrantManaAfterDeath(t *testing.T) {
	sim, healer := kfcSelfEffectsFixture(t, 162, 4, 0)
	kfcSelfDamage(sim, healer, 3000)
	if healer.selfEffects.viper.Hot(&healer.Unit).IsActive() || !healer.selfEffects.viperICD.IsReady(sim) {
		t.Fatal("Lethal hit triggered or consumed the low-health proc")
	}
	sim, healer = kfcSelfEffectsFixture(t, 162, 4, 0)
	healer.RemoveHealth(sim, 2300)
	healer.SpendMana(sim, 1000, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 91}))
	kfcSelfDamage(sim, healer, 1)
	kfcDruidAdvance(t, sim, time.Second)
	kfcDruidNear(t, kfcViperManaGain(healer), 20)
	kfcSelfDamage(sim, healer, healer.CurrentHealth())
	kfcDruidAdvance(t, sim, 6*time.Second)
	kfcDruidNear(t, kfcViperManaGain(healer), 20)
	kfcDruidNear(t, healer.CurrentHealth(), 0)
	if healer.selfEffects.viper.Hot(&healer.Unit).IsActive() {
		t.Fatal("Dead-caster resource ticks remain active")
	}
	kfcDruidAdvancedResult("SELF_VIPER_DEAD_MANA", kfcViperManaGain(healer))
}

func TestKFCDruidVitalityResetHasOneTimerAndNoPriorIterationCredit(t *testing.T) {
	sim := core.NewSim(kfcSelfEffectsRequest(t, 184, 6, 0), simsignals.CreateSignals())
	healer := sim.Raid.Parties[0].Players[0].(*RestorationDruid)
	kfcSelfPolicyApply(t, healer, kfcSelfPolicy())
	for iteration := 0; iteration < 2; iteration++ {
		sim.Reset()
		if err := healer.ConfigureKFCHealingBenchmarkHealth(sim, 3000); err != nil {
			t.Fatal(err)
		}
		healer.RemoveHealth(sim, 500)
		kfcDruidAdvance(t, sim, 2*time.Second)
		kfcDruidNear(t, healer.CurrentHealth(), 2506)
		kfcDruidNear(t, healer.kfcSelfRegenerationForIteration(), 6)
		if healer.ConfigureKFCDruidSelfEffects(kfcSelfPolicy()) == nil {
			t.Fatal("Self-effects changed after the regeneration timer began")
		}
		sim.Cleanup()
	}
}
