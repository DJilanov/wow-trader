package restoration

import (
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
)

var kfcShamanCastSetGear = map[int32][]int32{
	181: {16682, 16683, 16684, 16685, 16686, 16687, 16688, 16689},
	182: {16690, 16691, 16692, 16693, 16694, 16695, 16696, 16697},
	183: {16698, 16699, 16700, 16701, 16702, 16703, 16704, 16705},
	185: {16706, 16714, 16715, 16716, 16717, 16718, 16719, 16720},
}

func kfcShamanCastSetFixture(t *testing.T, setID int32, pieces int, routing string, references ...string) (*core.Simulation, *RestorationShaman, []*core.Unit) {
	t.Helper()
	if len(references) > 2 {
		t.Fatal("Ambiguous cast-set references")
	}
	request := kfcShamanRequest(500)
	request.Encounter.Duration = 600
	player := request.Raid.Parties[0].Players[0]
	player.TalentsString = kfcRiptideTalentString(map[string]int32{"riptide": 1, "water_shield": 1, "mana_tide_totem": 1, "natures_swiftness": 1})
	player.Equipment = &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
	for index := range player.Equipment.Items {
		player.Equipment.Items[index] = &proto.ItemSpec{}
	}
	for index, id := range kfcShamanCastSetGear[setID] {
		if index < pieces {
			player.Equipment.Items[index].Id = id
		}
	}
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	resto := sim.Raid.Parties[0].Players[0].(*RestorationShaman)
	resources := kfcShamanResourceDefault()
	if len(references) > 1 {
		resources.ShieldTriggers = references[1]
	}
	kfcRiptideConfigure(t, sim, resto, kfcRiptideDefault(), resources)
	if pieces >= 5 && routing != "" {
		policy := KFCShamanCastResourceSetPolicy{ProcRouting: routing}
		if setID == 185 {
			policy.WildheartChance = "two-percent-reference"
			if len(references) > 0 {
				policy.WildheartChance = references[0]
			}
		}
		if setID == 183 {
			policy.DreadmistCriticals = "noncritical-reference"
			if len(references) > 0 {
				policy.DreadmistCriticals = references[0]
			}
		}
		if err := resto.ConfigureKFCShamanCastResourceSets(sim, policy); err != nil {
			t.Fatal(err)
		}
	}
	return sim, resto, resto.kfcHealingPlayers()
}

func kfcShamanCastSetEvent(resto *RestorationShaman, sim *core.Simulation) {
	aura := resto.GetAura("KFC Shaman cast-resource trigger")
	aura.OnCastComplete(aura, sim, resto.GetSpell(core.ActionID{SpellID: 10396}))
}

func kfcShamanCastSetUntilProc(t *testing.T, resto *RestorationShaman, sim *core.Simulation) {
	t.Helper()
	before := resto.KFCShamanCastResourceSetMetrics().Procs
	for n := 0; n < 10000; n++ {
		kfcShamanCastSetEvent(resto, sim)
		if resto.KFCShamanCastResourceSetMetrics().Procs > before {
			return
		}
	}
	t.Fatal("Fixed-seed proc control did not produce an event")
}

func TestKFCShamanCastSetsExactOwnersThresholdsAndFlatBonuses(t *testing.T) {
	base, empty, _ := kfcShamanCastSetFixture(t, 0, 0, "")
	defer base.Cleanup()
	for _, id := range []int32{181, 182, 183, 185} {
		for pieces := 0; pieces <= 8; pieces++ {
			sim, resto, _ := kfcShamanCastSetFixture(t, id, pieces, "completed-class-healing-casts-reference")
			if (resto.kfcCastResourceSets != nil) != (pieces >= 5) {
				t.Fatal("Wrong five-piece activation", id, pieces)
			}
			if pieces >= 5 && resto.kfcCastResourceSets.setID != id {
				t.Fatal("Wrong exact set owner")
			}
			if resto.GetAura("Sudden Insight") != nil {
				t.Fatal("Inherited cast mana handler double-applied", id)
			}
			for _, stat := range []stats.Stat{stats.HealingPower, stats.SpellDamage, stats.MP5, stats.ArcaneResistance, stats.FireResistance, stats.FrostResistance, stats.NatureResistance, stats.ShadowResistance} {
				gear := 0.0
				for _, item := range resto.Equipment {
					gear += item.Stats[stat]
				}
				want := 0.0
				if stat == stats.HealingPower || stat == stats.SpellDamage {
					if pieces >= 3 {
						want = 18
					}
				} else if stat == stats.MP5 {
					if pieces >= 6 {
						want = 8
					}
				} else if pieces >= 2 {
					want = 8
				}
				kfcShamanNear(t, resto.GetStat(stat)-empty.GetStat(stat)-gear, want)
			}
			kfcShamanMeasure("CAST_SETS_OWNERSHIP", []int32{id, int32(pieces)})
			sim.Cleanup()
		}
	}
}

