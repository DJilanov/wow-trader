//go:build with_db

package common_test

import (
	"math"
	"testing"
	"time"

	"github.com/wowsims/classic/sim"
	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
)

func kfcMcpSimulation(t *testing.T, ruleset proto.Ruleset) (*core.Simulation, *core.Character) {
	t.Helper()
	sim.RegisterAll()
	gear := &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
	for slot := range gear.Items {
		gear.Items[slot] = &proto.ItemSpec{}
	}
	gear.Items[proto.ItemSlot_ItemSlotMainHand].Id = 9449
	player := &proto.Player{
		Class: proto.Class_ClassWarrior, Race: proto.Race_RaceHuman, Level: 60,
		Equipment: gear,
		Rotation:  &proto.APLRotation{Type: proto.APLRotation_TypeAPL},
		Spec:      &proto.Player_Warrior{Warrior: &proto.Warrior{Options: &proto.Warrior_Options{}}},
	}
	run := core.NewSim(&proto.RaidSimRequest{
		Raid:       core.SinglePlayerRaidProto(player, nil, nil, nil),
		Encounter:  core.MakeSingleTargetEncounter(0),
		SimOptions: &proto.SimOptions{Iterations: 1, RandomSeed: 1, Ruleset: ruleset},
	}, simsignals.Signals{})
	run.Options.Interactive = true
	run.Reset()
	character := run.Raid.Parties[0].Players[0].GetCharacter()
	character.AutoAttacks.CancelAutoSwing(run)
	return run, character
}

func TestKfcManualCrowdPummelerForeverCooldown(t *testing.T) {
	_, character := kfcMcpSimulation(t, proto.Ruleset_RulesetForever)
	spell := character.GetSpell(core.ActionID{SpellID: 13494})
	if spell == nil {
		t.Fatal("Manual Crowd Pummeler use effect was not registered")
	}
	if spell.CD.Duration != 180*time.Second {
		t.Fatalf("Forever item use cooldown = %s; current client requires 3m0s", spell.CD.Duration)
	}
}

func TestKfcManualCrowdPummelerChargesAndHaste(t *testing.T) {
	for _, ruleset := range []proto.Ruleset{proto.Ruleset_RulesetClassic, proto.Ruleset_RulesetForever} {
		t.Run(ruleset.String(), func(t *testing.T) {
			run, character := kfcMcpSimulation(t, ruleset)
			spell := character.GetSpell(core.ActionID{SpellID: 13494})
			aura := character.GetAura("Haste")
			if spell == nil || aura == nil || aura.Duration != 30*time.Second {
				t.Fatal("MCP registration or 30-second duration changed")
			}
			forever := ruleset == proto.Ruleset_RulesetForever
			cooldown := 30 * time.Second
			if forever {
				cooldown = 180 * time.Second
			}
			if spell.CD.Duration != cooldown {
				t.Fatalf("Cooldown = %s; expected %s", spell.CD.Duration, cooldown)
			}
			melee := character.PseudoStats.MeleeSpeedMultiplier
			ranged := character.PseudoStats.RangedSpeedMultiplier
			for index := 0; index < 4; index++ {
				run.CurrentTime = time.Duration(index) * cooldown
				cast := spell.Cast(run, character.CurrentTarget)
				if forever && index == 3 {
					if cast || aura.IsActive() {
						t.Fatal("A fourth use was allowed from one three-charge item")
					}
					continue
				}
				if !cast || !aura.IsActive() {
					t.Fatalf("Expected charged use %d", index+1)
				}
				if math.Abs(character.PseudoStats.MeleeSpeedMultiplier-melee*1.5) > 1e-9 {
					t.Fatal("MCP did not apply exactly 50% melee haste")
				}
				expectedRanged := ranged
				if !forever {
					expectedRanged *= 1.5
				}
				if math.Abs(character.PseudoStats.RangedSpeedMultiplier-expectedRanged) > 1e-9 {
					t.Fatal("MCP ranged haste does not match its ruleset")
				}
				if spell.Cast(run, character.CurrentTarget) {
					t.Fatal("MCP bypassed its item cooldown")
				}
				aura.Deactivate(run)
				if math.Abs(character.PseudoStats.MeleeSpeedMultiplier-melee) > 1e-9 ||
					math.Abs(character.PseudoStats.RangedSpeedMultiplier-ranged) > 1e-9 {
					t.Fatal("MCP haste did not expire exactly once")
				}
			}
			run.Cleanup()
			run.Reset()
			character.AutoAttacks.CancelAutoSwing(run)
			if !spell.Cast(run, character.CurrentTarget) {
				t.Fatal("Independent simulation iteration did not restore item charges")
			}
		})
	}
}
