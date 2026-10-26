package restoration

import (
	"fmt"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
	googleProto "google.golang.org/protobuf/proto"
)

func kfcShamanUtilityReference() KFCShamanUtilityPolicy {
	return KFCShamanUtilityPolicy{Schema: "kfc-shaman-utility-policy.v1", ID: "explicit-source-reference", ResourceRolls: "independent-reference", HeadmasterIntellect: "disabled-reference", BaronTickPeriodMS: 5000}
}

func kfcShamanUtilityFixture(t *testing.T, engineer bool, ids ...int32) (*core.Simulation, *RestorationShaman, []*core.Unit) {
	t.Helper()
	request := kfcShamanRequest(500)
	request.Encounter.Duration = 4000
	request.Raid.TargetDummies = 3
	player := request.Raid.Parties[0].Players[0]
	player.TalentsString = kfcRiptideTalentString(map[string]int32{"riptide": 1, "water_shield": 1})
	if engineer {
		player.Profession1 = proto.Profession_Engineering
	}
	for i := 0; i < 2; i++ {
		copy := googleProto.Clone(player).(*proto.Player)
		copy.Name = fmt.Sprintf("Synthetic utility recipient %d", i)
		if i == 0 {
			request.Raid.Parties[0].Players = append(request.Raid.Parties[0].Players, copy)
		} else {
			request.Raid.Parties = append(request.Raid.Parties, &proto.Party{Players: []*proto.Player{copy}})
		}
	}
	player.Equipment = &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
	for index := range player.Equipment.Items {
		player.Equipment.Items[index] = &proto.ItemSpec{}
	}
	slots := map[int32]int{4262: 5, 8346: 9, 11808: 0, 13937: 14, 4381: 12, 13143: 10, 18637: 13, 6323: 14, 11923: 14, 19288: 12}
	for _, id := range ids {
		slot, ok := slots[id]
		if !ok || player.Equipment.Items[slot].Id != 0 {
			t.Fatal("Invalid actual utility fixture", id)
		}
		player.Equipment.Items[slot].Id = id
	}
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	resto := sim.Raid.Parties[0].Players[0].(*RestorationShaman)
	kfcRiptideConfigure(t, sim, resto, kfcRiptideDefault(), kfcShamanResourceDefault())
	units := resto.kfcHealingPlayers()
	for _, unit := range units {
		unit.AddStatDynamic(sim, stats.Health, 50000)
		unit.GainHealth(sim, unit.MaxHealth(), unit.NewHealthMetrics(core.ActionID{SpellID: 1, Tag: 1200}))
	}
	return sim, resto, units
}

func kfcShamanConfigureUtility(t *testing.T, sim *core.Simulation, resto *RestorationShaman, policy KFCShamanUtilityPolicy) {
	t.Helper()
	if err := resto.ConfigureKFCShamanUtilityItems(sim, policy); err != nil {
		t.Fatal(err)
	}
}

func TestKFCShamanUtilityOwnershipAndNoImplicitCredit(t *testing.T) {
	for _, id := range []int32{0, 4262, 8346, 11808, 13937, 4381, 13143, 18637, 6323, 11923} {
		ids := []int32{}
		if id > 0 {
			ids = append(ids, id)
		}
		sim, resto, units := kfcShamanUtilityFixture(t, true, ids...)
		state := resto.kfcUtilityItems
		if len(state.owned) != len(ids) || resto.KFCShamanUtilityPolicyEcho() != nil {
			t.Fatal("Wrong utility owner or implicit reference", id)
		}
		units[1].RemoveHealth(sim, 2000)
		before := units[1].CurrentHealth()
		for _, spell := range state.spells {
			if spell.CanCast(sim, &resto.Unit) {
				t.Fatal("Utility cast before explicit policy", id)
			}
		}
		if id > 0 && resto.GetSpell(core.ActionID{SpellID: 331}).CanCast(sim, units[1]) {
			t.Fatal("Class healing accepted unconfigured utility gear", id)
		}
		kfcShamanAdvance(t, sim, 5*time.Second)
		kfcShamanNear(t, units[1].CurrentHealth(), before)
		kfcShamanMeasure("UTILITY_OWNERSHIP", id)
		sim.Cleanup()
	}
	for _, id := range []int32{4381, 18637} {
		sim, resto, _ := kfcShamanUtilityFixture(t, false, id)
		if resto.kfcUtilityItems.spells[id] != nil {
			t.Fatal("Non-Engineer acquired a Recombobulator use")
		}
		sim.Cleanup()
	}
}

