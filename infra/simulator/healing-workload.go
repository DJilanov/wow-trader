package healing

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/priest"
	googleProto "google.golang.org/protobuf/proto"
)

type KFCHealingTarget struct {
	RaidIndex     int32   `json:"raidIndex"`
	MaximumHealth float64 `json:"maximumHealth"`
	X             float64 `json:"x"`
	Y             float64 `json:"y"`
}
type KFCHealingDamageEvent struct {
	AtMS      int64   `json:"atMs"`
	RaidIndex int32   `json:"raidIndex"`
	Amount    float64 `json:"amount"`
}
type KFCHealingPriority struct {
	SpellID              int32   `json:"spellId"`
	RaidIndex            int32   `json:"raidIndex"`
	MinimumMissingHealth float64 `json:"minimumMissingHealth"`
	KeepRenew            bool    `json:"keepRenew"`
}
type KFCHealingWorkload struct {
	Schema                string                  `json:"schema"`
	Name                  string                  `json:"name"`
	Targets               []KFCHealingTarget      `json:"targets"`
	Damage                []KFCHealingDamageEvent `json:"damage"`
	Priorities            []KFCHealingPriority    `json:"priorities"`
	DecisionIntervalMS    int64                   `json:"decisionIntervalMs"`
	UseInnerFocus         bool                    `json:"useInnerFocus"`
	InnerFocusMinimumCost float64                 `json:"innerFocusMinimumCost"`
	UsePowerInfusion      bool                    `json:"usePowerInfusion"`
}
type KFCHealingWorkloadResult struct {
	Schema                              string             `json:"schema"`
	Name                                string             `json:"name"`
	Metrics                             *proto.RaidMetrics `json:"metrics"`
	Iterations                          int32              `json:"iterations"`
	SurvivalRate                        float64            `json:"survivalRate"`
	ManaRemainingMean                   float64            `json:"manaRemainingMean"`
	MissingHealthSecondsMean            float64            `json:"missingHealthSecondsMean"`
	FinalMissingHealthMean              float64            `json:"finalMissingHealthMean"`
	ManaBlockedSecondsMean              float64            `json:"manaBlockedSecondsMean"`
	PlannedIncomingPostMitigationDamage float64            `json:"plannedIncomingPostMitigationDamage"`
	DeliveredIncomingDamageMean         float64            `json:"deliveredIncomingDamageMean"`
	ClassQualified                      bool               `json:"classQualified"`
	PublicationAllowed                  bool               `json:"publicationAllowed"`
}

func kfcFinite(value float64) bool { return !math.IsNaN(value) && !math.IsInf(value, 0) }

