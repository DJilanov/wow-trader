package restoration

import (
	"strings"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
	gproto "google.golang.org/protobuf/proto"
)

func kfcRiptideDefault() KFCShamanRiptidePolicy {
	return KFCShamanRiptidePolicy{HotPower: "snapshot-reference", HotCriticals: "noncritical-reference", HotCadence: "source-fixed-reference", ChainBonus: "all-bounces-reference", ConsumeHot: true}
}

func kfcRiptideTalentString(fields map[string]int32) string {
	passives := map[string]int32{}
	for key, value := range fields {
		if _, ok := kfcShamanPassiveDefinitions[key]; ok {
			passives[key] = value
		}
	}
	parts := strings.Split(kfcShamanPassiveTalentString(passives), "-")
	for len(parts) < 3 {
		parts = append(parts, "")
	}
	for len(parts[2]) < 16 {
		parts[2] += "0"
	}
	last := []byte(parts[2])
	for key, index := range map[string]int{"totemic_focus": 4, "water_shield": 8, "restorative_totems": 10, "mana_tide_totem": 11, "natures_swiftness": 13, "riptide": 15} {
		if rank, ok := fields[key]; ok {
			last[index] = byte('0' + rank)
		}
	}
	parts[2] = string(last)
	return strings.Join(parts, "-")
}

func kfcRiptideConfigure(t *testing.T, sim *core.Simulation, resto *RestorationShaman, policy KFCShamanRiptidePolicy, resource KFCShamanResourcePolicy) {
	t.Helper()
	positions := map[int32]KFCShamanFriendlyPosition{}
	for _, unit := range resto.kfcHealingPlayers() {
		positions[unit.UnitIndex] = KFCShamanFriendlyPosition{}
	}
	if err := resto.ConfigureKFCShamanHealingPositions(sim, positions, 12.5, "nearest-injured-reference"); err != nil {
		t.Fatal(err)
	}
	if err := resto.ConfigureKFCShamanWaterPolicy(sim, kfcShamanWaterDefault()); err != nil {
		t.Fatal(err)
	}
	if err := resto.ConfigureKFCShamanResourcePolicy(sim, resource); err != nil {
		t.Fatal(err)
	}
	if err := resto.ConfigureKFCShamanRiptidePolicy(sim, policy); err != nil {
		t.Fatal(err)
	}
}

func kfcRiptideFixture(t *testing.T, fields map[string]int32, power float64, policy KFCShamanRiptidePolicy) (*core.Simulation, *RestorationShaman, []*core.Unit) {
	t.Helper()
	request := kfcShamanRequest(power)
	request.Encounter.Duration = 310
	request.Raid.Parties[0].Players[0].TalentsString = kfcRiptideTalentString(fields)
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	resto := sim.Raid.Parties[0].Players[0].(*RestorationShaman)
	kfcRiptideConfigure(t, sim, resto, policy, kfcShamanResourceDefault())
	return sim, resto, resto.kfcHealingPlayers()
}

func TestKFCShamanRiptideRankCostsCoefficientsAndCrits(t *testing.T) {
	for _, item := range []struct {
		id                        int32
		mana, low, high, periodic float64
	}{{408521, 245, 485.6, 533.6, 89}, {1239242, 300, 615, 676.2, 115}, {1239243, 385, 798.95, 883.05, 161}} {
		values := []float64{}
		for attempt, power := range []float64{0, 500, 500} {
			sim, resto, units := kfcRiptideFixture(t, map[string]int32{"riptide": 1}, power, kfcRiptideDefault())
			target := units[1]
			target.RemoveHealth(sim, 9000)
			spell := resto.kfcRiptide.spells[item.id]
			spell.BonusCritRating = -10000
			if attempt == 2 {
				spell.BonusCritRating = 10000
			}
			before := target.CurrentHealth()
			if !spell.Cast(sim, target) {
				t.Fatal("Riptide rank rejected", item.id)
			}
			values = append(values, target.CurrentHealth()-before)
			if spell.CurCast.CastTime != 0 || resto.GCD.ReadyAt() != 1500*time.Millisecond {
				t.Fatal("Riptide is not instant with ordinary GCD")
			}
			kfcShamanNear(t, resto.Metrics.ManaSpent, item.mana)
			kfcShamanAdvance(t, sim, 15*time.Second)
			pulse := resto.kfcRiptide.pulses[item.id].SpellMetrics[target.UnitIndex]
			kfcShamanNear(t, pulse.TotalHealing, 5*(item.periodic+.1*power))
			if pulse.Ticks != 5 || pulse.CritTicks != 0 || pulse.Casts != 0 {
				t.Fatal("Wrong periodic dispatch", pulse)
			}
			sim.Cleanup()
		}
		if values[0] < item.low || values[0] > item.high {
			t.Fatal("Wrong source level growth", item.id, values[0])
		}
		kfcShamanNear(t, values[1]-values[0], 107)
		kfcShamanNear(t, values[2], values[1]*1.5)
		kfcShamanMeasure("RIPTIDE_RANK", map[string]interface{}{"id": item.id, "direct": values, "periodic": item.periodic, "mana": item.mana})
	}
}

