package restoration

import (
	"fmt"

	"github.com/wowsims/classic/sim/core"
)

type kfcShamanHealingRelicSpec struct {
	Kind    string
	Amount  float64
	Actions map[int32]bool
}

// KFC_SHAMAN_HEALING_RELIC_VALUES

type KFCShamanHealingRelicPolicy struct {
	CostStacking string `json:"costStacking"`
}

type kfcShamanHealingRelics struct {
	itemID     int32
	spec       kfcShamanHealingRelicSpec
	costSpells []*core.Spell
	configured bool
	policy     KFCShamanHealingRelicPolicy
}

// The marker is available before Initialize, when the generic item handlers run.
func (*RestorationShaman) KFCControlsShamanHealingRelics() bool { return true }

func (resto *RestorationShaman) prepareKFCShamanHealingRelics() {
	if resto.kfcRelics != nil {
		panic("Duplicate owned Shaman relic initialization")
	}
	itemID := resto.Ranged().ID
	spec, known := kfcShamanHealingRelicSpecs[itemID]
	if !known {
		return
	}
	state := &kfcShamanHealingRelics{itemID: itemID, spec: spec}
	resto.kfcRelics = state
	if spec.Kind == "casting-spirit-regeneration-percent" {
		resto.PseudoStats.SpiritRegenRateCasting += spec.Amount / 100
		resto.UpdateManaRegenRates()
	}
	resto.OnSpellRegistered(func(spell *core.Spell) {
		if spell.ActionID.Tag != 0 || !spec.Actions[spell.ActionID.SpellID] {
			return
		}
		switch spec.Kind {
		case "riptide-cost-percent", "healing-wave-cost-percent":
			if spell.Cost == nil {
				panic("Owned Shaman relic family has no mana cost")
			}
			state.costSpells = append(state.costSpells, spell)
			previous := spell.ExtraCastCondition
			spell.ExtraCastCondition = func(sim *core.Simulation, target *core.Unit) bool {
				return state.configured && (previous == nil || previous(sim, target))
			}
		case "lesser-healing-wave-crit-percent":
			spell.BonusCritRating += spec.Amount * core.SpellCritRatingPerCritChance
		}
	})
}

func (resto *RestorationShaman) kfcShamanShieldMaximumCharges() int32 {
	if state := resto.kfcRelics; state != nil && state.spec.Kind == "water-shield-charges" {
		return kfcShamanShieldCharges + int32(state.spec.Amount)
	}
	return kfcShamanShieldCharges
}

func (resto *RestorationShaman) ConfigureKFCShamanHealingRelicPolicy(sim *core.Simulation, policy KFCShamanHealingRelicPolicy) error {
	state := resto.kfcRelics
	if sim == nil || sim.CurrentTime != 0 || resto.positions == nil || state == nil || state.configured || len(state.costSpells) == 0 || resto.GCD.ReadyAt() > 0 || resto.Hardcast.Expires > 0 {
		return fmt.Errorf("Shaman relic cost policy requires a fresh positioned cost-relic owner")
	}
	if policy.CostStacking != "additive-percent-reference" && policy.CostStacking != "multiplicative-reference" {
		return fmt.Errorf("unreviewed Shaman relic cost stacking reference")
	}
	for _, spell := range resto.Spellbook {
		for _, metric := range spell.SpellMetrics {
			if metric.Casts > 0 || metric.Ticks > 0 || metric.CritTicks > 0 {
				return fmt.Errorf("Shaman relic policy cannot change after casting")
			}
		}
	}
	for _, spell := range state.costSpells {
		if spell.Cost == nil || spell.Cost.KFCShamanRelicCostFactor() != 0 || state.spec.Amount != -5 {
			return fmt.Errorf("Shaman relic cost already modified or source changed")
		}
	}
	for _, spell := range state.costSpells {
		if policy.CostStacking == "additive-percent-reference" {
			spell.Cost.Multiplier += int32(state.spec.Amount)
		} else {
			spell.Cost.SetKFCShamanRelicCostFactor(1 + state.spec.Amount/100)
		}
		spell.DefaultCast.Cost = spell.Cost.GetCurrentCost()
	}
	state.policy = policy
	state.configured = true
	return nil
}

func (resto *RestorationShaman) KFCShamanHealingRelicPolicyEcho() *KFCShamanHealingRelicPolicy {
	if state := resto.kfcRelics; state != nil && state.configured {
		policy := state.policy
		return &policy
	}
	return nil
}
