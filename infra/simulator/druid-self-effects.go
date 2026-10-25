package restoration

import (
	"fmt"
	"time"

	"github.com/wowsims/classic/sim/core"
)

type KFCDruidSelfEffectsPolicy struct {
	Schema               string `json:"schema"`
	ID                   string `json:"id"`
	ViperThresholdTiming string `json:"viperThresholdTiming"`
	VitalityTickMs       int    `json:"vitalityTickMs"`
	DreadmistCrits       bool   `json:"dreadmistCrits"`
}

type kfcDruidSelfEffects struct {
	policy            *KFCDruidSelfEffectsPolicy
	hasAny            bool
	viper             *core.Spell
	viperICD          core.Cooldown
	vitality          *core.ResourceMetrics
	started           bool
	periodicScheduled bool
}

func (policy KFCDruidSelfEffectsPolicy) Validate() error {
	if policy.Schema != "kfc-druid-self-effects-policy.v1" || policy.ID == "" || len(policy.ID) > 100 ||
		(policy.ViperThresholdTiming != "after-hit" && policy.ViperThresholdTiming != "before-hit") || (policy.VitalityTickMs != 2000 && policy.VitalityTickMs != 5000) {
		return fmt.Errorf("invalid Druid self-effects policy")
	}
	return nil
}

func (resto *RestorationDruid) ConfigureKFCDruidSelfEffects(policy KFCDruidSelfEffectsPolicy) error {
	if err := policy.Validate(); err != nil {
		return err
	}
	if resto.selfEffects == nil || resto.selfEffects.policy != nil || resto.selfEffects.started || resto.selfEffects.periodicScheduled || resto.GCD.ReadyAt() > 0 || resto.Hardcast.Expires > 0 {
		return fmt.Errorf("self-effects research requires a fresh Druid")
	}
	for _, spell := range resto.Spellbook {
		for _, metrics := range spell.SpellMetrics {
			if metrics.Casts > 0 || metrics.Ticks > 0 || metrics.CritTicks > 0 {
				return fmt.Errorf("self-effects research cannot change after a cast")
			}
		}
	}
	resto.selfEffects.policy = &policy
	return nil
}

func (resto *RestorationDruid) kfcResolvedSelfEffectsPolicy() KFCDruidSelfEffectsPolicy {
	if resto.selfEffects.policy != nil {
		return *resto.selfEffects.policy
	}
	return KFCDruidSelfEffectsPolicy{Schema: "kfc-druid-self-effects-policy.v1", ID: "self-effects-reference", ViperThresholdTiming: "after-hit", VitalityTickMs: 2000}
}

func (resto *RestorationDruid) kfcSelfEffectsAlive() bool {
	return resto.IsEnabled() && resto.HasHealthBar() && resto.CurrentHealth() > 0
}

