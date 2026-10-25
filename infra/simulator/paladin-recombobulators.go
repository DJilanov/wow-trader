package holy

import (
	"fmt"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
)

type kfcPaladinRecombobulators struct {
	spells     map[int32]*core.Spell
	charges    map[int32]int
	canCrit    bool
	configured bool
	started    bool
}

// UsesKFCOwnedRecombobulators prevents the generic consumable from creating a free use.
func (healer *HolyPaladin) UsesKFCOwnedRecombobulators() bool { return true }

func (healer *HolyPaladin) registerKFCPaladinRecombobulators() {
	if !healer.Env.IsForever() {
		return
	}
	state := &kfcPaladinRecombobulators{spells: map[int32]*core.Spell{}, charges: map[int32]int{}}
	healer.recombobulators = state
	if !healer.HasProfession(proto.Profession_Engineering) {
		return
	}
	owned := map[int32]bool{}
	for _, item := range healer.Equipment {
		owned[item.ID] = true
	}
	for _, row := range []struct {
		id                                 int32
		healMin, healMax, manaMin, manaMax float64
	}{
		{4381, 202.5, 337.5, 96, 160}, {18637, 499.5, 832.5, 228, 380},
	} {
		if !owned[row.id] {
			continue
		}
		id := row.id
		if healer.GetSpell(core.ActionID{ItemID: id}) != nil {
			panic("Legacy Recombobulator use still registered")
		}
		mana := map[int32]*core.ResourceMetrics{}
		for _, unit := range healer.Env.Raid.AllUnits {
			if unit.HasManaBar() {
				mana[unit.UnitIndex] = unit.NewManaMetrics(core.ActionID{ItemID: id, Tag: 1})
			}
		}
		spell := healer.RegisterSpell(core.SpellConfig{ActionID: core.ActionID{ItemID: id}, SpellSchool: core.SpellSchoolArcane, DefenseType: core.DefenseTypeMagic,
			ProcMask: core.ProcMaskSpellHealing, Flags: core.SpellFlagHelpful | core.SpellFlagPassiveSpell | core.SpellFlagNoOnCastComplete,
			DamageMultiplier: 1, ThreatMultiplier: 1,
			Cast: core.CastConfig{CD: core.Cooldown{Timer: healer.NewTimer(), Duration: 5 * time.Minute}, SharedCD: core.Cooldown{Timer: healer.GetConjuredCD(), Duration: 2 * time.Minute}},
			ExtraCastCondition: func(sim *core.Simulation, target *core.Unit) bool {
				return state.charges[id] > 0 && healer.HasProfession(proto.Profession_Engineering) && healer.CurrentHealth() > 0 && !healer.IsCasting(sim) && !healer.IsChanneling(sim) && healer.kfcValidHealingTarget(target, 30)
			},
			ApplyEffects: func(sim *core.Simulation, target *core.Unit, spell *core.Spell) {
				state.started = true
				state.charges[id]--
				outcome := spell.OutcomeHealing
				if state.canCrit {
					outcome = spell.OutcomeHealingCrit
				}
				spell.CalcAndDealHealing(sim, target, sim.RollWithLabel(row.healMin, row.healMax, "Paladin Recombobulator Health"), outcome)
				if metrics := mana[target.UnitIndex]; metrics != nil {
					target.AddMana(sim, sim.RollWithLabel(row.manaMin, row.manaMax, "Paladin Recombobulator Mana"), metrics)
				}
			},
		})
		state.spells[id] = spell
		healer.AddMajorCooldown(core.MajorCooldown{Type: core.CooldownTypeMana, Spell: spell, ShouldActivate: func(_ *core.Simulation, _ *core.Character) bool { return false }})
	}
	if len(state.spells) > 0 {
		core.MakePermanent(healer.RegisterAura(core.Aura{Label: "Paladin Recombobulator charges", OnReset: func(_ *core.Aura, _ *core.Simulation) {
			for id := range state.spells {
				state.charges[id] = 10
			}
		}}))
	}
}

