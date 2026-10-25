package restoration

import (
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
)

func TestKFCDruidCurrentItemCatalog(t *testing.T) {
	neck := core.ItemsByID[6695]
	robe := core.ItemsByID[4746]
	hat := core.ItemsByID[7720]
	staff := core.ItemsByID[20069]
	kfcDruidNear(t, neck.Stats[stats.SpellPower], 5)
	kfcDruidNear(t, robe.Stats[stats.Stamina], -11)
	kfcDruidNear(t, robe.Stats[stats.Spirit], 18)
	kfcDruidNear(t, robe.Stats[stats.Armor], 55)
	kfcDruidNear(t, hat.Stats[stats.Intellect], 10)
	kfcDruidNear(t, hat.Stats[stats.Spirit], 12)
	kfcDruidNear(t, hat.Stats[stats.SpellDamage], 7)
	kfcDruidNear(t, staff.Stats[stats.Intellect], 15)
	kfcDruidNear(t, staff.WeaponDamageMin, 154)
	kfcDruidNear(t, staff.WeaponDamageMax, 231)
	if staff.ItemLevel != 60 {
		t.Fatal("Current item level was not applied")
	}
	observed := core.ItemsByID[272681]
	kfcDruidNear(t, observed.Stats[stats.HealingPower], 176)
	kfcDruidNear(t, observed.Stats[stats.SpellDamage], 58)
	kfcDruidAdvancedResult("CURRENT_ITEMS_CATALOG", []float64{
		neck.Stats[stats.SpellPower], robe.Stats[stats.Stamina], robe.Stats[stats.Spirit],
		robe.Stats[stats.Armor], hat.Stats[stats.Intellect], hat.Stats[stats.Spirit],
		hat.Stats[stats.SpellDamage], staff.Stats[stats.Intellect], staff.WeaponDamageMin,
		staff.WeaponDamageMax, float64(staff.ItemLevel),
	})
}

func TestKFCDruidCurrentItemHealingAndNegativeStamina(t *testing.T) {
	powers, amounts, stamina, health := []float64{}, []float64{}, []float64{}, []float64{}
	for _, id := range []int32{0, 6695, 4746} {
		request := kfcFeralheartRequest(0)
		player := request.Raid.Parties[0].Players[0]
		player.BonusStats = nil
		if id != 0 {
			slot := 1
			if id == 4746 {
				slot = 4
			}
			player.Equipment.Items[slot] = &proto.ItemSpec{Id: id}
		}
		sim := core.NewSim(request, simsignals.CreateSignals())
		sim.Reset()
		healer := sim.Raid.Parties[0].Players[0].(*RestorationDruid)
		target := &sim.Raid.GetFirstTargetDummy().Unit
		target.RemoveHealth(sim, 9000)
		spell := healer.GetSpell(core.ActionID{SpellID: 5185})
		spell.BonusCritRating = -10000
		powers = append(powers, spell.HealingPower(target))
		stamina = append(stamina, healer.GetStat(stats.Stamina))
		health = append(health, healer.MaxHealth())
		if !spell.Cast(sim, target) {
			t.Fatal("Current-item cast rejected")
		}
		kfcDruidAdvance(t, sim, 1500*time.Millisecond)
		amounts = append(amounts, spell.SpellMetrics[target.UnitIndex].TotalHealing)
	}
	// The neck's damage against Undead is not additional healing power.
	kfcDruidNear(t, powers[1]-powers[0], 5)
	kfcDruidNear(t, amounts[1]-amounts[0], .429*5)
	kfcDruidNear(t, powers[2]-powers[0], 16)
	kfcDruidNear(t, amounts[2]-amounts[0], .429*16)
	kfcDruidNear(t, stamina[2]-stamina[0], -11)
	kfcDruidNear(t, health[2]-health[0], -110)
	kfcDruidAdvancedResult("CURRENT_ITEMS_HEALING", append(powers, amounts...))
	kfcDruidAdvancedResult("CURRENT_ITEMS_STAMINA", append(stamina, health...))
}
