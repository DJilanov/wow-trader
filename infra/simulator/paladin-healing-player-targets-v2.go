package holy

import (
	"fmt"
	"sort"

	"github.com/wowsims/classic/sim/core"
)

func (healer *HolyPaladin) kfcPaladinHealingPlayerUnits() []*core.Unit {
	var units []*core.Unit
	for _, party := range healer.Env.Raid.Parties {
		for _, agent := range party.Players {
			units = append(units, &agent.GetCharacter().Unit)
		}
	}
	sort.Slice(units, func(i, j int) bool { return units[i].Index < units[j].Index })
	return units
}

func (healer *HolyPaladin) validateKFCPaladinInactiveGuardians() error {
	for _, party := range healer.Env.Raid.Parties {
		for _, pet := range party.Pets {
			if pet.GetPet().IsEnabled() {
				return fmt.Errorf("active guardians need a separately admitted healing assignment")
			}
		}
	}
	return nil
}
