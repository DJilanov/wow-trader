package restoration

import (
	"fmt"
	"math"
	"time"

	"github.com/wowsims/classic/sim/core"
)

// KFC_SHAMAN_REACTIVE_SET_VALUES

type KFCShamanReactiveSetPolicy struct {
	Schema             string  `json:"schema"`
	ID                 string  `json:"id"`
	ThresholdTiming    string  `json:"thresholdTiming"`
	SelfDamageTriggers bool    `json:"selfDamageTriggers"`
	DevoutChance       float64 `json:"devoutChance"`
}

type kfcShamanReactiveSets struct {
	policy                       *KFCShamanReactiveSetPolicy
	counts                       map[int32]int
	viper, scarlet, devout       *core.Spell
	viperCD, scarletCD, devoutCD core.Cooldown
	viperMana                    *core.ResourceMetrics
	started                      bool
}

func (resto *RestorationShaman) registerKFCShamanReactiveSets() {
	if resto.kfcReactiveSets != nil || !resto.Env.IsForever() {
		panic("Invalid Shaman reactive-set registration")
	}
	state := &kfcShamanReactiveSets{counts: map[int32]int{}}
	resto.kfcReactiveSets = state
	for _, item := range resto.Equipment {
		state.counts[item.SetID]++
	}
	if state.counts[162] < 4 && state.counts[163] < 6 && state.counts[182] < 4 {
		return
	}
	if state.counts[162] >= 4 {
		state.viperCD = core.Cooldown{Timer: resto.NewTimer(), Duration: kfcShamanReactiveViperCooldownMs * time.Millisecond}
		mana := resto.NewManaMetrics(core.ActionID{SpellID: 1291797})
		state.viperMana = mana
		state.viper = resto.Character.RegisterSpell(core.SpellConfig{
			ActionID: core.ActionID{SpellID: 1291797}, SpellSchool: core.SpellSchoolPhysical,
			ProcMask: core.ProcMaskSpellHealing, Flags: core.SpellFlagHelpful | core.SpellFlagPassiveSpell | core.SpellFlagNoOnCastComplete,
			DamageMultiplier: 1, ThreatMultiplier: 1,
			Hot: core.DotConfig{
				Aura: core.Aura{Label: "KFC Shaman Viper restoration"}, NumberOfTicks: kfcShamanReactiveViperTicks, TickLength: kfcShamanReactiveViperTickMs * time.Millisecond,
				OnSnapshot: func(_ *core.Simulation, _ *core.Unit, dot *core.Dot, _ bool) {
					dot.SnapshotBaseDamage = kfcShamanReactiveViperAmount
					dot.SnapshotAttackerMultiplier = dot.Spell.CasterHealingMultiplier()
				},
				OnTick: func(sim *core.Simulation, target *core.Unit, dot *core.Dot) {
					if !resto.kfcShamanItemsAlive() {
						dot.Deactivate(sim)
						return
					}
					dot.CalcAndDealPeriodicSnapshotHealing(sim, target, func(_ *core.Simulation, result *core.SpellResult, _ *core.AttackTable) {
						result.Outcome = core.OutcomeHit
						dot.Spell.SpellMetrics[target.UnitIndex].Ticks++
					})
					resto.AddMana(sim, kfcShamanReactiveViperAmount, mana)
				},
			},
		})
	}
	shield := func(id int32, label string, durationMs int64) *core.Spell {
		return resto.Character.RegisterSpell(core.SpellConfig{
			ActionID: core.ActionID{SpellID: id}, SpellSchool: core.SpellSchoolHoly,
			ProcMask: core.ProcMaskEmpty, Flags: core.SpellFlagHelpful | core.SpellFlagPassiveSpell | core.SpellFlagNoOnCastComplete,
			DamageMultiplier: 1, ThreatMultiplier: 1,
			Shield: core.ShieldConfig{SelfOnly: true, Aura: core.Aura{Label: label, Duration: time.Duration(durationMs) * time.Millisecond}},
		})
	}
	if state.counts[163] >= 6 {
		state.scarlet = shield(1293733, "KFC Shaman Scarlet Guardian", kfcShamanReactiveScarletDurationMs)
		state.scarletCD = core.Cooldown{Timer: resto.NewTimer(), Duration: kfcShamanReactiveScarletCooldownMs * time.Millisecond}
	}
	if state.counts[182] >= 4 {
		state.devout = shield(27779, "KFC Shaman Devout protection", kfcShamanReactiveDevoutDurationMs)
		state.devoutCD = core.Cooldown{Timer: resto.NewTimer(), Duration: kfcShamanReactiveDevoutCooldownMs * time.Millisecond}
	}
	core.MakePermanent(resto.RegisterAura(core.Aura{Label: "KFC Shaman reactive-set lifecycle", OnReset: func(_ *core.Aura, _ *core.Simulation) { state.started = false }}))
}

