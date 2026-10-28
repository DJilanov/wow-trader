//go:build with_db

package protection_test

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
	"github.com/wowsims/classic/sim/paladin/protection"
	"github.com/wowsims/classic/sim/paladin/retribution"
)

var soulforgeCombatRegistration sync.Once

func soulforgeCombatFixture(role string, pieces int, kings bool, weapon int32) (*core.Simulation, *core.Character) {
	soulforgeCombatRegistration.Do(func() { protection.RegisterProtectionPaladin(); retribution.RegisterRetributionPaladin() })
	player := &proto.Player{Class: proto.Class_ClassPaladin, Race: proto.Race_RaceHuman, Level: 60,
		Equipment: &proto.EquipmentSpec{}, Rotation: &proto.APLRotation{Type: proto.APLRotation_TypeAPL},
		Buffs: &proto.IndividualBuffs{BlessingOfKings: kings}}
	options := &proto.PaladinOptions{}
	if role == "tank" {
		player.Spec = &proto.Player_ProtectionPaladin{ProtectionPaladin: &proto.ProtectionPaladin{Options: options}}
	} else {
		player.Spec = &proto.Player_RetributionPaladin{RetributionPaladin: &proto.RetributionPaladin{Options: options}}
	}
	for index := 0; index < pieces; index++ {
		player.Equipment.Items = append(player.Equipment.Items, &proto.ItemSpec{Id: int32(22086 + index)})
	}
	player.Equipment.Items = append(player.Equipment.Items, &proto.ItemSpec{Id: weapon})
	encounter := core.MakeSingleTargetEncounter(0)
	encounter.Duration, encounter.DurationVariation = 180, 0
	run := core.NewSim(&proto.RaidSimRequest{Raid: core.SinglePlayerRaidProto(player, nil, nil, nil), Encounter: encounter,
		SimOptions: &proto.SimOptions{Iterations: 1, RandomSeed: 1337, Ruleset: proto.Ruleset_RulesetForever}}, simsignals.Signals{})
	run.Options.Interactive = true
	run.Reset()
	run.PrePull()
	return run, run.Raid.Parties[0].Players[0].GetCharacter()
}

func soulforgeCombatNear(t *testing.T, actual, expected float64) {
	t.Helper()
	if math.Abs(actual-expected) > 1e-7 {
		t.Fatalf("got %g, expected %g", actual, expected)
	}
}

func TestKFCSoulforgeCombatCatalog(t *testing.T) {
	seen := map[proto.ItemType]bool{}
	for id := int32(22086); id <= 22093; id++ {
		item, exists := core.ItemsByID[id]
		if !exists || item.SetID != 516 || item.SetName != "Soulforge Armor" || len(item.ClassAllowlist) != 1 || item.ClassAllowlist[0] != proto.Class_ClassPaladin || seen[item.Type] {
			t.Fatal("Incorrect current base Soulforge record", id, item)
		}
		seen[item.Type] = true
	}
}

