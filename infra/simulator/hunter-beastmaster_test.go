//go:build with_db

package hunter

import (
	"fmt"
	"math"
	"sync"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
)

var beastmasterTestRegister sync.Once

var beastmasterTestIDs = []int32{22013, 22016, 22060, 22011, 22015, 22010, 22017, 22061}
var beastmasterTestSlots = []int{0, 2, 4, 5, 6, 7, 8, 9}

func beastmasterTestItems(t *testing.T) {
	t.Helper()
	types := []proto.ItemType{1, 3, 5, 6, 7, 8, 9, 10}
	for i, id := range beastmasterTestIDs {
		original, existed := core.ItemsByID[id]
		// Neutral armor stats isolate set/equip effects from separately validated imports.
		core.ItemsByID[id] = core.Item{ID: id, Type: types[i], SetID: 515, SetName: "Beastmaster Armor"}
		t.Cleanup(func() {
			if existed {
				core.ItemsByID[id] = original
			} else {
				delete(core.ItemsByID, id)
			}
		})
	}
	const bowID int32 = 99000001
	original, existed := core.ItemsByID[bowID]
	core.ItemsByID[bowID] = core.Item{ID: bowID, Type: proto.ItemType_ItemTypeRanged,
		RangedWeaponType: proto.RangedWeaponType_RangedWeaponTypeBow,
		WeaponDamageMin:  10, WeaponDamageMax: 15, SwingSpeed: 2.8,
		Stats: stats.Stats{stats.Armor: 2000, stats.Stamina: 100,
			stats.MeleeCrit: 2 * core.CritRatingPerCritChance, stats.SpellCrit: 3 * core.SpellCritRatingPerCritChance}}
	t.Cleanup(func() {
		if existed {
			core.ItemsByID[bowID] = original
		} else {
			delete(core.ItemsByID, bowID)
		}
	})
}

func beastmasterTestSim(ids []int32, petType proto.Hunter_Options_PetType, uptime float64, ruleset proto.Ruleset) (*core.Simulation, *Hunter) {
	beastmasterTestRegister.Do(RegisterHunter)
	gear := &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
	for i := range gear.Items {
		gear.Items[i] = &proto.ItemSpec{}
	}
	gear.Items[14].Id, gear.Items[16].Id = 1936, 99000001
	for _, id := range ids {
		for i, known := range beastmasterTestIDs {
			if known == id {
				gear.Items[beastmasterTestSlots[i]].Id = id
			}
		}
	}
	player := &proto.Player{Class: proto.Class_ClassHunter, Race: proto.Race_RaceDwarf,
		Level: 60, Equipment: gear, Rotation: &proto.APLRotation{Type: proto.APLRotation_TypeAPL},
		Spec: &proto.Player_Hunter{Hunter: &proto.Hunter{Options: &proto.Hunter_Options{
			PetType: petType, PetUptime: uptime, PetAttackSpeed: proto.Hunter_Options_Two}}}}
	encounter := core.MakeSingleTargetEncounter(0)
	encounter.Duration, encounter.DurationVariation = 12, 0
	run := core.NewSim(&proto.RaidSimRequest{Raid: core.SinglePlayerRaidProto(player, nil, nil, nil),
		Encounter: encounter, SimOptions: &proto.SimOptions{Iterations: 1, RandomSeed: 1337, Ruleset: ruleset}}, simsignals.Signals{})
	run.Options.Interactive = true
	run.Reset()
	run.PrePull()
	return run, run.Raid.Parties[0].Players[0].(*Hunter)
}

func beastmasterNear(t *testing.T, got, want float64) {
	t.Helper()
	if math.Abs(got-want) > 1e-6 {
		t.Fatalf("got %v want %v", got, want)
	}
}

func beastmasterAdvance(t *testing.T, run *core.Simulation, at time.Duration) {
	t.Helper()
	reached := false
	core.StartDelayedAction(run, core.DelayedActionOptions{DoAt: at, OnAction: func(*core.Simulation) { reached = true }})
	for !reached {
		if run.Step() {
			t.Fatal("simulation ended before marker")
		}
	}
}

