package item_sets

import "github.com/wowsims/classic/sim/core"

type kfcWildheartManaPolicy interface {
	KFCWildheartManaProcChance() float64
	KFCWildheartManaDirectHealingEvents() bool
}

func applyKFCWildheartMana(agent core.Agent, id core.ActionID, metrics *core.ResourceMetrics) {
	c := agent.GetCharacter()
	policy, controlled := agent.(kfcWildheartManaPolicy)
	directEvents := func() bool { return controlled && policy.KFCWildheartManaDirectHealingEvents() }
	proc := func(sim *core.Simulation) {
		if !c.HasManaBar() || !c.IsEnabled() || (c.HasHealthBar() && c.CurrentHealth() <= 0) {
			return
		}
		chance := .02
		if controlled {
			chance = policy.KFCWildheartManaProcChance()
		}
		// The shared proc helper treats zero as its default. Here zero must disable the hypothesis.
		if chance > 0 && sim.Proc(chance, "Nature's Bounty (Mana)") {
			c.AddMana(sim, 200, metrics)
		}
	}
	core.MakePermanent(c.RegisterAura(core.Aura{
		Label: "Nature's Bounty (Mana)", ActionID: id,
		OnCastComplete: func(_ *core.Aura, sim *core.Simulation, spell *core.Spell) {
			if spell.Flags.Matches(core.SpellFlagPassiveSpell | core.SpellFlagNoOnCastComplete) {
				return
			}
			if spell.ProcMask.Matches(core.ProcMaskSpellDamage) || (!directEvents() && spell.ProcMask.Matches(core.ProcMaskSpellHealing)) {
				proc(sim)
			}
		},
		OnHealDealt: func(_ *core.Aura, sim *core.Simulation, spell *core.Spell, result *core.SpellResult) {
			if directEvents() && result.DirectDamageOrHealing && result.Landed() && !spell.Flags.Matches(core.SpellFlagPassiveSpell|core.SpellFlagNoOnCastComplete) && spell.ProcMask.Matches(core.ProcMaskSpellHealing) {
				proc(sim)
			}
		},
	}))
}
