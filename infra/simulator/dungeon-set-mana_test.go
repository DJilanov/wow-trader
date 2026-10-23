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

func TestKfcDungeonSetMana(t *testing.T) {
	sim.RegisterAll()
	for _, tc := range []struct {
		id    int32
		name  string
		aura  string
		items [6]int32
	}{
		{181, "Magister's Regalia", "Sudden Insight", [6]int32{16686, 16689, 16688, 16684, 16687, 16682}},
		{182, "Vestments of the Devout", "Sudden Insight", [6]int32{16693, 16695, 16690, 16692, 16694, 16691}},
		{186, "Beaststalker Armor", "Hunter Armor Energize", [6]int32{16677, 16679, 16674, 16676, 16678, 16675}},
	} {
		for _, pieces := range []int{4, 5, 6} {
			t.Run(fmt.Sprintf("%d/%d", tc.id, pieces), func(t *testing.T) {
				gear := &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
				for slot := range gear.Items {
					gear.Items[slot] = &proto.ItemSpec{}
				}
				for index, slot := range []int{0, 2, 4, 6, 8, 9} {
					if index < pieces {
						gear.Items[slot].Id = tc.items[index]
					}
				}
				player := &proto.Player{
					Class: proto.Class_ClassMage, Race: proto.Race_RaceHuman, Level: 60,
					Equipment: gear,
					Rotation:  &proto.APLRotation{Type: proto.APLRotation_TypeAPL},
					Spec:      &proto.Player_Mage{Mage: &proto.Mage{Options: &proto.Mage_Options{}}},
				}
				if tc.id == 186 {
					player.Class = proto.Class_ClassHunter
					player.Race = proto.Race_RaceDwarf
					player.Spec = &proto.Player_Hunter{Hunter: &proto.Hunter{Options: &proto.Hunter_Options{}}}
				}
				run := core.NewSim(&proto.RaidSimRequest{
					Raid:       core.SinglePlayerRaidProto(player, nil, nil, nil),
					Encounter:  core.MakeSingleTargetEncounter(0),
					SimOptions: &proto.SimOptions{Iterations: 1, RandomSeed: 1337, Ruleset: proto.Ruleset_RulesetForever},
				}, simsignals.Signals{})
				run.Options.Interactive = true
				run.Reset()
				character := run.Raid.Parties[0].Players[0].GetCharacter()
				counts := make(map[int32]int)
				for _, bonus := range character.GetActiveSetBonuses() {
					if bonus.Name == tc.name {
						counts[bonus.NumPieces]++
					}
				}
				if counts[2] != 1 || counts[3] != 1 || counts[4] != 0 {
					t.Fatalf("flat or unsupported utility thresholds changed: %v", counts)
				}
				if pieces == 6 && counts[6] != 1 {
					t.Fatalf("six-piece MP5 must apply exactly once: %v", counts)
				}
				aura := character.GetAura(tc.aura)
				if pieces == 4 {
					if counts[5] != 0 || aura != nil {
						t.Fatal("five-piece mana proc registered with four pieces")
					}
					return
				}
				if counts[5] != 1 || aura == nil || !aura.IsActive() {
					t.Fatalf("five-piece mana proc not registered exactly once: %v", counts)
				}
				if !core.ForeverEquipmentBonusSupported(tc.id, 5) || core.ForeverEquipmentBonusSupported(tc.id, 4) {
					t.Fatal("set support API disagrees with the implemented mana/unsupported utility thresholds")
				}
				metrics := character.NewManaMetrics(core.ActionID{SpellID: 1})
				invoke := func(mask core.ProcMask, outcome core.HitOutcome) float64 {
					character.AddMana(run, character.MaxMana(), metrics)
					character.SpendMana(run, 200, metrics)
					before := character.CurrentMana()
					spell := &core.Spell{Unit: &character.Unit, ProcMask: mask}
					if tc.id == 186 {
						aura.OnSpellHitDealt(aura, run, spell, &core.SpellResult{Outcome: outcome})
					} else {
						aura.OnCastComplete(aura, run, spell)
					}
					return character.CurrentMana() - before
				}
				masks := []core.ProcMask{core.ProcMaskSpellDamage, core.ProcMaskSpellHealing}
				wrongMask := core.ProcMaskMeleeMHAuto
				if tc.id == 186 {
					masks = []core.ProcMask{core.ProcMaskMeleeMHAuto, core.ProcMaskRangedAuto}
					wrongMask = core.ProcMaskSpellDamage
				}
				for _, mask := range masks {
					procs := 0
					for event := 0; event < 2000; event++ {
						delta := invoke(mask, core.OutcomeHit)
						if math.Abs(delta-200) < 0.00001 {
							procs++
						} else if delta != 0 {
							t.Fatalf("unexpected mana payload: %g", delta)
						}
					}
					if procs < 50 || procs > 150 {
						t.Fatalf("fixed-seed 5%% proc smoke outside bounds: %d/2000", procs)
					}
				}
				for event := 0; event < 2000; event++ {
					if invoke(wrongMask, core.OutcomeHit) != 0 {
						t.Fatal("wrong event type triggered mana recovery")
					}
					if tc.id == 186 && invoke(core.ProcMaskRangedAuto, core.OutcomeMiss) != 0 {
						t.Fatal("missed autoattack triggered mana recovery")
					}
				}
			})
		}
	}
}

func TestKfcDungeonSetManaDoesNotEnableOtherUnsupportedEffects(t *testing.T) {
	sim.RegisterAll()
	for _, tc := range []struct {
		id   int32
		name string
	}{
		{183, "Dreadmist Raiment"}, {184, "Shadowcraft Armor"}, {185, "Wildheart Raiment"},
		{187, "The Elements"}, {188, "Lightforge Armor"}, {189, "Battlegear of Valor"},
	} {
		// The optional tank model separately qualifies Valor. Its dedicated
		// threshold/proc regression owns that effect when it is installed.
		if tc.id == 189 && core.ForeverEquipmentBonusSupported(tc.id, 5) {
			continue
		}
		if core.ForeverEquipmentBonusSupported(tc.id, 5) {
			t.Fatalf("unreviewed set %d was advertised as supported", tc.id)
		}
		character := &core.Character{Unit: core.Unit{Env: &core.Environment{Ruleset: proto.Ruleset_RulesetForever}}}
		for slot := 0; slot < 5; slot++ {
			character.Equipment[slot] = core.Item{SetID: tc.id, SetName: tc.name}
		}
		for _, bonus := range character.GetActiveSetBonuses() {
			if bonus.NumPieces == 4 || bonus.NumPieces == 5 {
				t.Fatalf("unreviewed effect activated for set %d/%d", tc.id, bonus.NumPieces)
			}
		}
	}
}
