package restoration

import (
	"fmt"
	"sort"
	"time"

	"github.com/wowsims/classic/sim/core"
)

// KFC_SHAMAN_FLAT_ITEM_REGENERATION_VALUES

type KFCShamanFlatItemRegenerationMetrics struct {
	Ticks     int32   `json:"ticks"`
	Attempted float64 `json:"attempted"`
	Restored  float64 `json:"restored"`
}

type kfcShamanFlatItemRegenerationSource struct {
	itemID        int32
	healthPerFive float64
	resource      *core.ResourceMetrics
}

type kfcShamanFlatItemRegeneration struct {
	configured bool
	policy     KFCShamanHealthRegenerationPolicy
	period     time.Duration
	generation uint64
	sources    []kfcShamanFlatItemRegenerationSource
	metrics    KFCShamanFlatItemRegenerationMetrics
}

func (resto *RestorationShaman) registerKFCShamanFlatItemRegeneration() {
	if !resto.Env.IsForever() || resto.kfcFlatItemRegeneration != nil {
		panic("Invalid or repeated flat-item regeneration registration")
	}
	amounts := map[int32]float64{}
	for _, item := range resto.Equipment {
		if amount := kfcShamanFlatItemHealthPerFive[item.ID]; amount > 0 {
			amounts[item.ID] += amount
		}
	}
	if len(amounts) == 0 {
		return
	}
	ids := make([]int32, 0, len(amounts))
	for id := range amounts {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	state := &kfcShamanFlatItemRegeneration{}
	for _, id := range ids {
		state.sources = append(state.sources, kfcShamanFlatItemRegenerationSource{
			itemID: id, healthPerFive: amounts[id], resource: resto.NewHealthMetrics(core.ActionID{ItemID: id, Tag: 46}),
		})
	}
	resto.kfcFlatItemRegeneration = state
	resto.OnSpellRegistered(func(spell *core.Spell) {
		if spell.ActionID.Tag != 0 || kfcShamanWorkloadFamily(spell.ActionID.SpellID) == "" {
			return
		}
		previous := spell.ExtraCastCondition
		spell.ExtraCastCondition = func(sim *core.Simulation, target *core.Unit) bool {
			return state.configured && (previous == nil || previous(sim, target))
		}
	})
	core.MakePermanent(resto.RegisterAura(core.Aura{Label: "KFC flat-item health regeneration", OnReset: func(_ *core.Aura, sim *core.Simulation) {
		state.generation++
		state.metrics = KFCShamanFlatItemRegenerationMetrics{}
		if state.configured {
			resto.startKFCShamanFlatItemRegeneration(sim)
		}
	}}))
}

func (resto *RestorationShaman) startKFCShamanFlatItemRegeneration(sim *core.Simulation) {
	state := resto.kfcFlatItemRegeneration
	generation := state.generation
	var tick func(*core.Simulation)
	tick = func(sim *core.Simulation) {
		if generation != state.generation || !state.configured || resto.CurrentHealth() <= 0 || !resto.IsEnabled() {
			return
		}
		state.metrics.Ticks++
		for _, source := range state.sources {
			amount := source.healthPerFive * state.period.Seconds() / 5
			before := resto.CurrentHealth()
			resto.GainHealth(sim, amount, source.resource)
			state.metrics.Attempted += amount
			state.metrics.Restored += resto.CurrentHealth() - before
		}
		core.StartDelayedAction(sim, core.DelayedActionOptions{DoAt: sim.CurrentTime + state.period, Priority: core.ActionPriorityRegen, OnAction: tick})
	}
	core.StartDelayedAction(sim, core.DelayedActionOptions{DoAt: sim.CurrentTime + state.period, Priority: core.ActionPriorityRegen, OnAction: tick})
}

func (resto *RestorationShaman) ConfigureKFCShamanFlatItemRegeneration(sim *core.Simulation, policy KFCShamanHealthRegenerationPolicy) error {
	state := resto.kfcFlatItemRegeneration
	if sim == nil || sim.CurrentTime != 0 || resto.positions == nil || state == nil || state.configured || resto.GCD.ReadyAt() > 0 || resto.Hardcast.Expires > 0 {
		return fmt.Errorf("Flat-item regeneration requires a fresh positioned equipped owner")
	}
	if policy.TickTiming != "two-second-ticks-reference" && policy.TickTiming != "five-second-ticks-reference" {
		return fmt.Errorf("Unreviewed flat-item regeneration tick timing")
	}
	for _, spell := range resto.Spellbook {
		for _, metric := range spell.SpellMetrics {
			if metric.Casts > 0 || metric.Hits > 0 || metric.Crits > 0 || metric.Ticks > 0 || metric.CritTicks > 0 {
				return fmt.Errorf("Flat-item regeneration policy cannot change after events")
			}
		}
	}
	state.period = 2 * time.Second
	if policy.TickTiming == "five-second-ticks-reference" {
		state.period = 5 * time.Second
	}
	state.policy, state.configured = policy, true
	resto.startKFCShamanFlatItemRegeneration(sim)
	return nil
}

func (resto *RestorationShaman) KFCShamanFlatItemRegenerationMetrics() KFCShamanFlatItemRegenerationMetrics {
	if resto.kfcFlatItemRegeneration == nil {
		return KFCShamanFlatItemRegenerationMetrics{}
	}
	return resto.kfcFlatItemRegeneration.metrics
}

func (resto *RestorationShaman) KFCShamanFlatItemRegenerationPolicyEcho() *KFCShamanHealthRegenerationPolicy {
	if state := resto.kfcFlatItemRegeneration; state != nil && state.configured {
		policy := state.policy
		return &policy
	}
	return nil
}
