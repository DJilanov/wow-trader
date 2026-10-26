package restoration

import (
	"fmt"

	"github.com/wowsims/classic/sim/core"
)

// KFC_SHAMAN_CAST_RESOURCE_SET_VALUES

type KFCShamanCastResourceSetPolicy struct {
	ProcRouting        string `json:"procRouting"`
	WildheartChance    string `json:"wildheartChance"`
	DreadmistCriticals string `json:"dreadmistCriticals"`
}

type KFCShamanCastResourceSetMetrics struct {
	Attempts      int32   `json:"attempts"`
	Procs         int32   `json:"procs"`
	ManaAttempted float64 `json:"manaAttempted"`
	ManaRestored  float64 `json:"manaRestored"`
}

type kfcShamanCastResourceSets struct {
	setID      int32
	configured bool
	policy     KFCShamanCastResourceSetPolicy
	chance     float64
	mana       *core.ResourceMetrics
	heal       *core.Spell
	metrics    KFCShamanCastResourceSetMetrics
}

func (*RestorationShaman) KFCControlsShamanCastResourceSets() bool { return true }

func (resto *RestorationShaman) registerKFCShamanCastResourceSets() {
	if resto.kfcCastResourceSets != nil {
		panic("Duplicate owned Shaman cast-resource sets")
	}
	counts := map[int32]int{}
	for _, item := range resto.Equipment {
		counts[item.SetID]++
	}
	var setID int32
	for id := range kfcShamanCastSetRoots {
		if counts[id] >= 5 {
			if setID != 0 {
				panic("Multiple five-piece cast-resource armor sets")
			}
			setID = id
		}
	}
	if setID == 0 {
		return
	}
	if !core.HasForeverEquipmentSetDefinition(setID) {
		panic("Cast-resource set needs an isolated current definition")
	}
	state := &kfcShamanCastResourceSets{setID: setID}
	resto.kfcCastResourceSets = state
	if setID == 183 {
		state.heal = resto.RegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: 450583}, SpellSchool: core.SpellSchoolHoly, DefenseType: core.DefenseTypeMagic, ProcMask: core.ProcMaskSpellHealing, Flags: core.SpellFlagHelpful | core.SpellFlagPassiveSpell | core.SpellFlagNoOnCastComplete, DamageMultiplier: 1, ThreatMultiplier: 1})
	} else {
		id := int32(450554)
		if setID == 185 {
			id = 27782
		}
		state.mana = resto.NewManaMetrics(core.ActionID{SpellID: id})
	}
	resto.OnSpellRegistered(func(spell *core.Spell) {
		if spell.ActionID.Tag != 0 || !kfcShamanCastSetOwnedIDs[spell.ActionID.SpellID] {
			return
		}
		previous := spell.ExtraCastCondition
		spell.ExtraCastCondition = func(sim *core.Simulation, target *core.Unit) bool {
			return state.configured && (previous == nil || previous(sim, target))
		}
	})
	trigger := func(sim *core.Simulation, spell *core.Spell, allOwned bool) {
		if spell == nil || resto.CurrentHealth() <= 0 || !resto.IsEnabled() {
			return
		}
		eligible := kfcShamanClassHealIDs[spell.ActionID.SpellID]
		if allOwned {
			eligible = spell.ActionID.Tag == 0 && kfcShamanCastSetOwnedIDs[spell.ActionID.SpellID]
		}
		if !eligible {
			return
		}
		if !state.configured {
			panic("Cast-resource set requires a fresh explicit reference")
		}
		state.metrics.Attempts++
		if !sim.Proc(state.chance, "KFC Shaman cast-resource proc") {
			return
		}
		state.metrics.Procs++
		if state.mana != nil {
			before := resto.CurrentMana()
			resto.AddMana(sim, kfcShamanCastSetMana, state.mana)
			state.metrics.ManaAttempted += kfcShamanCastSetMana
			state.metrics.ManaRestored += resto.CurrentMana() - before
		} else {
			outcome := state.heal.OutcomeHealing
			if state.policy.DreadmistCriticals == "critical-reference" {
				outcome = state.heal.OutcomeHealingCrit
			}
			state.heal.CalcAndDealHealing(sim, &resto.Unit, sim.Roll(kfcShamanCastSetHealLow, kfcShamanCastSetHealHigh), outcome)
		}
	}
	core.MakePermanent(resto.RegisterAura(core.Aura{
		Label: "KFC Shaman cast-resource trigger", ActionID: core.ActionID{SpellID: kfcShamanCastSetRoots[setID]},
		OnReset: func(_ *core.Aura, _ *core.Simulation) { state.metrics = KFCShamanCastResourceSetMetrics{} },
		OnCastComplete: func(_ *core.Aura, sim *core.Simulation, spell *core.Spell) {
			if state.policy.ProcRouting == "completed-class-healing-casts-reference" {
				trigger(sim, spell, false)
			}
			if state.policy.ProcRouting == "completed-owned-spell-casts-reference" {
				trigger(sim, spell, true)
			}
		},
		OnHealDealt: func(_ *core.Aura, sim *core.Simulation, spell *core.Spell, result *core.SpellResult) {
			if result != nil && result.DirectDamageOrHealing && result.Landed() && (state.policy.ProcRouting == "direct-class-healing-events-reference" || state.policy.ProcRouting == "all-class-healing-events-reference") {
				trigger(sim, spell, false)
			}
		},
		OnPeriodicHealDealt: func(_ *core.Aura, sim *core.Simulation, spell *core.Spell, result *core.SpellResult) {
			if state.policy.ProcRouting == "all-class-healing-events-reference" && result != nil && !result.DirectDamageOrHealing && result.Landed() {
				trigger(sim, spell, false)
			}
		},
	}))
}

