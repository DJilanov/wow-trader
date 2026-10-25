package restoration

import (
	"strings"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/shaman"
	gproto "google.golang.org/protobuf/proto"
)

func kfcShamanWaterFixture(t *testing.T, fields map[string]int32, power float64, policy KFCShamanWaterPolicy, extraParty bool) (*core.Simulation, *RestorationShaman, []*core.Unit) {
	t.Helper()
	passive := map[string]int32{}
	for key, value := range fields {
		if _, ok := kfcShamanPassiveDefinitions[key]; ok {
			passive[key] = value
		}
	}
	encoded := strings.Split(kfcShamanPassiveTalentString(passive), "-")
	for len(encoded) < 3 {
		encoded = append(encoded, "")
	}
	for len(encoded[2]) < 16 {
		encoded[2] += "0"
	}
	last := []byte(encoded[2])
	for key, index := range map[string]int{"totemic_focus": 4, "restorative_totems": 10, "mana_tide_totem": 11} {
		if value, ok := fields[key]; ok {
			last[index] = byte('0' + value)
		}
	}
	encoded[2] = string(last)
	request := kfcShamanRequest(power)
	request.Encounter.Duration = 310
	request.Raid.Parties[0].Players[0].TalentsString = strings.Join(encoded, "-")
	if extraParty {
		other := gproto.Clone(request.Raid.Parties[0].Players[0]).(*proto.Player)
		other.TalentsString = ""
		other.Name = "Other party mana recipient"
		request.Raid.Parties = append(request.Raid.Parties, &proto.Party{Players: []*proto.Player{other}})
	}
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	resto := sim.Raid.Parties[0].Players[0].(*RestorationShaman)
	positions := map[int32]KFCShamanFriendlyPosition{}
	for _, unit := range resto.kfcHealingPlayers() {
		positions[unit.UnitIndex] = KFCShamanFriendlyPosition{}
	}
	if err := resto.ConfigureKFCShamanHealingPositions(sim, positions, 12.5, "nearest-injured-reference"); err != nil {
		t.Fatal(err)
	}
	if err := resto.ConfigureKFCShamanWaterPolicy(sim, policy); err != nil {
		t.Fatal(err)
	}
	return sim, resto, resto.kfcHealingPlayers()
}

func kfcShamanWaterDefault() KFCShamanWaterPolicy {
	return KFCShamanWaterPolicy{FirstPulse: "after-period-reference", Recipients: "party-reference", HealingScaling: "base-and-power-reference"}
}

func TestKFCShamanWaterRanksCostsAndNoPurificationLeak(t *testing.T) {
	for _, rank := range kfcShamanWaterRanks {
		fields := map[string]int32{"totemic_focus": 5, "tidal_focus": 5, "purification": 5, "restorative_totems": 5}
		if rank.Family == "mana-tide" {
			fields["mana_tide_totem"] = 1
		}
		sim, resto, units := kfcShamanWaterFixture(t, fields, 500, kfcShamanWaterDefault(), false)
		spell := resto.GetSpell(core.ActionID{SpellID: rank.ID})
		if spell == nil || spell.RequiredLevel != rank.RequiredLevel {
			t.Fatal("Missing current totem rank", rank.ID)
		}
		units[1].RemoveHealth(sim, 1000)
		before := units[1].CurrentHealth()
		if !spell.Cast(sim, &resto.Unit) {
			t.Fatal("Owned totem rejected", rank.ID)
		}
		kfcShamanNear(t, resto.Metrics.ManaSpent, rank.Mana*.75)
		if rank.Family == "healing-stream" {
			kfcShamanAdvance(t, sim, 2*time.Second)
			kfcShamanNear(t, units[1].CurrentHealth()-before, (rank.Amount+500*.022)*1.5)
		}
		kfcShamanMeasure("WATER_RANK", map[string]interface{}{"id": rank.ID, "pulse": rank.PulseID, "level": spell.RequiredLevel, "spent": resto.Metrics.ManaSpent})
		sim.Cleanup()
	}
}

