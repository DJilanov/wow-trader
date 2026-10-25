package holy

import (
	"fmt"
	"time"

	"github.com/wowsims/classic/sim/core"
)

type kfcPaladinHealingUtilities struct {
	owned                         map[int32]bool
	heals                         map[int32]*core.Spell
	grace, circle                 *core.Spell
	canCrit                       bool
	configured, initialized, used bool
	criticalEcho, channelEcho     *bool
}

func (healer *HolyPaladin) registerKFCPaladinHealingUtilities() {
	state := &kfcPaladinHealingUtilities{owned: map[int32]bool{}, heals: map[int32]*core.Spell{}}
	healer.healingUtilities = state
	for _, item := range healer.Equipment {
		state.owned[item.ID] = true
	}
	for _, id := range []int32{4262, 7939, 8346, 11808, 11923} {
		if state.owned[id] && core.HasItemEffect(id) {
			panic("Healing utility gained a global handler; re-admit class behavior")
		}
	}
	core.MakePermanent(healer.RegisterAura(core.Aura{Label: "Paladin healing utility lifecycle", OnReset: func(_ *core.Aura, _ *core.Simulation) { state.initialized = true }}))
	for _, row := range []struct {
		id        int32
		low, high float64
		cooldown  time.Duration
	}{
		{4262, 225, 375, 5 * time.Minute},
		{8346, 300, 500, 30 * time.Minute},
	} {
		if !state.owned[row.id] {
			continue
		}
		id := row.id
		spell := healer.RegisterSpell(core.SpellConfig{
			ActionID: core.ActionID{ItemID: id}, SpellSchool: core.SpellSchoolHoly, DefenseType: core.DefenseTypeMagic,
			ProcMask: core.ProcMaskSpellHealing, Flags: core.SpellFlagHelpful | core.SpellFlagPassiveSpell | core.SpellFlagNoOnCastComplete,
			DamageMultiplier: 1, ThreatMultiplier: 1,
			Cast: core.CastConfig{DefaultCast: core.Cast{GCD: 1500 * time.Millisecond}, CD: core.Cooldown{Timer: healer.NewTimer(), Duration: row.cooldown}},
			ExtraCastCondition: func(sim *core.Simulation, target *core.Unit) bool {
				return healer.CurrentHealth() > 0 && !healer.IsCasting(sim) && !healer.IsChanneling(sim) &&
					healer.kfcValidHealingTarget(target, 40) && (id != 4262 || target == &healer.Unit)
			},
			ApplyEffects: func(sim *core.Simulation, target *core.Unit, spell *core.Spell) {
				state.used = true
				outcome := spell.OutcomeHealing
				if state.canCrit {
					outcome = spell.OutcomeHealingCrit
				}
				spell.CalcAndDealHealing(sim, target, sim.RollWithLabel(row.low, row.high, "Paladin item direct heal"), outcome)
			},
		})
		state.heals[id] = spell
		healer.AddMajorCooldown(core.MajorCooldown{Type: core.CooldownTypeSurvival, Spell: spell, ShouldActivate: func(_ *core.Simulation, _ *core.Character) bool { return false }})
	}
	if state.owned[7939] {
		spell := healer.RegisterSpell(core.SpellConfig{
			ActionID: core.ActionID{SpellID: 9777}, SpellSchool: core.SpellSchoolHoly, DefenseType: core.DefenseTypeMagic,
			ProcMask: core.ProcMaskSpellHealing, Flags: core.SpellFlagHelpful | core.SpellFlagPassiveSpell | core.SpellFlagNoOnCastComplete,
			DamageMultiplier: 1, ThreatMultiplier: 1,
		})
		core.MakePermanent(healer.RegisterAura(core.Aura{Label: "Paladin Truesilver melee receiver", OnSpellHitTaken: func(_ *core.Aura, sim *core.Simulation, attack *core.Spell, result *core.SpellResult) {
			if healer.CurrentHealth() <= 0 || !result.Landed() || !attack.ProcMask.Matches(core.ProcMaskMelee) || !sim.Proc(0.03, "Paladin Truesilver Breastplate") {
				return
			}
			state.used = true
			outcome := spell.OutcomeHealing
			if state.canCrit {
				outcome = spell.OutcomeHealingCrit
			}
			spell.CalcAndDealHealing(sim, &healer.Unit, sim.RollWithLabel(60, 100, "Paladin Truesilver heal"), outcome)
		}}))
	}
	if state.owned[11923] {
		state.grace = healer.RegisterSpell(core.SpellConfig{
			ActionID: core.ActionID{SpellID: 1300891}, SpellSchool: core.SpellSchoolHoly, DefenseType: core.DefenseTypeMagic,
			ProcMask: core.ProcMaskSpellHealing, Flags: core.SpellFlagHelpful | core.SpellFlagPassiveSpell | core.SpellFlagNoOnCastComplete,
			DamageMultiplier: 1, ThreatMultiplier: 1,
		})
	}
	if state.owned[11808] {
		healer.registerKFCPaladinCircleChannel()
	}
}

