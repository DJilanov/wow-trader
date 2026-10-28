//go:build with_db

package fivecontrols_test

import (
	"fmt"
	"math"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
	"github.com/wowsims/classic/sim/shaman"
	"github.com/wowsims/classic/sim/shaman/elemental"
	"github.com/wowsims/classic/sim/shaman/enhancement"
)

var combatFiveRegistration sync.Once

func combatFiveFixture(role string, pieces int, kings bool) (*core.Simulation, *core.Character) {
	combatFiveRegistration.Do(func() { elemental.RegisterElementalShaman(); enhancement.RegisterEnhancementShaman() })
	player := &proto.Player{Class: proto.Class_ClassShaman, Race: proto.Race_RaceOrc, Level: 60,
		Equipment: &proto.EquipmentSpec{}, Rotation: &proto.APLRotation{Type: proto.APLRotation_TypeAPL},
		Buffs: &proto.IndividualBuffs{BlessingOfKings: kings}}
	if role == "enhancement" {
		player.Spec = &proto.Player_EnhancementShaman{EnhancementShaman: &proto.EnhancementShaman{Options: &proto.EnhancementShaman_Options{}}}
	} else {
		player.Spec = &proto.Player_ElementalShaman{ElementalShaman: &proto.ElementalShaman{Options: &proto.ElementalShaman_Options{}}}
	}
	for index := 0; index < pieces; index++ {
		player.Equipment.Items = append(player.Equipment.Items, &proto.ItemSpec{Id: int32(22095 + index)})
	}
	encounter := core.MakeSingleTargetEncounter(0)
	encounter.Duration, encounter.DurationVariation = 180, 0
	sim := core.NewSim(&proto.RaidSimRequest{Raid: core.SinglePlayerRaidProto(player, nil, nil, nil), Encounter: encounter,
		SimOptions: &proto.SimOptions{Iterations: 1, RandomSeed: 1337, Ruleset: proto.Ruleset_RulesetForever}}, simsignals.Signals{})
	sim.Options.Interactive = true
	sim.Reset()
	sim.PrePull()
	return sim, sim.Raid.Parties[0].Players[0].GetCharacter()
}

func combatFiveNear(t *testing.T, actual, expected float64) {
	t.Helper()
	if math.Abs(actual-expected) > 1e-7 {
		t.Fatalf("got %g, expected %g", actual, expected)
	}
}

func TestKFCCombatFiveCatalog(t *testing.T) {
	seen := map[proto.ItemType]bool{}
	for id := int32(22095); id <= 22102; id++ {
		item, exists := core.ItemsByID[id]
		if !exists || item.SetID != 519 || item.SetName != "The Five Thunders" || len(item.ClassAllowlist) != 0 || seen[item.Type] {
			t.Fatal("Invalid current base Five Thunders row", id, item)
		}
		seen[item.Type] = true
	}
}

func TestKFCCombatFiveActualThresholds(t *testing.T) {
	for _, role := range []string{"elemental", "enhancement"} {
		for _, kings := range []bool{false, true} {
			_, baseline := combatFiveFixture(role, 0, kings)
			for pieces := 0; pieces <= 8; pieces++ {
				t.Run(fmt.Sprintf("%s/kings-%t/%d", role, kings, pieces), func(t *testing.T) {
					_, character := combatFiveFixture(role, pieces, kings)
					var actual, expected []int32
					for _, bonus := range character.GetActiveSetBonuses() {
						if bonus.Name == "The Five Thunders" {
							actual = append(actual, bonus.NumPieces)
						}
					}
					for _, threshold := range []int32{2, 4, 6, 8} {
						if pieces >= int(threshold) {
							expected = append(expected, threshold)
						}
					}
					if !reflect.DeepEqual(actual, expected) {
						t.Fatal("Missing, alternate or duplicate threshold", actual, expected)
					}
					gear, baseGear := character.Equipment.Stats(), baseline.Equipment.Stats()
					for stat := stats.Stat(0); stat < stats.Len; stat++ {
						gear[stat] -= baseGear[stat]
					}
					resistance, power, armor := 0.0, 0.0, 0.0
					if pieces >= 2 {
						resistance = 8
					}
					if pieces >= 6 {
						power = 23
					}
					if pieces >= 8 {
						armor = 200
					}
					for _, stat := range []stats.Stat{stats.ArcaneResistance, stats.FireResistance, stats.FrostResistance, stats.NatureResistance, stats.ShadowResistance} {
						combatFiveNear(t, character.GetStat(stat)-baseline.GetStat(stat)-gear[stat], resistance)
					}
					multiplier := 1.0
					if kings {
						multiplier = 1.1
					}
					combatFiveNear(t, character.GetStat(stats.SpellPower)-baseline.GetStat(stats.SpellPower)-gear[stats.SpellPower], power)
					combatFiveNear(t, character.GetStat(stats.SpellDamage)-baseline.GetStat(stats.SpellDamage)-gear[stats.SpellDamage], 0)
					combatFiveNear(t, character.GetStat(stats.HealingPower)-baseline.GetStat(stats.HealingPower)-gear[stats.HealingPower], 0)
					combatFiveNear(t, character.GetStat(stats.MP5)-baseline.GetStat(stats.MP5)-gear[stats.MP5], 0)
					combatFiveNear(t, character.GetStat(stats.BonusArmor)-baseline.GetStat(stats.BonusArmor)-gear[stats.BonusArmor], armor)
					combatFiveNear(t, character.GetStat(stats.Armor)-baseline.GetStat(stats.Armor)-gear[stats.Armor]-2*multiplier*gear[stats.Agility], armor)
					if (character.GetAura("Five Thunders completed-cast reference") != nil) != (pieces >= 4) {
						t.Fatal("Wrong proc threshold")
					}
				})
			}
		}
	}
}

