package restoration

import (
	"fmt"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/stats"
)

// KFC_SHAMAN_FIVE_THUNDERS_VALUES

type KFCShamanFiveThundersPolicy struct {
	ProcRouting string `json:"procRouting"`
}

type KFCShamanFiveThundersMetrics struct {
	Attempts int32 `json:"attempts"`
	Procs    int32 `json:"procs"`
}

type kfcShamanFiveThundersState struct {
	configured bool
	policy     KFCShamanFiveThundersPolicy
	buff       *core.Aura
	metrics    KFCShamanFiveThundersMetrics
}

func (resto *RestorationShaman) KFCOwnedShamanHealingSetID(id int32) bool {
	return resto.Env != nil && resto.Env.IsForever() && id == kfcShamanFiveSetID
}

// Exact current set identity prevents the alternate's three-piece mana bonus
// and different proc parent from being applied by the shared English name.
func (resto *RestorationShaman) KFCOwnedShamanHealingSetBonuses() []core.ActiveSetBonus {
	if !resto.KFCOwnedShamanHealingSetID(kfcShamanFiveSetID) {
		return nil
	}
	count := 0
	for _, item := range resto.Equipment {
		if item.SetID == kfcShamanFiveSetID {
			count++
		}
	}
	if count == 0 {
		return nil
	}
	if core.HasForeverEquipmentSetDefinition(kfcShamanFiveSetID) {
		panic("Five Thunders source must be reconciled before enabling a shared definition")
	}
	bonuses := []core.ActiveSetBonus{}
	add := func(pieces int32, effect core.ApplyEffect) {
		if int32(count) >= pieces {
			bonuses = append(bonuses, core.ActiveSetBonus{Name: "The Five Thunders", NumPieces: pieces, BonusEffect: effect})
		}
	}
	add(2, func(agent core.Agent) { agent.GetCharacter().AddResistances(kfcShamanFiveResistance) })
	add(4, func(agent core.Agent) {
		owner, ok := agent.(*RestorationShaman)
		if !ok {
			panic("Invalid owned Shaman set actor")
		}
		owner.registerKFCShamanFiveThundersProc()
	})
	add(6, func(agent core.Agent) {
		agent.GetCharacter().AddStats(stats.Stats{stats.SpellDamage: kfcShamanFiveStaticPower, stats.HealingPower: kfcShamanFiveStaticPower})
	})
	add(8, func(agent core.Agent) { agent.GetCharacter().AddStat(stats.BonusArmor, kfcShamanFiveBonusArmor) })
	return bonuses
}

func (resto *RestorationShaman) registerKFCShamanFiveThundersProc() {
	if resto.kfcFiveThunders != nil {
		panic("Duplicate owned Five Thunders proc")
	}
	state := &kfcShamanFiveThundersState{}
	resto.kfcFiveThunders = state
	state.buff = resto.NewTemporaryStatsAura("KFC base Five Thunders power", core.ActionID{SpellID: kfcShamanFiveBuffID}, stats.Stats{stats.SpellDamage: kfcShamanFiveProcPower, stats.HealingPower: kfcShamanFiveProcPower}, time.Duration(kfcShamanFiveDurationMs)*time.Millisecond)
	trigger := func(sim *core.Simulation, spell *core.Spell) {
		if !state.configured {
			panic("Five Thunders proc requires a declared fresh routing reference")
		}
		if resto.CurrentHealth() <= 0 || !resto.IsEnabled() || spell == nil || !kfcShamanClassHealIDs[spell.ActionID.SpellID] {
			return
		}
		state.metrics.Attempts++
		if sim.Proc(kfcShamanFiveProcChance, "KFC base Five Thunders proc") {
			state.metrics.Procs++
			state.buff.Activate(sim)
		}
	}
	core.MakePermanent(resto.RegisterAura(core.Aura{
		Label: "KFC base Five Thunders trigger", ActionID: core.ActionID{SpellID: kfcShamanFiveProcID},
		OnReset: func(_ *core.Aura, _ *core.Simulation) { state.metrics = KFCShamanFiveThundersMetrics{} },
		OnCastComplete: func(_ *core.Aura, sim *core.Simulation, spell *core.Spell) {
			if !state.configured && kfcShamanClassHealIDs[spell.ActionID.SpellID] {
				panic("Five Thunders proc requires configuration")
			}
			if state.policy.ProcRouting == "completed-class-healing-casts-reference" {
				trigger(sim, spell)
			}
		},
		OnHealDealt: func(_ *core.Aura, sim *core.Simulation, spell *core.Spell, result *core.SpellResult) {
			if state.policy.ProcRouting != "completed-class-healing-casts-reference" && result != nil && result.DirectDamageOrHealing && result.Landed() {
				trigger(sim, spell)
			}
		},
		OnPeriodicHealDealt: func(_ *core.Aura, sim *core.Simulation, spell *core.Spell, result *core.SpellResult) {
			if state.policy.ProcRouting == "all-class-healing-events-reference" && result != nil && !result.DirectDamageOrHealing && result.Landed() {
				trigger(sim, spell)
			}
		},
	}))
}

func (resto *RestorationShaman) ConfigureKFCShamanFiveThundersPolicy(sim *core.Simulation, policy KFCShamanFiveThundersPolicy) error {
	state := resto.kfcFiveThunders
	if sim == nil || sim.CurrentTime != 0 || resto.positions == nil || state == nil || state.configured || resto.GCD.ReadyAt() > 0 || resto.Hardcast.Expires > 0 {
		return fmt.Errorf("Five Thunders policy requires a fresh positioned four-piece owner")
	}
	if policy.ProcRouting != "completed-class-healing-casts-reference" && policy.ProcRouting != "direct-class-healing-events-reference" && policy.ProcRouting != "all-class-healing-events-reference" {
		return fmt.Errorf("unreviewed Five Thunders proc routing reference")
	}
	for _, spell := range resto.Spellbook {
		for _, metrics := range spell.SpellMetrics {
			if metrics.Casts > 0 || metrics.Ticks > 0 || metrics.CritTicks > 0 {
				return fmt.Errorf("Five Thunders policy cannot change after casting")
			}
		}
	}
	state.policy = policy
	state.configured = true
	return nil
}

func (resto *RestorationShaman) KFCShamanFiveThundersProcMetrics() KFCShamanFiveThundersMetrics {
	if resto.kfcFiveThunders == nil {
		return KFCShamanFiveThundersMetrics{}
	}
	return resto.kfcFiveThunders.metrics
}