func TestKFCShamanRiptideRankCoverageAndSharedCooldown(t *testing.T) {
	sim, resto, units := kfcRiptideFixture(t, map[string]int32{"riptide": 1}, 0, kfcRiptideDefault())
	defer sim.Cleanup()
	if len(resto.kfcRiptide.spells) != 3 || len(resto.kfcRiptide.pulses) != 3 {
		t.Fatal("Missing ranked source")
	}
	if !resto.kfcRiptide.spells[408521].Cast(sim, units[1]) {
		t.Fatal("First rank rejected")
	}
	kfcShamanAdvance(t, sim, 1500*time.Millisecond)
	for _, spell := range resto.kfcRiptide.spells {
		if spell.CanCast(sim, units[2]) {
			t.Fatal("Rank bypassed shared cooldown")
		}
		if spell.CD.ReadyAt() != 6*time.Second {
			t.Fatal("Wrong shared recovery")
		}
	}
	kfcShamanAdvance(t, sim, 6*time.Second)
	if !resto.kfcRiptide.spells[1239243].Cast(sim, units[2]) {
		t.Fatal("Shared rank recovery never ended")
	}
	for _, rank := range kfcShamanRiptideRanks {
		a, b, c := rank.amounts(rank.MaxLevel)
		x, y, z := rank.amounts(rank.MaxLevel + 20)
		kfcShamanNear(t, a, x)
		kfcShamanNear(t, b, y)
		kfcShamanNear(t, c, z)
	}
	kfcShamanMeasure("RIPTIDE_SHARED", int64(resto.kfcRiptide.spells[408521].CD.ReadyAt()))
	for _, level := range []int32{39, 40, 49, 50, 59, 60} {
		request := kfcShamanRequest(0)
		request.Raid.Parties[0].Players[0].Level = level
		request.Raid.Parties[0].Players[0].TalentsString = kfcRiptideTalentString(map[string]int32{"riptide": 1})
		lower := core.NewSim(request, simsignals.CreateSignals())
		lower.Reset()
		owner := lower.Raid.Parties[0].Players[0].(*RestorationShaman)
		want := 0
		for _, rank := range kfcShamanRiptideRanks {
			if rank.RequiredLevel <= int(level) {
				want++
			}
		}
		if len(owner.kfcRiptide.spells) != want {
			t.Fatal("Riptide required level ignored", level)
		}
		lower.Cleanup()
	}
}

func TestKFCShamanRiptideTalentsAffectSeparateChannelsOnce(t *testing.T) {
	values := []float64{}
	for _, enabled := range []bool{false, true} {
		fields := map[string]int32{"riptide": 1}
		if enabled {
			fields = map[string]int32{"riptide": 1, "purification": 5, "healing_way": 3, "tidal_focus": 5, "tidal_mastery": 5}
		}
		sim, resto, units := kfcRiptideFixture(t, fields, 500, kfcRiptideDefault())
		target := units[1]
		target.RemoveHealth(sim, 9000)
		spell := resto.kfcRiptide.spells[1239243]
		pulse := resto.kfcRiptide.pulses[1239243]
		crit := 0.0
		cost := 385.0
		if enabled {
			crit = 5 * core.SpellCritRatingPerCritChance
			cost *= .95
		}
		kfcShamanNear(t, spell.BonusCritRating, crit)
		kfcShamanNear(t, pulse.BonusCritRating, crit)
		spell.BonusCritRating = -10000
		before := target.CurrentHealth()
		if !spell.Cast(sim, target) {
			t.Fatal("Talent rank rejected")
		}
		values = append(values, target.CurrentHealth()-before)
		kfcShamanNear(t, resto.Metrics.ManaSpent, cost)
		kfcShamanAdvance(t, sim, 3*time.Second)
		values = append(values, pulse.SpellMetrics[target.UnitIndex].TotalHealing)
		sim.Cleanup()
	}
	kfcShamanNear(t, values[2], values[0]*1.1)
	kfcShamanNear(t, values[3], values[1]*1.1)
	kfcShamanMeasure("RIPTIDE_TALENTS", values)
}

