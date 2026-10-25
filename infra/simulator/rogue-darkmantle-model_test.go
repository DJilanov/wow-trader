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
	"github.com/wowsims/classic/sim/core/stats"
)

func TestKfcDarkmantleBaseSetThresholds(t *testing.T) {
	sim.RegisterAll()
	ids := []int32{22005, 22008, 22009, 22004, 22006, 22002, 22007, 22003}
	slots := []int{0, 2, 4, 5, 6, 7, 8, 9}
	types := []proto.ItemType{1, 3, 5, 6, 7, 8, 9, 10}
	// Neutral item stats isolate thresholds from the eight independently tested stat imports.
	for i, id := range ids {
		original, existed := core.ItemsByID[id]
		core.ItemsByID[id] = core.Item{ID: id, Type: types[i], SetID: 512, SetName: "Darkmantle Armor"}
		t.Cleanup(func() {
			if existed {
				core.ItemsByID[id] = original
			} else {
				delete(core.ItemsByID, id)
			}
		})
	}
	makeRun := func(pieces int, kings bool, ruleset proto.Ruleset) *core.Simulation {
		gear := &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
		for slot := range gear.Items {
			gear.Items[slot] = &proto.ItemSpec{}
		}
		gear.Items[14].Id, gear.Items[15].Id = 1936, 1936
		for i := 0; i < pieces; i++ {
			gear.Items[slots[i]].Id = ids[i]
		}
		player := &proto.Player{
			Class: proto.Class_ClassRogue, Race: proto.Race_RaceHuman, Level: 60,
			Equipment: gear, Rotation: &proto.APLRotation{Type: proto.APLRotation_TypeAPL},
			Buffs: &proto.IndividualBuffs{BlessingOfKings: kings},
			Spec:  &proto.Player_Rogue{Rogue: &proto.Rogue{Options: &proto.RogueOptions{}}},
		}
		run := core.NewSim(&proto.RaidSimRequest{
			Raid: core.SinglePlayerRaidProto(player, nil, nil, nil), Encounter: core.MakeSingleTargetEncounter(0),
			SimOptions: &proto.SimOptions{Iterations: 1, RandomSeed: 1337, Ruleset: ruleset},
		}, simsignals.Signals{})
		run.Options.Interactive = true
		run.Reset()
		return run
	}
	for _, kings := range []bool{false, true} {
		t.Run(fmt.Sprintf("kings=%t", kings), func(t *testing.T) {
			var baseline stats.Stats
			for pieces := 0; pieces <= 8; pieces++ {
				t.Run(fmt.Sprint(pieces), func(t *testing.T) {
					run := makeRun(pieces, kings, proto.Ruleset_RulesetForever)
					c := run.Raid.Parties[0].Players[0].GetCharacter()
					if c.Equipment[14].ID != 1936 || c.Equipment[15].ID != 1936 {
						t.Fatal("Rogue proc fixture must retain two legal one-hand daggers")
					}
					if pieces == 0 {
						for stat := stats.Stat(0); stat < stats.Len; stat++ {
							baseline[stat] = c.GetStat(stat)
						}
					}
					counts := map[int32]int{}
					for _, bonus := range c.GetActiveSetBonuses() {
						if bonus.Name == "Darkmantle Armor" {
							counts[bonus.NumPieces]++
						}
					}
					for _, threshold := range []int32{2, 4, 6, 8} {
						want := 0
						if pieces >= int(threshold) {
							want = 1
						}
						if !core.ForeverEquipmentBonusSupported(512, threshold) || counts[threshold] != want {
							t.Fatalf("base Darkmantle threshold missing or duplicated: pieces=%d counts=%v", pieces, counts)
						}
					}
					if counts[3] != 0 || counts[5] != 0 {
						t.Fatal("base Darkmantle inherited alternate utility thresholds")
					}
					for _, stat := range []stats.Stat{stats.Strength, stats.Agility, stats.AttackPower, stats.RangedAttackPower,
						stats.BonusArmor, stats.Armor, stats.ArcaneResistance, stats.FireResistance, stats.FrostResistance,
						stats.NatureResistance, stats.ShadowResistance} {
						want := 0.0
						if pieces >= 6 && (stat == stats.AttackPower || stat == stats.RangedAttackPower) {
							want = 40
						}
						if pieces >= 8 && (stat == stats.BonusArmor || stat == stats.Armor) {
							want = 200
						}
						if pieces >= 2 && (stat == stats.ArcaneResistance || stat == stats.FireResistance || stat == stats.FrostResistance || stat == stats.NatureResistance || stat == stats.ShadowResistance) {
							want = 8
						}
						if got := c.GetStat(stat) - baseline[stat]; math.Abs(got-want) > 1e-7 {
							t.Fatalf("base Darkmantle stat %v: got %v want %v", stat, got, want)
						}
					}
					aura := c.GetAura("Darkmantle Energy")
					if pieces < 4 {
						if aura != nil {
							t.Fatal("base Darkmantle proc granted before four pieces")
						}
						return
					}
					if aura == nil || !aura.IsActive() || c.GetAura("Rogue Armor Energize") != nil {
						t.Fatal("base Darkmantle proc missing, inactive or duplicated by legacy handler")
					}
					reset := c.NewEnergyMetrics(core.ActionID{SpellID: 1})
					for _, event := range []struct {
						mask     core.ProcMask
						outcome  core.HitOutcome
						eligible bool
					}{
						{core.ProcMaskMeleeMHAuto, core.OutcomeHit, true},
						{core.ProcMaskMeleeOHAuto, core.OutcomeHit, true},
						{core.ProcMaskMeleeMHAuto, core.OutcomeCrit, true},
						{core.ProcMaskMeleeMHAuto, core.OutcomeMiss, false},
						{core.ProcMaskMeleeMHAuto, core.OutcomeDodge, false},
						{core.ProcMaskMeleeMHSpecial, core.OutcomeHit, false},
						{core.ProcMaskSpellDamage, core.OutcomeHit, false},
						{core.ProcMaskRangedAuto, core.OutcomeHit, false},
					} {
						procs := 0
						for attempt := 0; attempt < 1000; attempt++ {
							c.SpendEnergy(run, c.CurrentEnergy(), reset)
							aura.OnSpellHitDealt(aura, run, &core.Spell{Unit: &c.Unit, ProcMask: event.mask}, &core.SpellResult{Outcome: event.outcome})
							gain := c.CurrentEnergy()
							if gain != 0 {
								procs++
								if gain != 20 {
									t.Fatalf("base Darkmantle energy payload: got %v want 20", gain)
								}
							}
						}
						if (event.eligible && (procs == 0 || procs > 150)) || (!event.eligible && procs != 0) {
							t.Fatalf("base Darkmantle reference cadence/mask mismatch: mask=%v procs=%d", event.mask, procs)
						}
					}
					cappedProcs := 0
					for attempt := 0; attempt < 1000; attempt++ {
						c.SpendEnergy(run, c.CurrentEnergy(), reset)
						c.AddEnergy(run, c.MaxEnergy()-5, reset)
						aura.OnSpellHitDealt(aura, run, &core.Spell{Unit: &c.Unit, ProcMask: core.ProcMaskMeleeMHAuto}, &core.SpellResult{Outcome: core.OutcomeHit})
						if c.CurrentEnergy() == c.MaxEnergy() {
							cappedProcs++
						} else if c.CurrentEnergy() != c.MaxEnergy()-5 {
							t.Fatal("base Darkmantle energy cap was exceeded or payload changed")
						}
					}
					if cappedProcs == 0 {
						t.Fatal("base Darkmantle never exercised capped energy")
					}
				})
			}
		})
	}
	t.Run("classic-and-alternate-isolation", func(t *testing.T) {
		classic := makeRun(8, false, proto.Ruleset_RulesetClassic).Raid.Parties[0].Players[0].GetCharacter()
		if classic.GetAura("Darkmantle Energy") != nil {
			t.Fatal("base Forever override leaked into Classic")
		}
		for _, id := range ids {
			item := core.ItemsByID[id]
			item.SetID = 1676
			core.ItemsByID[id] = item
		}
		alternate := makeRun(8, false, proto.Ruleset_RulesetForever).Raid.Parties[0].Players[0].GetCharacter()
		if alternate.GetAura("Darkmantle Energy") != nil {
			t.Fatal("base Forever override leaked into alternate set 1676")
		}
	})
}
