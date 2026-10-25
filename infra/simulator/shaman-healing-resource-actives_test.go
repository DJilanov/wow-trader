package restoration

import (
	"strings"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/simsignals"
)

func kfcShamanResourceDefault() KFCShamanResourcePolicy {
	return KFCShamanResourcePolicy{ShieldCooldown: "current-client-reference", ShieldTriggers: "all-direct-critical-heals-reference", SwiftnessCooldownStart: "activation-reference"}
}

func kfcShamanResourceFixture(t *testing.T, fields map[string]int32, policy KFCShamanResourcePolicy) (*core.Simulation, *RestorationShaman, []*core.Unit) {
	t.Helper()
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
	for key, index := range map[string]int{"totemic_focus": 4, "water_shield": 8, "restorative_totems": 10, "mana_tide_totem": 11, "natures_swiftness": 13} {
		if rank, ok := fields[key]; ok {
			last[index] = byte('0' + rank)
		}
	}
	parts[2] = string(last)
	request := kfcShamanRequest(0)
	request.Encounter.Duration = 310
	request.Raid.Parties[0].Players[0].TalentsString = strings.Join(parts, "-")
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
	if err := resto.ConfigureKFCShamanWaterPolicy(sim, kfcShamanWaterDefault()); err != nil {
		t.Fatal(err)
	}
	if err := resto.ConfigureKFCShamanResourcePolicy(sim, policy); err != nil {
		t.Fatal(err)
	}
	return sim, resto, resto.kfcHealingPlayers()
}

func kfcShamanRawCriticalHeal(t *testing.T, sim *core.Simulation, resto *RestorationShaman, target *core.Unit, kind string) {
	t.Helper()
	id := int32(331)
	if kind != "class-direct" {
		id = 10461
	}
	spell := resto.GetSpell(core.ActionID{SpellID: id})
	if spell == nil {
		t.Fatal("Missing raw critical event source")
	}
	spell.BonusCritRating = 10000
	switch kind {
	case "class-direct", "other-direct":
		spell.CalcAndDealHealing(sim, target, 1, spell.OutcomeHealingCrit)
	case "periodic":
		result := spell.CalcKFCShamanPeriodicHealing(sim, target, 1, spell.OutcomeHealingCrit)
		spell.DealPeriodicHealing(sim, result)
	case "legacy-periodic-callback":
		spell.CalcAndDealPeriodicHealing(sim, target, 1, spell.OutcomeHealingCrit)
	default:
		t.Fatal("Unknown synthetic critical event")
	}
}

func TestKFCShamanResourceWaterShieldCurrentAndLegacyCooldowns(t *testing.T) {
	for _, kind := range []string{"current-client-reference", "legacy-fifteen-second-reference"} {
		policy := kfcShamanResourceDefault()
		policy.ShieldCooldown = kind
		sim, resto, _ := kfcShamanResourceFixture(t, map[string]int32{"water_shield": 1}, policy)
		if !resto.WaterShield.Cast(sim, &resto.Unit) {
			t.Fatal("Shield rejected")
		}
		if resto.WaterShieldAura.GetStacks() != 3 {
			t.Fatal("Wrong charge count")
		}
		kfcShamanNear(t, resto.Metrics.ManaSpent, 0)
		if resto.GCD.ReadyAt() != 1500*time.Millisecond {
			t.Fatal("Wrong shield GCD")
		}
		kfcShamanAdvance(t, sim, 1500*time.Millisecond)
		if resto.WaterShield.CanCast(sim, &resto.Unit) != (kind == "current-client-reference") {
			t.Fatal("Shield recovery policy ignored")
		}
		kfcShamanAdvance(t, sim, 15*time.Second)
		if !resto.WaterShield.CanCast(sim, &resto.Unit) {
			t.Fatal("Legacy recovery never ended")
		}
		kfcShamanMeasure("RESOURCE_SHIELD_CD", map[string]interface{}{"policy": kind, "gcd": resto.WaterShield.DefaultCast.GCD, "recovery": resto.WaterShield.CD.Duration})
		sim.Cleanup()
	}
}