func TestKFCShamanCastSetsFixedChanceMatchesIndependentSeededOracle(t *testing.T) {
	for _, id := range []int32{181, 182, 183} {
		sim, resto, _ := kfcShamanCastSetFixture(t, id, 5, "completed-class-healing-casts-reference")
		oracle, _, _ := kfcShamanCastSetFixture(t, 0, 0, "")
		want := int32(0)
		for n := 0; n < 1000; n++ {
			if id != 183 && resto.CurrentMana() > 200 {
				resto.SpendMana(sim, 200, resto.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 841}))
			}
			kfcShamanCastSetEvent(resto, sim)
			if oracle.Proc(.05, "KFC Shaman cast-resource proc") {
				want++
			}
		}
		metrics := resto.KFCShamanCastResourceSetMetrics()
		if metrics.Attempts != 1000 || metrics.Procs != want || want == 0 {
			t.Fatal("Five-percent proc counter differs from seeded oracle", id, metrics, want)
		}
		if id != 183 {
			kfcShamanNear(t, metrics.ManaAttempted, float64(want)*200)
			kfcShamanNear(t, metrics.ManaRestored, float64(want)*200)
		} else {
			heal := resto.kfcCastResourceSets.heal.SpellMetrics[resto.UnitIndex]
			if heal.Hits != want || heal.Crits != 0 {
				t.Fatal("Wrong noncritical Dreadmist dispatch", heal)
			}
		}
		kfcShamanMeasure("CAST_SETS_FIXED_CHANCE", map[string]interface{}{"set": id, "metrics": metrics})
		oracle.Cleanup()
		sim.Cleanup()
	}
}

func TestKFCShamanCastSetsWildheartExplicitRatesAndManaOnly(t *testing.T) {
	for _, reference := range []string{"two-percent-reference", "five-percent-reference"} {
		sim, resto, _ := kfcShamanCastSetFixture(t, 185, 5, "completed-class-healing-casts-reference", reference)
		oracle, _, _ := kfcShamanCastSetFixture(t, 0, 0, "")
		chance := .02
		if reference == "five-percent-reference" {
			chance = .05
		}
		want := int32(0)
		for n := 0; n < 1000; n++ {
			if resto.CurrentMana() > 200 {
				resto.SpendMana(sim, 200, resto.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 842}))
			}
			kfcShamanCastSetEvent(resto, sim)
			if oracle.Proc(chance, "KFC Shaman cast-resource proc") {
				want++
			}
		}
		metrics := resto.KFCShamanCastResourceSetMetrics()
		if metrics.Attempts != 1000 || metrics.Procs != want || want == 0 {
			t.Fatal("Wrong Wildheart chance reference", reference, metrics, want)
		}
		kfcShamanNear(t, metrics.ManaRestored, float64(want)*200)
		if resto.GetSpell(core.ActionID{SpellID: 27783}) != nil || resto.GetSpell(core.ActionID{SpellID: 27784}) != nil {
			t.Fatal("Healer acquired rage or energy dispatch")
		}
		kfcShamanMeasure("CAST_SETS_WILDHEART", map[string]interface{}{"reference": reference, "metrics": metrics})
		oracle.Cleanup()
		sim.Cleanup()
	}
}

