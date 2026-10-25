package restoration

import (
	"fmt"
	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/stats"
	"time"
)

// This envelope deliberately removes use costs and chooses maximum critical rolls.
// It identifies contenders requiring a real-use model; it is not live item behavior.
type KFCDruidUtilityProbePolicy struct {
	Schema               string   `json:"schema"`
	ID                   string   `json:"id"`
	Mode                 string   `json:"mode"`
	HeadmasterIntellect  *float64 `json:"headmasterIntellect"`
	BaronRegeneration    bool     `json:"baronRegeneration"`
	Circle               bool     `json:"circle"`
	Gauntlets            bool     `json:"gauntlets"`
	Recombobulator       bool     `json:"recombobulator"`
	MinimumMissingHealth float64  `json:"minimumMissingHealth"`
	MinimumMissingMana   float64  `json:"minimumMissingMana"`
}

type kfcDruidUtilityProbes struct {
	policy                                                    *KFCDruidUtilityProbePolicy
	owned                                                     map[int32]bool
	initialized, started, headApplied                         bool
	circleUsed, gloveUsed, recombobHealUsed, recombobManaUsed bool
	circleMana, recombobMana                                  *core.ResourceMetrics
	gloves, recombob                                          *core.Spell
	regeneration                                              map[int32]*core.ResourceMetrics
}

func (p KFCDruidUtilityProbePolicy) Validate() error {
	if p.Schema != "kfc-druid-utility-probe.v1" || p.ID == "" || len(p.ID) > 100 ||
		(p.Mode != "disabled" && p.Mode != "optimistic-contender") || p.HeadmasterIntellect == nil ||
		(*p.HeadmasterIntellect != 0 && *p.HeadmasterIntellect != 20) ||
		!kfcFinite(p.MinimumMissingHealth) || p.MinimumMissingHealth < 0 || p.MinimumMissingHealth > 1000000 ||
		!kfcFinite(p.MinimumMissingMana) || p.MinimumMissingMana < 0 || p.MinimumMissingMana > 1000000 {
		return fmt.Errorf("invalid explicit Druid utility probe")
	}
	if p.Mode == "disabled" && (*p.HeadmasterIntellect != 0 || p.BaronRegeneration || p.Circle || p.Gauntlets || p.Recombobulator) {
		return fmt.Errorf("disabled utility probe cannot grant effects")
	}
	return nil
}

func (resto *RestorationDruid) kfcResolvedUtilityProbe() KFCDruidUtilityProbePolicy {
	if resto.utilityProbes.policy != nil {
		return *resto.utilityProbes.policy
	}
	zero := 0.0
	return KFCDruidUtilityProbePolicy{Schema: "kfc-druid-utility-probe.v1", ID: "disabled-reference", Mode: "disabled", HeadmasterIntellect: &zero}
}

func (resto *RestorationDruid) ConfigureKFCUtilityProbe(sim *core.Simulation, p KFCDruidUtilityProbePolicy) error {
	if err := p.Validate(); err != nil {
		return err
	}
	state := resto.utilityProbes
	if sim == nil || sim.CurrentTime != 0 || state == nil || state.policy != nil || state.started || resto.GCD.ReadyAt() > 0 || resto.Hardcast.Expires > 0 {
		return fmt.Errorf("utility probe requires a fresh Druid")
	}
	for _, spell := range resto.Spellbook {
		for _, metric := range spell.SpellMetrics {
			if metric.Casts > 0 || metric.Ticks > 0 || metric.CritTicks > 0 {
				return fmt.Errorf("utility probe cannot change after casting")
			}
		}
	}
	for id, enabled := range map[int32]bool{13937: *p.HeadmasterIntellect > 0, 6323: p.BaronRegeneration, 11808: p.Circle, 8346: p.Gauntlets, 18637: p.Recombobulator} {
		if enabled && !state.owned[id] {
			return fmt.Errorf("utility probe item %d is not equipped", id)
		}
	}
	intellect := *p.HeadmasterIntellect
	p.HeadmasterIntellect = &intellect
	state.policy = &p
	if state.initialized {
		resto.kfcApplyHeadmasterProbe(sim)
	}
	return nil
}

func (resto *RestorationDruid) kfcApplyHeadmasterProbe(sim *core.Simulation) {
	state := resto.utilityProbes
	p := resto.kfcResolvedUtilityProbe()
	if state.headApplied || !state.owned[13937] || *p.HeadmasterIntellect == 0 {
		return
	}
	before := resto.MaxMana()
	resto.AddStatDynamic(sim, stats.Intellect, *p.HeadmasterIntellect)
	resto.AddMana(sim, resto.MaxMana()-before, resto.NewManaMetrics(core.ActionID{SpellID: 18264}))
	state.headApplied = true
	state.started = true
}

