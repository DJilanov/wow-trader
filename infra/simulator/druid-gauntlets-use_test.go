package restoration

import (
	"context"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/stats"
)

func kfcTimedGauntletsPolicy() KFCDruidUtilityProbePolicy {
	p := kfcUtilityPolicy()
	p.Mode = "gauntlets-timed-use"
	p.Gauntlets = true
	return p
}

func TestKFCDruidGauntletsActualAmountCoefficientCritAndGCD(t *testing.T) {
	values := [][]float64{}
	for _, critical := range []bool{false, true} {
		sim, healer := kfcUtilityFixture(t, 8346)
		healer.AddStatDynamic(sim, stats.HealingPower, 5000)
		healer.AddStatDynamic(sim, stats.SpellCrit, 100*core.SpellCritRatingPerCritChance)
		p := kfcTimedGauntletsPolicy()
		p.GauntletsCanCrit = critical
		if err := healer.ConfigureKFCUtilityProbe(sim, p); err != nil {
			t.Fatal(err)
		}
		target := &sim.Raid.GetFirstTargetDummy().Unit
		target.RemoveHealth(sim, 4000)
		beforeHealth, beforeMana := target.CurrentHealth(), healer.CurrentMana()
		healer.useKFCUtilityProbes(sim)
		healed := target.CurrentHealth() - beforeHealth
		low, high := 300.0, 500.0
		if critical {
			low, high = 450, 750
		}
		if healed < low || healed > high {
			t.Fatal("Wrong actual heal or zero coefficient", healed)
		}
		kfcDruidNear(t, healer.CurrentMana(), beforeMana)
		if healer.GCD.ReadyAt() != 1500*time.Millisecond {
			t.Fatal("Actual GCD missing", healer.GCD.ReadyAt())
		}
		if healer.utilityProbes.gauntletUse.CD.ReadyAt() != 30*time.Minute {
			t.Fatal("Wrong item cooldown")
		}
		healer.useKFCUtilityProbes(sim)
		kfcDruidNear(t, target.CurrentHealth(), beforeHealth+healed)
		kfcDruidAdvance(t, sim, 2*time.Second)
		healer.useKFCUtilityProbes(sim)
		kfcDruidNear(t, target.CurrentHealth(), beforeHealth+healed)
		values = append(values, []float64{healed, float64(healer.utilityProbes.gauntletUse.CD.ReadyAt())})
	}
	kfcDruidAdvancedResult("GAUNTLETS_ACTUAL_AMOUNT", values)
}

func TestKFCDruidGauntletsBusyRangeDeathAndReset(t *testing.T) {
	sim, healer := kfcUtilityFixture(t, 8346)
	p := kfcTimedGauntletsPolicy()
	if err := healer.ConfigureKFCUtilityProbe(sim, p); err != nil {
		t.Fatal(err)
	}
	target := &sim.Raid.GetFirstTargetDummy().Unit
	target.RemoveHealth(sim, 3000)
	before := target.CurrentHealth()
	healer.Hardcast.Expires = time.Second
	healer.useKFCUtilityProbes(sim)
	kfcDruidNear(t, target.CurrentHealth(), before)
	healer.Hardcast.Expires = 0
	healer.positions[target.UnitIndex] = KFCDruidFriendlyPosition{X: 40.01}
	healer.useKFCUtilityProbes(sim)
	kfcDruidNear(t, target.CurrentHealth(), before)
	healer.positions[target.UnitIndex] = KFCDruidFriendlyPosition{X: 40}
	healer.useKFCUtilityProbes(sim)
	if target.CurrentHealth() <= before {
		t.Fatal("Boundary target was not healed")
	}
	sim.Cleanup()
	sim.Reset()
	if !healer.utilityProbes.gauntletUse.CD.IsReady(sim) {
		t.Fatal("Cooldown leaked across iterations")
	}
	target.RemoveHealth(sim, 3000)
	healer.RemoveHealth(sim, healer.CurrentHealth())
	before = target.CurrentHealth()
	healer.useKFCUtilityProbes(sim)
	kfcDruidNear(t, target.CurrentHealth(), before)
	kfcDruidAdvancedResult("GAUNTLETS_ACTUAL_LIFECYCLE", true)
}

func TestKFCDruidGauntletsStrictModeAndOwnership(t *testing.T) {
	for _, field := range []string{"circle", "recombobulator", "baron", "mana", "missing-gloves", "unused-critical"} {
		p := kfcTimedGauntletsPolicy()
		switch field {
		case "circle":
			p.Circle = true
		case "recombobulator":
			p.Recombobulator = true
		case "baron":
			p.BaronRegeneration = true
		case "mana":
			p.MinimumMissingMana = 1
		case "missing-gloves":
			p.Gauntlets = false
		case "unused-critical":
			p.Mode = "disabled"
			p.Gauntlets = false
			p.GauntletsCanCrit = true
		}
		if p.Validate() == nil {
			t.Fatal("Invalid mode accepted", field)
		}
	}
	sim, healer := kfcUtilityFixture(t)
	if healer.ConfigureKFCUtilityProbe(sim, kfcTimedGauntletsPolicy()) == nil {
		t.Fatal("Unequipped use admitted")
	}
	kfcDruidAdvancedResult("GAUNTLETS_ACTUAL_GUARDS", true)
}

func TestKFCDruidGauntletsActualWorkloadController(t *testing.T) {
	request, frame := kfcDruidWorkloadControl()
	request.Raid.Parties[0].Players[0] = kfcUtilityRequest(8346).Raid.Parties[0].Players[0]
	frame.Priorities[0].MinimumMissingHealth = 100000
	baseline := RunKFCDruidHealingJob(context.Background(), kfcDruidControlPayload(t, request, frame, "gauntlets-actual-disabled", false))
	p := kfcTimedGauntletsPolicy()
	frame.UtilityProbe = &p
	active := RunKFCDruidHealingJob(context.Background(), kfcDruidControlPayload(t, request, frame, "gauntlets-actual-active", false))
	if baseline.Status != "complete" || active.Status != "complete" {
		t.Fatal(baseline.Error, active.Error)
	}
	if baseline.Result.RawHPS != 0 || active.Result.RawHPS <= 0 || active.Result.RawHPS > 500/request.Encounter.Duration || active.Result.MissingHealthSecondsMean >= baseline.Result.MissingHealthSecondsMean {
		t.Fatal("Actual Gauntlets controller was not used", active.Result)
	}
	kfcDruidAdvancedResult("GAUNTLETS_ACTUAL_CONTROLLER", []float64{baseline.Result.MissingHealthSecondsMean, active.Result.MissingHealthSecondsMean, active.Result.RawHPS})
}