func TestKFCShamanCastSetsManaCapSeparatesAttemptedAndUsefulRestoration(t *testing.T) {
	for _, id := range []int32{181, 182, 185} {
		sim, resto, _ := kfcShamanCastSetFixture(t, id, 5, "completed-class-healing-casts-reference")
		for n := 0; n < 1000; n++ {
			kfcShamanCastSetEvent(resto, sim)
		}
		metrics := resto.KFCShamanCastResourceSetMetrics()
		if metrics.Procs == 0 {
			t.Fatal("Cap control had no proc")
		}
		kfcShamanNear(t, metrics.ManaAttempted, float64(metrics.Procs)*200)
		kfcShamanNear(t, metrics.ManaRestored, 0)
		kfcShamanNear(t, resto.kfcCastResourceSets.mana.ActualGainForCurrentIteration(), 0)
		kfcShamanMeasure("CAST_SETS_MANA_CAP", map[string]interface{}{"set": id, "metrics": metrics})
		sim.Cleanup()
	}
}

func TestKFCShamanCastSetsActualCastsProduceSingleProcAttempts(t *testing.T) {
	for _, id := range []int32{181, 182, 183, 185} {
		sim, resto, units := kfcShamanCastSetFixture(t, id, 5, "completed-class-healing-casts-reference")
		spell := resto.GetSpell(core.ActionID{SpellID: 331})
		for n := 0; n < 200; n++ {
			if !spell.Cast(sim, units[1]) {
				t.Fatal("Actual cast-set heal rejected", id, n)
			}
			kfcShamanAdvance(t, sim, sim.CurrentTime+max(spell.DefaultCast.CastTime, 1500*time.Millisecond))
		}
		metrics := resto.KFCShamanCastResourceSetMetrics()
		if metrics.Attempts != 200 || metrics.Procs == 0 {
			t.Fatal("Wrong actual completed-cast attempts", id, metrics)
		}
		kfcShamanNear(t, resto.Metrics.ManaSpent, spell.Cost.GetCurrentCost()*200)
		kfcShamanMeasure("CAST_SETS_ACTUAL_CASTS", map[string]interface{}{"set": id, "metrics": metrics, "manaSpent": resto.Metrics.ManaSpent})
		sim.Cleanup()
	}
}

func TestKFCShamanCastSetsChainAndRiptideEventRouting(t *testing.T) {
	for _, routing := range []string{"completed-class-healing-casts-reference", "completed-owned-spell-casts-reference", "direct-class-healing-events-reference", "all-class-healing-events-reference"} {
		for _, id := range []int32{10623, 1239243} {
			sim, resto, units := kfcShamanCastSetFixture(t, 181, 5, routing)
			for _, target := range units[1:4] {
				target.RemoveHealth(sim, 9000)
			}
			if !resto.GetSpell(core.ActionID{SpellID: id}).Cast(sim, units[1]) {
				t.Fatal("Routing cast rejected")
			}
			kfcShamanAdvance(t, sim, 16*time.Second)
			want := int32(1)
			if id == 10623 && (routing == "direct-class-healing-events-reference" || routing == "all-class-healing-events-reference") {
				want = 3
			}
			if id == 1239243 && routing == "all-class-healing-events-reference" {
				want = 6
			}
			if resto.KFCShamanCastResourceSetMetrics().Attempts != want {
				t.Fatal("Wrong cast vs recipient/tick routing", routing, id, resto.KFCShamanCastResourceSetMetrics())
			}
			kfcShamanMeasure("CAST_SETS_EVENT_ROUTING", map[string]interface{}{"routing": routing, "spell": id, "metrics": resto.KFCShamanCastResourceSetMetrics()})
			sim.Cleanup()
		}
	}
}

func TestKFCShamanCastSetsOwnedResourceCastsFollowCompletionFlags(t *testing.T) {
	for _, routing := range []string{"completed-class-healing-casts-reference", "completed-owned-spell-casts-reference"} {
		for _, id := range []int32{408510, 16188, 16190, 5394} {
			sim, resto, _ := kfcShamanCastSetFixture(t, 185, 5, routing)
			if !resto.GetSpell(core.ActionID{SpellID: id}).Cast(sim, &resto.Unit) {
				t.Fatal("Resource cast rejected", id)
			}
			want := int32(0)
			if routing == "completed-owned-spell-casts-reference" && id != 16188 {
				want = 1
			}
			if resto.KFCShamanCastResourceSetMetrics().Attempts != want {
				t.Fatal("Wrong resource completion", routing, id)
			}
			kfcShamanMeasure("CAST_SETS_RESOURCE_CAST", map[string]interface{}{"routing": routing, "spell": id, "attempts": want})
			sim.Cleanup()
		}
	}
}

