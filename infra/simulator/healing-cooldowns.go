package healing

import (
	"fmt"

	"github.com/wowsims/classic/sim/core"
)

// Policies supplement the existing owned Inner Focus/Power Infusion controls.
// Passive procs and unreviewed offensive/legacy on-use effects are not activated.
type KFCHealingCooldown struct {
	ItemID               int32   `json:"itemId,omitempty"`
	SpellID              int32   `json:"spellId,omitempty"`
	MinimumMissingMana   float64 `json:"minimumMissingMana,omitempty"`
	RequireHealingDemand bool    `json:"requireHealingDemand,omitempty"`
}

func (policy KFCHealingCooldown) actionID() core.ActionID {
	return core.ActionID{ItemID: policy.ItemID, SpellID: policy.SpellID}
}

func (healer *HealingPriest) validateKFCHealingCooldowns(policies []KFCHealingCooldown) error {
	if len(policies) > 16 {
		return fmt.Errorf("too many explicit healing cooldowns")
	}
	seen := map[core.ActionID]bool{}
	for _, policy := range policies {
		if policy.ItemID < 0 || policy.SpellID < 0 || (policy.ItemID > 0) == (policy.SpellID > 0) || !kfcFinite(policy.MinimumMissingMana) || policy.MinimumMissingMana < 0 || policy.MinimumMissingMana > 1000000 {
			return fmt.Errorf("invalid explicit healing cooldown")
		}
		reviewed := policy.SpellID == 15604
		if policy.SpellID == 0 {
			switch policy.ItemID {
			case 3827, 6149, 4381, 12662, 13443, 13444:
				reviewed = true
			}
		}
		if !reviewed {
			return fmt.Errorf("unreviewed healing resource cooldown %v", policy.actionID())
		}
		actionID := policy.actionID()
		if seen[actionID] {
			return fmt.Errorf("duplicate healing cooldown %v", actionID)
		}
		seen[actionID] = true
		if healer.GetInitialMajorCooldown(actionID).Spell == nil {
			return fmt.Errorf("healing cooldown is not equipped or configured: %v", actionID)
		}
	}
	return nil
}

func (healer *HealingPriest) hasKFCHealingDemand(sim *core.Simulation, frame KFCHealingWorkload) bool {
	for _, priority := range frame.Priorities {
		spell := healer.GetSpell(core.ActionID{SpellID: priority.SpellID})
		for _, unit := range sim.Raid.AllUnits {
			missing := unit.MaxHealth() - unit.CurrentHealth()
			if unit.CurrentHealth() <= 0 || missing <= 0 || missing < priority.MinimumMissingHealth || (priority.RaidIndex >= 0 && unit.Index != priority.RaidIndex) {
				continue
			}
			if priority.KeepRenew && spell.Hot(unit).IsActive() {
				continue
			}
			return true
		}
	}
	return false
}

func (healer *HealingPriest) useKFCHealingCooldowns(sim *core.Simulation, frame KFCHealingWorkload) {
	for _, policy := range frame.Cooldowns {
		if healer.CurrentHealth() <= 0 || healer.IsCasting(sim) || healer.IsChanneling(sim) || !healer.GCD.IsReady(sim) {
			return
		}
		if healer.MaxMana()-healer.CurrentMana() < policy.MinimumMissingMana || (policy.RequireHealingDemand && !healer.hasKFCHealingDemand(sim, frame)) {
			continue
		}
		cooldown := healer.GetMajorCooldown(policy.actionID())
		if cooldown != nil && cooldown.TryActivate(sim, &healer.Character) {
			healer.UpdateMajorCooldowns()
		}
	}
}
