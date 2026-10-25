package restoration

import (
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/shaman"
)

type kfcShamanDirectRank struct {
	ID                                          int32
	Rank, RequiredLevel, BaseLevel, MaxLevel    int
	Mana                                        float64
	CastMs, GCDMs                               int
	Base, Variance, PointsPerLevel, Coefficient float64
}

// KFC_SHAMAN_DIRECT_CLIENT_RANKS

func (rank kfcShamanDirectRank) bounds(level int) (float64, float64) {
	level = min(level, rank.MaxLevel)
	growth := float64(max(0, level-max(rank.BaseLevel, rank.RequiredLevel))) * rank.PointsPerLevel
	mean, spread := rank.Base+growth, rank.Base*rank.Variance/2
	return mean - spread, mean + spread
}

// RegisterKFCShamanDirectControls is called only by the isolated component tests.
func RegisterKFCShamanDirectControls() {
	core.RegisterAgentFactory(proto.Player_RestorationShaman{}, proto.Spec_SpecRestorationShaman,
		func(character *core.Character, options *proto.Player) core.Agent {
			if options.TalentsString != "" {
				panic("Shaman direct controls do not admit healing talents")
			}
			return &KFCShamanDirectControls{Shaman: shaman.NewShaman(character, "", 0, 0)}
		}, func(player *proto.Player, spec interface{}) {
			value, ok := spec.(*proto.Player_RestorationShaman)
			if !ok {
				panic("Invalid Restoration Shaman spec")
			}
			player.Spec = value
		})
}

type KFCShamanDirectControls struct {
	*shaman.Shaman
}

func (healer *KFCShamanDirectControls) GetShaman() *shaman.Shaman { return healer.Shaman }

func (healer *KFCShamanDirectControls) Reset(sim *core.Simulation) {
	healer.Shaman.Reset(sim)
}

func (healer *KFCShamanDirectControls) Initialize() {
	if !healer.Env.IsForever() {
		panic("Client-derived Shaman direct controls require Forever rules")
	}
	healer.Shaman.Initialize()
	for _, unit := range healer.Env.Raid.AllUnits {
		if !unit.HasHealthBar() {
			unit.EnableHealthBar()
		}
		if dummy, ok := healer.Env.Raid.GetPlayerFromUnit(unit).(*core.TargetDummy); ok && dummy.MaxHealth() == 0 {
			dummy.AddStats(dummy.GetBaseStats())
		}
	}
	for _, rank := range kfcShamanDirectRanks {
		if rank.RequiredLevel > int(healer.Level) {
			continue
		}
		healer.RegisterSpell(core.SpellConfig{
			ActionID:      core.ActionID{SpellID: rank.ID},
			SpellSchool:   core.SpellSchoolNature,
			DefenseType:   core.DefenseTypeMagic,
			ProcMask:      core.ProcMaskSpellHealing,
			Flags:         core.SpellFlagHelpful | core.SpellFlagAPL,
			RequiredLevel: rank.RequiredLevel,
			Rank:          rank.Rank,
			ManaCost:      core.ManaCostOptions{FlatCost: rank.Mana},
			Cast: core.CastConfig{DefaultCast: core.Cast{
				GCD:      time.Duration(rank.GCDMs) * time.Millisecond,
				CastTime: time.Duration(rank.CastMs) * time.Millisecond,
			}},
			BonusCoefficient: rank.Coefficient,
			DamageMultiplier: 1,
			ThreatMultiplier: 1,
			ExtraCastCondition: func(_ *core.Simulation, target *core.Unit) bool {
				return target != nil && !healer.IsOpponent(target) && target.HasHealthBar() && target.CurrentHealth() > 0
			},
			ApplyEffects: func(sim *core.Simulation, target *core.Unit, spell *core.Spell) {
				low, high := rank.bounds(int(healer.Level))
				spell.CalcAndDealHealing(sim, target, sim.Roll(low, high), spell.OutcomeHealingCrit)
			},
		})
	}
}
