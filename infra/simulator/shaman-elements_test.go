package restoration

import (
	"reflect"
	"sort"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
)

func kfcShamanElementsFixture(t *testing.T, pieces int, routing string, chances ...string) (*core.Simulation, *RestorationShaman, []*core.Unit) {
	t.Helper()
	if len(chances) > 1 {
		t.Fatal("Ambiguous Elements reference")
	}
	request := kfcShamanRequest(500)
	request.Encounter.Duration = 600
	player := request.Raid.Parties[0].Players[0]
	player.TalentsString = kfcShamanHealingStudySeeds[0]
	player.Equipment = &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
	for index := range player.Equipment.Items {
		player.Equipment.Items[index] = &proto.ItemSpec{}
	}
	for index, id := range []int32{16666, 16667, 16668, 16669, 16670, 16671, 16672, 16673} {
		if index < pieces {
			player.Equipment.Items[index].Id = id
		}
	}
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	resto := sim.Raid.Parties[0].Players[0].(*RestorationShaman)
	kfcRiptideConfigure(t, sim, resto, kfcRiptideDefault(), kfcShamanResourceDefault())
	if pieces >= 5 && routing != "" {
		chance := "four-percent-sensitivity-reference"
		if len(chances) == 1 {
			chance = chances[0]
		}
		if err := resto.ConfigureKFCShamanElementsPolicy(sim, KFCShamanElementsPolicy{ProcChance: chance, ProcRouting: routing}); err != nil {
			t.Fatal(err)
		}
	}
	return sim, resto, resto.kfcHealingPlayers()
}

