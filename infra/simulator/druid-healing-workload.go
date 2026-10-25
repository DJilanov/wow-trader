package restoration

import (
	"fmt"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
)

func (healer *RestorationDruid) registerKFCDruidDamageTracking() {
	for _, unit := range healer.Env.Raid.AllUnits {
		if unit.GetAura(core.ChanceOfDeathAuraLabel) != nil || unit.GetAura("Healing workload health receiver") != nil {
			continue
		}
		receive := func(_ *core.Aura, sim *core.Simulation, _ *core.Spell, result *core.SpellResult) {
			if result.Damage <= 0 || unit.CurrentHealth() <= 0 || !unit.IsEnabled() {
				return
			}
			unit.RemoveHealth(sim, result.Damage)
			if unit.CurrentHealth() <= 0 {
				unit.Metrics.Died = true
				unit.InterruptCast(sim)
			}
		}
		core.MakePermanent(unit.RegisterAura(core.Aura{Label: "Healing workload health receiver", OnSpellHitTaken: receive, OnPeriodicDamageTaken: receive}))
	}
}

func (healer *RestorationDruid) kfcDruidWorkloadSpell(id int32) (*core.Spell, error) {
	family := kfcDruidFamilies[id]
	spell := healer.GetSpell(core.ActionID{SpellID: id})
	if family == "" || spell == nil || id == 25297 || id == 25299 {
		return nil, fmt.Errorf("Druid spell %d is unavailable or outside the pre-raid research domain", id)
	}
	return spell, nil
}

func (healer *RestorationDruid) validateKFCDruidWorkloadPolicies(player *proto.Player, frame KFCDruidHealingWorkload, raid *proto.Raid) error {
	if !kfcFinite(frame.NaturesSwiftnessMinimumMissingHealth) || frame.NaturesSwiftnessMinimumMissingHealth < 0 || frame.NaturesSwiftnessMinimumMissingHealth > 1000000 {
		return fmt.Errorf("invalid Nature's Swiftness healing threshold")
	}
	if frame.UseNaturesSwiftness && healer.GetSpell(core.ActionID{SpellID: 17116}) == nil {
		return fmt.Errorf("requested Nature's Swiftness is not owned")
	}
	if frame.InnervateMinimumMissingMana != nil {
		threshold := *frame.InnervateMinimumMissingMana
		if !kfcFinite(threshold) || threshold < 0 || threshold > 1000000 || healer.GetSpell(core.ActionID{SpellID: 29166}) == nil {
			return fmt.Errorf("invalid owned Innervate policy")
		}
	}
	if player.Buffs != nil && (player.Buffs.Innervates != 0 || player.Buffs.PowerInfusions != 0) {
		return fmt.Errorf("external mana cooldowns need separate declared admission")
	}
	for _, party := range raid.Parties {
		if party.Buffs != nil && party.Buffs.ManaTideTotems != 0 {
			return fmt.Errorf("external Mana Tide needs separate declared admission")
		}
	}
	if options := player.GetRestorationDruid().GetOptions(); options != nil && options.InnervateTarget != nil {
		return fmt.Errorf("declare owned Innervate through the workload policy")
	}
	return nil
}

func (healer *RestorationDruid) kfcDruidPriorityTarget(sim *core.Simulation, priority KFCDruidHealingPriority) *core.Unit {
	spell := healer.GetSpell(core.ActionID{SpellID: priority.SpellID})
	if kfcDruidFamilies[priority.SpellID] == "tranquility" {
		if priority.RaidIndex >= 0 && priority.RaidIndex != healer.Index {
			return nil
		}
		missing := 0.0
		for _, agent := range healer.Party.PlayersAndPets {
			unit := &agent.GetCharacter().Unit
			if healer.kfcLiveFriendly(unit) && healer.kfcInRange(&healer.Unit, unit, 20) {
				missing += unit.MaxHealth() - unit.CurrentHealth()
			}
		}
		if missing > 0 && missing >= priority.MinimumMissingHealth {
			return &healer.Unit
		}
		return nil
	}
	var target *core.Unit
	for _, unit := range healer.Env.Raid.AllUnits {
		missing := unit.MaxHealth() - unit.CurrentHealth()
		if !healer.kfcLiveFriendly(unit) || missing <= 0 || missing < priority.MinimumMissingHealth || (priority.RaidIndex >= 0 && unit.Index != priority.RaidIndex) {
			continue
		}
		if spell.ExtraCastCondition != nil && !spell.ExtraCastCondition(sim, unit) {
			continue
		}
		if priority.KeepHot && spell.Hot(unit).IsActive() {
			continue
		}
		if target == nil || unit.CurrentHealthPercent() < target.CurrentHealthPercent() || (unit.CurrentHealthPercent() == target.CurrentHealthPercent() && unit.Index < target.Index) {
			target = unit
		}
	}
	return target
}

func (healer *RestorationDruid) useKFCDruidInnervate(sim *core.Simulation, frame KFCDruidHealingWorkload) bool {
	if frame.InnervateMinimumMissingMana == nil || healer.MaxMana()-healer.CurrentMana() < *frame.InnervateMinimumMissingMana || (frame.InnervateRequireHealingDemand && !healer.hasKFCDruidHealingDemand(sim, frame)) {
		return false
	}
	spell := healer.GetSpell(core.ActionID{SpellID: 29166})
	return spell.CanCast(sim, &healer.Unit) && spell.Cast(sim, &healer.Unit)
}

func (healer *RestorationDruid) useKFCDruidSwiftness(sim *core.Simulation, frame KFCDruidHealingWorkload, spell *core.Spell, target *core.Unit) {
	family := kfcDruidFamilies[spell.ActionID.SpellID]
	if !frame.UseNaturesSwiftness || (family != "healing-touch" && family != "regrowth") || target.MaxHealth()-target.CurrentHealth() < frame.NaturesSwiftnessMinimumMissingHealth {
		return
	}
	instant := healer.GetSpell(core.ActionID{SpellID: 17116})
	if instant.CanCast(sim, &healer.Unit) {
		instant.Cast(sim, &healer.Unit)
	}
}