func TestKFCShamanCastSetsDreadmistCritAndZeroPowerCoefficient(t *testing.T) {
	for _, reference := range []string{"noncritical-reference", "critical-reference"} {
		values := []float64{}
		for _, extra := range []float64{0, 1000} {
			sim, resto, _ := kfcShamanCastSetFixture(t, 183, 5, "completed-class-healing-casts-reference", reference)
			resto.AddStatDynamic(sim, stats.HealingPower, extra)
			resto.kfcCastResourceSets.heal.BonusCritRating = 10000
			resto.RemoveHealth(sim, 5000)
			before := resto.CurrentHealth()
			for n := 0; n < 1000; n++ {
				kfcShamanCastSetEvent(resto, sim)
			}
			metrics := resto.kfcCastResourceSets.heal.SpellMetrics[resto.UnitIndex]
			procs := resto.KFCShamanCastResourceSetMetrics().Procs
			factor := 1.0
			if reference == "critical-reference" {
				factor = 1.5
				if metrics.Crits != procs {
					t.Fatal("Critical child did not use critical outcome")
				}
			} else if metrics.Crits != 0 || metrics.Hits != procs {
				t.Fatal("Noncritical reference admitted a crit")
			}
			if metrics.TotalHealing < float64(procs)*270*factor || metrics.TotalHealing > float64(procs)*330*factor {
				t.Fatal("Self-heal source amount drift", metrics)
			}
			kfcShamanNear(t, resto.CurrentHealth()-before, min(5000, metrics.TotalHealing))
			values = append(values, metrics.TotalHealing)
			sim.Cleanup()
		}
		kfcShamanNear(t, values[0], values[1])
		kfcShamanMeasure("CAST_SETS_DREADMIST_POWER", map[string]interface{}{"reference": reference, "values": values})
	}
}

func TestKFCShamanCastSetsCriticalOverhealCanReturnWaterShieldMana(t *testing.T) {
	for _, scope := range []string{"class-direct-critical-heals-reference", "all-direct-critical-heals-reference", "all-critical-heals-reference"} {
		sim, resto, _ := kfcShamanCastSetFixture(t, 183, 5, "completed-class-healing-casts-reference", "critical-reference", scope)
		resto.kfcCastResourceSets.heal.BonusCritRating = 10000
		resto.SpendMana(sim, 2000, resto.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 843}))
		if !resto.WaterShield.Cast(sim, &resto.Unit) {
			t.Fatal("Shield rejected")
		}
		kfcShamanCastSetUntilProc(t, resto, sim)
		gain := resto.MaxMana() * .02
		charges := int32(2)
		if scope == "class-direct-critical-heals-reference" {
			gain = 0
			charges = 3
		}
		kfcShamanNear(t, resto.kfcActives.shieldMetrics.ActualGainForCurrentIteration(), gain)
		if resto.WaterShieldAura.GetStacks() != charges {
			t.Fatal("Critical child used wrong shield scope")
		}
		kfcShamanNear(t, resto.CurrentHealth(), resto.MaxHealth())
		child := resto.kfcCastResourceSets.heal.SpellMetrics[resto.UnitIndex]
		if child.Crits != 1 || child.TotalHealing <= 0 {
			t.Fatal("Missing actual critical self-heal")
		}
		kfcShamanCastSetUntilProc(t, resto, sim)
		kfcShamanNear(t, resto.kfcActives.shieldMetrics.ActualGainForCurrentIteration(), gain)
		kfcShamanAdvance(t, sim, 3500*time.Millisecond)
		kfcShamanCastSetUntilProc(t, resto, sim)
		kfcShamanNear(t, resto.kfcActives.shieldMetrics.ActualGainForCurrentIteration(), 2*gain)
		kfcShamanMeasure("CAST_SETS_SHIELD_OVERHEAL", map[string]interface{}{"scope": scope, "mana": resto.kfcActives.shieldMetrics.ActualGainForCurrentIteration(), "childProcs": resto.KFCShamanCastResourceSetMetrics().Procs})
		sim.Cleanup()
	}
}

