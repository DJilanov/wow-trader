package holy

import (
	"fmt"
	"math"

	"github.com/wowsims/classic/sim/core"
)

type KFCPaladinAssignmentMetrics struct {
	Schema                           string  `json:"schema"`
	SupportHpsMean                   float64 `json:"supportHpsMean"`
	SupportHpsStdev                  float64 `json:"supportHpsStdev"`
	HealthRestoredHpsMean            float64 `json:"healthRestoredHpsMean"`
	AbsorbedHpsMean                  float64 `json:"absorbedHpsMean"`
	DamageDemandMean                 float64 `json:"damageDemandMean"`
	OverkillExcludedMean             float64 `json:"overkillExcludedMean"`
	ExternalMissingHealthSecondsMean float64 `json:"externalMissingHealthSecondsMean"`
	FinalExternalMissingHealthMean   float64 `json:"finalExternalMissingHealthMean"`
}

type kfcPaladinAssignmentState struct {
	metrics                        KFCPaladinAssignmentMetrics
	count                          int
	healthLoss, absorbed, overkill float64
	hpsMean, hpsM2                 float64
}

func newKFCPaladinAssignment(scoring string) (*kfcPaladinAssignmentState, error) {
	if scoring == "" {
		return nil, nil
	}
	if scoring != "external-demand-v1" {
		return nil, fmt.Errorf("unknown Paladin assignment scoring policy")
	}
	return &kfcPaladinAssignmentState{metrics: KFCPaladinAssignmentMetrics{Schema: "kfc-paladin-external-assignment.v1"}}, nil
}

func (state *kfcPaladinAssignmentState) resetIteration() {
	state.healthLoss, state.absorbed, state.overkill = 0, 0, 0
}

// Only scheduled damage to other players enters this ledger. Shields cannot earn
// credit until consumed; health loss is capped before excluding the final deficit.
func (state *kfcPaladinAssignmentState) observeDamage(beforeHealth float64, result *core.SpellResult) {
	loss := min(beforeHealth, max(0, result.Damage))
	state.healthLoss += loss
	state.absorbed += result.AbsorbedDamage
	state.overkill += max(0, result.Damage-loss)
}

func (state *kfcPaladinAssignmentState) finishIteration(duration, finalMissing float64) error {
	healed := state.healthLoss - finalMissing
	if duration <= 0 || healed < -1e-7 || !kfcFinite(healed) || !kfcFinite(state.absorbed) || !kfcFinite(finalMissing) {
		return fmt.Errorf("inconsistent external assignment health ledger")
	}
	healed = max(0, healed)
	hps := (healed + state.absorbed) / duration
	state.count++
	delta := hps - state.hpsMean
	state.hpsMean += delta / float64(state.count)
	state.hpsM2 += delta * (hps - state.hpsMean)
	state.metrics.HealthRestoredHpsMean += healed / duration
	state.metrics.AbsorbedHpsMean += state.absorbed / duration
	state.metrics.DamageDemandMean += state.healthLoss + state.absorbed
	state.metrics.OverkillExcludedMean += state.overkill
	state.metrics.FinalExternalMissingHealthMean += finalMissing
	return nil
}

func (state *kfcPaladinAssignmentState) result() *KFCPaladinAssignmentMetrics {
	value := state.metrics
	count := float64(state.count)
	value.SupportHpsMean = state.hpsMean
	value.SupportHpsStdev = math.Sqrt(max(0, state.hpsM2/count))
	value.HealthRestoredHpsMean /= count
	value.AbsorbedHpsMean /= count
	value.DamageDemandMean /= count
	value.OverkillExcludedMean /= count
	value.ExternalMissingHealthSecondsMean /= count
	value.FinalExternalMissingHealthMean /= count
	return &value
}

func (healer *HolyPaladin) kfcExternalAssignmentMissing() float64 {
	missing := 0.0
	for _, unit := range healer.Env.Raid.AllUnits {
		if unit != &healer.Unit {
			missing += max(0, unit.MaxHealth()-unit.CurrentHealth())
		}
	}
	return missing
}