func TestKFCShamanRiptideSnapshotDynamicPowerAndCriticalReferences(t *testing.T) {
	for _, power := range []string{"snapshot-reference", "dynamic-reference"} {
		for _, critical := range []string{"noncritical-reference", "critical-reference"} {
			policy := kfcRiptideDefault()
			policy.HotPower = power
			policy.HotCriticals = critical
			sim, resto, units := kfcRiptideFixture(t, map[string]int32{"riptide": 1}, 0, policy)
			target := units[1]
			target.RemoveHealth(sim, 9000)
			spell := resto.kfcRiptide.spells[1239243]
			pulse := resto.kfcRiptide.pulses[1239243]
			spell.BonusCritRating = -10000
			pulse.BonusCritRating = -10000
			if !spell.Cast(sim, target) {
				t.Fatal("Snapshot source rejected")
			}
			resto.AddStatDynamic(sim, stats.HealingPower, 500)
			resto.PseudoStats.HealingDealtMultiplier *= 2
			pulse.BonusCritRating = 10000
			kfcShamanAdvance(t, sim, 3*time.Second)
			want := 161.0
			if power == "dynamic-reference" {
				want = (161 + 50) * 2
				if critical == "critical-reference" {
					want *= 1.5
				}
			}
			metric := pulse.SpellMetrics[target.UnitIndex]
			kfcShamanNear(t, metric.TotalHealing, want)
			if (metric.CritTicks == 1) != (power == "dynamic-reference" && critical == "critical-reference") {
				t.Fatal("Critical snapshot policy ignored")
			}
			kfcShamanMeasure("RIPTIDE_SNAPSHOT", map[string]interface{}{"power": power, "critical": critical, "healing": metric.TotalHealing, "crits": metric.CritTicks})
			sim.Cleanup()
		}
	}
}

func TestKFCShamanRiptideFiveTickCadenceAndCurrentTargetModifiers(t *testing.T) {
	for _, cadence := range []string{"source-fixed-reference", "cast-speed-five-tick-reference"} {
		policy := kfcRiptideDefault()
		policy.HotCadence = cadence
		sim, resto, units := kfcRiptideFixture(t, map[string]int32{"riptide": 1}, 0, policy)
		target := units[1]
		target.RemoveHealth(sim, 9000)
		resto.MultiplyCastSpeed(2)
		spell := resto.kfcRiptide.spells[1239243]
		spell.BonusCritRating = -10000
		if !spell.Cast(sim, target) {
			t.Fatal("Hasted Riptide rejected")
		}
		target.PseudoStats.HealingTakenMultiplier = 1.5
		end := 15 * time.Second
		if cadence == "cast-speed-five-tick-reference" {
			end = 7500 * time.Millisecond
		}
		if resto.kfcRiptide.targets[target.UnitIndex].expires != end {
			t.Fatal("Wrong cadence duration")
		}
		kfcShamanAdvance(t, sim, end-time.Millisecond)
		metric := resto.kfcRiptide.pulses[1239243].SpellMetrics[target.UnitIndex]
		if metric.Ticks != 4 {
			t.Fatal("Fifth tick arrived early")
		}
		kfcShamanAdvance(t, sim, end)
		metric = resto.kfcRiptide.pulses[1239243].SpellMetrics[target.UnitIndex]
		if metric.Ticks != 5 {
			t.Fatal("Final expiration tick lost", cadence, sim.CurrentTime, metric.Ticks, resto.kfcRiptide.targets[target.UnitIndex].expires)
		}
		kfcShamanNear(t, metric.TotalHealing, 5*161*1.5)
		kfcShamanAdvance(t, sim, end+3*time.Second)
		if resto.kfcRiptide.pulses[1239243].SpellMetrics[target.UnitIndex].Ticks != 5 {
			t.Fatal("Extra expiration tick")
		}
		kfcShamanMeasure("RIPTIDE_CADENCE", map[string]interface{}{"cadence": cadence, "expires": int64(end), "healing": metric.TotalHealing, "ticks": metric.Ticks})
		sim.Cleanup()
	}
}