func TestKFCShamanWaterHealingScalingAndActualPeriodicDispatch(t *testing.T) {
	for _, scaling := range []string{"base-and-power-reference", "base-only-reference"} {
		policy := kfcShamanWaterDefault()
		policy.HealingScaling = scaling
		sim, resto, units := kfcShamanWaterFixture(t, map[string]int32{"restorative_totems": 5, "purification": 5}, 500, policy, false)
		direct, periodic := 0, 0
		// Reuse a registered inactive aura: the environment forbids registration after finalization.
		observer := resto.GetAura("Berserking")
		if observer == nil || observer.IsActive() {
			t.Fatal("Missing inactive observer aura")
		}
		observer.OnGain, observer.OnExpire = nil, nil
		observer.Duration = core.NeverExpires
		observer.OnHealDealt = func(_ *core.Aura, _ *core.Simulation, _ *core.Spell, _ *core.SpellResult) { direct++ }
		observer.OnPeriodicHealDealt = func(_ *core.Aura, _ *core.Simulation, _ *core.Spell, _ *core.SpellResult) { periodic++ }
		observer.Activate(sim)
		target := units[1]
		target.RemoveHealth(sim, 1000)
		before := target.CurrentHealth()
		spell := resto.HealingStreamTotem[5]
		if !spell.Cast(sim, &resto.Unit) {
			t.Fatal("Stream rejected")
		}
		kfcShamanAdvance(t, sim, 2*time.Second)
		want := 33.0
		if scaling == "base-only-reference" {
			want = 27.5
		}
		kfcShamanNear(t, target.CurrentHealth()-before, want)
		if direct != 0 || periodic != len(units) {
			t.Fatal("Periodic dispatch duplicated or routed as direct", direct, periodic)
		}
		kfcShamanMeasure("WATER_SCALING", map[string]interface{}{"scaling": scaling, "healing": target.CurrentHealth() - before, "direct": direct, "periodic": periodic})
		sim.Cleanup()
	}
}

func TestKFCShamanWaterTideFlatManaCadenceAndSharedCooldown(t *testing.T) {
	for _, first := range []string{"after-period-reference", "immediate-reference"} {
		policy := kfcShamanWaterDefault()
		policy.FirstPulse = first
		sim, resto, _ := kfcShamanWaterFixture(t, map[string]int32{"mana_tide_totem": 1, "restorative_totems": 5}, 0, policy, false)
		resto.SpendMana(sim, 5000, resto.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 700}))
		spentBefore := resto.Metrics.ManaSpent
		spell := resto.ManaTideTotem[4]
		if !spell.Cast(sim, &resto.Unit) {
			t.Fatal("Tide rejected")
		}
		for _, rank := range resto.ManaTideTotem[1:] {
			if rank.CanCast(sim, &resto.Unit) {
				t.Fatal("Mana Tide ranks do not share cooldown")
			}
		}
		kfcShamanAdvance(t, sim, 13*time.Second)
		metrics := resto.kfcWater.manaMetrics[1325257][resto.UnitIndex]
		want := 1160.0
		events := int32(4)
		if first == "immediate-reference" {
			want = 1450
			events = 5
		}
		kfcShamanNear(t, metrics.ActualGainForCurrentIteration(), want)
		if metrics.EventsForCurrentIteration() != events || resto.ActiveTotems[shaman.WaterTotem] != nil {
			t.Fatal("Wrong tide cadence or expiration")
		}
		kfcShamanNear(t, resto.Metrics.ManaSpent-spentBefore, 60)
		kfcShamanMeasure("WATER_TIDE", map[string]interface{}{"first": first, "gain": metrics.ActualGainForCurrentIteration(), "events": events, "cost": resto.Metrics.ManaSpent - spentBefore})
		sim.Cleanup()
	}
}

