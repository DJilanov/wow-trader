package holy

import (
	"fmt"
	"math"
	"time"

	"github.com/wowsims/classic/sim/core"
)

// KFC_PALADIN_SELF_SET_VALUES

type KFCPaladinSelfSetPolicy struct {
	ThresholdTiming    *string  `json:"thresholdTiming,omitempty"`
	RegenerationTickMs *int64   `json:"regenerationTickMs,omitempty"`
	SelfDamageTriggers *bool    `json:"selfDamageTriggers,omitempty"`
	DevoutProcChance   *float64 `json:"devoutProcChance,omitempty"`
}

type kfcPaladinSelfSets struct {
	counts                        map[int32]int
	viper, scarlet, devout        *core.Spell
	viperCD, scarletCD, devoutCD  core.Cooldown
	vitality                      *core.ResourceMetrics
	blessed                       map[int32]*core.ResourceMetrics
	timing                        string
	tickMs                        int64
	selfDamage                    bool
	devoutChance                  float64
	echo                          *KFCPaladinSelfSetPolicy
	pending                       *core.PendingAction
	initialized, configured, used bool
}

func (healer *HolyPaladin) kfcSelfSetsAlive() bool {
	return healer.IsEnabled() && healer.HasHealthBar() && healer.CurrentHealth() > 0
}

func (healer *HolyPaladin) registerKFCPaladinSelfSets() {
	state := &kfcPaladinSelfSets{counts: map[int32]int{}, timing: "after-hit", tickMs: 2000, selfDamage: true, devoutChance: .02}
	healer.selfSets = state
	for _, item := range healer.Equipment {
		state.counts[item.SetID]++
	}
	for _, row := range kfcPaladinSelfSetThresholds {
		if state.counts[row.setID] >= row.pieces && !core.HasForeverEquipmentSetDefinition(row.setID) {
			panic("Paladin self sets require isolated current definitions")
		}
	}
	if state.counts[162] >= 4 {
		state.viperCD = core.Cooldown{Timer: healer.NewTimer(), Duration: time.Duration(kfcPaladinViperCooldownMs) * time.Millisecond}
		mana := healer.NewManaMetrics(core.ActionID{SpellID: 1291797})
		state.viper = healer.Character.RegisterSpell(core.SpellConfig{
			ActionID: core.ActionID{SpellID: 1291797}, SpellSchool: core.SpellSchoolPhysical,
			ProcMask: core.ProcMaskSpellHealing, Flags: core.SpellFlagHelpful | core.SpellFlagPassiveSpell | core.SpellFlagNoOnCastComplete,
			DamageMultiplier: 1, ThreatMultiplier: 1,
			Hot: core.DotConfig{
				Aura: core.Aura{Label: "Paladin Viper restoration"}, NumberOfTicks: 5, TickLength: time.Second,
				OnSnapshot: func(_ *core.Simulation, _ *core.Unit, dot *core.Dot, _ bool) {
					dot.SnapshotBaseDamage = kfcPaladinViperTick
					dot.SnapshotAttackerMultiplier = dot.Spell.CasterHealingMultiplier()
				},
				OnTick: func(sim *core.Simulation, target *core.Unit, dot *core.Dot) {
					if !healer.kfcSelfSetsAlive() {
						dot.Deactivate(sim)
						return
					}
					dot.CalcAndDealPeriodicSnapshotHealing(sim, target, func(_ *core.Simulation, result *core.SpellResult, _ *core.AttackTable) {
						result.Outcome = core.OutcomeHit
						dot.Spell.SpellMetrics[target.UnitIndex].Ticks++
					})
					healer.AddMana(sim, kfcPaladinViperTick, mana)
				},
			},
		})
	}
	shield := func(id int32, label string, durationMs int64) *core.Spell {
		return healer.Character.RegisterSpell(core.SpellConfig{
			ActionID: core.ActionID{SpellID: id}, SpellSchool: core.SpellSchoolHoly,
			ProcMask: core.ProcMaskEmpty, Flags: core.SpellFlagHelpful | core.SpellFlagPassiveSpell | core.SpellFlagNoOnCastComplete,
			DamageMultiplier: 1, ThreatMultiplier: 1,
			Shield: core.ShieldConfig{SelfOnly: true, Aura: core.Aura{Label: label, Duration: time.Duration(durationMs) * time.Millisecond}},
		})
	}
	if state.counts[163] >= 6 {
		state.scarlet = shield(1293733, "Paladin Scarlet Guardian", kfcPaladinScarletDurationMs)
		state.scarletCD = core.Cooldown{Timer: healer.NewTimer(), Duration: time.Duration(kfcPaladinScarletCooldownMs) * time.Millisecond}
	}
	if state.counts[182] >= 4 {
		state.devout = shield(27779, "Paladin Devout protection", kfcPaladinDevoutDurationMs)
		state.devoutCD = core.Cooldown{Timer: healer.NewTimer(), Duration: time.Duration(kfcPaladinDevoutCooldownMs) * time.Millisecond}
	}
	if state.counts[184] >= 6 || state.counts[189] >= 6 {
		state.vitality = healer.NewHealthMetrics(core.ActionID{SpellID: 21347})
	}
	if state.counts[1968] >= 4 {
		state.blessed = map[int32]*core.ResourceMetrics{}
		for _, agent := range healer.Party.PlayersAndPets {
			unit := &agent.GetCharacter().Unit
			state.blessed[unit.UnitIndex] = unit.NewHealthMetrics(core.ActionID{SpellID: 1302375})
		}
	}
	core.MakePermanent(healer.RegisterAura(core.Aura{
		Label: "Paladin self-set lifecycle",
		OnReset: func(_ *core.Aura, sim *core.Simulation) {
			state.initialized, state.used, state.pending = true, false, nil
			if state.vitality != nil || state.blessed != nil {
				healer.scheduleKFCPaladinSelfSetRegeneration(sim)
			}
		},
	}))
}

