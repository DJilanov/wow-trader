package restoration

import (
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
)

func (resto *RestorationDruid) kfcRecombobulatorProfession() bool {
	return resto.HasProfession(proto.Profession_Engineering)
}

// Both resources go to the same target. Coefficients and critical behavior are explicit hypotheses.
func (resto *RestorationDruid) registerKFCRecombobulatorUse() {
	state := resto.utilityProbes
	state.recombobTargetMana = map[int32]*core.ResourceMetrics{}
	for _, agent := range resto.Party.PlayersAndPets {
		unit := &agent.GetCharacter().Unit
		if unit.HasManaBar() {
			state.recombobTargetMana[unit.UnitIndex] = unit.NewManaMetrics(core.ActionID{SpellID: 23064, Tag: 2})
		}
	}
	state.recombobUse = resto.Character.RegisterSpell(core.SpellConfig{
		ActionID:    core.ActionID{SpellID: 23064, Tag: 2},
		SpellSchool: core.SpellSchoolArcane, DefenseType: core.DefenseTypeMagic,
		ProcMask:         core.ProcMaskSpellHealing,
		Flags:            core.SpellFlagHelpful | core.SpellFlagPassiveSpell | core.SpellFlagNoOnCastComplete,
		DamageMultiplier: 1, ThreatMultiplier: 1,
		Cast: core.CastConfig{
			CD:       core.Cooldown{Timer: resto.NewTimer(), Duration: 5 * time.Minute},
			SharedCD: core.Cooldown{Timer: resto.NewTimer(), Duration: 2 * time.Minute},
		},
		ExtraCastCondition: func(sim *core.Simulation, target *core.Unit) bool {
			p := resto.kfcResolvedUtilityProbe()
			return p.Mode == "recombobulator-timed-use" && p.Recombobulator && state.owned[18637] &&
				state.recombobCharges > 0 && resto.kfcRecombobulatorProfession() &&
				resto.kfcSelfEffectsAlive() && !resto.IsCasting(sim) && !resto.IsChanneling(sim) &&
				resto.kfcLiveFriendly(target) && resto.kfcInRange(&resto.Unit, target, 30)
		},
		ApplyEffects: func(sim *core.Simulation, target *core.Unit, spell *core.Spell) {
			p := resto.kfcResolvedUtilityProbe()
			state.started = true
			state.recombobCharges--
			power := spell.HealingPower(target)
			outcome := spell.OutcomeHealing
			if p.RecombobulatorCanCrit {
				outcome = spell.OutcomeHealingCrit
			}
			spell.CalcAndDealHealing(sim, target, sim.Roll(499.5, 832.5)+p.RecombobulatorHealingCoefficient*power, outcome)
			if metrics := state.recombobTargetMana[target.UnitIndex]; metrics != nil {
				target.AddMana(sim, sim.Roll(228, 380)+p.RecombobulatorManaCoefficient*power, metrics)
			}
		},
	})
}

func (resto *RestorationDruid) kfcTryRecombobulatorUse(sim *core.Simulation) {
	state := resto.utilityProbes
	if state == nil || state.recombobUse == nil || !resto.kfcSelfEffectsAlive() ||
		resto.IsCasting(sim) || resto.IsChanneling(sim) {
		return
	}
	p := resto.kfcResolvedUtilityProbe()
	var target *core.Unit
	for _, agent := range resto.Party.PlayersAndPets {
		unit := &agent.GetCharacter().Unit
		if p.RecombobulatorTarget == "self" && unit != &resto.Unit {
			continue
		}
		if !resto.kfcLiveFriendly(unit) || !resto.kfcInRange(&resto.Unit, unit, 30) {
			continue
		}
		missingHealth := unit.MaxHealth() - unit.CurrentHealth()
		missingMana := 0.0
		if unit.HasManaBar() {
			missingMana = unit.MaxMana() - unit.CurrentMana()
		}
		if !(missingHealth > 0 && missingHealth >= p.MinimumMissingHealth) &&
			!(missingMana > 0 && missingMana >= p.MinimumMissingMana) {
			continue
		}
		if target == nil || unit.CurrentHealthPercent() < target.CurrentHealthPercent() ||
			unit.CurrentHealthPercent() == target.CurrentHealthPercent() && unit.UnitIndex < target.UnitIndex {
			target = unit
		}
	}
	if target != nil && state.recombobUse.CanCast(sim, target) {
		state.recombobUse.Cast(sim, target)
	}
}
