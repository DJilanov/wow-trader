package restoration

import (
	"fmt"
	"math"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/shaman"
)

type kfcShamanHealingRank struct {
	ID                                                int32
	Family                                            string
	Rank, RequiredLevel, BaseLevel, MaxLevel          int
	Mana, Base, Variance, PointsPerLevel, Coefficient float64
	CastMs, GCDMs, ChainTargets                       int
	ChainAmplitude                                    float64
}

// KFC_SHAMAN_CLIENT_HEALING_RANKS

func (rank kfcShamanHealingRank) bounds(level int) (float64, float64) {
	if rank.MaxLevel > 0 {
		level = min(level, rank.MaxLevel)
	}
	mean := rank.Base + float64(max(0, level-max(rank.BaseLevel, rank.RequiredLevel)))*rank.PointsPerLevel
	spread := rank.Base * rank.Variance / 2
	return mean - spread, mean + spread
}

type KFCShamanFriendlyPosition struct{ X, Y float64 }

type RestorationShaman struct {
	*shaman.Shaman
	positions    map[int32]KFCShamanFriendlyPosition
	bounceRange  float64
	chainRouting string
}

func RegisterRestorationShaman() {
	core.RegisterAgentFactory(proto.Player_RestorationShaman{}, proto.Spec_SpecRestorationShaman,
		func(character *core.Character, player *proto.Player) core.Agent {
			if player.TalentsString != "" {
				panic("Shaman basic controls do not admit unverified talents")
			}
			return &RestorationShaman{Shaman: shaman.NewShaman(character, "", proto.ShamanWeaponImbue(0), proto.ShamanWeaponImbue(0))}
		}, func(player *proto.Player, spec interface{}) {
			value, ok := spec.(*proto.Player_RestorationShaman)
			if !ok {
				panic("Invalid Restoration Shaman spec")
			}
			player.Spec = value
		})
}

func (resto *RestorationShaman) Reset(sim *core.Simulation) { resto.Shaman.Reset(sim) }
func (resto *RestorationShaman) GetShaman() *shaman.Shaman  { return resto.Shaman }

func (resto *RestorationShaman) kfcHealingPlayers() []*core.Unit {
	units := []*core.Unit{}
	for _, party := range resto.Env.Raid.Parties {
		for _, agent := range party.Players {
			units = append(units, &agent.GetCharacter().Unit)
		}
	}
	return units
}

func (resto *RestorationShaman) ConfigureKFCShamanHealingPositions(sim *core.Simulation, positions map[int32]KFCShamanFriendlyPosition, bounceRange float64, routing string) error {
	if sim == nil || sim.CurrentTime != 0 || resto.positions != nil || resto.GCD.ReadyAt() > 0 || resto.Hardcast.Expires > 0 {
		return fmt.Errorf("Shaman geometry requires a fresh healer")
	}
	for _, spell := range resto.Spellbook {
		for _, metric := range spell.SpellMetrics {
			if metric.Casts > 0 || metric.Ticks > 0 || metric.CritTicks > 0 {
				return fmt.Errorf("Shaman geometry cannot change after casting")
			}
		}
	}
	if (bounceRange != 10 && bounceRange != 12.5 && bounceRange != 15) || (routing != "nearest-injured-reference" && routing != "largest-deficit-reference") {
		return fmt.Errorf("unreviewed Shaman chain-routing reference")
	}
	units := resto.kfcHealingPlayers()
	if len(positions) != len(units) {
		return fmt.Errorf("Shaman positions require exactly the player roster")
	}
	copy := map[int32]KFCShamanFriendlyPosition{}
	for _, unit := range units {
		position, ok := positions[unit.UnitIndex]
		if !ok || math.IsNaN(position.X) || math.IsNaN(position.Y) || math.IsInf(position.X, 0) || math.IsInf(position.Y, 0) || math.Abs(position.X) > 1000000 || math.Abs(position.Y) > 1000000 {
			return fmt.Errorf("invalid Shaman player position")
		}
		copy[unit.UnitIndex] = position
	}
	resto.positions, resto.bounceRange, resto.chainRouting = copy, bounceRange, routing
	return nil
}

