package priest

import (
	"fmt"
	"math"

	"github.com/wowsims/classic/sim/core"
)

// KFCHealingRankScalingPolicy declares a sensitivity scenario, not a measured server formula.
type KFCHealingRankScalingPolicy struct {
	Schema                  string  `json:"schema"`
	ID                      string  `json:"id"`
	Kind                    string  `json:"kind"`
	FullScalingGap          int     `json:"fullScalingGap"`
	CoefficientLossPerLevel float64 `json:"coefficientLossPerLevel"`
	ClassProcMode           string  `json:"classProcMode"`
}

type kfcHealingRankScalingState struct {
	policy  KFCHealingRankScalingPolicy
	factors map[int32]float64
}

// KFC_RANK_SCALING_METADATA

func (policy KFCHealingRankScalingPolicy) Validate() error {
	if policy.Schema != "kfc-priest-rank-sensitivity.v1" || len(policy.ID) == 0 || len(policy.ID) > 100 ||
		policy.FullScalingGap < 0 || policy.FullScalingGap > 60 ||
		math.IsNaN(policy.CoefficientLossPerLevel) || math.IsInf(policy.CoefficientLossPerLevel, 0) ||
		policy.CoefficientLossPerLevel < 0 || policy.CoefficientLossPerLevel > 1 ||
		(policy.ClassProcMode != "unchanged" && policy.ClassProcMode != "coefficient-factor") {
		return fmt.Errorf("invalid Priest rank-sensitivity policy")
	}
	switch policy.Kind {
	case "unscaled-reference":
		if policy.CoefficientLossPerLevel != 0 || policy.FullScalingGap != 0 || policy.ClassProcMode != "unchanged" {
			return fmt.Errorf("unscaled reference must preserve coefficients and class procs")
		}
	case "level-distance-sensitivity":
		if policy.CoefficientLossPerLevel <= 0 {
			return fmt.Errorf("rank sensitivity needs a positive coefficient loss")
		}
	default:
		return fmt.Errorf("unknown Priest rank-sensitivity kind")
	}
	return nil
}

// ConfigureKFCHealingRankScaling is called once per actor, before its first benchmark iteration.
func (priest *Priest) ConfigureKFCHealingRankScaling(policy KFCHealingRankScalingPolicy) error {
	if err := policy.Validate(); err != nil {
		return err
	}
	if !priest.KFCHealingMode || priest.kfcRankScaling != nil || priest.Hardcast.Expires > 0 || priest.GCD.ReadyAt() > 0 {
		return fmt.Errorf("rank sensitivity requires a fresh healing actor")
	}
	for _, spell := range priest.Spellbook {
		for _, metrics := range spell.SpellMetrics {
			if metrics.Casts > 0 || metrics.Ticks > 0 || metrics.CritTicks > 0 {
				return fmt.Errorf("rank sensitivity cannot change after a cast")
			}
		}
	}
	factors := make(map[int32]float64, len(kfcRankLearnedLevels))
	for root, learned := range kfcRankLearnedLevels {
		gap := max(0, int(priest.Level)-learned-policy.FullScalingGap)
		factors[root] = min(1, max(0, 1-float64(gap)*policy.CoefficientLossPerLevel))
	}
	priest.kfcRankScaling = &kfcHealingRankScalingState{policy: policy, factors: factors}
	for _, spell := range priest.Spellbook {
		if root, exists := kfcRankRoots[spell.ActionID.SpellID]; exists {
			spell.BonusCoefficient *= factors[root]
		}
	}
	return nil
}

func (priest *Priest) kfcHealingRankFactor(root int32) float64 {
	if priest.kfcRankScaling == nil {
		return 1
	}
	factor, exists := priest.kfcRankScaling.factors[root]
	if !exists {
		panic(fmt.Sprintf("missing Priest healing rank %d", root))
	}
	return factor
}

func (priest *Priest) kfcHealingRankProc(sim *core.Simulation, spell *core.Spell, talent string) bool {
	if priest.kfcRankScaling == nil || priest.kfcRankScaling.policy.ClassProcMode == "unchanged" {
		return true
	}
	root, exists := kfcRankRoots[spell.ActionID.SpellID]
	if spell == priest.KFCMendingHeal && priest.KFCMendingRank != nil {
		root, exists = priest.KFCMendingRank.Data.ID, true
	}
	if !exists {
		panic(fmt.Sprintf("missing Priest healing proc root %d", spell.ActionID.SpellID))
	}
	factor := priest.kfcHealingRankFactor(root)
	// Do not consume RNG for certain outcomes; the reference retains historical seeds exactly.
	return factor >= 1 || (factor > 0 && sim.Proc(factor, "KFC rank sensitivity "+talent))
}
