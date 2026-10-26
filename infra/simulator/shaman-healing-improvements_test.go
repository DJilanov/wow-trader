package restoration

import (
	_ "embed"
	"encoding/json"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
)

//go:embed kfc_shaman_improvements_test_data.json
var kfcShamanImprovementsJSON []byte

type kfcShamanImprovementWitness struct {
	Key        string    `json:"key"`
	EffectID   int32     `json:"effectId"`
	Slot       int       `json:"slot"`
	ItemID     int32     `json:"itemId"`
	MainHandID int32     `json:"mainHandId"`
	Stats      []float64 `json:"stats"`
	Status     string    `json:"status"`
}

func kfcShamanImprovementData(t *testing.T) ([]kfcShamanImprovementWitness, []kfcShamanImprovementWitness) {
	t.Helper()
	var data struct {
		Schema     string                        `json:"schema"`
		SourceRows []kfcShamanImprovementWitness `json:"sourceRows"`
		Witnesses  []kfcShamanImprovementWitness `json:"witnesses"`
	}
	if err := json.Unmarshal(kfcShamanImprovementsJSON, &data); err != nil {
		t.Fatal(err)
	}
	if data.Schema != "kfc-shaman-improvements-test-data.v1" || len(data.SourceRows) != 182 || len(data.Witnesses) != 127 {
		t.Fatal("Incomplete actual improvement source", data.Schema, len(data.SourceRows), len(data.Witnesses))
	}
	return data.SourceRows, data.Witnesses
}

func kfcShamanImprovementFixture(t *testing.T, witness *kfcShamanImprovementWitness, enchant bool, consumes *proto.Consumes) (*core.Simulation, *RestorationShaman, *core.Unit) {
	t.Helper()
	request := kfcShamanRequest(0)
	request.Encounter.Duration = 400
	player := request.Raid.Parties[0].Players[0]
	player.TalentsString = kfcRiptideTalentString(map[string]int32{"riptide": 1, "water_shield": 1})
	player.Equipment = &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
	for index := range player.Equipment.Items {
		player.Equipment.Items[index] = &proto.ItemSpec{}
	}
	player.Equipment.Items[14].Id = 1155
	if witness != nil {
		player.Equipment.Items[14].Id = witness.MainHandID
		player.Equipment.Items[witness.Slot].Id = witness.ItemID
		if enchant {
			player.Equipment.Items[witness.Slot].Enchant = witness.EffectID
		}
	}
	player.Consumes = consumes
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	resto := sim.Raid.Parties[0].Players[0].(*RestorationShaman)
	kfcRiptideConfigure(t, sim, resto, kfcRiptideDefault(), kfcShamanResourceDefault())
	target := resto.kfcHealingPlayers()[1]
	target.AddStatDynamic(sim, stats.Health, 50000)
	target.GainHealth(sim, target.MaxHealth(), target.NewHealthMetrics(core.ActionID{SpellID: 1, Tag: 1250}))
	return sim, resto, target
}

func TestKFCShamanImprovementsAllCapturedEnchantVectors(t *testing.T) {
	rows, _ := kfcShamanImprovementData(t)
	for _, row := range rows {
		effect, ok := core.EnchantsByEffectID[row.EffectID]
		if !ok || effect.Stats != stats.FromFloatArray(row.Stats) {
			t.Fatal("Captured enchant differs from compiler database", row.EffectID)
		}
	}
	kfcShamanMeasure("IMPROVEMENTS_SOURCE_VECTORS", len(rows))
}

func TestKFCShamanImprovementsEveryEligibleEnchantStatDelta(t *testing.T) {
	_, rows := kfcShamanImprovementData(t)
	for _, row := range rows {
		plain, baseline, _ := kfcShamanImprovementFixture(t, &row, false, nil)
		sim, resto, _ := kfcShamanImprovementFixture(t, &row, true, nil)
		if err := core.ValidateKfcEnchant(60, proto.ItemSlot(row.Slot), resto.Equipment[row.Slot], proto.Class_ClassShaman, nil); err != nil {
			t.Fatal(row.Key, err)
		}
		expected := resto.ApplyStatDependencies(stats.FromFloatArray(row.Stats))
		actual := stats.Stats{}
		for index := range actual {
			actual[index] = resto.GetStat(stats.Stat(index)) - baseline.GetStat(stats.Stat(index))
			kfcShamanNear(t, actual[index], expected[index])
		}
		kfcShamanMeasure("IMPROVEMENTS_ENCHANT_STATS", map[string]interface{}{"key": row.Key, "stats": actual.ToFloatArray()})
		sim.Cleanup()
		plain.Cleanup()
	}
}