func TestKFCCombatFiveIdentityIsolation(t *testing.T) {
	_, character := combatFiveFixture("elemental", 0, false)
	var equipment core.Equipment
	for index := 0; index < 8; index++ {
		equipment[index] = core.Item{ID: int32(22095 + index), SetID: 519, SetName: "localized"}
	}
	character.Equipment = equipment
	if len(character.GetActiveSetBonuses()) != 4 {
		t.Fatal("Display name affected base identity")
	}
	for index := range equipment {
		equipment[index].SetID = 1679
		equipment[index].SetName = "The Five Thunders"
	}
	character.Equipment = equipment
	var alternate []int32
	for _, bonus := range character.GetActiveSetBonuses() {
		if bonus.Name == "The Five Thunders" {
			alternate = append(alternate, bonus.NumPieces)
		}
	}
	if !reflect.DeepEqual(alternate, []int32{2, 3, 4, 5, 6}) {
		t.Fatal("Alternate parent definition changed", alternate)
	}
	for index := 0; index < 2; index++ {
		equipment[index].SetID = 519
	}
	character.Equipment = equipment
	var base []int32
	for _, bonus := range character.GetActiveSetBonuses() {
		if bonus.Name == "The Five Thunders" {
			base = append(base, bonus.NumPieces)
		}
	}
	if !reflect.DeepEqual(base, []int32{2, 2, 3, 4, 5, 6}) {
		t.Fatal("Base and alternate counts merged", base)
	}
	for index := range equipment {
		equipment[index].SetID = 519
		equipment[index].SetName = "The Five Thunders"
	}
	character.Equipment = equipment
	classic := *character
	env := *character.Env
	env.Ruleset = proto.Ruleset_RulesetClassic
	classic.Env = &env
	var legacy []int32
	for _, bonus := range classic.GetActiveSetBonuses() {
		if bonus.Name == "The Five Thunders" {
			legacy = append(legacy, bonus.NumPieces)
		}
	}
	if !reflect.DeepEqual(legacy, []int32{2, 3, 4, 5, 6}) {
		t.Fatal("Classic parent behavior changed", legacy)
	}
	other := *character
	other.Class = proto.Class_ClassWarrior
	if len(other.GetActiveSetBonuses()) != 0 {
		t.Fatal("Reference applied outside Shaman")
	}
}

