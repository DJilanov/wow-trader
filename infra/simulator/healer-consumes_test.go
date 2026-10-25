package healing

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
)

func kfcConsumeActor(consumes *proto.Consumes) (*core.Simulation, *HealingPriest, *core.Unit) {
	request := kfcWorkloadRequest(10000, 1, 60)
	request.Raid.Parties[0].Players[0].Equipment = kfcItemEquipment()
	request.Raid.Parties[0].Players[0].Equipment.Items[14] = &proto.ItemSpec{Id: 272681}
	request.Raid.Parties[0].Players[0].Consumes = consumes
	request.Raid.Parties[0].Players[0].Rotation = &proto.APLRotation{Type: proto.APLRotation_TypeAPL}
	request.SimOptions.Interactive, request.SimOptions.IsTest = true, true
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	return sim, sim.Raid.Parties[0].Players[0].(*HealingPriest), &sim.Raid.GetFirstTargetDummy().Unit
}

func TestKFCPriestHealingConsumeCurrentStats(t *testing.T) {
	_, baseline, target := kfcConsumeActor(nil)
	for _, row := range []struct {
		name                                                         string
		consumes                                                     *proto.Consumes
		damage, healing, mp5, mana, intellect, agility, spirit, crit float64
	}{
		{name: "supreme", consumes: &proto.Consumes{Flask: proto.Flask_FlaskOfSupremePower}, damage: 150},
		{name: "wisdom", consumes: &proto.Consumes{Flask: proto.Flask_FlaskOfDistilledWisdom}, mana: 2000},
		{name: "mana-oil", consumes: &proto.Consumes{MainHandImbue: proto.WeaponImbue_LesserManaOil}, healing: 20, mp5: 10},
		{name: "wizard-oil", consumes: &proto.Consumes{MainHandImbue: proto.WeaponImbue_WizardOil}, damage: 24, healing: 24},
		{name: "nightfin", consumes: &proto.Consumes{Food: proto.Food_FoodNightfinSoup}, damage: 22},
		{name: "sagefish", consumes: &proto.Consumes{Food: proto.Food_FoodSagefishDelight}, damage: 7},
		{name: "steak", consumes: &proto.Consumes{Food: proto.Food_FoodTenderWolfSteak}, agility: 15},
		{name: "tuber", consumes: &proto.Consumes{Food: proto.Food_FoodRunnTumTuberSurprise}, intellect: 15},
		{name: "squid", consumes: &proto.Consumes{Food: proto.Food_FoodGrilledSquid}, crit: 1},
	} {
		t.Run(row.name, func(t *testing.T) {
			_, actor, recipient := kfcConsumeActor(row.consumes)
			for _, expected := range []struct {
				stat  stats.Stat
				delta float64
			}{
				{stats.MP5, row.mp5}, {stats.Mana, row.mana + row.intellect*15}, {stats.Intellect, row.intellect}, {stats.Agility, row.agility}, {stats.Spirit, row.spirit},
			} {
				kfcPriestNear(t, actor.GetStat(expected.stat)-baseline.GetStat(expected.stat), expected.delta)
			}
			kfcPriestNear(t, actor.FlashHeal[7].HealingPower(recipient)-baseline.FlashHeal[7].HealingPower(target), row.healing)
			kfcPriestNear(t, actor.GetStat(stats.SpellPower)+actor.GetStat(stats.SpellDamage)-baseline.GetStat(stats.SpellPower)-baseline.GetStat(stats.SpellDamage), row.damage)
			if row.intellect == 0 {
				kfcPriestNear(t, actor.FlashHeal[7].HealingCritChance()-baseline.FlashHeal[7].HealingCritChance(), row.crit/100)
			}
		})
	}
}

func TestKFCPriestHealingConsumeActualHealing(t *testing.T) {
	values := []float64{}
	for _, consumes := range []*proto.Consumes{nil, {Flask: proto.Flask_FlaskOfSupremePower}, {MainHandImbue: proto.WeaponImbue_LesserManaOil}, {MainHandImbue: proto.WeaponImbue_WizardOil}, {Food: proto.Food_FoodSagefishDelight}, {Food: proto.Food_FoodNightfinSoup}} {
		sim, healer, target := kfcConsumeActor(consumes)
		target.RemoveHealth(sim, 9000)
		healer.FlashHeal[7].BonusCritRating = -10000
		if !healer.FlashHeal[7].Cast(sim, target) {
			t.Fatal("Consume healing control did not cast")
		}
		kfcPriestAdvance(t, sim, 1500*time.Millisecond)
		values = append(values, healer.FlashHeal[7].SpellMetrics[target.UnitIndex].TotalHealing)
	}
	for index, delta := range []float64{0, 0, 20 * .429, 24 * .429, 0, 0} {
		kfcPriestNear(t, values[index]-values[0], delta)
	}
	encoded, err := json.Marshal(values)
	if err != nil {
		t.Fatal(err)
	}
	fmt.Printf("KFC_HEALER_CONSUME_HEALS %s\n", encoded)
}

func TestKFCPriestHealingConsumeManaTicks(t *testing.T) {
	values := []float64{}
	for _, oil := range []proto.WeaponImbue{proto.WeaponImbue_WeaponImbueUnknown, proto.WeaponImbue_LesserManaOil} {
		sim, healer, _ := kfcConsumeActor(&proto.Consumes{MainHandImbue: oil})
		kfcResourceSpend(sim, healer, 5000)
		before := healer.CurrentMana()
		kfcPriestAdvance(t, sim, 6*time.Second)
		values = append(values, healer.CurrentMana()-before)
	}
	kfcPriestNear(t, values[1]-values[0], 12)
}

func TestKFCPriestHealingConsumeExternalInputs(t *testing.T) {
	jobs := map[string]KFCHealingJob{}
	for _, name := range []string{"consumeNone", "consumeSupreme", "consumeManaOil", "consumeWizardOil", "consumeSagefish", "consumeTuber", "consumeSteak", "consumeSquid"} {
		request := kfcWorkloadRequest(0, 3, 180)
		request.Raid.Parties[0].Players[0].Equipment = kfcItemEquipment()
		request.Raid.Parties[0].Players[0].Equipment.Items[14] = &proto.ItemSpec{Id: 272681}
		consumes := &proto.Consumes{}
		switch name {
		case "consumeSupreme":
			consumes.Flask = proto.Flask_FlaskOfSupremePower
		case "consumeManaOil":
			consumes.MainHandImbue = proto.WeaponImbue_LesserManaOil
		case "consumeWizardOil":
			consumes.MainHandImbue = proto.WeaponImbue_WizardOil
		case "consumeSagefish":
			consumes.Food = proto.Food_FoodSagefishDelight
		case "consumeTuber":
			consumes.Food = proto.Food_FoodRunnTumTuberSurprise
		case "consumeSteak":
			consumes.Food = proto.Food_FoodTenderWolfSteak
		case "consumeSquid":
			consumes.Food = proto.Food_FoodGrilledSquid
		}
		request.Raid.Parties[0].Players[0].Consumes = consumes
		jobs[name] = kfcHealingProtocolJob(t, "external-"+name, request, kfcTankWorkload(180), true)
		reply := RunKFCHealingJob(context.Background(), kfcHealingJobJSON(t, jobs[name]))
		if reply.Status != "complete" || reply.Result == nil {
			t.Fatalf("Consume protocol failed: %+v", reply.Error)
		}
	}
	encoded, err := json.Marshal(jobs)
	if err != nil {
		t.Fatal(err)
	}
	fmt.Printf("KFC_HEALER_CONSUME_INPUTS %s\n", encoded)
}
