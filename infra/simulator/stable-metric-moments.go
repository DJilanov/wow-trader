package core

import "math"

// kfcMetricMoments keeps central moments without subtracting nearly equal squares.
// Raw sum/sumSq fields remain available separately for existing wire consumers.
type kfcMetricMoments struct {
	n    int
	mean float64
	m2   float64
}

func (m *kfcMetricMoments) add(value float64) {
	m.n++
	delta := value - m.mean
	m.mean += delta / float64(m.n)
	m.m2 += delta * (value - m.mean)
}

func (m *kfcMetricMoments) scale(factor float64) {
	m.mean *= factor
	m.m2 *= factor * factor
}

func (m kfcMetricMoments) merge(other kfcMetricMoments) kfcMetricMoments {
	if m.n == 0 {
		return other
	}
	if other.n == 0 {
		return m
	}
	n := m.n + other.n
	delta := other.mean - m.mean
	return kfcMetricMoments{
		n:    n,
		mean: m.mean + delta*(float64(other.n)/float64(n)),
		m2:   m.m2 + other.m2 + delta*delta*(float64(m.n)*float64(other.n)/float64(n)),
	}
}

func (m kfcMetricMoments) stdev() float64 {
	if m.n == 0 {
		return math.NaN()
	}
	return math.Sqrt(m.m2 / float64(m.n))
}

func (m kfcMetricMoments) meanOrNaN() float64 {
	if m.n == 0 {
		return math.NaN()
	}
	return m.mean
}

func kfcMetricMomentsFromSummary(n int32, mean, stdev float64) kfcMetricMoments {
	if n < 0 || stdev < 0 {
		panic("Invalid metric summary")
	}
	if n == 0 {
		return kfcMetricMoments{}
	}
	return kfcMetricMoments{n: int(n), mean: mean, m2: stdev * stdev * float64(n)}
}