func TestKFCSoulforgeCombatThresholdsAndActualStats(t *testing.T) {
	for _, role := range []string{"dps", "tank"} {
		for _, kings := range []bool{false, true} {
			_, baseline := soulforgeCombatFixture(role, 0, kings, 12777)
			for pieces := 0; pieces <= 8; pieces++ {
				t.Run(fmt.Sprintf("%s/kings-%t/%d", role, kings, pieces), func(t *testing.T) {
					_, character := soulforgeCombatFixture(role, pieces, kings, 12777)
					var actual, expected []int32
					for _, bonus := range character.GetActiveSetBonuses() {
						if bonus.Name == "Soulforge Armor" {
							actual = append(actual, bonus.NumPieces)
						}
					}
					for _, threshold := range []int32{2, 4, 6, 8} {
						if pieces >= int(threshold) {
							expected = append(expected, threshold)
						}
					}
					if !reflect.DeepEqual(actual, expected) {
						t.Fatal("Missing or duplicate thresholds", actual, expected)
					}
					gear, baseGear := character.Equipment.Stats(), baseline.Equipment.Stats()
					for stat := stats.Stat(0); stat < stats.Len; stat++ {
						gear[stat] -= baseGear[stat]
					}
					resistance, attack, armor := 0.0, 0.0, 0.0
					if pieces >= 2 {
						resistance = 8
					}
					if pieces >= 6 {
						attack = 40
					}
					if pieces >= 8 {
						armor = 200
					}
					for _, stat := range []stats.Stat{stats.ArcaneResistance, stats.FireResistance, stats.FrostResistance, stats.NatureResistance, stats.ShadowResistance} {
						soulforgeCombatNear(t, character.GetStat(stat)-baseline.GetStat(stat)-gear[stat], resistance)
					}
					multiplier := 1.0
					if kings {
						multiplier = 1.1
					}
					soulforgeCombatNear(t, character.GetStat(stats.AttackPower)-baseline.GetStat(stats.AttackPower)-gear[stats.AttackPower]-2*multiplier*gear[stats.Strength], attack)
					soulforgeCombatNear(t, character.GetStat(stats.RangedAttackPower)-baseline.GetStat(stats.RangedAttackPower)-gear[stats.RangedAttackPower], attack)
					soulforgeCombatNear(t, character.GetStat(stats.BonusArmor)-baseline.GetStat(stats.BonusArmor)-gear[stats.BonusArmor], armor)
					soulforgeCombatNear(t, character.GetStat(stats.Armor)-baseline.GetStat(stats.Armor)-gear[stats.Armor]-2*multiplier*gear[stats.Agility], armor)
					soulforgeCombatNear(t, character.GetStat(stats.SpellPower)-baseline.GetStat(stats.SpellPower)-gear[stats.SpellPower], 0)
					soulforgeCombatNear(t, character.GetStat(stats.MP5)-baseline.GetStat(stats.MP5)-gear[stats.MP5], 0)
					if (character.GetAura("Soulforge white-melee power: one-PPM reference") != nil) != (pieces >= 4) {
						t.Fatal("Melee proc threshold mismatch")
					}
				})
			}
		}
	}
}

func TestKFCSoulforgeCombatIdentityAndClassicIsolation(t *testing.T) {
	_, character := soulforgeCombatFixture("dps", 0, false, 12777)
	var equipment core.Equipment
	for index := 0; index < 8; index++ {
		equipment[index] = core.Item{ID: int32(22086 + index), SetID: 516, SetName: "localized display name"}
	}
	character.Equipment = equipment
	if len(character.GetActiveSetBonuses()) != 4 {
		t.Fatal("Display name affected base dispatch")
	}
	for index := range equipment {
		equipment[index].SetID = 1673
		equipment[index].SetName = "Soulforge Armor"
	}
	character.Equipment = equipment
	if len(character.GetActiveSetBonuses()) != 0 {
		t.Fatal("Alternate pieces inherited base thresholds")
	}
	for index := 0; index < 2; index++ {
		equipment[index].SetID = 516
	}
	character.Equipment = equipment
	bonuses := character.GetActiveSetBonuses()
	if len(bonuses) != 1 || bonuses[0].NumPieces != 2 {
		t.Fatal("Mixed variants merged", bonuses)
	}
	classic := *character
	env := *character.Env
	env.Ruleset = proto.Ruleset_RulesetClassic
	classic.Env = &env
	if len(classic.GetActiveSetBonuses()) != 0 {
		t.Fatal("Forever combat handler changed Classic")
	}
	other := *character
	other.Class = proto.Class_ClassWarrior
	if len(other.GetActiveSetBonuses()) != 0 {
		t.Fatal("Paladin acquisition reference leaked to another class")
	}
}

func TestKFCSoulforgeCombatProcChannelsRefreshAndReset(t *testing.T) {
	for _, role := range []string{"dps", "tank"} {
		t.Run(role, func(t *testing.T) {
			sim, character := soulforgeCombatFixture(role, 4, false, 12777)
			buff := character.GetAura("Soulforge power reference")
			trigger := character.GetAura("Soulforge white-melee power: one-PPM reference")
			if buff == nil || trigger == nil || buff.Duration != 10*time.Second || trigger.Icd != nil {
				t.Fatal("Wrong duration or invented cooldown")
			}
			baseSP, baseHP := character.GetStat(stats.SpellPower), character.GetStat(stats.HealingPower)
			spell := &core.Spell{Unit: &character.Unit}
			baseHealing := spell.HealingPower(&character.Unit)
			buff.Activate(sim)
			soulforgeCombatNear(t, character.GetStat(stats.SpellPower)-baseSP, 65)
			soulforgeCombatNear(t, character.GetStat(stats.HealingPower)-baseHP, 0)
			soulforgeCombatNear(t, spell.HealingPower(&character.Unit)-baseHealing, 65)
			sim.CurrentTime = 5 * time.Second
			buff.Activate(sim)
			if buff.ExpiresAt() != 15*time.Second {
				t.Fatal("Proc failed to refresh")
			}
			soulforgeCombatNear(t, character.GetStat(stats.SpellPower)-baseSP, 65)
			buff.Deactivate(sim)
			soulforgeCombatNear(t, character.GetStat(stats.SpellPower), baseSP)
			for reset := 0; reset < 3; reset++ {
				buff.Activate(sim)
				sim.Cleanup()
				sim.Reset()
				sim.PrePull()
				if buff.IsActive() {
					t.Fatal("Proc leaked across reset")
				}
				soulforgeCombatNear(t, character.GetStat(stats.SpellPower), baseSP)
			}
		})
	}
}

