package restoration

import (
	"fmt"
	"math"

	"github.com/wowsims/classic/sim/core"
)

// KFCShamanRankScalingPolicy declares a stress case, not a verified server formula.
type KFCShamanRankScalingPolicy struct {
	Schema                  string  `json:"schema"`
	ID                      string  `json:"id"`
	Kind                    string  `json:"kind"`
	FullScalingGap          int     `json:"fullScalingGap"`
	CoefficientLossPerLevel float64 `json:"coefficientLossPerLevel"`
	ClassProcMode           string  `json:"classProcMode"`
}

type kfcShamanRankScalingState struct {
	policy  KFCShamanRankScalingPolicy
	factors map[int32]float64
}

// KFC_SHAMAN_RANK_METADATA

func (policy KFCShamanRankScalingPolicy) Validate() error {
	if policy.Schema != "kfc-shaman-rank-sensitivity.v1" || len(policy.ID) == 0 || len(policy.ID) > 100 ||
		policy.FullScalingGap < 0 || policy.FullScalingGap > 60 ||
		math.IsNaN(policy.CoefficientLossPerLevel) || math.IsInf(policy.CoefficientLossPerLevel, 0) ||
		policy.CoefficientLossPerLevel < 0 || policy.CoefficientLossPerLevel > 1 ||
		(policy.ClassProcMode != "unchanged" && policy.ClassProcMode != "coefficient-factor") {
		return fmt.Errorf("invalid Shaman rank-sensitivity policy")
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
		return fmt.Errorf("unknown Shaman rank-sensitivity kind")
	}
	return nil
}

// ConfigureKFCShamanRankScaling applies once to a fresh, positioned benchmark actor.
func (resto *RestorationShaman) ConfigureKFCShamanRankScaling(sim *core.Simulation, policy KFCShamanRankScalingPolicy) error {
	if err := policy.Validate(); err != nil {
		return err
	}
	if sim == nil || sim.CurrentTime != 0 || resto.positions == nil || resto.kfcRankScaling != nil || resto.Hardcast.Expires > 0 || resto.GCD.ReadyAt() > 0 {
		return fmt.Errorf("rank sensitivity requires a fresh positioned Shaman")
	}
	for _, spell := range resto.Spellbook {
		for _, metric := range spell.SpellMetrics {
			if metric.Casts > 0 || metric.Ticks > 0 || metric.CritTicks > 0 {
				return fmt.Errorf("rank sensitivity cannot change after casting")
			}
		}
	}
	factors := make(map[int32]float64, len(kfcShamanRankLearnedLevels))
	for root, learned := range kfcShamanRankLearnedLevels {
		gap := max(0, int(resto.Level)-learned-policy.FullScalingGap)
		factors[root] = min(1, max(0, 1-float64(gap)*policy.CoefficientLossPerLevel))
	}
	resto.kfcRankScaling = &kfcShamanRankScalingState{policy: policy, factors: factors}
	for _, spell := range resto.Spellbook {
		if root, exists := kfcShamanRankRoots[spell.ActionID.SpellID]; exists {
			spell.BonusCoefficient *= factors[root]
		}
	}
	return nil
}

func (resto *RestorationShaman) kfcShamanRankFactor(root int32) float64 {
	if resto.kfcRankScaling == nil {
		return 1
	}
	factor, exists := resto.kfcRankScaling.factors[root]
	if !exists {
		panic(fmt.Sprintf("missing Shaman healing rank %d", root))
	}
	return factor
}

func (resto *RestorationShaman) kfcShamanRankProc(sim *core.Simulation, spell *core.Spell) bool {
	if resto.kfcRankScaling == nil || resto.kfcRankScaling.policy.ClassProcMode == "unchanged" {
		return true
	}
	root, exists := kfcShamanRankRoots[spell.ActionID.SpellID]
	// Equipment heals retain their independent source-bound policy.
	if !exists {
		return true
	}
	factor := resto.kfcShamanRankFactor(root)
	// Certain outcomes must not draw RNG, preserving reference seeds exactly.
	return factor >= 1 || (factor > 0 && sim.Proc(factor, "KFC Shaman rank sensitivity Water Shield"))
}
