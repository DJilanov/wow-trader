package restoration

import (
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
)

func kfcFlatItemRegenFixture(t *testing.T, gear map[int]int32, timing string) (*core.Simulation, *RestorationShaman) {
	t.Helper()
	request := kfcShamanRequest(500)
	request.Encounter.Duration = 60
	player := request.Raid.Parties[0].Players[0]
	player.TalentsString = kfcRiptideTalentString(map[string]int32{"riptide": 1, "water_shield": 1})
	player.Equipment = &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
	for slot := range player.Equipment.Items {
		player.Equipment.Items[slot] = &proto.ItemSpec{Id: gear[slot]}
	}
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	resto := sim.Raid.Parties[0].Players[0].(*RestorationShaman)
	resources := kfcShamanResourceDefault()
	resources.ShieldTriggers = "all-critical-heals-reference"
	kfcRiptideConfigure(t, sim, resto, kfcRiptideDefault(), resources)
	if timing != "" {
		if err := resto.ConfigureKFCShamanFlatItemRegeneration(sim, KFCShamanHealthRegenerationPolicy{TickTiming: timing}); err != nil {
			t.Fatal(err)
		}
	}
	return sim, resto
}

func TestKFCShamanFlatItemSourceAmountsAndBothCadences(t *testing.T) {
	for _, source := range []struct {
		id            int32
		slot          int
		healthPerFive float64
	}{
		{2816, 14, 12}, {6320, 15, 4}, {6459, 9, 6}, {6461, 2, 10},
		{6910, 8, 5}, {7684, 2, 9}, {14149, 3, 5}, {17743, 14, 11},
	} {
		for _, timing := range []string{"two-second-ticks-reference", "five-second-ticks-reference"} {
			sim, resto := kfcFlatItemRegenFixture(t, map[int]int32{source.slot: source.id}, timing)
			period := 2 * time.Second
			if timing == "five-second-ticks-reference" {
				period = 5 * time.Second
			}
			resto.RemoveHealth(sim, 200)
			before := resto.CurrentHealth()
			kfcShamanAdvance(t, sim, period-time.Millisecond)
			kfcShamanNear(t, resto.CurrentHealth(), before)
			kfcShamanAdvance(t, sim, period)
			kfcShamanNear(t, resto.CurrentHealth()-before, source.healthPerFive*period.Seconds()/5)
			kfcShamanAdvance(t, sim, 10*time.Second)
			metrics := resto.KFCShamanFlatItemRegenerationMetrics()
			kfcShamanNear(t, metrics.Attempted, 2*source.healthPerFive)
			kfcShamanNear(t, metrics.Restored, 2*source.healthPerFive)
			if metrics.Ticks != int32(10*time.Second/period) {
				t.Fatal("Wrong flat-item tick count", source.id, metrics)
			}
			state := resto.kfcFlatItemRegeneration
			if state == nil || len(state.sources) != 1 || state.sources[0].itemID != source.id {
				t.Fatal("Wrong equipped source")
			}
			kfcShamanNear(t, state.sources[0].resource.ActualGainForCurrentIteration(), 2*source.healthPerFive)
			kfcShamanMeasure("FLAT_ITEM_REGEN_AMOUNT", map[string]interface{}{"id": source.id, "timing": timing, "metrics": metrics})
			sim.Cleanup()
		}
	}
}

func TestKFCShamanFlatItemStackingWithShadowcraftIsAdditive(t *testing.T) {
	gear := map[int]int32{0: 16707, 2: 16708, 8: 16709, 5: 16710, 9: 16711, 6: 16712, 14: 2816, 15: 6320}
	sim, resto := kfcFlatItemRegenFixture(t, gear, "five-second-ticks-reference")
	defer sim.Cleanup()
	if err := resto.ConfigureKFCShamanHealthRegeneration(sim, KFCShamanHealthRegenerationPolicy{TickTiming: "five-second-ticks-reference"}); err != nil {
		t.Fatal(err)
	}
	resto.RemoveHealth(sim, 200)
	before := resto.CurrentHealth()
	kfcShamanAdvance(t, sim, 10*time.Second)
	kfcShamanNear(t, resto.CurrentHealth()-before, 62)
	kfcShamanNear(t, resto.KFCShamanFlatItemRegenerationMetrics().Restored, 32)
	kfcShamanNear(t, resto.KFCShamanHealthRegenerationMetrics().Restored, 30)
	if len(resto.kfcFlatItemRegeneration.sources) != 2 {
		t.Fatal("Wrong multi-item source count")
	}
	kfcShamanMeasure("FLAT_ITEM_REGEN_STACK", map[string]interface{}{"items": resto.KFCShamanFlatItemRegenerationMetrics(), "set": resto.KFCShamanHealthRegenerationMetrics()})
}

