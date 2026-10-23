//go:build with_db

package common_test

import (
	"fmt"
	"math"
	"testing"

	"github.com/wowsims/classic/sim"
	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
)

func TestKfcValorCurrentThresholdAndProc(t *testing.T) {
	sim.RegisterAll()
	if !core.ForeverEquipmentBonusSupported(189, 5) || !core.ForeverEquipmentBonusSupported(189, 6) || core.ForeverEquipmentBonusSupported(189, 4) {
		t.Fatal("Valor support metadata must match the implemented combat thresholds")
	}
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
				Spec: &proto.Player_TankWarrior{TankWarrior: &proto.TankWarrior{
					Options: &proto.TankWarrior_Options{},
				}},
			}
			run := core.NewSim(&proto.RaidSimRequest{
				Raid: core.SinglePlayerRaidProto(player, nil, nil, nil), Encounter: core.MakeSingleTargetEncounter(0),
				SimOptions: &proto.SimOptions{Iterations: 1, RandomSeed: 1337, Ruleset: proto.Ruleset_RulesetForever},
			}, simsignals.Signals{})
			run.Options.Interactive = true
			run.Reset()
			c := run.Raid.Parties[0].Players[0].GetCharacter()
			counts := map[int32]int{}
			for _, bonus := range c.GetActiveSetBonuses() {
				if bonus.Name == "Battlegear of Valor" {
					counts[bonus.NumPieces]++
				}
			}
			if counts[2] != 1 || counts[3] != 1 || counts[4] != 0 {
				t.Fatalf("incorrect flat/utility thresholds: %v", counts)
			}
			aura := c.GetAura("Valor Warrior's Resolve")
			if pieces == 4 {
				if aura != nil || counts[5] != 0 {
					t.Fatal("proc granted before five pieces")
				}
				return
			}
			if counts[5] != 1 || aura == nil || !aura.IsActive() {
				t.Fatalf("proc missing or duplicated: %v", counts)
			}
			if (pieces == 6 && counts[6] != 1) || (pieces == 5 && counts[6] != 0) {
				t.Fatalf("incorrect regeneration threshold: %v", counts)
			}
			spending := c.NewRageMetrics(core.ActionID{SpellID: 1})
			for _, event := range []struct {
				mask    core.ProcMask
				outcome core.HitOutcome
				rage    float64
			}{
				{core.ProcMaskMeleeMHSpecial, core.OutcomeHit, 0},
				{core.ProcMaskMeleeMHAuto, core.OutcomeMiss, 0},
				{core.ProcMaskSpellDamage, core.OutcomeHit, 0},
				{core.ProcMaskMeleeMHAuto, core.OutcomeHit, 10},
			} {
				procs := 0
				for attempt := 0; attempt < 2000; attempt++ {
					c.SpendRage(run, c.CurrentRage(), spending)
					aura.OnSpellHitDealt(aura, run, &core.Spell{Unit: &c.Unit, ProcMask: event.mask}, &core.SpellResult{Outcome: event.outcome})
					delta := c.CurrentRage()
					if math.Abs(delta-10) < 1e-8 {
						procs++
					} else if delta != 0 {
						t.Fatal("incorrect rage payload")
					}
				}
				if (event.rage == 0 && procs != 0) || (event.rage != 0 && (procs == 0 || procs > 200)) {
					t.Fatalf("incorrect mask/outcome or accidental 100%% proc cadence: %d", procs)
				}
			}
		})
	}
}
