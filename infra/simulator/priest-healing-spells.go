package priest

import (
	"fmt"
	"time"

	"github.com/wowsims/classic/sim/core"
)

type kfcHealingRank struct {
	ID                                                int32
	Family                                            string
	Rank, RequiredLevel, BaseLevel, MaxLevel          int
	Base, Variance, PointsPerLevel, Coefficient, Mana float64
	CastMs, GCDMs, CooldownMs, DurationMs, TickMs     int
}

// KFC_CLIENT_HEALING_RANKS

func (rank kfcHealingRank) amountBounds(level int) (float64, float64) {
	if rank.MaxLevel > 0 {
		level = min(level, rank.MaxLevel)
	}
	growth := float64(max(0, level-max(rank.BaseLevel, rank.RequiredLevel))) * rank.PointsPerLevel
	mean, spread := rank.Base+growth, rank.Base*rank.Variance/2
	return mean - spread, mean + spread
}

func (priest *Priest) registerKFCBaselineHealing() {
	if !priest.Env.IsForever() {
		panic("The client-derived Priest healing prototype requires the Forever ruleset")
	}
	priest.WeakenedSouls = priest.NewRaidAuraArray(func(target *core.Unit) *core.Aura {
		return target.GetOrRegisterAura(core.Aura{Label: "Weakened Soul",
			ActionID: core.ActionID{SpellID: 6788}, Duration: time.Duration(kfcWeakenedSoulMs) * time.Millisecond})
	})
	shieldCooldown := priest.NewTimer()
	for _, rank := range kfcHealingRanks {
		if rank.RequiredLevel > int(priest.Level) {
			continue
		}
		var output *[]*core.Spell
		switch rank.Family {
		case "lesser-heal":
			output = &priest.LesserHeal
		case "heal":
			output = &priest.Heal
		case "greater-heal":
			output = &priest.GreaterHeal
		case "flash-heal":
			output = &priest.FlashHeal
		case "renew":
			output = &priest.Renew
		case "shield":
			output = &priest.PowerWordShield
		default:
			panic("Unsupported baseline healing family: " + rank.Family)
		}
		config := core.SpellConfig{
			ActionID: core.ActionID{SpellID: rank.ID}, SpellSchool: core.SpellSchoolHoly,
			DefenseType: core.DefenseTypeMagic, ProcMask: core.ProcMaskSpellHealing,
			Flags:         SpellFlagPriest | core.SpellFlagHelpful | core.SpellFlagAPL,
			RequiredLevel: rank.RequiredLevel, Rank: rank.Rank,
			ManaCost: core.ManaCostOptions{FlatCost: rank.Mana},
			Cast: core.CastConfig{DefaultCast: core.Cast{
				GCD:      time.Duration(rank.GCDMs) * time.Millisecond,
				CastTime: time.Duration(rank.CastMs) * time.Millisecond,
			}},
			DamageMultiplier: 1, ThreatMultiplier: 1,
			ExtraCastCondition: func(_ *core.Simulation, target *core.Unit) bool {
				return target != nil && !priest.IsOpponent(target) && target.HasHealthBar() && target.CurrentHealth() > 0
			},
		}
		switch rank.Family {
		case "shield":
			condition := config.ExtraCastCondition
			config.ExtraCastCondition = func(sim *core.Simulation, target *core.Unit) bool {
				return condition(sim, target) && !priest.WeakenedSouls.Get(target).IsActive()
			}
			config.Cast.CD = core.Cooldown{Timer: shieldCooldown, Duration: time.Duration(rank.CooldownMs) * time.Millisecond}
			config.Shield = core.ShieldConfig{Aura: core.Aura{
				Label: fmt.Sprintf("Power Word Shield %d", rank.ID), Duration: time.Duration(rank.DurationMs) * time.Millisecond}}
			config.ApplyEffects = func(sim *core.Simulation, target *core.Unit, spell *core.Spell) {
				for _, other := range priest.PowerWordShield {
					if other != nil {
						other.Shield(target).Deactivate(sim)
					}
				}
				low, _ := rank.amountBounds(int(priest.Level))
				spell.Shield(target).Apply(sim, low+rank.Coefficient*spell.HealingPower(target))
				priest.WeakenedSouls.Get(target).Activate(sim)
			}
		case "renew":
			config.Hot = core.DotConfig{
				Aura:          core.Aura{Label: fmt.Sprintf("Renew %d", rank.ID)},
				NumberOfTicks: int32(rank.DurationMs / rank.TickMs), TickLength: time.Duration(rank.TickMs) * time.Millisecond,
				OnSnapshot: func(_ *core.Simulation, target *core.Unit, dot *core.Dot, _ bool) {
					low, _ := rank.amountBounds(int(priest.Level))
					dot.SnapshotBaseDamage = low + rank.Coefficient*dot.Spell.HealingPower(target)
					dot.SnapshotAttackerMultiplier = dot.Spell.CasterHealingMultiplier()
				},
				OnTick: func(sim *core.Simulation, target *core.Unit, dot *core.Dot) {
					dot.CalcAndDealPeriodicSnapshotHealing(sim, target, dot.OutcomeTick)
				},
			}
			config.ApplyEffects = func(sim *core.Simulation, target *core.Unit, spell *core.Spell) {
				for _, other := range priest.Renew {
					if other != nil {
						other.Hot(target).Deactivate(sim)
					}
				}
				spell.Hot(target).Apply(sim)
			}
		default:
			config.BonusCoefficient = rank.Coefficient
			switch rank.Family {
			case "lesser-heal", "heal":
				config.SpellCode = SpellCode_PriestHeal
			case "greater-heal":
				config.SpellCode = SpellCode_PriestGreaterHeal
			case "flash-heal":
				config.SpellCode = SpellCode_PriestFlashHeal
			}
			config.ApplyEffects = func(sim *core.Simulation, target *core.Unit, spell *core.Spell) {
				low, high := rank.amountBounds(int(priest.Level))
				spell.CalcAndDealHealing(sim, target, sim.Roll(low, high), spell.OutcomeHealingCrit)
			}
		}
		if len(*output) <= rank.Rank {
			*output = append(*output, make([]*core.Spell, rank.Rank+1-len(*output))...)
		}
		(*output)[rank.Rank] = priest.RegisterSpell(config)
	}
}