func (resto *RestorationShaman) ConfigureKFCShamanReactiveSets(sim *core.Simulation, policy KFCShamanReactiveSetPolicy) error {
	state := resto.kfcReactiveSets
	if policy.Schema != "kfc-shaman-reactive-set-policy.v1" || policy.ID == "" || len(policy.ID) > 100 ||
		(policy.ThresholdTiming != "after-hit" && policy.ThresholdTiming != "before-hit") ||
		math.IsNaN(policy.DevoutChance) || math.IsInf(policy.DevoutChance, 0) || policy.DevoutChance < 0 || policy.DevoutChance > 1 {
		return fmt.Errorf("invalid Shaman reactive-set policy")
	}
	if sim == nil || sim.CurrentTime != 0 || resto.positions == nil || state == nil || state.policy != nil || state.started ||
		resto.GCD.ReadyAt() > 0 || resto.Hardcast.Expires > 0 || (state.viper == nil && state.scarlet == nil && state.devout == nil) || !resto.kfcShamanItemsAlive() {
		return fmt.Errorf("reactive-set policy requires a fresh positioned equipped Shaman")
	}
	for _, spell := range resto.Spellbook {
		for _, metric := range spell.SpellMetrics {
			if metric.Casts > 0 || metric.Hits > 0 || metric.Crits > 0 || metric.Ticks > 0 || metric.CritTicks > 0 {
				return fmt.Errorf("reactive-set policy cannot change after events")
			}
		}
	}
	state.policy = &policy
	return nil
}

func (resto *RestorationShaman) KFCShamanReactiveSetPolicyEcho() *KFCShamanReactiveSetPolicy {
	if state := resto.kfcReactiveSets; state != nil && state.policy != nil {
		policy := *state.policy
		return &policy
	}
	return nil
}

func (resto *RestorationShaman) kfcShamanReactiveAfterDamage(sim *core.Simulation, before float64, incoming *core.Spell, result *core.SpellResult, periodic bool) {
	state := resto.kfcReactiveSets
	if state == nil || state.viper == nil && state.scarlet == nil && state.devout == nil || sim.CurrentTime < 0 ||
		incoming == nil || result == nil || result.Target != &resto.Unit || !resto.kfcShamanItemsAlive() || !result.Landed() || result.Damage+result.AbsorbedDamage <= 0 {
		return
	}
	state.started = true
	if state.policy == nil {
		panic("Owned Shaman reactive sets require an explicit policy before incoming damage")
	}
	if !state.policy.SelfDamageTriggers && incoming.Unit == &resto.Unit {
		return
	}
	if state.devout != nil && !periodic && state.devoutCD.IsReady(sim) && sim.Proc(state.policy.DevoutChance, "KFC Shaman Devout protection") {
		state.devoutCD.Use(sim)
		state.devout.SelfShield().Apply(sim, kfcShamanReactiveDevoutAmount)
	}
	if result.Damage <= 0 {
		return
	}
	health := resto.CurrentHealth()
	if state.policy.ThresholdTiming == "before-hit" {
		health = before
	}
	if state.viper != nil && state.viperCD.IsReady(sim) && health/resto.MaxHealth() <= kfcShamanReactiveViperThreshold {
		state.viperCD.Use(sim)
		state.viper.Hot(&resto.Unit).Apply(sim)
	}
	if state.scarlet != nil && state.scarletCD.IsReady(sim) && health/resto.MaxHealth() <= kfcShamanReactiveScarletThreshold {
		state.scarletCD.Use(sim)
		state.scarlet.SelfShield().Apply(sim, kfcShamanReactiveScarletAmount)
	}
}
