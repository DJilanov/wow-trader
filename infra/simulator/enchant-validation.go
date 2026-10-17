package core

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"slices"

	"github.com/wowsims/classic/sim/core/proto"
)

//go:embed kfc_enchant_rules.json
var kfcEnchantRulesJSON []byte

type kfcEnchantRule struct {
	EffectID           int32   `json:"effectId"`
	Type               int32   `json:"type"`
	ExtraTypes         []int32 `json:"extraTypes"`
	EnchantType        int32   `json:"enchantType"`
	Status             string  `json:"status"`
	MinLevel           int32   `json:"minLevel"`
	MaxLevel           int32   `json:"maxLevel"`
	ItemLevelMin       int32   `json:"itemLevelMin"`
	ItemLevelMax       int32   `json:"itemLevelMax"`
	RequiredSkill      int32   `json:"requiredSkill"`
	RequiredProfession int32   `json:"requiredProfession"`
	ClassAllowlist     []int32 `json:"classAllowlist"`
	ArmorTypes         []int32 `json:"armorTypes"`
}

var kfcEnchantRules = func() map[int32][]kfcEnchantRule {
	var rows []kfcEnchantRule
	if err := json.Unmarshal(kfcEnchantRulesJSON, &rows); err != nil {
		panic(err)
	}
	result := make(map[int32][]kfcEnchantRule)
	for _, row := range rows {
		result[row.EffectID] = append(result[row.EffectID], row)
	}
	return result
}()

func ValidateKfcEnchant(level int32, slot proto.ItemSlot, item Item, class proto.Class, professions []proto.Profession) error {
	if item.Enchant.EffectID == 0 {
		return nil
	}
	for _, rule := range kfcEnchantRules[item.Enchant.EffectID] {
		if rule.Status == "unsupported" || (rule.RequiredSkill != 0 && rule.RequiredProfession == 0) {
			continue
		}
		if rule.Type != int32(item.Type) && !slices.Contains(rule.ExtraTypes, int32(item.Type)) {
			continue
		}
		eligible := eligibleSlotsForItem(item)
		if item.WeaponType == proto.WeaponType_WeaponTypeShield || item.WeaponType == proto.WeaponType_WeaponTypeOffHand {
			eligible = []proto.ItemSlot{proto.ItemSlot_ItemSlotOffHand}
		}
		if !slices.Contains(eligible, slot) {
			continue
		}
		if level < rule.MinLevel || (rule.MaxLevel != 0 && level > rule.MaxLevel) {
			continue
		}
		if item.ItemLevel < rule.ItemLevelMin || (rule.ItemLevelMax != 0 && item.ItemLevel > rule.ItemLevelMax) {
			continue
		}
		if len(rule.ClassAllowlist) > 0 && !slices.Contains(rule.ClassAllowlist, int32(class)) {
			continue
		}
		if rule.RequiredProfession != 0 && !slices.Contains(professions, proto.Profession(rule.RequiredProfession)) {
			continue
		}
		if len(rule.ArmorTypes) > 0 && !slices.Contains(rule.ArmorTypes, int32(item.ArmorType)) {
			continue
		}
		if rule.EnchantType == 1 && item.HandType != proto.HandType_HandTypeTwoHand {
			continue
		}
		if (rule.EnchantType == 2) != (item.WeaponType == proto.WeaponType_WeaponTypeShield) {
			continue
		}
		if rule.EnchantType == 4 && item.WeaponType != proto.WeaponType_WeaponTypeStaff {
			continue
		}
		if item.WeaponType == proto.WeaponType_WeaponTypeOffHand {
			continue
		}
		if item.Type == proto.ItemType_ItemTypeRanged && !slices.Contains([]proto.RangedWeaponType{proto.RangedWeaponType_RangedWeaponTypeBow, proto.RangedWeaponType_RangedWeaponTypeCrossbow, proto.RangedWeaponType_RangedWeaponTypeGun}, item.RangedWeaponType) {
			continue
		}
		return nil
	}
	return fmt.Errorf("enchant %d is unsupported or incompatible with %s in %s; choose a compatible reviewed enchant", item.Enchant.EffectID, item.Name, slot)
}