func TestKFCShamanUtilityPolicyFreshnessAndCopies(t *testing.T) {
	for _, kind := range []string{"schema", "id", "rolls", "headmaster", "period", "time", "geometry", "nil-sim", "cast-history"} {
		sim, resto, _ := kfcShamanUtilityFixture(t, false, 4262)
		policy := kfcShamanUtilityReference()
		argument := sim
		switch kind {
		case "schema":
			policy.Schema = "other"
		case "id":
			policy.ID = ""
		case "rolls":
			policy.ResourceRolls = "guessed"
		case "headmaster":
			policy.HeadmasterIntellect = "always-verified"
		case "period":
			policy.BaronTickPeriodMS = 1000
		case "time":
			sim.CurrentTime = time.Nanosecond
		case "geometry":
			resto.positions = nil
		case "nil-sim":
			argument = nil
		case "cast-history":
			resto.GetSpell(core.ActionID{SpellID: 331}).SpellMetrics[resto.UnitIndex].Casts = 1
		}
		if resto.ConfigureKFCShamanUtilityItems(argument, policy) == nil {
			t.Fatal("Invalid policy accepted", kind)
		}
		sim.Cleanup()
	}
	sim, resto, _ := kfcShamanUtilityFixture(t, false, 4262)
	defer sim.Cleanup()
	policy := kfcShamanUtilityReference()
	kfcShamanConfigureUtility(t, sim, resto, policy)
	policy.ResourceRolls = "changed"
	echo := resto.KFCShamanUtilityPolicyEcho()
	echo.ID = "changed"
	if resto.KFCShamanUtilityPolicyEcho().ID != "explicit-source-reference" || resto.KFCShamanUtilityPolicyEcho().ResourceRolls != "independent-reference" {
		t.Fatal("Policy aliases caller memory")
	}
	if resto.ConfigureKFCShamanUtilityItems(sim, kfcShamanUtilityReference()) == nil {
		t.Fatal("Repeated policy accepted")
	}
	kfcShamanMeasure("UTILITY_POLICY_GUARDS", 9)
}

func TestKFCShamanUtilityDirectHealTargetsStatsAndCrits(t *testing.T) {
	for _, id := range []int32{4262, 8346} {
		amounts := []float64{}
		for attempt := 0; attempt < 3; attempt++ {
			sim, resto, units := kfcShamanUtilityFixture(t, false, id)
			policy := kfcShamanUtilityReference()
			policy.HealingCanCrit = attempt == 2
			kfcShamanConfigureUtility(t, sim, resto, policy)
			if attempt > 0 {
				resto.AddStatDynamic(sim, stats.HealingPower, 1000)
			}
			spell := resto.kfcUtilityItems.spells[id]
			spell.BonusCritRating = 10000
			target := units[1]
			if id == 4262 {
				target = &resto.Unit
				if spell.CanCast(sim, units[1]) {
					t.Fatal("Belt heals another player")
				}
			}
			target.RemoveHealth(sim, 2000)
			before := target.CurrentHealth()
			if !spell.Cast(sim, target) {
				t.Fatal("Owned direct heal failed", id)
			}
			amounts = append(amounts, target.CurrentHealth()-before)
			if spell.CanCast(sim, target) || spell.CD.ReadyAt() != map[int32]time.Duration{4262: 5 * time.Minute, 8346: 30 * time.Minute}[id] || resto.GCD.ReadyAt() != 1500*time.Millisecond {
				t.Fatal("Wrong direct item cooldown or GCD")
			}
			sim.Cleanup()
		}
		kfcShamanNear(t, amounts[0], amounts[1])
		kfcShamanNear(t, amounts[2], amounts[0]*1.5)
		low, high := 225.0, 375.0
		if id == 8346 {
			low, high = 300, 500
		}
		if amounts[0] < low || amounts[0] > high {
			t.Fatal("Direct heal outside current range")
		}
		kfcShamanMeasure("UTILITY_DIRECT", map[string]interface{}{"id": id, "amounts": amounts})
	}
}

