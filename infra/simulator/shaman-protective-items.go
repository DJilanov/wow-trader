package restoration

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/stats"
)

//go:embed kfc_shaman_protective_rules.json
var kfcShamanProtectiveRulesJSON []byte

var kfcShamanProtectiveItemIDs = map[int32]bool{8367: true, 10030: true, 10543: true, 10721: true, 13164: true, 18340: true, 18638: true, 18639: true, 272437: true}

type KFCShamanProtectivePolicy struct {
	Schema                 string `json:"schema"`
	ID                     string `json:"id"`
	Cooldowns              string `json:"cooldowns"`
	AdmiralStamina         string `json:"admiralStamina,omitempty"`
	AdmiralHealth          string `json:"admiralHealth,omitempty"`
	AdmiralRecipientHealth string `json:"admiralRecipientHealth,omitempty"`
	HarmBelt               string `json:"harmBelt,omitempty"`
	SelfReflection         string `json:"selfReflection,omitempty"`
	AdaptiveEnemyInMelee   *bool  `json:"adaptiveEnemyInMelee,omitempty"`
	AdaptiveOutcome        string `json:"adaptiveOutcome,omitempty"`
}

type kfcShamanProtectiveRule struct {
	ItemID              int32   `json:"itemId"`
	SpellID             int32   `json:"spellId"`
	Kind                string  `json:"kind"`
	SpellSchoolMask     int32   `json:"spellSchoolMask"`
	PoolSchoolMask      int32   `json:"poolSchoolMask"`
	Amount              float64 `json:"amount"`
	Variance            float64 `json:"variance"`
	DurationMS          int64   `json:"durationMs"`
	CooldownMS          int64   `json:"cooldownMs"`
	SharedCategory      int32   `json:"sharedCategory"`
	SharedCooldownMS    int64   `json:"sharedCooldownMs"`
	Radius              float64 `json:"radius"`
	EngineeringRequired bool    `json:"engineeringRequired"`
	Explosion           *struct {
		SpellID  int32   `json:"spellId"`
		Amount   float64 `json:"amount"`
		Variance float64 `json:"variance"`
		Radius   float64 `json:"radius"`
	} `json:"explosion"`
}

type kfcShamanProtectiveItems struct {
	policy                     *KFCShamanProtectivePolicy
	owned                      map[int32]bool
	spells                     map[int32]*core.Spell
	auras                      map[int32]*core.Aura
	rules                      map[int32]kfcShamanProtectiveRule
	category99                 *core.Timer
	externalDeficitAdjustment  float64
	externalDeficitByRaidIndex map[int32]float64
	started                    bool
}

func (policy KFCShamanProtectivePolicy) Validate() error {
	if policy.Schema != "kfc-shaman-protective-policy.v1" || policy.ID == "" || len(policy.ID) > 100 || policy.Cooldowns != "item-override-inherits-negative-reference" ||
		(policy.AdmiralStamina == "additive-reference") != (policy.AdmiralHealth != "") ||
		(policy.AdmiralStamina == "additive-reference") != (policy.AdmiralRecipientHealth != "") ||
		(policy.AdmiralRecipientHealth != "" && policy.AdmiralRecipientHealth != "ten-health-per-stamina-reference") ||
		(policy.AdaptiveEnemyInMelee != nil) != (policy.AdaptiveOutcome != "") ||
		(policy.AdmiralStamina != "" && policy.AdmiralStamina != "disabled-reference" && policy.AdmiralStamina != "additive-reference") ||
		(policy.AdmiralHealth != "" && policy.AdmiralHealth != "maximum-only-reference" && policy.AdmiralHealth != "grant-on-gain-reference") ||
		(policy.HarmBelt != "" && policy.HarmBelt != "disabled-use-reference" && policy.HarmBelt != "no-overload-reference") ||
		(policy.SelfReflection != "" && policy.SelfReflection != "self-ineligible-reference") ||
		(policy.AdaptiveOutcome != "" && policy.AdaptiveOutcome != "noncritical-hit-reference") {
		return fmt.Errorf("invalid Shaman protective reference")
	}
	return nil
}

func copyKFCShamanProtectivePolicy(policy KFCShamanProtectivePolicy) KFCShamanProtectivePolicy {
	copy := policy
	if policy.AdaptiveEnemyInMelee != nil {
		value := *policy.AdaptiveEnemyInMelee
		copy.AdaptiveEnemyInMelee = &value
	}
	return copy
}

func (resto *RestorationShaman) KFCShamanProtectivePolicyEcho() *KFCShamanProtectivePolicy {
	if state := resto.kfcProtectiveItems; state != nil && state.policy != nil {
		copy := copyKFCShamanProtectivePolicy(*state.policy)
		return &copy
	}
	return nil
}

