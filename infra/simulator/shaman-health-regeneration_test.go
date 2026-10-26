package restoration

import (
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
)

func kfcShamanHealthRegenFixture(t *testing.T, pieces int, timing string) (*core.Simulation, *RestorationShaman) {
	t.Helper()
	request := kfcShamanRequest(500)
	request.Encounter.Duration = 60
	player := request.Raid.Parties[0].Players[0]
	player.TalentsString = kfcRiptideTalentString(map[string]int32{"riptide": 1, "water_shield": 1})
	player.Equipment = &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
	for slot := range player.Equipment.Items {
		player.Equipment.Items[slot] = &proto.ItemSpec{}
	}
	for index, row := range []struct {
		slot int
		id   int32
	}{{0, 16707}, {2, 16708}, {8, 16709}, {5, 16710}, {9, 16711}, {6, 16712}, {7, 16713}, {4, 16721}} {
		if index < pieces {
			player.Equipment.Items[row.slot].Id = row.id
		}
	}
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	resto := sim.Raid.Parties[0].Players[0].(*RestorationShaman)
	resources := kfcShamanResourceDefault()
	resources.ShieldTriggers = "all-critical-heals-reference"
	kfcRiptideConfigure(t, sim, resto, kfcRiptideDefault(), resources)
	if timing != "" {
		if err := resto.ConfigureKFCShamanHealthRegeneration(sim, KFCShamanHealthRegenerationPolicy{TickTiming: timing}); err != nil {
			t.Fatal(err)
		}
	}
	return sim, resto
}

func TestKFCShamanHealthRegenExactThresholdAndCurrentFlatBonuses(t *testing.T) {
	for pieces := 0; pieces <= 8; pieces++ {
		timing := ""
		if pieces >= 6 {
			timing = "two-second-ticks-reference"
		}
		sim, resto := kfcShamanHealthRegenFixture(t, pieces, timing)
		var thresholds []int32
		for _, bonus := range resto.GetActiveSetBonuses() {
			if bonus.Name == "Shadowcraft Armor" {
				thresholds = append(thresholds, bonus.NumPieces)
			}
		}
		for _, threshold := range []int32{2, 3, 6} {
			count := 0
			for _, active := range thresholds {
				if active == threshold {
					count++
				}
			}
			want := 0
			if pieces >= int(threshold) {
				want = 1
			}
			if count != want {
				t.Fatal("Wrong owned/current threshold", pieces, threshold, count)
			}
		}
		if (resto.kfcHealthRegeneration != nil) != (pieces >= 6) {
			t.Fatal("Wrong exact owner", pieces)
		}
		kfcShamanMeasure("HEALTH_REGEN_THRESHOLDS", map[string]interface{}{"pieces": pieces, "active": thresholds})
		sim.Cleanup()
	}
}

func TestKFCShamanHealthRegenBothCadencesAndNoImmediateTick(t *testing.T) {
	for _, timing := range []string{"two-second-ticks-reference", "five-second-ticks-reference"} {
		sim, resto := kfcShamanHealthRegenFixture(t, 6, timing)
		resto.RemoveHealth(sim, 100)
		before := resto.CurrentHealth()
		period := resto.kfcHealthRegeneration.period
		kfcShamanAdvance(t, sim, period-time.Millisecond)
		kfcShamanNear(t, resto.CurrentHealth(), before)
		kfcShamanAdvance(t, sim, period)
		kfcShamanNear(t, resto.CurrentHealth()-before, 15*period.Seconds()/5)
		kfcShamanAdvance(t, sim, 10*time.Second)
		kfcShamanNear(t, resto.CurrentHealth()-before, 30)
		kfcShamanNear(t, resto.KFCShamanHealthRegenerationMetrics().Restored, 30)
		kfcShamanMeasure("HEALTH_REGEN_CADENCE", map[string]interface{}{"timing": timing, "metrics": resto.KFCShamanHealthRegenerationMetrics()})
		sim.Cleanup()
	}
}