func TestKFCShamanUtilityFriendlyRangeAndAliveGuards(t *testing.T) {
	for _, id := range []int32{8346, 4381, 18637} {
		sim, resto, units := kfcShamanUtilityFixture(t, true, id)
		kfcShamanConfigureUtility(t, sim, resto, kfcShamanUtilityReference())
		spell := resto.kfcUtilityItems.spells[id]
		limit := 30.0
		if id == 8346 {
			limit = 40
		}
		resto.positions[units[1].UnitIndex] = KFCShamanFriendlyPosition{X: limit}
		if !spell.CanCast(sim, units[1]) {
			t.Fatal("Inclusive utility range rejected")
		}
		resto.positions[units[1].UnitIndex] = KFCShamanFriendlyPosition{X: limit + .001}
		if spell.CanCast(sim, units[1]) || spell.CanCast(sim, sim.Encounter.TargetUnits[0]) {
			t.Fatal("Out-of-range or hostile utility target")
		}
		resto.positions[units[1].UnitIndex] = KFCShamanFriendlyPosition{}
		units[1].RemoveHealth(sim, units[1].CurrentHealth())
		if spell.CanCast(sim, units[1]) {
			t.Fatal("Dead utility recipient")
		}
		kfcShamanMeasure("UTILITY_TARGET_GUARDS", id)
		sim.Cleanup()
	}
}

func TestKFCShamanUtilityRecombobulatorSameRecipientAndRolls(t *testing.T) {
	for _, id := range []int32{4381, 18637} {
		for _, mode := range []string{"independent-reference", "same-percentile-reference"} {
			sim, resto, units := kfcShamanUtilityFixture(t, true, id)
			oracle, _, _ := kfcShamanUtilityFixture(t, true, id)
			policy := kfcShamanUtilityReference()
			policy.ResourceRolls = mode
			kfcShamanConfigureUtility(t, sim, resto, policy)
			target := units[1]
			target.RemoveHealth(sim, 2000)
			target.SpendMana(sim, 2000, target.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 1201}))
			ownerMana, ownerHealth := resto.CurrentMana(), resto.CurrentHealth()
			before := target.CurrentHealth()
			spell := resto.kfcUtilityItems.spells[id]
			if !spell.Cast(sim, target) {
				t.Fatal("Recombobulator failed")
			}
			first := oracle.RollWithLabel(.75, 1.25, "Shaman Recombobulator first")
			second := first
			if mode == "independent-reference" {
				second = oracle.RollWithLabel(.75, 1.25, "Shaman Recombobulator second")
			}
			heal, mana := 270.0, 128.0
			if id == 18637 {
				heal, mana = 666, 304
			}
			gain := resto.kfcUtilityItems.mana[id][target.UnitIndex].ActualGainForCurrentIteration()
			kfcShamanNear(t, target.CurrentHealth()-before, heal*first)
			kfcShamanNear(t, gain, mana*second)
			kfcShamanNear(t, resto.CurrentMana(), ownerMana)
			kfcShamanNear(t, resto.CurrentHealth(), ownerHealth)
			if resto.kfcUtilityItems.charges[id] != 9 {
				t.Fatal("Recombobulator charge not consumed")
			}
			kfcShamanMeasure("UTILITY_RECOMB_RECIPIENT", []float64{float64(id), target.CurrentHealth() - before, gain})
			sim.Cleanup()
			oracle.Cleanup()
		}
	}
}

func TestKFCShamanUtilityRecombobulatorSharedCooldownChargesAndReset(t *testing.T) {
	sim, resto, units := kfcShamanUtilityFixture(t, true, 4381, 18637)
	defer sim.Cleanup()
	kfcShamanConfigureUtility(t, sim, resto, kfcShamanUtilityReference())
	first, second := resto.kfcUtilityItems.spells[4381], resto.kfcUtilityItems.spells[18637]
	if !first.Cast(sim, units[1]) || second.CanCast(sim, units[1]) || first.CD.ReadyAt() != 300*time.Second || second.SharedCD.ReadyAt() != 120*time.Second {
		t.Fatal("Wrong Recombobulator personal/shared cooldown")
	}
	kfcShamanAdvance(t, sim, 120*time.Second)
	if !second.CanCast(sim, units[1]) || first.CanCast(sim, units[1]) {
		t.Fatal("Shared cooldown changed personal cooldown")
	}
	for index := 1; index < 10; index++ {
		kfcShamanAdvance(t, sim, time.Duration(index)*300*time.Second)
		if !first.Cast(sim, units[1]) {
			t.Fatal("Valid charged use rejected", index)
		}
	}
	kfcShamanAdvance(t, sim, 3000*time.Second)
	if first.CanCast(sim, units[1]) || resto.kfcUtilityItems.charges[4381] != 0 {
		t.Fatal("Recombobulator exceeded ten charges")
	}
	sim.Cleanup()
	sim.Reset()
	if resto.kfcUtilityItems.charges[4381] != 10 || !first.CanCast(sim, units[1]) {
		t.Fatal("Charges/cooldowns failed reset")
	}
	kfcShamanMeasure("UTILITY_RECOMB_CHARGES", 10)
}