func TestKFCShamanElementsCurrentThresholdsAndFlatStatsRemainExact(t *testing.T) {
	base, empty, _ := kfcShamanElementsFixture(t, 0, "")
	defer base.Cleanup()
	for pieces := 0; pieces <= 8; pieces++ {
		sim, resto, _ := kfcShamanElementsFixture(t, pieces, "completed-class-healing-casts-reference")
		var actual, expected []int32
		for _, bonus := range resto.GetActiveSetBonuses() {
			if bonus.Name == "The Elements" {
				actual = append(actual, bonus.NumPieces)
			}
		}
		for _, threshold := range []int32{2, 3, 5, 6} {
			if pieces >= int(threshold) {
				expected = append(expected, threshold)
			}
		}
		sort.Slice(actual, func(i, j int) bool { return actual[i] < actual[j] })
		if !reflect.DeepEqual(actual, expected) {
			t.Fatal("Wrong current Elements thresholds", pieces, actual, expected)
		}
		for _, stat := range []stats.Stat{stats.ArcaneResistance, stats.FireResistance, stats.FrostResistance, stats.NatureResistance, stats.ShadowResistance, stats.HealingPower, stats.SpellDamage, stats.MP5} {
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
		if (resto.kfcElements != nil) != (pieces >= 5) || resto.kfcFiveThunders != nil || resto.KFCOwnedShamanHealingSetID(187) {
			t.Fatal("Wrong exact set ownership", pieces)
		}
		kfcShamanMeasure("ELEMENTS_THRESHOLDS", map[string]interface{}{"pieces": pieces, "thresholds": actual})
		sim.Cleanup()
	}
}

func TestKFCShamanElementsExactSeededProbabilityAndBothPowerChannels(t *testing.T) {
	sim, resto, _ := kfcShamanElementsFixture(t, 5, "completed-class-healing-casts-reference")
	defer sim.Cleanup()
	oracle, _, _ := kfcShamanElementsFixture(t, 0, "")
	defer oracle.Cleanup()
	aura, buff := resto.GetAura("KFC Elements trigger"), resto.kfcElements.buff
	healing, damage, power := resto.GetStat(stats.HealingPower), resto.GetStat(stats.SpellDamage), resto.GetStat(stats.SpellPower)
	wantProcs := 0
	for attempt := 0; attempt < 1000; attempt++ {
		aura.OnCastComplete(aura, sim, resto.GetSpell(core.ActionID{SpellID: 10396}))
		want := oracle.Proc(.04, "KFC Elements proc")
		if buff.IsActive() != want {
			t.Fatal("Sensitivity four-percent probability differs from independent seeded oracle")
		}
		if want {
			wantProcs++
			kfcShamanNear(t, resto.GetStat(stats.HealingPower)-healing, 65)
			kfcShamanNear(t, resto.GetStat(stats.SpellDamage)-damage, 65)
		}
		kfcShamanNear(t, resto.GetStat(stats.SpellPower), power)
		buff.Deactivate(sim)
		kfcShamanNear(t, resto.GetStat(stats.HealingPower), healing)
	}
	metrics := resto.KFCShamanElementsProcMetrics()
	if metrics.Attempts != 1000 || metrics.Procs != int32(wantProcs) || wantProcs == 0 {
		t.Fatal("Incorrect recorded set proc events", metrics)
	}
	kfcShamanMeasure("ELEMENTS_PROBABILITY", metrics)
}

func TestKFCShamanElementsActualChainCastVersusRecipientRouting(t *testing.T) {
	for _, routing := range []string{"completed-class-healing-casts-reference", "completed-owned-spell-casts-reference", "direct-class-healing-events-reference", "all-class-healing-events-reference"} {
		sim, resto, units := kfcShamanElementsFixture(t, 5, routing)
		for _, unit := range units[1:4] {
			unit.RemoveHealth(sim, 5000)
		}
		spell := resto.GetSpell(core.ActionID{SpellID: 10623})
		if !spell.Cast(sim, units[1]) {
			t.Fatal("Owned Chain Heal rejected")
		}
		kfcShamanAdvance(t, sim, 3*time.Second)
		want := int32(3)
		if routing == "completed-class-healing-casts-reference" || routing == "completed-owned-spell-casts-reference" {
			want = 1
		}
		metrics := resto.KFCShamanElementsProcMetrics()
		if metrics.Attempts != want {
			t.Fatal("Chain bounce proc routing changed", routing, metrics)
		}
		kfcShamanMeasure("ELEMENTS_CHAIN_ROUTING", map[string]interface{}{"routing": routing, "metrics": metrics})
		sim.Cleanup()
	}
}

func TestKFCShamanElementsActualRiptidePeriodicRouting(t *testing.T) {
	for _, routing := range []string{"completed-class-healing-casts-reference", "completed-owned-spell-casts-reference", "direct-class-healing-events-reference", "all-class-healing-events-reference"} {
		sim, resto, units := kfcShamanElementsFixture(t, 5, routing)
		units[1].RemoveHealth(sim, 9000)
		if !resto.kfcRiptide.spells[1239243].Cast(sim, units[1]) {
			t.Fatal("Owned Riptide rejected")
		}
		kfcShamanAdvance(t, sim, 16*time.Second)
		want := int32(1)
		if routing == "all-class-healing-events-reference" {
			want = 6
		}
		metrics := resto.KFCShamanElementsProcMetrics()
		if metrics.Attempts != want {
			t.Fatal("Riptide periodic routing changed", routing, metrics)
		}
		kfcShamanMeasure("ELEMENTS_RIPTIDE_ROUTING", map[string]interface{}{"routing": routing, "metrics": metrics})
		sim.Cleanup()
	}
}

func TestKFCShamanElementsWaterTotemsDoNotBecomeClassHealCastRoots(t *testing.T) {
	for _, routing := range []string{"completed-class-healing-casts-reference", "completed-owned-spell-casts-reference", "direct-class-healing-events-reference", "all-class-healing-events-reference"} {
		sim, resto, units := kfcShamanElementsFixture(t, 5, routing)
		units[1].RemoveHealth(sim, 1000)
		if !resto.HealingStreamTotem[5].Cast(sim, &resto.Unit) {
			t.Fatal("Owned stream rejected")
		}
		kfcShamanAdvance(t, sim, 10*time.Second)
		want := int32(0)
		if routing == "completed-owned-spell-casts-reference" {
			want = 1
		}
		if metrics := resto.KFCShamanElementsProcMetrics(); metrics.Attempts != want || metrics.Procs < 0 || metrics.Procs > metrics.Attempts {
			t.Fatal("Wrong declared water cast routing", routing, metrics)
		}
		kfcShamanMeasure("ELEMENTS_WATER_EXCLUDED", routing)
		sim.Cleanup()
	}
}

func TestKFCShamanElementsRefreshExpiryAndIterationReset(t *testing.T) {
	sim, resto, _ := kfcShamanElementsFixture(t, 5, "completed-class-healing-casts-reference")
	defer sim.Cleanup()
	baseline := resto.GetStat(stats.HealingPower)
	buff := resto.kfcElements.buff
	buff.Activate(sim)
	kfcShamanAdvance(t, sim, 9*time.Second)
	buff.Activate(sim)
	kfcShamanNear(t, resto.GetStat(stats.HealingPower)-baseline, 65)
	kfcShamanAdvance(t, sim, 10*time.Second)
	if !buff.IsActive() {
		t.Fatal("Old expiry removed refreshed power")
	}
	kfcShamanAdvance(t, sim, 19*time.Second)
	if buff.IsActive() {
		t.Fatal("Power buff exceeded ten-second refresh duration")
	}
	kfcShamanNear(t, resto.GetStat(stats.HealingPower), baseline)
	resto.GetAura("KFC Elements trigger").OnCastComplete(nil, sim, resto.GetSpell(core.ActionID{SpellID: 10396}))
	buff.Activate(sim)
	sim.Cleanup()
	sim.Reset()
	if buff.IsActive() || resto.KFCShamanElementsProcMetrics() != (KFCShamanElementsMetrics{}) {
		t.Fatal("Set state leaked into next iteration")
	}
	kfcShamanNear(t, resto.GetStat(stats.HealingPower), baseline)
	kfcShamanMeasure("ELEMENTS_RESET", true)
}

func TestKFCShamanElementsPolicyGuardsAndUnconfiguredCasting(t *testing.T) {
	for _, kind := range []string{"unowned", "nil-sim", "bad-routing", "after-cast", "duplicate"} {
		pieces := 5
		if kind == "unowned" {
			pieces = 4
		}
		sim, resto, _ := kfcShamanElementsFixture(t, pieces, "")
		policy := KFCShamanElementsPolicy{ProcChance: "four-percent-sensitivity-reference", ProcRouting: "completed-class-healing-casts-reference"}
		input := sim
		switch kind {
		case "nil-sim":
			input = nil
		case "bad-routing":
			policy.ProcRouting = "guessed-server-rule"
		case "after-cast":
			kfcShamanAdvance(t, sim, time.Millisecond)
		case "duplicate":
			if err := resto.ConfigureKFCShamanElementsPolicy(sim, policy); err != nil {
				t.Fatal(err)
			}
		}
		if resto.ConfigureKFCShamanElementsPolicy(input, policy) == nil {
			t.Fatal("Invalid policy admitted", kind)
		}
		sim.Cleanup()
	}
	sim, resto, units := kfcShamanElementsFixture(t, 5, "")
	defer sim.Cleanup()
	if resto.kfcRiptide.spells[1239243].CanCast(sim, units[1]) || resto.WaterShield.CanCast(sim, &resto.Unit) {
		t.Fatal("Unconfigured Elements cast was admitted")
	}
	if resto.KFCShamanElementsProcMetrics() != (KFCShamanElementsMetrics{}) {
		t.Fatal("Unconfigured Elements gained proc credit")
	}
	kfcShamanMeasure("ELEMENTS_POLICY_REJECT", 6)
}

func TestKFCShamanElementsDeadOwnerCannotGenerateProcCredit(t *testing.T) {
	sim, resto, _ := kfcShamanElementsFixture(t, 5, "completed-class-healing-casts-reference")
	defer sim.Cleanup()
	resto.RemoveHealth(sim, resto.CurrentHealth())
	aura := resto.GetAura("KFC Elements trigger")
	for attempt := 0; attempt < 100; attempt++ {
		aura.OnCastComplete(aura, sim, resto.GetSpell(core.ActionID{SpellID: 10396}))
	}
	if metrics := resto.KFCShamanElementsProcMetrics(); metrics.Attempts != 0 || metrics.Procs != 0 || resto.kfcElements.buff.IsActive() {
		t.Fatal("Dead owner gained proc credit", metrics)
	}
	kfcShamanMeasure("ELEMENTS_DEAD_OWNER", true)
}

func TestKFCShamanElementsClientRecordChanceAndRefreshDoNotStack(t *testing.T) {
	sim, resto, _ := kfcShamanElementsFixture(t, 5, "completed-class-healing-casts-reference", "client-proc-record-reference")
	defer sim.Cleanup()
	aura := resto.GetAura("KFC Elements trigger")
	baseline := resto.GetStat(stats.HealingPower)
	for attempt := 0; attempt < 100; attempt++ {
		aura.OnCastComplete(aura, sim, resto.GetSpell(core.ActionID{SpellID: 10396}))
		kfcShamanNear(t, resto.GetStat(stats.HealingPower)-baseline, 65)
	}
	metrics := resto.KFCShamanElementsProcMetrics()
	if metrics.Attempts != 100 || metrics.Procs != 100 {
		t.Fatal("Current client proc-record reference ignored", metrics)
	}
	kfcShamanMeasure("ELEMENTS_CLIENT_RATE", metrics)
}

func TestKFCShamanElementsPowerReachesActualHealingOnce(t *testing.T) {
	values := []float64{}
	for _, active := range []bool{false, true} {
		sim, resto, units := kfcShamanElementsFixture(t, 5, "all-class-healing-events-reference", "client-proc-record-reference")
		if active {
			resto.kfcElements.buff.Activate(sim)
		}
		target := units[1]
		target.RemoveHealth(sim, 9000)
		spell := resto.GetSpell(core.ActionID{SpellID: 10396})
		spell.BonusCritRating = -10000
		before := target.CurrentHealth()
		if !spell.Cast(sim, target) {
			t.Fatal("Actual Elements heal rejected")
		}
		kfcShamanAdvance(t, sim, 3*time.Second)
		values = append(values, target.CurrentHealth()-before)
		sim.Cleanup()
	}
	kfcShamanNear(t, values[1]-values[0], 65*.857*1.35)
	kfcShamanMeasure("ELEMENTS_ACTUAL_HEAL", values)
}

func TestKFCShamanElementsOwnedResourceCastScopeUsesActualDispatch(t *testing.T) {
	for _, routing := range []string{"completed-class-healing-casts-reference", "completed-owned-spell-casts-reference", "direct-class-healing-events-reference", "all-class-healing-events-reference"} {
		for _, id := range []int32{408510, 16188, 16190, 5394} {
			sim, resto, _ := kfcShamanElementsFixture(t, 5, routing, "client-proc-record-reference")
			spell := resto.GetSpell(core.ActionID{SpellID: id})
			if spell == nil || !spell.Cast(sim, &resto.Unit) {
				t.Fatal("Owned resource cast rejected", id)
			}
			want := int32(0)
			if routing == "completed-owned-spell-casts-reference" && id != 16188 {
				want = 1
			}
			metrics := resto.KFCShamanElementsProcMetrics()
			if metrics.Attempts != want || metrics.Procs != want {
				t.Fatal("Wrong actual resource dispatch", id, routing, metrics)
			}
			kfcShamanMeasure("ELEMENTS_RESOURCE_SCOPE", map[string]interface{}{"id": id, "routing": routing, "metrics": metrics})
			sim.Cleanup()
		}
	}
}

func TestKFCShamanElementsPolicyRejectsGuessedRateAndEchoAliasing(t *testing.T) {
	sim, resto, _ := kfcShamanElementsFixture(t, 5, "")
	defer sim.Cleanup()
	policy := KFCShamanElementsPolicy{ProcChance: "four-percent-sensitivity-reference", ProcRouting: "completed-class-healing-casts-reference"}
	for _, chance := range []string{"", "verified-server", "legacy", "0.04"} {
		policy.ProcChance = chance
		if resto.ConfigureKFCShamanElementsPolicy(sim, policy) == nil {
			t.Fatal("Unreviewed rate admitted", chance)
		}
	}
	if resto.KFCShamanElementsPolicyEcho() != nil {
		t.Fatal("Invalid policies partially configured owner")
	}
	policy.ProcChance = "client-proc-record-reference"
	if err := resto.ConfigureKFCShamanElementsPolicy(sim, policy); err != nil {
		t.Fatal(err)
	}
	echo := resto.KFCShamanElementsPolicyEcho()
	echo.ProcChance = "mutated"
	if resto.KFCShamanElementsPolicyEcho().ProcChance != policy.ProcChance {
		t.Fatal("Policy echo aliases state")
	}
	kfcShamanMeasure("ELEMENTS_RATE_GUARDS", 5)
}
