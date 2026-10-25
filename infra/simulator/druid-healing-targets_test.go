package restoration

import (
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
	"github.com/wowsims/classic/sim/druid"
	"github.com/wowsims/classic/sim/hunter"
)

func init() { hunter.RegisterHunter() }

func kfcDruidPetFixture(t *testing.T) (*core.Simulation, *RestorationDruid, *core.Pet, *core.Pet) {
	t.Helper()
	trees := []string{}
	for _, tree := range druid.ForeverTalentTreeFields {
		var value strings.Builder
		for _, field := range tree {
			value.WriteString(strconv.Itoa(map[string]int{"wildGrowth": 1}[field]))
		}
		trees = append(trees, strings.TrimRight(value.String(), "0"))
	}
	player := &proto.Player{Name: "Druid with actual friendly pets", Level: 60, Race: proto.Race_RaceNightElf, Class: proto.Class_ClassDruid,
		Equipment: &proto.EquipmentSpec{}, BonusStats: &proto.UnitStats{Stats: stats.Stats{stats.HealingPower: 500, stats.Mana: 10000}.ToFloatArray()},
		TalentsString: strings.TrimRight(strings.Join(trees, "-"), "-"), Rotation: &proto.APLRotation{Type: proto.APLRotation_TypeAPL},
		Spec: &proto.Player_RestorationDruid{RestorationDruid: &proto.RestorationDruid{Options: &proto.RestorationDruid_Options{}}}}
	owner := func(name string) *proto.Player {
		return &proto.Player{Name: name, Level: 60, Race: proto.Race_RaceNightElf, Class: proto.Class_ClassHunter,
			Equipment: &proto.EquipmentSpec{}, Rotation: &proto.APLRotation{Type: proto.APLRotation_TypeAPL},
			Spec: &proto.Player_Hunter{Hunter: &proto.Hunter{Options: &proto.Hunter_Options{PetType: proto.Hunter_Options_Cat, PetUptime: 1}}}}
	}
	sim := core.NewSim(&proto.RaidSimRequest{Raid: &proto.Raid{Parties: []*proto.Party{{Players: []*proto.Player{player, owner("Same-party owner")}}, {Players: []*proto.Player{owner("Other-party owner")}}}},
		Encounter:  &proto.Encounter{Duration: 60, Targets: []*proto.Target{{Name: "Pet target control", Level: 63}}},
		SimOptions: &proto.SimOptions{Iterations: 1, RandomSeed: 7911, Ruleset: proto.Ruleset_RulesetForever, IsTest: true, Interactive: true}}, simsignals.CreateSignals())
	sim.Reset()
	resto := sim.Raid.Parties[0].Players[0].(*RestorationDruid)
	find := func(agent core.Agent) *core.Pet {
		for _, pet := range agent.GetCharacter().Pets {
			if pet.IsEnabled() {
				return pet
			}
		}
		t.Fatal("Missing actual enabled Hunter pet")
		return nil
	}
	same, other := find(sim.Raid.Parties[0].Players[1]), find(sim.Raid.Parties[1].Players[0])
	if err := resto.ConfigureKFCDruidHealing(kfcDruidPositions(resto), KFCDruidHealingPolicy{WildGrowthDecay: .1, SwiftmendSelection: "shortest"}); err != nil {
		t.Fatal(err)
	}
	return sim, resto, same, other
}

func TestKFCDruidWildGrowthActualPetPartyAndTarget(t *testing.T) {
	sim, resto, same, other := kfcDruidPetFixture(t)
	for _, unit := range sim.Raid.AllUnits {
		unit.RemoveHealth(sim, unit.MaxHealth()/2)
	}
	spell := resto.GetSpell(core.ActionID{SpellID: 1238215})
	spell.BonusCritRating = -10000
	if !spell.Cast(sim, &same.Unit) {
		t.Fatal("Wild Growth cannot target an actual friendly pet")
	}
	if !spell.Hot(&same.Unit).IsActive() || !spell.Hot(&resto.Unit).IsActive() || spell.Hot(&other.Unit).IsActive() {
		t.Fatal("Pet target did not select its owning party")
	}
	before := same.CurrentHealth()
	kfcDruidAdvance(t, sim, time.Second)
	if same.CurrentHealth() <= before {
		t.Fatal("Actual pet did not receive a Wild Growth tick")
	}
	kfcDruidAdvancedResult("ACTUAL_PET_WILD_GROWTH", same.CurrentHealth()-before)
}

