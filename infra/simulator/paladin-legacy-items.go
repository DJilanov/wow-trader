package holy

import (
	"fmt"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/stats"
)

type KFCPaladinLegacyItemPolicy struct {
	Schema                string   `json:"schema"`
	ID                    string   `json:"id"`
	BriarwoodSpellPower   *float64 `json:"briarwoodSpellPower,omitempty"`
	RoyalSealHealingPower *float64 `json:"royalSealHealingPower,omitempty"`
}

type kfcPaladinLegacyItems struct {
	policy       *KFCPaladinLegacyItemPolicy
	briar, royal bool
	initialized  bool
}

func (policy KFCPaladinLegacyItemPolicy) Validate() error {
	if policy.Schema != "kfc-paladin-legacy-item-policy.v1" || policy.ID == "" || len(policy.ID) > 100 || (policy.BriarwoodSpellPower == nil && policy.RoyalSealHealingPower == nil) {
		return fmt.Errorf("invalid Paladin legacy item policy")
	}
	if policy.BriarwoodSpellPower != nil {
		power := *policy.BriarwoodSpellPower
		if power != 15 && power != 29 && power != 30 {
			return fmt.Errorf("unreviewed Briarwood value")
		}
	}
	if policy.RoyalSealHealingPower != nil {
		healing := *policy.RoyalSealHealingPower
		if healing != 0 && healing != 22 {
			return fmt.Errorf("unreviewed Royal Seal value")
		}
	}
	return nil
}

func kfcPaladinCopyLegacyPolicy(policy KFCPaladinLegacyItemPolicy) *KFCPaladinLegacyItemPolicy {
	result := policy
	if policy.BriarwoodSpellPower != nil {
		value := *policy.BriarwoodSpellPower
		result.BriarwoodSpellPower = &value
	}
	if policy.RoyalSealHealingPower != nil {
		value := *policy.RoyalSealHealingPower
		result.RoyalSealHealingPower = &value
	}
	return &result
}

func (holy *HolyPaladin) kfcPaladinLegacyItemPolicyEcho() *KFCPaladinLegacyItemPolicy {
	if holy.legacyItems == nil || holy.legacyItems.policy == nil {
		return nil
	}
	return kfcPaladinCopyLegacyPolicy(*holy.legacyItems.policy)
}

func (holy *HolyPaladin) applyKFCPaladinLegacyItems(sim *core.Simulation) {
	policy := holy.legacyItems.policy
	if policy == nil {
		return
	}
	if policy.BriarwoodSpellPower != nil && *policy.BriarwoodSpellPower != 29 {
		holy.AddStatDynamic(sim, stats.SpellPower, *policy.BriarwoodSpellPower-29)
	}
	if policy.RoyalSealHealingPower != nil && *policy.RoyalSealHealingPower != 22 {
		holy.AddStatDynamic(sim, stats.HealingPower, *policy.RoyalSealHealingPower-22)
	}
}

func (holy *HolyPaladin) registerKFCPaladinLegacyItems() {
	state := &kfcPaladinLegacyItems{}
	holy.legacyItems = state
	for _, item := range holy.Equipment {
		state.briar = state.briar || item.ID == 12930
		state.royal = state.royal || item.ID == 18472
	}
	if !state.briar && !state.royal {
		return
	}
	if core.ItemsByID[12930].Stats[stats.SpellPower] != 29 || core.ItemsByID[18472].Stats[stats.HealingPower] != 22 {
		panic("Paladin legacy base stats changed; re-admit item references")
	}
	holy.RegisterAura(core.Aura{Label: "Paladin declared legacy item sensitivity", Duration: core.NeverExpires, OnReset: func(_ *core.Aura, sim *core.Simulation) {
		state.initialized = true
		holy.applyKFCPaladinLegacyItems(sim)
	}})
}

func (holy *HolyPaladin) ConfigureKFCPaladinLegacyItems(sim *core.Simulation, policy KFCPaladinLegacyItemPolicy) error {
	if err := policy.Validate(); err != nil {
		return err
	}
	state := holy.legacyItems
	if sim == nil || sim.CurrentTime != 0 || state == nil || state.policy != nil || holy.GCD.ReadyAt() > 0 || holy.Hardcast.Expires > 0 {
		return fmt.Errorf("legacy item policy requires a fresh Paladin")
	}
	if (policy.BriarwoodSpellPower != nil && !state.briar) || (policy.RoyalSealHealingPower != nil && !state.royal) {
		return fmt.Errorf("legacy item policy requires each declared item")
	}
	for _, spell := range holy.Spellbook {
		for _, metric := range spell.SpellMetrics {
			if metric.Casts > 0 || metric.Ticks > 0 || metric.CritTicks > 0 {
				return fmt.Errorf("legacy item policy cannot change after casting")
			}
		}
	}
	state.policy = kfcPaladinCopyLegacyPolicy(policy)
	if state.initialized {
		holy.applyKFCPaladinLegacyItems(sim)
	}
	return nil
}
