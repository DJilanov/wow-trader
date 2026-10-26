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
// before character initialization and stat finalization. The empty path uses NewSim.
func NewKFCManaRecipientSimulation(request *proto.RaidSimRequest, signals simsignals.Signals, recipients []KFCManaRecipientPool) (*Simulation, error) {
	if request == nil || request.Raid == nil || request.Encounter == nil || request.SimOptions == nil {
		return nil, fmt.Errorf("incomplete mana-recipient simulation")
	}
	if len(recipients) == 0 {
		return NewSim(request, signals), nil
	}
	if request.SimOptions.Ruleset != proto.Ruleset_RulesetForever || len(recipients) > 39 {
		return nil, fmt.Errorf("mana recipients require the declared Forever roster")
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
