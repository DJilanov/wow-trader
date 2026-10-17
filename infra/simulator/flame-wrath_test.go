//go:build with_db

package common_test

import (
	"testing"

	"github.com/wowsims/classic/sim"
	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
)

func TestKfcFlameWrathSelfRetaliation(t *testing.T) {
	sim.RegisterAll()
	for _, ruleset := range []proto.Ruleset{proto.Ruleset_RulesetClassic, proto.Ruleset_RulesetForever} {
		t.Run(ruleset.String(), func(t *testing.T) {
			gear := &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
			for slot := range gear.Items {
				gear.Items[slot] = &proto.ItemSpec{}
			}
			gear.Items[proto.ItemSlot_ItemSlotMainHand].Id = 11809
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
			aura := character.GetAura("Flame Wrath")
			shield := character.GetSpell(core.ActionID{SpellID: 461152})
			if aura == nil || shield == nil || aura.OnSpellHitTaken == nil {
				t.Fatal("Flame Wrath reflection was not registered")
			}
			aura.Activate(run)
			original := aura.OnSpellHitTaken
			callbacks := 0
			aura.OnSpellHitTaken = func(a *core.Aura, s *core.Simulation, spell *core.Spell, result *core.SpellResult) {
				callbacks++
				if callbacks > 1 {
					t.Fatal("Flame Wrath recursively retaliated against its own damage")
				}
				original(a, s, spell, result)
			}
			self := &core.Spell{Unit: &character.Unit, ProcMask: core.ProcMaskEmpty}
			aura.OnSpellHitTaken(aura, run, self, &core.SpellResult{Outcome: core.OutcomeHit})
			for _, metric := range shield.SpellMetrics {
				if metric.Casts != 0 {
					t.Fatal("Self-inflicted damage triggered the fire shield")
				}
			}
			callbacks = 0
			enemy := &core.Spell{Unit: character.CurrentTarget, ProcMask: core.ProcMaskMeleeMH}
			aura.OnSpellHitTaken(aura, run, enemy, &core.SpellResult{Outcome: core.OutcomeMiss})
			if shield.SpellMetrics[character.CurrentTarget.UnitIndex].Casts != 0 {
				t.Fatal("A missed attack triggered the fire shield")
			}
			callbacks = 0
			aura.OnSpellHitTaken(aura, run, enemy, &core.SpellResult{Outcome: core.OutcomeHit})
			if shield.SpellMetrics[character.CurrentTarget.UnitIndex].Casts != 1 {
				t.Fatal("Landed enemy damage did not trigger exactly one retaliation")
			}
		})
	}
}
