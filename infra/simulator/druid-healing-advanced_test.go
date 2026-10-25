package restoration

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
	"github.com/wowsims/classic/sim/druid"
)

func kfcDruidAdvancedFixture(power float64, fields map[string]int32, dummies int32) (*core.Simulation, *RestorationDruid) {
	trees := []string{}
	for _, tree := range druid.ForeverTalentTreeFields {
		var value strings.Builder
		for _, field := range tree {
			value.WriteString(strconv.Itoa(int(fields[field])))
		}
		trees = append(trees, strings.TrimRight(value.String(), "0"))
	}
	bonus := stats.Stats{stats.HealingPower: power, stats.Mana: 10000}
	request := &proto.RaidSimRequest{Raid: &proto.Raid{Parties: []*proto.Party{{Players: []*proto.Player{{
		Name: "Druid talent/spell control", Level: 60, Race: proto.Race_RaceNightElf, Class: proto.Class_ClassDruid,
		Equipment: &proto.EquipmentSpec{}, BonusStats: &proto.UnitStats{Stats: bonus.ToFloatArray()}, TalentsString: strings.TrimRight(strings.Join(trees, "-"), "-"),
		Rotation: &proto.APLRotation{Type: proto.APLRotation_TypeAPL}, Spec: &proto.Player_RestorationDruid{RestorationDruid: &proto.RestorationDruid{Options: &proto.RestorationDruid_Options{}}},
	}}}}, TargetDummies: dummies}, Encounter: &proto.Encounter{Duration: 60, Targets: []*proto.Target{{Name: "Synthetic healer control", Level: 63}}},
		SimOptions: &proto.SimOptions{Iterations: 1, RandomSeed: 7911, Ruleset: proto.Ruleset_RulesetForever, IsTest: true, Interactive: true},
	}
	if dummies > 4 {
		request.Raid.Parties = append(request.Raid.Parties, &proto.Party{})
	}
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	return sim, sim.Raid.Parties[0].Players[0].(*RestorationDruid)
}
func kfcDruidAdvancedResult(name string, value interface{}) {
	body, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	fmt.Printf("KFC_DRUID_ADVANCED_%s %s\n", name, body)
}
func kfcDruidWound(sim *core.Simulation) {
	for _, unit := range sim.Raid.AllUnits {
		unit.RemoveHealth(sim, math.Min(9000, unit.MaxHealth()/2))
	}
}
func kfcDruidPositions(resto *RestorationDruid) map[int32]KFCDruidFriendlyPosition {
	values := map[int32]KFCDruidFriendlyPosition{}
	for _, unit := range resto.Env.Raid.AllUnits {
		values[unit.UnitIndex] = KFCDruidFriendlyPosition{}
	}
	return values
}

func TestKFCDruidHealingTalentCostsCastAndGCD(t *testing.T) {
	sim, resto := kfcDruidAdvancedFixture(500, map[string]int32{"naturalist": 5, "tranquilSpirit": 5, "giftOfTheEarthmother": 1, "swiftmend": 1, "wildGrowth": 1, "naturesFocus": 5, "improvedRegrowth": 5, "improvedTranquility": 2}, 2)
	ht := resto.GetSpell(core.ActionID{SpellID: 9889})
	reg := resto.GetSpell(core.ActionID{SpellID: 9858})
	rej := resto.GetSpell(core.ActionID{SpellID: 9841})
	trq := resto.GetSpell(core.ActionID{SpellID: 9863})
	if ht.DefaultCast.CastTime != 3*time.Second {
		t.Fatal("Naturalist did not reduce Healing Touch")
	}
	kfcDruidNear(t, ht.Cost.GetCurrentCost(), 755*.9)
	kfcDruidNear(t, trq.Cost.GetCurrentCost(), 925*.9)
	kfcDruidNear(t, reg.Cost.GetCurrentCost(), 525)
	kfcDruidNear(t, rej.Cost.GetCurrentCost(), 335)
	if trq.CD.Duration != 120*time.Second {
		t.Fatal("Improved Tranquility cooldown is incorrect")
	}
	for _, id := range []int32{9841, 18562, 1238215} {
		if resto.GetSpell(core.ActionID{SpellID: id}).DefaultCast.GCD != time.Second {
			t.Fatalf("Incorrect Earthmother GCD: %d", id)
		}
	}
	if reg.DefaultCast.GCD != 1500*time.Millisecond {
		t.Fatal("Earthmother affected Regrowth")
	}
	kfcDruidNear(t, ht.PushbackReduction, .7)
	kfcDruidNear(t, reg.BonusCritRating, 50*core.SpellCritRatingPerCritChance)
	target := &sim.Raid.GetFirstTargetDummy().Unit
	target.RemoveHealth(sim, 1000)
	if !rej.Cast(sim, target) {
		t.Fatal("Reduced-GCD Rejuvenation failed")
	}
	if resto.GCD.ReadyAt() != time.Second {
		t.Fatal("Actual GCD timer did not use Earthmother")
	}
	kfcDruidAdvancedResult("COSTS", []float64{ht.Cost.GetCurrentCost(), trq.Cost.GetCurrentCost(), reg.Cost.GetCurrentCost(), rej.Cost.GetCurrentCost(), ht.DefaultCast.CastTime.Seconds(), resto.GCD.ReadyAt().Seconds()})
}

