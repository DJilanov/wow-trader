package restoration

import (
	"fmt"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
)

type KFCShamanRacialAction struct {
	SpellID     int32 `json:"spellId"`
	EarliestMS  int64 `json:"earliestMs"`
	MaximumUses int   `json:"maximumUses"`
}

// KFCShamanRacialPolicy selects client-derived references and explicitly owned actives.
type KFCShamanRacialPolicy struct {
	Schema          string                  `json:"schema"`
	CriticalHealing string                  `json:"criticalHealing"`
	Actions         []KFCShamanRacialAction `json:"actions"`
}

type kfcShamanRacialState struct {
	policy KFCShamanRacialPolicy
}

func kfcShamanPlayableRace(race proto.Race) bool {
	switch race {
	case proto.Race_RaceDwarf, proto.Race_RaceOrc, proto.Race_RaceTauren, proto.Race_RaceTroll, proto.Race_RaceSkyborneWindshaper:
		return true
	}
	return false
}

func kfcShamanCopyRacialPolicy(policy KFCShamanRacialPolicy) KFCShamanRacialPolicy {
	if policy.Actions != nil {
		actions := make([]KFCShamanRacialAction, len(policy.Actions))
		copy(actions, policy.Actions)
		policy.Actions = actions
	}
	return policy
}

func (resto *RestorationShaman) ConfigureKFCShamanRacials(sim *core.Simulation, policy KFCShamanRacialPolicy) error {
	if sim == nil || sim.CurrentTime != 0 || !resto.Env.IsForever() || resto.positions == nil || resto.kfcRacials != nil || resto.Hardcast.Expires > 0 || resto.GCD.ReadyAt() > 0 {
		return fmt.Errorf("racial policy requires a fresh positioned Shaman")
	}
	if policy.Schema != "kfc-shaman-racial-policy.v1" || !kfcShamanPlayableRace(resto.Race) ||
		(policy.CriticalHealing != "client-aura50-reference" && policy.CriticalHealing != "disabled-reference") || len(policy.Actions) > 1 {
		return fmt.Errorf("unsupported Shaman race or racial policy")
	}
	for _, spell := range resto.Spellbook {
		for _, metric := range spell.SpellMetrics {
			if metric.Casts > 0 || metric.Hits > 0 || metric.Crits > 0 || metric.Ticks > 0 || metric.CritTicks > 0 {
				return fmt.Errorf("racial policy cannot change after casting")
			}
		}
	}
	for _, action := range policy.Actions {
		owned := action.SpellID == 20554 && resto.Race == proto.Race_RaceTroll || action.SpellID == 20572 && resto.Race == proto.Race_RaceOrc
		if !owned || resto.GetSpell(core.ActionID{SpellID: action.SpellID}) == nil || action.EarliestMS < 0 || float64(action.EarliestMS) >= sim.BaseDuration.Seconds()*1000 || action.MaximumUses < 1 || action.MaximumUses > 20 {
			return fmt.Errorf("unowned or invalid Shaman racial action")
		}
	}
	resto.kfcRacials = &kfcShamanRacialState{policy: kfcShamanCopyRacialPolicy(policy)}
	return nil
}

// The critical-healing aura scales the complete critical heal after its ordinary outcome.
// The wrapper leaves hit counters, RNG, overhealing and threat calculation in their normal paths.
func (resto *RestorationShaman) kfcShamanRacialHealingOutcome(outcome core.OutcomeApplier) core.OutcomeApplier {
	if resto.kfcRacials == nil || resto.kfcRacials.policy.CriticalHealing != "client-aura50-reference" || (resto.Race != proto.Race_RaceDwarf && resto.Race != proto.Race_RaceTauren) {
		return outcome
	}
	return func(sim *core.Simulation, result *core.SpellResult, table *core.AttackTable) {
		outcome(sim, result, table)
		if result.DidCrit() {
			result.Damage *= 1.02
		}
	}
}

func (resto *RestorationShaman) useKFCShamanRacials(sim *core.Simulation, uses []int) {
	if resto.kfcRacials == nil || resto.CurrentHealth() <= 0 || !resto.IsEnabled() || resto.IsCasting(sim) || resto.IsChanneling(sim) {
		return
	}
	for index, action := range resto.kfcRacials.policy.Actions {
		if uses[index] >= action.MaximumUses || sim.CurrentTime < time.Duration(action.EarliestMS)*time.Millisecond {
			continue
		}
		spell := resto.GetSpell(core.ActionID{SpellID: action.SpellID})
		if spell.CanCast(sim, &resto.Unit) && spell.Cast(sim, &resto.Unit) {
			uses[index]++
		}
	}
}
