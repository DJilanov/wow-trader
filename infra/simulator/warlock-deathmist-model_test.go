//go:build with_db

package dps

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
)

var deathmistModelRegistration sync.Once

func deathmistModelFixture(pieces int, armor proto.WarlockOptions_Armor, targetLevel int32) (*core.Simulation, *DpsWarlock) {
	deathmistModelRegistration.Do(RegisterDpsWarlock)
	player := &proto.Player{
		Class: proto.Class_ClassWarlock, Race: proto.Race_RaceHuman, Level: 60,
		Equipment: &proto.EquipmentSpec{}, Rotation: &proto.APLRotation{Type: proto.APLRotation_TypeAPL},
		Spec: &proto.Player_Warlock{Warlock: &proto.Warlock{Options: &proto.WarlockOptions{Armor: armor, Summon: proto.WarlockOptions_NoSummon}}},
	}
	for index := 0; index < pieces; index++ {
		player.Equipment.Items = append(player.Equipment.Items, &proto.ItemSpec{Id: int32(22070 + index)})
	}
	encounter := core.MakeSingleTargetEncounter(0)
	encounter.Duration, encounter.DurationVariation, encounter.Targets[0].Level = 180, 0, targetLevel
	run := core.NewSim(&proto.RaidSimRequest{
		Raid: core.SinglePlayerRaidProto(player, nil, nil, nil), Encounter: encounter,
		SimOptions: &proto.SimOptions{Iterations: 1, RandomSeed: 1337, Ruleset: proto.Ruleset_RulesetForever},
	}, simsignals.Signals{})
	run.Options.Interactive = true
	run.Reset()
	run.PrePull()
	return run, run.Raid.Parties[0].Players[0].(*DpsWarlock)
}

func deathmistModelNear(t *testing.T, actual, expected float64) {
	t.Helper()
	if math.Abs(actual-expected) > 1e-7 {
		t.Fatalf("got %g, expected %g", actual, expected)
	}
}

func TestKFCDeathmistModelEmbeddedCatalog(t *testing.T) {
	seen := map[proto.ItemType]bool{}
	for id := int32(22070); id <= 22077; id++ {
		item, exists := core.ItemsByID[id]
		if !exists || item.SetID != 518 || item.SetName != "Deathmist Raiment" || len(item.ClassAllowlist) != 1 || item.ClassAllowlist[0] != proto.Class_ClassWarlock || seen[item.Type] {
			t.Fatal("Incorrect embedded base item", id, item)
		}
		seen[item.Type] = true
	}
	mask := core.ItemsByID[22074]
	deathmistModelNear(t, mask.Stats[stats.Intellect], 24)
	deathmistModelNear(t, mask.Stats[stats.SpellPower], 16)
	deathmistModelNear(t, mask.Stats[stats.Armor], 75)
}

func TestKFCDeathmistModelThresholdsAndActualStats(t *testing.T) {
	_, baseline := deathmistModelFixture(0, proto.WarlockOptions_NoArmor, 63)
	for pieces := 0; pieces <= 8; pieces++ {
		t.Run(fmt.Sprint(pieces), func(t *testing.T) {
			_, warlock := deathmistModelFixture(pieces, proto.WarlockOptions_NoArmor, 63)
			var actual, expected []int32
			for _, bonus := range warlock.GetActiveSetBonuses() {
				if bonus.Name == "Deathmist Raiment" {
					actual = append(actual, bonus.NumPieces)
				}
			}
			for _, threshold := range []int32{2, 4, 6, 8} {
				if pieces >= int(threshold) {
					expected = append(expected, threshold)
				}
			}
			if !reflect.DeepEqual(actual, expected) {
				t.Fatal("Duplicated or alternate thresholds", actual, expected)
			}
			gear := warlock.Equipment.Stats()
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
				deathmistModelNear(t, warlock.GetStat(stat)-baseline.GetStat(stat)-gear[stat], resistance)
			}
			deathmistModelNear(t, warlock.GetStat(stats.SpellPower)-baseline.GetStat(stats.SpellPower)-gear[stats.SpellPower], power)
			deathmistModelNear(t, warlock.GetStat(stats.HealingPower)-baseline.GetStat(stats.HealingPower)-gear[stats.HealingPower], 0)
			deathmistModelNear(t, warlock.GetStat(stats.MP5)-baseline.GetStat(stats.MP5)-gear[stats.MP5], 0)
			deathmistModelNear(t, warlock.GetStat(stats.BonusArmor)-baseline.GetStat(stats.BonusArmor)-gear[stats.BonusArmor], armor)
			deathmistModelNear(t, warlock.GetStat(stats.Armor)-baseline.GetStat(stats.Armor)-gear[stats.Armor], armor)
			if warlock.GetAura("Dark Reward") != nil || (warlock.GetSpell(core.ActionID{SpellID: 21330}) != nil) != (pieces >= 4) {
				t.Fatal("Base set inherited alternate healing or lost fear")
			}
		})
	}
}