func TestKFCShamanRiptideRefreshInvalidatesOldRankAndIteration(t *testing.T) {
	sim, resto, units := kfcRiptideFixture(t, map[string]int32{"riptide": 1}, 0, kfcRiptideDefault())
	defer sim.Cleanup()
	target := units[1]
	target.RemoveHealth(sim, 9000)
	first := resto.kfcRiptide.spells[408521]
	second := resto.kfcRiptide.spells[1239243]
	first.BonusCritRating = -10000
	second.BonusCritRating = -10000
	if !first.Cast(sim, target) {
		t.Fatal("First HoT rejected")
	}
	kfcShamanAdvance(t, sim, 6*time.Second)
	if !second.Cast(sim, target) {
		t.Fatal("Cross-rank refresh rejected")
	}
	kfcShamanAdvance(t, sim, 21*time.Second)
	old := resto.kfcRiptide.pulses[408521].SpellMetrics[target.UnitIndex]
	current := resto.kfcRiptide.pulses[1239243].SpellMetrics[target.UnitIndex]
	if old.Ticks != 2 || current.Ticks != 5 {
		t.Fatal("Refresh retained stale ticks", old.Ticks, current.Ticks)
	}
	kfcShamanNear(t, old.TotalHealing, 178)
	kfcShamanNear(t, current.TotalHealing, 805)
	kfcShamanMeasure("RIPTIDE_REFRESH", []float64{old.TotalHealing, current.TotalHealing})
	sim.Cleanup()
	sim.Reset()
	kfcShamanAdvance(t, sim, 3*time.Second)
	if resto.kfcRiptide.targets[target.UnitIndex].aura != nil || resto.kfcRiptide.pulses[1239243].SpellMetrics[target.UnitIndex].Ticks != 0 {
		t.Fatal("HoT leaked across iterations")
	}
}

func TestKFCShamanRiptideChainBonusPropagatesOnceAndConsumptionStopsTicks(t *testing.T) {
	for _, propagation := range []string{"all-bounces-reference", "primary-only-reference"} {
		for _, consume := range []bool{false, true} {
			values := [][]float64{}
			for _, bonus := range []bool{false, true} {
				policy := kfcRiptideDefault()
				policy.ChainBonus = propagation
				policy.ConsumeHot = consume
				sim, resto, units := kfcRiptideFixture(t, map[string]int32{"riptide": 1}, 500, policy)
				for _, unit := range units[1:] {
					unit.RemoveHealth(sim, 9000)
				}
				rip := resto.kfcRiptide.spells[1239243]
				rip.BonusCritRating = -10000
				if !rip.Cast(sim, units[1]) {
					t.Fatal("Chain primer rejected")
				}
				if !bonus {
					resto.cancelKFCRiptide(sim, resto.kfcRiptide.targets[units[1].UnitIndex])
				}
				kfcShamanAdvance(t, sim, 1500*time.Millisecond)
				chain := resto.GetSpell(core.ActionID{SpellID: 10623})
				chain.BonusCritRating = -10000
				if !chain.Cast(sim, units[1]) {
					t.Fatal("Primed Chain Heal rejected")
				}
				kfcShamanAdvance(t, sim, 4*time.Second)
				heals := []float64{}
				for _, unit := range units[1:4] {
					heals = append(heals, chain.SpellMetrics[unit.UnitIndex].TotalHealing)
				}
				values = append(values, heals)
				kfcShamanAdvance(t, sim, 15*time.Second)
				ticks := resto.kfcRiptide.pulses[1239243].SpellMetrics[units[1].UnitIndex].Ticks
				want := int32(0)
				if bonus {
					want = 5
					if consume {
						want = 1
					}
				}
				if ticks != want {
					t.Fatal("Chain consumption left wrong tick count", ticks, want)
				}
				sim.Cleanup()
			}
			for hop := 0; hop < 3; hop++ {
				factor := 1.0
				if hop == 0 || propagation == "all-bounces-reference" {
					factor = 1.25
				}
				kfcShamanNear(t, values[1][hop], values[0][hop]*factor)
			}
			kfcShamanNear(t, values[0][1], values[0][0]*.5)
			kfcShamanNear(t, values[0][2], values[0][0]*.25)
			kfcShamanMeasure("RIPTIDE_CHAIN", map[string]interface{}{"scope": propagation, "consume": consume, "values": values})
		}
	}
}

