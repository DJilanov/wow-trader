package restoration

import (
	"fmt"
	"math"
)

type KFCDruidHealingEquipmentPolicy struct {
	Schema                  string   `json:"schema"`
	ID                      string   `json:"id"`
	WildheartManaProcChance *float64 `json:"wildheartManaProcChance"`
	WildheartHealingEvents  string   `json:"wildheartHealingEvents"`
}

func (policy KFCDruidHealingEquipmentPolicy) Validate() error {
	if policy.Schema != "kfc-druid-healing-equipment-policy.v1" || len(policy.ID) == 0 || len(policy.ID) > 100 || policy.WildheartManaProcChance == nil ||
		(policy.WildheartHealingEvents != "completed-casts" && policy.WildheartHealingEvents != "direct-heals") {
		return fmt.Errorf("invalid Druid equipment research policy")
	}
	chance := *policy.WildheartManaProcChance
	if math.IsNaN(chance) || math.IsInf(chance, 0) || chance < 0 || chance > 1 {
		return fmt.Errorf("invalid Wildheart mana proc probability")
	}
	return nil
}

func (resto *RestorationDruid) ConfigureKFCDruidHealingEquipment(policy KFCDruidHealingEquipmentPolicy) error {
	if err := policy.Validate(); err != nil {
		return err
	}
	if resto.equipmentPolicy != nil || resto.GCD.ReadyAt() > 0 || resto.Hardcast.Expires > 0 {
		return fmt.Errorf("equipment research requires a fresh Druid")
	}
	for _, spell := range resto.Spellbook {
		for _, metrics := range spell.SpellMetrics {
			if metrics.Casts > 0 || metrics.Ticks > 0 || metrics.CritTicks > 0 {
				return fmt.Errorf("equipment research cannot change after a cast")
			}
		}
	}
	chance := *policy.WildheartManaProcChance
	policy.WildheartManaProcChance = &chance
	resto.equipmentPolicy = &policy
	return nil
}

func (resto *RestorationDruid) kfcHasWildheartManaSet() bool {
	count := 0
	for _, item := range resto.Equipment {
		if item.SetID == 185 {
			count++
		}
	}
	return count >= 5
}

func (resto *RestorationDruid) kfcResolvedEquipmentPolicy() KFCDruidHealingEquipmentPolicy {
	if resto.equipmentPolicy != nil {
		return *resto.equipmentPolicy
	}
	chance := .02
	return KFCDruidHealingEquipmentPolicy{Schema: "kfc-druid-healing-equipment-policy.v1", ID: "wildheart-reference", WildheartManaProcChance: &chance, WildheartHealingEvents: "completed-casts"}
}

// KFCWildheartManaProcChance supplies the optional shared-set policy only for exact set 185.
func (resto *RestorationDruid) KFCWildheartManaProcChance() float64 {
	if !resto.kfcHasWildheartManaSet() {
		return .02
	}
	return *resto.kfcResolvedEquipmentPolicy().WildheartManaProcChance
}

func (resto *RestorationDruid) KFCWildheartManaDirectHealingEvents() bool {
	return resto.kfcHasWildheartManaSet() && resto.kfcResolvedEquipmentPolicy().WildheartHealingEvents == "direct-heals"
}