func TestKFCDeathmistModelIDAndClassicIsolation(t *testing.T) {
	_, warlock := deathmistModelFixture(0, proto.WarlockOptions_NoArmor, 63)
	var equipment core.Equipment
	for index := 0; index < 8; index++ {
		equipment[index] = core.Item{ID: int32(22070 + index), SetID: 518, SetName: "localized Deathmist"}
	}
	warlock.Equipment = equipment
	if len(warlock.GetActiveSetBonuses()) != 4 {
		t.Fatal("Base dispatch depends on English display name")
	}
	for index := range equipment {
		equipment[index].SetID = 1681
		equipment[index].SetName = "Deathmist Raiment"
	}
	warlock.Equipment = equipment
	var alternate []int32
	for _, bonus := range warlock.GetActiveSetBonuses() {
		if bonus.Name == "Deathmist Raiment" {
			alternate = append(alternate, bonus.NumPieces)
		}
	}
	if !reflect.DeepEqual(alternate, []int32{2, 3, 4, 5, 6}) {
		t.Fatal("Existing alternate behavior changed", alternate)
	}
	for index := 0; index < 2; index++ {
		equipment[index].SetID = 518
	}
	warlock.Equipment = equipment
	var mixed []int32
	for _, bonus := range warlock.GetActiveSetBonuses() {
		if bonus.Name == "Deathmist Raiment" {
			mixed = append(mixed, bonus.NumPieces)
		}
	}
	if !reflect.DeepEqual(mixed, []int32{2, 2, 3, 4, 5, 6}) {
		t.Fatal("Mixed identities merged", mixed)
	}
	classic := *warlock.GetCharacter()
	environment := *warlock.Env
	environment.Ruleset = proto.Ruleset_RulesetClassic
	classic.Env = &environment
	var classicThresholds []int32
	for _, bonus := range classic.GetActiveSetBonuses() {
		if bonus.Name == "Deathmist Raiment" {
			classicThresholds = append(classicThresholds, bonus.NumPieces)
		}
	}
	if !reflect.DeepEqual(classicThresholds, alternate) {
		t.Fatal("Classic parent dispatch changed", classicThresholds)
	}
}