func TestKFCDruidHealingTalentDirectAndPeriodicScope(t *testing.T) {
	outputs := []float64{}
	for _, entry := range []struct {
		id       int32
		duration time.Duration
		ratio    float64
	}{{9889, 3500 * time.Millisecond, 1.1}, {9858, 2 * time.Second, 1.1}, {9841, 3 * time.Second, 1.3}} {
		amounts := []float64{}
		for _, talented := range []bool{false, true} {
			fields := map[string]int32{}
			if talented {
				fields = map[string]int32{"giftOfNature": 5, "genesis": 5, "improvedRejuvenation": 3}
			}
			sim, resto := kfcDruidAdvancedFixture(500, fields, 2)
			target := &sim.Raid.GetFirstTargetDummy().Unit
			target.RemoveHealth(sim, 9000)
			spell := resto.GetSpell(core.ActionID{SpellID: entry.id})
			spell.BonusCritRating = -10000
			before := target.CurrentHealth()
			if !spell.Cast(sim, target) {
				t.Fatal("Talent scope cast failed")
			}
			kfcDruidAdvance(t, sim, entry.duration)
			amounts = append(amounts, target.CurrentHealth()-before)
		}
		kfcDruidNear(t, amounts[1], amounts[0]*entry.ratio)
		outputs = append(outputs, amounts...)
	}
	kfcDruidAdvancedResult("HEALING_SCOPE", outputs)
}

func TestKFCDruidHealingNatureSplendorTicks(t *testing.T) {
	for _, entry := range []struct {
		id       int32
		duration time.Duration
		ticks    int32
	}{{9841, 15 * time.Second, 5}, {9858, 29 * time.Second, 9}} {
		sim, resto := kfcDruidAdvancedFixture(500, map[string]int32{"naturesSplendor": 1}, 2)
		target := &sim.Raid.GetFirstTargetDummy().Unit
		target.RemoveHealth(sim, 9000)
		spell := resto.GetSpell(core.ActionID{SpellID: entry.id})
		spell.BonusCritRating = -10000
		if !spell.Cast(sim, target) {
			t.Fatal("Splendor cast failed")
		}
		kfcDruidAdvance(t, sim, entry.duration)
		if spell.Hot(target).IsActive() || spell.Hot(target).TickCount != entry.ticks {
			t.Fatalf("Incorrect extended ticks for %d: %d", entry.id, spell.Hot(target).TickCount)
		}
		kfcDruidAdvancedResult("SPLENDOR", map[string]interface{}{"id": entry.id, "ticks": spell.Hot(target).TickCount, "healing": spell.SpellMetrics[target.UnitIndex].TotalHealing})
	}
}