func TestKFCCombatFiveReferenceEligibility(t *testing.T) {
	_, character := combatFiveFixture("elemental", 4, false)
	for _, control := range []struct {
		mask    core.ProcMask
		flags   core.SpellFlag
		allowed bool
	}{
		{core.ProcMaskSpellDamage, shaman.SpellFlagShaman, true},
		{core.ProcMaskSpellHealing, shaman.SpellFlagShaman, true},
		{core.ProcMaskMeleeMHAuto, shaman.SpellFlagShaman, false},
		{core.ProcMaskMeleeMHSpecial, shaman.SpellFlagShaman, false},
		{core.ProcMaskRangedAuto, shaman.SpellFlagShaman, false},
		{core.ProcMaskSpellDamageProc, shaman.SpellFlagShaman, false},
		{core.ProcMaskSpellDamage, 0, false},
		{core.ProcMaskSpellDamage, shaman.SpellFlagShaman | core.SpellFlagPassiveSpell, false},
	} {
		spell := &core.Spell{Unit: &character.Unit, ProcMask: control.mask, Flags: control.flags}
		if core.ForeverFiveThundersCastReference(character, spell) != control.allowed {
			t.Fatal("Wrong reference cast eligibility", control)
		}
	}
	if core.ForeverFiveThundersCastReference(character, nil) || core.ForeverFiveThundersCastReference(nil, &core.Spell{}) {
		t.Fatal("Nil event accepted")
	}
	if core.ForeverFiveThundersCastReference(character, &core.Spell{Unit: &core.Unit{}, ProcMask: core.ProcMaskSpellDamage, Flags: shaman.SpellFlagShaman}) {
		t.Fatal("Pet/other owner accepted")
	}
}

func TestKFCCombatFiveProcPowerRefreshReset(t *testing.T) {
	for _, role := range []string{"elemental", "enhancement"} {
		t.Run(role, func(t *testing.T) {
			sim, character := combatFiveFixture(role, 4, false)
			buff, trigger := character.GetAura("Five Thunders combat power reference"), character.GetAura("Five Thunders completed-cast reference")
			if buff == nil || trigger == nil || trigger.Icd != nil || buff.Duration != 10*time.Second {
				t.Fatal("Missing proc or invented ICD")
			}
			sp, hp := character.GetStat(stats.SpellPower), character.GetStat(stats.HealingPower)
			spell := &core.Spell{Unit: &character.Unit}
			healing := spell.HealingPower(&character.Unit)
			buff.Activate(sim)
			combatFiveNear(t, character.GetStat(stats.SpellPower)-sp, 65)
			combatFiveNear(t, character.GetStat(stats.HealingPower)-hp, 0)
			combatFiveNear(t, spell.HealingPower(&character.Unit)-healing, 65)
			sim.CurrentTime = 5 * time.Second
			buff.Activate(sim)
			if buff.ExpiresAt() != 15*time.Second {
				t.Fatal("Proc did not refresh")
			}
			combatFiveNear(t, character.GetStat(stats.SpellPower)-sp, 65)
			for index := 0; index < 3; index++ {
				sim.Cleanup()
				sim.Reset()
				sim.PrePull()
				if buff.IsActive() {
					t.Fatal("Proc leaked across iterations")
				}
				combatFiveNear(t, character.GetStat(stats.SpellPower), sp)
				buff.Activate(sim)
			}
		})
	}
}

func TestKFCCombatFiveSeededChanceAndRejectedRNG(t *testing.T) {
	sequence := func(rejected bool) int {
		sim, character := combatFiveFixture("elemental", 4, false)
		buff, trigger := character.GetAura("Five Thunders combat power reference"), character.GetAura("Five Thunders completed-cast reference")
		cast := &core.Spell{Unit: &character.Unit, ProcMask: core.ProcMaskSpellDamage, Flags: shaman.SpellFlagShaman}
		oracle, _ := combatFiveFixture("elemental", 4, false)
		count := 0
		for index := 0; index < 5000; index++ {
			buff.Deactivate(sim)
			if rejected {
				trigger.OnCastComplete(trigger, sim, &core.Spell{Unit: &character.Unit, ProcMask: core.ProcMaskMeleeMHAuto})
			}
			expected := oracle.Proc(.04, "Five Thunders completed-cast reference")
			trigger.OnCastComplete(trigger, sim, cast)
			if buff.IsActive() != expected {
				t.Fatal("Seeded probability mismatch", index)
			}
			if buff.IsActive() {
				count++
			}
		}
		if math.Abs(float64(count)-200) > 5*math.Sqrt(200) {
			t.Fatal("Reference chance mismatch", count)
		}
		return count
	}
	baseline, rejected := sequence(false), sequence(true)
	if baseline != rejected {
		t.Fatal("Rejected events consumed RNG", baseline, rejected)
	}
	t.Logf("KFC_FIVE_COMBAT_REFERENCE_PROC %d", baseline)
}