func TestKFCShamanFlatItemCapSeparatesAttemptedAndUseful(t *testing.T) {
	sim, resto := kfcFlatItemRegenFixture(t, map[int]int32{14: 2816}, "five-second-ticks-reference")
	defer sim.Cleanup()
	resto.RemoveHealth(sim, 4)
	kfcShamanAdvance(t, sim, 10*time.Second)
	metrics := resto.KFCShamanFlatItemRegenerationMetrics()
	if metrics.Ticks != 2 {
		t.Fatal("Wrong tick count", metrics)
	}
	kfcShamanNear(t, metrics.Attempted, 24)
	kfcShamanNear(t, metrics.Restored, 4)
	kfcShamanNear(t, resto.kfcFlatItemRegeneration.sources[0].resource.Gain, 24)
	kfcShamanNear(t, resto.kfcFlatItemRegeneration.sources[0].resource.ActualGainForCurrentIteration(), 4)
	kfcShamanNear(t, resto.CurrentHealth(), resto.MaxHealth())
	kfcShamanMeasure("FLAT_ITEM_REGEN_CAP", metrics)
}

func TestKFCShamanFlatItemIgnoresHealingPowerCritAndSpellCallbacks(t *testing.T) {
	for _, extraPower := range []float64{0, 1000} {
		sim, resto := kfcFlatItemRegenFixture(t, map[int]int32{14: 2816}, "two-second-ticks-reference")
		resto.AddStatDynamic(sim, stats.HealingPower, extraPower)
		resto.AddStatDynamic(sim, stats.SpellCrit, 100)
		observer := resto.GetAura("Berserking")
		if observer == nil || observer.IsActive() {
			t.Fatal("Missing inactive observer")
		}
		observer.OnGain, observer.OnExpire, observer.Duration = nil, nil, core.NeverExpires
		direct, periodic := 0, 0
		observer.OnHealDealt = func(_ *core.Aura, _ *core.Simulation, _ *core.Spell, _ *core.SpellResult) { direct++ }
		observer.OnPeriodicHealDealt = func(_ *core.Aura, _ *core.Simulation, _ *core.Spell, _ *core.SpellResult) { periodic++ }
		observer.Activate(sim)
		resto.RemoveHealth(sim, 200)
		kfcShamanAdvance(t, sim, 10*time.Second)
		metrics := resto.KFCShamanFlatItemRegenerationMetrics()
		kfcShamanNear(t, metrics.Restored, 24)
		if direct != 0 || periodic != 0 {
			t.Fatal("Resource regeneration dispatched healing spells", direct, periodic)
		}
		kfcShamanMeasure("FLAT_ITEM_REGEN_POWER", map[string]interface{}{"extraPower": extraPower, "metrics": metrics, "direct": direct, "periodic": periodic})
		sim.Cleanup()
	}
}

func TestKFCShamanFlatItemCannotFeedWaterShield(t *testing.T) {
	sim, resto := kfcFlatItemRegenFixture(t, map[int]int32{14: 2816}, "two-second-ticks-reference")
	defer sim.Cleanup()
	resto.RemoveHealth(sim, 200)
	resto.AddStatDynamic(sim, stats.SpellCrit, 100)
	if !resto.WaterShield.Cast(sim, &resto.Unit) {
		t.Fatal("Water Shield cast rejected")
	}
	resto.SpendMana(sim, 1000, resto.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 981}))
	kfcShamanAdvance(t, sim, 10*time.Second)
	kfcShamanNear(t, resto.kfcActives.shieldMetrics.ActualGainForCurrentIteration(), 0)
	kfcShamanNear(t, resto.KFCShamanFlatItemRegenerationMetrics().Restored, 24)
	kfcShamanMeasure("FLAT_ITEM_REGEN_SHIELD", resto.kfcActives.shieldMetrics.ActualGainForCurrentIteration())
}

func TestKFCShamanFlatItemDeadOwnerCannotRevive(t *testing.T) {
	sim, resto := kfcFlatItemRegenFixture(t, map[int]int32{14: 2816}, "two-second-ticks-reference")
	defer sim.Cleanup()
	resto.RemoveHealth(sim, resto.CurrentHealth())
	kfcShamanAdvance(t, sim, 10*time.Second)
	kfcShamanNear(t, resto.CurrentHealth(), 0)
	if resto.KFCShamanFlatItemRegenerationMetrics().Ticks != 0 {
		t.Fatal("Dead owner regenerated")
	}
	kfcShamanMeasure("FLAT_ITEM_REGEN_DEATH", resto.KFCShamanFlatItemRegenerationMetrics())
}

