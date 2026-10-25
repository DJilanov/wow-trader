package core

import (
	"math"
	"testing"
)

func TestKFCHealingVarianceConstantSamples(t *testing.T) {
	for _, value := range []float64{104.175, 104.175000000001, 1.1, 254.55, 1000000.01, .00000001} {
		for _, count := range []int{1, 3, 20, 10000} {
			distribution := aggregator{}
			for index := 0; index < count; index++ {
				distribution.add(value)
			}
			mean, deviation := distribution.meanAndStdDev()
			if math.IsNaN(mean) || math.IsNaN(deviation) || math.IsInf(deviation, 0) || deviation < 0 {
				t.Fatalf("Identical samples returned invalid deviation: value=%v count=%d mean=%v deviation=%v", value, count, mean, deviation)
			}
			if math.Abs(mean-value) > max(1, value)*1e-10 || deviation > max(1, value)*.00001 {
				t.Fatal("Constant-sample precision exceeded its declared rounding bound")
			}
		}
	}
}

func TestKFCHealingVariancePreservesRealSpread(t *testing.T) {
	distribution := aggregator{}
	for _, value := range []float64{100, 200, 300} {
		distribution.add(value)
	}
	mean, deviation := distribution.meanAndStdDev()
	kfcRequireHealing(t, mean, 200)
	kfcRequireHealing(t, deviation, math.Sqrt(20000.0/3))
	distribution.scale(2)
	mean, deviation = distribution.meanAndStdDev()
	kfcRequireHealing(t, mean, 400)
	kfcRequireHealing(t, deviation, 2*math.Sqrt(20000.0/3))
}

func TestKFCHealingVarianceDoesNotHideCorruptMoments(t *testing.T) {
	distribution := aggregator{n: 3, sum: 600, sumSq: 0}
	_, deviation := distribution.meanAndStdDev()
	if !math.IsNaN(deviation) {
		t.Fatal("Materially invalid moments were silently turned into zero deviation")
	}
}