func TestKFCDruidHealingMoonglowSpiritAndReflection(t *testing.T) {
	_, plain := kfcDruidAdvancedFixture(500, nil, 2)
	_, talented := kfcDruidAdvancedFixture(500, map[string]int32{"moonglow": 3, "livingSpirit": 3, "reflection": 3}, 2)
	for _, id := range []int32{9889, 9858, 9841, 9863} {
		kfcDruidNear(t, talented.GetSpell(core.ActionID{SpellID: id}).Cost.GetCurrentCost(), plain.GetSpell(core.ActionID{SpellID: id}).Cost.GetCurrentCost())
	}
	kfcDruidNear(t, talented.GetStat(stats.Spirit), plain.GetStat(stats.Spirit)*1.15)
	kfcDruidNear(t, talented.PseudoStats.SpiritRegenRateCasting-plain.PseudoStats.SpiritRegenRateCasting, .5)
	if talented.ManaRegenPerSecondWhileCasting() <= plain.ManaRegenPerSecondWhileCasting() {
		t.Fatal("Reflection did not improve actual casting regeneration")
	}
	kfcDruidAdvancedResult("REGEN", []float64{plain.GetStat(stats.Spirit), talented.GetStat(stats.Spirit), plain.ManaRegenPerSecondWhileCasting(), talented.ManaRegenPerSecondWhileCasting()})
}

func TestKFCDruidSwiftmendOwnershipAmountManaAndNoConsumption(t *testing.T) {
	_, plain := kfcDruidAdvancedFixture(500, nil, 2)
	if plain.GetSpell(core.ActionID{SpellID: 18562}) != nil {
		t.Fatal("Untalented Swiftmend registered")
	}
	sim, resto := kfcDruidAdvancedFixture(500, map[string]int32{"swiftmend": 1}, 2)
	target := &sim.Raid.GetFirstTargetDummy().Unit
	target.RemoveHealth(sim, 9000)
	swift := resto.GetSpell(core.ActionID{SpellID: 18562})
	swift.BonusCritRating = -10000
	rej := resto.GetSpell(core.ActionID{SpellID: 9841})
	rej.BonusCritRating = -10000
	if swift.CanCast(sim, target) {
		t.Fatal("Swiftmend accepted no HoT")
	}
	if !rej.Cast(sim, target) {
		t.Fatal("Source Rejuvenation failed")
	}
	kfcDruidAdvance(t, sim, 1500*time.Millisecond)
	before, mana := target.CurrentHealth(), resto.Metrics.ManaSpent
	if !swift.Cast(sim, target) {
		t.Fatal("Swiftmend cast failed")
	}
	kfcDruidNear(t, target.CurrentHealth()-before, 1044)
	kfcDruidNear(t, resto.Metrics.ManaSpent-mana, resto.BaseMana*.2)
	if !rej.Hot(target).IsActive() {
		t.Fatal("Swiftmend consumed Rejuvenation")
	}
	kfcDruidAdvance(t, sim, 3*time.Second)
	if swift.CanCast(sim, target) {
		t.Fatal("Swiftmend cooldown was ignored")
	}
	kfcDruidAdvancedResult("SWIFTMEND", []float64{1044, resto.Metrics.ManaSpent - mana, swift.CD.ReadyAt().Seconds()})
}

func TestKFCDruidSwiftmendDeclaredSelectionPolicies(t *testing.T) {
	amounts := []float64{}
	for _, selection := range []string{"shortest", "largest"} {
		sim, resto := kfcDruidAdvancedFixture(500, map[string]int32{"swiftmend": 1}, 2)
		target := &sim.Raid.GetFirstTargetDummy().Unit
		target.RemoveHealth(sim, 9000)
		if err := resto.ConfigureKFCDruidHealing(kfcDruidPositions(resto), KFCDruidHealingPolicy{WildGrowthDecay: .1, SwiftmendSelection: selection}); err != nil {
			t.Fatal(err)
		}
		for _, id := range []int32{9841, 9858, 18562} {
			resto.GetSpell(core.ActionID{SpellID: id}).BonusCritRating = -10000
		}
		rej, reg := resto.GetSpell(core.ActionID{SpellID: 9841}), resto.GetSpell(core.ActionID{SpellID: 9858})
		rej.Cast(sim, target)
		kfcDruidAdvance(t, sim, 1500*time.Millisecond)
		reg.Cast(sim, target)
		kfcDruidAdvance(t, sim, 3500*time.Millisecond)
		before := target.CurrentHealth()
		if !resto.GetSpell(core.ActionID{SpellID: 18562}).Cast(sim, target) {
			t.Fatal("Dual-HoT Swiftmend failed")
		}
		amounts = append(amounts, target.CurrentHealth()-before)
		if !rej.Hot(target).IsActive() || !reg.Hot(target).IsActive() {
			t.Fatal("Dual-HoT Swiftmend consumed a source")
		}
	}
	kfcDruidNear(t, amounts[0], 1044)
	kfcDruidNear(t, amounts[1], 7*177.5)
	kfcDruidAdvancedResult("SWIFTMEND_SELECTION", amounts)
}

