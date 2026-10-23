package core

import (
	"fmt"
	"math"

	"github.com/wowsims/classic/sim/core/stats"
)

// ConfigureKFCHealingBenchmarkHealth sets a declared initial target health without crediting healing or incoming damage.
func (unit *Unit) ConfigureKFCHealingBenchmarkHealth(sim *Simulation, maximum float64) error {
	if sim == nil || sim.CurrentTime != 0 || !unit.HasHealthBar() || unit.Type == EnemyUnit || maximum <= 0 || math.IsNaN(maximum) || math.IsInf(maximum, 0) {
		return fmt.Errorf("invalid initial healing benchmark health")
	}
	unit.AddStatDynamic(sim, stats.Health, maximum-unit.MaxHealth())
	unit.healthBar.currentHealth = unit.MaxHealth()
	return nil
}
