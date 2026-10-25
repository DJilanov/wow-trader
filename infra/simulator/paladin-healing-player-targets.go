package holy

import (
	"fmt"

	"github.com/wowsims/classic/sim/core"
)

func (healer *HolyPaladin) validateKFCPaladinInactiveGuardians() error {
	for _, unit := range healer.Env.Raid.AllUnits {
		if unit.Type == core.PetUnit && unit.IsEnabled() {
			return fmt.Errorf("active guardians need a separately admitted healing assignment")
		}
	}
	return nil
}
