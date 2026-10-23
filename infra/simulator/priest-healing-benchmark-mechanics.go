package priest

import (
	"fmt"
	"time"

	"github.com/wowsims/classic/sim/core"
)

type kfcNovaRank struct {
	Rank                              int
	Damage, Healing                   kfcHealingRank
	Mana, DamageRadius, HealingRadius float64
	GCDMs                             int
}

// KFC_CLIENT_HEALING_BENCHMARK

func (priest *Priest) registerKFCBenchmarkHolyNova() {
	if !priest.Talents.HolyNova {
		return
	}
	for _, rank := range kfcNovaRanks {
		if rank.Damage.RequiredLevel > int(priest.Level) {
			continue
		}
		heal := priest.RegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: rank.Healing.ID}, SpellSchool: core.SpellSchoolHoly,
			DefenseType: core.DefenseTypeMagic, ProcMask: core.ProcMaskSpellHealing,
			Flags:            SpellFlagPriest | core.SpellFlagHelpful | core.SpellFlagPassiveSpell | core.SpellFlagNoOnCastComplete,
			DamageMultiplier: 1, ThreatMultiplier: 0, BonusCoefficient: rank.Healing.Coefficient,
			ApplyEffects: func(sim *core.Simulation, _ *core.Unit, spell *core.Spell) {
				radius := rank.HealingRadius * (1 + kfcHolyReachRadius[priest.Talents.HolyReach]/100)
				for _, agent := range priest.Env.Raid.GetPlayerParty(&priest.Unit).PlayersAndPets {
					target := &agent.GetCharacter().Unit
					if !priest.kfcLiveFriendly(target) || !priest.kfcFriendlyInRange(&priest.Unit, target, radius) {
						continue
					}
					low, high := rank.Healing.amountBounds(int(priest.Level))
					spell.CalcAndDealHealing(sim, target, sim.Roll(low, high), priest.kfcHealingOutcome(spell))
				}
			},
		})
		spell := priest.RegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: rank.Damage.ID}, SpellCode: SpellCode_PriestHolyNova,
			SpellSchool: core.SpellSchoolHoly, DefenseType: core.DefenseTypeMagic, ProcMask: core.ProcMaskSpellDamage,
			Flags: SpellFlagPriest | core.SpellFlagAPL, RequiredLevel: rank.Damage.RequiredLevel, Rank: rank.Rank,
			ManaCost: core.ManaCostOptions{FlatCost: rank.Mana}, Cast: core.CastConfig{DefaultCast: core.Cast{GCD: time.Duration(rank.GCDMs) * time.Millisecond}},
			DamageMultiplier: 1, ThreatMultiplier: 0, BonusCoefficient: rank.Damage.Coefficient,
			ExtraCastCondition: func(_ *core.Simulation, _ *core.Unit) bool {
				return len(priest.KFCPositions) == len(priest.Env.Raid.AllUnits)
			},
			ApplyEffects: func(sim *core.Simulation, _ *core.Unit, spell *core.Spell) {
				radius := rank.DamageRadius * (1 + kfcHolyReachRadius[priest.Talents.HolyReach]/100)
				if priest.DistanceFromTarget <= radius {
					for _, target := range sim.Encounter.TargetUnits {
						low, high := rank.Damage.amountBounds(int(priest.Level))
						spell.CalcAndDealDamage(sim, target, sim.Roll(low, high), spell.OutcomeMagicHitAndCrit)
					}
				}
				heal.Cast(sim, &priest.Unit)
			},
		})
		if len(priest.KFCNova) <= rank.Rank {
			priest.KFCNova = append(priest.KFCNova, make([]*core.Spell, rank.Rank+1-len(priest.KFCNova))...)
		}
		priest.KFCNova[rank.Rank] = spell
		priest.HolyNova = spell
	}
}

func (priest *Priest) kfcChangeNovaCosts(delta int32) {
	if priest.KFCHealingMode {
		for _, spell := range priest.KFCNova {
			if spell != nil {
				spell.Cost.Multiplier += delta
			}
		}
	} else if priest.HolyNova != nil {
		priest.HolyNova.Cost.Multiplier += delta
	}
}

func kfcFocusAffects(spell *core.Spell, mask [4]uint32) bool {
	class, ok := kfcPriestSpellMasks[spell.ActionID.SpellID]
	return ok && spell.Flags.Matches(SpellFlagPriest) && kfcHealingMaskMatches(class, mask)
}

