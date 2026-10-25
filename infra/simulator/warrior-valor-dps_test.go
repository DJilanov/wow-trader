//go:build with_db

package common_test

import (
	"fmt"
	"testing"

	"github.com/wowsims/classic/sim"
	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
)

func TestKfcValorDpsLoadout(t *testing.T) {
	sim.RegisterAll()
	for _, pieces := range []int{4, 5, 6} {
		t.Run(fmt.Sprint(pieces), func(t *testing.T) {
			gear := &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
			for slot := range gear.Items {
				gear.Items[slot] = &proto.ItemSpec{}
			}
			gear.Items[14].Id = 11964
			for index, slot := range []int{0, 2, 4, 6, 8, 9} {
				if index < pieces {
					gear.Items[slot].Id = []int32{16731, 16733, 16730, 16732, 16734, 16737}[index]
				}
			}
			player := &proto.Player{
				Class: proto.Class_ClassWarrior, Race: proto.Race_RaceHuman, Level: 60,
				Equipment: gear, Rotation: &proto.APLRotation{Type: proto.APLRotation_TypeAPL},
				Spec: &proto.Player_Warrior{Warrior: &proto.Warrior{Options: &proto.Warrior_Options{}}},
			}
			run := core.NewSim(&proto.RaidSimRequest{
				Raid: core.SinglePlayerRaidProto(player, nil, nil, nil), Encounter: core.MakeSingleTargetEncounter(0),
				SimOptions: &proto.SimOptions{Iterations: 1, RandomSeed: 1337, Ruleset: proto.Ruleset_RulesetForever},
			}, simsignals.Signals{})
			run.Options.Interactive = true
			run.Reset()
			character := run.Raid.Parties[0].Players[0].GetCharacter()
			counts := map[int32]int{}
			for _, bonus := range character.GetActiveSetBonuses() {
				if bonus.Name == "Battlegear of Valor" {
					counts[bonus.NumPieces]++
				}
			}
			aura := character.GetAura("Valor Warrior's Resolve")
			if pieces == 4 {
				if aura != nil || counts[5] != 0 || counts[6] != 0 {
					t.Fatal("DPS Warrior received Valor effects before their threshold")
				}
				return
			}
			if aura == nil || !aura.IsActive() || counts[5] != 1 || counts[6] != pieces-5 {
				t.Fatalf("DPS Warrior's Valor effects are missing or duplicated: %v", counts)
			}
			spending := character.NewRageMetrics(core.ActionID{SpellID: 1})
			procs := 0
			for attempt := 0; attempt < 2000; attempt++ {
				character.SpendRage(run, character.CurrentRage(), spending)
				aura.OnSpellHitDealt(aura, run,
					&core.Spell{Unit: &character.Unit, ProcMask: core.ProcMaskMeleeMHAuto},
					&core.SpellResult{Outcome: core.OutcomeHit})
				gain := character.CurrentRage()
				if gain == 10 {
					procs++
				} else if gain != 0 {
					t.Fatalf("Incorrect DPS Warrior rage payload: %v", gain)
				}
			}
			if procs == 0 || procs > 200 {
				t.Fatalf("DPS Warrior's Valor proc cadence is missing or excessive: %d", procs)
			}
		})
	}
}
