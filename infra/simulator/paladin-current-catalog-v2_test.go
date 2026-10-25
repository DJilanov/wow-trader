package holy

import (
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
)

func TestKFCPaladinCurrentCatalogStats(t *testing.T) {
	values := []float64{}
	for _, row := range []struct {
		id    int32
		stat  stats.Stat
		value float64
	}{
		{6641, stats.HealingPower, 33}, {6905, stats.HealingPower, 24}, {9522, stats.HealingPower, 10}, {272107, stats.HealingPower, 37},
		{6630, stats.Intellect, 5}, {5196, stats.Spirit, 3}, {6692, stats.Spirit, 5}, {9450, stats.HealingPower, 11},
		{16706, stats.HealingPower, 11}, {16715, stats.HealingPower, 11}, {16718, stats.HealingPower, 20}, {16719, stats.HealingPower, 24}, {16720, stats.HealingPower, 15},
		{4746, stats.Stamina, -11}, {6695, stats.SpellPower, 5}, {7720, stats.Intellect, 10},
	} {
		actual := core.ItemsByID[row.id].Stats[row.stat]
		kfcPaladinNear(t, actual, row.value)
		values = append(values, actual)
	}
	observed := core.ItemsByID[272681]
	kfcPaladinNear(t, observed.Stats[stats.HealingPower], 176)
	kfcPaladinNear(t, observed.Stats[stats.SpellDamage], 58)
	kfcPaladinActiveMeasure("CURRENT_CATALOG", values)
}

func kfcPaladinEquippedControl(t *testing.T, gear *proto.EquipmentSpec) (*core.Simulation, *HolyPaladin, *core.Unit) {
	t.Helper()
	request, _ := kfcPaladinWorkloadControl()
	request.SimOptions.Interactive = true
	request.Encounter.Duration = 60
	player := request.Raid.Parties[0].Players[0]
	player.BonusStats = nil
	player.Equipment = gear
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	holy := sim.Raid.Parties[0].Players[0].(*HolyPaladin)
	for slot, spec := range gear.Items {
		if holy.Equipment[slot].ID != spec.Id {
			t.Fatal("Item shifted request slots", slot, spec.Id, holy.Equipment[slot].ID)
		}
	}
	return sim, holy, &sim.Raid.GetFirstTargetDummy().Unit
}

func TestKFCPaladinCurrentEquippedHealingAndNegativeStats(t *testing.T) {
	heals, powers, stamina, health := []float64{}, []float64{}, []float64{}, []float64{}
	for _, test := range []struct {
		id    int32
		slot  int
		power float64
	}{{0, 0, 0}, {6641, 14, 33}, {6905, 14, 24}, {9522, 15, 10}, {272107, 2, 37}, {6630, 15, 5}, {4746, 4, 16}, {6695, 1, 5}} {
		gear := &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
		for slot := range gear.Items {
			gear.Items[slot] = &proto.ItemSpec{}
		}
		if test.id > 0 {
			gear.Items[test.slot].Id = test.id
		}
		sim, holy, target := kfcPaladinEquippedControl(t, gear)
		target.RemoveHealth(sim, 9000)
		spell := holy.GetSpell(core.ActionID{SpellID: 635})
		spell.BonusCritRating = -10000
		powers = append(powers, spell.HealingPower(target))
		stamina = append(stamina, holy.GetStat(stats.Stamina))
		health = append(health, holy.MaxHealth())
		if !spell.Cast(sim, target) {
			t.Fatal("Actual current-item cast rejected", test.id)
		}
		kfcPaladinAdvance(t, sim, 2500*time.Millisecond)
		heals = append(heals, spell.SpellMetrics[target.UnitIndex].TotalHealing)
		index := len(heals) - 1
		kfcPaladinNear(t, powers[index]-powers[0], test.power)
		kfcPaladinNear(t, heals[index]-heals[0], test.power*.714)
	}
	kfcPaladinNear(t, stamina[6]-stamina[0], -11)
	kfcPaladinNear(t, health[6]-health[0], -110)
	kfcPaladinActiveMeasure("CURRENT_EQUIPPED_HEALS", append(powers, heals...))
	kfcPaladinActiveMeasure("CURRENT_EQUIPPED_STAMINA", append(stamina, health...))
}
