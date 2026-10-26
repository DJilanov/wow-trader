package restoration

import (
	"fmt"
	"math"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/stats"
)

// KFC_SHAMAN_HEALING_ITEM_VALUES

type KFCShamanHealingItemEffectsPolicy struct {
	Schema                    string   `json:"schema"`
	ID                        string   `json:"id"`
	DormantHeartProcChance    *float64 `json:"dormantHeartProcChance"`
	DormantHeartHealingEvents string   `json:"dormantHeartHealingEvents"`
}

type kfcShamanHealingItems struct {
	policy         *KFCShamanHealingItemEffectsPolicy
	heartOwned     bool
	hasAny         bool
	started        bool
	generation     uint64
	mindtapMana    *core.ResourceMetrics
	secondWindMana *core.ResourceMetrics
}

func (policy KFCShamanHealingItemEffectsPolicy) Validate() error {
	if policy.Schema != "kfc-shaman-item-effects-policy.v1" || policy.ID == "" || len(policy.ID) > 100 || policy.DormantHeartProcChance == nil ||
		(policy.DormantHeartHealingEvents != "completed-casts" && policy.DormantHeartHealingEvents != "direct-heals") {
		return fmt.Errorf("invalid Shaman healing-item policy")
	}
	chance := *policy.DormantHeartProcChance
	if math.IsNaN(chance) || math.IsInf(chance, 0) || chance < 0 || chance > 1 {
		return fmt.Errorf("invalid Shaman Dormant Heart probability")
	}
	return nil
}

func (resto *RestorationShaman) ConfigureKFCShamanHealingItemEffects(sim *core.Simulation, policy KFCShamanHealingItemEffectsPolicy) error {
	if err := policy.Validate(); err != nil {
		return err
	}
	state := resto.kfcHealingItems
	if sim == nil || sim.CurrentTime != 0 || resto.positions == nil || state == nil || state.policy != nil || state.started || resto.GCD.ReadyAt() > 0 || resto.Hardcast.Expires > 0 {
		return fmt.Errorf("healing-item policy requires a fresh positioned Shaman")
	}
	for _, spell := range resto.Spellbook {
		for _, metric := range spell.SpellMetrics {
			if metric.Casts > 0 || metric.Hits > 0 || metric.Crits > 0 || metric.Ticks > 0 || metric.CritTicks > 0 {
				return fmt.Errorf("healing-item policy cannot change after events")
			}
		}
	}
	chance := *policy.DormantHeartProcChance
	policy.DormantHeartProcChance = &chance
	state.policy = &policy
	return nil
}

func (resto *RestorationShaman) KFCShamanHealingItemPolicyEcho() *KFCShamanHealingItemEffectsPolicy {
	if state := resto.kfcHealingItems; state != nil && state.policy != nil {
		policy := *state.policy
		chance := *policy.DormantHeartProcChance
		policy.DormantHeartProcChance = &chance
		return &policy
	}
	return nil
}

func (resto *RestorationShaman) kfcShamanItemsAlive() bool {
	return resto.CurrentHealth() > 0 && resto.IsEnabled()
}

func (resto *RestorationShaman) registerKFCShamanHealingItems() {
	if resto.kfcHealingItems != nil || !resto.Env.IsForever() {
		panic("Invalid or repeated Shaman healing-item registration")
	}
	state := &kfcShamanHealingItems{}
	resto.kfcHealingItems = state
	owned := map[int32]bool{}
	for _, item := range resto.Equipment {
		owned[item.ID] = true
	}
	state.heartOwned = owned[kfcShamanHeartItemID]
	state.hasAny = state.heartOwned || owned[18371] || owned[11819] || owned[272439]
	if state.hasAny {
		core.MakePermanent(resto.RegisterAura(core.Aura{Label: "KFC Shaman healing-item lifecycle", OnReset: func(_ *core.Aura, _ *core.Simulation) {
			state.generation++
			state.started = false
		}}))
	}
	if state.heartOwned {
		if core.HasItemEffect(kfcShamanHeartItemID) {
			panic("Dormant Heart acquired a generic handler; re-admit Shaman behavior")
		}
		resto.OnSpellRegistered(func(spell *core.Spell) {
			if spell.ActionID.Tag != 0 || kfcShamanWorkloadFamily(spell.ActionID.SpellID) == "" {
				return
			}
			previous := spell.ExtraCastCondition
			spell.ExtraCastCondition = func(sim *core.Simulation, target *core.Unit) bool {
				return state.policy != nil && (previous == nil || previous(sim, target))
			}
		})
		buff := resto.NewTemporaryStatsAura("Shaman Eternal Power", core.ActionID{SpellID: 1249119},
			stats.Stats{stats.HealingPower: kfcShamanHeartHealingPower, stats.SpellDamage: kfcShamanHeartSpellDamage}, time.Duration(kfcShamanHeartDurationMS)*time.Millisecond)
		eligible := func(sim *core.Simulation, spell *core.Spell) bool {
			return state.policy != nil && sim.CurrentTime >= 0 && resto.kfcShamanItemsAlive() && spell != nil &&
				spell.ActionID.Tag == 0 && kfcShamanHeartWaveIDs[spell.ActionID.SpellID] &&
				resto.GetSpell(spell.ActionID) == spell && spell.ProcMask.Matches(core.ProcMaskSpellHealing) &&
				!spell.Flags.Matches(core.SpellFlagPassiveSpell|core.SpellFlagNoOnCastComplete)
		}
		trigger := func(sim *core.Simulation) {
			state.started = true
			chance := *state.policy.DormantHeartProcChance
			if chance > 0 && sim.Proc(chance, "Shaman Eternal Power") {
				buff.Activate(sim)
			}
		}
		core.MakePermanent(resto.RegisterAura(core.Aura{Label: "Shaman Dormant Heart trigger", ActionID: core.ActionID{SpellID: 1249118},
			OnCastComplete: func(_ *core.Aura, sim *core.Simulation, spell *core.Spell) {
				if eligible(sim, spell) && state.policy.DormantHeartHealingEvents == "completed-casts" {
					trigger(sim)
				}
			},
			OnHealDealt: func(_ *core.Aura, sim *core.Simulation, spell *core.Spell, result *core.SpellResult) {
				if eligible(sim, spell) && result != nil && result.DirectDamageOrHealing && state.policy.DormantHeartHealingEvents == "direct-heals" {
					trigger(sim)
				}
			},
		}))
	}
	resto.registerKFCShamanManaItems()
	if owned[11819] && resto.GetSpell(core.ActionID{SpellID: 15604}) == nil {
		panic("Owned Second Wind has no production registration")
	}
	if owned[272439] && resto.GetSpell(core.ActionID{ItemID: 272439}) == nil {
		panic("Owned Serenity Field has no production registration")
	}
}
