package restoration

import (
	"encoding/json"
	"fmt"
	"math"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
)

func init() { RegisterRestorationShaman() }

func kfcShamanRequest(power float64) *proto.RaidSimRequest {
	bonus := stats.Stats{stats.HealingPower: power, stats.Mana: 10000}
	return &proto.RaidSimRequest{
		Raid:       &proto.Raid{Parties: []*proto.Party{{Players: []*proto.Player{{Name: "Synthetic Shaman spell control", Level: 60, Race: proto.Race_RaceTroll, Class: proto.Class_ClassShaman, Equipment: &proto.EquipmentSpec{}, BonusStats: &proto.UnitStats{Stats: bonus.ToFloatArray()}, Rotation: &proto.APLRotation{Type: proto.APLRotation_TypeAPL}, Spec: &proto.Player_RestorationShaman{RestorationShaman: &proto.RestorationShaman{Options: &proto.RestorationShaman_Options{}}}}}}}, TargetDummies: 4},
		Encounter:  &proto.Encounter{Duration: 60, Targets: []*proto.Target{{Name: "Synthetic control enemy", Level: 63}}},
		SimOptions: &proto.SimOptions{Iterations: 1, RandomSeed: 882151, Ruleset: proto.Ruleset_RulesetForever, IsTest: true, Interactive: true},
	}
}

func kfcShamanFixture(t *testing.T, power float64, routing string) (*core.Simulation, *RestorationShaman, []*core.Unit) {
	t.Helper()
	sim := core.NewSim(kfcShamanRequest(power), simsignals.CreateSignals())
	sim.Reset()
	resto := sim.Raid.Parties[0].Players[0].(*RestorationShaman)
	positions := map[int32]KFCShamanFriendlyPosition{}
	units := resto.kfcHealingPlayers()
	for index, unit := range units {
		positions[unit.UnitIndex] = KFCShamanFriendlyPosition{X: float64(index) * 10}
	}
	if err := resto.ConfigureKFCShamanHealingPositions(sim, positions, 12.5, routing); err != nil {
		t.Fatal(err)
	}
	return sim, resto, units
}

func kfcShamanNear(t *testing.T, got, want float64) {
	t.Helper()
	if math.IsNaN(got) || math.Abs(got-want) > 1e-7 {
		t.Fatalf("got %.12f,want %.12f", got, want)
	}
}

func kfcShamanAdvance(t *testing.T, sim *core.Simulation, until time.Duration) {
	t.Helper()
	done := false
	sim.AddPendingAction(&core.PendingAction{NextActionAt: until, Priority: core.ActionPriorityLow, OnAction: func(_ *core.Simulation) { done = true }})
	for steps := 0; !done; steps++ {
		if steps > 100000 || sim.Step() {
			t.Fatal("Shaman control did not reach its event")
		}
	}
}

func kfcShamanMeasure(label string, value interface{}) {
	body, _ := json.Marshal(value)
	fmt.Printf("KFC_SHAMAN_HEALING_%s %s\n", label, body)
}

func TestKFCShamanDirectCostsCastsCoefficientsAndCrits(t *testing.T) {
	for _, test := range []struct {
		id                           int32
		cast                         time.Duration
		mana, coefficient, low, high float64
	}{
		{331, 1500 * time.Millisecond, 25, .429, 36.79, 46.81},
		{10396, 3000 * time.Millisecond, 560, .857, 1276.9, 1455.1},
		{10468, 1500 * time.Millisecond, 380, .429, 775.2, 864.8},
	} {
		amounts := []float64{}
		for attempt, power := range []float64{0, 500, 500} {
			sim, resto, units := kfcShamanFixture(t, power, "nearest-injured-reference")
			target := units[1]
			target.RemoveHealth(sim, 9000)
			spell := resto.GetSpell(core.ActionID{SpellID: test.id})
			if spell == nil || spell.DefaultCast.CastTime != test.cast {
				t.Fatal("Missing current Shaman rank")
			}
			spell.BonusCritRating = -10000
			if attempt == 2 {
				spell.BonusCritRating = 10000
			}
			before := target.CurrentHealth()
			if !spell.Cast(sim, target) {
				t.Fatal("Direct control rejected")
			}
			kfcShamanAdvance(t, sim, test.cast-time.Millisecond)
			kfcShamanNear(t, target.CurrentHealth(), before)
			kfcShamanAdvance(t, sim, test.cast)
			amounts = append(amounts, target.CurrentHealth()-before)
			kfcShamanNear(t, resto.Metrics.ManaSpent, test.mana)
			sim.Cleanup()
		}
		if amounts[0] < test.low || amounts[0] > test.high {
			t.Fatal("Wrong Shaman base/level healing", test.id, amounts[0])
		}
		kfcShamanNear(t, amounts[1]-amounts[0], 500*test.coefficient)
		kfcShamanNear(t, amounts[2], 1.5*amounts[1])
		kfcShamanMeasure("DIRECT", map[string]interface{}{"id": test.id, "amounts": amounts, "mana": test.mana})
	}
}

