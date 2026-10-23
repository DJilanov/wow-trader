package priest

import (
	"fmt"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/stats"
)

type kfcHealingTalentModifier struct {
	Talent                 string
	Index, Aura, Operation int
	Mask                   [4]uint32
	Values                 []float64
}

type kfcHealingSpellMetadata struct {
	Family string
	Mask   [4]uint32
}

// KFC_CLIENT_HEALING_TALENTS

func (priest *Priest) kfcHealingTalentPoints(name string) int32 {
	switch name {
	case "ImprovedRenew":
		return priest.Talents.ImprovedRenew
	case "SpiritualHealing":
		return priest.Talents.SpiritualHealing
	case "DivineFury":
		return priest.Talents.DivineFury
	case "ImprovedHealing":
		return priest.Talents.ImprovedHealing
	case "ImprovedPowerWordShield":
		return priest.Talents.ImprovedPowerWordShield
	case "SoulWarding":
		if priest.Talents.SoulWarding {
			return 1
		}
		return 0
	case "RenewedHope":
		return priest.Talents.RenewedHope
	case "DivineAegis":
		return priest.Talents.DivineAegis
	case "Inspiration":
		return priest.Talents.Inspiration
	case "LitanyOfLight":
		return priest.Talents.LitanyOfLight
	case "TwinDisciplines":
		return priest.Talents.TwinDisciplines
	case "HolySpecialization":
		return priest.Talents.HolySpecialization
	case "MentalAgility":
		return priest.Talents.MentalAgility
	default:
		panic("Unknown healing talent: " + name)
	}
}

func (priest *Priest) kfcHealingTalentValue(name string, index int) float64 {
	for _, modifier := range kfcHealingTalentModifiers {
		if modifier.Talent == name && modifier.Index == index {
			points := priest.kfcHealingTalentPoints(name)
			if points < 0 || int(points) >= len(modifier.Values) {
				panic("Invalid healing talent rank: " + name)
			}
			return modifier.Values[points]
		}
	}
	panic("Missing client healing talent effect: " + name)
}

func kfcHealingMaskMatches(left, right [4]uint32) bool {
	for index := range left {
		if left[index]&right[index] != 0 {
			return true
		}
	}
	return false
}

func (priest *Priest) registerKFCHealingTalentEffects() {
	priest.OnSpellRegistered(func(spell *core.Spell) {
		metadata, exists := kfcClientHealingSpells[spell.ActionID.SpellID]
		if !exists || !spell.ProcMask.Matches(core.ProcMaskSpellHealing) {
			return
		}
		for _, modifier := range kfcHealingTalentModifiers {
			if !kfcHealingMaskMatches(modifier.Mask, metadata.Mask) {
				continue
			}
			value := priest.kfcHealingTalentValue(modifier.Talent, modifier.Index)
			switch modifier.Talent {
			case "SpiritualHealing", "ImprovedRenew":
				spell.DamageMultiplierAdditive += value / 100
			case "TwinDisciplines":
				// The existing direct Penance modifier is already installed by ApplyTalents.
				if spell.SpellCode != SpellCode_PriestPenance {
					spell.DamageMultiplierAdditive += value / 100
				}
			case "DivineFury":
				spell.DefaultCast.CastTime = max(0, spell.DefaultCast.CastTime+time.Duration(value)*time.Millisecond)
			case "ImprovedHealing":
				if spell.Cost != nil {
					spell.Cost.Multiplier += int32(value)
				}
			case "ImprovedPowerWordShield":
				spell.DamageMultiplier *= 1 + value/100
			case "SoulWarding":
				if modifier.Operation == 11 {
					spell.CD.Duration = max(0, spell.CD.Duration+time.Duration(value)*time.Millisecond)
				}
				if modifier.Operation == 14 && spell.Cost != nil {
					spell.Cost.Multiplier += int32(value)
				}
			case "HolySpecialization":
				// The old damage-only implementation excludes Penance by spell code.
				if spell.SpellCode == SpellCode_PriestPenance {
					spell.BonusCritRating += value * core.CritRatingPerCritChance
				}
			}
		}
	})
	priest.registerKFCDivineAegis()
	priest.registerKFCRenewedHope()
	priest.registerKFCLitany()
}

func kfcRenewedHopeEligible(spell *core.Spell) bool {
	family := kfcClientHealingSpells[spell.ActionID.SpellID].Family
	return family == "flash-heal" || family == "lesser-heal" || family == "heal" || family == "greater-heal" || family == "binding-heal" || family == "penance"
}

func (priest *Priest) kfcHealingOutcome(spell *core.Spell) core.OutcomeApplier {
	return func(sim *core.Simulation, result *core.SpellResult, table *core.AttackTable) {
		bonus := 0.0
		if priest.Talents.RenewedHope > 0 && kfcRenewedHopeEligible(spell) && priest.WeakenedSouls.Get(result.Target).IsActive() {
			bonus = priest.kfcHealingTalentValue("RenewedHope", 0) * core.CritRatingPerCritChance
		}
		spell.BonusCritRating += bonus
		defer func() { spell.BonusCritRating -= bonus }()
		spell.OutcomeHealingCrit(sim, result, table)
	}
}

