package core

import (
	"math"
	"time"

	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/stats"
)

// KFC_VIRTUOUS_CLIENT_CONSTANTS

// ForeverVirtuousPassiveStats does not register a set handler. The four-piece
// shield must be admitted separately before any complete-set comparison.
func ForeverVirtuousPassiveStats(equipment Equipment, ruleset proto.Ruleset) stats.Stats {
	var result stats.Stats
	if ruleset != proto.Ruleset_RulesetForever {
		return result
	}
	pieces := 0
	for _, item := range equipment {
		if item.SetID == kfcVirtuousSetID {
			pieces++
		}
	}
	if pieces >= 2 {
		for _, resistance := range []stats.Stat{stats.ArcaneResistance, stats.FireResistance,
			stats.FrostResistance, stats.NatureResistance, stats.ShadowResistance} {
			result[resistance] = kfcVirtuousResistance
		}
	}
	if pieces >= 6 {
		// Unified spell power already contributes to healing.
		result[stats.SpellPower] = kfcVirtuousSpellPower
	}
	if pieces >= 8 {
		result[stats.BonusArmor] = kfcVirtuousBonusArmor
	}
	return result
}

// ForeverVirtuousShieldReferencePolicy makes the two unadmitted rules explicit.
// Neither the incoming-event mapping nor Priest-family scaling has a default.
type ForeverVirtuousShieldReferencePolicy struct {
	EligibleIncoming func(*Spell, *SpellResult) bool
	FamilyMultiplier float64
}

// RegisterForeverVirtuousShieldReference exercises the sourced shield payload
// with an explicitly supplied interpretation. It is not called by set dispatch
// and does not establish server event, family, or overlapping-shield behavior.
func RegisterForeverVirtuousShieldReference(character *Character, policy ForeverVirtuousShieldReferencePolicy) (*Spell, *Aura) {
	if !character.Env.IsForever() {
		return nil, nil
	}
	if policy.EligibleIncoming == nil || math.IsNaN(policy.FamilyMultiplier) || math.IsInf(policy.FamilyMultiplier, 0) || policy.FamilyMultiplier <= 0 {
		panic("Virtuous reference requires explicit incoming-event and family policies")
	}
	const triggerLabel = "Virtuous incoming shield reference"
	if character.GetAura(triggerLabel) != nil {
		panic("Virtuous shield reference is already registered")
	}
	shield := character.RegisterSpell(SpellConfig{
		ActionID: ActionID{SpellID: kfcVirtuousShieldID}, SpellSchool: SpellSchoolHoly,
		ProcMask: ProcMaskSpellHealing, Flags: SpellFlagPassiveSpell | SpellFlagNoOnCastComplete,
		DamageMultiplier: policy.FamilyMultiplier,
		Shield:           ShieldConfig{SelfOnly: true, Aura: Aura{Label: "Virtuous shield reference", Duration: time.Duration(kfcVirtuousShieldDurationMs) * time.Millisecond}},
		ApplyEffects: func(sim *Simulation, _ *Unit, spell *Spell) {
			spell.SelfShield().Apply(sim, kfcVirtuousShieldAmount)
		},
	})
	trigger := MakeProcTriggerAura(&character.Unit, ProcTrigger{
		Name: triggerLabel, ActionID: ActionID{SpellID: kfcVirtuousProcID},
		Callback: CallbackOnSpellHitTaken, ProcChance: kfcVirtuousProcChance,
		ICD: time.Duration(kfcVirtuousICDMs) * time.Millisecond,
		Handler: func(sim *Simulation, _ *Spell, _ *SpellResult) {
			shield.Cast(sim, &character.Unit)
		},
	})
	callback := trigger.OnSpellHitTaken
	trigger.OnSpellHitTaken = func(aura *Aura, sim *Simulation, incoming *Spell, result *SpellResult) {
		// Reject ineligible events before consuming RNG or the internal cooldown.
		if incoming == nil || result == nil || result.Target != &character.Unit || !character.IsOpponent(incoming.Unit) || !policy.EligibleIncoming(incoming, result) {
			return
		}
		callback(aura, sim, incoming, result)
	}
	return shield, trigger
}
