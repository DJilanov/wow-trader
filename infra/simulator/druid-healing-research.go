package restoration

import (
	"fmt"
	"math"

	"github.com/wowsims/classic/sim/core"
)

type KFCDruidHealingResearchPolicy struct {
	Schema                  string  `json:"schema"`
	ID                      string  `json:"id"`
	FullScalingGap          int     `json:"fullScalingGap"`
	CoefficientLossPerLevel float64 `json:"coefficientLossPerLevel"`
	ClassProcMode           string  `json:"classProcMode"`
	OmenProcChance          float64 `json:"omenProcChance"`
	OmenEvents              string  `json:"omenEvents"`
	RegrowthPeriodicCrits   bool    `json:"regrowthPeriodicCrits"`
}
type kfcDruidHealingResearchState struct {
	policy  KFCDruidHealingResearchPolicy
	factors map[int32]float64
}

// KFC_DRUID_RESEARCH_RANKS

func (policy KFCDruidHealingResearchPolicy) Validate() error {
	if policy.Schema != "kfc-druid-healing-research.v1" || len(policy.ID) == 0 || len(policy.ID) > 100 || policy.FullScalingGap < 0 || policy.FullScalingGap > 60 ||
		math.IsNaN(policy.CoefficientLossPerLevel) || math.IsInf(policy.CoefficientLossPerLevel, 0) || policy.CoefficientLossPerLevel < 0 || policy.CoefficientLossPerLevel > 1 ||
		math.IsNaN(policy.OmenProcChance) || math.IsInf(policy.OmenProcChance, 0) || policy.OmenProcChance < 0 || policy.OmenProcChance > 1 ||
		(policy.ClassProcMode != "unchanged" && policy.ClassProcMode != "coefficient-factor") || (policy.OmenEvents != "direct-heals" && policy.OmenEvents != "healing-casts") {
		return fmt.Errorf("invalid Druid healing research policy")
	}
	if policy.CoefficientLossPerLevel == 0 && (policy.FullScalingGap != 0 || policy.ClassProcMode != "unchanged") {
		return fmt.Errorf("unscaled Druid reference must preserve class procs")
	}
	return nil
}

func (resto *RestorationDruid) ConfigureKFCDruidHealingResearch(policy KFCDruidHealingResearchPolicy) error {
	if err := policy.Validate(); err != nil {
		return err
	}
	if resto.research != nil || resto.GCD.ReadyAt() > 0 || resto.Hardcast.Expires > 0 {
		return fmt.Errorf("Druid research requires a fresh actor")
	}
	for _, spell := range resto.Spellbook {
		for _, metrics := range spell.SpellMetrics {
			if metrics.Casts > 0 || metrics.Ticks > 0 || metrics.CritTicks > 0 {
				return fmt.Errorf("Druid research cannot change after a cast")
			}
		}
	}
	factors := make(map[int32]float64, len(kfcDruidResearchLevels))
	for id, level := range kfcDruidResearchLevels {
		gap := max(0, int(resto.Level)-level-policy.FullScalingGap)
		factors[id] = min(1, max(0, 1-float64(gap)*policy.CoefficientLossPerLevel))
	}
	resto.research = &kfcDruidHealingResearchState{policy: policy, factors: factors}
	for _, spell := range resto.Spellbook {
		if factor, exists := factors[spell.ActionID.SpellID]; exists {
			spell.BonusCoefficient *= factor
		}
	}
	resto.KFCHealingOmenProcChance = func(spell *core.Spell) float64 {
		chance := policy.OmenProcChance
		if policy.ClassProcMode == "coefficient-factor" {
			chance *= resto.kfcDruidRankFactor(spell.ActionID.SpellID)
		}
		return chance
	}
	resto.KFCHealingOmenCastTriggers = policy.OmenEvents == "healing-casts"
	return nil
}
func (resto *RestorationDruid) kfcDruidRankFactor(id int32) float64 {
	if resto.research == nil {
		return 1
	}
	factor, exists := resto.research.factors[id]
	if !exists {
		panic(fmt.Sprintf("missing Druid research rank %d", id))
	}
	return factor
}
func (resto *RestorationDruid) kfcDruidResearchProc(sim *core.Simulation, spell *core.Spell, talent string) bool {
	if resto.research == nil || resto.research.policy.ClassProcMode == "unchanged" {
		return true
	}
	factor := resto.kfcDruidRankFactor(spell.ActionID.SpellID)
	return factor >= 1 || (factor > 0 && sim.Proc(factor, "Druid rank sensitivity "+talent))
}
func (resto *RestorationDruid) kfcDruidResearchTickOutcome(dot *core.Dot, family string) core.OutcomeApplier {
	if resto.research == nil || family != "regrowth" || resto.research.policy.RegrowthPeriodicCrits {
		return dot.OutcomeTick
	}
	return func(_ *core.Simulation, result *core.SpellResult, _ *core.AttackTable) {
		result.Outcome = core.OutcomeHit
		dot.Spell.SpellMetrics[result.Target.UnitIndex].Ticks++
	}
}
