package restoration

import (
	"fmt"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/stats"
)

type KFCShamanLegacyItemPolicy struct {
	Schema              string   `json:"schema"`
	ID                  string   `json:"id"`
	BriarwoodSpellPower *float64 `json:"briarwoodSpellPower,omitempty"`
	RoyalSealSpellPower *float64 `json:"royalSealSpellPower,omitempty"`
	EyeScriptReference  string   `json:"eyeScriptReference,omitempty"`
}

type kfcShamanLegacyItems struct {
	policy            *KFCShamanLegacyItemPolicy
	briar, royal, eye bool
	initialized       bool
}

func (policy KFCShamanLegacyItemPolicy) Validate() error {
	if policy.Schema != "kfc-shaman-legacy-item-policy.v1" || policy.ID == "" || len(policy.ID) > 100 ||
		(policy.BriarwoodSpellPower == nil && policy.RoyalSealSpellPower == nil && policy.EyeScriptReference == "") {
		return fmt.Errorf("invalid Shaman legacy reference")
	}
	if policy.BriarwoodSpellPower != nil {
		value := *policy.BriarwoodSpellPower
		if value != 15 && value != 29 && value != 30 {
			return fmt.Errorf("unreviewed Shaman Briarwood value")
		}
	}
	if policy.RoyalSealSpellPower != nil {
		value := *policy.RoyalSealSpellPower
		if value != 18 && value != 23 {
			return fmt.Errorf("unreviewed Shaman Royal Seal value")
		}
	}
	if policy.EyeScriptReference != "" && policy.EyeScriptReference != "captured-passive-unmodeled-script-reference" {
		return fmt.Errorf("unreviewed Eye script reference")
	}
	return nil
}

func kfcShamanCopyLegacyPolicy(policy KFCShamanLegacyItemPolicy) *KFCShamanLegacyItemPolicy {
	copy := policy
	if policy.BriarwoodSpellPower != nil {
		value := *policy.BriarwoodSpellPower
		copy.BriarwoodSpellPower = &value
	}
	if policy.RoyalSealSpellPower != nil {
		value := *policy.RoyalSealSpellPower
		copy.RoyalSealSpellPower = &value
	}
	return &copy
}

func (resto *RestorationShaman) KFCShamanLegacyItemPolicyEcho() *KFCShamanLegacyItemPolicy {
	if state := resto.kfcLegacyItems; state != nil && state.policy != nil {
		return kfcShamanCopyLegacyPolicy(*state.policy)
	}
	return nil
}

func (resto *RestorationShaman) kfcShamanApplyLegacyItems(sim *core.Simulation) {
	policy := resto.kfcLegacyItems.policy
	if policy == nil {
		return
	}
	delta := 0.0
	if policy.BriarwoodSpellPower != nil {
		delta += *policy.BriarwoodSpellPower - 29
	}
	if policy.RoyalSealSpellPower != nil {
		delta += *policy.RoyalSealSpellPower - 23
	}
	if delta != 0 {
		resto.AddStatDynamic(sim, stats.SpellPower, delta)
	}
}

func (resto *RestorationShaman) registerKFCShamanLegacyItems() {
	if resto.kfcLegacyItems != nil || !resto.Env.IsForever() {
		panic("invalid Shaman legacy registration")
	}
	state := &kfcShamanLegacyItems{}
	resto.kfcLegacyItems = state
	for _, item := range resto.Equipment {
		state.briar = state.briar || item.ID == 12930
		state.royal = state.royal || item.ID == 18471
		state.eye = state.eye || item.ID == 13968
	}
	if !state.briar && !state.royal && !state.eye {
		return
	}
	if core.ItemsByID[12930].Stats[stats.SpellPower] != 29 || core.ItemsByID[18471].Stats[stats.SpellPower] != 23 || core.ItemsByID[13968].Stats[stats.SpellCrit] != 1 {
		panic("Shaman legacy catalog changed; re-admit current effects and base references")
	}
	if core.HasItemEffect(12930) || core.HasItemEffect(18471) {
		panic("Legacy power acquired a shared handler; re-admit adjustment ownership")
	}
	core.MakePermanent(resto.RegisterAura(core.Aura{Label: "Shaman explicit legacy reference", OnReset: func(_ *core.Aura, sim *core.Simulation) {
		state.initialized = true
		resto.kfcShamanApplyLegacyItems(sim)
	}}))
	resto.OnSpellRegistered(func(spell *core.Spell) {
		if spell.ActionID.Tag != 0 || kfcShamanWorkloadFamily(spell.ActionID.SpellID) == "" {
			return
		}
		previous := spell.ExtraCastCondition
		spell.ExtraCastCondition = func(sim *core.Simulation, target *core.Unit) bool {
			return state.policy != nil && (previous == nil || previous(sim, target))
		}
	})
	if state.eye {
		spell := resto.GetSpell(core.ActionID{ItemID: 13968})
		if spell == nil {
			panic("Owned Eye has no current shared handler")
		}
		previous := spell.ExtraCastCondition
		spell.ExtraCastCondition = func(sim *core.Simulation, target *core.Unit) bool {
			return state.policy != nil && sim.CurrentTime >= 0 && resto.kfcShamanItemsAlive() && (previous == nil || previous(sim, target))
		}
	}
}

func (resto *RestorationShaman) ConfigureKFCShamanLegacyItems(sim *core.Simulation, policy KFCShamanLegacyItemPolicy) error {
	if err := policy.Validate(); err != nil {
		return err
	}
	state := resto.kfcLegacyItems
	if sim == nil || sim.CurrentTime != 0 || resto.positions == nil || state == nil || state.policy != nil || resto.GCD.ReadyAt() > 0 || resto.Hardcast.Expires > 0 || state.initialized && !resto.kfcShamanItemsAlive() {
		return fmt.Errorf("legacy reference requires a fresh positioned Shaman")
	}
	if state.briar != (policy.BriarwoodSpellPower != nil) || state.royal != (policy.RoyalSealSpellPower != nil) || state.eye != (policy.EyeScriptReference != "") {
		return fmt.Errorf("legacy reference must match every equipped legacy item")
	}
	for _, spell := range resto.Spellbook {
		for _, metric := range spell.SpellMetrics {
			if metric.Casts > 0 || metric.Hits > 0 || metric.Crits > 0 || metric.Ticks > 0 || metric.CritTicks > 0 {
				return fmt.Errorf("legacy reference cannot change after events")
			}
		}
	}
	state.policy = kfcShamanCopyLegacyPolicy(policy)
	if state.initialized {
		resto.kfcShamanApplyLegacyItems(sim)
	}
	return nil
}
