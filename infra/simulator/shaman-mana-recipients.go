package restoration

import (
	"fmt"
	"time"

	"github.com/wowsims/classic/sim/core"
)

type KFCShamanRecipientManaCost struct {
	AtMS   int64   `json:"atMs"`
	Amount float64 `json:"amount"`
}

type KFCShamanManaRecipient struct {
	RaidIndex    int32                        `json:"raidIndex"`
	MaximumMana  float64                      `json:"maximumMana"`
	StartingMana *float64                     `json:"startingMana"`
	Costs        []KFCShamanRecipientManaCost `json:"costs"`
}

type KFCShamanRecipientManaPolicy struct {
	Schema       string                   `json:"schema"`
	ID           string                   `json:"id"`
	Regeneration string                   `json:"regeneration"`
	Payment      string                   `json:"payment"`
	Timing       string                   `json:"timing"`
	Recipients   []KFCShamanManaRecipient `json:"recipients"`
}

type kfcShamanRecipientManaState struct {
	units                       map[int32]*core.Unit
	spending                    map[int32]*core.ResourceMetrics
	initial                     map[int32]*core.ResourceMetrics
	requested, spent, completed float64
	costCount                   int
}

func (resto *RestorationShaman) setKFCShamanManaCapacityAccounting(active bool) {
	if resto.kfcUtilityItems != nil {
		resto.kfcUtilityItems.manaCapacityAccounting = active
	}
}

func kfcShamanRecipientManaPoolMatches(actual, expected float64) bool {
	epsilon := max(1, expected) * 1e-12
	return kfcFinite(actual) && actual-expected <= epsilon && expected-actual <= epsilon
}

func (policy KFCShamanRecipientManaPolicy) Validate(seconds float64) error {
	if policy.Schema != "kfc-shaman-recipient-mana.v1" || policy.ID == "" || len(policy.ID) > 100 || policy.Regeneration != "none-reference" || policy.Payment != "all-or-nothing-no-retry-reference" ||
		(policy.Timing != "spend-before-pulses-reference" && policy.Timing != "spend-after-pulses-reference") || len(policy.Recipients) < 1 || len(policy.Recipients) > 39 || !kfcFinite(seconds) || seconds < 1 || seconds > 1800 {
		return fmt.Errorf("invalid Shaman recipient-mana reference")
	}
	seen := map[int32]bool{}
	count := 0
	for _, row := range policy.Recipients {
		if row.RaidIndex < 0 || row.RaidIndex >= 40 || seen[row.RaidIndex] || !kfcFinite(row.MaximumMana) || row.MaximumMana <= 0 || row.MaximumMana > 1000000 || row.StartingMana == nil || !kfcFinite(*row.StartingMana) || *row.StartingMana < 0 || *row.StartingMana > row.MaximumMana {
			return fmt.Errorf("invalid Shaman recipient-mana pool")
		}
		seen[row.RaidIndex] = true
		for _, cost := range row.Costs {
			if cost.AtMS < 0 || float64(cost.AtMS) >= seconds*1000 || !kfcFinite(cost.Amount) || cost.Amount <= 0 || cost.Amount > 1000000 {
				return fmt.Errorf("invalid Shaman recipient mana cost")
			}
			count++
			if count > 20000 {
				return fmt.Errorf("too many Shaman recipient mana costs")
			}
		}
	}
	return nil
}

func kfcShamanRecipientManaPools(policy *KFCShamanRecipientManaPolicy, seconds float64) ([]core.KFCManaRecipientPool, error) {
	if policy == nil {
		return nil, nil
	}
	if err := policy.Validate(seconds); err != nil {
		return nil, err
	}
	rows := make([]core.KFCManaRecipientPool, 0, len(policy.Recipients))
	for _, row := range policy.Recipients {
		rows = append(rows, core.KFCManaRecipientPool{RaidIndex: row.RaidIndex, MaximumMana: row.MaximumMana})
	}
	return rows, nil
}