func TestKFCShamanImprovementsHealingEnchantsAffectActualCasts(t *testing.T) {
	_, rows := kfcShamanImprovementData(t)
	for _, effectID := range []int32{2544, 2566} {
		var selected *kfcShamanImprovementWitness
		for index := range rows {
			if rows[index].EffectID == effectID {
				selected = &rows[index]
				break
			}
		}
		if selected == nil {
			t.Fatal("Missing actual nonraid healing enchant", effectID)
		}
		amounts := []float64{}
		for _, enabled := range []bool{false, true} {
			sim, resto, target := kfcShamanImprovementFixture(t, selected, enabled, nil)
			spell := resto.GetSpell(core.ActionID{SpellID: 10396})
			spell.BonusCritRating = -10000
			target.RemoveHealth(sim, 5000)
			before := target.CurrentHealth()
			if !spell.Cast(sim, target) {
				t.Fatal("Enchanted healing control failed")
			}
			kfcShamanAdvance(t, sim, 3*time.Second)
			amounts = append(amounts, target.CurrentHealth()-before)
			sim.Cleanup()
		}
		power := stats.FromFloatArray(selected.Stats)
		kfcShamanNear(t, amounts[1]-amounts[0], .857*(power[stats.HealingPower]+power[stats.SpellPower]))
		kfcShamanMeasure("IMPROVEMENTS_ENCHANT_HEALING", map[string]interface{}{"effectId": effectID, "amounts": amounts})
	}
}

func TestKFCShamanImprovementsPhysicalEnchantsInactiveDuringHealing(t *testing.T) {
	_, rows := kfcShamanImprovementData(t)
	for _, id := range []int32{36, 803, 1898, 1900} {
		var selected *kfcShamanImprovementWitness
		for index := range rows {
			if rows[index].EffectID == id {
				selected = &rows[index]
				break
			}
		}
		if selected == nil {
			t.Fatal("Provisional physical enchant was pruned", id)
		}
		sim, resto, target := kfcShamanImprovementFixture(t, selected, true, nil)
		strength := resto.GetStat(stats.Strength)
		spell := resto.GetSpell(core.ActionID{SpellID: 331})
		for cast := 0; cast < 80; cast++ {
			if !spell.Cast(sim, target) {
				t.Fatal("Actual physical-enchant healing control failed", id, cast)
			}
			kfcShamanAdvance(t, sim, time.Duration(cast+1)*1500*time.Millisecond)
			kfcShamanNear(t, resto.GetStat(stats.Strength), strength)
		}
		for _, registered := range resto.Spellbook {
			for _, metric := range registered.SpellMetrics {
				if metric.TotalDamage != 0 {
					t.Fatal("Physical enchant produced damage during player-only healing", id)
				}
			}
		}
		kfcShamanMeasure("IMPROVEMENTS_PHYSICAL_INACTIVE", id)
		sim.Cleanup()
	}
}