func TestKfcBeastmasterBaseSetThresholds(t *testing.T) {
	beastmasterTestItems(t)
	_, baseline := beastmasterTestSim(nil, proto.Hunter_Options_PetNone, 0, proto.Ruleset_RulesetForever)
	for pieces := 0; pieces <= 8; pieces++ {
		t.Run(fmt.Sprint(pieces), func(t *testing.T) {
			_, hunter := beastmasterTestSim(beastmasterTestIDs[:pieces], proto.Hunter_Options_PetNone, 0, proto.Ruleset_RulesetForever)
			counts := map[int32]int{}
			for _, bonus := range hunter.GetActiveSetBonuses() {
				if bonus.Name == "Beastmaster Armor" {
					counts[bonus.NumPieces]++
				}
			}
			for _, threshold := range []int32{2, 4, 6, 8} {
				want := 0
				if pieces >= int(threshold) {
					want = 1
				}
				if !core.ForeverEquipmentBonusSupported(515, threshold) || counts[threshold] != want {
					t.Fatalf("base Beastmaster threshold missing or duplicated: pieces=%d counts=%v", pieces, counts)
				}
			}
			if counts[3] != 0 || counts[5] != 0 {
				t.Fatal("base set inherited alternate thresholds")
			}
			for _, stat := range []stats.Stat{stats.AttackPower, stats.RangedAttackPower, stats.BonusArmor,
				stats.Armor, stats.MP5, stats.ArcaneResistance, stats.FireResistance, stats.FrostResistance,
				stats.NatureResistance, stats.ShadowResistance} {
				want := 0.0
				if pieces >= 6 && (stat == stats.AttackPower || stat == stats.RangedAttackPower) {
					want = 40
				}
				if pieces >= 8 && (stat == stats.Armor || stat == stats.BonusArmor) {
					want = 200
				}
				if pieces >= 2 && (stat == stats.ArcaneResistance || stat == stats.FireResistance ||
					stat == stats.FrostResistance || stat == stats.NatureResistance || stat == stats.ShadowResistance) {
					want = 8
				}
				beastmasterNear(t, hunter.GetStat(stat)-baseline.GetStat(stat), want)
			}
			if (hunter.GetAura("Beastmaster Mana") != nil) != (pieces >= 4) {
				t.Fatal("wrong mana proc threshold")
			}
			if hunter.GetAura("Hunter Armor Energize") != nil {
				t.Fatal("legacy proc duplicated base override")
			}
		})
	}
}

func TestKfcBeastmasterRangedManaProc(t *testing.T) {
	beastmasterTestItems(t)
	run, hunter := beastmasterTestSim(beastmasterTestIDs[:4], proto.Hunter_Options_PetNone, 0, proto.Ruleset_RulesetForever)
	aura := hunter.GetAura("Beastmaster Mana")
	if aura == nil || !aura.IsActive() {
		t.Fatal("base mana proc missing")
	}
	reset := hunter.NewManaMetrics(core.ActionID{SpellID: 1})
	for _, event := range []struct {
		mask     core.ProcMask
		outcome  core.HitOutcome
		eligible bool
	}{
		{core.ProcMaskRangedAuto, core.OutcomeHit, true}, {core.ProcMaskRangedAuto, core.OutcomeCrit, true},
		{core.ProcMaskRangedAuto, core.OutcomeMiss, false}, {core.ProcMaskRangedSpecial, core.OutcomeHit, false},
		{core.ProcMaskMeleeMHAuto, core.OutcomeHit, false}, {core.ProcMaskMeleeOHAuto, core.OutcomeHit, false},
		{core.ProcMaskSpellDamage, core.OutcomeHit, false},
	} {
		procs := 0
		for i := 0; i < 10000; i++ {
			hunter.SpendMana(run, hunter.CurrentMana(), reset)
			aura.OnSpellHitDealt(aura, run, &core.Spell{Unit: &hunter.Unit, ProcMask: event.mask}, &core.SpellResult{Outcome: event.outcome})
			if gain := hunter.CurrentMana(); gain != 0 {
				procs++
				beastmasterNear(t, gain, 200)
			}
		}
		if (event.eligible && (procs < 300 || procs > 450)) || (!event.eligible && procs != 0) {
			t.Fatalf("wrong 4%% ranged-white mask/chance: mask=%v procs=%d", event.mask, procs)
		}
	}
	for i := 0; i < 1000; i++ {
		hunter.AddMana(run, hunter.MaxMana(), reset)
		aura.OnSpellHitDealt(aura, run, &core.Spell{Unit: &hunter.Unit, ProcMask: core.ProcMaskRangedAuto}, &core.SpellResult{Outcome: core.OutcomeHit})
		beastmasterNear(t, hunter.CurrentMana(), hunter.MaxMana())
	}
}