func TestKFCShamanResourceWaterShieldICDRecastAndChargeExhaustion(t *testing.T) {
	sim, resto, units := kfcShamanResourceFixture(t, map[string]int32{"water_shield": 1}, kfcShamanResourceDefault())
	defer sim.Cleanup()
	resto.SpendMana(sim, 5000, resto.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 731}))
	if !resto.WaterShield.Cast(sim, &resto.Unit) {
		t.Fatal("Shield rejected")
	}
	gain := resto.MaxMana() * .02
	kfcShamanRawCriticalHeal(t, sim, resto, units[1], "class-direct")
	kfcShamanRawCriticalHeal(t, sim, resto, units[2], "class-direct")
	kfcShamanNear(t, resto.kfcActives.shieldMetrics.ActualGainForCurrentIteration(), gain)
	if resto.WaterShieldAura.GetStacks() != 2 {
		t.Fatal("One event batch consumed multiple charges")
	}
	kfcShamanAdvance(t, sim, 1500*time.Millisecond)
	if !resto.WaterShield.Cast(sim, &resto.Unit) {
		t.Fatal("Shield recast rejected")
	}
	kfcShamanRawCriticalHeal(t, sim, resto, units[1], "class-direct")
	kfcShamanNear(t, resto.kfcActives.shieldMetrics.ActualGainForCurrentIteration(), gain)
	if resto.WaterShieldAura.GetStacks() != 3 {
		t.Fatal("Recast reset the internal cooldown")
	}
	kfcShamanAdvance(t, sim, 3499*time.Millisecond)
	kfcShamanRawCriticalHeal(t, sim, resto, units[1], "class-direct")
	kfcShamanNear(t, resto.kfcActives.shieldMetrics.ActualGainForCurrentIteration(), gain)
	for index, at := range []time.Duration{3500 * time.Millisecond, 7 * time.Second, 10500 * time.Millisecond} {
		kfcShamanAdvance(t, sim, at)
		kfcShamanRawCriticalHeal(t, sim, resto, units[1], "class-direct")
		kfcShamanNear(t, resto.kfcActives.shieldMetrics.ActualGainForCurrentIteration(), gain*float64(index+2))
	}
	if resto.WaterShieldAura.IsActive() || resto.ActiveShieldAura != nil || resto.ActiveShield != nil {
		t.Fatal("Exhausted shield stayed active")
	}
	kfcShamanMeasure("RESOURCE_SHIELD_ICD", resto.kfcActives.shieldMetrics.ActualGainForCurrentIteration())
}

func TestKFCShamanResourceWaterShieldFullManaStillConsumesCharge(t *testing.T) {
	sim, resto, units := kfcShamanResourceFixture(t, map[string]int32{"water_shield": 1}, kfcShamanResourceDefault())
	defer sim.Cleanup()
	if !resto.WaterShield.Cast(sim, &resto.Unit) {
		t.Fatal("Shield rejected")
	}
	kfcShamanRawCriticalHeal(t, sim, resto, units[1], "class-direct")
	metrics := resto.kfcActives.shieldMetrics
	kfcShamanNear(t, metrics.ActualGainForCurrentIteration(), 0)
	kfcShamanNear(t, metrics.Gain, resto.MaxMana()*.02)
	if resto.WaterShieldAura.GetStacks() != 2 {
		t.Fatal("Full mana preserved a consumed charge")
	}
	kfcShamanMeasure("RESOURCE_SHIELD_CAP", map[string]interface{}{"gain": metrics.ActualGainForCurrentIteration(), "attempted": metrics.Gain, "charges": resto.WaterShieldAura.GetStacks()})
}

func TestKFCShamanResourceWaterShieldTriggerScopesRespectSemanticPeriodicity(t *testing.T) {
	for _, scope := range []string{"class-direct-critical-heals-reference", "all-direct-critical-heals-reference", "all-critical-heals-reference"} {
		for _, kind := range []string{"class-direct", "other-direct", "periodic", "legacy-periodic-callback"} {
			policy := kfcShamanResourceDefault()
			policy.ShieldTriggers = scope
			sim, resto, units := kfcShamanResourceFixture(t, map[string]int32{"water_shield": 1}, policy)
			resto.SpendMana(sim, 1000, resto.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 732}))
			if !resto.WaterShield.Cast(sim, &resto.Unit) {
				t.Fatal("Shield rejected")
			}
			kfcShamanRawCriticalHeal(t, sim, resto, units[1], kind)
			want := 0.0
			if kind == "class-direct" || (kind == "other-direct" && scope != "class-direct-critical-heals-reference") || scope == "all-critical-heals-reference" {
				want = resto.MaxMana() * .02
			}
			kfcShamanNear(t, resto.kfcActives.shieldMetrics.ActualGainForCurrentIteration(), want)
			kfcShamanMeasure("RESOURCE_SHIELD_SCOPE", map[string]interface{}{"scope": scope, "kind": kind, "gain": resto.kfcActives.shieldMetrics.ActualGainForCurrentIteration()})
			sim.Cleanup()
		}
	}
}