func TestKFCShamanRiptideChainOnlyInitialOwnedLiveHotAtLanding(t *testing.T) {
	for _, kind := range []string{"other-primary", "expired-at-landing", "active-at-landing"} {
		sim, resto, units := kfcRiptideFixture(t, map[string]int32{"riptide": 1}, 0, kfcRiptideDefault())
		for _, unit := range units[1:] {
			unit.RemoveHealth(sim, 9000)
		}
		rip := resto.kfcRiptide.spells[1239243]
		rip.BonusCritRating = -10000
		if !rip.Cast(sim, units[1]) {
			t.Fatal("Primer rejected")
		}
		at := 1500 * time.Millisecond
		if kind == "expired-at-landing" {
			at = 14 * time.Second
		}
		kfcShamanAdvance(t, sim, at)
		target := units[1]
		if kind == "other-primary" {
			target = units[2]
		}
		chain := resto.GetSpell(core.ActionID{SpellID: 10623})
		chain.BonusCritRating = -10000
		if !chain.Cast(sim, target) {
			t.Fatal("Chain rejected")
		}
		kfcShamanAdvance(t, sim, at+2500*time.Millisecond)
		state := resto.kfcRiptide.targets[units[1].UnitIndex]
		if kind == "other-primary" && state.aura == nil {
			t.Fatal("Chain consumed another bounce's HoT")
		}
		if kind == "active-at-landing" && state.aura != nil {
			t.Fatal("Landing did not consume primary HoT")
		}
		if kind == "expired-at-landing" {
			kfcShamanNear(t, chain.SpellMetrics[target.UnitIndex].TotalHealing, chain.SpellMetrics[units[2].UnitIndex].TotalHealing*2)
		}
		kfcShamanMeasure("RIPTIDE_CHAIN_LANDING", map[string]interface{}{"case": kind, "healing": chain.SpellMetrics[target.UnitIndex].TotalHealing, "hotRetained": state.aura != nil})
		sim.Cleanup()
	}
}

func TestKFCShamanRiptideRangeCapsAndResources(t *testing.T) {
	sim, resto, units := kfcRiptideFixture(t, map[string]int32{"riptide": 1}, 500, kfcRiptideDefault())
	defer sim.Cleanup()
	target := units[1]
	spell := resto.kfcRiptide.spells[1239243]
	if spell.CanCast(sim, nil) || spell.CanCast(sim, sim.Encounter.TargetUnits[0]) {
		t.Fatal("Invalid target accepted")
	}
	resto.positions[target.UnitIndex] = KFCShamanFriendlyPosition{X: 40.01}
	if spell.CanCast(sim, target) {
		t.Fatal("Beyond40 accepted")
	}
	resto.positions[target.UnitIndex] = KFCShamanFriendlyPosition{X: 40}
	target.RemoveHealth(sim, 10)
	spell.BonusCritRating = -10000
	if !spell.Cast(sim, target) {
		t.Fatal("Boundary target rejected")
	}
	kfcShamanNear(t, target.CurrentHealth(), target.MaxHealth())
	kfcShamanNear(t, spell.SpellMetrics[target.UnitIndex].TotalEffectiveHealing, 10)
	resto.positions[target.UnitIndex] = KFCShamanFriendlyPosition{X: 100}
	target.RemoveHealth(sim, 1000)
	kfcShamanAdvance(t, sim, 3*time.Second)
	pulse := resto.kfcRiptide.pulses[1239243].SpellMetrics[target.UnitIndex]
	kfcShamanNear(t, pulse.TotalEffectiveHealing, 211)
	kfcShamanAdvance(t, sim, 6*time.Second)
	resto.SpendMana(sim, resto.CurrentMana(), resto.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 761}))
	if spell.CanCast(sim, &resto.Unit) {
		t.Fatal("Riptide ignored mana")
	}
	kfcShamanMeasure("RIPTIDE_CAP_RANGE", map[string]interface{}{"directEffective": 10, "periodicEffective": pulse.TotalEffectiveHealing, "overheal": spell.SpellMetrics[target.UnitIndex].TotalOverhealing})
}