func TestKFCSoulforgeCombatIncomingAndSpecialsExcluded(t *testing.T) {
	sim, character := soulforgeCombatFixture("dps", 4, false, 12777)
	enemy := sim.Encounter.TargetUnits[0]
	for _, control := range []struct {
		mask    core.ProcMask
		outcome core.HitOutcome
		allowed bool
	}{
		{core.ProcMaskMeleeMHAuto, core.OutcomeHit, true}, {core.ProcMaskMeleeOHAuto, core.OutcomeCrit, true},
		{core.ProcMaskMeleeMHAuto, core.OutcomeBlock, true}, {core.ProcMaskMeleeMHAuto, core.OutcomeMiss, false},
		{core.ProcMaskMeleeMHSpecial, core.OutcomeHit, false}, {core.ProcMaskRangedAuto, core.OutcomeHit, false},
		{core.ProcMaskSpellDamage, core.OutcomeHit, false}, {core.ProcMaskSpellHealing, core.OutcomeHit, false},
	} {
		if core.ForeverSoulforgeMeleeReference(character, &core.Spell{Unit: &character.Unit, ProcMask: control.mask}, &core.SpellResult{Target: enemy, Outcome: control.outcome}) != control.allowed {
			t.Fatal("Proc event mapping mismatch", control)
		}
	}
	for _, event := range []struct {
		spell  *core.Spell
		result *core.SpellResult
	}{
		{nil, &core.SpellResult{}}, {&core.Spell{}, nil}, {&core.Spell{}, &core.SpellResult{}},
		{&core.Spell{Unit: enemy, ProcMask: core.ProcMaskMeleeMHAuto}, &core.SpellResult{Target: &character.Unit, Outcome: core.OutcomeHit}},
		{&core.Spell{Unit: &character.Unit, ProcMask: core.ProcMaskMeleeMHAuto}, &core.SpellResult{Target: &character.Unit, Outcome: core.OutcomeHit}},
	} {
		if core.ForeverSoulforgeMeleeReference(character, event.spell, event.result) {
			t.Fatal("Invalid or friendly event was eligible")
		}
	}
}

func TestKFCSoulforgeCombatReferenceCadence(t *testing.T) {
	for _, weapon := range []int32{12777, 12784} {
		t.Run(fmt.Sprint(weapon), func(t *testing.T) {
			sequence := func(rejected bool) int {
				sim, character := soulforgeCombatFixture("dps", 4, false, weapon)
				trigger := character.GetAura("Soulforge white-melee power: one-PPM reference")
				buff := character.GetAura("Soulforge power reference")
				enemy := sim.Encounter.TargetUnits[0]
				white := character.AutoAttacks.MHAuto()
				result := &core.SpellResult{Target: enemy, Outcome: core.OutcomeHit}
				procs := 0
				for attempt := 0; attempt < 5000; attempt++ {
					if buff.IsActive() {
						buff.Deactivate(sim)
					}
					if rejected {
						trigger.OnSpellHitDealt(trigger, sim, &core.Spell{Unit: &character.Unit, ProcMask: core.ProcMaskMeleeMHSpecial}, result)
					}
					trigger.OnSpellHitDealt(trigger, sim, white, result)
					if buff.IsActive() {
						procs++
					}
				}
				expected := 5000 * character.AutoAttacks.MH().SwingSpeed / 60
				if math.Abs(float64(procs)-expected) > 5*math.Sqrt(expected) {
					t.Fatal("Cadence is not the declared one-PPM reference", procs, expected)
				}
				return procs
			}
			baseline, rejected := sequence(false), sequence(true)
			if baseline != rejected {
				t.Fatal("Rejected events consumed RNG", baseline, rejected)
			}
			t.Logf("KFC_SOULFORGE_REFERENCE_PROC %d %d", weapon, baseline)
		})
	}
}
