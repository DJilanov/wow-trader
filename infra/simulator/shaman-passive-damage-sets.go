package restoration

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"time"

	"github.com/wowsims/classic/sim/core"
)

//go:embed kfc_shaman_passive_damage_set_rules.json
var kfcShamanPassiveDamageSetRulesJSON []byte

type KFCShamanPassiveDamageSetPolicy struct {
	Schema           string   `json:"schema"`
	ID               string   `json:"id"`
	Timing           string   `json:"timing"`
	NecropileTrigger string   `json:"necropileTrigger,omitempty"`
	NecropileChance  *float64 `json:"necropileChance,omitempty"`
	DrainOutcome     string   `json:"drainOutcome,omitempty"`
	Postmaster       string   `json:"postmaster,omitempty"`
}

type kfcShamanPassiveDamageSets struct {
	policy                                           *KFCShamanPassiveDamageSetPolicy
	necropile, postmaster, adaptive, started, firing bool
	drain                                            *core.Spell
	reflection                                       *core.Aura
	drainCD, reflectionCD                            core.Cooldown
	threshold                                        float64
	opportunities, procs                             int
	usefulHealing                                    float64
}

func (policy KFCShamanPassiveDamageSetPolicy) Validate() error {
	if policy.Schema != "kfc-shaman-passive-damage-policy.v1" || policy.ID == "" || len(policy.ID) > 100 || policy.Timing != "captured-proc-recovery-ms-reference" ||
		(policy.NecropileTrigger != "" && policy.NecropileTrigger != "cast-only-reference" && policy.NecropileTrigger != "adaptive-damage-reference") ||
		(policy.Postmaster != "" && policy.Postmaster != "self-ineligible-after-hit-strict-below-reference") || (policy.NecropileTrigger == "" && policy.Postmaster == "") {
		return fmt.Errorf("invalid Shaman passive-damage reference")
	}
	if policy.NecropileTrigger == "adaptive-damage-reference" {
		if policy.NecropileChance == nil || !kfcFinite(*policy.NecropileChance) || *policy.NecropileChance < 0 || *policy.NecropileChance > 1 || policy.DrainOutcome != "noncritical-hit-reference" {
			return fmt.Errorf("declare the uncertain Necropile rate and outcome")
		}
	} else if policy.NecropileChance != nil || policy.DrainOutcome != "" {
		return fmt.Errorf("unowned Necropile damage reference")
	}
	return nil
}

func copyKFCShamanPassiveDamagePolicy(policy KFCShamanPassiveDamageSetPolicy) KFCShamanPassiveDamageSetPolicy {
	copy := policy
	if policy.NecropileChance != nil {
		value := *policy.NecropileChance
		copy.NecropileChance = &value
	}
	return copy
}

func (resto *RestorationShaman) KFCShamanPassiveDamagePolicyEcho() *KFCShamanPassiveDamageSetPolicy {
	if state := resto.kfcPassiveDamageSets; state != nil && state.policy != nil {
		copy := copyKFCShamanPassiveDamagePolicy(*state.policy)
		return &copy
	}
	return nil
}

func (resto *RestorationShaman) ConfigureKFCShamanPassiveDamageSets(sim *core.Simulation, policy KFCShamanPassiveDamageSetPolicy) error {
	if err := policy.Validate(); err != nil {
		return err
	}
	state := resto.kfcPassiveDamageSets
	if sim == nil || sim.CurrentTime != 0 || state == nil || (!state.necropile && !state.postmaster) || state.policy != nil || state.started || resto.positions == nil || !resto.kfcShamanItemsAlive() || resto.GCD.ReadyAt() > 0 || resto.IsCasting(sim) || resto.IsChanneling(sim) {
		return fmt.Errorf("passive-damage reference requires a fresh positioned equipped Shaman")
	}
	if state.necropile != (policy.NecropileTrigger != "") || state.postmaster != (policy.Postmaster != "") || policy.NecropileTrigger == "adaptive-damage-reference" && !state.adaptive {
		return fmt.Errorf("passive-damage references must match actual owned effects")
	}
	for _, spell := range resto.Spellbook {
		for _, metric := range spell.SpellMetrics {
			if metric.Casts > 0 || metric.Hits > 0 || metric.Crits > 0 || metric.Ticks > 0 || metric.CritTicks > 0 {
				return fmt.Errorf("passive-damage policy cannot change after events")
			}
		}
	}
	copy := copyKFCShamanPassiveDamagePolicy(policy)
	state.policy = &copy
	return nil
}

