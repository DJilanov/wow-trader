package restoration

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	googleProto "google.golang.org/protobuf/proto"
)

// RunKFCShamanHealingWorkload executes a declared stationary post-mitigation
// assignment. Full item/consume admission and numerical BiS qualification are separate.
func RunKFCShamanHealingWorkload(ctx context.Context, input *proto.RaidSimRequest, frame KFCShamanHealingWorkload) (output *KFCShamanHealingWorkloadResult, err error) {
	defer func() {
		if failure := recover(); failure != nil {
			output = nil
			err = fmt.Errorf("Shaman healing workload engine failed: %v", failure)
		}
	}()
	if ctx == nil {
		return nil, fmt.Errorf("Shaman workload requires a cancellation context")
	}
	if err = ctx.Err(); err != nil {
		return nil, err
	}
	if input == nil || input.Raid == nil || input.Encounter == nil || input.SimOptions == nil {
		return nil, fmt.Errorf("incomplete Shaman healing request")
	}
	request := googleProto.Clone(input).(*proto.RaidSimRequest)
	if request.SimOptions.Ruleset != proto.Ruleset_RulesetForever || request.SimOptions.RandomSeed == 0 || request.SimOptions.Iterations < 1 || request.SimOptions.Iterations > 10000 || !kfcFinite(request.Encounter.Duration) || request.Encounter.Duration < 1 || request.Encounter.Duration > 1800 || request.Encounter.DurationVariation != 0 || request.Encounter.UseHealth || len(request.Encounter.Targets) != 1 || request.Encounter.Targets[0] == nil {
		return nil, fmt.Errorf("unsupported Shaman encounter, iteration count or seed")
	}
	enemy := request.Encounter.Targets[0]
	if !googleProto.Equal(enemy, &proto.Target{Name: enemy.Name, Level: enemy.Level}) {
		return nil, fmt.Errorf("unscheduled enemy behaviors need separate workload admission")
	}
	if frame.Schema != "kfc-shaman-healing-workload.v1" || frame.Name == "" || len(frame.Name) > 160 || frame.DecisionIntervalMS < 1 || frame.DecisionIntervalMS > 1000 || len(frame.Targets) < 1 || len(frame.Targets) > 40 || len(frame.Damage) > 20000 || len(frame.Priorities) < 1 || len(frame.Priorities) > 32 || !kfcFinite(frame.NaturesSwiftnessMinimumMissingHealth) || frame.NaturesSwiftnessMinimumMissingHealth < 0 || frame.NaturesSwiftnessMinimumMissingHealth > 1000000 || !frame.UseNaturesSwiftness && frame.NaturesSwiftnessMinimumMissingHealth != 0 {
		return nil, fmt.Errorf("invalid Shaman workload contract")
	}
	var player *proto.Player
	count := 0
	for _, party := range request.Raid.Parties {
		if party == nil {
			return nil, fmt.Errorf("nil benchmark party")
		}
		for _, entry := range party.Players {
			if entry != nil && entry.Class != proto.Class_ClassUnknown {
				player = entry
				count++
			}
		}
	}
	if count != 1 {
		return nil, fmt.Errorf("Shaman workload requires exactly one controlled player")
	}
	if err = validateKFCShamanWorkloadRequest(player, request.Raid); err != nil {
		return nil, err
	}
	player.Rotation = &proto.APLRotation{Type: proto.APLRotation_TypeAPL}
	request.SimOptions.Interactive = true
	sim := core.NewSim(request, simsignals.CreateSignals())
	active := false
	defer func() {
		if active {
			sim.Cleanup()
		}
	}()
	var healer *RestorationShaman
	units := map[int32]*core.Unit{}
	for _, party := range sim.Raid.Parties {
		for _, agent := range party.Players {
			unit := &agent.GetCharacter().Unit
			units[unit.Index] = unit
			if value, ok := agent.(*RestorationShaman); ok {
				healer = value
			}
		}
	}
	if healer == nil || len(units) != len(frame.Targets) || len(units) != len(sim.Raid.AllUnits) {
		return nil, fmt.Errorf("Shaman profiles must cover the complete player-only roster")
	}
	profiles := map[int32]KFCShamanHealingTarget{}
	positions := map[int32]KFCShamanFriendlyPosition{}
	for _, target := range frame.Targets {
		unit := units[target.RaidIndex]
		if unit == nil || !kfcFinite(target.MaximumHealth) || target.MaximumHealth < 0 || target.MaximumHealth > 1000000 || !kfcFinite(target.X) || !kfcFinite(target.Y) {
			return nil, fmt.Errorf("invalid Shaman target profile")
		}
		if _, exists := profiles[target.RaidIndex]; exists {
			return nil, fmt.Errorf("duplicate Shaman target profile")
		}
		profiles[target.RaidIndex] = target
		positions[unit.UnitIndex] = KFCShamanFriendlyPosition{X: target.X, Y: target.Y}
	}
	if err = healer.ConfigureKFCShamanHealingPositions(sim, positions, frame.BounceRange, frame.ChainRouting); err != nil {
		return nil, err
	}
	if err = healer.ConfigureKFCShamanWaterPolicy(sim, frame.Water); err != nil {
		return nil, err
	}
	if err = healer.ConfigureKFCShamanResourcePolicy(sim, frame.Resources); err != nil {
		return nil, err
	}
	if err = healer.ConfigureKFCShamanRiptidePolicy(sim, frame.Riptide); err != nil {
		return nil, err
	}
	if frame.UseNaturesSwiftness && healer.kfcActives.swiftnessSpell == nil {
		return nil, fmt.Errorf("requested Nature's Swiftness is unowned")
	}
	totalDamage := 0.0
	for _, event := range frame.Damage {
		if units[event.RaidIndex] == nil || units[event.RaidIndex] == &healer.Unit || event.AtMS < 0 || float64(event.AtMS) >= request.Encounter.Duration*1000 || !kfcFinite(event.Amount) || event.Amount <= 0 || event.Amount > 1000000 {
			return nil, fmt.Errorf("invalid external post-mitigation damage event")
		}
		totalDamage += event.Amount
	}
	for _, priority := range frame.Priorities {
		if err = healer.validateKFCShamanWorkloadPriority(priority, units); err != nil {
			return nil, err
		}
	}
	incoming := sim.Encounter.TargetUnits[0].RegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: 1, Tag: 774}, SpellSchool: core.SpellSchoolHoly, ProcMask: core.ProcMaskSpellDamage, DamageMultiplier: 1})
	assignment := &KFCShamanHealingAssignmentMetrics{Schema: "kfc-shaman-external-assignment.v1"}
	output = &KFCShamanHealingWorkloadResult{Schema: "kfc-shaman-healing-workload-result.v1", Name: frame.Name, Iterations: request.SimOptions.Iterations, PlannedIncomingPostMitigationDamage: totalDamage, Assignment: assignment}
	hpsMean, hpsM2 := 0.0, 0.0
	for iteration := int32(0); iteration < request.SimOptions.Iterations; iteration++ {
		if err = ctx.Err(); err != nil {
			return nil, err
		}
		sim.Reseed(int64(iteration))
		sim.Reset()
		active = true
		for _, unit := range healer.kfcHealingPlayers() {
			maximum := profiles[unit.Index].MaximumHealth
			if maximum == 0 {
				maximum = unit.MaxHealth()
			}
			if err = unit.ConfigureKFCHealingBenchmarkHealth(sim, maximum); err != nil {
				return nil, err
			}
		}
		sim.PrePull()
		healthLoss, absorbed, overkill := 0.0, 0.0, 0.0
		for _, event := range frame.Damage {
			sim.AddPendingAction(&core.PendingAction{NextActionAt: time.Duration(event.AtMS) * time.Millisecond, Priority: core.ActionPriorityAuto, OnAction: func(sim *core.Simulation) {
				target := units[event.RaidIndex]
				if target.CurrentHealth() <= 0 {
					return
				}
				before := target.CurrentHealth()
				output.DeliveredIncomingDamageMean += event.Amount
				result := incoming.NewResult(target)
				result.Damage = event.Amount
				result.Outcome = core.OutcomeHit
				incoming.DealDamage(sim, result)
				loss := min(before, max(0, result.Damage))
				healthLoss += loss
				absorbed += result.AbsorbedDamage
				overkill += max(0, result.Damage-loss)
			}})
		}
		manaBlocked := false
		var decide func(*core.Simulation)
		decide = func(sim *core.Simulation) {
			manaBlocked = false
			next := sim.CurrentTime + time.Duration(frame.DecisionIntervalMS)*time.Millisecond
			if healer.CurrentHealth() > 0 && healer.IsEnabled() {
				if healer.IsCasting(sim) {
					next = max(next, healer.Hardcast.Expires)
				} else if healer.IsChanneling(sim) {
					next = max(next, healer.ChanneledDot.ExpiresAt())
				} else if !healer.GCD.IsReady(sim) {
					next = max(next, healer.GCD.ReadyAt())
				} else {
					for _, priority := range frame.Priorities {
						target := healer.kfcShamanPriorityTarget(sim, priority)
						if target == nil {
							continue
						}
						spell := healer.GetSpell(core.ActionID{SpellID: priority.SpellID})
						ready := spell.IsReady(sim) && !healer.PseudoStats.Stunned && (spell.DefaultCast.CastTime == 0 || !healer.IsMoving()) && (spell.ExtraCastCondition == nil || spell.ExtraCastCondition(sim, target))
						if !ready {
							continue
						}
						if spell.Cost != nil && spell.Cost.GetCurrentCost() > healer.CurrentMana() {
							manaBlocked = true
							continue
						}
						if frame.UseNaturesSwiftness && kfcShamanSwiftnessHealIDs[priority.SpellID] && target.MaxHealth()-target.CurrentHealth() >= frame.NaturesSwiftnessMinimumMissingHealth {
							instant := healer.kfcActives.swiftnessSpell
							if instant.CanCast(sim, &healer.Unit) {
								instant.Cast(sim, &healer.Unit)
							}
						}
						if spell.CanCast(sim, target) && spell.Cast(sim, target) {
							manaBlocked = false
							next = max(next, healer.GCD.ReadyAt(), healer.Hardcast.Expires)
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
		missing := func(external bool) float64 {
			sum := 0.0
			for _, unit := range healer.kfcHealingPlayers() {
				if !external || unit != &healer.Unit {
					sum += max(0, unit.MaxHealth()-unit.CurrentHealth())
				}
			}
			return sum
		}
		for {
			if err = ctx.Err(); err != nil {
				return nil, err
			}
			beforeTime, beforeMissing, beforeExternal, blocked := sim.CurrentTime, missing(false), missing(true), manaBlocked
			finished := sim.Step()
			elapsed := (sim.CurrentTime - beforeTime).Seconds()
			output.MissingHealthSecondsMean += beforeMissing * elapsed
			assignment.ExternalMissingHealthSecondsMean += beforeExternal * elapsed
			if blocked {
				output.ManaBlockedSecondsMean += elapsed
			}
			if finished {
				remainder := max(0, (sim.Duration - sim.CurrentTime).Seconds())
				output.MissingHealthSecondsMean += missing(false) * remainder
				assignment.ExternalMissingHealthSecondsMean += missing(true) * remainder
				if manaBlocked {
					output.ManaBlockedSecondsMean += remainder
				}
				break
			}
		}
		survived := true
		for _, unit := range healer.kfcHealingPlayers() {
			if unit.CurrentHealth() <= 0 || unit.Metrics.Died {
				survived = false
			}
		}
		if survived {
			output.SurvivalRate++
		}
		output.ManaRemainingMean += healer.CurrentMana()
		output.FinalMissingHealthMean += missing(false)
		finalMissing := missing(true)
		healed := healthLoss - finalMissing
		if !kfcFinite(healed) || healed < -1e-7 || !kfcFinite(absorbed) || absorbed < 0 {
			return nil, fmt.Errorf("inconsistent Shaman external-demand ledger")
		}
		healed = max(0, healed)
		hps := (healed + absorbed) / sim.Duration.Seconds()
		delta := hps - hpsMean
		hpsMean += delta / float64(iteration+1)
		hpsM2 += delta * (hps - hpsMean)
		assignment.HealthRestoredHpsMean += healed / sim.Duration.Seconds()
		assignment.AbsorbedHpsMean += absorbed / sim.Duration.Seconds()
		assignment.DamageDemandMean += healthLoss + absorbed
		assignment.OverkillExcludedMean += overkill
		assignment.FinalExternalMissingHealthMean += finalMissing
		for _, recipients := range healer.kfcWater.manaMetrics {
			for index, metrics := range recipients {
				value := metrics.ActualGainForCurrentIteration()
				if index == healer.UnitIndex {
					assignment.UsefulOwnManaTideManaMean += value
				} else {
					assignment.UsefulOtherManaTideManaMean += value
				}
			}
		}
		sim.Cleanup()
		active = false
	}
	countFloat := float64(request.SimOptions.Iterations)
	output.SurvivalRate /= countFloat
	output.ManaRemainingMean /= countFloat
	output.MissingHealthSecondsMean /= countFloat
	output.FinalMissingHealthMean /= countFloat
	output.ManaBlockedSecondsMean /= countFloat
	output.DeliveredIncomingDamageMean /= countFloat
	assignment.SupportHpsMean = hpsMean
	assignment.SupportHpsStdev = math.Sqrt(max(0, hpsM2/countFloat))
	assignment.HealthRestoredHpsMean /= countFloat
	assignment.AbsorbedHpsMean /= countFloat
	assignment.DamageDemandMean /= countFloat
	assignment.OverkillExcludedMean /= countFloat
	assignment.ExternalMissingHealthSecondsMean /= countFloat
	assignment.FinalExternalMissingHealthMean /= countFloat
	assignment.UsefulOwnManaTideManaMean /= countFloat
	assignment.UsefulOtherManaTideManaMean /= countFloat
	output.Metrics = sim.Raid.GetMetrics()
	return output, nil
}