func (resto *RestorationShaman) kfcValidHealingTarget(target *core.Unit) bool {
	if target == nil || resto.positions == nil || resto.IsOpponent(target) || !target.HasHealthBar() || target.CurrentHealth() <= 0 {
		return false
	}
	position, targetKnown := resto.positions[target.UnitIndex]
	caster, casterKnown := resto.positions[resto.UnitIndex]
	return targetKnown && casterKnown && math.Hypot(position.X-caster.X, position.Y-caster.Y) <= 40
}

func (resto *RestorationShaman) kfcChainTarget(previous *core.Unit, used map[int32]bool) *core.Unit {
	origin := resto.positions[previous.UnitIndex]
	var selected *core.Unit
	bestDistance, bestDeficit := math.Inf(1), -1.0
	for _, candidate := range resto.kfcHealingPlayers() {
		position, known := resto.positions[candidate.UnitIndex]
		deficit := max(0, candidate.MaxHealth()-candidate.CurrentHealth())
		if !known || used[candidate.UnitIndex] || candidate.CurrentHealth() <= 0 || deficit <= 0 {
			continue
		}
		distance := math.Hypot(position.X-origin.X, position.Y-origin.Y)
		if distance > resto.bounceRange {
			continue
		}
		better := distance < bestDistance || distance == bestDistance && (selected == nil || candidate.UnitIndex < selected.UnitIndex)
		if resto.chainRouting == "largest-deficit-reference" {
			better = deficit > bestDeficit || deficit == bestDeficit && better
		}
		if selected == nil || better {
			selected, bestDistance, bestDeficit = candidate, distance, deficit
		}
	}
	return selected
}

func (resto *RestorationShaman) Initialize() {
	if !resto.Env.IsForever() {
		panic("Current Shaman healing requires Forever rules")
	}
	resto.Shaman.Initialize()
	for _, unit := range resto.kfcHealingPlayers() {
		if !unit.HasHealthBar() {
			unit.EnableHealthBar()
		}
		if dummy, ok := resto.Env.Raid.GetPlayerFromUnit(unit).(*core.TargetDummy); ok && dummy.MaxHealth() == 0 {
			dummy.AddStats(dummy.GetBaseStats())
		}
	}
	for _, rank := range kfcShamanHealingRanks {
		if rank.RequiredLevel > int(resto.Level) {
			continue
		}
		resto.RegisterSpell(core.SpellConfig{
			ActionID: core.ActionID{SpellID: rank.ID}, SpellSchool: core.SpellSchoolNature, DefenseType: core.DefenseTypeMagic,
			ProcMask: core.ProcMaskSpellHealing, Flags: core.SpellFlagHelpful | core.SpellFlagAPL | shaman.SpellFlagShaman,
			RequiredLevel: rank.RequiredLevel, Rank: rank.Rank,
			ManaCost:         core.ManaCostOptions{FlatCost: rank.Mana},
			Cast:             core.CastConfig{DefaultCast: core.Cast{GCD: time.Duration(rank.GCDMs) * time.Millisecond, CastTime: time.Duration(rank.CastMs) * time.Millisecond}},
			BonusCoefficient: rank.Coefficient, DamageMultiplier: 1, ThreatMultiplier: 1,
			ExtraCastCondition: func(_ *core.Simulation, target *core.Unit) bool { return resto.kfcValidHealingTarget(target) },
			ApplyEffects: func(sim *core.Simulation, target *core.Unit, spell *core.Spell) {
				if !resto.kfcValidHealingTarget(target) {
					return
				}
				low, high := rank.bounds(int(resto.Level))
				base := sim.Roll(low, high)
				if rank.Family != "chain-heal" {
					spell.CalcAndDealHealing(sim, target, base, spell.OutcomeHealingCrit)
					return
				}
				// Each bounce scales the original noncritical heal; its critical outcome is independent.
				used := map[int32]bool{}
				scale := 1.0
				for hop := 0; target != nil && hop < rank.ChainTargets; hop++ {
					used[target.UnitIndex] = true
					result := spell.CalcHealing(sim, target, base, spell.OutcomeHealingCrit)
					result.Damage *= scale
					result.Threat *= scale
					spell.DealHealing(sim, result)
					scale *= rank.ChainAmplitude
					target = resto.kfcChainTarget(target, used)
				}
			},
		})
	}
}