func TestKfcBeastmasterPetEffects(t *testing.T) {
	beastmasterTestItems(t)
	for _, petType := range []proto.Hunter_Options_PetType{proto.Hunter_Options_Cat, proto.Hunter_Options_WindSerpent} {
		_, baseline := beastmasterTestSim(nil, petType, 1, proto.Ruleset_RulesetForever)
		for _, row := range []struct{ itemID, spellID int32 }{{22013, 27039}, {22015, 27042}, {22060, 27208}, {22061, 27205}} {
			t.Run(fmt.Sprintf("pet=%v/item=%d", petType, row.itemID), func(t *testing.T) {
				run, hunter := beastmasterTestSim([]int32{row.itemID}, petType, 1, proto.Ruleset_RulesetForever)
				aura := hunter.pet.GetAura(fmt.Sprintf("Beastmaster Pet %d", row.spellID))
				if aura == nil || !aura.IsActive() || aura.Duration != 4*time.Second {
					t.Fatal("pet child aura absent or wrong duration")
				}
				for iteration := 0; iteration < 3; iteration++ {
					wantHealth, wantCrit, wantDamage := baseline.pet.GetStat(stats.Health), baseline.pet.GetStat(stats.MeleeCrit), baseline.pet.PseudoStats.DamageDealtMultiplier
					if row.itemID == 22013 {
						wantHealth *= 1.03
					}
					if row.itemID == 22015 {
						wantCrit += 2 * core.CritRatingPerCritChance
					}
					if row.itemID == 22061 {
						wantDamage *= 1.03
					}
					beastmasterNear(t, hunter.pet.GetStat(stats.Health), wantHealth)
					beastmasterNear(t, hunter.pet.GetStat(stats.MeleeCrit), wantCrit)
					beastmasterNear(t, hunter.pet.GetStat(stats.SpellCrit), baseline.pet.GetStat(stats.SpellCrit))
					beastmasterNear(t, hunter.pet.PseudoStats.DamageDealtMultiplier, wantDamage)
					beastmasterNear(t, hunter.pet.Armor(), baseline.pet.Armor())
					beastmasterNear(t, hunter.PseudoStats.DamageDealtMultiplier, baseline.PseudoStats.DamageDealtMultiplier)
					beastmasterNear(t, hunter.GetStat(stats.MeleeCrit), baseline.GetStat(stats.MeleeCrit))
					beastmasterAdvance(t, run, 3*time.Second+time.Nanosecond)
					if aura.ExpiresAt() != 7*time.Second {
						t.Fatal("3-second refresh did not retain 4-second child duration")
					}
					run.Cleanup()
					run.Reset()
					run.PrePull()
				}
			})
		}
	}
}

func TestKfcBeastmasterPetDismissalAndLaterEnable(t *testing.T) {
	beastmasterTestItems(t)
	run, hunter := beastmasterTestSim(beastmasterTestIDs, proto.Hunter_Options_Cat, 1, proto.Ruleset_RulesetForever)
	labels := []string{"Beastmaster Pet 27039", "Beastmaster Pet 27042", "Beastmaster Pet 27208", "Beastmaster Pet 27205"}
	hunter.pet.Disable(run)
	for _, label := range labels {
		if hunter.pet.GetAura(label).IsActive() {
			t.Fatal("dismissed pet retained buff")
		}
	}
	beastmasterAdvance(t, run, time.Second)
	hunter.pet.Enable(run, hunter.pet)
	for _, label := range labels {
		if hunter.pet.GetAura(label).IsActive() {
			t.Fatal("later pet enable gained buff before refresh")
		}
	}
	beastmasterAdvance(t, run, 3*time.Second+time.Nanosecond)
	for _, label := range labels {
		if !hunter.pet.GetAura(label).IsActive() {
			t.Fatal("later pet enable missed periodic refresh")
		}
	}
	fixture := core.NewPet("Base armor fixture", &hunter.Character, stats.Stats{stats.Armor: 1000}, nil, false, false)
	fixture.AddStat(stats.Armor, 9000)
	beastmasterNear(t, beastmasterPetBaseArmorBonus(&fixture), 100)
}

