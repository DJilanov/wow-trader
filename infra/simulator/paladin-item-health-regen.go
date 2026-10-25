package holy

import (
	"fmt"
	"time"

	"github.com/wowsims/classic/sim/core"
)

// KFC_PALADIN_HEALTH_REGEN_VALUES

type kfcPaladinItemHealthRegen struct {
	rows []struct {
		rate    float64
		metrics *core.ResourceMetrics
	}
	tickMs                        int64
	echo                          *int64
	configured, initialized, used bool
	pending                       *core.PendingAction
}

func (healer *HolyPaladin) registerKFCPaladinItemHealthRegen() {
	state := &kfcPaladinItemHealthRegen{tickMs: 2000}
	healer.itemHealthRegen = state
	for _, item := range healer.Equipment {
		if rate := kfcPaladinHealthPerFive[item.ID]; rate > 0 {
			state.rows = append(state.rows, struct {
				rate    float64
				metrics *core.ResourceMetrics
			}{rate, healer.NewHealthMetrics(core.ActionID{ItemID: item.ID, Tag: 46})})
		}
	}
	if len(state.rows) == 0 {
		return
	}
	core.MakePermanent(healer.RegisterAura(core.Aura{Label: "Paladin item health regeneration", OnReset: func(_ *core.Aura, sim *core.Simulation) {
		state.initialized = true
		state.pending = nil
		healer.scheduleKFCPaladinItemHealthRegen(sim)
	}}))
}

func (healer *HolyPaladin) scheduleKFCPaladinItemHealthRegen(sim *core.Simulation) {
	state := healer.itemHealthRegen
	state.pending = &core.PendingAction{
		NextActionAt: sim.CurrentTime + time.Duration(state.tickMs)*time.Millisecond,
		Priority:     core.ActionPriorityAuto,
		OnAction: func(sim *core.Simulation) {
			state.pending = nil
			if healer.CurrentHealth() <= 0 || !healer.IsEnabled() {
				return
			}
			if sim.CurrentTime >= 0 {
				state.used = true
				for _, row := range state.rows {
					healer.GainHealth(sim, row.rate*float64(state.tickMs)/5000, row.metrics)
				}
			}
			healer.scheduleKFCPaladinItemHealthRegen(sim)
		},
	}
	sim.AddPendingAction(state.pending)
}

func (healer *HolyPaladin) ConfigureKFCPaladinItemHealthRegen(sim *core.Simulation, tickMs *int64) error {
	if tickMs == nil {
		return nil
	}
	state := healer.itemHealthRegen
	if *tickMs != 2000 && *tickMs != 5000 {
		return fmt.Errorf("unsupported item health regeneration timing reference")
	}
	if sim == nil || sim.CurrentTime != 0 || state == nil || len(state.rows) == 0 || state.configured || state.used || healer.GCD.ReadyAt() > 0 || healer.IsCasting(sim) || healer.IsChanneling(sim) || (state.initialized && healer.CurrentHealth() <= 0) {
		return fmt.Errorf("item health regeneration timing requires a fresh equipped owner")
	}
	for _, spell := range healer.Spellbook {
		for _, metric := range spell.SpellMetrics {
			if metric.Casts > 0 || metric.Hits > 0 || metric.Crits > 0 || metric.Ticks > 0 || metric.CritTicks > 0 {
				return fmt.Errorf("item health regeneration timing cannot change after casting")
			}
		}
	}
	value := *tickMs
	state.tickMs, state.echo, state.configured = value, &value, true
	if state.initialized {
		if state.pending != nil {
			state.pending.Cancel(sim)
		}
		healer.scheduleKFCPaladinItemHealthRegen(sim)
	}
	return nil
}
