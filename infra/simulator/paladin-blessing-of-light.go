package holy

import (
	"fmt"
	"time"

	"github.com/wowsims/classic/sim/core"
)

type kfcPaladinBlessingOfLightRank struct {
	RequiredLevel           int
	HolyLight, FlashOfLight float64
	DurationMS              int64
}

// KFC_PALADIN_BLESSING_OF_LIGHT_VALUES

type KFCPaladinBlessingOfLightAssignment struct {
	RaidIndex int32 `json:"raidIndex"`
	SpellID   int32 `json:"spellId"`
}

type KFCPaladinBlessingOfLightPolicy struct {
	Schema          string                                `json:"schema"`
	Scaling         string                                `json:"scaling"`
	MultiplierOrder string                                `json:"multiplierOrder"`
	Assignments     []KFCPaladinBlessingOfLightAssignment `json:"assignments"`
}

type kfcPaladinBlessingOfLightState struct {
	policy KFCPaladinBlessingOfLightPolicy
	byUnit map[int32]kfcPaladinBlessingOfLightRank
}

func (holy *HolyPaladin) ConfigureKFCPaladinBlessingOfLight(policy KFCPaladinBlessingOfLightPolicy) error {
	if policy.Schema != "kfc-paladin-blessing-of-light-policy.v1" ||
		(policy.Scaling != "full-tooltip-reference" && policy.Scaling != "coefficient-factor") ||
		(policy.MultiplierOrder != "before-healing-light" && policy.MultiplierOrder != "after-healing-light") ||
		len(policy.Assignments) == 0 || len(policy.Assignments) > 40 {
		return fmt.Errorf("invalid Blessing of Light sensitivity policy")
	}
	if holy.KFCBlessingOfLight != nil || holy.Hardcast.Expires > 0 || holy.GCD.ReadyAt() > 0 {
		return fmt.Errorf("Blessing of Light requires a fresh actor")
	}
	for _, spell := range holy.Spellbook {
		for _, metrics := range spell.SpellMetrics {
			if metrics.Casts > 0 || metrics.Ticks > 0 || metrics.CritTicks > 0 {
				return fmt.Errorf("Blessing of Light cannot change after a cast")
			}
		}
	}
	if policy.Scaling == "coefficient-factor" && holy.KFCRankPolicy == nil {
		return fmt.Errorf("Blessing of Light coefficient sensitivity requires declared rank scaling")
	}
	byUnit := make(map[int32]kfcPaladinBlessingOfLightRank, len(policy.Assignments))
	for _, assignment := range policy.Assignments {
		rank, known := kfcPaladinBlessingOfLightRanks[assignment.SpellID]
		if !known || rank.RequiredLevel > int(holy.Level) {
			return fmt.Errorf("unsupported Blessing of Light rank %d", assignment.SpellID)
		}
		var unit *core.Unit
		for _, party := range holy.Env.Raid.Parties {
			for _, agent := range party.Players {
				if agent.GetCharacter().Index == assignment.RaidIndex {
					unit = &agent.GetCharacter().Unit
				}
			}
		}
		if unit == nil || !unit.HasHealthBar() || holy.IsOpponent(unit) {
			return fmt.Errorf("invalid Blessing of Light player assignment %d", assignment.RaidIndex)
		}
		if _, duplicate := byUnit[unit.UnitIndex]; duplicate {
			return fmt.Errorf("multiple Blessings of Light cannot stack on one target")
		}
		byUnit[unit.UnitIndex] = rank
	}
	policy.Assignments = append([]KFCPaladinBlessingOfLightAssignment(nil), policy.Assignments...)
	holy.KFCBlessingOfLight = &kfcPaladinBlessingOfLightState{policy: policy, byUnit: byUnit}
	return nil
}

func (holy *HolyPaladin) kfcBlessingOfLightBonus(sim *core.Simulation, target *core.Unit, spell *core.Spell) float64 {
	state := holy.KFCBlessingOfLight
	if state == nil || target == nil {
		return 0
	}
	rank, assigned := state.byUnit[target.UnitIndex]
	family, eligible := kfcPaladinBlessingOfLightFamilies[spell.ActionID.SpellID]
	if !assigned || !eligible || sim.CurrentTime >= time.Duration(rank.DurationMS)*time.Millisecond {
		return 0
	}
	bonus := rank.HolyLight
	if family == 1 {
		bonus = rank.FlashOfLight
	}
	if state.policy.Scaling == "coefficient-factor" {
		bonus *= holy.KFCRankPolicy.factors[spell.ActionID.SpellID]
	}
	if state.policy.MultiplierOrder == "after-healing-light" {
		bonus /= kfcPaladinHealingLight[holy.Talents.HealingLight]
	}
	return bonus
}