func TestKfcBeastmasterIsolation(t *testing.T) {
	beastmasterTestItems(t)
	_, classicBaseline := beastmasterTestSim(nil, proto.Hunter_Options_Cat, 1, proto.Ruleset_RulesetClassic)
	for _, id := range []int32{22013, 22015, 22060, 22061} {
		_, hunter := beastmasterTestSim([]int32{id}, proto.Hunter_Options_Cat, 1, proto.Ruleset_RulesetClassic)
		for _, stat := range []stats.Stat{stats.Health, stats.MeleeCrit, stats.SpellCrit, stats.Armor} {
			beastmasterNear(t, hunter.pet.GetStat(stat), classicBaseline.pet.GetStat(stat))
		}
		beastmasterNear(t, hunter.pet.PseudoStats.DamageDealtMultiplier, classicBaseline.pet.PseudoStats.DamageDealtMultiplier)
	}
	for _, uptime := range []float64{0, -1} {
		_, hunter := beastmasterTestSim(beastmasterTestIDs, proto.Hunter_Options_Cat, uptime, proto.Ruleset_RulesetForever)
		if hunter.pet != nil {
			t.Fatal("zero-uptime pet should remain absent")
		}
	}
	for _, alternate := range []bool{false, true} {
		if alternate {
			for _, id := range beastmasterTestIDs {
				item := core.ItemsByID[id]
				item.SetID = 1669
				core.ItemsByID[id] = item
			}
		}
		ruleset := proto.Ruleset_RulesetClassic
		if alternate {
			ruleset = proto.Ruleset_RulesetForever
		}
		_, hunter := beastmasterTestSim(beastmasterTestIDs, proto.Hunter_Options_PetNone, 0, ruleset)
		if hunter.GetAura("Beastmaster Mana") != nil {
			t.Fatal("base set override leaked into Classic/alternate")
		}
		if hunter.GetAura("Hunter Armor Energize") == nil {
			t.Fatal("legacy alternate/Classic handler was removed")
		}
	}
}

func TestKfcBeastmasterPetRangeAndExpiry(t *testing.T) {
	beastmasterTestItems(t)
	run, hunter := beastmasterTestSim(beastmasterTestIDs, proto.Hunter_Options_Cat, 1, proto.Ruleset_RulesetForever)
	labels := []string{"Beastmaster Pet 27039", "Beastmaster Pet 27042", "Beastmaster Pet 27208", "Beastmaster Pet 27205"}
	buffedDamage := hunter.pet.PseudoStats.DamageDealtMultiplier
	hunter.DistanceFromTarget = 150
	beastmasterAdvance(t, run, 4*time.Second+time.Nanosecond)
	for _, label := range labels {
		if hunter.pet.GetAura(label).IsActive() {
			t.Fatal("out-of-range pet retained expired buff")
		}
	}
	beastmasterNear(t, hunter.pet.PseudoStats.DamageDealtMultiplier, buffedDamage/1.03)
	hunter.DistanceFromTarget = 30
	beastmasterAdvance(t, run, 6*time.Second+time.Nanosecond)
	for _, label := range labels {
		if !hunter.pet.GetAura(label).IsActive() {
			t.Fatal("in-range pet missed next owner refresh")
		}
	}
	beastmasterNear(t, hunter.pet.PseudoStats.DamageDealtMultiplier, buffedDamage)
	run.Cleanup()
	hunter.StartDistanceFromTarget = 150
	run.Reset()
	run.PrePull()
	for _, label := range labels {
		if hunter.pet.GetAura(label).IsActive() {
			t.Fatal("out-of-range prepull pet gained buff")
		}
	}
}