func (resto *RestorationShaman) registerKFCShamanPassiveDamageSets() {
	if resto.kfcPassiveDamageSets != nil || !resto.Env.IsForever() {
		panic("invalid Shaman passive-damage registration")
	}
	counts := map[int32]int{}
	adaptive := false
	for _, item := range resto.Equipment {
		counts[item.SetID]++
		if item.ID == 272437 {
			adaptive = true
		}
	}
	state := &kfcShamanPassiveDamageSets{necropile: counts[122] >= 3, postmaster: counts[81] >= 4, adaptive: adaptive}
	resto.kfcPassiveDamageSets = state
	if !state.necropile && !state.postmaster {
		return
	}
	var rules struct {
		Schema    string `json:"schema"`
		Necropile struct {
			DrainSpellID int32   `json:"drainSpellId"`
			Amount       float64 `json:"amount"`
			SchoolMask   int32   `json:"schoolMask"`
			RecoveryMS   int64   `json:"recoveryMs"`
		} `json:"necropile"`
		Postmaster struct {
			BuffSpellID int32   `json:"buffSpellId"`
			Threshold   float64 `json:"healthThresholdPercent"`
			DurationMS  int64   `json:"durationMs"`
			RecoveryMS  int64   `json:"recoveryMs"`
			Charges     int32   `json:"charges"`
		} `json:"postmaster"`
	}
	if err := json.Unmarshal(kfcShamanPassiveDamageSetRulesJSON, &rules); err != nil || rules.Schema != "kfc-shaman-passive-damage-set-rules.v1" {
		panic("invalid passive-damage source rules")
	}
	if state.necropile {
		school, err := core.SpellSchoolFromClientMask(rules.Necropile.SchoolMask)
		if err != nil || school == core.SpellSchoolNone {
			panic("invalid Necropile source school")
		}
		state.drainCD = core.Cooldown{Timer: resto.NewTimer(), Duration: time.Duration(rules.Necropile.RecoveryMS) * time.Millisecond}
		health := resto.NewHealthMetrics(core.ActionID{SpellID: rules.Necropile.DrainSpellID})
		state.drain = resto.RegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: rules.Necropile.DrainSpellID}, SpellSchool: school, DefenseType: core.DefenseTypeMagic, ProcMask: core.ProcMaskSpellDamageProc, Flags: core.SpellFlagPassiveSpell | core.SpellFlagNoOnCastComplete, DamageMultiplier: 1, ThreatMultiplier: 1,
			ExtraCastCondition: func(_ *core.Simulation, target *core.Unit) bool {
				return state.firing && state.policy != nil && state.policy.NecropileTrigger == "adaptive-damage-reference" && resto.kfcShamanItemsAlive() && resto.IsOpponent(target)
			},
			ApplyEffects: func(sim *core.Simulation, target *core.Unit, spell *core.Spell) {
				if state.policy == nil || state.policy.NecropileTrigger != "adaptive-damage-reference" || !resto.kfcShamanItemsAlive() || !resto.IsOpponent(target) {
					return
				}
				result := spell.CalcAndDealDamage(sim, target, rules.Necropile.Amount, spell.OutcomeAlwaysHit)
				before := resto.CurrentHealth()
				resto.GainHealth(sim, result.Damage, health)
				state.usefulHealing += resto.CurrentHealth() - before
			},
		})
	}
	if state.postmaster {
		state.threshold = rules.Postmaster.Threshold / 100
		state.reflectionCD = core.Cooldown{Timer: resto.NewTimer(), Duration: time.Duration(rules.Postmaster.RecoveryMS) * time.Millisecond}
		state.reflection = resto.RegisterAura(core.Aura{Label: "KFC Shaman Return to Sender reference", ActionID: core.ActionID{SpellID: rules.Postmaster.BuffSpellID}, Duration: time.Duration(rules.Postmaster.DurationMS) * time.Millisecond, MaxStacks: rules.Postmaster.Charges})
	}
	core.MakePermanent(resto.RegisterAura(core.Aura{Label: "KFC Shaman passive-damage lifecycle",
		OnReset: func(_ *core.Aura, _ *core.Simulation) {
			state.started = false
			state.firing = false
			state.opportunities = 0
			state.procs = 0
			state.usefulHealing = 0
		},
		OnSpellHitDealt: func(_ *core.Aura, sim *core.Simulation, spell *core.Spell, result *core.SpellResult) {
			if !state.necropile || spell.Unit != &resto.Unit || spell.ActionID.SpellID != 1291099 || spell.ActionID.Tag != 0 || !spell.ProcMask.Matches(core.ProcMaskSpellDamageProc) || !resto.IsOpponent(result.Target) || !result.Landed() || result.Damage <= 0 || !resto.kfcShamanItemsAlive() {
				return
			}
			state.started = true
			if state.policy == nil {
				panic("owned Necropile requires an explicit passive-damage reference")
			}
			if state.policy.NecropileTrigger != "adaptive-damage-reference" || !state.drainCD.IsReady(sim) {
				return
			}
			state.opportunities++
			if !sim.Proc(*state.policy.NecropileChance, "KFC Shaman Necropile explicit chance") {
				return
			}
			state.drainCD.Use(sim)
			state.firing = true
			if state.drain.Cast(sim, result.Target) {
				state.procs++
			}
			state.firing = false
		},
	}))
}

func (resto *RestorationShaman) kfcShamanPassiveDamageAfterDamage(sim *core.Simulation, incoming *core.Spell, result *core.SpellResult) {
	state := resto.kfcPassiveDamageSets
	if state == nil || !state.postmaster || sim.CurrentTime < 0 || incoming == nil || result == nil || result.Target != &resto.Unit || !result.Landed() || result.Damage <= 0 || !resto.kfcShamanItemsAlive() {
		return
	}
	state.started = true
	if state.policy == nil {
		panic("owned Postmaster requires an explicit reflection reference")
	}
	if resto.CurrentHealth()/resto.MaxHealth() < state.threshold && state.reflectionCD.IsReady(sim) {
		state.reflectionCD.Use(sim)
		state.reflection.Activate(sim)
		state.reflection.SetStacks(sim, 1)
	}
}
