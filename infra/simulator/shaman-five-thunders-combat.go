package core

import (
	"time"

	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/stats"
)

// KFC_COMBAT_FIVE_THUNDERS_CONSTANTS

// ForeverFiveThundersCastReference intentionally attempts once per completed
// nonpassive owner magic cast, including misses. Server routing is unverified.
func ForeverFiveThundersCastReference(character *Character, spell *Spell) bool {
	// The frozen Shaman implementation assigns its class flag to AgentReserved1.
	return character != nil && spell != nil && spell.Unit == &character.Unit &&
		character.Class == proto.Class_ClassShaman &&
		spell.Flags.Matches(SpellFlagAgentReserved1) &&
		!spell.Flags.Matches(SpellFlagPassiveSpell) &&
		spell.ProcMask.Matches(ProcMaskSpellDamage|ProcMaskSpellHealing)
}

func (character *Character) kfcCombatFiveThundersBonuses() []ActiveSetBonus {
	if character.Env == nil || !character.Env.IsForever() || character.Class != proto.Class_ClassShaman {
		return nil
	}
	pieces := 0
	for _, item := range character.Equipment {
		if item.SetID == kfcCombatFiveThundersSetID {
			pieces++
		}
	}
	var bonuses []ActiveSetBonus
	add := func(threshold int32, effect ApplyEffect) {
		if pieces >= int(threshold) {
			bonuses = append(bonuses, ActiveSetBonus{Name: "The Five Thunders", NumPieces: threshold, BonusEffect: effect})
		}
	}
	add(2, func(agent Agent) {
		agent.GetCharacter().AddStats(stats.Stats{
			stats.ArcaneResistance: kfcCombatFiveThundersResistance, stats.FireResistance: kfcCombatFiveThundersResistance,
			stats.FrostResistance: kfcCombatFiveThundersResistance, stats.NatureResistance: kfcCombatFiveThundersResistance,
			stats.ShadowResistance: kfcCombatFiveThundersResistance,
		})
	})
	add(4, registerCombatFiveThundersReference)
	// Unified SpellPower supplies both damage and healing exactly once.
	add(6, func(agent Agent) { agent.GetCharacter().AddStat(stats.SpellPower, kfcCombatFiveThundersStaticPower) })
	// NewShaman already owns the BonusArmor -> Armor dependency.
	add(8, func(agent Agent) { agent.GetCharacter().AddStat(stats.BonusArmor, kfcCombatFiveThundersBonusArmor) })
	return bonuses
}

func registerCombatFiveThundersReference(agent Agent) {
	character := agent.GetCharacter()
	const label = "Five Thunders completed-cast reference"
	if character.GetAura(label) != nil {
		panic("Five Thunders combat proc already registered")
	}
	buff := character.NewTemporaryStatsAura("Five Thunders combat power reference", ActionID{SpellID: kfcCombatFiveThundersBuffID}, stats.Stats{stats.SpellPower: kfcCombatFiveThundersProcPower}, time.Duration(kfcCombatFiveThundersDurationMs)*time.Millisecond)
	MakePermanent(character.RegisterAura(Aura{
		Label: label, ActionID: ActionID{SpellID: kfcCombatFiveThundersProcID},
		OnCastComplete: func(_ *Aura, sim *Simulation, spell *Spell) {
			if ForeverFiveThundersCastReference(character, spell) && sim.Proc(kfcCombatFiveThundersChance, label) {
				buff.Activate(sim)
			}
		},
	}))
}