func TestKFCDruidTranquilityChannelPartyRangeAndRanks(t *testing.T) {
	sim, resto := kfcDruidAdvancedFixture(500, nil, 6)
	if resto.Party.Size() != 5 || len(sim.Raid.Parties) != 2 {
		t.Fatal("Control needs two separate parties")
	}
	kfcDruidWound(sim)
	positions := kfcDruidPositions(resto)
	outside := sim.Raid.AllUnits[2]
	positions[outside.UnitIndex] = KFCDruidFriendlyPosition{X: 21}
	if err := resto.ConfigureKFCDruidHealing(positions, KFCDruidHealingPolicy{WildGrowthDecay: .1, SwiftmendSelection: "shortest"}); err != nil {
		t.Fatal(err)
	}
	spell := resto.GetSpell(core.ActionID{SpellID: 9863})
	spell.BonusCritRating = -10000
	if spell.CanCast(sim, &sim.Raid.GetFirstTargetDummy().Unit) {
		t.Fatal("Tranquility accepted a non-self anchor")
	}
	if !spell.Cast(sim, &resto.Unit) || !resto.IsChanneling(sim) {
		t.Fatal("Tranquility did not channel")
	}
	kfcDruidAdvance(t, sim, 1999*time.Millisecond)
	kfcDruidNear(t, spell.SpellMetrics[resto.UnitIndex].TotalHealing, 0)
	kfcDruidAdvance(t, sim, 10*time.Second)
	values := []float64{}
	for _, unit := range sim.Raid.AllUnits {
		want := 0.0
		if resto.kfcFriendlyParty(unit) == resto.Party && unit != outside {
			want = 5 * 318.5
		}
		got := spell.SpellMetrics[unit.UnitIndex].TotalHealing
		kfcDruidNear(t, got, want)
		values = append(values, got)
	}
	if resto.IsChanneling(sim) || spell.AOEHot().IsActive() {
		t.Fatal("Tranquility outlived its channel")
	}
	if resto.GetSpell(core.ActionID{SpellID: 740}).IsReady(sim) {
		t.Fatal("Tranquility ranks did not share cooldown")
	}
	kfcDruidNear(t, resto.Metrics.ManaSpent, 925)
	kfcDruidAdvancedResult("TRANQUILITY", values)
}

func TestKFCDruidTranquilityInterruptAndCrit(t *testing.T) {
	sim, resto := kfcDruidAdvancedFixture(500, nil, 2)
	kfcDruidWound(sim)
	spell := resto.GetSpell(core.ActionID{SpellID: 9863})
	spell.BonusCritRating = 10000
	if !spell.Cast(sim, &resto.Unit) {
		t.Fatal("Tranquility failed")
	}
	kfcDruidAdvance(t, sim, 2*time.Second)
	target := &sim.Raid.GetFirstTargetDummy().Unit
	kfcDruidNear(t, spell.SpellMetrics[target.UnitIndex].TotalHealing, 318.5*1.5)
	resto.InterruptCast(sim)
	kfcDruidAdvance(t, sim, 12*time.Second)
	kfcDruidNear(t, spell.SpellMetrics[target.UnitIndex].TotalHealing, 318.5*1.5)
	if resto.IsChanneling(sim) {
		t.Fatal("Interrupted Tranquility remains active")
	}
	kfcDruidAdvancedResult("TRANQUILITY_INTERRUPT", spell.SpellMetrics[target.UnitIndex].TotalCritHealing)
}