func TestKFCShamanUtilityRecombobulatorCriticalReference(t *testing.T) {
	values := []float64{}
	for _, critical := range []bool{false, true} {
		sim, resto, units := kfcShamanUtilityFixture(t, true, 18637)
		policy := kfcShamanUtilityReference()
		policy.RecombobulatorCanCrit = critical
		kfcShamanConfigureUtility(t, sim, resto, policy)
		spell := resto.kfcUtilityItems.spells[18637]
		spell.BonusCritRating = 10000
		units[1].RemoveHealth(sim, 2000)
		before := units[1].CurrentHealth()
		if !spell.Cast(sim, units[1]) {
			t.Fatal("Recombobulator critical control failed")
		}
		values = append(values, units[1].CurrentHealth()-before)
		sim.Cleanup()
	}
	kfcShamanNear(t, values[1], 1.5*values[0])
	kfcShamanMeasure("UTILITY_RECOMB_CRIT", values)
}

func TestKFCShamanUtilityCircleDelayTicksAndHaste(t *testing.T) {
	for _, row := range []struct{ scales, castOnly bool }{{false, false}, {true, false}, {true, true}} {
		sim, resto, _ := kfcShamanUtilityFixture(t, false, 11808)
		policy := kfcShamanUtilityReference()
		policy.ChannelScalesWithHaste = row.scales
		kfcShamanConfigureUtility(t, sim, resto, policy)
		if row.castOnly {
			resto.MultiplyCastSpeed(2)
		} else {
			resto.AddStatDynamic(sim, stats.SpellHaste, core.HasteRatingPerHastePercent*100)
		}
		resto.SpendMana(sim, 5000, resto.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 1202}))
		spell := resto.kfcUtilityItems.spells[11808]
		metrics := resto.kfcUtilityItems.mana[11808][resto.UnitIndex]
		if !spell.Cast(sim, &resto.Unit) || !resto.IsChanneling(sim) {
			t.Fatal("Circle did not channel")
		}
		first, last := time.Second, 10*time.Second
		if row.scales && !row.castOnly {
			first, last = 500*time.Millisecond, 5*time.Second
		}
		kfcShamanAdvance(t, sim, first-time.Millisecond)
		kfcShamanNear(t, metrics.ActualGainForCurrentIteration(), 0)
		kfcShamanAdvance(t, sim, last)
		gain := metrics.ActualGainForCurrentIteration()
		if spell.SelfHot().TickCount != 10 || gain < 592.5 || gain > 987.5 || resto.IsChanneling(sim) {
			t.Fatal("Wrong Circle ticks, duration or amount", row, spell.SelfHot().TickCount, gain)
		}
		if spell.CD.ReadyAt() != 5*time.Minute {
			t.Fatal("Circle cooldown changed with haste")
		}
		kfcShamanMeasure("UTILITY_CIRCLE_TICKS", []float64{float64(last), gain})
		sim.Cleanup()
	}
}

func TestKFCShamanUtilityCircleInterruptionDeathAndReset(t *testing.T) {
	for _, die := range []bool{false, true} {
		sim, resto, _ := kfcShamanUtilityFixture(t, false, 11808)
		kfcShamanConfigureUtility(t, sim, resto, kfcShamanUtilityReference())
		resto.SpendMana(sim, 3000, resto.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 1203}))
		if die {
			resto.RemoveHealth(sim, resto.CurrentHealth()-1)
		}
		spell := resto.kfcUtilityItems.spells[11808]
		if !spell.Cast(sim, &resto.Unit) {
			t.Fatal("Circle interruption control failed")
		}
		kfcShamanAdvance(t, sim, time.Second)
		if !die {
			resto.InterruptCast(sim)
		} else if resto.CurrentHealth() > 0 || !resto.Metrics.Died {
			t.Fatal("Circle self damage did not kill")
		}
		before := resto.kfcUtilityItems.mana[11808][resto.UnitIndex].ActualGainForCurrentIteration()
		kfcShamanAdvance(t, sim, 12*time.Second)
		kfcShamanNear(t, resto.kfcUtilityItems.mana[11808][resto.UnitIndex].ActualGainForCurrentIteration(), before)
		sim.Cleanup()
		sim.Reset()
		if spell.SelfHot().IsActive() {
			t.Fatal("Circle survived reset")
		}
		kfcShamanMeasure("UTILITY_CIRCLE_STOP", []float64{before, float64(spell.SelfHot().TickCount)})
		sim.Cleanup()
	}
}

