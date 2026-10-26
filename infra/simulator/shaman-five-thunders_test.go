package restoration

import (
	"reflect"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
)

func kfcShamanFiveFixture(t *testing.T, pieces int, routing string) (*core.Simulation, *RestorationShaman, []*core.Unit) {
	t.Helper()
	request := kfcShamanRequest(500)
	request.Encounter.Duration = 600
	player := request.Raid.Parties[0].Players[0]
	player.TalentsString = kfcShamanHealingStudySeeds[0]
	player.Equipment = &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
	for index := range player.Equipment.Items {
		player.Equipment.Items[index] = &proto.ItemSpec{}
	}
	for index, slot := range []int{5, 9, 0, 7, 6, 8, 2, 4} {
		if index < pieces {
			player.Equipment.Items[slot].Id = int32(22095 + index)
		}
	}
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	resto := sim.Raid.Parties[0].Players[0].(*RestorationShaman)
	kfcRiptideConfigure(t, sim, resto, kfcRiptideDefault(), kfcShamanResourceDefault())
	if pieces >= 4 && routing != "" {
		if err := resto.ConfigureKFCShamanFiveThundersPolicy(sim, KFCShamanFiveThundersPolicy{ProcRouting: routing}); err != nil {
			t.Fatal(err)
		}
	}
	return sim, resto, resto.kfcHealingPlayers()
}