func TestKFCShamanWaterRecipientScopeRangeCapsAndDeadTargets(t *testing.T) {
	for _, scope := range []string{"party-reference", "raid-reference"} {
		policy := kfcShamanWaterDefault()
		policy.FirstPulse = "immediate-reference"
		policy.Recipients = scope
		sim, resto, units := kfcShamanWaterFixture(t, nil, 0, policy, true)
		for _, unit := range units[1:] {
			unit.RemoveHealth(sim, 100)
		}
		resto.positions[units[1].UnitIndex] = KFCShamanFriendlyPosition{X: 30}
		resto.positions[units[2].UnitIndex] = KFCShamanFriendlyPosition{X: 30.01}
		units[3].RemoveHealth(sim, units[3].CurrentHealth())
		units[4].GainHealth(sim, 99, resto.HealingStreamTotem[5].HealthMetrics(units[4]))
		before := []float64{}
		for _, unit := range units {
			before = append(before, unit.CurrentHealth())
		}
		if !resto.HealingStreamTotem[5].Cast(sim, &resto.Unit) {
			t.Fatal("Scope stream rejected")
		}
		kfcShamanAdvance(t, sim, time.Millisecond)
		changes := []float64{}
		for index, unit := range units {
			changes = append(changes, unit.CurrentHealth()-before[index])
		}
		kfcShamanNear(t, changes[1], 11)
		kfcShamanNear(t, changes[2], 0)
		kfcShamanNear(t, changes[3], 0)
		kfcShamanNear(t, changes[4], 1)
		want := 0.0
		if scope == "raid-reference" {
			want = 11
		}
		kfcShamanNear(t, changes[len(changes)-1], want)
		kfcShamanMeasure("WATER_RECIPIENTS", map[string]interface{}{"scope": scope, "changes": changes})
		sim.Cleanup()
	}
}

func TestKFCShamanWaterReplacementOwnerDeathAndIterationReset(t *testing.T) {
	sim, resto, units := kfcShamanWaterFixture(t, map[string]int32{"mana_tide_totem": 1}, 0, kfcShamanWaterDefault(), false)
	defer sim.Cleanup()
	target := units[1]
	target.RemoveHealth(sim, 1000)
	if !resto.HealingStreamTotem[5].Cast(sim, &resto.Unit) {
		t.Fatal("Initial stream rejected")
	}
	kfcShamanAdvance(t, sim, time.Second)
	if !resto.ManaTideTotem[4].Cast(sim, &resto.Unit) {
		t.Fatal("Water replacement rejected")
	}
	before := target.CurrentHealth()
	kfcShamanAdvance(t, sim, 5*time.Second)
	kfcShamanNear(t, target.CurrentHealth(), before)
	sim.Cleanup()
	sim.Reset()
	target.RemoveHealth(sim, 1000)
	before = target.CurrentHealth()
	if !resto.HealingStreamTotem[5].Cast(sim, &resto.Unit) {
		t.Fatal("Reset stream rejected")
	}
	kfcShamanAdvance(t, sim, 2*time.Second)
	kfcShamanNear(t, target.CurrentHealth()-before, 11)
	resto.RemoveHealth(sim, resto.CurrentHealth())
	before = target.CurrentHealth()
	kfcShamanAdvance(t, sim, 6*time.Second)
	kfcShamanNear(t, target.CurrentHealth(), before)
	if resto.ActiveTotems[shaman.WaterTotem] != nil {
		t.Fatal("Dead owner's totem stayed active")
	}
	kfcShamanMeasure("WATER_REPLACEMENT_RESET", true)
}

func TestKFCShamanWaterPolicyOwnershipAndLiveReplacementGuards(t *testing.T) {
	sim, resto, units := kfcShamanFixture(t, 0, "nearest-injured-reference")
	defer sim.Cleanup()
	if resto.HealingStreamTotem[5].CanCast(sim, &resto.Unit) {
		t.Fatal("Water totem accepted without explicit policy")
	}
	if resto.ManaTideTotem[4] != nil {
		t.Fatal("Unowned tide registered")
	}
	bad := kfcShamanWaterDefault()
	bad.FirstPulse = "every-frame"
	if resto.ConfigureKFCShamanWaterPolicy(sim, bad) == nil {
		t.Fatal("Invalid cadence accepted")
	}
	if err := resto.ConfigureKFCShamanWaterPolicy(sim, kfcShamanWaterDefault()); err != nil {
		t.Fatal(err)
	}
	if resto.ConfigureKFCShamanWaterPolicy(sim, kfcShamanWaterDefault()) == nil {
		t.Fatal("Live policy replaced")
	}
	units[1].RemoveHealth(sim, 1)
	if !resto.HealingStreamTotem[5].Cast(sim, &resto.Unit) {
		t.Fatal("Configured stream rejected")
	}
	kfcShamanAdvance(t, sim, 2*time.Second)
	if resto.ConfigureKFCShamanWaterPolicy(sim, kfcShamanWaterDefault()) == nil {
		t.Fatal("Policy changed after casting")
	}
	kfcShamanMeasure("WATER_GUARDS", true)
}