func TestKFCDruidWildGrowthOwnershipPartyRangeAndTicks(t *testing.T) {
	_, plain := kfcDruidAdvancedFixture(500, nil, 2)
	if plain.GetSpell(core.ActionID{SpellID: 1238215}) != nil {
		t.Fatal("Untalented Wild Growth registered")
	}
	sim, resto := kfcDruidAdvancedFixture(500, map[string]int32{"wildGrowth": 1}, 6)
	kfcDruidWound(sim)
	target := &sim.Raid.GetFirstTargetDummy().Unit
	positions := kfcDruidPositions(resto)
	outside := sim.Raid.AllUnits[2]
	positions[outside.UnitIndex] = KFCDruidFriendlyPosition{X: 44}
	if err := resto.ConfigureKFCDruidHealing(positions, KFCDruidHealingPolicy{WildGrowthDecay: .1, SwiftmendSelection: "shortest"}); err != nil {
		t.Fatal(err)
	}
	spell := resto.GetSpell(core.ActionID{SpellID: 1238215})
	spell.BonusCritRating = -10000
	if !spell.Cast(sim, target) {
		t.Fatal("Wild Growth failed")
	}
	observed := []float64{}
	previous := 0.0
	for tick := 1; tick <= 7; tick++ {
		kfcDruidAdvance(t, sim, time.Duration(tick)*time.Second)
		total := spell.SpellMetrics[target.UnitIndex].TotalHealing
		observed = append(observed, total-previous)
		previous = total
	}
	for index, want := range []float64{147.55, 136.2, 124.85, 113.5, 102.15, 90.8, 79.45} {
		kfcDruidNear(t, observed[index], want)
	}
	for _, unit := range sim.Raid.AllUnits {
		want := 0.0
		if resto.kfcFriendlyParty(unit) == resto.Party && unit != outside {
			want = 794.5
		}
		kfcDruidNear(t, spell.SpellMetrics[unit.UnitIndex].TotalHealing, want)
	}
	kfcDruidNear(t, resto.Metrics.ManaSpent, 1050)
	if spell.Hot(target).IsActive() {
		t.Fatal("Wild Growth outlived seven ticks")
	}
	kfcDruidAdvancedResult("WILD_GROWTH", observed)
}

func TestKFCDruidWildGrowthTargetPartyAndRankReplacement(t *testing.T) {
	sim, resto := kfcDruidAdvancedFixture(500, map[string]int32{"wildGrowth": 1}, 6)
	kfcDruidWound(sim)
	target := sim.Raid.AllUnits[5]
	high, low := resto.GetSpell(core.ActionID{SpellID: 1238215}), resto.GetSpell(core.ActionID{SpellID: 408120})
	high.BonusCritRating = -10000
	low.BonusCritRating = -10000
	if !high.Cast(sim, target) {
		t.Fatal("Other-party Wild Growth failed")
	}
	kfcDruidAdvance(t, sim, 2*time.Second)
	if high.Hot(&resto.Unit).IsActive() || low.IsReady(sim) {
		t.Fatal("Wild Growth leaked parties or rank cooldowns")
	}
	kfcDruidAdvance(t, sim, 6*time.Second)
	if !low.Cast(sim, target) || high.Hot(target).IsActive() || !low.Hot(target).IsActive() {
		t.Fatal("Wild Growth ranks stacked or failed replacement")
	}
	kfcDruidAdvancedResult("WILD_GROWTH_REPLACE", []float64{high.SpellMetrics[target.UnitIndex].TotalHealing, low.CD.ReadyAt().Seconds()})
}

