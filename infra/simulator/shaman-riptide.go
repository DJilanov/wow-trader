package restoration

import (
	"fmt"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/shaman"
)

type kfcShamanRiptideRank struct {
	ID                                                                   int32
	Rank, RequiredLevel, BaseLevel, MaxLevel                             int
	Mana, DirectBase, DirectGrowth, DirectCoefficient, DirectVariance    float64
	PeriodicBase, PeriodicGrowth, PeriodicCoefficient, ChainBonusPercent float64
	GCDMs, TickMs, DurationMs, CooldownMs                                int
}

// KFC_SHAMAN_RIPTIDE_VALUES

type KFCShamanRiptidePolicy struct {
	HotPower, HotCriticals, HotCadence, ChainBonus string
	ConsumeHot                                     bool
}

type kfcShamanRiptideState struct {
	generation uint64
	aura       *core.Aura
	rankID     int32
	expires    time.Duration
}

type kfcShamanRiptideController struct {
	configured bool
	policy     KFCShamanRiptidePolicy
	spells     map[int32]*core.Spell
	pulses     map[int32]*core.Spell
	auras      map[int32]map[int32]*core.Aura
	targets    map[int32]*kfcShamanRiptideState
}

func (rank kfcShamanRiptideRank) amounts(level int) (float64, float64, float64) {
	if rank.MaxLevel > 0 {
		level = min(level, rank.MaxLevel)
	}
	gap := float64(max(0, level-max(rank.BaseLevel, rank.RequiredLevel)))
	mean := rank.DirectBase + gap*rank.DirectGrowth
	spread := rank.DirectBase * rank.DirectVariance / 2
	return mean - spread, mean + spread, rank.PeriodicBase + gap*rank.PeriodicGrowth
}

func (resto *RestorationShaman) ConfigureKFCShamanRiptidePolicy(sim *core.Simulation, policy KFCShamanRiptidePolicy) error {
	controller := resto.kfcRiptide
	if sim == nil || sim.CurrentTime != 0 || resto.positions == nil || controller == nil || controller.configured || resto.GCD.ReadyAt() > 0 || resto.Hardcast.Expires > 0 {
		return fmt.Errorf("Riptide policy requires a fresh positioned Shaman")
	}
	if (policy.HotPower != "snapshot-reference" && policy.HotPower != "dynamic-reference") || (policy.HotCriticals != "noncritical-reference" && policy.HotCriticals != "critical-reference") || (policy.HotCadence != "source-fixed-reference" && policy.HotCadence != "cast-speed-five-tick-reference") || (policy.ChainBonus != "all-bounces-reference" && policy.ChainBonus != "primary-only-reference") {
		return fmt.Errorf("unreviewed Riptide reference")
	}
	for _, spell := range resto.Spellbook {
		for _, metric := range spell.SpellMetrics {
			if metric.Casts > 0 || metric.Ticks > 0 || metric.CritTicks > 0 {
				return fmt.Errorf("Riptide policy cannot change after casting")
			}
		}
	}
	controller.policy = policy
	controller.configured = true
	return nil
}

func (resto *RestorationShaman) resetKFCShamanRiptide() {
	if resto.kfcRiptide == nil {
		return
	}
	for _, state := range resto.kfcRiptide.targets {
		state.generation++
		state.aura = nil
		state.rankID = 0
		state.expires = 0
	}
}

func (resto *RestorationShaman) cancelKFCRiptide(sim *core.Simulation, state *kfcShamanRiptideState) {
	state.generation++
	if state.aura != nil {
		state.aura.Deactivate(sim)
	}
	state.aura = nil
	state.rankID = 0
	state.expires = 0
}

func (resto *RestorationShaman) prepareKFCRiptideChain(sim *core.Simulation, target *core.Unit) (float64, bool) {
	controller := resto.kfcRiptide
	if controller == nil || !controller.configured || target == nil {
		return 1, false
	}
	state := controller.targets[target.UnitIndex]
	if state == nil || state.aura == nil || !state.aura.IsActive() || sim.CurrentTime >= state.expires {
		return 1, false
	}
	bonus := 1.0
	for _, rank := range kfcShamanRiptideRanks {
		if rank.ID == state.rankID {
			bonus += rank.ChainBonusPercent / 100
		}
	}
	all := controller.policy.ChainBonus == "all-bounces-reference"
	if controller.policy.ConsumeHot {
		resto.cancelKFCRiptide(sim, state)
	}
	return bonus, all
}

