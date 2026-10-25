package restoration

import (
	"fmt"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/druid"
)

type kfcDruidHealingPart struct {
	Periodic                                    bool
	Base, Variance, PointsPerLevel, Coefficient float64
	DurationMs, TickMs                          int
}
type kfcDruidHealingRank struct {
	ID                                       int32
	Family                                   string
	Rank, RequiredLevel, BaseLevel, MaxLevel int
	Mana                                     float64
	CastMs, GCDMs                            int
	Parts                                    []kfcDruidHealingPart
}

// KFC_DRUID_CLIENT_RANKS

func (rank kfcDruidHealingRank) bounds(part kfcDruidHealingPart, level int) (float64, float64) {
	if rank.MaxLevel > 0 {
		level = min(level, rank.MaxLevel)
	}
	growth := float64(max(0, level-max(rank.BaseLevel, rank.RequiredLevel))) * part.PointsPerLevel
	mean, spread := part.Base+growth, part.Base*part.Variance/2
	return mean - spread, mean + spread
}

func RegisterRestorationDruid() {
	core.RegisterAgentFactory(proto.Player_RestorationDruid{}, proto.Spec_SpecRestorationDruid,
		func(character *core.Character, options *proto.Player) core.Agent {
			if options.TalentsString != "" {
				panic("Druid baseline controls do not admit unverified healing talents")
			}
			return &RestorationDruid{Druid: druid.New(character, druid.Humanoid, druid.SelfBuffs{}, options.TalentsString)}
		}, func(player *proto.Player, spec interface{}) {
			value, ok := spec.(*proto.Player_RestorationDruid)
			if !ok {
				panic("Invalid Restoration Druid spec")
			}
			player.Spec = value
		})
}

type RestorationDruid struct {
	*druid.Druid
	familySpells map[string][]*core.Spell
}

func (resto *RestorationDruid) GetDruid() *druid.Druid     { return resto.Druid }
func (resto *RestorationDruid) Reset(sim *core.Simulation) { resto.Druid.Reset(sim) }

func (resto *RestorationDruid) Initialize() {
	if !resto.Env.IsForever() {
		panic("Client-derived Druid healing requires Forever rules")
	}
	resto.Druid.Initialize()
	for _, unit := range resto.Env.Raid.AllUnits {
		if !unit.HasHealthBar() {
			unit.EnableHealthBar()
		}
		if dummy, ok := resto.Env.Raid.GetPlayerFromUnit(unit).(*core.TargetDummy); ok && dummy.MaxHealth() == 0 {
			dummy.AddStats(dummy.GetBaseStats())
		}
	}
	resto.familySpells = make(map[string][]*core.Spell)
	for _, rank := range kfcDruidHealingRanks {
		if rank.RequiredLevel > int(resto.Level) {
			continue
		}
		var direct, periodic *kfcDruidHealingPart
		for index := range rank.Parts {
			part := &rank.Parts[index]
			if part.Periodic {
				periodic = part
			} else {
				direct = part
			}
		}
		config := core.SpellConfig{
			ActionID: core.ActionID{SpellID: rank.ID}, SpellSchool: core.SpellSchoolNature,
			DefenseType: core.DefenseTypeMagic, ProcMask: core.ProcMaskSpellHealing,
			Flags: core.SpellFlagHelpful | core.SpellFlagAPL, RequiredLevel: rank.RequiredLevel, Rank: rank.Rank,
			ManaCost:         core.ManaCostOptions{FlatCost: rank.Mana},
			Cast:             core.CastConfig{DefaultCast: core.Cast{GCD: time.Duration(rank.GCDMs) * time.Millisecond, CastTime: time.Duration(rank.CastMs) * time.Millisecond}},
			DamageMultiplier: 1, ThreatMultiplier: 1,
			ExtraCastCondition: func(_ *core.Simulation, target *core.Unit) bool {
				return target != nil && !resto.IsOpponent(target) && target.HasHealthBar() && target.CurrentHealth() > 0
			},
		}
		if direct != nil {
			config.BonusCoefficient = direct.Coefficient
		}
		if periodic != nil {
			part := *periodic
			config.Hot = core.DotConfig{
				Aura:          core.Aura{Label: fmt.Sprintf("Druid healing %d", rank.ID)},
				NumberOfTicks: int32(part.DurationMs / part.TickMs), TickLength: time.Duration(part.TickMs) * time.Millisecond,
				OnSnapshot: func(_ *core.Simulation, target *core.Unit, dot *core.Dot, _ bool) {
					low, _ := rank.bounds(part, int(resto.Level))
					dot.SnapshotBaseDamage = low + part.Coefficient*dot.Spell.HealingPower(target)
					dot.SnapshotAttackerMultiplier = dot.Spell.CasterHealingMultiplier()
				},
				OnTick: func(sim *core.Simulation, target *core.Unit, dot *core.Dot) {
					dot.CalcAndDealPeriodicSnapshotHealing(sim, target, dot.OutcomeTick)
				},
			}
		}
		config.ApplyEffects = func(sim *core.Simulation, target *core.Unit, spell *core.Spell) {
			if direct != nil {
				low, high := rank.bounds(*direct, int(resto.Level))
				spell.CalcAndDealHealing(sim, target, sim.Roll(low, high), spell.OutcomeHealingCrit)
			}
			if periodic != nil {
				for _, other := range resto.familySpells[rank.Family] {
					other.Hot(target).Deactivate(sim)
				}
				spell.Hot(target).Apply(sim)
			}
		}
		spell := resto.RegisterSpell(druid.Humanoid, config).Spell
		resto.familySpells[rank.Family] = append(resto.familySpells[rank.Family], spell)
	}
}
