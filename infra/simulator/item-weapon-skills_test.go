package core

import (
	"reflect"
	"testing"

	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/stats"
)

func TestKfcItemWeaponSkillsForeverKeepsOtherBonuses(t *testing.T) {
	character := &Character{Unit: Unit{
		Env:         &Environment{Ruleset: proto.Ruleset_RulesetForever},
		PseudoStats: stats.NewPseudoStats(),
	}}
	// Existing non-item skill must survive; do not reset the entire character's skill.
	character.PseudoStats.DaggersSkill = 5
	character.PseudoStats.SwordsSkill = 5
	character.Equipment[proto.ItemSlot_ItemSlotOffHand] = Item{
		ID: 18392, WeaponSkills: stats.WeaponSkills{proto.WeaponSkill_WeaponSkillDaggers: 6},
		Stats: stats.Stats{stats.AttackPower: 20}, WeaponDamageMin: 42, WeaponDamageMax: 64,
		SwingSpeed: 1.3, Enchant: Enchant{EffectID: 1900}, EffectItemID: 12590,
	}
	// Cover armor and ranged skill as well as the reported dagger, including future entries.
	for i := range character.Equipment[proto.ItemSlot_ItemSlotHands].WeaponSkills {
		character.Equipment[proto.ItemSlot_ItemSlotHands].WeaponSkills[i] = float64(i + 1)
	}
	beforeEquipment, beforeSkills := character.Equipment, character.PseudoStats
	character.applyWeaponSkills()
	if !reflect.DeepEqual(character.PseudoStats, beforeSkills) {
		t.Fatal("Forever item skill leaked into the character or erased non-item bonuses")
	}
	if !reflect.DeepEqual(character.Equipment, beforeEquipment) {
		t.Fatal("Ignoring skill changed an item, stat, damage, enchant or effect")
	}
}

func TestKfcItemWeaponSkillsClassicUnchanged(t *testing.T) {
	character := &Character{Unit: Unit{
		Env:         &Environment{Ruleset: proto.Ruleset_RulesetClassic},
		PseudoStats: stats.NewPseudoStats(),
	}}
	character.PseudoStats.DaggersSkill = 5
	character.Equipment[proto.ItemSlot_ItemSlotOffHand] = Item{
		WeaponSkills: stats.WeaponSkills{proto.WeaponSkill_WeaponSkillDaggers: 6},
	}
	character.applyWeaponSkills()
	if character.PseudoStats.DaggersSkill != 11 {
		t.Fatal("Forever item-skill policy leaked into the Classic ruleset")
	}
}