func (healer *HolyPaladin) scheduleKFCPaladinSelfSetRegeneration(sim *core.Simulation) {
	state := healer.selfSets
	state.pending = &core.PendingAction{
		NextActionAt: sim.CurrentTime + time.Duration(state.tickMs)*time.Millisecond,
		Priority:     core.ActionPriorityAuto,
		OnAction: func(sim *core.Simulation) {
			state.pending = nil
			if !healer.kfcSelfSetsAlive() {
				return
			}
			if sim.CurrentTime >= 0 {
				state.used = true
				fraction := float64(state.tickMs) / 5000
				if state.vitality != nil {
					healer.GainHealth(sim, kfcPaladinVitalityRate*fraction, state.vitality)
				}
				for _, agent := range healer.Party.PlayersAndPets {
					unit := &agent.GetCharacter().Unit
					if metrics := state.blessed[unit.UnitIndex]; metrics != nil && unit.IsEnabled() && healer.kfcValidHealingTarget(unit, kfcPaladinBlessedRadius) {
						unit.GainHealth(sim, kfcPaladinBlessedRate*fraction, metrics)
					}
				}
			}
			healer.scheduleKFCPaladinSelfSetRegeneration(sim)
		},
	}
	sim.AddPendingAction(state.pending)
}

// The shared receiver calls this after its one health deduction, including fully absorbed hits.
func (healer *HolyPaladin) kfcSelfSetsAfterDamage(sim *core.Simulation, before float64, incoming *core.Spell, result *core.SpellResult, periodic bool) {
	state := healer.selfSets
	if state == nil || incoming == nil || !healer.kfcSelfSetsAlive() || !result.Landed() || result.Damage+result.AbsorbedDamage <= 0 || (!state.selfDamage && incoming.Unit == &healer.Unit) {
		return
	}
	if state.viper != nil || state.scarlet != nil || state.devout != nil {
		state.used = true
	}
	if state.devout != nil && !periodic && state.devoutCD.IsReady(sim) && sim.Proc(state.devoutChance, "Paladin Devout protection") {
		state.used = true
		state.devoutCD.Use(sim)
		state.devout.SelfShield().Apply(sim, kfcPaladinDevoutShield)
	}
	if result.Damage <= 0 {
		return
	}
	health := healer.CurrentHealth()
	if state.timing == "before-hit" {
		health = before
	}
	if state.viper != nil && state.viperCD.IsReady(sim) && health/healer.MaxHealth() <= kfcPaladinViperThreshold {
		state.used = true
		state.viperCD.Use(sim)
		state.viper.Hot(&healer.Unit).Apply(sim)
	}
	if state.scarlet != nil && state.scarletCD.IsReady(sim) && health/healer.MaxHealth() <= kfcPaladinScarletThreshold {
		state.used = true
		state.scarletCD.Use(sim)
		state.scarlet.SelfShield().Apply(sim, kfcPaladinScarletShield)
	}
}