func (priest *Priest) registerKFCRenewedHope() {
	if priest.Talents.RenewedHope == 0 {
		return
	}
	change := time.Duration(priest.kfcHealingTalentValue("RenewedHope", 1)) * time.Millisecond
	core.MakePermanent(priest.RegisterAura(core.Aura{Label: "Renewed Hope healing trigger",
		OnHealDealt: func(_ *core.Aura, sim *core.Simulation, spell *core.Spell, result *core.SpellResult) {
			if !kfcRenewedHopeEligible(spell) {
				return
			}
			soul := priest.WeakenedSouls.Get(result.Target)
			if !soul.IsActive() {
				return
			}
			if soul.ExpiresAt()+change <= sim.CurrentTime {
				soul.Deactivate(sim)
			} else {
				soul.UpdateExpires(sim, soul.ExpiresAt()+change)
			}
		}}))
}

func (priest *Priest) registerKFCInspiration() {
	if priest.Talents.Inspiration == 0 {
		return
	}
	points := priest.Talents.Inspiration
	bonus := priest.kfcHealingTalentValue("Inspiration", 0) / 100
	priest.KFCInspiration = priest.NewRaidAuraArray(func(target *core.Unit) *core.Aura {
		label := fmt.Sprintf("Inspiration Armor %d", points)
		if existing := target.GetAura(label); existing != nil {
			return existing
		}
		dependency := target.NewDynamicMultiplyStat(stats.Armor, 1+bonus)
		aura := target.RegisterAura(core.Aura{Label: label, ActionID: core.ActionID{SpellID: 14893}, Duration: time.Duration(kfcInspirationDurationMs) * time.Millisecond})
		aura.NewExclusiveEffect("HealingArmorProc", false, core.ExclusiveEffect{Priority: bonus,
			OnGain:   func(_ *core.ExclusiveEffect, sim *core.Simulation) { target.EnableDynamicStatDep(sim, dependency) },
			OnExpire: func(_ *core.ExclusiveEffect, sim *core.Simulation) { target.DisableDynamicStatDep(sim, dependency) },
		})
		return aura
	})
	core.MakePermanent(priest.RegisterAura(core.Aura{Label: "Inspiration critical healing trigger",
		OnHealDealt: func(_ *core.Aura, sim *core.Simulation, _ *core.Spell, result *core.SpellResult) {
			if result.DidCrit() && result.Damage > 0 {
				priest.KFCInspiration.Get(result.Target).Activate(sim)
			}
		}}))
}

func (priest *Priest) registerKFCDivineAegis() {
	if priest.Talents.DivineAegis == 0 {
		return
	}
	priest.KFCDivineAegis = priest.Character.RegisterSpell(core.SpellConfig{
		ActionID: core.ActionID{SpellID: 431624}, SpellSchool: core.SpellSchoolHoly,
		ProcMask: core.ProcMaskSpellHealing, Flags: core.SpellFlagPassiveSpell | core.SpellFlagHelpful | core.SpellFlagNoOnCastComplete,
		DamageMultiplier: 1, ThreatMultiplier: 1,
		Shield: core.ShieldConfig{Aura: core.Aura{Label: "Divine Aegis", Duration: time.Duration(kfcAegisDurationMs) * time.Millisecond}},
	})
	coefficient := priest.kfcHealingTalentValue("DivineAegis", 0) / 100
	cap := priest.kfcHealingTalentValue("DivineAegis", 1) * float64(priest.Level)
	core.MakePermanent(priest.RegisterAura(core.Aura{Label: "Divine Aegis critical healing trigger",
		OnHealDealt: func(_ *core.Aura, sim *core.Simulation, _ *core.Spell, result *core.SpellResult) {
			if !result.DidCrit() || result.Damage <= 0 {
				return
			}
			shield := priest.KFCDivineAegis.Shield(result.Target)
			scale := shield.Spell.DamageMultiplier * priest.PseudoStats.ShieldDealtMultiplier
			if scale <= 0 {
				return
			}
			capacity := min(cap, shield.RemainingAbsorb()+result.Damage*coefficient*scale)
			shield.Apply(sim, capacity/scale)
		}}))
}

func (priest *Priest) registerKFCLitany() {
	if priest.Talents.LitanyOfLight == 0 {
		return
	}
	coefficient := priest.kfcHealingTalentValue("LitanyOfLight", 0) / 100
	metrics := priest.NewManaMetrics(core.ActionID{SpellID: 1317006})
	priest.KFCLitanyMetrics = metrics
	previous := ""
	priest.RegisterAura(core.Aura{Label: "Litany of Light healing sequence", Duration: core.NeverExpires,
		OnReset: func(aura *core.Aura, sim *core.Simulation) { previous = ""; aura.Activate(sim) },
		OnCastComplete: func(_ *core.Aura, sim *core.Simulation, spell *core.Spell) {
			metadata, exists := kfcClientHealingSpells[spell.ActionID.SpellID]
			if !exists || metadata.Family == "shield" || spell.Cost == nil || spell.Flags.Matches(core.SpellFlagPassiveSpell) || !spell.ProcMask.Matches(core.ProcMaskSpellHealing) {
				return
			}
			if previous != "" && previous != metadata.Family {
				priest.AddMana(sim, spell.Cost.BaseCost*coefficient, metrics)
			}
			previous = metadata.Family
		},
	})
}