func TestKFCShamanUtilityHeadmasterPartyReferenceAndExpiry(t *testing.T) {
	for _, mode := range []string{"disabled-reference", "additive-reference"} {
		sim, resto, units := kfcShamanUtilityFixture(t, false, 13937)
		policy := kfcShamanUtilityReference()
		policy.HeadmasterIntellect = mode
		kfcShamanConfigureUtility(t, sim, resto, policy)
		resto.positions[units[2].UnitIndex] = KFCShamanFriendlyPosition{X: 30.001}
		original := []float64{}
		for _, unit := range units {
			original = append(original, unit.GetStat(stats.Intellect))
		}
		spell := resto.kfcUtilityItems.spells[13937]
		if !spell.Cast(sim, &resto.Unit) {
			t.Fatal("Headmaster use failed")
		}
		for i, unit := range units {
			expected := 0.0
			if mode == "additive-reference" && resto.kfcShamanUtilityTarget(unit, 30, true) {
				expected = 20
			}
			kfcShamanNear(t, unit.GetStat(stats.Intellect)-original[i], expected)
		}
		if spell.CD.ReadyAt() != 10*time.Minute {
			t.Fatal("Headmaster cooldown")
		}
		kfcShamanAdvance(t, sim, 15*time.Minute)
		for i, unit := range units {
			kfcShamanNear(t, unit.GetStat(stats.Intellect), original[i])
		}
		kfcShamanMeasure("UTILITY_HEADMASTER", mode)
		sim.Cleanup()
	}
}

func TestKFCShamanUtilityBaronPartyCadenceAndResourceAccounting(t *testing.T) {
	for _, period := range []int64{2000, 5000} {
		sim, resto, units := kfcShamanUtilityFixture(t, false, 6323)
		policy := kfcShamanUtilityReference()
		policy.BaronTickPeriodMS = period
		resto.positions[units[2].UnitIndex] = KFCShamanFriendlyPosition{X: 30.001}
		for _, unit := range units {
			unit.RemoveHealth(sim, 2000)
		}
		before := []float64{}
		for _, unit := range units {
			before = append(before, unit.CurrentHealth())
		}
		kfcShamanConfigureUtility(t, sim, resto, policy)
		kfcShamanAdvance(t, sim, time.Duration(period)*time.Millisecond-time.Millisecond)
		for i, unit := range units {
			kfcShamanNear(t, unit.CurrentHealth(), before[i])
		}
		kfcShamanAdvance(t, sim, 10*time.Second)
		for i, unit := range units {
			expected := 0.0
			if resto.kfcShamanUtilityTarget(unit, 30, true) {
				expected = 8
			}
			kfcShamanNear(t, unit.CurrentHealth()-before[i], expected)
			if metric := resto.kfcUtilityItems.baron[unit.UnitIndex]; metric != nil {
				kfcShamanNear(t, metric.ActualGainForCurrentIteration(), expected)
			}
		}
		if resto.GetSpell(core.ActionID{SpellID: 1292142}) != nil {
			t.Fatal("Regeneration incorrectly dispatches a healing spell")
		}
		kfcShamanMeasure("UTILITY_BARON", period)
		sim.Cleanup()
	}
}