func TestKFCShamanBasicRankCoverageAndRaidBookExclusion(t *testing.T) {
	sim, resto, _ := kfcShamanFixture(t, 0, "nearest-injured-reference")
	defer sim.Cleanup()
	if len(kfcShamanHealingRanks) != 18 || resto.GetSpell(core.ActionID{SpellID: 25357}) != nil {
		t.Fatal("Basic rank coverage or raid exclusion changed")
	}
	for _, rank := range kfcShamanHealingRanks {
		spell := resto.GetSpell(core.ActionID{SpellID: rank.ID})
		if spell == nil || spell.Rank != rank.Rank || spell.RequiredLevel != rank.RequiredLevel {
			t.Fatal("Missing Shaman rank", rank.ID)
		}
		low, high := rank.bounds(rank.MaxLevel)
		laterLow, laterHigh := rank.bounds(rank.MaxLevel + 20)
		kfcShamanNear(t, low, laterLow)
		kfcShamanNear(t, high, laterHigh)
	}
	kfcShamanMeasure("RANKS", len(kfcShamanHealingRanks))
}

func TestKFCShamanFriendlyRangeHealthCapsAndResources(t *testing.T) {
	sim, resto, units := kfcShamanFixture(t, 500, "nearest-injured-reference")
	defer sim.Cleanup()
	spell := resto.GetSpell(core.ActionID{SpellID: 10396})
	target := units[1]
	if spell.CanCast(sim, nil) || spell.CanCast(sim, sim.Encounter.TargetUnits[0]) {
		t.Fatal("Enemy or nil healing accepted")
	}
	resto.positions[target.UnitIndex] = KFCShamanFriendlyPosition{X: 40}
	if !spell.CanCast(sim, target) {
		t.Fatal("40-yard target rejected")
	}
	resto.positions[target.UnitIndex] = KFCShamanFriendlyPosition{X: 40.01}
	if spell.CanCast(sim, target) {
		t.Fatal("Out-of-range heal accepted")
	}
	resto.positions[target.UnitIndex] = KFCShamanFriendlyPosition{X: 10}
	target.RemoveHealth(sim, 10)
	spell.BonusCritRating = -10000
	if !spell.Cast(sim, target) {
		t.Fatal("Cap control rejected")
	}
	kfcShamanAdvance(t, sim, 3*time.Second)
	kfcShamanNear(t, target.CurrentHealth(), target.MaxHealth())
	metrics := spell.SpellMetrics[target.UnitIndex]
	kfcShamanNear(t, metrics.TotalEffectiveHealing, 10)
	if metrics.TotalOverhealing <= 0 {
		t.Fatal("Missing overheal accounting")
	}
	sim.Cleanup()
	sim.Reset()
	target.RemoveHealth(sim, target.CurrentHealth())
	if spell.CanCast(sim, target) {
		t.Fatal("Dead target accepted")
	}
	resto.SpendMana(sim, resto.CurrentMana(), resto.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 880}))
	if spell.CanCast(sim, &resto.Unit) {
		t.Fatal("Free healing accepted without mana")
	}
	kfcShamanMeasure("CAPS", []float64{metrics.TotalEffectiveHealing, metrics.TotalOverhealing})
}

func TestKFCShamanChainScalesBaseAndPowerOncePerIndependentCriticalBounce(t *testing.T) {
	for _, critical := range []bool{false, true} {
		values := [][]float64{}
		for _, power := range []float64{0, 500} {
			sim, resto, units := kfcShamanFixture(t, power, "nearest-injured-reference")
			spell := resto.GetSpell(core.ActionID{SpellID: 10623})
			spell.BonusCritRating = -10000
			if critical {
				spell.BonusCritRating = 10000
			}
			before := []float64{}
			for _, unit := range units[1:] {
				unit.RemoveHealth(sim, 9000)
				before = append(before, unit.CurrentHealth())
			}
			if !spell.Cast(sim, units[1]) {
				t.Fatal("Chain control rejected")
			}
			kfcShamanAdvance(t, sim, 2500*time.Millisecond)
			healed := []float64{}
			for index, unit := range units[1:] {
				healed = append(healed, unit.CurrentHealth()-before[index])
			}
			kfcShamanNear(t, healed[1], healed[0]*.5)
			kfcShamanNear(t, healed[2], healed[0]*.25)
			kfcShamanNear(t, healed[3], 0)
			kfcShamanNear(t, resto.Metrics.ManaSpent, 405)
			values = append(values, healed)
			sim.Cleanup()
		}
		factor := 1.0
		if critical {
			factor = 1.5
		}
		for hop := 0; hop < 3; hop++ {
			kfcShamanNear(t, values[1][hop]-values[0][hop], 500*.714*math.Pow(.5, float64(hop))*factor)
		}
		kfcShamanMeasure("CHAIN", map[string]interface{}{"critical": critical, "values": values})
	}
}

