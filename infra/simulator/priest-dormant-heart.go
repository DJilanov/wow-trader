package healing

import (
	"fmt"
	"math"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/stats"
)

// KFC_PRIEST_HEART_VALUES

type KFCHealingItemEffectsPolicy struct {
	Schema                    string   `json:"schema"`
	ID                        string   `json:"id"`
	DormantHeartProcChance    *float64 `json:"dormantHeartProcChance"`
	DormantHeartHealingEvents string   `json:"dormantHeartHealingEvents"`
}

type kfcPriestItemEffects struct {
	policy  *KFCHealingItemEffectsPolicy
	owned   bool
	started bool
}

func (policy KFCHealingItemEffectsPolicy) Validate() error {
	if policy.Schema != "kfc-priest-item-effects-policy.v1" || policy.ID == "" || len(policy.ID) > 100 || policy.DormantHeartProcChance == nil ||
		(policy.DormantHeartHealingEvents != "completed-casts" && policy.DormantHeartHealingEvents != "direct-heals") {
		return fmt.Errorf("invalid Priest item effects policy")
	}
	chance := *policy.DormantHeartProcChance
	if math.IsNaN(chance) || math.IsInf(chance, 0) || chance < 0 || chance > 1 {
		return fmt.Errorf("invalid Priest Dormant Heart probability")
	}
	return nil
}

func (healer *HealingPriest) ConfigureKFCHealingItemEffects(policy KFCHealingItemEffectsPolicy) error {
	if err := policy.Validate(); err != nil {
		return err
	}
	if healer.itemEffects == nil || healer.itemEffects.policy != nil || healer.itemEffects.started || healer.GCD.ReadyAt() > 0 || healer.Hardcast.Expires > 0 {
		return fmt.Errorf("item policy requires a fresh healing Priest")
	}
	for _, spell := range healer.Spellbook {
		for _, metric := range spell.SpellMetrics {
			if metric.Casts > 0 || metric.Ticks > 0 || metric.CritTicks > 0 {
				return fmt.Errorf("item policy cannot change after casting")
			}
		}
	}
	chance := *policy.DormantHeartProcChance
	policy.DormantHeartProcChance = &chance
	healer.itemEffects.policy = &policy
	return nil
}

func (healer *HealingPriest) kfcResolvedItemEffectsPolicy() KFCHealingItemEffectsPolicy {
	if healer.itemEffects.policy != nil {
		return *healer.itemEffects.policy
	}
	chance := 1.0
	return KFCHealingItemEffectsPolicy{Schema: "kfc-priest-item-effects-policy.v1", ID: "heart-client-literal", DormantHeartProcChance: &chance, DormantHeartHealingEvents: "completed-casts"}
}

func (healer *HealingPriest) kfcItemEffectsPolicyEcho() *KFCHealingItemEffectsPolicy {
	if !healer.itemEffects.owned && healer.itemEffects.policy == nil {
		return nil
	}
	policy := healer.kfcResolvedItemEffectsPolicy()
	chance := *policy.DormantHeartProcChance
	policy.DormantHeartProcChance = &chance
	return &policy
}

func (healer *HealingPriest) registerKFCHealingItemEffects() {
	state := &kfcPriestItemEffects{}
	healer.itemEffects = state
	for _, item := range healer.Equipment {
		state.owned = state.owned || item.ID == kfcPriestHeartItemID
	}
	if !state.owned {
		return
	}
	if core.HasItemEffect(kfcPriestHeartItemID) {
		panic("Dormant Heart acquired a generic handler; re-admit the Priest effect")
	}
	buff := healer.NewTemporaryStatsAura("Priest Eternal Power", core.ActionID{SpellID: 1249119}, stats.Stats{stats.HealingPower: kfcPriestHeartHealingPower, stats.SpellDamage: kfcPriestHeartSpellDamage}, time.Duration(kfcPriestHeartDurationMs)*time.Millisecond)
	eligible := func(sim *core.Simulation, spell *core.Spell) bool {
		if sim.CurrentTime < 0 || healer.CurrentHealth() <= 0 || spell == nil || !spell.ProcMask.Matches(core.ProcMaskSpellHealing) || spell.Flags.Matches(core.SpellFlagPassiveSpell|core.SpellFlagNoOnCastComplete) {
			return false
		}
		for _, candidate := range healer.GreaterHeal {
			if candidate != nil && candidate == spell {
				return true
			}
		}
		return false
	}
	trigger := func(sim *core.Simulation) {
		state.started = true
		chance := *healer.kfcResolvedItemEffectsPolicy().DormantHeartProcChance
		if chance > 0 && sim.Proc(chance, "Priest Eternal Power") {
			buff.Activate(sim)
		}
	}
	core.MakePermanent(healer.RegisterAura(core.Aura{
		Label: "Priest Dormant Heart trigger", ActionID: core.ActionID{SpellID: 1249118},
		OnCastComplete: func(_ *core.Aura, sim *core.Simulation, spell *core.Spell) {
			if eligible(sim, spell) && healer.kfcResolvedItemEffectsPolicy().DormantHeartHealingEvents == "completed-casts" {
				trigger(sim)
			}
		},
		OnHealDealt: func(_ *core.Aura, sim *core.Simulation, spell *core.Spell, result *core.SpellResult) {
			if eligible(sim, spell) && result.DirectDamageOrHealing && healer.kfcResolvedItemEffectsPolicy().DormantHeartHealingEvents == "direct-heals" {
				trigger(sim)
			}
		},
	}))
}