func TestKFCDeathmistModelIncomingEligibility(t *testing.T) {
	sim, warlock := deathmistModelFixture(4, proto.WarlockOptions_NoArmor, 63)
	enemy := sim.Encounter.TargetUnits[0]
	for _, control := range []struct {
		mask    core.ProcMask
		outcome core.HitOutcome
		allowed bool
	}{
		{core.ProcMaskMeleeMHAuto, core.OutcomeHit, true}, {core.ProcMaskMeleeOHAuto, core.OutcomeCrit, true},
		{core.ProcMaskMeleeMHSpecial, core.OutcomeHit, true}, {core.ProcMaskRangedAuto, core.OutcomeHit, true},
		{core.ProcMaskRangedSpecial, core.OutcomeHit, true}, {core.ProcMaskSpellDamage, core.OutcomeHit, true},
		{core.ProcMaskSpellDamage, core.OutcomeMiss, false}, {core.ProcMaskMeleeMHAuto, core.OutcomeDodge, false},
		{core.ProcMaskSpellHealing, core.OutcomeHit, false}, {core.ProcMaskEmpty, core.OutcomeHit, false},
		{core.ProcMaskSpellDamageProc, core.OutcomeHit, false},
	} {
		incoming := &core.Spell{Unit: enemy, ProcMask: control.mask}
		result := &core.SpellResult{Target: &warlock.Unit, Outcome: control.outcome}
		if core.ForeverDeathmistIncomingReference(warlock.GetCharacter(), incoming, result) != control.allowed {
			t.Fatal("Incoming policy drifted", control)
		}
	}
	result := &core.SpellResult{Target: &warlock.Unit, Outcome: core.OutcomeHit}
	spell := &core.Spell{Unit: &warlock.Unit, ProcMask: core.ProcMaskSpellDamage}
	if core.ForeverDeathmistIncomingReference(warlock.GetCharacter(), spell, result) {
		t.Fatal("Self damage can proc fear")
	}
	spell.Unit = enemy
	result.Target = enemy
	if core.ForeverDeathmistIncomingReference(warlock.GetCharacter(), spell, result) {
		t.Fatal("Damage to another target can proc fear")
	}
	if core.ForeverDeathmistIncomingReference(nil, spell, result) || core.ForeverDeathmistIncomingReference(warlock.GetCharacter(), nil, result) || core.ForeverDeathmistIncomingReference(warlock.GetCharacter(), spell, nil) || core.ForeverDeathmistIncomingReference(warlock.GetCharacter(), &core.Spell{}, result) {
		t.Fatal("Nil input was eligible")
	}
}

func TestKFCDeathmistModelProcCooldownAndImmuneOutcome(t *testing.T) {
	sim, warlock := deathmistModelFixture(4, proto.WarlockOptions_NoArmor, 63)
	trigger := warlock.GetAura("Deathmist incoming fear: raid-boss immunity reference")
	fear := warlock.GetSpell(core.ActionID{SpellID: 21330})
	enemy := sim.Encounter.TargetUnits[0]
	incoming := &core.Spell{Unit: enemy, ProcMask: core.ProcMaskMeleeMHAuto}
	result := &core.SpellResult{Target: &warlock.Unit, Outcome: core.OutcomeHit}
	if trigger == nil || !trigger.IsActive() || trigger.Icd == nil || trigger.Icd.Duration != 60*time.Second {
		t.Fatal("Missing actual proc/cooldown")
	}
	beforeMana, beforeHealth := warlock.CurrentMana(), warlock.CurrentHealth()
	beforeDistance, beforeSpeed, beforeStun := enemy.DistanceFromTarget, enemy.MovementHandler.MoveSpeed, enemy.PseudoStats.Stunned
	for attempt := 0; attempt < 5000; attempt++ {
		trigger.OnSpellHitTaken(trigger, sim, incoming, result)
		if fear.SpellMetrics[enemy.UnitIndex].Casts > 0 {
			break
		}
	}
	metrics := fear.SpellMetrics[enemy.UnitIndex]
	if metrics.Casts != 1 || metrics.Hits != 0 || metrics.Misses != 0 || metrics.TotalDamage != 0 || metrics.TotalThreat != 0 {
		t.Fatal("Immune cast fabricated a combat outcome", metrics)
	}
	for attempt := 0; attempt < 1000; attempt++ {
		trigger.OnSpellHitTaken(trigger, sim, incoming, result)
	}
	if fear.SpellMetrics[enemy.UnitIndex].Casts != 1 {
		t.Fatal("Cooldown did not suppress retriggers")
	}
	if enemy.GetAura("Corrupted Fear") != nil || enemy.PseudoStats.Stunned != beforeStun || enemy.DistanceFromTarget != beforeDistance || enemy.MovementHandler.MoveSpeed != beforeSpeed || warlock.CurrentMana() != beforeMana || warlock.CurrentHealth() != beforeHealth {
		t.Fatal("Immune cast changed movement/control/resources")
	}
	sim.CurrentTime = 60 * time.Second
	for attempt := 0; attempt < 5000; attempt++ {
		trigger.OnSpellHitTaken(trigger, sim, incoming, result)
		if fear.SpellMetrics[enemy.UnitIndex].Casts == 2 {
			break
		}
	}
	if fear.SpellMetrics[enemy.UnitIndex].Casts != 2 {
		t.Fatal("ICD did not reopen at 60 seconds")
	}
	sim.Cleanup()
	sim.Reset()
	sim.PrePull()
	if !trigger.Icd.IsReady(sim) || fear.SpellMetrics[enemy.UnitIndex].Casts != 0 {
		t.Fatal("Proc state leaked across iterations")
	}
}