func TestKFCShamanChainGeometryAndRoutingReferences(t *testing.T) {
	for _, routing := range []string{"nearest-injured-reference", "largest-deficit-reference"} {
		sim, resto, units := kfcShamanFixture(t, 0, routing)
		defer sim.Cleanup()
		for index, unit := range units[1:] {
			unit.RemoveHealth(sim, float64(index+1)*1000)
		}
		resto.positions[units[1].UnitIndex] = KFCShamanFriendlyPosition{X: 0}
		resto.positions[units[2].UnitIndex] = KFCShamanFriendlyPosition{X: 5}
		resto.positions[units[3].UnitIndex] = KFCShamanFriendlyPosition{X: 12.5}
		resto.positions[units[4].UnitIndex] = KFCShamanFriendlyPosition{X: 12.51}
		used := map[int32]bool{units[1].UnitIndex: true}
		next := resto.kfcChainTarget(units[1], used)
		want := units[2]
		if routing == "largest-deficit-reference" {
			want = units[3]
		}
		if next != want {
			t.Fatal("Chain routing reference changed", routing)
		}
		used[units[2].UnitIndex] = true
		used[units[3].UnitIndex] = true
		if resto.kfcChainTarget(units[1], used) != nil {
			t.Fatal("Chain jumped outside its radius or repeated a target")
		}
		kfcShamanMeasure("ROUTING", map[string]interface{}{"routing": routing, "selected": next.UnitIndex})
	}
}

func TestKFCShamanGeometryRejectsUnknownPlayersAndKeepsOwnedCopy(t *testing.T) {
	for _, kind := range []string{"missing", "enemy", "nan", "range", "routing"} {
		sim := core.NewSim(kfcShamanRequest(0), simsignals.CreateSignals())
		sim.Reset()
		resto := sim.Raid.Parties[0].Players[0].(*RestorationShaman)
		positions := map[int32]KFCShamanFriendlyPosition{}
		for _, unit := range resto.kfcHealingPlayers() {
			positions[unit.UnitIndex] = KFCShamanFriendlyPosition{}
		}
		bounceRange, routing := 12.5, "nearest-injured-reference"
		switch kind {
		case "missing":
			delete(positions, resto.UnitIndex)
		case "enemy":
			positions[sim.Encounter.TargetUnits[0].UnitIndex] = KFCShamanFriendlyPosition{}
		case "nan":
			positions[resto.UnitIndex] = KFCShamanFriendlyPosition{X: math.NaN()}
		case "range":
			bounceRange = 100
		case "routing":
			routing = "unreviewed"
		}
		if resto.ConfigureKFCShamanHealingPositions(sim, positions, bounceRange, routing) == nil {
			t.Fatal("Invalid Shaman geometry accepted", kind)
		}
		sim.Cleanup()
	}
	sim := core.NewSim(kfcShamanRequest(0), simsignals.CreateSignals())
	sim.Reset()
	resto := sim.Raid.Parties[0].Players[0].(*RestorationShaman)
	defer sim.Cleanup()
	positions := map[int32]KFCShamanFriendlyPosition{}
	for _, unit := range resto.kfcHealingPlayers() {
		positions[unit.UnitIndex] = KFCShamanFriendlyPosition{}
	}
	if err := resto.ConfigureKFCShamanHealingPositions(sim, positions, 12.5, "nearest-injured-reference"); err != nil {
		t.Fatal(err)
	}
	positions[resto.UnitIndex] = KFCShamanFriendlyPosition{X: 100}
	delete(positions, resto.UnitIndex)
	if _, ok := resto.positions[resto.UnitIndex]; !ok || resto.positions[resto.UnitIndex].X != 0 {
		t.Fatal("Caller mutation changed Shaman geometry")
	}
	if resto.ConfigureKFCShamanHealingPositions(sim, resto.positions, 12.5, "nearest-injured-reference") == nil {
		t.Fatal("Geometry replaced after setup")
	}
	kfcShamanMeasure("GEOMETRY_GUARDS", true)
}