func TestKFCShamanCastSetsFreshPolicyOwnershipAndCopiedEcho(t *testing.T) {
	for _, id := range []int32{181, 182, 183, 185} {
		sim, resto, units := kfcShamanCastSetFixture(t, id, 5, "")
		if resto.GetSpell(core.ActionID{SpellID: 331}).CanCast(sim, units[1]) || resto.WaterShield.CanCast(sim, &resto.Unit) {
			t.Fatal("Unconfigured cast-set owner could cast")
		}
		base := KFCShamanCastResourceSetPolicy{ProcRouting: "completed-class-healing-casts-reference"}
		if id == 185 {
			base.WildheartChance = "two-percent-reference"
		}
		if id == 183 {
			base.DreadmistCriticals = "noncritical-reference"
		}
		bad := base
		bad.ProcRouting = "guessed"
		if resto.ConfigureKFCShamanCastResourceSets(sim, bad) == nil {
			t.Fatal("Unknown routing admitted")
		}
		bad = base
		if id == 185 {
			bad.WildheartChance = "guessed"
		} else {
			bad.WildheartChance = "two-percent-reference"
		}
		if resto.ConfigureKFCShamanCastResourceSets(sim, bad) == nil {
			t.Fatal("Wrong Wildheart reference admitted")
		}
		bad = base
		if id == 183 {
			bad.DreadmistCriticals = "guessed"
		} else {
			bad.DreadmistCriticals = "critical-reference"
		}
		if resto.ConfigureKFCShamanCastResourceSets(sim, bad) == nil {
			t.Fatal("Wrong Dreadmist reference admitted")
		}
		if resto.ConfigureKFCShamanCastResourceSets(nil, base) == nil {
			t.Fatal("Nil simulation admitted")
		}
		if resto.KFCShamanCastResourceSetPolicyEcho() != nil {
			t.Fatal("Rejected policy mutated state")
		}
		if err := resto.ConfigureKFCShamanCastResourceSets(sim, base); err != nil {
			t.Fatal(err)
		}
		echo := resto.KFCShamanCastResourceSetPolicyEcho()
		echo.ProcRouting = "mutated"
		if resto.KFCShamanCastResourceSetPolicyEcho().ProcRouting != base.ProcRouting {
			t.Fatal("Echo aliases live policy")
		}
		if resto.ConfigureKFCShamanCastResourceSets(sim, base) == nil {
			t.Fatal("Duplicate policy admitted")
		}
		kfcShamanMeasure("CAST_SETS_POLICY_GUARDS", id)
		sim.Cleanup()
	}
	for _, pieces := range []int{0, 4} {
		sim, resto, _ := kfcShamanCastSetFixture(t, 181, pieces, "")
		if resto.ConfigureKFCShamanCastResourceSets(sim, KFCShamanCastResourceSetPolicy{ProcRouting: "completed-class-healing-casts-reference"}) == nil {
			t.Fatal("Unowned policy admitted")
		}
		sim.Cleanup()
	}
}

func TestKFCShamanCastSetsIterationResetClearsCountersWithoutDuplicateEffects(t *testing.T) {
	for _, id := range []int32{181, 182, 183, 185} {
		sim, resto, _ := kfcShamanCastSetFixture(t, id, 5, "completed-class-healing-casts-reference")
		for iteration := 0; iteration < 3; iteration++ {
			kfcShamanCastSetUntilProc(t, resto, sim)
			if resto.KFCShamanCastResourceSetMetrics().Procs != 1 {
				t.Fatal("Proc recursion or duplicate handler")
			}
			sim.Cleanup()
			sim.Reset()
			if resto.KFCShamanCastResourceSetMetrics() != (KFCShamanCastResourceSetMetrics{}) {
				t.Fatal("Counters survived reset")
			}
		}
		kfcShamanMeasure("CAST_SETS_RESET", id)
		sim.Cleanup()
	}
}

func TestKFCShamanCastSetsDeadOwnerCannotEarnResourceOrHealProcs(t *testing.T) {
	for _, id := range []int32{181, 182, 183, 185} {
		sim, resto, _ := kfcShamanCastSetFixture(t, id, 5, "completed-class-healing-casts-reference")
		resto.RemoveHealth(sim, resto.CurrentHealth())
		for n := 0; n < 1000; n++ {
			kfcShamanCastSetEvent(resto, sim)
		}
		if resto.KFCShamanCastResourceSetMetrics() != (KFCShamanCastResourceSetMetrics{}) {
			t.Fatal("Dead owner gained proc credit")
		}
		kfcShamanMeasure("CAST_SETS_DEAD", id)
		sim.Cleanup()
	}
}
