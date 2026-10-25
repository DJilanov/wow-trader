package restoration

import (
	"time"

	"github.com/wowsims/classic/sim/core"
)

func (resto *RestorationDruid) kfcHasOwnedIdolHot(target *core.Unit, family string) bool {
	for _, spell := range resto.familySpells[family] {
		if hot := spell.Hot(target); hot != nil && hot.IsActive() {
			return true
		}
	}
	return false
}

func (resto *RestorationDruid) kfcIdolDirectHealing(sim *core.Simulation, target *core.Unit, spell *core.Spell, family string, base float64) {
	result := spell.CalcHealing(sim, target, base, spell.OutcomeHealingCrit)
	if resto.Ranged().ID == 22398 && family == "regrowth" && resto.kfcHasOwnedIdolHot(target, "rejuvenation") {
		result.Damage *= 1.05
		result.Threat = spell.ThreatFromDamage(result.Outcome, result.Damage)
	}
	spell.DealHealing(sim, result)
}

func (resto *RestorationDruid) kfcIdolSwiftCooldown(milliseconds int) time.Duration {
	if resto.Ranged().ID == 279250 {
		milliseconds -= 3000
	}
	return time.Duration(max(0, milliseconds)) * time.Millisecond
}

func (resto *RestorationDruid) kfcIdolSwiftReduction(sim *core.Simulation, target *core.Unit, spell *core.Spell) {
	if resto.Ranged().ID != 272429 {
		return
	}
	count := 0
	for _, family := range []string{"rejuvenation", "regrowth", "wild-growth"} {
		if resto.kfcHasOwnedIdolHot(target, family) {
			count++
		}
	}
	spell.CD.Set(max(sim.CurrentTime, spell.CD.ReadyAt()-time.Duration(count)*time.Second))
}
