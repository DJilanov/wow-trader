package restoration

import (
	"fmt"
	"time"

	"github.com/wowsims/classic/sim/core"
)

// KFC_SHAMAN_HEALTH_REGENERATION_VALUES

type KFCShamanHealthRegenerationPolicy struct {
	TickTiming string `json:"tickTiming"`
}

type KFCShamanHealthRegenerationMetrics struct {
	Ticks     int32   `json:"ticks"`
	Attempted float64 `json:"attempted"`
	Restored  float64 `json:"restored"`
}

type kfcShamanHealthRegeneration struct {
	configured bool
	policy     KFCShamanHealthRegenerationPolicy
	period     time.Duration
	generation uint64
	resource   *core.ResourceMetrics
	metrics    KFCShamanHealthRegenerationMetrics
}

func (resto *RestorationShaman) KFCShamanAdditionalHealingSetBonuses() []core.ActiveSetBonus {
	bonuses := resto.kfcShamanElementsSetBonuses()
	if resto.Env == nil || !resto.Env.IsForever() {
		return bonuses
	}
	pieces := 0
	for _, item := range resto.Equipment {
		if item.SetID == kfcShamanHealthRegenerationSetID {
			pieces++
		}
	}
	if pieces < kfcShamanHealthRegenerationThreshold {
		return bonuses
	}
	if !core.HasForeverEquipmentSetDefinition(kfcShamanHealthRegenerationSetID) || core.ForeverEquipmentBonusSupported(kfcShamanHealthRegenerationSetID, kfcShamanHealthRegenerationThreshold) {
		panic("Reconcile shared Shadowcraft regeneration before owned integration")
	}
	return append(bonuses, core.ActiveSetBonus{Name: "Shadowcraft Armor", NumPieces: kfcShamanHealthRegenerationThreshold, BonusEffect: func(agent core.Agent) {
		owner, ok := agent.(*RestorationShaman)
		if !ok {
			panic("Invalid owned Shadowcraft regeneration actor")
		}
		owner.registerKFCShamanHealthRegeneration()
	}})
}

func (resto *RestorationShaman) registerKFCShamanHealthRegeneration() {
	if resto.kfcHealthRegeneration != nil {
		panic("Duplicate owned Shadowcraft regeneration")
	}
	state := &kfcShamanHealthRegeneration{resource: resto.NewHealthMetrics(core.ActionID{SpellID: kfcShamanHealthRegenerationSpellID})}
	resto.kfcHealthRegeneration = state
	resto.OnSpellRegistered(func(spell *core.Spell) {
		if spell.ActionID.Tag != 0 || !kfcShamanHealthRegenerationOwnedIDs[spell.ActionID.SpellID] {
			return
		}
		previous := spell.ExtraCastCondition
		spell.ExtraCastCondition = func(sim *core.Simulation, target *core.Unit) bool {
			return state.configured && (previous == nil || previous(sim, target))
		}
	})
	core.MakePermanent(resto.RegisterAura(core.Aura{Label: "KFC Shadowcraft health regeneration", ActionID: core.ActionID{SpellID: kfcShamanHealthRegenerationSpellID}, OnReset: func(_ *core.Aura, sim *core.Simulation) {
		state.generation++
		state.metrics = KFCShamanHealthRegenerationMetrics{}
		if state.configured {
			resto.startKFCShamanHealthRegeneration(sim)
		}
	}}))
}

func (resto *RestorationShaman) startKFCShamanHealthRegeneration(sim *core.Simulation) {
	state := resto.kfcHealthRegeneration
	generation := state.generation
	amount := kfcShamanHealthRegenerationPerFive * state.period.Seconds() / 5
	var tick func(*core.Simulation)
	tick = func(sim *core.Simulation) {
		if generation != state.generation || !state.configured || resto.CurrentHealth() <= 0 || !resto.IsEnabled() {
			return
		}
		before := resto.CurrentHealth()
		resto.GainHealth(sim, amount, state.resource)
		state.metrics.Ticks++
		state.metrics.Attempted += amount
		state.metrics.Restored += resto.CurrentHealth() - before
		core.StartDelayedAction(sim, core.DelayedActionOptions{DoAt: sim.CurrentTime + state.period, Priority: core.ActionPriorityRegen, OnAction: tick})
	}
	core.StartDelayedAction(sim, core.DelayedActionOptions{DoAt: sim.CurrentTime + state.period, Priority: core.ActionPriorityRegen, OnAction: tick})
}

func (resto *RestorationShaman) ConfigureKFCShamanHealthRegeneration(sim *core.Simulation, policy KFCShamanHealthRegenerationPolicy) error {
	state := resto.kfcHealthRegeneration
	if sim == nil || sim.CurrentTime != 0 || resto.positions == nil || state == nil || state.configured || resto.GCD.ReadyAt() > 0 || resto.Hardcast.Expires > 0 {
		return fmt.Errorf("Health regeneration requires a fresh positioned six-piece owner")
	}
	if policy.TickTiming != "two-second-ticks-reference" && policy.TickTiming != "five-second-ticks-reference" {
		return fmt.Errorf("Unreviewed health-regeneration tick timing")
	}
	for _, spell := range resto.Spellbook {
		for _, metric := range spell.SpellMetrics {
			if metric.Casts > 0 || metric.Hits > 0 || metric.Crits > 0 || metric.Ticks > 0 || metric.CritTicks > 0 {
				return fmt.Errorf("Health-regeneration policy cannot change after events")
			}
		}
	}
	state.period = 2 * time.Second
	if policy.TickTiming == "five-second-ticks-reference" {
		state.period = 5 * time.Second
	}
	state.policy, state.configured = policy, true
	resto.startKFCShamanHealthRegeneration(sim)
	return nil
}

func (resto *RestorationShaman) KFCShamanHealthRegenerationMetrics() KFCShamanHealthRegenerationMetrics {
	if resto.kfcHealthRegeneration == nil {
		return KFCShamanHealthRegenerationMetrics{}
	}
	return resto.kfcHealthRegeneration.metrics
}

func (resto *RestorationShaman) KFCShamanHealthRegenerationPolicyEcho() *KFCShamanHealthRegenerationPolicy {
	if state := resto.kfcHealthRegeneration; state != nil && state.configured {
		policy := state.policy
		return &policy
	}
	return nil
}
