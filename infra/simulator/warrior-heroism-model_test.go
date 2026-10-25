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

func TestKfcHeroismBaseSetThresholds(t *testing.T) {
	sim.RegisterAll()
	ids := []int32{21999, 22001, 21997, 21996, 21998, 21994, 22000, 21995}
	slots := []int{0, 2, 4, 5, 6, 7, 8, 9}
	types := []proto.ItemType{1, 3, 5, 6, 7, 8, 9, 10}
	// Zero item stats isolate the set effects; this never changes a production catalog.
	for index, id := range ids {
		original, existed := core.ItemsByID[id]
		core.ItemsByID[id] = core.Item{ID: id, Type: types[index], SetID: 511, SetName: "Battlegear of Heroism"}
		t.Cleanup(func() {
			if existed {
				core.ItemsByID[id] = original
			} else {
				delete(core.ItemsByID, id)
			}
		})
	}
	for _, tank := range []bool{false, true} {
		for _, kings := range []bool{false, true} {
			t.Run(fmt.Sprintf("tank=%t/kings=%t", tank, kings), func(t *testing.T) {
				var baseline stats.Stats
				for pieces := 0; pieces <= 8; pieces++ {
					t.Run(fmt.Sprint(pieces), func(t *testing.T) {
						gear := &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
						for slot := range gear.Items {
							gear.Items[slot] = &proto.ItemSpec{}
						}
						gear.Items[14].Id = 11964
						for index := 0; index < pieces; index++ {
							gear.Items[slots[index]].Id = ids[index]
						}
						player := &proto.Player{Class: proto.Class_ClassWarrior, Race: proto.Race_RaceHuman,
							Level: 60, Equipment: gear, Rotation: &proto.APLRotation{Type: proto.APLRotation_TypeAPL},
							Buffs: &proto.IndividualBuffs{BlessingOfKings: kings},
							Spec:  &proto.Player_Warrior{Warrior: &proto.Warrior{Options: &proto.Warrior_Options{}}}}
						if tank {
							player.Spec = &proto.Player_TankWarrior{TankWarrior: &proto.TankWarrior{Options: &proto.TankWarrior_Options{}}}
						}
						run := core.NewSim(&proto.RaidSimRequest{
							Raid:       core.SinglePlayerRaidProto(player, nil, nil, nil),
							Encounter:  core.MakeSingleTargetEncounter(0),
							SimOptions: &proto.SimOptions{Iterations: 1, RandomSeed: 1337, Ruleset: proto.Ruleset_RulesetForever},
						}, simsignals.Signals{})
						run.Options.Interactive = true
						run.Reset()
						c := run.Raid.Parties[0].Players[0].GetCharacter()
						if pieces == 0 {
							for stat := stats.Stat(0); stat < stats.Len; stat++ {
								baseline[stat] = c.GetStat(stat)
							}
						}
						counts := map[int32]int{}
						for _, bonus := range c.GetActiveSetBonuses() {
							if bonus.Name == "Battlegear of Heroism" {
								counts[bonus.NumPieces]++
							}
						}
						for _, threshold := range []int32{2, 4, 6, 8} {
							want := 0
							if pieces >= int(threshold) {
								want = 1
							}
							if !core.ForeverEquipmentBonusSupported(511, threshold) || counts[threshold] != want {
								t.Fatalf("base Heroism threshold missing or duplicated: pieces=%d counts=%v", pieces, counts)
							}
						}
						if counts[3] != 0 || counts[5] != 0 {
							t.Fatal("base Heroism received alternate-set utility thresholds")
						}
						for _, stat := range []stats.Stat{stats.Strength, stats.AttackPower, stats.RangedAttackPower, stats.BonusArmor, stats.ArcaneResistance} {
							want := 0.0
							if pieces >= 6 && (stat == stats.AttackPower || stat == stats.RangedAttackPower) {
								want = 40
							}
							if pieces >= 8 && stat == stats.BonusArmor {
								want = 200
							}
							if pieces >= 2 && stat == stats.ArcaneResistance {
								want = 8
							}
							if got := c.GetStat(stat) - baseline[stat]; math.Abs(got-want) > 1e-7 {
								t.Fatalf("base Heroism stat %v: got %v want %v", stat, got, want)
							}
						}
						aura := c.GetAura("Heroism Health")
						if pieces < 4 {
							if aura != nil {
								t.Fatal("base Heroism proc granted before four pieces")
							}
							return
						}
						if aura == nil || !aura.IsActive() || c.GetAura("Warrior's Resolve") != nil {
							t.Fatal("base Heroism health proc missing, inactive or mixed with alternate rage proc")
						}
						spending := c.NewRageMetrics(core.ActionID{SpellID: 1})
						resetHealth := c.NewHealthMetrics(core.ActionID{SpellID: 1})
						for _, event := range []struct {
							mask     core.ProcMask
							outcome  core.HitOutcome
							eligible bool
						}{
							{core.ProcMaskMeleeMHAuto, core.OutcomeHit, true},
							{core.ProcMaskMeleeMHAuto, core.OutcomeMiss, false},
							{core.ProcMaskMeleeMHSpecial, core.OutcomeHit, false},
							{core.ProcMaskSpellDamage, core.OutcomeHit, false},
						} {
							procs := 0
							for attempt := 0; attempt < 1000; attempt++ {
								c.SpendRage(run, c.CurrentRage(), spending)
								c.GainHealth(run, c.MaxHealth(), resetHealth)
								c.RemoveHealth(run, 500)
								before := c.CurrentHealth()
								aura.OnSpellHitDealt(aura, run, &core.Spell{Unit: &c.Unit, ProcMask: event.mask}, &core.SpellResult{Outcome: event.outcome})
								gain := c.CurrentHealth() - before
								if gain != 0 {
									procs++
									if gain < 88 || gain > 132 {
										t.Fatalf("base Heroism healing payload out of range: %v", gain)
									}
								}
								if c.CurrentRage() != 0 {
									t.Fatal("base Heroism healing proc incorrectly grants rage")
								}
							}
							if (event.eligible && (procs == 0 || procs > 150)) || (!event.eligible && procs != 0) {
								t.Fatalf("base Heroism proc reference cadence/mask mismatch: %d", procs)
							}
						}
					})
				}
			})
		}
	}
}
