package restoration

import (
	"time"

	"github.com/wowsims/classic/sim/core"
)

// The client supplies range, amount and GCD; critical behavior remains an explicit hypothesis.
func (resto *RestorationDruid) registerKFCGauntletsUse() {
	state := resto.utilityProbes
	state.gauntletUse = resto.Character.RegisterSpell(core.SpellConfig{
		ActionID:         core.ActionID{SpellID: 10577, Tag: 1},
		SpellSchool:      core.SpellSchoolHoly,
		DefenseType:      core.DefenseTypeMagic,
		ProcMask:         core.ProcMaskSpellHealing,
		Flags:            core.SpellFlagHelpful | core.SpellFlagPassiveSpell | core.SpellFlagNoOnCastComplete,
		DamageMultiplier: 1,
		ThreatMultiplier: 1,
		Cast: core.CastConfig{
			DefaultCast: core.Cast{GCD: 1500 * time.Millisecond},
			IgnoreHaste: true,
			CD:          core.Cooldown{Timer: resto.NewTimer(), Duration: 30 * time.Minute},
		},
		ExtraCastCondition: func(sim *core.Simulation, target *core.Unit) bool {
			p := resto.kfcResolvedUtilityProbe()
			return p.Mode == "gauntlets-timed-use" && p.Gauntlets && state.owned[8346] &&
				resto.kfcSelfEffectsAlive() && !resto.IsCasting(sim) && !resto.IsChanneling(sim) &&
				resto.kfcLiveFriendly(target) && resto.kfcInRange(&resto.Unit, target, 40)
		},
		ApplyEffects: func(sim *core.Simulation, target *core.Unit, spell *core.Spell) {
			outcome := spell.OutcomeHealing
			if resto.kfcResolvedUtilityProbe().GauntletsCanCrit {
				outcome = spell.OutcomeHealingCrit
			}
			state.started = true
			spell.CalcAndDealHealing(sim, target, sim.Roll(300, 500), outcome)
		},
	})
}

func (resto *RestorationDruid) kfcTryGauntletsUse(sim *core.Simulation) {
	state := resto.utilityProbes
	if state == nil || state.gauntletUse == nil || !resto.kfcSelfEffectsAlive() ||
		!resto.GCD.IsReady(sim) || resto.IsCasting(sim) || resto.IsChanneling(sim) {
		return
	}
	p := resto.kfcResolvedUtilityProbe()
	var target *core.Unit
	for _, agent := range resto.Party.PlayersAndPets {
		unit := &agent.GetCharacter().Unit
		if !resto.kfcLiveFriendly(unit) || !resto.kfcInRange(&resto.Unit, unit, 40) {
			continue
		}
		missing := unit.MaxHealth() - unit.CurrentHealth()
		if missing <= 0 || missing < p.MinimumMissingHealth {
			continue
		}
		if target == nil || unit.CurrentHealthPercent() < target.CurrentHealthPercent() ||
			unit.CurrentHealthPercent() == target.CurrentHealthPercent() && unit.UnitIndex < target.UnitIndex {
			target = unit
		}
	}
	if target != nil && state.gauntletUse.CanCast(sim, target) {
		state.gauntletUse.Cast(sim, target)
	}
}