func (priest *Priest) registerKFCHealingInnerFocus() {
	if !priest.Talents.InnerFocus {
		return
	}
	bonus := float64(kfcFocusCrit) * core.CritRatingPerCritChance
	priest.KFCFocusChannelAura = priest.RegisterAura(core.Aura{Label: "Inner Focus healing channel", Duration: core.NeverExpires,
		OnGain: func(_ *core.Aura, _ *core.Simulation) {
			if priest.KFCFocusChannelChild != nil {
				priest.KFCFocusChannelChild.BonusCritRating += bonus
			}
		},
		OnExpire: func(_ *core.Aura, _ *core.Simulation) {
			if priest.KFCFocusChannelChild != nil {
				priest.KFCFocusChannelChild.BonusCritRating -= bonus
			}
			priest.KFCFocusChannelChild = nil
		},
	})
	priest.InnerFocusAura = priest.RegisterAura(core.Aura{Label: "Inner Focus", ActionID: core.ActionID{SpellID: 14751}, Duration: core.NeverExpires,
		OnGain: func(_ *core.Aura, _ *core.Simulation) {
			for _, spell := range priest.Spellbook {
				if spell.Cost != nil && kfcFocusAffects(spell, kfcFocusFreeMask) {
					spell.Cost.Multiplier += kfcFocusFree
				}
				if kfcFocusAffects(spell, kfcFocusCritMask) {
					spell.BonusCritRating += bonus
				}
			}
		},
		OnExpire: func(_ *core.Aura, _ *core.Simulation) {
			for _, spell := range priest.Spellbook {
				if spell.Cost != nil && kfcFocusAffects(spell, kfcFocusFreeMask) {
					spell.Cost.Multiplier -= kfcFocusFree
				}
				if kfcFocusAffects(spell, kfcFocusCritMask) {
					spell.BonusCritRating -= bonus
				}
			}
		},
		OnCastComplete: func(aura *core.Aura, sim *core.Simulation, spell *core.Spell) {
			if spell.Flags.Matches(core.SpellFlagPassiveSpell) || !kfcFocusAffects(spell, kfcFocusFreeMask) {
				return
			}
			childID := kfcPenanceHealingChildren[spell.ActionID.SpellID]
			aura.Deactivate(sim)
			if childID != 0 && priest.ChanneledDot != nil {
				priest.KFCFocusChannelChild = priest.GetSpell(core.ActionID{SpellID: childID})
				priest.KFCFocusChannelAura.Activate(sim)
			}
			priest.InnerFocus.CD.Use(sim)
			priest.UpdateMajorCooldowns()
		},
	})
	priest.InnerFocus = priest.RegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: 14751}, Flags: core.SpellFlagAPL | core.SpellFlagNoOnCastComplete,
		Cast:               core.CastConfig{CD: core.Cooldown{Timer: priest.NewTimer(), Duration: time.Duration(kfcFocusCooldownMs) * time.Millisecond}},
		ExtraCastCondition: func(_ *core.Simulation, _ *core.Unit) bool { return !priest.InnerFocusAura.IsActive() },
		ApplyEffects:       func(sim *core.Simulation, _ *core.Unit, _ *core.Spell) { priest.InnerFocusAura.Activate(sim) },
	})
	priest.AddMajorCooldown(core.MajorCooldown{Spell: priest.InnerFocus, Type: core.CooldownTypeDPS})
	priest.Env.RegisterPreFinalizeEffect(func() {
		for parent := range kfcPenanceHealingChildren {
			spell := priest.GetSpell(core.ActionID{SpellID: parent})
			if spell == nil {
				continue
			}
			for _, target := range priest.Env.Raid.AllUnits {
				hot := spell.Hot(target)
				if hot != nil {
					hot.Aura.ApplyOnExpire(func(_ *core.Aura, sim *core.Simulation) { priest.KFCFocusChannelAura.Deactivate(sim) })
				}
			}
		}
	})
}

// RegisterKFCHealingDamageTracking installs one health receiver before healing damage procs.
func (priest *Priest) RegisterKFCHealingDamageTracking() {
	for _, unit := range priest.Env.Raid.AllUnits {
		if unit.GetAura(core.ChanceOfDeathAuraLabel) != nil || unit.GetAura("Healing workload health receiver") != nil {
			continue
		}
		receive := func(_ *core.Aura, sim *core.Simulation, _ *core.Spell, result *core.SpellResult) {
			if result.Damage <= 0 || unit.CurrentHealth() <= 0 {
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

func (priest *Priest) KFCHealingSpellReady(id int32, sim *core.Simulation, target *core.Unit) (*core.Spell, error) {
	spell := priest.GetSpell(core.ActionID{SpellID: id})
	if spell == nil {
		return nil, fmt.Errorf("unknown healing workload spell %d", id)
	}
	if !spell.ProcMask.Matches(core.ProcMaskSpellHealing) && spell.SpellCode != SpellCode_PriestHolyNova {
		return nil, fmt.Errorf("workload spell %d is not an active healing spell", id)
	}
	if spell.Flags.Matches(core.SpellFlagPassiveSpell) || !spell.Flags.Matches(core.SpellFlagAPL) {
		return nil, fmt.Errorf("workload spell %d is not a selectable healing cast", id)
	}
	if !spell.CanCast(sim, target) {
		return nil, nil
	}
	return spell, nil
}
