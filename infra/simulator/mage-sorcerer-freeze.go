package core

import (
	"fmt"
	"math"
	"time"
)

func (character *Character) kfcRegisterSorcererFreeze() {
	roots := character.NewEnemyAuraArray(func(target *Unit) *Aura {
		return target.RegisterCrowdControlAura(Aura{
			Label:    fmt.Sprintf("Sorcerer Freeze-%d", character.UnitIndex),
			ActionID: ActionID{SpellID: 27868, Tag: character.Index + 1},
			Duration: 3 * time.Second,
			OnGain:   func(_ *Aura, sim *Simulation) { target.AddRoot(sim) },
			OnExpire: func(_ *Aura, sim *Simulation) { target.RemoveRoot(sim) },
		}, CrowdControlDRStun)
	})
	proc := MakeProcTriggerAura(&character.Unit, ProcTrigger{
		Name: "Sorcerer Freeze Trigger", ActionID: ActionID{SpellID: 27867},
		Callback: CallbackOnSpellHitTaken, Outcome: OutcomeLanded,
		// Client139944 includes incoming autos/specials and negative direct spells,
		// but neither healing nor periodic-damage callbacks.
		ProcMask: ProcMaskDirect | ProcMaskEmpty, SpellFlagsExclude: SpellFlagHelpful,
		ProcChance: .02, ICD: time.Minute,
		Handler: func(sim *Simulation, spell *Spell, _ *SpellResult) {
			if root := roots.Get(spell.Unit); root != nil {
				spell.Unit.ApplyCrowdControl(sim, root, 3*time.Second, CrowdControlDRStun)
			}
		},
	})
	callback := proc.OnSpellHitTaken
	proc.OnSpellHitTaken = func(aura *Aura, sim *Simulation, spell *Spell, result *SpellResult) {
		if spell == nil || result == nil || spell.Unit == nil || spell.Unit.Type != EnemyUnit ||
			!spell.Unit.PseudoStats.CanBeRooted || math.Abs(character.DistanceFromTarget-spell.Unit.DistanceFromTarget) > 5 {
			return
		}
		callback(aura, sim, spell, result)
	}
}