func TestKFCShamanUtilityMarkShieldLossStopsMana(t *testing.T) {
	sim, resto, _ := kfcShamanUtilityFixture(t, false, 13143)
	defer sim.Cleanup()
	kfcShamanConfigureUtility(t, sim, resto, kfcShamanUtilityReference())
	resto.SpendMana(sim, 2000, resto.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 1204}))
	spell := resto.kfcUtilityItems.spells[13143]
	mana := resto.kfcUtilityItems.mana[13143][resto.UnitIndex]
	if !spell.Cast(sim, &resto.Unit) {
		t.Fatal("Dragon Mark use failed")
	}
	kfcShamanAdvance(t, sim, 4999*time.Millisecond)
	kfcShamanNear(t, mana.ActualGainForCurrentIteration(), 0)
	kfcShamanAdvance(t, sim, 5*time.Second)
	kfcShamanNear(t, mana.ActualGainForCurrentIteration(), 22)
	before := resto.CurrentHealth()
	kfcShamanReactiveDamage(sim, resto, &resto.Unit, 499, false, false)
	kfcShamanNear(t, resto.CurrentHealth(), before)
	if !spell.SelfShield().IsActive() {
		t.Fatal("Mark shield exhausted too early")
	}
	kfcShamanReactiveDamage(sim, resto, &resto.Unit, 2, false, false)
	kfcShamanNear(t, before-resto.CurrentHealth(), 1)
	if spell.SelfShield().IsActive() {
		t.Fatal("Mark shield did not exhaust")
	}
	kfcShamanAdvance(t, sim, 10*time.Second)
	kfcShamanNear(t, mana.ActualGainForCurrentIteration(), 22)
	if spell.CD.ReadyAt() != 30*time.Minute {
		t.Fatal("Mark cooldown")
	}
	kfcShamanMeasure("UTILITY_MARK_LOSS", 22)
}

func TestKFCShamanUtilityMarkFinalBoundaryAndReset(t *testing.T) {
	sim, resto, _ := kfcShamanUtilityFixture(t, false, 13143)
	defer sim.Cleanup()
	kfcShamanConfigureUtility(t, sim, resto, kfcShamanUtilityReference())
	spell := resto.kfcUtilityItems.spells[13143]
	mana := resto.kfcUtilityItems.mana[13143][resto.UnitIndex]
	if !spell.Cast(sim, &resto.Unit) {
		t.Fatal("Mark expiry control failed")
	}
	kfcShamanAdvance(t, sim, 30*time.Minute)
	kfcShamanNear(t, mana.Gain, 22*360)
	if mana.EventsForCurrentIteration() != 360 {
		t.Fatal("Mark final tick duplicated or omitted")
	}
	if spell.SelfShield().IsActive() {
		t.Fatal("Mark exceeded its duration")
	}
	sim.Cleanup()
	sim.Reset()
	kfcShamanAdvance(t, sim, 5*time.Second)
	if mana.EventsForCurrentIteration() != 0 {
		t.Fatal("Previous Mark schedule survived reset")
	}
	kfcShamanMeasure("UTILITY_MARK_EXPIRY", 360)
}

func TestKFCShamanUtilityGraceDeathHealOnceAndPartyScope(t *testing.T) {
	sim, resto, units := kfcShamanUtilityFixture(t, false, 11923)
	defer sim.Cleanup()
	kfcShamanConfigureUtility(t, sim, resto, kfcShamanUtilityReference())
	resto.positions[units[2].UnitIndex] = KFCShamanFriendlyPosition{X: 40.001}
	for _, unit := range units {
		unit.RemoveHealth(sim, 2000)
	}
	units[3].RemoveHealth(sim, units[3].CurrentHealth())
	before := []float64{}
	for _, unit := range units {
		before = append(before, unit.CurrentHealth())
	}
	kfcShamanReactiveDamage(sim, resto, &resto.Unit, resto.CurrentHealth()+100, false, false)
	if !resto.Metrics.Died || resto.CurrentHealth() != 0 {
		t.Fatal("Lethal incoming damage did not dispatch death")
	}
	amounts := []float64{}
	for i, unit := range units {
		gain := unit.CurrentHealth() - before[i]
		if unit == &resto.Unit {
			continue
		}
		expected := resto.kfcShamanUtilityTarget(unit, 40, true)
		if expected && (gain < 1081.92 || gain > 1270.08) || !expected && gain != 0 {
			t.Fatal("Wrong death heal recipient", i, gain)
		}
		amounts = append(amounts, gain)
	}
	after := units[1].CurrentHealth()
	resto.kfcShamanUtilityDeath(sim)
	kfcShamanNear(t, units[1].CurrentHealth(), after)
	kfcShamanMeasure("UTILITY_GRACE_DEATH", amounts)
}