func (healer *HolyPaladin) ConfigureKFCPaladinHealingUtilities(sim *core.Simulation, canCrit, channelScales *bool) error {
	if canCrit == nil && channelScales == nil {
		return nil
	}
	state := healer.healingUtilities
	if sim == nil || sim.CurrentTime != 0 || state == nil || state.configured || state.used || healer.GCD.ReadyAt() > 0 || healer.IsCasting(sim) || healer.IsChanneling(sim) || (state.initialized && healer.CurrentHealth() <= 0) {
		return fmt.Errorf("healing utility references require a fresh owner")
	}
	if canCrit != nil && !state.owned[4262] && !state.owned[7939] && !state.owned[8346] {
		return fmt.Errorf("utility critical reference requires an eligible equipped heal")
	}
	if channelScales != nil && !state.owned[11808] {
		return fmt.Errorf("channel haste reference requires Circle of Flame")
	}
	for _, spell := range healer.Spellbook {
		for _, metric := range spell.SpellMetrics {
			if metric.Casts > 0 || metric.Hits > 0 || metric.Crits > 0 || metric.Ticks > 0 || metric.CritTicks > 0 {
				return fmt.Errorf("healing utility references cannot change after casting")
			}
		}
	}
	if canCrit != nil {
		value := *canCrit
		state.canCrit, state.criticalEcho = value, &value
	}
	if channelScales != nil {
		value := *channelScales
		state.circle.SelfHot().AffectedByCastSpeed, state.channelEcho = value, &value
	}
	state.configured = true
	return nil
}

func (healer *HolyPaladin) triggerKFCGraceDeathHeal(sim *core.Simulation) {
	state := healer.healingUtilities
	if state == nil || state.grace == nil {
		return
	}
	state.used = true
	for _, agent := range healer.Party.PlayersAndPets {
		target := &agent.GetCharacter().Unit
		if healer.kfcLiveFriendly(target) && healer.kfcFriendlyInRange(&healer.Unit, target, 40) {
			state.grace.CalcAndDealHealing(sim, target, sim.RollWithLabel(1081.92, 1270.08, "Paladin Hammer of Grace"), state.grace.OutcomeHealing)
		}
	}
}

func (healer *HolyPaladin) registerKFCPaladinCircleChannel() {
	state := healer.healingUtilities
	mana := healer.NewManaMetrics(core.ActionID{ItemID: 11808})
	state.circle = healer.RegisterSpell(core.SpellConfig{
		ActionID: core.ActionID{ItemID: 11808}, SpellSchool: core.SpellSchoolFire,
		ProcMask: core.ProcMaskEmpty, Flags: core.SpellFlagHelpful | core.SpellFlagChanneled | core.SpellFlagNoOnCastComplete,
		DefenseType: core.DefenseTypeMagic, DamageMultiplier: 1, ThreatMultiplier: 1,
		Cast: core.CastConfig{CD: core.Cooldown{Timer: healer.NewTimer(), Duration: 5 * time.Minute}},
		ExtraCastCondition: func(sim *core.Simulation, _ *core.Unit) bool {
			return healer.CurrentHealth() > 0 && !healer.IsCasting(sim) && !healer.IsChanneling(sim)
		},
		Hot: core.DotConfig{SelfOnly: true, Aura: core.Aura{Label: "Paladin Circle of Flame channel"}, NumberOfTicks: 10, TickLength: time.Second, AffectedByCastSpeed: true,
			OnTick: func(sim *core.Simulation, _ *core.Unit, dot *core.Dot) {
				if healer.CurrentHealth() <= 0 {
					dot.Cancel(sim)
					return
				}
				// Effect index zero restores mana before the separate health-damage roll.
				healer.AddMana(sim, sim.RollWithLabel(59.25, 98.75, "Paladin Circle mana"), mana)
				dot.Spell.CalcAndDealPeriodicDamage(sim, &healer.Unit, sim.RollWithLabel(59.25, 98.75, "Paladin Circle health"), dot.Spell.OutcomeAlwaysHitNoHitCounter)
			},
		},
		ApplyEffects: func(sim *core.Simulation, _ *core.Unit, spell *core.Spell) {
			state.used = true
			spell.SelfHot().Apply(sim)
		},
	})
	healer.AddMajorCooldown(core.MajorCooldown{Type: core.CooldownTypeMana, Spell: state.circle})
}

func (healer *HolyPaladin) tryKFCPaladinUtilityHeal(sim *core.Simulation, frame KFCPaladinHealingWorkload, policy KFCPaladinHealingCooldown) {
	state := healer.healingUtilities
	if state == nil || state.heals[policy.ItemID] == nil || healer.MaxMana()-healer.CurrentMana() < policy.MinimumMissingMana || (policy.RequireHealingDemand && !healer.hasKFCPaladinHealingDemand(sim, frame)) {
		return
	}
	index := int32(-1)
	if policy.ItemID == 4262 {
		index = healer.Index
	}
	if policy.TargetRaidIndex != nil {
		index = *policy.TargetRaidIndex
	}
	minimum := 0.0
	if policy.MinimumMissingHealth != nil {
		minimum = *policy.MinimumMissingHealth
	}
	var selected *core.Unit
	for _, target := range healer.Env.Raid.AllUnits {
		if index >= 0 && target.Index != index || policy.ItemID == 4262 && target != &healer.Unit || !healer.kfcValidHealingTarget(target, 40) {
			continue
		}
		missing := target.MaxHealth() - target.CurrentHealth()
		if missing <= 0 || missing < minimum {
			continue
		}
		if selected == nil || target.CurrentHealthPercent() < selected.CurrentHealthPercent() || target.CurrentHealthPercent() == selected.CurrentHealthPercent() && target.UnitIndex < selected.UnitIndex {
			selected = target
		}
	}
	spell := state.heals[policy.ItemID]
	if selected != nil && spell.CanCast(sim, selected) && spell.Cast(sim, selected) {
		healer.UpdateMajorCooldowns()
	}
}