func TestKFCDruidWildGrowthDeclaredCurvesPreserveTotal(t *testing.T) {
	firsts := []float64{}
	for _, decay := range []float64{.05, .1, .2} {
		sim, resto := kfcDruidAdvancedFixture(500, map[string]int32{"wildGrowth": 1}, 2)
		target := &sim.Raid.GetFirstTargetDummy().Unit
		target.RemoveHealth(sim, 9000)
		if err := resto.ConfigureKFCDruidHealing(kfcDruidPositions(resto), KFCDruidHealingPolicy{WildGrowthDecay: decay, SwiftmendSelection: "shortest"}); err != nil {
			t.Fatal(err)
		}
		spell := resto.GetSpell(core.ActionID{SpellID: 1238215})
		spell.BonusCritRating = -10000
		spell.Cast(sim, target)
		kfcDruidAdvance(t, sim, time.Second)
		firsts = append(firsts, spell.SpellMetrics[target.UnitIndex].TotalHealing)
		kfcDruidAdvance(t, sim, 7*time.Second)
		kfcDruidNear(t, spell.SpellMetrics[target.UnitIndex].TotalHealing, 794.5)
	}
	for index, want := range []float64{130.525, 147.55, 181.6} {
		kfcDruidNear(t, firsts[index], want)
	}
	kfcDruidAdvancedResult("WILD_GROWTH_CURVES", firsts)
}

func TestKFCDruidHealingPositionAndPolicyValidation(t *testing.T) {
	_, resto := kfcDruidAdvancedFixture(500, nil, 2)
	policy := KFCDruidHealingPolicy{WildGrowthDecay: .1, SwiftmendSelection: "shortest"}
	if resto.ConfigureKFCDruidHealing(nil, policy) == nil {
		t.Fatal("Incomplete coordinates accepted")
	}
	positions := kfcDruidPositions(resto)
	positions[resto.UnitIndex] = KFCDruidFriendlyPosition{X: math.NaN()}
	if resto.ConfigureKFCDruidHealing(positions, policy) == nil {
		t.Fatal("Invalid coordinates accepted")
	}
	positions = kfcDruidPositions(resto)
	policy.WildGrowthDecay = .9
	if resto.ConfigureKFCDruidHealing(positions, policy) == nil {
		t.Fatal("Undeclared curve accepted")
	}
	kfcDruidNear(t, resto.healingPolicy.WildGrowthDecay, .1)
}

func TestKFCDruidHealingNaturesGraceDirectCritAndExpiry(t *testing.T) {
	sim, resto := kfcDruidAdvancedFixture(500, map[string]int32{"naturesGrace": 1}, 2)
	target := &sim.Raid.GetFirstTargetDummy().Unit
	target.RemoveHealth(sim, 9000)
	spell := resto.GetSpell(core.ActionID{SpellID: 9889})
	spell.BonusCritRating = 10000
	if !spell.Cast(sim, target) {
		t.Fatal("Nature's Grace trigger failed")
	}
	kfcDruidAdvance(t, sim, 3500*time.Millisecond)
	if !resto.NaturesGraceHasteAura.IsActive() {
		t.Fatal("Direct healing crit did not trigger Nature's Grace")
	}
	if spell.DefaultCast.GCD != 1350*time.Millisecond {
		t.Fatal("Healing GCD did not receive Nature's Grace")
	}
	spell.BonusCritRating = -10000
	if !spell.Cast(sim, target) {
		t.Fatal("Hasted heal failed")
	}
	baseDuration := float64(3500 * time.Millisecond)
	expected := 3500*time.Millisecond + time.Duration(baseDuration/1.1)
	kfcDruidNear(t, resto.Hardcast.Expires.Seconds(), expected.Seconds())
	kfcDruidAdvance(t, sim, 6500*time.Millisecond)
	if resto.NaturesGraceHasteAura.IsActive() || spell.DefaultCast.GCD != 1500*time.Millisecond {
		t.Fatal("Nature's Grace did not expire cleanly")
	}
	kfcDruidAdvancedResult("NATURES_GRACE", []float64{expected.Seconds(), spell.DefaultCast.GCD.Seconds()})
}

