package core

import (
	"math"
	"testing"

	"github.com/wowsims/classic/sim/core/proto"
)

func stableMetricNear(t *testing.T, got, want, tolerance float64) {
	t.Helper()
	if math.IsNaN(got) || math.IsInf(got, 0) || math.Abs(got-want) > tolerance {
		t.Fatalf("got %.17g want %.17g tolerance %g", got, want, tolerance)
	}
}

func TestKfcStableMetricConstantScorchUptime(t *testing.T) {
	var values aggregator
	for i := 0; i < 25; i++ {
		values.add(297.029702972)
	}
	legacy := values.sumSq/float64(values.n) - math.Pow(values.sum/float64(values.n), 2)
	if !(legacy < 0) {
		t.Fatalf("fixture no longer reproduces the retained cancellation: %g", legacy)
	}
	mean, stdev := values.meanAndStdDev()
	stableMetricNear(t, mean, 297.029702972, 0)
	stableMetricNear(t, stdev, 0, 0)
}

func TestKfcStableMetricKnownPopulationAndScale(t *testing.T) {
	var values aggregator
	for _, value := range []float64{2, 4, 4, 4, 5, 5, 7, 9} {
		values.add(value)
	}
	mean, stdev := values.meanAndStdDev()
	stableMetricNear(t, mean, 5, 1e-14)
	stableMetricNear(t, stdev, 2, 1e-14)
	values.scale(-3)
	mean, stdev = values.meanAndStdDev()
	stableMetricNear(t, mean, -15, 1e-13)
	stableMetricNear(t, stdev, 6, 1e-13)
}

func TestKfcStableMetricMergeAndEmpty(t *testing.T) {
	var left, right, empty aggregator
	for _, value := range []float64{2, 4, 4, 4} {
		left.add(value)
	}
	for _, value := range []float64{5, 5, 7, 9} {
		right.add(value)
	}
	for _, merged := range []*aggregator{left.merge(&right), empty.merge(left.merge(&right)), left.merge(&right).merge(&empty)} {
		mean, stdev := merged.meanAndStdDev()
		stableMetricNear(t, mean, 5, 1e-14)
		stableMetricNear(t, stdev, 2, 1e-14)
		if merged.n != 8 {
			t.Fatal("lost samples")
		}
	}
	mean, stdev := empty.meanAndStdDev()
	if !math.IsNaN(mean) || !math.IsNaN(stdev) {
		t.Fatal("empty samples must not become measured zeros")
	}
}

func TestKfcStableMetricCombinedWorkerMoments(t *testing.T) {
	for _, sizes := range [][]int{{25, 25}, {1, 2, 22}, {7, 8, 10}} {
		combiner := &raidSimResultCombiner{}
		dist := combiner.newDistMetrics()
		aura := &proto.AuraMetrics{AggregatorData: &proto.AggregatorData{}}
		total := 0
		for _, count := range sizes {
			total += count
		}
		for index, count := range sizes {
			part := &proto.DistributionMetrics{Avg: 297.029702972, Stdev: 0,
				Min: 297.029702972, Max: 297.029702972,
				AggregatorData: &proto.AggregatorData{N: int32(count), SumSq: float64(count) * 297.029702972 * 297.029702972}}
			last, weight := index == len(sizes)-1, float64(count)/float64(total)
			combiner.combineDistMetrics(dist, part, last, weight)
			combiner.combineAuraMetrics(aura, &proto.AuraMetrics{UptimeSecondsAvg: part.Avg,
				ProcsAvg: 3, AggregatorData: part.AggregatorData}, weight, last)
		}
		stableMetricNear(t, dist.Avg, 297.029702972, 0)
		stableMetricNear(t, dist.Stdev, 0, 0)
		stableMetricNear(t, aura.UptimeSecondsAvg, 297.029702972, 0)
		stableMetricNear(t, aura.UptimeSecondsStdev, 0, 0)
		stableMetricNear(t, aura.ProcsAvg, 3, 1e-14)
		if len(combiner.auraMoments) != 0 || len(combiner.distributionMoments) != 0 {
			t.Fatal("finished merge retained temporary moments")
		}
	}
}

func TestKfcStableMetricDistinctWorkerMeans(t *testing.T) {
	combiner := &raidSimResultCombiner{}
	dist := combiner.newDistMetrics()
	aura := &proto.AuraMetrics{AggregatorData: &proto.AggregatorData{}}
	for index, part := range []*proto.DistributionMetrics{
		{Avg: 3.5, Stdev: math.Sqrt(.75), AggregatorData: &proto.AggregatorData{N: 4, SumSq: 52}},
		{Avg: 6.5, Stdev: math.Sqrt(2.75), AggregatorData: &proto.AggregatorData{N: 4, SumSq: 180}},
	} {
		combiner.combineDistMetrics(dist, part, index == 1, .5)
		combiner.combineAuraMetrics(aura, &proto.AuraMetrics{UptimeSecondsAvg: part.Avg,
			UptimeSecondsStdev: part.Stdev, AggregatorData: part.AggregatorData}, .5, index == 1)
	}
	stableMetricNear(t, dist.Avg, 5, 1e-14)
	stableMetricNear(t, dist.Stdev, 2, 1e-14)
	stableMetricNear(t, aura.UptimeSecondsAvg, 5, 1e-14)
	stableMetricNear(t, aura.UptimeSecondsStdev, 2, 1e-14)
	if dist.AggregatorData.N != 8 || dist.AggregatorData.SumSq != 232 {
		t.Fatal("raw moments changed")
	}
}

func TestKfcStableMetricLargeOffsetAndZeroScale(t *testing.T) {
	var values aggregator
	for _, value := range []float64{1e12 + 1, 1e12 + 2, 1e12 + 3, 1e12 + 4} {
		values.add(value)
	}
	mean, stdev := values.meanAndStdDev()
	stableMetricNear(t, mean, 1e12+2.5, 0)
	stableMetricNear(t, stdev, math.Sqrt(1.25), 1e-14)
	values.scale(0)
	mean, stdev = values.meanAndStdDev()
	stableMetricNear(t, mean, 0, 0)
	stableMetricNear(t, stdev, 0, 0)
}

func TestKfcStableMetricEmptyAndInvalidSummaries(t *testing.T) {
	combiner := &raidSimResultCombiner{}
	dist := combiner.newDistMetrics()
	combiner.combineDistMetrics(dist, &proto.DistributionMetrics{AggregatorData: &proto.AggregatorData{}}, true, 0)
	if !math.IsNaN(dist.Avg) || !math.IsNaN(dist.Stdev) {
		t.Fatal("empty worker results became measurements")
	}
	invalid := kfcMetricMomentsFromSummary(25, 2, math.NaN())
	if !math.IsNaN(invalid.stdev()) {
		t.Fatal("undefined summary was repaired")
	}
	for _, call := range []func(){
		func() { kfcMetricMomentsFromSummary(-1, 2, 0) },
		func() { kfcMetricMomentsFromSummary(25, 2, -1) },
	} {
		func() {
			defer func() {
				if recover() == nil {
					t.Error("invalid summary was accepted")
				}
			}()
			call()
		}()
	}
}