func TestKFCShamanRiptideIndependentCasterOwnership(t *testing.T) {
	request := kfcShamanRequest(0)
	request.Encounter.Duration = 60
	request.Raid.TargetDummies = 3
	request.Raid.Parties[0].Players[0].TalentsString = kfcRiptideTalentString(map[string]int32{"riptide": 1})
	other := gproto.Clone(request.Raid.Parties[0].Players[0]).(*proto.Player)
	other.Name = "Second Riptide owner"
	request.Raid.Parties[0].Players = append(request.Raid.Parties[0].Players, other)
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	defer sim.Cleanup()
	owners := []*RestorationShaman{sim.Raid.Parties[0].Players[0].(*RestorationShaman), sim.Raid.Parties[0].Players[1].(*RestorationShaman)}
	for _, owner := range owners {
		kfcRiptideConfigure(t, sim, owner, kfcRiptideDefault(), kfcShamanResourceDefault())
	}
	target := owners[0].kfcHealingPlayers()[2]
	target.RemoveHealth(sim, 9000)
	for _, owner := range owners {
		spell := owner.kfcRiptide.spells[1239243]
		spell.BonusCritRating = -10000
		if !spell.Cast(sim, target) {
			t.Fatal("Owner cast rejected")
		}
	}
	owners[0].cancelKFCRiptide(sim, owners[0].kfcRiptide.targets[target.UnitIndex])
	kfcShamanAdvance(t, sim, 3*time.Second)
	if owners[0].kfcRiptide.pulses[1239243].SpellMetrics[target.UnitIndex].Ticks != 0 || owners[1].kfcRiptide.pulses[1239243].SpellMetrics[target.UnitIndex].Ticks != 1 {
		t.Fatal("Independent caster aura clobbered")
	}
	bonus, _ := owners[0].prepareKFCRiptideChain(sim, target)
	kfcShamanNear(t, bonus, 1)
	if !owners[1].kfcRiptide.targets[target.UnitIndex].aura.IsActive() {
		t.Fatal("Foreign chain consumed another caster's HoT")
	}
	kfcShamanMeasure("RIPTIDE_OWNERS", []float64{0, owners[1].kfcRiptide.pulses[1239243].SpellMetrics[target.UnitIndex].TotalHealing})
}

func TestKFCShamanRiptideSwiftnessAndWaterShieldCriticalScope(t *testing.T) {
	for _, scope := range []string{"class-direct-critical-heals-reference", "all-direct-critical-heals-reference", "all-critical-heals-reference"} {
		request := kfcShamanRequest(0)
		request.Raid.Parties[0].Players[0].TalentsString = kfcRiptideTalentString(map[string]int32{"riptide": 1, "water_shield": 1, "natures_swiftness": 1})
		sim := core.NewSim(request, simsignals.CreateSignals())
		sim.Reset()
		resto := sim.Raid.Parties[0].Players[0].(*RestorationShaman)
		policy := kfcRiptideDefault()
		policy.HotCriticals = "critical-reference"
		resource := kfcShamanResourceDefault()
		resource.ShieldTriggers = scope
		kfcRiptideConfigure(t, sim, resto, policy, resource)
		target := resto.kfcHealingPlayers()[1]
		target.RemoveHealth(sim, 9000)
		resto.SpendMana(sim, 5000, resto.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 762}))
		if !resto.WaterShield.Cast(sim, &resto.Unit) {
			t.Fatal("Shield rejected")
		}
		kfcShamanAdvance(t, sim, 1500*time.Millisecond)
		if !resto.kfcActives.swiftnessSpell.Cast(sim, &resto.Unit) {
			t.Fatal("NS rejected")
		}
		rip := resto.kfcRiptide.spells[1239243]
		rip.BonusCritRating = 10000
		resto.kfcRiptide.pulses[1239243].BonusCritRating = 10000
		if !rip.Cast(sim, target) || !resto.kfcActives.swiftnessAura.IsActive() {
			t.Fatal("Instant Riptide consumed NS")
		}
		gain := resto.MaxMana() * .02
		kfcShamanNear(t, resto.kfcActives.shieldMetrics.ActualGainForCurrentIteration(), gain)
		kfcShamanAdvance(t, sim, 7500*time.Millisecond)
		want := gain
		if scope == "all-critical-heals-reference" {
			want *= 2
		}
		kfcShamanNear(t, resto.kfcActives.shieldMetrics.ActualGainForCurrentIteration(), want)
		wave := resto.GetSpell(core.ActionID{SpellID: 10396})
		wave.BonusCritRating = -10000
		if !wave.Cast(sim, target) || wave.CurCast.CastTime != 0 || resto.kfcActives.swiftnessAura.IsActive() {
			t.Fatal("Basic heal did not consume retained NS")
		}
		kfcShamanMeasure("RIPTIDE_RESOURCE", map[string]interface{}{"scope": scope, "gain": want, "periodicCrits": resto.kfcRiptide.pulses[1239243].SpellMetrics[target.UnitIndex].CritTicks})
		sim.Cleanup()
	}
}