func (resto *RestorationShaman) ConfigureKFCShamanProtectiveItems(sim *core.Simulation, policy KFCShamanProtectivePolicy) error {
	if err := policy.Validate(); err != nil {
		return err
	}
	state := resto.kfcProtectiveItems
	if sim == nil || sim.CurrentTime != 0 || state == nil || len(state.owned) == 0 || state.policy != nil || state.started || resto.positions == nil || resto.GCD.ReadyAt() > 0 || resto.IsCasting(sim) || resto.IsChanneling(sim) || !resto.kfcShamanItemsAlive() {
		return fmt.Errorf("protective policy requires a fresh positioned equipped Shaman")
	}
	if state.owned[10030] {
		if policy.AdmiralStamina == "" || (policy.AdmiralStamina == "additive-reference") != (policy.AdmiralHealth != "") {
			return fmt.Errorf("declare the owned Admiral stacking and health reference")
		}
	} else if policy.AdmiralStamina != "" || policy.AdmiralHealth != "" || policy.AdmiralRecipientHealth != "" {
		return fmt.Errorf("unowned Admiral reference")
	}
	if state.owned[10721] != (policy.HarmBelt != "") || (state.owned[18638] || state.owned[18639]) != (policy.SelfReflection != "") || state.owned[272437] != (policy.AdaptiveEnemyInMelee != nil) || state.owned[272437] != (policy.AdaptiveOutcome != "") {
		return fmt.Errorf("protective references must match exactly the owned conditional effects")
	}
	for _, spell := range resto.Spellbook {
		for _, metric := range spell.SpellMetrics {
			if metric.Casts > 0 || metric.Hits > 0 || metric.Crits > 0 || metric.Ticks > 0 || metric.CritTicks > 0 {
				return fmt.Errorf("protective policy cannot change after events")
			}
		}
	}
	copy := copyKFCShamanProtectivePolicy(policy)
	state.policy = &copy
	return nil
}

func (resto *RestorationShaman) kfcShamanProtectiveReady(sim *core.Simulation, target *core.Unit) bool {
	state := resto.kfcProtectiveItems
	return state != nil && state.policy != nil && target == &resto.Unit && sim.CurrentTime >= 0 && resto.kfcShamanItemsAlive() && !resto.IsCasting(sim) && !resto.IsChanneling(sim)
}