func TestKFCDeathmistModelIneligibleEventsPreserveRandomSequence(t *testing.T) {
	sequence := func(injectRejected bool) int32 {
		sim, warlock := deathmistModelFixture(4, proto.WarlockOptions_NoArmor, 63)
		trigger := warlock.GetAura("Deathmist incoming fear: raid-boss immunity reference")
		enemy := sim.Encounter.TargetUnits[0]
		incoming := &core.Spell{Unit: enemy, ProcMask: core.ProcMaskSpellDamage}
		result := &core.SpellResult{Target: &warlock.Unit, Outcome: core.OutcomeHit}
		for attempt := 0; attempt < 5000; attempt++ {
			sim.CurrentTime = time.Duration(attempt) * 60 * time.Second
			if injectRejected {
				trigger.OnSpellHitTaken(trigger, sim, &core.Spell{Unit: &warlock.Unit, ProcMask: core.ProcMaskSpellDamage}, result)
			}
			trigger.OnSpellHitTaken(trigger, sim, incoming, result)
		}
		casts := warlock.GetSpell(core.ActionID{SpellID: 21330}).SpellMetrics[enemy.UnitIndex].Casts
		if casts < 60 || casts > 140 {
			t.Fatal("Seeded proc rate is incompatible with 2%", casts)
		}
		return casts
	}
	baseline, rejected := sequence(false), sequence(true)
	if baseline != rejected {
		t.Fatal("Rejected events consumed RNG", baseline, rejected)
	}
	t.Logf("seeded 2%% proc count: %d/5000", baseline)
}

func TestKFCDeathmistModelUnsupportedTargetsFailClosed(t *testing.T) {
	for _, level := range []int32{60, 62, 64} {
		t.Run(fmt.Sprint(level), func(t *testing.T) {
			defer func() {
				if recover() == nil {
					t.Fatal("Fearable/unreviewed encounter silently accepted")
				}
			}()
			deathmistModelFixture(4, proto.WarlockOptions_NoArmor, level)
		})
	}
}

func TestKFCDeathmistModelArmorDependencyAcrossResets(t *testing.T) {
	for _, armor := range []proto.WarlockOptions_Armor{proto.WarlockOptions_NoArmor, proto.WarlockOptions_DemonArmor} {
		t.Run(fmt.Sprint(armor), func(t *testing.T) {
			_, baseline := deathmistModelFixture(0, armor, 63)
			sim, warlock := deathmistModelFixture(8, armor, 63)
			gear := warlock.Equipment.Stats()
			for reset := 0; reset < 3; reset++ {
				if reset > 0 {
					sim.Cleanup()
					sim.Reset()
					sim.PrePull()
				}
				deathmistModelNear(t, warlock.GetStat(stats.Armor)-baseline.GetStat(stats.Armor)-gear[stats.Armor], 200)
				deathmistModelNear(t, warlock.GetStat(stats.SpellPower)-baseline.GetStat(stats.SpellPower)-gear[stats.SpellPower], 23)
			}
		})
	}
}