func (resto *RestorationDruid) registerKFCUtilityProbes() {
	state := &kfcDruidUtilityProbes{owned: map[int32]bool{}, regeneration: map[int32]*core.ResourceMetrics{}}
	resto.utilityProbes = state
	for _, item := range resto.Equipment {
		for _, id := range []int32{11808, 8346, 18637, 6323, 13937} {
			if item.ID == id {
				state.owned[id] = true
				if core.HasItemEffect(id) {
					panic("Utility item acquired a global handler; re-admit the isolated envelope")
				}
			}
		}
	}
	registerHeal := func(id int32) *core.Spell {
		return resto.Character.RegisterSpell(core.SpellConfig{
			ActionID: core.ActionID{SpellID: id}, SpellSchool: core.SpellSchoolHoly, DefenseType: core.DefenseTypeMagic, ProcMask: core.ProcMaskSpellHealing,
			Flags: core.SpellFlagHelpful | core.SpellFlagPassiveSpell | core.SpellFlagNoOnCastComplete, DamageMultiplier: 1, ThreatMultiplier: 1,
		})
	}
	if state.owned[11808] {
		state.circleMana = resto.NewManaMetrics(core.ActionID{SpellID: 17447})
	}
	if state.owned[8346] {
		state.gloves = registerHeal(10577)
	}
	if state.owned[18637] {
		state.recombob = registerHeal(23064)
		state.recombobMana = resto.NewManaMetrics(core.ActionID{SpellID: 23064, Tag: 1})
	}
	if state.owned[6323] {
		for _, agent := range resto.Party.PlayersAndPets {
			unit := &agent.GetCharacter().Unit
			state.regeneration[unit.UnitIndex] = unit.NewHealthMetrics(core.ActionID{SpellID: 1292142})
		}
	}
	resto.RegisterAura(core.Aura{Label: "Druid explicit utility envelope", Duration: core.NeverExpires, OnReset: func(_ *core.Aura, sim *core.Simulation) {
		state.initialized = true
		state.started = false
		state.headApplied = false
		state.circleUsed = false
		state.gloveUsed = false
		state.recombobHealUsed = false
		state.recombobManaUsed = false
		resto.kfcApplyHeadmasterProbe(sim)
		if state.owned[6323] {
			core.StartPeriodicAction(sim, core.PeriodicActionOptions{Period: 5 * time.Second, OnAction: func(sim *core.Simulation) {
				if sim.CurrentTime < 0 || !resto.kfcSelfEffectsAlive() || !resto.kfcResolvedUtilityProbe().BaronRegeneration {
					return
				}
				for _, agent := range resto.Party.PlayersAndPets {
					unit := &agent.GetCharacter().Unit
					if resto.kfcLiveFriendly(unit) && resto.kfcInRange(&resto.Unit, unit, 30) {
						state.started = true
						unit.GainHealth(sim, 4, state.regeneration[unit.UnitIndex])
					}
				}
			}})
		}
	}})
}

func (resto *RestorationDruid) kfcUtilityProbeTarget(threshold float64) *core.Unit {
	var target *core.Unit
	for _, agent := range resto.Party.PlayersAndPets {
		unit := &agent.GetCharacter().Unit
		missing := unit.MaxHealth() - unit.CurrentHealth()
		if !resto.kfcLiveFriendly(unit) || missing <= 0 || missing < threshold {
			continue
		}
		if target == nil || unit.CurrentHealthPercent() < target.CurrentHealthPercent() || unit.CurrentHealthPercent() == target.CurrentHealthPercent() && unit.UnitIndex < target.UnitIndex {
			target = unit
		}
	}
	return target
}

func (resto *RestorationDruid) useKFCUtilityProbes(sim *core.Simulation) {
	state := resto.utilityProbes
	if state == nil || !resto.kfcSelfEffectsAlive() {
		return
	}
	p := resto.kfcResolvedUtilityProbe()
	if p.Mode != "optimistic-contender" {
		return
	}
	missing := resto.MaxMana() - resto.CurrentMana()
	if p.Circle && !state.circleUsed && missing > 0 && missing >= p.MinimumMissingMana {
		state.circleUsed = true
		state.started = true
		resto.AddMana(sim, 987.5, state.circleMana)
	}
	if p.Recombobulator && !state.recombobManaUsed && missing > 0 && missing >= p.MinimumMissingMana {
		state.recombobManaUsed = true
		state.started = true
		resto.AddMana(sim, 380, state.recombobMana)
	}
	heal := func(spell *core.Spell, base float64, used *bool) {
		if *used {
			return
		}
		target := resto.kfcUtilityProbeTarget(p.MinimumMissingHealth)
		if target == nil {
			return
		}
		*used = true
		state.started = true
		spell.CalcAndDealHealing(sim, target, base, func(_ *core.Simulation, result *core.SpellResult, table *core.AttackTable) {
			result.Outcome = core.OutcomeCrit
			result.Damage *= spell.CritMultiplier(table)
			spell.SpellMetrics[target.UnitIndex].Crits++
		})
	}
	if p.Gauntlets {
		heal(state.gloves, 500, &state.gloveUsed)
	}
	if p.Recombobulator {
		heal(state.recombob, 832.5, &state.recombobHealUsed)
	}
}