func TestKFCDruidHealingNaturesGraceExcludesPeriodicCrits(t *testing.T) {
	sim, resto := kfcDruidAdvancedFixture(500, map[string]int32{"naturesGrace": 1}, 2)
	target := &sim.Raid.GetFirstTargetDummy().Unit
	target.RemoveHealth(sim, 9000)
	spell := resto.GetSpell(core.ActionID{SpellID: 9841})
	spell.BonusCritRating = 10000
	if !spell.Cast(sim, target) {
		t.Fatal("Periodic critical control failed")
	}
	kfcDruidAdvance(t, sim, 3*time.Second)
	if resto.NaturesGraceHasteAura.IsActive() {
		t.Fatal("Periodic crit triggered Nature's Grace")
	}
	kfcDruidNear(t, spell.SpellMetrics[target.UnitIndex].TotalCritHealing, 391.5)
}

func TestKFCDruidHealingNaturesSwiftnessOwnershipAndConsumption(t *testing.T) {
	_, plain := kfcDruidAdvancedFixture(500, nil, 2)
	if plain.GetSpell(core.ActionID{SpellID: 17116}) != nil {
		t.Fatal("Untalented Nature's Swiftness registered")
	}
	sim, resto := kfcDruidAdvancedFixture(500, map[string]int32{"naturesSwiftness": 1}, 2)
	target := &sim.Raid.GetFirstTargetDummy().Unit
	target.RemoveHealth(sim, 9000)
	ns, ht, rej := resto.GetSpell(core.ActionID{SpellID: 17116}), resto.GetSpell(core.ActionID{SpellID: 9889}), resto.GetSpell(core.ActionID{SpellID: 9841})
	ht.BonusCritRating = -10000
	if !ns.Cast(sim, &resto.Unit) || !rej.Cast(sim, target) {
		t.Fatal("Nature's Swiftness setup failed")
	}
	aura := resto.GetAuraByID(core.ActionID{SpellID: 17116})
	if !aura.IsActive() {
		t.Fatal("Instant HoT consumed Nature's Swiftness")
	}
	kfcDruidAdvance(t, sim, 1500*time.Millisecond)
	before := target.CurrentHealth()
	if !ht.Cast(sim, target) || target.CurrentHealth() <= before || resto.IsCasting(sim) {
		t.Fatal("Nature's Swiftness did not make the heal instant")
	}
	if aura.IsActive() {
		t.Fatal("Nature's Swiftness charge was not consumed")
	}
	kfcDruidNear(t, ht.CastTimeMultiplier, 1)
	if ns.CD.ReadyAt() != 180*time.Second {
		t.Fatal("Nature's Swiftness cooldown changed")
	}
	kfcDruidAdvancedResult("NATURES_SWIFTNESS", []float64{target.CurrentHealth() - before, ns.CD.ReadyAt().Seconds()})
}

func TestKFCDruidAdvancedHealingReset(t *testing.T) {
	sim, resto := kfcDruidAdvancedFixture(500, map[string]int32{"wildGrowth": 1, "naturesSwiftness": 1, "naturesGrace": 1}, 2)
	target := &sim.Raid.GetFirstTargetDummy().Unit
	target.RemoveHealth(sim, 9000)
	resto.GetSpell(core.ActionID{SpellID: 1238215}).Cast(sim, target)
	resto.GetSpell(core.ActionID{SpellID: 17116}).Cast(sim, &resto.Unit)
	resto.NaturesGraceHasteAura.Activate(sim)
	sim.Cleanup()
	sim.Reset()
	if resto.GetSpell(core.ActionID{SpellID: 1238215}).Hot(target).IsActive() || resto.GetAuraByID(core.ActionID{SpellID: 17116}).IsActive() || resto.NaturesGraceHasteAura.IsActive() {
		t.Fatal("Advanced healing state leaked across iterations")
	}
	if resto.GetSpell(core.ActionID{SpellID: 1238215}).DefaultCast.GCD != 1500*time.Millisecond {
		t.Fatal("Nature's Grace GCD modifier leaked across reset")
	}
	kfcDruidNear(t, resto.GetSpell(core.ActionID{SpellID: 9889}).CastTimeMultiplier, 1)
}