func (healer *HolyPaladin) ConfigureKFCPaladinRecombobulatorCriticals(enabled bool) error {
	state := healer.recombobulators
	if state == nil || len(state.spells) == 0 || state.configured || state.started || healer.GCD.ReadyAt() > 0 || healer.Hardcast.Expires > 0 {
		return fmt.Errorf("Recombobulator research requires a fresh equipped Engineer")
	}
	for _, spell := range healer.Spellbook {
		for _, metric := range spell.SpellMetrics {
			if metric.Casts > 0 || metric.Ticks > 0 || metric.CritTicks > 0 {
				return fmt.Errorf("Recombobulator critical policy cannot change after casting")
			}
		}
	}
	state.canCrit, state.configured = enabled, true
	return nil
}

func (healer *HolyPaladin) kfcPaladinRecombobulatorCriticalEcho() *bool {
	if healer.recombobulators == nil || len(healer.recombobulators.spells) == 0 {
		return nil
	}
	value := healer.recombobulators.canCrit
	return &value
}

func (healer *HolyPaladin) validateKFCPaladinRecombobulatorCooldown(policy KFCPaladinHealingCooldown) error {
	recombobulator := policy.ItemID == 4381 || policy.ItemID == 18637
	if !recombobulator && (policy.TargetRaidIndex != nil || policy.MinimumMissingHealth != nil) {
		return fmt.Errorf("friendly resource targeting is only admitted for Recombobulators")
	}
	if policy.MinimumMissingHealth != nil && (!kfcFinite(*policy.MinimumMissingHealth) || *policy.MinimumMissingHealth < 0 || *policy.MinimumMissingHealth > 1000000) {
		return fmt.Errorf("invalid Recombobulator health threshold")
	}
	if policy.TargetRaidIndex != nil {
		id := *policy.TargetRaidIndex
		if id < -1 || id > 39 {
			return fmt.Errorf("invalid Recombobulator recipient")
		}
		if id >= 0 {
			found := false
			for _, unit := range healer.Env.Raid.AllUnits {
				found = found || unit.Index == id
			}
			if !found {
				return fmt.Errorf("Recombobulator recipient is outside this raid")
			}
		}
	}
	return nil
}

func (healer *HolyPaladin) tryKFCPaladinRecombobulator(sim *core.Simulation, frame KFCPaladinHealingWorkload, policy KFCPaladinHealingCooldown) {
	state := healer.recombobulators
	if state == nil || state.spells[policy.ItemID] == nil || (policy.RequireHealingDemand && !healer.hasKFCPaladinHealingDemand(sim, frame)) {
		return
	}
	index := healer.Index
	if policy.TargetRaidIndex != nil {
		index = *policy.TargetRaidIndex
	}
	minimumHealth := 0.0
	if policy.MinimumMissingHealth != nil {
		minimumHealth = *policy.MinimumMissingHealth
	}
	var target *core.Unit
	for _, unit := range healer.Env.Raid.AllUnits {
		if index >= 0 && unit.Index != index || !healer.kfcValidHealingTarget(unit, 30) {
			continue
		}
		health := unit.MaxHealth() - unit.CurrentHealth()
		mana := 0.0
		if unit.HasManaBar() {
			mana = unit.MaxMana() - unit.CurrentMana()
		}
		if !(health > 0 && health >= minimumHealth) && !(mana > 0 && mana >= policy.MinimumMissingMana) {
			continue
		}
		if target == nil || unit.CurrentHealthPercent() < target.CurrentHealthPercent() || unit.CurrentHealthPercent() == target.CurrentHealthPercent() && unit.UnitIndex < target.UnitIndex {
			target = unit
		}
	}
	spell := state.spells[policy.ItemID]
	if target != nil && spell.CanCast(sim, target) && spell.Cast(sim, target) {
		healer.UpdateMajorCooldowns()
	}
}

func validateKFCPaladinRecombobulatorSelection(player *proto.Player) error {
	if player.Consumes == nil || player.Consumes.DefaultConjured != proto.Conjured_ConjuredMinorRecombobulator {
		return nil
	}
	owned := false
	if player.Equipment != nil {
		for _, item := range player.Equipment.Items {
			owned = owned || item.GetId() == 4381
		}
	}
	if !owned || player.Profession1 != proto.Profession_Engineering && player.Profession2 != proto.Profession_Engineering {
		return fmt.Errorf("Minor Recombobulator requires its equipped trinket and Engineering")
	}
	return nil
}
