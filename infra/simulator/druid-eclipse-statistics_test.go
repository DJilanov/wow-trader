package core

import (
	"math"
	"testing"

	"github.com/wowsims/classic/sim/core/proto"
)

func TestKfcStableMetricDruidEclipseUptime(t *testing.T) {
	var values aggregator
	for index := 0; index < 25; index++ {
		values.add(298.514851486)
	}
	legacyMean := values.sum / float64(values.n)
	legacyVariance := values.sumSq/float64(values.n) - legacyMean*legacyMean
	if values.sumSq != 2227777.913942716 || legacyMean != 298.51485148600017 || legacyVariance >= 0 {
		t.Fatalf("fixture no longer reproduces the recorded Eclipse summary: %.17g %.17g %.17g", values.sumSq, legacyMean, legacyVariance)
	}
	mean, stdev := values.meanAndStdDev()
	if mean != 298.514851486 || stdev != 0 || math.IsNaN(stdev) {
		t.Fatalf("constant Eclipse uptime must have a finite zero deviation: mean=%.17g stdev=%.17g", mean, stdev)
	}
}

func TestKfcStableMetricDruidEclipseWorkerMerge(t *testing.T) {
	combiner := &raidSimResultCombiner{}
	aura := &proto.AuraMetrics{AggregatorData: &proto.AggregatorData{}}
	for index, count := range []int32{7, 8, 10} {
		combiner.combineAuraMetrics(aura, &proto.AuraMetrics{
			UptimeSecondsAvg: 298.514851486,
			AggregatorData:   &proto.AggregatorData{N: count, SumSq: float64(count) * 298.514851486 * 298.514851486},
		}, float64(count)/25, index == 2)
	}
	if aura.UptimeSecondsAvg != 298.514851486 || aura.UptimeSecondsStdev != 0 || aura.AggregatorData.N != 25 {
		t.Fatalf("Eclipse summary changed across worker boundaries: %+v", aura)
	}
	if len(combiner.auraMoments) != 0 {
		t.Fatal("finished Eclipse merge retained temporary state")
	}
}
