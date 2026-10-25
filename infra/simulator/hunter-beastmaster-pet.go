package hunter

import (
	"fmt"
	"math"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/stats"
)

func init() {
	for _, effect := range []struct {
		itemID, spellID int32
	}{
		{22013, 27039}, {22015, 27042}, {22060, 27208}, {22061, 27205},
	} {
		core.NewItemEffect(effect.itemID, func(agent core.Agent) {
			hunterAgent, ok := agent.(HunterAgent)
			if !ok || !agent.GetCharacter().Env.IsForever() {
				return
			}
			hunter := hunterAgent.GetHunter()
			if hunter.pet == nil {
				return
			}
			hunter.registerBeastmasterPetBuff(effect.spellID)
		})
	}
}

func beastmasterPetBaseArmorBonus(pet *core.Pet) float64 {
	return 0.10 * pet.GetBaseStats()[stats.Armor]
}

func (hunter *Hunter) registerBeastmasterPetBuff(spellID int32) {
	pet := hunter.pet
	inRange := func() bool {
		return math.Abs(hunter.DistanceFromTarget-pet.DistanceFromTarget) <= 100
	}
	aura := pet.RegisterAura(core.Aura{
		Label:    fmt.Sprintf("Beastmaster Pet %d", spellID),
		ActionID: core.ActionID{SpellID: spellID}, Duration: 4 * time.Second,
	})
	switch spellID {
	case 27039:
		aura.AttachStatDependency(pet.NewDynamicMultiplyStat(stats.Health, 1.03))
	case 27042:
		aura.AttachStatsBuff(stats.Stats{stats.MeleeCrit: 2 * core.CritRatingPerCritChance})
	case 27208:
		// The base armor component excludes inherited armor and agility-derived armor.
		aura.AttachStatsBuff(stats.Stats{stats.Armor: beastmasterPetBaseArmorBonus(&pet.Pet)})
	case 27205:
		aura.AttachMultiplicativePseudoStatBuff(&pet.PseudoStats.DamageDealtMultiplier, 1.03)
	default:
		panic("unreviewed Beastmaster pet spell")
	}
	previousEnable := pet.OnPetEnable
	pet.OnPetEnable = func(sim *core.Simulation) {
		if previousEnable != nil {
			previousEnable(sim)
		}
		// A pet already equipped and in range before the pull starts with its buff.
		// Later summons wait for the next owner refresh rather than gaining it instantly.
		if sim.CurrentTime <= 0 && inRange() {
			aura.Activate(sim)
		}
	}
	hunter.RegisterResetEffect(func(sim *core.Simulation) {
		core.StartPeriodicAction(sim, core.PeriodicActionOptions{
			Period: 3 * time.Second,
			OnAction: func(sim *core.Simulation) {
				if pet.IsEnabled() && inRange() {
					aura.Activate(sim)
				}
			},
		})
	})
}
