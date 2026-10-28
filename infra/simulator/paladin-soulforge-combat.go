package core

import (
	"time"

	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/stats"
)

// KFC_SOULFORGE_COMBAT_CONSTANTS

// ForeverSoulforgeMeleeReference excludes specials, spells, friendly targets and
// pet attacks. A landed absorbed white hit remains eligible in this reference.
func ForeverSoulforgeMeleeReference(character *Character, spell *Spell, result *SpellResult) bool {
	return character != nil && spell != nil && spell.Unit == &character.Unit && result != nil &&
		result.Target != nil && character.IsOpponent(result.Target) && result.Landed() &&
		spell.ProcMask.Matches(ProcMaskMeleeWhiteHit)
}

func (character *Character) kfcForeverSoulforgeBonuses() []ActiveSetBonus {
	if character.Env == nil || !character.Env.IsForever() || character.Class != proto.Class_ClassPaladin {
		return nil
	}
	pieces := 0
	for _, item := range character.Equipment {
		if item.SetID == kfcSoulforgeSetID {
			pieces++
		}
	}
	var bonuses []ActiveSetBonus
	add := func(threshold int32, effect ApplyEffect) {
		if pieces >= int(threshold) {
			bonuses = append(bonuses, ActiveSetBonus{Name: "Soulforge Armor", NumPieces: threshold, BonusEffect: effect})
		}
	}
	add(2, func(agent Agent) {
		agent.GetCharacter().AddStats(stats.Stats{
			stats.ArcaneResistance: kfcSoulforgeResistance, stats.FireResistance: kfcSoulforgeResistance,
			stats.FrostResistance: kfcSoulforgeResistance, stats.NatureResistance: kfcSoulforgeResistance,
			stats.ShadowResistance: kfcSoulforgeResistance,
		})
	})
	add(4, registerSoulforgeCombatReference)
	add(6, func(agent Agent) {
		agent.GetCharacter().AddStats(stats.Stats{stats.AttackPower: kfcSoulforgeAttackPower, stats.RangedAttackPower: kfcSoulforgeRangedAttackPower})
	})
	// The existing Paladin constructor owns the BonusArmor -> Armor dependency.
	add(8, func(agent Agent) { agent.GetCharacter().AddStat(stats.BonusArmor, kfcSoulforgeBonusArmor) })
	return bonuses
}

func registerSoulforgeCombatReference(agent Agent) {
	character := agent.GetCharacter()
	const label = "Soulforge white-melee power: one-PPM reference"
	if character.GetAura(label) != nil {
		panic("Soulforge combat proc already registered")
	}
	// Unified SpellPower supplies both channels; HealingPower would double-count it.
	buff := character.NewTemporaryStatsAura("Soulforge power reference", ActionID{SpellID: kfcSoulforgeBuffID}, stats.Stats{stats.SpellPower: kfcSoulforgeProcPower}, time.Duration(kfcSoulforgeDurationMs)*time.Millisecond)
	trigger := MakeProcTriggerAura(&character.Unit, ProcTrigger{
		Name: label, ActionID: ActionID{SpellID: kfcSoulforgeProcID},
		Callback: CallbackOnSpellHitDealt, ProcMask: ProcMaskMeleeWhiteHit,
		Outcome: OutcomeLanded, PPM: kfcSoulforgeReferencePPM,
		Handler: func(sim *Simulation, _ *Spell, _ *SpellResult) { buff.Activate(sim) },
	})
	callback := trigger.OnSpellHitDealt
	trigger.OnSpellHitDealt = func(aura *Aura, sim *Simulation, spell *Spell, result *SpellResult) {
		if ForeverSoulforgeMeleeReference(character, spell, result) {
			callback(aura, sim, spell, result)
		}
	}
}