func TestKFCShamanHealthRegenCapSeparatesAttemptedAndUseful(t *testing.T) {
	sim, resto := kfcShamanHealthRegenFixture(t, 6, "five-second-ticks-reference")
	defer sim.Cleanup()
	resto.RemoveHealth(sim, 4)
	kfcShamanAdvance(t, sim, 10*time.Second)
	metrics := resto.KFCShamanHealthRegenerationMetrics()
	if metrics.Ticks != 2 {
		t.Fatal("Wrong tick count", metrics)
	}
	kfcShamanNear(t, metrics.Attempted, 30)
	kfcShamanNear(t, metrics.Restored, 4)
	kfcShamanNear(t, resto.kfcHealthRegeneration.resource.Gain, 30)
	kfcShamanNear(t, resto.kfcHealthRegeneration.resource.ActualGainForCurrentIteration(), 4)
	kfcShamanNear(t, resto.CurrentHealth(), resto.MaxHealth())
	kfcShamanMeasure("HEALTH_REGEN_CAP", metrics)
}

func TestKFCShamanHealthRegenIgnoresHealingPowerCritAndSpellCallbacks(t *testing.T) {
	for _, extraPower := range []float64{0, 1000} {
		sim, resto := kfcShamanHealthRegenFixture(t, 6, "two-second-ticks-reference")
		resto.AddStatDynamic(sim, stats.HealingPower, extraPower)
		resto.AddStatDynamic(sim, stats.SpellCrit, 100)
		observer := resto.GetAura("Berserking")
		if observer == nil || observer.IsActive() {
			t.Fatal("Missing inactive observer")
		}
		observer.OnGain, observer.OnExpire = nil, nil
		observer.Duration = core.NeverExpires
		direct, periodic := 0, 0
		observer.OnHealDealt = func(_ *core.Aura, _ *core.Simulation, _ *core.Spell, _ *core.SpellResult) { direct++ }
		observer.OnPeriodicHealDealt = func(_ *core.Aura, _ *core.Simulation, _ *core.Spell, _ *core.SpellResult) { periodic++ }
		observer.Activate(sim)
		resto.RemoveHealth(sim, 100)
		kfcShamanAdvance(t, sim, 10*time.Second)
		metrics := resto.KFCShamanHealthRegenerationMetrics()
		kfcShamanNear(t, metrics.Restored, 30)
		if direct != 0 || periodic != 0 || resto.GetSpell(core.ActionID{SpellID: 21347}) != nil {
			t.Fatal("Regeneration became a healing spell", direct, periodic)
		}
		kfcShamanMeasure("HEALTH_REGEN_POWER", map[string]interface{}{"extraPower": extraPower, "metrics": metrics, "direct": direct, "periodic": periodic})
		sim.Cleanup()
	}
}

func TestKFCShamanHealthRegenCannotFeedWaterShield(t *testing.T) {
	sim, resto := kfcShamanHealthRegenFixture(t, 6, "two-second-ticks-reference")
	defer sim.Cleanup()
	resto.AddStatDynamic(sim, stats.SpellCrit, 100)
	resto.RemoveHealth(sim, 100)
	if !resto.WaterShield.Cast(sim, &resto.Unit) {
		t.Fatal("Shield cast rejected")
	}
	resto.SpendMana(sim, 1000, resto.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 980}))
	kfcShamanAdvance(t, sim, 10*time.Second)
	kfcShamanNear(t, resto.kfcActives.shieldMetrics.ActualGainForCurrentIteration(), 0)
	kfcShamanNear(t, resto.KFCShamanHealthRegenerationMetrics().Restored, 30)
	kfcShamanMeasure("HEALTH_REGEN_SHIELD", resto.kfcActives.shieldMetrics.ActualGainForCurrentIteration())
}

func TestKFCShamanHealthRegenDeadOwnerCannotRevive(t *testing.T) {
	sim, resto := kfcShamanHealthRegenFixture(t, 6, "two-second-ticks-reference")
	defer sim.Cleanup()
	resto.RemoveHealth(sim, resto.CurrentHealth())
	kfcShamanAdvance(t, sim, 10*time.Second)
	kfcShamanNear(t, resto.CurrentHealth(), 0)
	if resto.KFCShamanHealthRegenerationMetrics().Ticks != 0 {
		t.Fatal("Dead owner regenerated")
	}
	kfcShamanMeasure("HEALTH_REGEN_DEATH", resto.KFCShamanHealthRegenerationMetrics())
}

