package restoration

import (
	"fmt"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/stats"
)

// KFC_SHAMAN_ELEMENTS_VALUES

type KFCShamanElementsPolicy struct {
	ProcChance  string `json:"procChance"`
	ProcRouting string `json:"procRouting"`
}

type KFCShamanElementsMetrics struct {
	Attempts int32 `json:"attempts"`
	Procs    int32 `json:"procs"`
}

type kfcShamanElementsState struct {
	configured bool
	policy     KFCShamanElementsPolicy
	chance     float64
	buff       *core.Aura
	metrics    KFCShamanElementsMetrics
}

func (resto *RestorationShaman) KFCShamanAdditionalHealingSetBonuses() []core.ActiveSetBonus {
	if resto.Env == nil || !resto.Env.IsForever() {
		return nil
	}
	count := 0
	for _, item := range resto.Equipment {
		if item.SetID == kfcShamanElementsSetID {
			count++
		}
	}
	if count < 5 {
		return nil
	}
	if core.ForeverEquipmentBonusSupported(kfcShamanElementsSetID, 5) {
		panic("Reconcile shared Elements proc before owned integration")
	}
	return []core.ActiveSetBonus{{Name: "The Elements", NumPieces: 5, BonusEffect: func(agent core.Agent) {
		owner, ok := agent.(*RestorationShaman)
		if !ok {
			panic("Invalid owned Elements actor")
		}
		owner.registerKFCShamanElementsProc()
	}}}
}

func (resto *RestorationShaman) registerKFCShamanElementsProc() {
	if resto.kfcElements != nil {
		panic("Duplicate owned Elements proc")
	}
	state := &kfcShamanElementsState{}
	resto.kfcElements = state
	resto.OnSpellRegistered(func(spell *core.Spell) {
		if spell.ActionID.Tag != 0 || !kfcShamanElementsOwnedIDs[spell.ActionID.SpellID] {
			return
		}
		previous := spell.ExtraCastCondition
		spell.ExtraCastCondition = func(sim *core.Simulation, target *core.Unit) bool {
			return state.configured && (previous == nil || previous(sim, target))
		}
	})
	state.buff = resto.NewTemporaryStatsAura("KFC Elements power", core.ActionID{SpellID: kfcShamanElementsBuffID}, stats.Stats{stats.SpellDamage: kfcShamanElementsPower, stats.HealingPower: kfcShamanElementsPower}, time.Duration(kfcShamanElementsDurationMs)*time.Millisecond)
	trigger := func(sim *core.Simulation, spell *core.Spell, ownedCasts bool) {
		if spell == nil || resto.CurrentHealth() <= 0 || !resto.IsEnabled() {
			return
		}
		eligible := kfcShamanClassHealIDs[spell.ActionID.SpellID]
		if ownedCasts {
			eligible = spell.ActionID.Tag == 0 && kfcShamanElementsOwnedIDs[spell.ActionID.SpellID]
		}
		if !eligible {
			return
		}
		if !state.configured {
			panic("Elements proc requires a declared fresh reference")
		}
		state.metrics.Attempts++
		if sim.Proc(state.chance, "KFC Elements proc") {
			state.metrics.Procs++
			state.buff.Activate(sim)
		}
	}
	core.MakePermanent(resto.RegisterAura(core.Aura{
		Label: "KFC Elements trigger", ActionID: core.ActionID{SpellID: kfcShamanElementsProcID},
		OnReset: func(_ *core.Aura, _ *core.Simulation) { state.metrics = KFCShamanElementsMetrics{} },
		OnCastComplete: func(_ *core.Aura, sim *core.Simulation, spell *core.Spell) {
			if !state.configured {
				trigger(sim, spell, true)
				return
			}
			if state.policy.ProcRouting == "completed-class-healing-casts-reference" {
				trigger(sim, spell, false)
			}
			if state.policy.ProcRouting == "completed-owned-spell-casts-reference" {
				trigger(sim, spell, true)
			}
		},
		OnHealDealt: func(_ *core.Aura, sim *core.Simulation, spell *core.Spell, result *core.SpellResult) {
			if result != nil && result.DirectDamageOrHealing && result.Landed() && (state.policy.ProcRouting == "direct-class-healing-events-reference" || state.policy.ProcRouting == "all-class-healing-events-reference") {
				trigger(sim, spell, false)
			}
		},
		OnPeriodicHealDealt: func(_ *core.Aura, sim *core.Simulation, spell *core.Spell, result *core.SpellResult) {
			if state.policy.ProcRouting == "all-class-healing-events-reference" && result != nil && !result.DirectDamageOrHealing && result.Landed() {
				trigger(sim, spell, false)
			}
		},
	}))
}

func (resto *RestorationShaman) ConfigureKFCShamanElementsPolicy(sim *core.Simulation, policy KFCShamanElementsPolicy) error {
	state := resto.kfcElements
	if sim == nil || sim.CurrentTime != 0 || resto.positions == nil || state == nil || state.configured || resto.GCD.ReadyAt() > 0 || resto.Hardcast.Expires > 0 {
		return fmt.Errorf("Elements policy requires a fresh positioned five-piece owner")
	}
	if policy.ProcChance != "client-proc-record-reference" && policy.ProcChance != "four-percent-sensitivity-reference" {
		return fmt.Errorf("Unreviewed Elements proc chance")
	}
	if policy.ProcRouting != "completed-class-healing-casts-reference" && policy.ProcRouting != "completed-owned-spell-casts-reference" && policy.ProcRouting != "direct-class-healing-events-reference" && policy.ProcRouting != "all-class-healing-events-reference" {
		return fmt.Errorf("Unreviewed Elements routing")
	}
	for _, spell := range resto.Spellbook {
		for _, metric := range spell.SpellMetrics {
			if metric.Casts > 0 || metric.Ticks > 0 || metric.CritTicks > 0 {
				return fmt.Errorf("Elements policy cannot change after casting")
			}
		}
	}
	state.policy = policy
	state.chance = kfcShamanElementsClientChance
	if policy.ProcChance == "four-percent-sensitivity-reference" {
		state.chance = .04
	}
	state.configured = true
	return nil
}

func (resto *RestorationShaman) KFCShamanElementsProcMetrics() KFCShamanElementsMetrics {
	if resto.kfcElements == nil {
		return KFCShamanElementsMetrics{}
	}
	return resto.kfcElements.metrics
}

func (resto *RestorationShaman) KFCShamanElementsPolicyEcho() *KFCShamanElementsPolicy {
	if state := resto.kfcElements; state != nil && state.configured {
		policy := state.policy
		return &policy
	}
	return nil
}