func TestKFCShamanResourceWaterShieldReplacementAndReset(t *testing.T) {
	sim, resto, units := kfcShamanResourceFixture(t, map[string]int32{"water_shield": 1}, kfcShamanResourceDefault())
	defer sim.Cleanup()
	if !resto.WaterShield.Cast(sim, &resto.Unit) {
		t.Fatal("Shield rejected")
	}
	kfcShamanAdvance(t, sim, 1500*time.Millisecond)
	var lightning *core.Spell
	for _, spell := range resto.LightningShield {
		if spell != nil {
			lightning = spell
		}
	}
	if lightning == nil || !lightning.Cast(sim, &resto.Unit) {
		t.Fatal("Lightning Shield replacement rejected")
	}
	if resto.WaterShieldAura.IsActive() || resto.ActiveShield != lightning {
		t.Fatal("Shield replacement did not deactivate water")
	}
	kfcShamanAdvance(t, sim, 3*time.Second)
	if !resto.WaterShield.Cast(sim, &resto.Unit) {
		t.Fatal("Water replacement rejected")
	}
	resto.SpendMana(sim, 1000, resto.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 733}))
	kfcShamanRawCriticalHeal(t, sim, resto, units[1], "class-direct")
	sim.Cleanup()
	sim.Reset()
	if resto.WaterShieldAura.IsActive() || resto.ActiveShieldAura != nil {
		t.Fatal("Shield survived iteration reset")
	}
	resto.SpendMana(sim, 1000, resto.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 734}))
	if !resto.WaterShield.Cast(sim, &resto.Unit) {
		t.Fatal("Reset shield rejected")
	}
	kfcShamanRawCriticalHeal(t, sim, resto, units[1], "class-direct")
	kfcShamanNear(t, resto.kfcActives.shieldMetrics.ActualGainForCurrentIteration(), resto.MaxMana()*.02)
	kfcShamanMeasure("RESOURCE_SHIELD_RESET", true)
}

func TestKFCShamanResourceSwiftnessMakesExactlyOneValidHealInstant(t *testing.T) {
	sim, resto, units := kfcShamanResourceFixture(t, map[string]int32{"natures_swiftness": 1, "improved_healing_wave": 5}, kfcShamanResourceDefault())
	defer sim.Cleanup()
	ns := resto.kfcActives.swiftnessSpell
	wave := resto.GetSpell(core.ActionID{SpellID: 10396})
	target := units[1]
	target.RemoveHealth(sim, 5000)
	wave.BonusCritRating = -10000
	if !ns.Cast(sim, &resto.Unit) {
		t.Fatal("Swiftness rejected")
	}
	kfcShamanNear(t, resto.Metrics.ManaSpent, 0)
	if wave.Cast(sim, sim.Encounter.TargetUnits[0]) {
		t.Fatal("Invalid target consumed Swiftness")
	}
	if !resto.kfcActives.swiftnessAura.IsActive() {
		t.Fatal("Invalid attempt consumed charge")
	}
	before := target.CurrentHealth()
	if !wave.Cast(sim, target) {
		t.Fatal("Instant heal rejected")
	}
	if wave.CurCast.CastTime != 0 || target.CurrentHealth() <= before || resto.kfcActives.swiftnessAura.IsActive() {
		t.Fatal("Swiftness did not consume exactly one instant heal")
	}
	kfcShamanNear(t, wave.CastTimeMultiplier, 1)
	if resto.GCD.ReadyAt() != 1500*time.Millisecond {
		t.Fatal("Swiftness removed heal GCD")
	}
	kfcShamanNear(t, resto.Metrics.ManaSpent, 560)
	kfcShamanAdvance(t, sim, 1500*time.Millisecond)
	before = target.CurrentHealth()
	if !wave.Cast(sim, target) {
		t.Fatal("Second heal rejected")
	}
	if wave.CurCast.CastTime != 2500*time.Millisecond || target.CurrentHealth() != before {
		t.Fatal("Second heal stayed instant")
	}
	kfcShamanAdvance(t, sim, 4*time.Second)
	if target.CurrentHealth() <= before {
		t.Fatal("Second heal never completed")
	}
	kfcShamanMeasure("RESOURCE_SWIFTNESS_ONE", true)
}