func TestKFCShamanHealthRegenResetAndGenerationDiscardStaleTicks(t *testing.T) {
	sim, resto := kfcShamanHealthRegenFixture(t, 6, "five-second-ticks-reference")
	defer sim.Cleanup()
	aura := resto.GetAura("KFC Shadowcraft health regeneration")
	aura.OnReset(aura, sim)
	resto.RemoveHealth(sim, 100)
	kfcShamanAdvance(t, sim, 5*time.Second)
	if resto.KFCShamanHealthRegenerationMetrics().Ticks != 1 {
		t.Fatal("Duplicate stale tick")
	}
	sim.Cleanup()
	sim.Reset()
	if resto.KFCShamanHealthRegenerationMetrics().Ticks != 0 {
		t.Fatal("Metrics survived reset")
	}
	resto.RemoveHealth(sim, 100)
	kfcShamanAdvance(t, sim, 5*time.Second)
	metrics := resto.KFCShamanHealthRegenerationMetrics()
	if metrics.Ticks != 1 {
		t.Fatal("Reset scheduled duplicate ticks", metrics)
	}
	kfcShamanNear(t, metrics.Restored, 15)
	kfcShamanMeasure("HEALTH_REGEN_RESET", metrics)
}

func TestKFCShamanHealthRegenPolicyRequiresFreshEquippedOwner(t *testing.T) {
	for _, pieces := range []int{0, 5, 6} {
		sim, resto := kfcShamanHealthRegenFixture(t, pieces, "")
		policy := KFCShamanHealthRegenerationPolicy{TickTiming: "two-second-ticks-reference"}
		if resto.ConfigureKFCShamanHealthRegeneration(nil, policy) == nil {
			t.Fatal("Nil simulation admitted")
		}
		if pieces < 6 {
			if resto.ConfigureKFCShamanHealthRegeneration(sim, policy) == nil {
				t.Fatal("Missing threshold admitted")
			}
		} else {
			if resto.ConfigureKFCShamanHealthRegeneration(sim, KFCShamanHealthRegenerationPolicy{TickTiming: "guessed"}) == nil {
				t.Fatal("Guessed timing admitted")
			}
			positions := resto.positions
			resto.positions = nil
			if resto.ConfigureKFCShamanHealthRegeneration(sim, policy) == nil {
				t.Fatal("Unpositioned owner admitted")
			}
			resto.positions = positions
			if err := resto.ConfigureKFCShamanHealthRegeneration(sim, policy); err != nil {
				t.Fatal(err)
			}
			policy.TickTiming = "changed"
			echo := resto.KFCShamanHealthRegenerationPolicyEcho()
			echo.TickTiming = "changed-again"
			if resto.KFCShamanHealthRegenerationPolicyEcho().TickTiming != "two-second-ticks-reference" {
				t.Fatal("Policy aliases caller storage")
			}
			if resto.ConfigureKFCShamanHealthRegeneration(sim, *echo) == nil {
				t.Fatal("Reconfiguration admitted")
			}
		}
		kfcShamanMeasure("HEALTH_REGEN_POLICY", map[string]interface{}{"pieces": pieces, "echo": resto.KFCShamanHealthRegenerationPolicyEcho()})
		sim.Cleanup()
	}
}

func TestKFCShamanHealthRegenUnconfiguredCastsAndLateConfigurationRejected(t *testing.T) {
	sim, resto := kfcShamanHealthRegenFixture(t, 6, "")
	defer sim.Cleanup()
	target := resto.kfcHealingPlayers()[1]
	spell := resto.GetSpell(core.ActionID{SpellID: 10468})
	if spell.CanCast(sim, target) {
		t.Fatal("Unconfigured equipped owner can cast")
	}
	kfcShamanAdvance(t, sim, time.Millisecond)
	if resto.ConfigureKFCShamanHealthRegeneration(sim, KFCShamanHealthRegenerationPolicy{TickTiming: "two-second-ticks-reference"}) == nil {
		t.Fatal("Late policy admitted")
	}
	kfcShamanNear(t, resto.KFCShamanHealthRegenerationMetrics().Attempted, 0)
	kfcShamanMeasure("HEALTH_REGEN_UNCONFIGURED", true)
}