func TestKFCShamanImprovementsCurrentConsumeStats(t *testing.T) {
	baseSim, baseline, target := kfcShamanImprovementFixture(t, nil, false, nil)
	defer baseSim.Cleanup()
	for _, row := range []struct {
		name                                                         string
		consumes                                                     *proto.Consumes
		damage, healing, mp5, mana, intellect, agility, crit, health float64
	}{
		{name: "supreme", consumes: &proto.Consumes{Flask: proto.Flask_FlaskOfSupremePower}, damage: 150},
		{name: "wisdom", consumes: &proto.Consumes{Flask: proto.Flask_FlaskOfDistilledWisdom}, mana: 2000},
		{name: "titans", consumes: &proto.Consumes{Flask: proto.Flask_FlaskOfTheTitans}, health: 1200},
		{name: "mana-oil", consumes: &proto.Consumes{MainHandImbue: proto.WeaponImbue_LesserManaOil}, healing: 20, mp5: 10},
		{name: "wizard-oil", consumes: &proto.Consumes{MainHandImbue: proto.WeaponImbue_WizardOil}, damage: 24, healing: 24},
		{name: "nightfin", consumes: &proto.Consumes{Food: proto.Food_FoodNightfinSoup}, damage: 22},
		{name: "sagefish", consumes: &proto.Consumes{Food: proto.Food_FoodSagefishDelight}, damage: 7},
		{name: "steak", consumes: &proto.Consumes{Food: proto.Food_FoodTenderWolfSteak}, agility: 15},
		{name: "tuber", consumes: &proto.Consumes{Food: proto.Food_FoodRunnTumTuberSurprise}, intellect: 15},
		{name: "squid", consumes: &proto.Consumes{Food: proto.Food_FoodGrilledSquid}, crit: 1},
		{name: "mageblood", consumes: &proto.Consumes{ManaRegenElixir: proto.ManaRegenElixir_GreaterMagebloodElixir}, mp5: 20},
	} {
		sim, resto, recipient := kfcShamanImprovementFixture(t, nil, false, row.consumes)
		for _, expected := range []struct {
			stat  stats.Stat
			delta float64
		}{{stats.MP5, row.mp5}, {stats.Mana, row.mana + row.intellect*15}, {stats.Intellect, row.intellect}, {stats.Agility, row.agility}, {stats.Health, row.health}} {
			kfcShamanNear(t, resto.GetStat(expected.stat)-baseline.GetStat(expected.stat), expected.delta)
		}
		spell, plain := resto.GetSpell(core.ActionID{SpellID: 10396}), baseline.GetSpell(core.ActionID{SpellID: 10396})
		kfcShamanNear(t, spell.HealingPower(recipient)-plain.HealingPower(target), row.healing)
		kfcShamanNear(t, resto.GetStat(stats.SpellPower)+resto.GetStat(stats.SpellDamage)-baseline.GetStat(stats.SpellPower)-baseline.GetStat(stats.SpellDamage), row.damage)
		if row.intellect == 0 {
			kfcShamanNear(t, spell.HealingCritChance()-plain.HealingCritChance(), row.crit/100)
		}
		kfcShamanMeasure("IMPROVEMENTS_CONSUME_STATS", row.name)
		sim.Cleanup()
	}
}

func TestKFCShamanImprovementsConsumesAffectActualHealing(t *testing.T) {
	amounts := []float64{}
	for _, consumes := range []*proto.Consumes{nil, {Flask: proto.Flask_FlaskOfSupremePower}, {MainHandImbue: proto.WeaponImbue_LesserManaOil}, {MainHandImbue: proto.WeaponImbue_WizardOil}, {Food: proto.Food_FoodSagefishDelight}, {Food: proto.Food_FoodNightfinSoup}} {
		sim, resto, target := kfcShamanImprovementFixture(t, nil, false, consumes)
		spell := resto.GetSpell(core.ActionID{SpellID: 10396})
		spell.BonusCritRating = -10000
		target.RemoveHealth(sim, 5000)
		before := target.CurrentHealth()
		if !spell.Cast(sim, target) {
			t.Fatal("Consume healing control failed")
		}
		kfcShamanAdvance(t, sim, 3*time.Second)
		amounts = append(amounts, target.CurrentHealth()-before)
		sim.Cleanup()
	}
	for index, delta := range []float64{0, 0, 20 * .857, 24 * .857, 0, 0} {
		kfcShamanNear(t, amounts[index]-amounts[0], delta)
	}
	kfcShamanMeasure("IMPROVEMENTS_CONSUME_HEALING", amounts)
}