func TestKFCShamanFiveCurrentThresholdsStatsAndNoAlternateMP5(t *testing.T) {
	base, empty, _ := kfcShamanFiveFixture(t, 0, "")
	defer base.Cleanup()
	for pieces := 0; pieces <= 8; pieces++ {
		sim, resto, _ := kfcShamanFiveFixture(t, pieces, "completed-class-healing-casts-reference")
		var actual []int32
		for _, bonus := range resto.KFCOwnedShamanHealingSetBonuses() {
			actual = append(actual, bonus.NumPieces)
		}
		var expected []int32
		for _, threshold := range []int32{2, 4, 6, 8} {
			if pieces >= int(threshold) {
				expected = append(expected, threshold)
			}
		}
		if !reflect.DeepEqual(actual, expected) {
			t.Fatal("Base threshold identity changed", pieces, actual)
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
		gearMP5, gearPower := 0.0, 0.0
		for _, item := range resto.Equipment {
			gearMP5 += item.Stats[stats.MP5]
			gearPower += item.Stats[stats.SpellPower]
		}
		kfcShamanNear(t, resto.GetStat(stats.MP5)-empty.GetStat(stats.MP5), gearMP5)
		kfcShamanNear(t, resto.GetStat(stats.SpellPower)-empty.GetStat(stats.SpellPower), gearPower)
		kfcShamanNear(t, resto.GetStat(stats.HealingPower)-empty.GetStat(stats.HealingPower), power)
		kfcShamanNear(t, resto.GetStat(stats.SpellDamage)-empty.GetStat(stats.SpellDamage), power)
		kfcShamanNear(t, resto.GetStat(stats.BonusArmor)-empty.GetStat(stats.BonusArmor), armor)
		for _, stat := range []stats.Stat{stats.ArcaneResistance, stats.FireResistance, stats.FrostResistance, stats.NatureResistance, stats.ShadowResistance} {
			kfcShamanNear(t, resto.GetStat(stat)-empty.GetStat(stat), resistance)
		}
		if (resto.kfcFiveThunders != nil) != (pieces >= 4) || resto.GetAura("The Furious Storm") != nil || resto.GetAura("Item - The Furious Storm Proc (Spell Cast)") != nil || resto.KFCOwnedShamanHealingSetID(1679) {
			t.Fatal("Alternate name-based handler or wrong ownership admitted", pieces)
		}
		kfcShamanMeasure("FIVE_THRESHOLDS", map[string]interface{}{"pieces": pieces, "thresholds": actual, "mp5": gearMP5, "staticPower": power, "bonusArmor": armor})
		sim.Cleanup()
	}
}

func TestKFCShamanFiveExactSeededProbabilityAndBothPowerChannels(t *testing.T) {
	sim, resto, _ := kfcShamanFiveFixture(t, 4, "completed-class-healing-casts-reference")
	defer sim.Cleanup()
	oracle, _, _ := kfcShamanFiveFixture(t, 0, "")
	defer oracle.Cleanup()
	aura, buff := resto.GetAura("KFC base Five Thunders trigger"), resto.kfcFiveThunders.buff
	healing, damage, power := resto.GetStat(stats.HealingPower), resto.GetStat(stats.SpellDamage), resto.GetStat(stats.SpellPower)
	wantProcs := 0
	for attempt := 0; attempt < 1000; attempt++ {
		aura.OnCastComplete(aura, sim, resto.GetSpell(core.ActionID{SpellID: 10396}))
		want := oracle.Proc(.04, "KFC base Five Thunders proc")
		if buff.IsActive() != want {
			t.Fatal("Base four-percent probability differs from independent seeded oracle")
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
	metrics := resto.KFCShamanFiveThundersProcMetrics()
	if metrics.Attempts != 1000 || metrics.Procs != int32(wantProcs) || wantProcs == 0 {
		t.Fatal("Incorrect recorded set proc events", metrics)
	}
	kfcShamanMeasure("FIVE_PROBABILITY", metrics)
}

func TestKFCShamanFiveActualChainCastVersusRecipientRouting(t *testing.T) {
	for _, routing := range []string{"completed-class-healing-casts-reference", "direct-class-healing-events-reference", "all-class-healing-events-reference"} {
		sim, resto, units := kfcShamanFiveFixture(t, 4, routing)
		for _, unit := range units[1:4] {
			unit.RemoveHealth(sim, 5000)
		}
		spell := resto.GetSpell(core.ActionID{SpellID: 10623})
		if !spell.Cast(sim, units[1]) {
			t.Fatal("Owned Chain Heal rejected")
		}
		kfcShamanAdvance(t, sim, 3*time.Second)
		want := int32(3)
		if routing == "completed-class-healing-casts-reference" {
			want = 1
		}
		metrics := resto.KFCShamanFiveThundersProcMetrics()
		if metrics.Attempts != want {
			t.Fatal("Chain bounce proc routing changed", routing, metrics)
		}
		kfcShamanMeasure("FIVE_CHAIN_ROUTING", map[string]interface{}{"routing": routing, "metrics": metrics})
		sim.Cleanup()
	}
}

func TestKFCShamanFiveActualRiptidePeriodicRouting(t *testing.T) {
	for _, routing := range []string{"completed-class-healing-casts-reference", "direct-class-healing-events-reference", "all-class-healing-events-reference"} {
		sim, resto, units := kfcShamanFiveFixture(t, 4, routing)
		units[1].RemoveHealth(sim, 9000)
		if !resto.kfcRiptide.spells[1239243].Cast(sim, units[1]) {
			t.Fatal("Owned Riptide rejected")
		}
		kfcShamanAdvance(t, sim, 16*time.Second)
		want := int32(1)
		if routing == "all-class-healing-events-reference" {
			want = 6
		}
		metrics := resto.KFCShamanFiveThundersProcMetrics()
		if metrics.Attempts != want {
			t.Fatal("Riptide periodic routing changed", routing, metrics)
		}
		kfcShamanMeasure("FIVE_RIPTIDE_ROUTING", map[string]interface{}{"routing": routing, "metrics": metrics})
		sim.Cleanup()
	}
}

func TestKFCShamanFiveWaterTotemsDoNotBecomeClassHealCastRoots(t *testing.T) {
	for _, routing := range []string{"completed-class-healing-casts-reference", "direct-class-healing-events-reference", "all-class-healing-events-reference"} {
		sim, resto, units := kfcShamanFiveFixture(t, 4, routing)
		units[1].RemoveHealth(sim, 1000)
		if !resto.HealingStreamTotem[5].Cast(sim, &resto.Unit) {
			t.Fatal("Owned stream rejected")
		}
		kfcShamanAdvance(t, sim, 10*time.Second)
		if metrics := resto.KFCShamanFiveThundersProcMetrics(); metrics.Attempts != 0 || metrics.Procs != 0 {
			t.Fatal("Water pulse entered class heal root routing", routing, metrics)
		}
		kfcShamanMeasure("FIVE_WATER_EXCLUDED", routing)
		sim.Cleanup()
	}
}

func TestKFCShamanFiveRefreshExpiryAndIterationReset(t *testing.T) {
	sim, resto, _ := kfcShamanFiveFixture(t, 4, "completed-class-healing-casts-reference")
	defer sim.Cleanup()
	baseline := resto.GetStat(stats.HealingPower)
	buff := resto.kfcFiveThunders.buff
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
	resto.GetAura("KFC base Five Thunders trigger").OnCastComplete(nil, sim, resto.GetSpell(core.ActionID{SpellID: 10396}))
	buff.Activate(sim)
	sim.Cleanup()
	sim.Reset()
	if buff.IsActive() || resto.KFCShamanFiveThundersProcMetrics() != (KFCShamanFiveThundersMetrics{}) {
		t.Fatal("Set state leaked into next iteration")
	}
	kfcShamanNear(t, resto.GetStat(stats.HealingPower), baseline)
	kfcShamanMeasure("FIVE_RESET", true)
}

func TestKFCShamanFivePolicyGuardsAndUnconfiguredCasting(t *testing.T) {
	for _, kind := range []string{"unowned", "nil-sim", "bad-routing", "after-cast", "duplicate"} {
		pieces := 4
		if kind == "unowned" {
			pieces = 3
		}
		sim, resto, _ := kfcShamanFiveFixture(t, pieces, "")
		policy := KFCShamanFiveThundersPolicy{ProcRouting: "completed-class-healing-casts-reference"}
		input := sim
		switch kind {
		case "nil-sim":
			input = nil
		case "bad-routing":
			policy.ProcRouting = "guessed-server-rule"
		case "after-cast":
			if !resto.WaterShield.Cast(sim, &resto.Unit) {
				t.Fatal("Shield control rejected")
			}
		case "duplicate":
			if err := resto.ConfigureKFCShamanFiveThundersPolicy(sim, policy); err != nil {
				t.Fatal(err)
			}
		}
		if resto.ConfigureKFCShamanFiveThundersPolicy(input, policy) == nil {
			t.Fatal("Invalid policy admitted", kind)
		}
		sim.Cleanup()
	}
	func() {
		sim, resto, units := kfcShamanFiveFixture(t, 4, "")
		defer sim.Cleanup()
		defer func() {
			if recover() == nil {
				t.Fatal("Unconfigured set silently skipped its proc")
			}
		}()
		resto.kfcRiptide.spells[1239243].Cast(sim, units[1])
	}()
	kfcShamanMeasure("FIVE_POLICY_REJECT", 6)
}

func TestKFCShamanFiveDeadOwnerCannotGenerateProcCredit(t *testing.T) {
	sim, resto, _ := kfcShamanFiveFixture(t, 4, "completed-class-healing-casts-reference")
	defer sim.Cleanup()
	resto.RemoveHealth(sim, resto.CurrentHealth())
	aura := resto.GetAura("KFC base Five Thunders trigger")
	for attempt := 0; attempt < 100; attempt++ {
		aura.OnCastComplete(aura, sim, resto.GetSpell(core.ActionID{SpellID: 10396}))
	}
	if metrics := resto.KFCShamanFiveThundersProcMetrics(); metrics.Attempts != 0 || metrics.Procs != 0 || resto.kfcFiveThunders.buff.IsActive() {
		t.Fatal("Dead owner gained proc credit", metrics)
	}
	kfcShamanMeasure("FIVE_DEAD_OWNER", true)
}