func (resto *RestorationShaman) ConfigureKFCShamanCastResourceSets(sim *core.Simulation, policy KFCShamanCastResourceSetPolicy) error {
	state := resto.kfcCastResourceSets
	if sim == nil || sim.CurrentTime != 0 || resto.positions == nil || state == nil || state.configured || resto.GCD.ReadyAt() > 0 || resto.Hardcast.Expires > 0 {
		return fmt.Errorf("Cast-resource policy requires a fresh equipped owner")
	}
	if policy.ProcRouting != "completed-class-healing-casts-reference" && policy.ProcRouting != "completed-owned-spell-casts-reference" && policy.ProcRouting != "direct-class-healing-events-reference" && policy.ProcRouting != "all-class-healing-events-reference" {
		return fmt.Errorf("Unreviewed cast-resource routing")
	}
	if state.setID == 185 {
		if policy.WildheartChance != "two-percent-reference" && policy.WildheartChance != "five-percent-reference" {
			return fmt.Errorf("Wildheart requires an explicit chance reference")
		}
	} else if policy.WildheartChance != "" {
		return fmt.Errorf("Wildheart chance requires its five-piece owner")
	}
	if state.setID == 183 {
		if policy.DreadmistCriticals != "noncritical-reference" && policy.DreadmistCriticals != "critical-reference" {
			return fmt.Errorf("Dreadmist requires an explicit critical reference")
		}
	} else if policy.DreadmistCriticals != "" {
		return fmt.Errorf("Dreadmist criticals require its five-piece owner")
	}
	for _, spell := range resto.Spellbook {
		for _, metric := range spell.SpellMetrics {
			if metric.Casts > 0 || metric.Hits > 0 || metric.Crits > 0 || metric.Ticks > 0 || metric.CritTicks > 0 {
				return fmt.Errorf("Cast-resource policy cannot change after events")
			}
		}
	}
	state.policy = policy
	state.chance = kfcShamanCastSetChance
	if state.setID == 185 && policy.WildheartChance == "two-percent-reference" {
		state.chance = .02
	}
	state.configured = true
	return nil
}

func (resto *RestorationShaman) KFCShamanCastResourceSetMetrics() KFCShamanCastResourceSetMetrics {
	if resto.kfcCastResourceSets == nil {
		return KFCShamanCastResourceSetMetrics{}
	}
	return resto.kfcCastResourceSets.metrics
}

func (resto *RestorationShaman) KFCShamanCastResourceSetPolicyEcho() *KFCShamanCastResourceSetPolicy {
	if state := resto.kfcCastResourceSets; state != nil && state.configured {
		policy := state.policy
		return &policy
	}
	return nil
}
