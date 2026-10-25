package restoration

import (
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/shaman"
)

func TestKFCShamanWaterSharedCooldownAfterGCDAndAtFiveMinutes(t *testing.T) {
	sim, resto, _ := kfcShamanWaterFixture(t, map[string]int32{"mana_tide_totem": 1}, 0, kfcShamanWaterDefault(), false)
	defer sim.Cleanup()
	if !resto.ManaTideTotem[4].Cast(sim, &resto.Unit) {
		t.Fatal("Tide start rejected")
	}
	kfcShamanAdvance(t, sim, time.Second)
	if !resto.GCD.IsReady(sim) {
		t.Fatal("Cooldown control is masked by global cooldown")
	}
	for _, spell := range resto.ManaTideTotem[1:] {
		if spell.CanCast(sim, &resto.Unit) {
			t.Fatal("Rank switch bypasses shared cooldown")
		}
	}
	kfcShamanAdvance(t, sim, 5*time.Minute-time.Millisecond)
	for _, spell := range resto.ManaTideTotem[1:] {
		if spell.CanCast(sim, &resto.Unit) {
			t.Fatal("Tide cooldown ended early")
		}
	}
	kfcShamanAdvance(t, sim, 5*time.Minute)
	for _, spell := range resto.ManaTideTotem[1:] {
		if !spell.CanCast(sim, &resto.Unit) {
			t.Fatal("Shared cooldown did not finish at five minutes")
		}
	}
	kfcShamanMeasure("WATER_SHARED_CD", true)
}

func TestKFCShamanWaterTideManaCapsPartyScopeAndDeadRecipients(t *testing.T) {
	for _, kind := range []string{"party", "raid", "dead"} {
		policy := kfcShamanWaterDefault()
		policy.FirstPulse = "immediate-reference"
		if kind != "party" {
			policy.Recipients = "raid-reference"
		}
		sim, resto, units := kfcShamanWaterFixture(t, map[string]int32{"mana_tide_totem": 1}, 0, policy, true)
		other := units[len(units)-1]
		other.SpendMana(sim, 1000, other.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 704}))
		if kind == "dead" {
			other.RemoveHealth(sim, other.CurrentHealth())
		}
		if !resto.ManaTideTotem[4].Cast(sim, &resto.Unit) {
			t.Fatal("Immediate tide rejected")
		}
		kfcShamanAdvance(t, sim, time.Millisecond)
		own := resto.kfcWater.manaMetrics[1325257][resto.UnitIndex]
		received := resto.kfcWater.manaMetrics[1325257][other.UnitIndex]
		kfcShamanNear(t, own.Gain, 290)
		kfcShamanNear(t, own.ActualGainForCurrentIteration(), 60)
		want := 0.0
		if kind == "raid" {
			want = 290
		}
		kfcShamanNear(t, received.ActualGainForCurrentIteration(), want)
		kfcShamanMeasure("WATER_MANA_CAP_SCOPE", map[string]interface{}{"kind": kind, "own": own.ActualGainForCurrentIteration(), "other": received.ActualGainForCurrentIteration()})
		sim.Cleanup()
	}
}

func TestKFCShamanWaterSameRankRefreshCancelsOldPulseAndExpiration(t *testing.T) {
	sim, resto, units := kfcShamanWaterFixture(t, nil, 0, kfcShamanWaterDefault(), false)
	defer sim.Cleanup()
	target := units[1]
	target.RemoveHealth(sim, 5000)
	before := target.CurrentHealth()
	spell := resto.HealingStreamTotem[5]
	if !spell.Cast(sim, &resto.Unit) {
		t.Fatal("First stream rejected")
	}
	kfcShamanAdvance(t, sim, time.Second)
	if !spell.Cast(sim, &resto.Unit) {
		t.Fatal("Same-rank refresh rejected")
	}
	kfcShamanAdvance(t, sim, 2*time.Second)
	kfcShamanNear(t, target.CurrentHealth(), before)
	kfcShamanAdvance(t, sim, 3*time.Second)
	kfcShamanNear(t, target.CurrentHealth()-before, 11)
	kfcShamanAdvance(t, sim, 300*time.Second)
	kfcShamanNear(t, target.CurrentHealth()-before, 149*11)
	if resto.ActiveTotems[shaman.WaterTotem] != spell {
		t.Fatal("Old expiration cancelled refreshed totem")
	}
	kfcShamanAdvance(t, sim, 301*time.Second)
	kfcShamanNear(t, target.CurrentHealth()-before, 150*11)
	if resto.ActiveTotems[shaman.WaterTotem] != nil {
		t.Fatal("Refreshed totem did not expire")
	}
	kfcShamanMeasure("WATER_SAME_RANK_REFRESH", target.CurrentHealth()-before)
}