func TestKFCShamanRiptideDeathAndIterationDoNotResurrectTargets(t *testing.T) {
	for _, death := range []string{"owner", "recipient"} {
		sim, resto, units := kfcRiptideFixture(t, map[string]int32{"riptide": 1}, 0, kfcRiptideDefault())
		target := units[1]
		target.RemoveHealth(sim, 9000)
		spell := resto.kfcRiptide.spells[1239243]
		spell.BonusCritRating = -10000
		if !spell.Cast(sim, target) {
			t.Fatal("Death primer rejected")
		}
		if death == "owner" {
			resto.RemoveHealth(sim, resto.CurrentHealth())
			if spell.CanCast(sim, units[2]) {
				t.Fatal("Dead owner cast")
			}
		} else {
			target.RemoveHealth(sim, target.CurrentHealth())
		}
		kfcShamanAdvance(t, sim, 3*time.Second)
		metric := resto.kfcRiptide.pulses[1239243].SpellMetrics[target.UnitIndex]
		if death == "owner" {
			kfcShamanNear(t, metric.TotalHealing, 161)
		} else {
			kfcShamanNear(t, target.CurrentHealth(), 0)
			if metric.Ticks != 0 {
				t.Fatal("Dead recipient ticked")
			}
		}
		kfcShamanAdvance(t, sim, 6*time.Second)
		if death == "owner" && spell.CanCast(sim, units[2]) {
			t.Fatal("Dead owner bypassed ready GCD and cooldown")
		}
		kfcShamanMeasure("RIPTIDE_DEATH", map[string]interface{}{"dead": death, "ticks": metric.Ticks, "healing": metric.TotalHealing})
		sim.Cleanup()
	}
}

func TestKFCShamanRiptidePolicyAndOwnershipGuards(t *testing.T) {
	sim, resto, _ := kfcShamanFixture(t, 0, "nearest-injured-reference")
	defer sim.Cleanup()
	if len(resto.kfcRiptide.spells) != 0 || len(resto.kfcRiptide.pulses) != 0 {
		t.Fatal("Unowned Riptide registered")
	}
	for _, kind := range []string{"power", "critical", "cadence", "chain"} {
		policy := kfcRiptideDefault()
		switch kind {
		case "power":
			policy.HotPower = "guess"
		case "critical":
			policy.HotCriticals = "guess"
		case "cadence":
			policy.HotCadence = "guess"
		case "chain":
			policy.ChainBonus = "guess"
		}
		if resto.ConfigureKFCShamanRiptidePolicy(sim, policy) == nil {
			t.Fatal("Unknown reference accepted")
		}
	}
	if err := resto.ConfigureKFCShamanRiptidePolicy(sim, kfcRiptideDefault()); err != nil {
		t.Fatal(err)
	}
	if resto.ConfigureKFCShamanRiptidePolicy(sim, kfcRiptideDefault()) == nil {
		t.Fatal("Policy changed twice")
	}
	other := core.NewSim(kfcShamanRequest(0), simsignals.CreateSignals())
	other.Reset()
	defer other.Cleanup()
	owner := other.Raid.Parties[0].Players[0].(*RestorationShaman)
	if owner.ConfigureKFCShamanRiptidePolicy(other, kfcRiptideDefault()) == nil {
		t.Fatal("Unpositioned policy admitted")
	}
	kfcShamanAdvance(t, sim, time.Second)
	if resto.ConfigureKFCShamanRiptidePolicy(sim, kfcRiptideDefault()) == nil {
		t.Fatal("Live reference changed")
	}
	kfcShamanMeasure("RIPTIDE_GUARDS", 7)
}
