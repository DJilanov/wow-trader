package core

import (
	"time"

	"github.com/wowsims/classic/sim/core/stats"
)

// KFC_DEATHMIST_CLIENT_CONSTANTS

// ForeverDeathmistIncomingReference maps the captured incoming proc mask to
// landed direct enemy attacks. Periodic, friendly and unclassified events do
// not consume random rolls or the item cooldown under this declared reference.
func ForeverDeathmistIncomingReference(character *Character, spell *Spell, result *SpellResult) bool {
	return character != nil && spell != nil && spell.Unit != nil && result != nil &&
		result.Target == &character.Unit && character.IsOpponent(spell.Unit) &&
		result.Landed() && spell.ProcMask.Matches(ProcMaskDirect)
}

func (character *Character) kfcForeverDeathmistBonuses() []ActiveSetBonus {
	if character.Env == nil || !character.Env.IsForever() {
		return nil
	}
	pieces := 0
	for _, item := range character.Equipment {
		if item.SetID == kfcDeathmistSetID {
			pieces++
		}
	}
	var bonuses []ActiveSetBonus
	add := func(threshold int32, effect ApplyEffect) {
		if pieces >= int(threshold) {
			bonuses = append(bonuses, ActiveSetBonus{Name: "Deathmist Raiment", NumPieces: threshold, BonusEffect: effect})
		}
	}
	add(2, func(agent Agent) {
		agent.GetCharacter().AddStats(stats.Stats{
			stats.ArcaneResistance: 8, stats.FireResistance: 8, stats.FrostResistance: 8,
			stats.NatureResistance: 8, stats.ShadowResistance: 8,
		})
	})
	add(4, registerDeathmistBossFearReference)
	add(6, func(agent Agent) { agent.GetCharacter().AddStat(stats.SpellPower, 23) })
	// Warlock already installs the BonusArmor -> Armor dependency.
	add(8, func(agent Agent) { agent.GetCharacter().AddStat(stats.BonusArmor, 200) })
	return bonuses
}

func registerDeathmistBossFearReference(agent Agent) {
	character := agent.GetCharacter()
	// This derived model explicitly chooses fear-immune raid bosses. Level is a
	// scope check, not evidence of immunity. Fearable encounters need a different
	// model; do not substitute stuns, pretend to model fleeing, or silently omit it.
	for _, target := range character.Env.Encounter.TargetUnits {
		if target.Type != EnemyUnit || target.Level != character.Level+3 {
			panic("Deathmist raid-boss fear-immunity reference does not support this encounter")
		}
	}
	const label = "Deathmist incoming fear: raid-boss immunity reference"
	if character.GetAura(label) != nil {
		panic("Deathmist incoming fear reference already registered")
	}
	fear := character.RegisterSpell(SpellConfig{
		ActionID: ActionID{SpellID: kfcDeathmistFearID}, SpellSchool: SpellSchoolShadow,
		ProcMask: ProcMaskEmpty, Flags: SpellFlagPassiveSpell | SpellFlagNoOnCastComplete,
		ApplyEffects: func(sim *Simulation, target *Unit, _ *Spell) {
			if target == nil || !character.IsOpponent(target) || target.Type != EnemyUnit || target.Level != character.Level+3 {
				panic("Deathmist fear target is outside the declared raid-boss reference")
			}
			// The engine has no immune outcome metric. Record the cast without
			// fabricating a hit/miss, damage, threat, movement or a boss debuff slot.
			if sim.Log != nil {
				sim.Log("Deathmist fear: %s is immune under the declared raid-boss reference", target.Label)
			}
		},
	})
	trigger := MakeProcTriggerAura(&character.Unit, ProcTrigger{
		Name: label, ActionID: ActionID{SpellID: kfcDeathmistProcID},
		Callback: CallbackOnSpellHitTaken, ProcChance: kfcDeathmistProcChance,
		ICD: time.Duration(kfcDeathmistICDMs) * time.Millisecond,
		Handler: func(sim *Simulation, incoming *Spell, _ *SpellResult) {
			fear.Cast(sim, incoming.Unit)
		},
	})
	callback := trigger.OnSpellHitTaken
	trigger.OnSpellHitTaken = func(aura *Aura, sim *Simulation, incoming *Spell, result *SpellResult) {
		if ForeverDeathmistIncomingReference(character, incoming, result) {
			callback(aura, sim, incoming, result)
		}
	}
}
