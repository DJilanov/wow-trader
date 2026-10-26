package core

import (
	"fmt"
	"math"

	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
)

// KFCManaRecipientPool declares a synthetic recipient's unbuffed resource pool.
// It is not a second class actor or a source of external healing/cooldowns.
type KFCManaRecipientPool struct {
	RaidIndex   int32
	MaximumMana float64
}

// NewKFCManaRecipientSimulation initializes only declared target-dummy mana bars
// before character initialization and stat finalization. Ordinary empty assignments use NewSim.
func NewKFCManaRecipientSimulation(request *proto.RaidSimRequest, signals simsignals.Signals, recipients []KFCManaRecipientPool) (*Simulation, error) {
	if request == nil || request.Raid == nil || request.Encounter == nil || request.SimOptions == nil {
		return nil, fmt.Errorf("incomplete mana-recipient simulation")
	}
	expandedRoster := request.Raid.TargetDummies > 24
	if len(recipients) == 0 && !expandedRoster {
		return NewSim(request, signals), nil
	}
	if request.SimOptions.Ruleset != proto.Ruleset_RulesetForever || len(recipients) > 39 {
		return nil, fmt.Errorf("mana recipients require the declared Forever roster")
	}
	if expandedRoster {
		if request.Raid.TargetDummies > 39 || len(request.Raid.Parties) < 1 || len(request.Raid.Parties) > 8 || request.Raid.NumActiveParties != 0 || len(request.Raid.Tanks) != 0 || request.Raid.Debuffs != nil || len(request.Encounter.Targets) != 1 || request.Encounter.Targets[0] == nil {
			return nil, fmt.Errorf("expanded synthetic roster requires an explicit Forever assignment")
		}
		free := 0
		for _, party := range request.Raid.Parties {
			if party == nil || len(party.Players) > 5 {
				return nil, fmt.Errorf("invalid expanded synthetic party")
			}
			for _, player := range party.Players {
				if player == nil {
					return nil, fmt.Errorf("nil expanded synthetic actor")
				}
			}
			free += 5 - len(party.Players)
		}
		if int(request.Raid.TargetDummies) > free {
			return nil, fmt.Errorf("insufficient expanded synthetic party capacity")
		}
	}
	pools := map[int32]float64{}
	for _, row := range recipients {
		if row.RaidIndex < 0 || row.RaidIndex >= 40 || math.IsNaN(row.MaximumMana) || math.IsInf(row.MaximumMana, 0) || row.MaximumMana <= 0 || row.MaximumMana > 1000000 {
			return nil, fmt.Errorf("invalid mana-recipient pool")
		}
		if _, exists := pools[row.RaidIndex]; exists {
			return nil, fmt.Errorf("duplicate mana-recipient pool")
		}
		pools[row.RaidIndex] = row.MaximumMana
	}
	env := &Environment{State: Created, Ruleset: request.SimOptions.Ruleset}
	env.construct(request.Raid, request.Encounter)
	if expandedRoster {
		// NewRaid's ordinary path intentionally caps target dummies at24. Extend only
		// this explicit benchmark before any actor initialization or finalization.
		for index := 24; index < int(request.Raid.TargetDummies); index++ {
			party, slot := env.Raid.GetFirstEmptyRaidIndex()
			party.Players = append(party.Players, NewTargetDummy(index, party, slot))
		}
		env.Raid.updatePlayersAndPets()
		env.AllUnits = append(append([]*Unit{}, env.Encounter.TargetUnits...), env.Raid.AllUnits...)
		for index, unit := range env.AllUnits {
			unit.Env = env
			unit.UnitIndex = int32(index)
		}
		for _, unit := range env.Raid.AllUnits {
			unit.CurrentTarget = env.Encounter.TargetUnits[0]
		}
	}
	matched := 0
	for _, party := range env.Raid.Parties {
		for _, agent := range party.Players {
			maximum, selected := pools[agent.GetCharacter().Index]
			if !selected {
				continue
			}
			dummy, ok := agent.(*TargetDummy)
			if !ok {
				return nil, fmt.Errorf("mana pools may only configure declared target dummies")
			}
			// EnableManaBar's ordinary Intellect dependency assumes at least20Intellect.
			// These explicit base stats produce exactly the requested unbuffed mana pool.
			dummy.AddStat(stats.Intellect, 20)
			dummy.EnableManaBar()
			dummy.AddStat(stats.Mana, maximum-20)
			dummy.SpiritManaRegenPerSecond = func() float64 { return 0 }
			matched++
		}
	}
	if matched != len(pools) {
		return nil, fmt.Errorf("mana-recipient pool references an absent raid slot")
	}
	raidStats := env.initialize(request.Raid, request.Encounter)
	env.finalize(request.Raid, request.Encounter, raidStats, false)
	return newSimWithEnv(env, request.SimOptions, signals), nil
}
