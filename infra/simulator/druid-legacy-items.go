package restoration

import (
	"fmt"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/stats"
)

type KFCDruidLegacyItemPolicy struct {
	Schema                string   `json:"schema"`
	ID                    string   `json:"id"`
	RoyalSealHealingPower *float64 `json:"royalSealHealingPower"`
	BriarwoodSpellPower   *float64 `json:"briarwoodSpellPower"`
	RoyalSealForestSpirit bool     `json:"royalSealForestSpirit"`
}

type kfcDruidLegacyItems struct {
	policy       *KFCDruidLegacyItemPolicy
	royal, briar bool
	initialized  bool
}

func (policy KFCDruidLegacyItemPolicy) Validate() error {
	if policy.Schema != "kfc-druid-legacy-item-policy.v1" || policy.ID == "" || len(policy.ID) > 100 || policy.RoyalSealHealingPower == nil || policy.BriarwoodSpellPower == nil {
		return fmt.Errorf("invalid legacy item sensitivity")
	}
	healing, power := *policy.RoyalSealHealingPower, *policy.BriarwoodSpellPower
	if (healing != 0 && healing != 44) || (power != 15 && power != 29 && power != 30) {
		return fmt.Errorf("unreviewed legacy item values")
	}
	return nil
}

func (resto *RestorationDruid) kfcResolvedLegacyItemPolicy() KFCDruidLegacyItemPolicy {
	if resto.legacyItems.policy != nil {
		return *resto.legacyItems.policy
	}
	healing, power := 44.0, 29.0
	return KFCDruidLegacyItemPolicy{Schema: "kfc-druid-legacy-item-policy.v1", ID: "historical-neutral", RoyalSealHealingPower: &healing, BriarwoodSpellPower: &power}
}

func (resto *RestorationDruid) kfcLegacyItemAdjustment(sim *core.Simulation) {
	policy := resto.kfcResolvedLegacyItemPolicy()
	if resto.legacyItems.royal {
		resto.AddStatDynamic(sim, stats.HealingPower, *policy.RoyalSealHealingPower-44)
		if policy.RoyalSealForestSpirit {
			resto.AddStatDynamic(sim, stats.Spirit, 16)
		}
	}
	if resto.legacyItems.briar {
		resto.AddStatDynamic(sim, stats.SpellPower, *policy.BriarwoodSpellPower-29)
	}
}

func (resto *RestorationDruid) registerKFCLegacyItems() {
	state := &kfcDruidLegacyItems{}
	resto.legacyItems = state
	for _, item := range resto.Equipment {
		if item.ID == 18470 {
			state.royal = true
		}
		if item.ID == 12930 {
			state.briar = true
		}
	}
	if !state.royal && !state.briar {
		return
	}
	if core.ItemsByID[18470].Stats[stats.HealingPower] != 44 || core.ItemsByID[18470].Stats[stats.Spirit] != 0 || core.ItemsByID[12930].Stats[stats.SpellPower] != 29 {
		panic("Legacy base stats changed; re-admit item sensitivities")
	}
	resto.RegisterAura(core.Aura{Label: "Druid declared legacy item sensitivity", Duration: core.NeverExpires, OnReset: func(_ *core.Aura, sim *core.Simulation) { state.initialized = true; resto.kfcLegacyItemAdjustment(sim) }})
}

func (resto *RestorationDruid) ConfigureKFCDruidLegacyItems(sim *core.Simulation, policy KFCDruidLegacyItemPolicy) error {
	if err := policy.Validate(); err != nil {
		return err
	}
	if sim == nil || sim.CurrentTime != 0 || resto.legacyItems == nil || resto.legacyItems.policy != nil || resto.GCD.ReadyAt() > 0 || resto.Hardcast.Expires > 0 {
		return fmt.Errorf("legacy item sensitivity requires a fresh Druid")
	}
	for _, spell := range resto.Spellbook {
		for _, metric := range spell.SpellMetrics {
			if metric.Casts > 0 || metric.Ticks > 0 || metric.CritTicks > 0 {
				return fmt.Errorf("legacy sensitivity cannot change after casting")
			}
		}
	}
	healing, power := *policy.RoyalSealHealingPower, *policy.BriarwoodSpellPower
	policy.RoyalSealHealingPower, policy.BriarwoodSpellPower = &healing, &power
	resto.legacyItems.policy = &policy
	if resto.legacyItems.initialized {
		resto.kfcLegacyItemAdjustment(sim)
	}
	return nil
}
