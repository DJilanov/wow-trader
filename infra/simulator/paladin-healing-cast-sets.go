package holy

import (
	"fmt"
	"math"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/stats"
)

// KFC_PALADIN_CAST_SET_VALUES

type KFCPaladinCastSetPolicy struct {
	WildheartManaChance *float64 `json:"wildheartManaChance,omitempty"`
	SpellPowerChance    *float64 `json:"spellPowerChance,omitempty"`
	DreadmistCanCrit    *bool    `json:"dreadmistCanCrit,omitempty"`
}

type kfcPaladinCastSets struct {
	counts                        map[int32]int
	policy                        KFCPaladinCastSetPolicy
	echo                          *KFCPaladinCastSetPolicy
	configured, initialized, used bool
}

func (healer *HolyPaladin) registerKFCPaladinCastSets() {
	state := &kfcPaladinCastSets{counts: map[int32]int{}}
	healer.castSets = state
	for _, item := range healer.Equipment {
		state.counts[item.SetID]++
	}
	wildheart, spellPower, dreadmist := .02, 1.0, false
	state.policy = KFCPaladinCastSetPolicy{WildheartManaChance: &wildheart, SpellPowerChance: &spellPower, DreadmistCanCrit: &dreadmist}
	if state.counts[185] < 5 && state.counts[183] < 5 && state.counts[187] < 5 && state.counts[188] < 5 {
		return
	}
	for _, id := range []int32{183, 185, 187, 188} {
		if state.counts[id] >= 5 && !core.HasForeverEquipmentSetDefinition(id) {
			panic("Paladin cast sets require isolated current set definitions")
		}
	}
	var mana *core.ResourceMetrics
	if state.counts[185] >= 5 {
		mana = healer.NewManaMetrics(core.ActionID{SpellID: 27782})
	}
	var heal *core.Spell
	if state.counts[183] >= 5 {
		heal = healer.Character.RegisterSpell(core.SpellConfig{
			ActionID: core.ActionID{SpellID: 450583}, SpellSchool: core.SpellSchoolHoly,
			DefenseType: core.DefenseTypeMagic, ProcMask: core.ProcMaskSpellHealing,
			Flags:            core.SpellFlagHelpful | core.SpellFlagPassiveSpell | core.SpellFlagNoOnCastComplete,
			DamageMultiplier: 1, ThreatMultiplier: 1,
		})
	}
	var power *core.Aura
	for _, row := range []struct {
		setID, spellID int32
		label          string
	}{
		{187, 27775, "Paladin Elements cast power"}, {188, 27499, "Paladin Lightforge cast power"},
	} {
		if state.counts[row.setID] >= 5 {
			if power != nil {
				panic("Two five-piece armor sets cannot be equipped")
			}
			power = healer.NewTemporaryStatsAura(row.label, core.ActionID{SpellID: row.spellID}, stats.Stats{stats.HealingPower: kfcPaladinCastSetPower, stats.SpellDamage: kfcPaladinCastSetPower}, time.Duration(kfcPaladinCastSetPowerMs)*time.Millisecond)
		}
	}
	core.MakePermanent(healer.RegisterAura(core.Aura{
		Label: "Paladin current healing cast set procs",
		OnReset: func(_ *core.Aura, _ *core.Simulation) {
			state.initialized = true
			state.used = false
		},
		OnCastComplete: func(_ *core.Aura, sim *core.Simulation, spell *core.Spell) {
			rank, known := kfcPaladinWorkloadRanks[spell.ActionID.SpellID]
			if !known || rank.Root != spell.ActionID.SpellID || !spell.ProcMask.Matches(core.ProcMaskSpellHealing) || spell.Flags.Matches(core.SpellFlagPassiveSpell|core.SpellFlagNoOnCastComplete) || healer.CurrentHealth() <= 0 || !healer.IsEnabled() {
				return
			}
			state.used = true
			if mana != nil && sim.Proc(*state.policy.WildheartManaChance, "Paladin Wildheart cast mana") {
				healer.AddMana(sim, kfcPaladinCastSetMana, mana)
			}
			if power != nil && sim.Proc(*state.policy.SpellPowerChance, "Paladin current cast set power") {
				power.Activate(sim)
			}
			if heal != nil && sim.Proc(kfcPaladinCastSetDreadmistChance, "Paladin Dreadmist cast healing") {
				outcome := heal.OutcomeHealing
				if *state.policy.DreadmistCanCrit {
					outcome = heal.OutcomeHealingCrit
				}
				heal.CalcAndDealHealing(sim, &healer.Unit, sim.Roll(kfcPaladinCastSetDreadmistLow, kfcPaladinCastSetDreadmistHigh), outcome)
			}
		},
	}))
}

func (healer *HolyPaladin) ConfigureKFCPaladinCastSets(sim *core.Simulation, policy *KFCPaladinCastSetPolicy) error {
	if policy == nil {
		return nil
	}
	state := healer.castSets
	if sim == nil || sim.CurrentTime != 0 || state == nil || state.configured || state.used || healer.GCD.ReadyAt() > 0 || healer.IsCasting(sim) || healer.IsChanneling(sim) || (state.initialized && healer.CurrentHealth() <= 0) {
		return fmt.Errorf("cast-set references require a fresh equipped Paladin")
	}
	if policy.WildheartManaChance == nil && policy.SpellPowerChance == nil && policy.DreadmistCanCrit == nil {
		return fmt.Errorf("cast-set policy has no explicit references")
	}
	for _, spell := range healer.Spellbook {
		for _, metric := range spell.SpellMetrics {
			if metric.Casts > 0 || metric.Hits > 0 || metric.Crits > 0 || metric.Ticks > 0 || metric.CritTicks > 0 {
				return fmt.Errorf("cast-set references cannot change after casting")
			}
		}
	}
	for _, row := range []struct {
		value *float64
		owned bool
	}{
		{policy.WildheartManaChance, state.counts[185] >= 5},
		{policy.SpellPowerChance, state.counts[187] >= 5 || state.counts[188] >= 5},
	} {
		if row.value != nil && (!row.owned || math.IsNaN(*row.value) || math.IsInf(*row.value, 0) || *row.value < 0 || *row.value > 1) {
			return fmt.Errorf("invalid or unowned cast-set chance reference")
		}
	}
	if policy.DreadmistCanCrit != nil && state.counts[183] < 5 {
		return fmt.Errorf("Dreadmist critical reference requires five equipped pieces")
	}
	echo := &KFCPaladinCastSetPolicy{}
	if policy.WildheartManaChance != nil {
		value := *policy.WildheartManaChance
		state.policy.WildheartManaChance, echo.WildheartManaChance = &value, &value
	}
	if policy.SpellPowerChance != nil {
		value := *policy.SpellPowerChance
		state.policy.SpellPowerChance, echo.SpellPowerChance = &value, &value
	}
	if policy.DreadmistCanCrit != nil {
		value := *policy.DreadmistCanCrit
		state.policy.DreadmistCanCrit, echo.DreadmistCanCrit = &value, &value
	}
	state.echo, state.configured = echo, true
	return nil
}