func (resto *RestorationShaman) prepareKFCShamanRecipientMana(policy *KFCShamanRecipientManaPolicy, units map[int32]*core.Unit) (*kfcShamanRecipientManaState, error) {
	if policy == nil {
		return nil, nil
	}
	state := &kfcShamanRecipientManaState{units: map[int32]*core.Unit{}, spending: map[int32]*core.ResourceMetrics{}, initial: map[int32]*core.ResourceMetrics{}}
	for _, row := range policy.Recipients {
		unit := units[row.RaidIndex]
		if unit == nil || unit == &resto.Unit || !unit.HasManaBar() || !kfcShamanRecipientManaPoolMatches(unit.MaxMana(), row.MaximumMana) {
			return nil, fmt.Errorf("recipient-mana pool does not match its actual synthetic actor")
		}
		state.units[row.RaidIndex] = unit
		// These are benchmark demand markers, not invented game abilities.
		state.spending[row.RaidIndex] = unit.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 2010})
		state.initial[row.RaidIndex] = unit.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 2011})
		state.spending[row.RaidIndex].NoThreat = true
		state.initial[row.RaidIndex].NoThreat = true
		for _, cost := range row.Costs {
			state.requested += cost.Amount
			state.costCount++
		}
	}
	return state, nil
}

func (state *kfcShamanRecipientManaState) reset(sim *core.Simulation, policy *KFCShamanRecipientManaPolicy) error {
	if state == nil {
		return nil
	}
	state.spent = 0
	state.completed = 0
	for _, row := range policy.Recipients {
		unit := state.units[row.RaidIndex]
		if unit == nil || unit.CurrentMana() != unit.MaxMana() || !kfcShamanRecipientManaPoolMatches(unit.MaxMana(), row.MaximumMana) {
			return fmt.Errorf("recipient-mana reset must start at the declared full pool")
		}
		if amount := unit.CurrentMana() - *row.StartingMana; amount > 0 {
			unit.SpendMana(sim, amount, state.initial[row.RaidIndex])
		}
	}
	return nil
}

func (state *kfcShamanRecipientManaState) schedule(sim *core.Simulation, policy *KFCShamanRecipientManaPolicy) {
	if state == nil {
		return
	}
	priority := core.ActionPriorityDOT + 1
	if policy.Timing == "spend-after-pulses-reference" {
		priority = core.ActionPriorityGCD
	}
	for _, row := range policy.Recipients {
		unit := state.units[row.RaidIndex]
		metrics := state.spending[row.RaidIndex]
		for _, cost := range row.Costs {
			sim.AddPendingAction(&core.PendingAction{NextActionAt: time.Duration(cost.AtMS) * time.Millisecond, Priority: priority, OnAction: func(sim *core.Simulation) {
				if unit.CurrentHealth() <= 0 || !unit.IsEnabled() || unit.CurrentMana() < cost.Amount {
					return
				}
				unit.SpendMana(sim, cost.Amount, metrics)
				state.spent += cost.Amount
				state.completed++
			}})
		}
	}
}

func (state *kfcShamanRecipientManaState) finish(metrics *KFCShamanHealingAssignmentMetrics) error {
	if state == nil {
		return nil
	}
	if !kfcFinite(state.spent) || state.spent < 0 || state.spent > state.requested+max(1, state.requested)*1e-12 || state.completed < 0 || state.completed > float64(state.costCount) {
		return fmt.Errorf("inconsistent Shaman recipient mana ledger")
	}
	metrics.RecipientManaDemandMean += state.requested
	metrics.RecipientManaSpentMean += state.spent
	metrics.RecipientUnpaidManaMean += max(0, state.requested-state.spent)
	metrics.RecipientManaCostsCompletedMean += state.completed
	metrics.RecipientManaCostsMissedMean += float64(state.costCount) - state.completed
	for _, unit := range state.units {
		if !kfcFinite(unit.CurrentMana()) || unit.CurrentMana() < 0 || unit.CurrentMana() > unit.MaxMana()+1e-7 {
			return fmt.Errorf("recipient mana escaped actual capacity")
		}
		if unit.CurrentHealth() > 0 && unit.IsEnabled() {
			metrics.FinalLivingRecipientManaMean += unit.CurrentMana()
		}
	}
	return nil
}