func TestKFCShamanFlatItemResetDiscardsStaleCallbacks(t *testing.T) {
	sim, resto := kfcFlatItemRegenFixture(t, map[int]int32{14: 2816}, "five-second-ticks-reference")
	defer sim.Cleanup()
	aura := resto.GetAura("KFC flat-item health regeneration")
	aura.OnReset(aura, sim)
	resto.RemoveHealth(sim, 200)
	kfcShamanAdvance(t, sim, 5*time.Second)
	if resto.KFCShamanFlatItemRegenerationMetrics().Ticks != 1 {
		t.Fatal("Duplicate stale callback")
	}
	sim.Cleanup()
	sim.Reset()
	if resto.KFCShamanFlatItemRegenerationMetrics().Ticks != 0 {
		t.Fatal("Metrics survived reset")
	}
	resto.RemoveHealth(sim, 200)
	kfcShamanAdvance(t, sim, 5*time.Second)
	metrics := resto.KFCShamanFlatItemRegenerationMetrics()
	if metrics.Ticks != 1 {
		t.Fatal("Reset scheduled duplicate callbacks", metrics)
	}
	kfcShamanNear(t, metrics.Restored, 12)
	kfcShamanMeasure("FLAT_ITEM_REGEN_RESET", metrics)
}

func TestKFCShamanFlatItemPolicyRequiresFreshEquippedOwner(t *testing.T) {
	sim, resto := kfcFlatItemRegenFixture(t, map[int]int32{14: 2816}, "")
	defer sim.Cleanup()
	policy := KFCShamanHealthRegenerationPolicy{TickTiming: "five-second-ticks-reference"}
	if resto.ConfigureKFCShamanFlatItemRegeneration(nil, policy) == nil {
		t.Fatal("Nil simulation admitted")
	}
	positions := resto.positions
	resto.positions = nil
	if resto.ConfigureKFCShamanFlatItemRegeneration(sim, policy) == nil {
		t.Fatal("Unpositioned owner admitted")
	}
	resto.positions = positions
	if resto.ConfigureKFCShamanFlatItemRegeneration(sim, KFCShamanHealthRegenerationPolicy{TickTiming: "guessed"}) == nil {
		t.Fatal("Unknown timing admitted")
	}
	if err := resto.ConfigureKFCShamanFlatItemRegeneration(sim, policy); err != nil {
		t.Fatal(err)
	}
	if resto.ConfigureKFCShamanFlatItemRegeneration(sim, policy) == nil {
		t.Fatal("Repeated policy admitted")
	}
	echo := resto.KFCShamanFlatItemRegenerationPolicyEcho()
	if echo == nil {
		t.Fatal("Missing policy echo")
	}
	echo.TickTiming = "changed"
	if resto.KFCShamanFlatItemRegenerationPolicyEcho().TickTiming != policy.TickTiming {
		t.Fatal("Aliased policy echo")
	}
	kfcShamanAdvance(t, sim, time.Second)
	if resto.ConfigureKFCShamanFlatItemRegeneration(sim, policy) == nil {
		t.Fatal("Late policy admitted")
	}
	kfcShamanMeasure("FLAT_ITEM_REGEN_POLICY", resto.KFCShamanFlatItemRegenerationPolicyEcho())
}

func TestKFCShamanFlatItemCastRequiresItsDeclaredCadence(t *testing.T) {
	sim, resto := kfcFlatItemRegenFixture(t, map[int]int32{14: 2816}, "")
	defer sim.Cleanup()
	spell := resto.GetSpell(core.ActionID{SpellID: 331})
	resto.RemoveHealth(sim, 500)
	if spell == nil || spell.Cast(sim, &resto.Unit) {
		t.Fatal("Unconfigured item owner cast")
	}
	if err := resto.ConfigureKFCShamanFlatItemRegeneration(sim, KFCShamanHealthRegenerationPolicy{TickTiming: "five-second-ticks-reference"}); err != nil {
		t.Fatal(err)
	}
	if !spell.Cast(sim, &resto.Unit) {
		t.Fatal("Configured item owner could not cast")
	}
	kfcShamanAdvance(t, sim, 5*time.Second)
	if resto.KFCShamanFlatItemRegenerationMetrics().Attempted <= 0 {
		t.Fatal("No actual resource tick after casting")
	}
	kfcShamanMeasure("FLAT_ITEM_REGEN_CAST_GUARD", resto.KFCShamanFlatItemRegenerationMetrics())
}

func TestKFCShamanFlatItemOtherModifiersDoNotCreateRegeneration(t *testing.T) {
	for _, gear := range []map[int]int32{{}, {14: 12775}, {12: 272437}} {
		sim, resto := kfcFlatItemRegenFixture(t, gear, "")
		if resto.kfcFlatItemRegeneration != nil {
			t.Fatal("Unrelated equipment gained flat regeneration")
		}
		if resto.ConfigureKFCShamanFlatItemRegeneration(sim, KFCShamanHealthRegenerationPolicy{TickTiming: "five-second-ticks-reference"}) == nil {
			t.Fatal("Unequipped owner admitted")
		}
		resto.RemoveHealth(sim, 200)
		before := resto.CurrentHealth()
		kfcShamanAdvance(t, sim, 10*time.Second)
		kfcShamanNear(t, resto.CurrentHealth(), before)
		kfcShamanMeasure("FLAT_ITEM_REGEN_NONOWNER", map[string]interface{}{"gear": gear, "metrics": resto.KFCShamanFlatItemRegenerationMetrics()})
		sim.Cleanup()
	}
}
