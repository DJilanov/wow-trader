package healing

import (
	"time"

	"github.com/wowsims/classic/sim/core"
)

func (healer *HealingPriest) registerKFCPriestDragonMark() {
	owned := false
	for _, item := range healer.Equipment {
		if item.ID == 13143 {
			owned = true
		}
	}
	if !owned {
		return
	}
	if core.HasItemEffect(13143) {
		panic("Dragon Mark already has a global handler; re-admit class behavior")
	}
	action := core.ActionID{SpellID: 17252}
	mana := healer.NewManaMetrics(action)
	var pending *core.PendingAction
	var nextTick, endsAt time.Duration
	var spell *core.Spell
	var schedule func(*core.Simulation)
	schedule = func(sim *core.Simulation) {
		pending = &core.PendingAction{NextActionAt: nextTick, Priority: core.ActionPriorityAuto, OnAction: func(sim *core.Simulation) {
			pending = nil
			shield := spell.SelfShield()
			if !shield.IsActive() {
				return
			}
			if !(healer.CurrentHealth() > 0) {
				shield.Deactivate(sim)
				return
			}
			nextTick += 5 * time.Second
			healer.AddMana(sim, 22, mana)
			if nextTick <= endsAt {
				schedule(sim)
			}
		}}
		sim.AddPendingAction(pending)
	}
	spell = healer.Character.RegisterSpell(core.SpellConfig{ActionID: action, ProcMask: core.ProcMaskEmpty,
		SpellSchool: core.SpellSchoolPhysical, Flags: core.SpellFlagHelpful | core.SpellFlagNoOnCastComplete,
		DamageMultiplier: 1, ThreatMultiplier: 1,
		Cast:               core.CastConfig{CD: core.Cooldown{Timer: healer.NewTimer(), Duration: 30 * time.Minute}},
		ExtraCastCondition: func(_ *core.Simulation, _ *core.Unit) bool { return (healer.CurrentHealth() > 0) },
		Shield: core.ShieldConfig{SelfOnly: true, Aura: core.Aura{Label: "Priest Mark of the Dragon Lord", Duration: 30 * time.Minute,
			OnGain: func(aura *core.Aura, sim *core.Simulation) {
				endsAt = aura.ExpiresAt()
				nextTick = sim.CurrentTime + 5*time.Second
				schedule(sim)
			},
			OnExpire: func(_ *core.Aura, sim *core.Simulation) {
				// Aura.Deactivate clears ExpiresAt before invoking this callback.
				if endsAt > 0 && sim.CurrentTime >= endsAt && nextTick == endsAt && (healer.CurrentHealth() > 0) {
					healer.AddMana(sim, 22, mana)
				}
				if pending != nil {
					pending.Cancel(sim)
					pending = nil
				}
				nextTick, endsAt = 0, 0
			},
		}},
		ApplyEffects: func(sim *core.Simulation, _ *core.Unit, spell *core.Spell) { spell.SelfShield().Apply(sim, 500) },
	})
	healer.AddMajorCooldown(core.MajorCooldown{Type: core.CooldownTypeMana, Spell: spell})
}