func TestKFCShamanResourceSwiftnessCooldownReferences(t *testing.T) {
	for _, kind := range []string{"activation-reference", "consumption-reference"} {
		policy := kfcShamanResourceDefault()
		policy.SwiftnessCooldownStart = kind
		sim, resto, units := kfcShamanResourceFixture(t, map[string]int32{"natures_swiftness": 1}, policy)
		ns := resto.kfcActives.swiftnessSpell
		if !ns.Cast(sim, &resto.Unit) {
			t.Fatal("Swiftness rejected")
		}
		kfcShamanAdvance(t, sim, 5*time.Second)
		if !resto.GetSpell(core.ActionID{SpellID: 10396}).Cast(sim, units[1]) {
			t.Fatal("Delayed consumption rejected")
		}
		want := 180 * time.Second
		if kind == "consumption-reference" {
			want = 185 * time.Second
		}
		if ns.CD.ReadyAt() != want {
			t.Fatal("Wrong cooldown start reference", ns.CD.ReadyAt())
		}
		kfcShamanAdvance(t, sim, 180*time.Second)
		if ns.CanCast(sim, &resto.Unit) != (kind == "activation-reference") {
			t.Fatal("Cooldown reference did not control readiness")
		}
		kfcShamanAdvance(t, sim, 185*time.Second)
		if !ns.CanCast(sim, &resto.Unit) {
			t.Fatal("Swiftness cooldown never ended")
		}
		kfcShamanMeasure("RESOURCE_SWIFTNESS_CD", map[string]interface{}{"reference": kind, "readyAt": ns.CD.ReadyAt()})
		sim.Cleanup()
	}
}

func TestKFCShamanResourceSwiftnessExcludesTotemsAndShieldCasts(t *testing.T) {
	sim, resto, units := kfcShamanResourceFixture(t, map[string]int32{"natures_swiftness": 1, "water_shield": 1}, kfcShamanResourceDefault())
	defer sim.Cleanup()
	if !resto.kfcActives.swiftnessSpell.Cast(sim, &resto.Unit) || !resto.HealingStreamTotem[5].Cast(sim, &resto.Unit) {
		t.Fatal("Initial utility casts rejected")
	}
	if !resto.kfcActives.swiftnessAura.IsActive() {
		t.Fatal("Totem consumed Swiftness")
	}
	kfcShamanAdvance(t, sim, time.Second)
	if !resto.WaterShield.Cast(sim, &resto.Unit) {
		t.Fatal("Shield rejected")
	}
	if !resto.kfcActives.swiftnessAura.IsActive() {
		t.Fatal("Shield consumed Swiftness")
	}
	kfcShamanAdvance(t, sim, 2500*time.Millisecond)
	if !resto.GetSpell(core.ActionID{SpellID: 10396}).Cast(sim, units[1]) {
		t.Fatal("Healing cast rejected")
	}
	if resto.kfcActives.swiftnessAura.IsActive() {
		t.Fatal("Owned heal failed to consume Swiftness")
	}
	kfcShamanMeasure("RESOURCE_SWIFTNESS_UTILITY", true)
}

func TestKFCShamanResourcePolicyOwnershipEncodingAndLiveGuards(t *testing.T) {
	sim, resto, _ := kfcShamanFixture(t, 0, "nearest-injured-reference")
	defer sim.Cleanup()
	if resto.WaterShield != nil || resto.kfcActives.swiftnessSpell != nil {
		t.Fatal("Unowned active spell registered")
	}
	bad := kfcShamanResourceDefault()
	bad.ShieldTriggers = "every-heal"
	if resto.ConfigureKFCShamanResourcePolicy(sim, bad) == nil {
		t.Fatal("Unreviewed resource policy accepted")
	}
	if err := resto.ConfigureKFCShamanResourcePolicy(sim, kfcShamanResourceDefault()); err != nil {
		t.Fatal(err)
	}
	if resto.ConfigureKFCShamanResourcePolicy(sim, kfcShamanResourceDefault()) == nil {
		t.Fatal("Live resource policy replaced")
	}
	for _, value := range []string{"--000000009", "--00000000000009", "--0000000000000009", "a", "----"} {
		func() {
			defer func() {
				if recover() == nil {
					t.Fatal("Invalid component encoding accepted", value)
				}
			}()
			validateKFCShamanComponentTalentEncoding(value)
		}()
	}
	kfcShamanMeasure("RESOURCE_GUARDS", true)
}