func TestKFCShamanImprovementsManaOilActualTicks(t *testing.T) {
	values := []float64{}
	for _, oil := range []proto.WeaponImbue{proto.WeaponImbue_WeaponImbueUnknown, proto.WeaponImbue_LesserManaOil} {
		sim, resto, _ := kfcShamanImprovementFixture(t, nil, false, &proto.Consumes{MainHandImbue: oil})
		resto.SpendMana(sim, 5000, resto.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 1251}))
		before := resto.CurrentMana()
		kfcShamanAdvance(t, sim, 6*time.Second)
		values = append(values, resto.CurrentMana()-before)
		sim.Cleanup()
	}
	kfcShamanNear(t, values[1]-values[0], 12)
	kfcShamanMeasure("IMPROVEMENTS_MANA_OIL", values)
}

func TestKFCShamanImprovementsPotionAndRuneActualResources(t *testing.T) {
	consumes := &proto.Consumes{DefaultPotion: proto.Potions_MajorManaPotion, DefaultConjured: proto.Conjured_ConjuredDemonicRune}
	sim, resto, _ := kfcShamanImprovementFixture(t, nil, false, consumes)
	defer sim.Cleanup()
	resto.SpendMana(sim, 5000, resto.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 1252}))
	beforeMana, beforeHealth := resto.CurrentMana(), resto.CurrentHealth()
	potion, rune := resto.GetSpell(core.ActionID{ItemID: 13444}), resto.GetSpell(core.ActionID{ItemID: 12662})
	if potion == nil || rune == nil || !potion.Cast(sim, &resto.Unit) || !rune.Cast(sim, &resto.Unit) {
		t.Fatal("Actual mana consumables were not independently usable")
	}
	gain, damage := resto.CurrentMana()-beforeMana, beforeHealth-resto.CurrentHealth()
	if gain < 2250 || gain > 3750 || damage < 600 || damage > 1000 {
		t.Fatal("Wrong potion/rune resource range", gain, damage)
	}
	if potion.CD.ReadyAt() != 2*time.Minute || rune.CD.ReadyAt() != 2*time.Minute || potion.CanCast(sim, &resto.Unit) || rune.CanCast(sim, &resto.Unit) {
		t.Fatal("Mana consumable cooldowns")
	}
	for _, spell := range resto.Spellbook {
		if spell.ActionID.SpellID == 16666 {
			for _, metric := range spell.SpellMetrics {
				if metric.TotalDamage > 0 && metric.TotalDamage != damage {
					t.Fatal("Rune damage ledger differs from owner loss")
				}
			}
		}
	}
	kfcShamanMeasure("IMPROVEMENTS_MANA_ACTIVES", []float64{gain, damage})
}

func TestKFCShamanImprovementsRuneCapsDeathAndNoFreeRecombobulator(t *testing.T) {
	for _, die := range []bool{false, true} {
		sim, resto, _ := kfcShamanImprovementFixture(t, nil, false, &proto.Consumes{DefaultConjured: proto.Conjured_ConjuredDemonicRune})
		if die {
			resto.RemoveHealth(sim, resto.CurrentHealth()-1)
		}
		before := resto.CurrentMana()
		spell := resto.GetSpell(core.ActionID{ItemID: 12662})
		if spell == nil || !spell.Cast(sim, &resto.Unit) {
			t.Fatal("Rune cap/death control failed")
		}
		kfcShamanNear(t, resto.CurrentMana(), before)
		if die && (resto.CurrentHealth() != 0 || !resto.Metrics.Died) {
			t.Fatal("Rune self damage was not received exactly once")
		}
		kfcShamanMeasure("IMPROVEMENTS_RUNE_CAP_DEATH", die)
		sim.Cleanup()
	}
	sim, resto, _ := kfcShamanImprovementFixture(t, nil, false, &proto.Consumes{DefaultConjured: proto.Conjured_ConjuredMinorRecombobulator})
	defer sim.Cleanup()
	if resto.GetSpell(core.ActionID{ItemID: 4381}) != nil {
		t.Fatal("Generic consume granted a free unequipped Recombobulator")
	}
	kfcShamanMeasure("IMPROVEMENTS_NO_FREE_RECOMB", true)
}
