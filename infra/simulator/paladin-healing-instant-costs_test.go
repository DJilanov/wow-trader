package holy

import (
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
)

func kfcPaladinBenedictionFixture(t *testing.T, points int) (*core.Simulation, *HolyPaladin, []*core.Unit) {
	t.Helper()
	ret := []byte("00000000000000000")
	ret[1] = byte('0' + points)
	talents := kfcPaladinActiveTalents(map[int]int{10: 5, 11: 1, 13: 1, 16: 1}) + "--" + string(ret)
	sim, holy, _ := kfcPaladinPassiveFixture(500, talents)
	positions := make(map[int32]KFCPaladinFriendlyPosition)
	for _, unit := range sim.Raid.AllUnits {
		positions[unit.UnitIndex] = KFCPaladinFriendlyPosition{}
	}
	if err := holy.ConfigureKFCPaladinActiveHealing(positions, KFCPaladinVigilSingleRefund); err != nil {
		t.Fatal(err)
	}
	return sim, holy, sim.Raid.AllUnits
}

func TestKFCPaladinBenedictionRankedShockCosts(t *testing.T) {
	values := []float64{}
	for points := 0; points <= 5; points++ {
		sim, holy, units := kfcPaladinBenedictionFixture(t, points)
		for _, rank := range kfcPaladinShockRanks {
			spell := holy.GetSpell(core.ActionID{SpellID: rank.Data.ID})
			kfcPaladinNear(t, spell.Cost.GetCurrentCost(), rank.Data.Mana*(1-.02*float64(points)))
		}
		shock := holy.GetSpell(core.ActionID{SpellID: 20930})
		shock.BonusCritRating = -10000
		if !shock.Cast(sim, units[1]) {
			t.Fatal("Discounted Shock failed")
		}
		kfcPaladinNear(t, holy.Metrics.ManaSpent, 325*(1-.02*float64(points)))
		values = append(values, holy.Metrics.ManaSpent)
	}
	kfcPaladinActiveMeasure("BENEDICTION_COSTS", values)
}

func TestKFCPaladinBenedictionRefundUsesOriginalBaseCost(t *testing.T) {
	sim, holy, units := kfcPaladinBenedictionFixture(t, 5)
	shock := holy.GetSpell(core.ActionID{SpellID: 20930})
	shock.BonusCritRating = 10000
	before := holy.CurrentMana()
	if !shock.Cast(sim, units[1]) {
		t.Fatal("Critical discounted Shock failed")
	}
	kfcPaladinNear(t, holy.Metrics.ManaSpent, 292.5)
	kfcPaladinNear(t, holy.CurrentMana()-before, -130)
	kfcPaladinActiveMeasure("BENEDICTION_REFUND", holy.CurrentMana()-before)
}

func TestKFCPaladinBenedictionFamilyAndHardCastScope(t *testing.T) {
	_, holy, _ := kfcPaladinBenedictionFixture(t, 5)
	for _, test := range []struct {
		id   int32
		cost float64
	}{
		{10329, 580}, {19943, 140}, {1311595, 1340}, {20216, holy.BaseMana * .04},
	} {
		kfcPaladinNear(t, holy.GetSpell(core.ActionID{SpellID: test.id}).Cost.GetCurrentCost(), test.cost)
	}
}

func TestKFCPaladinBenedictionDoesNotAccumulateOnReset(t *testing.T) {
	sim, holy, units := kfcPaladinBenedictionFixture(t, 5)
	shock := holy.GetSpell(core.ActionID{SpellID: 20930})
	shock.BonusCritRating = -10000
	for iteration := 0; iteration < 2; iteration++ {
		if !shock.Cast(sim, units[1]) {
			t.Fatal("Discounted Shock failed")
		}
		kfcPaladinNear(t, holy.Metrics.ManaSpent, 292.5)
		kfcPaladinAdvance(t, sim, 1500*time.Millisecond)
		sim.Cleanup()
		sim.Reset()
		kfcPaladinNear(t, shock.Cost.GetCurrentCost(), 292.5)
	}
}