func (healer *HolyPaladin) ConfigureKFCPaladinSelfSets(sim *core.Simulation, policy *KFCPaladinSelfSetPolicy) error {
	if policy == nil {
		return nil
	}
	state := healer.selfSets
	if sim == nil || sim.CurrentTime != 0 || state == nil || state.configured || state.used || healer.GCD.ReadyAt() > 0 || healer.IsCasting(sim) || healer.IsChanneling(sim) || (state.initialized && !healer.kfcSelfSetsAlive()) {
		return fmt.Errorf("self-set references require a fresh equipped Paladin")
	}
	if policy.ThresholdTiming == nil && policy.RegenerationTickMs == nil && policy.SelfDamageTriggers == nil && policy.DevoutProcChance == nil {
		return fmt.Errorf("self-set policy has no explicit references")
	}
	for _, spell := range healer.Spellbook {
		for _, metrics := range spell.SpellMetrics {
			if metrics.Casts > 0 || metrics.Hits > 0 || metrics.Crits > 0 || metrics.Ticks > 0 || metrics.CritTicks > 0 {
				return fmt.Errorf("self-set references cannot change after casting")
			}
		}
	}
	if policy.ThresholdTiming != nil && ((state.viper == nil && state.scarlet == nil) || (*policy.ThresholdTiming != "after-hit" && *policy.ThresholdTiming != "before-hit")) {
		return fmt.Errorf("invalid or unowned low-health timing reference")
	}
	if policy.RegenerationTickMs != nil && ((state.vitality == nil && state.blessed == nil) || (*policy.RegenerationTickMs != 2000 && *policy.RegenerationTickMs != 5000)) {
		return fmt.Errorf("invalid or unowned set regeneration timing")
	}
	if policy.SelfDamageTriggers != nil && state.viper == nil && state.scarlet == nil && state.devout == nil {
		return fmt.Errorf("self-damage reference requires an owned reactive set")
	}
	if value := policy.DevoutProcChance; value != nil && (state.devout == nil || math.IsNaN(*value) || math.IsInf(*value, 0) || *value < 0 || *value > 1) {
		return fmt.Errorf("invalid or unowned Devout chance reference")
	}
	echo := &KFCPaladinSelfSetPolicy{}
	if policy.ThresholdTiming != nil {
		value := *policy.ThresholdTiming
		state.timing, echo.ThresholdTiming = value, &value
	}
	if policy.RegenerationTickMs != nil {
		value := *policy.RegenerationTickMs
		state.tickMs, echo.RegenerationTickMs = value, &value
	}
	if policy.SelfDamageTriggers != nil {
		value := *policy.SelfDamageTriggers
		state.selfDamage, echo.SelfDamageTriggers = value, &value
	}
	if policy.DevoutProcChance != nil {
		value := *policy.DevoutProcChance
		state.devoutChance, echo.DevoutProcChance = value, &value
	}
	state.echo, state.configured = echo, true
	if state.initialized && policy.RegenerationTickMs != nil {
		if state.pending != nil {
			state.pending.Cancel(sim)
		}
		healer.scheduleKFCPaladinSelfSetRegeneration(sim)
	}
	return nil
}