func (resto *RestorationShaman) registerKFCShamanProtectiveItems() {
	if resto.kfcProtectiveItems != nil || !resto.Env.IsForever() {
		panic("invalid Shaman protective registration")
	}
	state := &kfcShamanProtectiveItems{owned: map[int32]bool{}, spells: map[int32]*core.Spell{}, auras: map[int32]*core.Aura{}, rules: map[int32]kfcShamanProtectiveRule{}}
	resto.kfcProtectiveItems = state
	for _, item := range resto.Equipment {
		if kfcShamanProtectiveItemIDs[item.ID] {
			state.owned[item.ID] = true
		}
	}
	if len(state.owned) == 0 {
		return
	}
	var source struct {
		Schema      string                    `json:"schema"`
		SourceBuild int                       `json:"sourceBuild"`
		Items       []kfcShamanProtectiveRule `json:"items"`
	}
	if err := json.Unmarshal(kfcShamanProtectiveRulesJSON, &source); err != nil || source.Schema != "kfc-shaman-protective-item-rules.v1" || source.SourceBuild != 70532 || len(source.Items) != 9 {
		panic("invalid compiled protective rules")
	}
	for _, row := range source.Items {
		if !kfcShamanProtectiveItemIDs[row.ItemID] || state.rules[row.ItemID].ItemID != 0 {
			panic("duplicate or unexpected protective item")
		}
		state.rules[row.ItemID] = row
	}
	core.MakePermanent(resto.RegisterAura(core.Aura{Label: "KFC Shaman protective lifecycle", OnReset: func(_ *core.Aura, _ *core.Simulation) {
		state.started = false
		state.externalDeficitAdjustment = 0
		state.externalDeficitByRaidIndex = map[int32]float64{}
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
	for _, row := range source.Items {
		if !state.owned[row.ItemID] {
			continue
		}
		if core.HasItemEffect(row.ItemID) {
			panic("protective item gained a common handler; re-admit dispatch")
		}
		if row.ItemID == 10030 {
			resto.registerKFCShamanAdmiral(row)
			continue
		}
		resto.registerKFCShamanProtectiveUse(row)
	}
}

func (resto *RestorationShaman) kfcShamanProtectiveCast(row kfcShamanProtectiveRule) core.CastConfig {
	cast := core.CastConfig{CD: core.Cooldown{Timer: resto.NewTimer(), Duration: time.Duration(row.CooldownMS) * time.Millisecond}}
	if row.SharedCooldownMS > 0 {
		var timer *core.Timer
		switch row.SharedCategory {
		case 99:
			if resto.kfcProtectiveItems.category99 == nil {
				resto.kfcProtectiveItems.category99 = resto.NewTimer()
			}
			timer = resto.kfcProtectiveItems.category99
		case 1141:
			timer = resto.GetOffensiveTrinketCD()
		case 2554:
			timer = resto.kfcShamanProtectiveDefensiveTimer()
		default:
			panic("unreviewed protective shared cooldown")
		}
		cast.SharedCD = core.Cooldown{Timer: timer, Duration: time.Duration(row.SharedCooldownMS) * time.Millisecond}
	}
	return cast
}

func (resto *RestorationShaman) kfcShamanProtectiveDefensiveTimer() *core.Timer {
	if mindtap := resto.GetSpell(core.ActionID{SpellID: 1302205}); mindtap != nil && mindtap.SharedCD.Timer != nil {
		return mindtap.SharedCD.Timer
	}
	if second := resto.GetSpell(core.ActionID{SpellID: 15604}); second != nil {
		if second.SharedCD.Timer != nil {
			return second.SharedCD.Timer
		}
		shared := core.Cooldown{Timer: resto.GetDefensiveTrinketCD(), Duration: 10 * time.Second}
		second.SharedCD = shared
		previous := second.ApplyEffects
		second.ApplyEffects = func(sim *core.Simulation, target *core.Unit, spell *core.Spell) {
			shared.Use(sim)
			previous(sim, target, spell)
		}
		return shared.Timer
	}
	return resto.GetDefensiveTrinketCD()
}

func (resto *RestorationShaman) registerKFCShamanProtectiveUse(row kfcShamanProtectiveRule) {
	state := resto.kfcProtectiveItems
	school, err := core.SpellSchoolFromClientMask(row.SpellSchoolMask)
	if err != nil || school == core.SpellSchoolNone {
		panic("invalid protective spell school")
	}
	config := core.SpellConfig{ActionID: core.ActionID{ItemID: row.ItemID}, SpellSchool: school, ProcMask: core.ProcMaskEmpty, Flags: core.SpellFlagHelpful | core.SpellFlagNoOnCastComplete, DamageMultiplier: 1, ThreatMultiplier: 1, Cast: resto.kfcShamanProtectiveCast(row),
		ExtraCastCondition: func(sim *core.Simulation, target *core.Unit) bool {
			return resto.kfcShamanProtectiveReady(sim, target) && (!row.EngineeringRequired || resto.HasProfession(proto.Profession_Engineering)) && (row.ItemID != 10721 || state.policy.HarmBelt == "no-overload-reference")
		}}
	if row.PoolSchoolMask != 0 {
		mask, err := core.SpellSchoolFromClientMask(row.PoolSchoolMask)
		if err != nil || mask == core.SpellSchoolNone {
			panic("invalid protective pool school")
		}
		config.Shield = core.ShieldConfig{SelfOnly: true, AbsorbSchoolMask: mask, Aura: core.Aura{Label: fmt.Sprintf("Shaman protective pool %d", row.ItemID), Duration: time.Duration(row.DurationMS) * time.Millisecond}}
		if row.ItemID == 272437 {
			if row.Explosion == nil {
				panic("missing source explosion")
			}
			explosion := resto.RegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: row.Explosion.SpellID}, SpellSchool: core.SpellSchoolNature, DefenseType: core.DefenseTypeMagic, ProcMask: core.ProcMaskSpellDamageProc, Flags: core.SpellFlagPassiveSpell | core.SpellFlagNoOnCastComplete, DamageMultiplier: 1, ThreatMultiplier: 1})
			config.Shield.OnDepleted = func(sim *core.Simulation, _ *core.Spell, _ *core.SpellResult) {
				if state.policy != nil && state.policy.AdaptiveEnemyInMelee != nil && *state.policy.AdaptiveEnemyInMelee && resto.kfcShamanItemsAlive() {
					mean, spread := row.Explosion.Amount, row.Explosion.Amount*row.Explosion.Variance/2
					explosion.CalcAndDealDamage(sim, resto.Env.Encounter.TargetUnits[0], sim.RollWithLabel(mean-spread, mean+spread, "Shaman Adaptive explosion"), explosion.OutcomeAlwaysHit)
				}
			}
		}
		config.ApplyEffects = func(sim *core.Simulation, _ *core.Unit, spell *core.Spell) {
			state.started = true
			spread := row.Amount * row.Variance / 2
			spell.SelfShield().Apply(sim, sim.RollWithLabel(row.Amount-spread, row.Amount+spread, "Shaman protective pool"))
		}
	} else {
		aura := resto.RegisterAura(core.Aura{Label: fmt.Sprintf("Shaman protective aura %d", row.ItemID), ActionID: core.ActionID{SpellID: row.SpellID}, Duration: time.Duration(row.DurationMS) * time.Millisecond})
		if row.ItemID == 13164 {
			aura.OnGain = func(_ *core.Aura, sim *core.Simulation) { resto.AddStatDynamic(sim, stats.FireResistance, row.Amount) }
			aura.OnExpire = func(_ *core.Aura, sim *core.Simulation) { resto.AddStatDynamic(sim, stats.FireResistance, -row.Amount) }
		}
		state.auras[row.ItemID] = aura
		config.ApplyEffects = func(sim *core.Simulation, _ *core.Unit, _ *core.Spell) { state.started = true; aura.Activate(sim) }
	}
	state.spells[row.ItemID] = resto.RegisterSpell(config)
}

func (resto *RestorationShaman) registerKFCShamanAdmiral(row kfcShamanProtectiveRule) {
	state := resto.kfcProtectiveItems
	auras := map[int32]*core.Aura{}
	for _, agent := range resto.Party.Players {
		character := agent.GetCharacter()
		unit := &character.Unit
		amount, health, syntheticHealth := 0.0, 0.0, 0.0
		_, synthetic := agent.(*core.TargetDummy)
		metrics := unit.NewHealthMetrics(core.ActionID{SpellID: row.SpellID, Tag: 1})
		adjust := func(before float64) {
			if unit != &resto.Unit {
				change := max(0, unit.MaxHealth()-unit.CurrentHealth()) - before
				state.externalDeficitAdjustment += change
				state.externalDeficitByRaidIndex[unit.Index] += change
			}
		}
		auras[unit.UnitIndex] = character.RegisterAura(core.Aura{Label: fmt.Sprintf("Shaman Admiral reference %d", resto.UnitIndex), ActionID: core.ActionID{SpellID: row.SpellID}, Duration: time.Duration(row.DurationMS) * time.Millisecond,
			OnGain: func(_ *core.Aura, sim *core.Simulation) {
				amount, health, syntheticHealth = 0, 0, 0
				if state.policy.AdmiralStamina != "additive-reference" {
					return
				}
				before, maximum := max(0, unit.MaxHealth()-unit.CurrentHealth()), unit.MaxHealth()
				amount = row.Amount
				character.AddStatDynamic(sim, stats.Stamina, amount)
				if synthetic {
					// Benchmark recipients omit universal Character stat dependencies.
					syntheticHealth = 10 * amount
					character.AddStatDynamic(sim, stats.Health, syntheticHealth)
				}
				health = max(0, unit.MaxHealth()-maximum)
				if state.policy.AdmiralHealth == "grant-on-gain-reference" {
					unit.GainHealth(sim, health, metrics)
				}
				adjust(before)
			},
			OnExpire: func(_ *core.Aura, sim *core.Simulation) {
				if amount == 0 {
					return
				}
				before := max(0, unit.MaxHealth()-unit.CurrentHealth())
				character.AddStatDynamic(sim, stats.Stamina, -amount)
				if syntheticHealth != 0 {
					character.AddStatDynamic(sim, stats.Health, -syntheticHealth)
				}
				loss := max(0, unit.CurrentHealth()-unit.MaxHealth())
				if state.policy.AdmiralHealth == "grant-on-gain-reference" {
					loss = health
				}
				unit.ExpireTemporaryHealth(sim, loss, metrics)
				adjust(before)
				amount, health, syntheticHealth = 0, 0, 0
			},
		})
	}
	state.spells[row.ItemID] = resto.RegisterSpell(core.SpellConfig{ActionID: core.ActionID{ItemID: row.ItemID}, SpellSchool: core.SpellSchoolArcane, ProcMask: core.ProcMaskEmpty, Flags: core.SpellFlagHelpful | core.SpellFlagNoOnCastComplete, Cast: resto.kfcShamanProtectiveCast(row), ExtraCastCondition: resto.kfcShamanProtectiveReady,
		ApplyEffects: func(sim *core.Simulation, _ *core.Unit, _ *core.Spell) {
			state.started = true
			for _, agent := range resto.Party.Players {
				unit := &agent.GetCharacter().Unit
				if resto.kfcShamanUtilityTarget(unit, row.Radius, true) {
					auras[unit.UnitIndex].Activate(sim)
				}
			}
		},
	})
}