// RunKFCHealingWorkload measures one declared, post-mitigation synthetic assignment using actual engine casts and resources.
func RunKFCHealingWorkload(ctx context.Context, input *proto.RaidSimRequest, frame KFCHealingWorkload) (output *KFCHealingWorkloadResult, err error) {
	defer func() {
		if failure := recover(); failure != nil {
			output = nil
			err = fmt.Errorf("healing workload engine failed: %v", failure)
		}
	}()
	if ctx == nil {
		return nil, fmt.Errorf("healing workload needs a cancellation context")
	}
	if err = ctx.Err(); err != nil {
		return nil, err
	}
	if input == nil || input.Raid == nil || input.Encounter == nil || input.SimOptions == nil {
		return nil, fmt.Errorf("incomplete healing workload request")
	}
	request := googleProto.Clone(input).(*proto.RaidSimRequest)
	if request.SimOptions.Ruleset != proto.Ruleset_RulesetForever || request.SimOptions.RandomSeed == 0 || request.SimOptions.Iterations < 1 || request.SimOptions.Iterations > 10000 || !kfcFinite(request.Encounter.Duration) || request.Encounter.Duration < 1 || request.Encounter.Duration > 1800 || request.Encounter.DurationVariation != 0 || len(request.Encounter.Targets) != 1 {
		return nil, fmt.Errorf("unsupported healing workload duration, iteration or encounter")
	}
	if frame.Schema != "kfc-healing-workload.v1" || frame.Name == "" || frame.DecisionIntervalMS < 1 || frame.DecisionIntervalMS > 1000 || len(frame.Targets) == 0 || len(frame.Damage) > 20000 || len(frame.Priorities) == 0 || len(frame.Priorities) > 32 || !kfcFinite(frame.InnerFocusMinimumCost) || frame.InnerFocusMinimumCost < 0 {
		return nil, fmt.Errorf("invalid healing workload contract")
	}
	var player *proto.Player
	count := 0
	for _, party := range request.Raid.Parties {
		for _, entry := range party.Players {
			if entry != nil && entry.Class != proto.Class_ClassUnknown {
				player = entry
				count++
			}
		}
	}
	if count != 1 || player.Class != proto.Class_ClassPriest || player.GetHealingPriest() == nil || player.HealingModel != nil {
		return nil, fmt.Errorf("healing workload requires one Priest and no external healing model")
	}
	player.Rotation = &proto.APLRotation{Type: proto.APLRotation_TypeAPL}
	request.SimOptions.Interactive = true
	sim := core.NewSim(request, simsignals.CreateSignals())
	var healer *HealingPriest
	units := map[int32]*core.Unit{}
	for _, party := range sim.Raid.Parties {
		for _, agent := range party.Players {
			unit := &agent.GetCharacter().Unit
			units[unit.Index] = unit
			if value, ok := agent.(*HealingPriest); ok {
				healer = value
			}
		}
	}
	if healer == nil || len(units) != len(frame.Targets) || len(units) != len(sim.Raid.AllUnits) {
		return nil, fmt.Errorf("target profiles must cover the complete player-only benchmark raid")
	}
	positions := map[int32]priest.KFCFriendlyPosition{}
	profiles := map[int32]KFCHealingTarget{}
	for _, target := range frame.Targets {
		unit := units[target.RaidIndex]
		if unit == nil || !kfcFinite(target.MaximumHealth) || target.MaximumHealth < 0 || target.MaximumHealth > 1000000 || !kfcFinite(target.X) || !kfcFinite(target.Y) {
			return nil, fmt.Errorf("invalid target profile")
		}
		if _, exists := profiles[target.RaidIndex]; exists {
			return nil, fmt.Errorf("duplicate target profile")
		}
		profiles[target.RaidIndex] = target
		positions[unit.UnitIndex] = priest.KFCFriendlyPosition{X: target.X, Y: target.Y}
	}
	if err = healer.ConfigureKFCFriendlyPositions(positions); err != nil {
		return nil, err
	}
	totalDamage := 0.0
	for _, event := range frame.Damage {
		if units[event.RaidIndex] == nil || units[event.RaidIndex] == &healer.Unit || event.AtMS < 0 || float64(event.AtMS) >= request.Encounter.Duration*1000 || !kfcFinite(event.Amount) || event.Amount <= 0 || event.Amount > 1000000 {
			return nil, fmt.Errorf("invalid post-mitigation damage event; caster-damage workloads need separate admission")
		}
		totalDamage += event.Amount
	}
	for _, priority := range frame.Priorities {
		if priority.RaidIndex < -1 || (priority.RaidIndex >= 0 && units[priority.RaidIndex] == nil) || !kfcFinite(priority.MinimumMissingHealth) || priority.MinimumMissingHealth < 0 {
			return nil, fmt.Errorf("invalid healing priority target or threshold")
		}
		_, spellError := healer.KFCHealingSpellReady(priority.SpellID, sim, &healer.Unit)
		if spellError != nil {
			return nil, spellError
		}
		if priority.KeepRenew {
			known := false
			for _, renew := range healer.Renew {
				if renew != nil && renew.ActionID.SpellID == priority.SpellID {
					known = true
				}
			}
			if !known {
				return nil, fmt.Errorf("keepRenew is only valid for a registered Renew rank")
			}
		}
	}
	if frame.UseInnerFocus && healer.InnerFocus == nil {
		return nil, fmt.Errorf("requested Inner Focus is unavailable")
	}
	pi := healer.GetSpell(core.ActionID{SpellID: 10060, Tag: healer.Index})
	if frame.UsePowerInfusion && pi == nil {
		return nil, fmt.Errorf("requested Power Infusion is unavailable")
	}
	incoming := sim.Encounter.TargetUnits[0].RegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: 1, Tag: 771}, SpellSchool: core.SpellSchoolHoly, ProcMask: core.ProcMaskSpellDamage, DamageMultiplier: 1})
	output = &KFCHealingWorkloadResult{Schema: "kfc-healing-workload-result.v1", Name: frame.Name, Iterations: request.SimOptions.Iterations, PlannedIncomingPostMitigationDamage: totalDamage}
	for iteration := int32(0); iteration < request.SimOptions.Iterations; iteration++ {
		if err = ctx.Err(); err != nil {
			return nil, err
		}
		sim.Reseed(int64(iteration))
		sim.Reset()
		for index, unit := range units {
			maximum := profiles[index].MaximumHealth
			if maximum == 0 {
				maximum = unit.MaxHealth()
			}
			if err = unit.ConfigureKFCHealingBenchmarkHealth(sim, maximum); err != nil {
				return nil, err
			}
		}
		sim.PrePull()
		for _, event := range frame.Damage {
			sim.AddPendingAction(&core.PendingAction{NextActionAt: time.Duration(event.AtMS) * time.Millisecond, Priority: core.ActionPriorityAuto, OnAction: func(sim *core.Simulation) {
				target := units[event.RaidIndex]
				if target.CurrentHealth() <= 0 {
					return
				}
				output.DeliveredIncomingDamageMean += event.Amount
				result := incoming.NewResult(target)
				result.Damage = event.Amount
				result.Outcome = core.OutcomeHit
				incoming.DealDamage(sim, result)
			}})
		}
		manaBlocked := false
		var decide func(*core.Simulation)
		decide = func(sim *core.Simulation) {
			manaBlocked = false
			next := sim.CurrentTime + time.Duration(frame.DecisionIntervalMS)*time.Millisecond
			if healer.CurrentHealth() > 0 {
				if healer.IsCasting(sim) {
					next = max(next, healer.Hardcast.Expires)
				} else if healer.IsChanneling(sim) {
					next = max(next, healer.ChanneledDot.ExpiresAt())
				} else if !healer.GCD.IsReady(sim) {
					next = max(next, healer.GCD.ReadyAt())
				} else {
					if frame.UsePowerInfusion && pi.CanCast(sim, &healer.Unit) {
						pi.Cast(sim, &healer.Unit)
					}
					for _, priority := range frame.Priorities {
						var target *core.Unit
						for _, unit := range sim.Raid.AllUnits {
							if unit.CurrentHealth() <= 0 || unit.MaxHealth()-unit.CurrentHealth() < priority.MinimumMissingHealth || (priority.RaidIndex >= 0 && unit.Index != priority.RaidIndex) {
								continue
							}
							if target == nil || unit.CurrentHealthPercent() < target.CurrentHealthPercent() || (unit.CurrentHealthPercent() == target.CurrentHealthPercent() && unit.Index < target.Index) {
								target = unit
							}
						}
						if target == nil {
							continue
						}
						spell := healer.GetSpell(core.ActionID{SpellID: priority.SpellID})
						if priority.KeepRenew && spell.Hot(target).IsActive() {
							continue
						}
						readyWithoutMana := spell.IsReady(sim) && !healer.PseudoStats.Stunned && (spell.DefaultCast.CastTime == 0 || !healer.IsMoving()) && (spell.ExtraCastCondition == nil || spell.ExtraCastCondition(sim, target))
						if frame.UseInnerFocus && readyWithoutMana && spell.Cost != nil && spell.Cost.GetCurrentCost() >= frame.InnerFocusMinimumCost && healer.InnerFocus.CanCast(sim, &healer.Unit) {
							healer.InnerFocus.Cast(sim, &healer.Unit)
						}
						if spell.Cost != nil && spell.Cost.GetCurrentCost() > healer.CurrentMana() {
							manaBlocked = true
						}
						if spell.CanCast(sim, target) && spell.Cast(sim, target) {
							manaBlocked = false
							next = max(next, healer.GCD.ReadyAt(), healer.Hardcast.Expires)
							if healer.IsChanneling(sim) {
								next = max(next, healer.ChanneledDot.ExpiresAt())
							}
							break
						}
					}
				}
			}
			if next < sim.Duration {
				sim.AddPendingAction(&core.PendingAction{NextActionAt: next, Priority: core.ActionPriorityLow, OnAction: decide})
			}
		}
		sim.AddPendingAction(&core.PendingAction{NextActionAt: 0, Priority: core.ActionPriorityLow, OnAction: decide})
		missing := func() float64 {
			sum := 0.0
			for _, unit := range sim.Raid.AllUnits {
				sum += max(0, unit.MaxHealth()-unit.CurrentHealth())
			}
			return sum
		}
		for {
			if err = ctx.Err(); err != nil {
				sim.Cleanup()
				return nil, err
			}
			beforeTime, beforeMissing, blocked := sim.CurrentTime, missing(), manaBlocked
			finished := sim.Step()
			elapsed := (sim.CurrentTime - beforeTime).Seconds()
			output.MissingHealthSecondsMean += beforeMissing * elapsed
			if blocked {
				output.ManaBlockedSecondsMean += elapsed
			}
			if finished {
				remainder := (sim.Duration - sim.CurrentTime).Seconds()
				output.MissingHealthSecondsMean += missing() * remainder
				if manaBlocked {
					output.ManaBlockedSecondsMean += remainder
				}
				break
			}
		}
		survived := true
		for _, unit := range sim.Raid.AllUnits {
			if unit.CurrentHealth() <= 0 || unit.Metrics.Died {
				survived = false
			}
		}
		if survived {
			output.SurvivalRate++
		}
		output.ManaRemainingMean += healer.CurrentMana()
		output.FinalMissingHealthMean += missing()
		sim.Cleanup()
	}
	countFloat := float64(request.SimOptions.Iterations)
	output.SurvivalRate /= countFloat
	output.ManaRemainingMean /= countFloat
	output.MissingHealthSecondsMean /= countFloat
	output.FinalMissingHealthMean /= countFloat
	output.ManaBlockedSecondsMean /= countFloat
	output.DeliveredIncomingDamageMean /= countFloat
	output.Metrics = sim.Raid.GetMetrics()
	return output, nil
}
