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
	"github.com/wowsims/classic/sim/core/stats"
)

// This deliberately equips mutually exclusive quest rewards to isolate shared-CD behavior,
// not to recommend an obtainable loadout. The optimizer separately enforces reward choices.
func kfcDrakkisathSimulation(t *testing.T, ruleset proto.Ruleset) (*core.Simulation, []*core.Character) {
	t.Helper()
	sim.RegisterAll()
	player := func(name string) *proto.Player {
		gear := &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
		for slot := range gear.Items {
			gear.Items[slot] = &proto.ItemSpec{}
		}
		gear.Items[proto.ItemSlot_ItemSlotTrinket1].Id = 13965
		gear.Items[proto.ItemSlot_ItemSlotTrinket2].Id = 13968
		gear.Items[proto.ItemSlot_ItemSlotMainHand].Id = 9449
		return &proto.Player{
			Name: name, Class: proto.Class_ClassDruid, Race: proto.Race_RaceNightElf, Level: 60,
			Equipment: gear, Rotation: &proto.APLRotation{Type: proto.APLRotation_TypeAPL},
			Spec: &proto.Player_FeralDruid{FeralDruid: &proto.FeralDruid{Options: &proto.FeralDruid_Options{}}},
		}
	}
	raid := core.SinglePlayerRaidProto(player("owner"), nil, nil, nil)
	raid.Parties[0].Players = append(raid.Parties[0].Players, player("other"))
	encounter := core.MakeSingleTargetEncounter(0)
	encounter.Targets = append(encounter.Targets, encounter.Targets[0])
	run := core.NewSim(&proto.RaidSimRequest{
		Raid: raid, Encounter: encounter,
		SimOptions: &proto.SimOptions{Iterations: 1, RandomSeed: 1, Ruleset: ruleset},
	}, simsignals.Signals{})
	run.Options.Interactive = true
	run.Reset()
	characters := []*core.Character{}
	for _, agent := range run.Raid.Parties[0].Players {
		character := agent.GetCharacter()
		character.AutoAttacks.CancelAutoSwing(run)
		characters = append(characters, character)
	}
	return run, characters
}

func TestKfcDrakkisathCooldownAndScope(t *testing.T) {
	run, characters := kfcDrakkisathSimulation(t, proto.Ruleset_RulesetForever)
	owner, other := characters[0], characters[1]
	mark := owner.GetSpell(core.ActionID{ItemID: 13965})
	eye := owner.GetSpell(core.ActionID{ItemID: 13968})
	if mark == nil || eye == nil {
		t.Fatal("Current Drakkisath on-use effects are not registered")
	}
	for _, spell := range []*core.Spell{mark, eye} {
		if spell.CD.Duration != 300*time.Second || spell.SharedCD.Duration != 20*time.Second {
			t.Fatal("Changed current-client item/shared cooldown")
		}
	}
	melee := owner.AutoAttacks.MHAuto()
	target := owner.CurrentTarget
	table := owner.AttackTables[target.UnitIndex][melee.CastType]
	physicalBefore, spellBefore := melee.PhysicalCritChance(table), melee.SpellCritChance(target)
	if !mark.Cast(run, owner.CurrentTarget) || eye.CanCast(run, owner.CurrentTarget) {
		t.Fatal("Trinkets did not share their 20-second category cooldown")
	}
	if math.Abs(melee.PhysicalCritChance(table)-physicalBefore-0.05) > 1e-9 ||
		math.Abs(melee.SpellCritChance(target)-spellBefore-0.05) > 1e-9 {
		t.Fatal("Mark did not affect actual physical and spell crit calculations")
	}
	for ownerIndex, character := range characters {
		for targetIndex, target := range run.Encounter.TargetUnits {
			want := 0.0
			if ownerIndex == 0 && targetIndex == 0 {
				want = 0.05
			}
			for _, table := range character.AttackTables[target.UnitIndex] {
				if math.Abs(table.BonusCritChanceTaken-want) > 1e-9 {
					t.Fatalf("Caster/target-specific crit leaked: owner=%d target=%d", ownerIndex, targetIndex)
				}
			}
		}
	}
	if other.GetStat(stats.MeleeCrit) != owner.GetStat(stats.MeleeCrit) {
		t.Fatal("Mark changed a character's generic melee crit stat")
	}
	run.CurrentTime = 20 * time.Second
	beforeSpell, beforeMelee := owner.GetStat(stats.SpellHit), owner.GetStat(stats.MeleeHit)
	if !eye.Cast(run, owner.CurrentTarget) {
		t.Fatal("Spell-hit use was still blocked after shared cooldown")
	}
	if owner.GetStat(stats.SpellHit) != beforeSpell+7*core.SpellHitRatingPerHitChance || owner.GetStat(stats.MeleeHit) != beforeMelee {
		t.Fatal("Eye of the Beast spell hit is missing, doubled, or leaks to physical attacks")
	}
	if eye.CanCast(run, owner.CurrentTarget) {
		t.Fatal("Eye bypassed its own cooldown")
	}
	owner.GetAura("Eye of the Beast").Deactivate(run)
	if owner.GetStat(stats.SpellHit) != beforeSpell {
		t.Fatal("Spell hit did not expire exactly once")
	}
	// Expire target-owned auras before resetting; no crit may survive an iteration boundary.
	run.Cleanup()
	run.Reset()
	for _, character := range characters {
		for _, target := range run.Encounter.TargetUnits {
			for _, table := range character.AttackTables[target.UnitIndex] {
				if math.Abs(table.BonusCritChanceTaken) > 1e-9 {
					t.Fatal("Target mark survived encounter reset")
				}
			}
		}
	}
	if !mark.Cast(run, run.Encounter.TargetUnits[1]) {
		t.Fatal("Independent iteration did not reset trinket cooldowns")
	}
}

func TestKfcDrakkisathClassicHasNoNewUse(t *testing.T) {
	_, characters := kfcDrakkisathSimulation(t, proto.Ruleset_RulesetClassic)
	for _, character := range characters {
		if character.GetSpell(core.ActionID{ItemID: 13965}) != nil || character.GetSpell(core.ActionID{ItemID: 13968}) != nil {
			t.Fatal("New Forever trinket use leaked into Classic ruleset")
		}
	}
}