func (resto *RestorationShaman) applyKFCRiptideHot(sim *core.Simulation, target *core.Unit, rank kfcShamanRiptideRank) {
	controller := resto.kfcRiptide
	state := controller.targets[target.UnitIndex]
	resto.cancelKFCRiptide(sim, state)
	pulse := controller.pulses[rank.ID]
	_, _, base := rank.amounts(int(resto.Level))
	snapshotBase := base + rank.PeriodicCoefficient*pulse.HealingPower(target)
	snapshotMultiplier := pulse.CasterHealingMultiplier()
	snapshotCrit := pulse.HealingCritChance()
	period := time.Duration(rank.TickMs) * time.Millisecond
	if controller.policy.HotCadence == "cast-speed-five-tick-reference" {
		period = resto.ApplyCastSpeed(period)
	}
	if period <= 0 {
		panic("Invalid Riptide tick period")
	}
	state.rankID = rank.ID
	state.expires = sim.CurrentTime + period*5
	state.aura = controller.auras[rank.ID][target.UnitIndex]
	state.aura.Duration = period * 5
	state.aura.Activate(sim)
	generation := state.generation
	var tick func(*core.Simulation, int)
	tick = func(sim *core.Simulation, index int) {
		if state.generation != generation {
			return
		}
		if target.CurrentHealth() <= 0 {
			resto.cancelKFCRiptide(sim, state)
			return
		}
		if sim.CurrentTime > state.expires || (!state.aura.IsActive() && sim.CurrentTime < state.expires) {
			return
		}
		amount, multiplier, chance := snapshotBase, snapshotMultiplier, snapshotCrit
		if controller.policy.HotPower == "dynamic-reference" {
			amount = base + rank.PeriodicCoefficient*pulse.HealingPower(target)
			multiplier = pulse.CasterHealingMultiplier()
			chance = pulse.HealingCritChance()
		}
		outcome := func(sim *core.Simulation, result *core.SpellResult, table *core.AttackTable) {
			if controller.policy.HotCriticals == "critical-reference" && sim.RandomFloat("Shaman Riptide periodic critical") < chance {
				result.Outcome = core.OutcomeCrit
				result.Damage *= pulse.CritMultiplier(table)
				pulse.SpellMetrics[target.UnitIndex].CritTicks++
			} else {
				result.Outcome = core.OutcomeHit
				pulse.SpellMetrics[target.UnitIndex].Ticks++
			}
		}
		result := pulse.CalcKFCShamanSnapshotPeriodicHealing(sim, target, amount, multiplier, outcome)
		pulse.DealPeriodicHealing(sim, result)
		if index < 5 {
			core.StartDelayedAction(sim, core.DelayedActionOptions{DoAt: sim.CurrentTime + period, Priority: core.ActionPriorityDOT, OnAction: func(sim *core.Simulation) { tick(sim, index+1) }})
		}
	}
	core.StartDelayedAction(sim, core.DelayedActionOptions{DoAt: sim.CurrentTime + period, Priority: core.ActionPriorityDOT, OnAction: func(sim *core.Simulation) { tick(sim, 1) }})
}

func (resto *RestorationShaman) registerKFCShamanRiptide() {
	controller := &kfcShamanRiptideController{spells: map[int32]*core.Spell{}, pulses: map[int32]*core.Spell{}, auras: map[int32]map[int32]*core.Aura{}, targets: map[int32]*kfcShamanRiptideState{}}
	resto.kfcRiptide = controller
	for _, unit := range resto.kfcHealingPlayers() {
		controller.targets[unit.UnitIndex] = &kfcShamanRiptideState{}
	}
	if !resto.Talents.Riptide {
		return
	}
	timer := resto.NewTimer()
	for _, rank := range kfcShamanRiptideRanks {
		if rank.RequiredLevel > int(resto.Level) {
			continue
		}
		critical := core.SpellCritRatingPerCritChance * kfcShamanPassiveValue("tidal_mastery", 0, resto.Talents.TidalMastery)
		controller.pulses[rank.ID] = resto.RegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: rank.ID, Tag: 1}, SpellSchool: core.SpellSchoolNature, DefenseType: core.DefenseTypeMagic, ProcMask: core.ProcMaskSpellHealing, Flags: core.SpellFlagHelpful | core.SpellFlagNoOnCastComplete | shaman.SpellFlagShaman, BonusCritRating: critical, DamageMultiplier: 1, DamageMultiplierAdditive: 1 + kfcShamanPassiveValue("purification", 1, resto.Talents.Purification)/100, ThreatMultiplier: 1})
		controller.auras[rank.ID] = map[int32]*core.Aura{}
		for _, unit := range resto.kfcHealingPlayers() {
			controller.auras[rank.ID][unit.UnitIndex] = unit.RegisterAura(core.Aura{Label: fmt.Sprintf("KFC Riptide %d from %d", rank.ID, resto.UnitIndex), ActionID: core.ActionID{SpellID: rank.ID}, Duration: time.Duration(rank.DurationMs) * time.Millisecond})
		}
		controller.spells[rank.ID] = resto.RegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: rank.ID}, SpellSchool: core.SpellSchoolNature, DefenseType: core.DefenseTypeMagic, ProcMask: core.ProcMaskSpellHealing, Flags: core.SpellFlagHelpful | core.SpellFlagAPL | shaman.SpellFlagShaman, RequiredLevel: rank.RequiredLevel, Rank: rank.Rank, ManaCost: core.ManaCostOptions{FlatCost: rank.Mana, Multiplier: 100 + int32(kfcShamanPassiveValue("tidal_focus", 0, resto.Talents.TidalFocus))}, Cast: core.CastConfig{DefaultCast: core.Cast{GCD: time.Duration(rank.GCDMs) * time.Millisecond}, CD: core.Cooldown{Timer: timer, Duration: time.Duration(rank.CooldownMs) * time.Millisecond}}, BonusCoefficient: rank.DirectCoefficient, BonusCritRating: critical, DamageMultiplier: 1, DamageMultiplierAdditive: 1 + kfcShamanPassiveValue("purification", 0, resto.Talents.Purification)/100, ThreatMultiplier: 1, ExtraCastCondition: func(_ *core.Simulation, target *core.Unit) bool {
			return controller.configured && resto.CurrentHealth() > 0 && resto.kfcValidHealingTarget(target)
		}, ApplyEffects: func(sim *core.Simulation, target *core.Unit, spell *core.Spell) {
			if !resto.kfcValidHealingTarget(target) {
				return
			}
			low, high, _ := rank.amounts(int(resto.Level))
			spell.CalcAndDealHealing(sim, target, sim.Roll(low, high), spell.OutcomeHealingCrit)
			resto.applyKFCRiptideHot(sim, target, rank)
		}})
	}
}
