package holy

import (
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/paladin"
)

type kfcPaladinHealingRank struct {
	ID                                       int32
	Rank, RequiredLevel, BaseLevel, MaxLevel int
	Mana, Base, Variance                     float64
	PointsPerLevel, Coefficient              float64
	CastMs, GCDMs                            int
}

// KFC_PALADIN_CLIENT_RANKS

func (rank kfcPaladinHealingRank) bounds(level int) (float64, float64) {
	if rank.MaxLevel > 0 {
		level = min(level, rank.MaxLevel)
	}
	growth := float64(max(0, level-max(rank.BaseLevel, rank.RequiredLevel))) * rank.PointsPerLevel
	mean, spread := rank.Base+growth, rank.Base*rank.Variance/2
	return mean - spread, mean + spread
}

func RegisterHolyPaladin() {
	core.RegisterAgentFactory(proto.Player_HolyPaladin{}, proto.Spec_SpecHolyPaladin,
		func(character *core.Character, options *proto.Player) core.Agent {
			if options.TalentsString != "" {
				panic("Paladin baseline controls do not admit unverified healing talents")
			}
			settings := options.GetHolyPaladin().GetOptions()
			if settings == nil {
				settings = &proto.PaladinOptions{}
			}
			return &HolyPaladin{Paladin: paladin.NewPaladin(character, options, settings)}
		}, func(player *proto.Player, spec interface{}) {
			value, ok := spec.(*proto.Player_HolyPaladin)
			if !ok {
				panic("Invalid Holy Paladin spec")
			}
			player.Spec = value
		})
}

type HolyPaladin struct{ *paladin.Paladin }

func (holy *HolyPaladin) GetPaladin() *paladin.Paladin { return holy.Paladin }
func (holy *HolyPaladin) Reset(sim *core.Simulation)   { holy.Paladin.Reset(sim) }

func (holy *HolyPaladin) Initialize() {
	if !holy.Env.IsForever() {
		panic("Client-derived Paladin healing requires Forever rules")
	}
	holy.Paladin.Initialize()
	for _, unit := range holy.Env.Raid.AllUnits {
		if !unit.HasHealthBar() {
			unit.EnableHealthBar()
		}
		if dummy, ok := holy.Env.Raid.GetPlayerFromUnit(unit).(*core.TargetDummy); ok && dummy.MaxHealth() == 0 {
			dummy.AddStats(dummy.GetBaseStats())
		}
	}
	for _, rank := range kfcPaladinHealingRanks {
		if rank.RequiredLevel > int(holy.Level) {
			continue
		}
		holy.RegisterSpell(core.SpellConfig{
			ActionID: core.ActionID{SpellID: rank.ID}, SpellSchool: core.SpellSchoolHoly,
			DefenseType: core.DefenseTypeMagic, ProcMask: core.ProcMaskSpellHealing,
			Flags: core.SpellFlagHelpful | core.SpellFlagAPL, RequiredLevel: rank.RequiredLevel, Rank: rank.Rank,
			ManaCost:         core.ManaCostOptions{FlatCost: rank.Mana},
			Cast:             core.CastConfig{DefaultCast: core.Cast{GCD: time.Duration(rank.GCDMs) * time.Millisecond, CastTime: time.Duration(rank.CastMs) * time.Millisecond}},
			BonusCoefficient: rank.Coefficient, DamageMultiplier: 1, ThreatMultiplier: 1,
			ExtraCastCondition: func(_ *core.Simulation, target *core.Unit) bool {
				return target != nil && !holy.IsOpponent(target) && target.HasHealthBar() && target.CurrentHealth() > 0
			},
			ApplyEffects: func(sim *core.Simulation, target *core.Unit, spell *core.Spell) {
				low, high := rank.bounds(int(holy.Level))
				spell.CalcAndDealHealing(sim, target, sim.Roll(low, high), spell.OutcomeHealingCrit)
			},
		})
	}
}