func (resto *RestorationDruid) registerKFCSelfEffects() {
	state := &kfcDruidSelfEffects{}
	resto.selfEffects = state
	counts := map[int32]int{}
	for _, item := range resto.Equipment {
		counts[item.SetID]++
	}
	if counts[183] >= 5 {
		state.hasAny = true
		heal := resto.Character.RegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: 450583}, SpellSchool: core.SpellSchoolHoly, DefenseType: core.DefenseTypeMagic, ProcMask: core.ProcMaskSpellHealing,
			Flags: core.SpellFlagHelpful | core.SpellFlagPassiveSpell | core.SpellFlagNoOnCastComplete, DamageMultiplier: 1, ThreatMultiplier: 1})
		core.MakePermanent(resto.RegisterAura(core.Aura{Label: "Druid Dreadmist Dark Reward", ActionID: core.ActionID{SpellID: 450585}, OnCastComplete: func(_ *core.Aura, sim *core.Simulation, spell *core.Spell) {
			if !resto.kfcSelfEffectsAlive() || !spell.ProcMask.Matches(core.ProcMaskSpellDamage|core.ProcMaskSpellHealing) || spell.Flags.Matches(core.SpellFlagPassiveSpell|core.SpellFlagNoOnCastComplete) || !sim.Proc(.05, "Druid Dreadmist Dark Reward") {
				return
			}
			outcome := heal.OutcomeHealing
			state.started = true
			if resto.kfcResolvedSelfEffectsPolicy().DreadmistCrits {
				outcome = heal.OutcomeHealingCrit
			}
			heal.CalcAndDealHealing(sim, &resto.Unit, sim.Roll(270, 330), outcome)
		}}))
	}
	if counts[162] >= 4 {
		state.hasAny = true
		state.viperICD = core.Cooldown{Timer: resto.NewTimer(), Duration: 5 * time.Minute}
		mana := resto.NewManaMetrics(core.ActionID{SpellID: 1291797})
		state.viper = resto.Character.RegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: 1291797}, SpellSchool: core.SpellSchoolPhysical, ProcMask: core.ProcMaskSpellHealing,
			Flags: core.SpellFlagHelpful | core.SpellFlagPassiveSpell | core.SpellFlagNoOnCastComplete, DamageMultiplier: 1, ThreatMultiplier: 1,
			Hot: core.DotConfig{Aura: core.Aura{Label: "Druid Viper Restoration"}, NumberOfTicks: 5, TickLength: time.Second,
				OnSnapshot: func(_ *core.Simulation, _ *core.Unit, dot *core.Dot, _ bool) {
					dot.SnapshotBaseDamage = 20
					dot.SnapshotAttackerMultiplier = dot.Spell.CasterHealingMultiplier()
				},
				OnTick: func(sim *core.Simulation, target *core.Unit, dot *core.Dot) {
					if !resto.kfcSelfEffectsAlive() {
						dot.Deactivate(sim)
						return
					}
					dot.CalcAndDealPeriodicSnapshotHealing(sim, target, func(_ *core.Simulation, result *core.SpellResult, _ *core.AttackTable) {
						result.Outcome = core.OutcomeHit
						dot.Spell.SpellMetrics[target.UnitIndex].Ticks++
					})
					resto.AddMana(sim, 20, mana)
				},
			}})
	}
	if counts[184] >= 6 {
		state.hasAny = true
		state.vitality = resto.NewHealthMetrics(core.ActionID{SpellID: 21347})
		core.MakePermanent(resto.RegisterAura(core.Aura{Label: "Druid Shadowcraft Vitality", ActionID: core.ActionID{SpellID: 21347}, OnReset: func(_ *core.Aura, sim *core.Simulation) {
			state.periodicScheduled = true
			period := time.Duration(resto.kfcResolvedSelfEffectsPolicy().VitalityTickMs) * time.Millisecond
			core.StartPeriodicAction(sim, core.PeriodicActionOptions{Period: period, OnAction: func(sim *core.Simulation) {
				if sim.CurrentTime >= 0 && resto.kfcSelfEffectsAlive() {
					state.started = true
					resto.GainHealth(sim, 15*period.Seconds()/5, state.vitality)
				}
			}})
		}}))
	}
}

// The workload receiver calls this after exactly one health deduction, avoiding aura-order dependence.
func (resto *RestorationDruid) kfcSelfEffectsAfterDamage(sim *core.Simulation, before float64, result *core.SpellResult) {
	state := resto.selfEffects
	if state == nil || state.viper == nil || !resto.kfcSelfEffectsAlive() || result.Damage <= 0 || !result.Landed() || !state.viperICD.IsReady(sim) {
		return
	}
	health := resto.CurrentHealth()
	if resto.kfcResolvedSelfEffectsPolicy().ViperThresholdTiming == "before-hit" {
		health = before
	}
	if health/resto.MaxHealth() <= .25 {
		state.started = true
		state.viperICD.Use(sim)
		state.viper.Hot(&resto.Unit).Apply(sim)
	}
}

func (resto *RestorationDruid) kfcSelfRegenerationForIteration() float64 {
	if resto.selfEffects == nil || resto.selfEffects.vitality == nil {
		return 0
	}
	return resto.selfEffects.vitality.ActualGainForCurrentIteration()
}