func TestKFCDruidTranquilityActualPetRangeAndParty(t *testing.T) {
	sim, resto, same, other := kfcDruidPetFixture(t)
	same.RemoveHealth(sim, same.MaxHealth()/2)
	other.RemoveHealth(sim, other.MaxHealth()/2)
	positions := kfcDruidPositions(resto)
	positions[same.UnitIndex] = KFCDruidFriendlyPosition{X: 10}
	if err := resto.ConfigureKFCDruidHealing(positions, KFCDruidHealingPolicy{WildGrowthDecay: .1, SwiftmendSelection: "shortest"}); err != nil {
		t.Fatal(err)
	}
	spell := resto.GetSpell(core.ActionID{SpellID: 9863})
	spell.BonusCritRating = -10000
	before, unrelated := same.CurrentHealth(), other.CurrentHealth()
	if !spell.Cast(sim, &resto.Unit) {
		t.Fatal("Tranquility failed")
	}
	kfcDruidAdvance(t, sim, 2*time.Second)
	if same.CurrentHealth() <= before {
		t.Fatal("Tranquility missed same-party pet")
	}
	kfcDruidNear(t, other.CurrentHealth(), unrelated)
	positions[same.UnitIndex] = KFCDruidFriendlyPosition{X: 21}
	if err := resto.ConfigureKFCDruidHealing(positions, KFCDruidHealingPolicy{WildGrowthDecay: .1, SwiftmendSelection: "shortest"}); err != nil {
		t.Fatal(err)
	}
	healed := same.CurrentHealth()
	kfcDruidAdvance(t, sim, 4*time.Second)
	kfcDruidNear(t, same.CurrentHealth(), healed)
	kfcDruidAdvancedResult("ACTUAL_PET_TRANQUILITY", healed-before)
}

func TestKFCDruidDismissedPetCannotReceiveNewHealing(t *testing.T) {
	sim, resto, same, _ := kfcDruidPetFixture(t)
	same.RemoveHealth(sim, same.MaxHealth()/2)
	same.Disable(sim)
	if same.CurrentHealth() <= 0 {
		t.Fatal("Dismissed-pet control must retain positive health")
	}
	for _, id := range []int32{9889, 9841, 9858, 1238215} {
		if resto.GetSpell(core.ActionID{SpellID: id}).CanCast(sim, &same.Unit) {
			t.Fatalf("Spell %d accepted dismissed pet", id)
		}
	}
	spell := resto.GetSpell(core.ActionID{SpellID: 1238215})
	spell.BonusCritRating = -10000
	if !spell.Cast(sim, &resto.Unit) {
		t.Fatal("Wild Growth failed")
	}
	if spell.Hot(&same.Unit).IsActive() {
		t.Fatal("Wild Growth applied to dismissed pet through its owner party")
	}
	before := same.CurrentHealth()
	kfcDruidAdvance(t, sim, time.Second)
	kfcDruidNear(t, same.CurrentHealth(), before)
}

func TestKFCDruidCastCompletionRejectsDismissedPetAndDeadTarget(t *testing.T) {
	for _, kind := range []string{"dismissed", "dead"} {
		sim, resto, same, _ := kfcDruidPetFixture(t)
		same.RemoveHealth(sim, same.MaxHealth()/2)
		spell := resto.GetSpell(core.ActionID{SpellID: 9858})
		if !spell.Cast(sim, &same.Unit) {
			t.Fatal("Regrowth did not begin")
		}
		if kind == "dismissed" {
			same.Disable(sim)
		} else {
			same.RemoveHealth(sim, same.CurrentHealth())
		}
		before := same.CurrentHealth()
		kfcDruidAdvance(t, sim, 2*time.Second)
		kfcDruidNear(t, same.CurrentHealth(), before)
		if spell.Hot(&same.Unit).IsActive() {
			t.Fatalf("Regrowth applied after target became %s", kind)
		}
	}
}
