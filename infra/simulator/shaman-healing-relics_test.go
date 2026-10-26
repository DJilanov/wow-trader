package restoration

import (
	"math"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
)

func kfcShamanRelicFixture(t *testing.T, id int32, slot int, fields map[string]int32) (*core.Simulation, *RestorationShaman, []*core.Unit) {
	t.Helper()
	request := kfcShamanRequest(500)
	request.Encounter.Duration = 310
	player := request.Raid.Parties[0].Players[0]
	player.TalentsString = kfcRiptideTalentString(fields)
	player.Equipment = &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
	for index := range player.Equipment.Items {
		player.Equipment.Items[index] = &proto.ItemSpec{}
	}
	player.Equipment.Items[slot].Id = id
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	resto := sim.Raid.Parties[0].Players[0].(*RestorationShaman)
	kfcRiptideConfigure(t, sim, resto, kfcRiptideDefault(), kfcShamanResourceDefault())
	return sim, resto, resto.kfcHealingPlayers()
}

func kfcShamanRelicConfigure(t *testing.T, sim *core.Simulation, resto *RestorationShaman, mode string) {
	t.Helper()
	if err := resto.ConfigureKFCShamanHealingRelicPolicy(sim, KFCShamanHealingRelicPolicy{CostStacking: mode}); err != nil {
		t.Fatal(err)
	}
}

func TestKFCShamanRelicExactEquipmentOwnershipAndInactiveScopes(t *testing.T) {
	ids := []int32{0, 22345, 22395, 23200, 228176, 249398, 249443, 272431, 272432, 272433, 279249}
	for _, id := range ids {
		sim, resto, _ := kfcShamanRelicFixture(t, id, 16, map[string]int32{"riptide": 1, "water_shield": 1})
		if id == 0 {
			if resto.kfcRelics != nil {
				t.Fatal("Empty ranged slot acquired relic ownership")
			}
		} else {
			if resto.kfcRelics == nil || resto.kfcRelics.itemID != id {
				t.Fatal("Actual equipped relic not owned", id)
			}
		}
		for _, spell := range resto.Spellbook {
			if spell.Cost != nil {
				kfcShamanNear(t, spell.Cost.KFCShamanRelicCostFactor(), 0)
			}
			want := 0.0
			if id == 279249 && kfcShamanHealingRelicSpecs[id].Actions[spell.ActionID.SpellID] && spell.ActionID.Tag == 0 {
				want = 4 * core.SpellCritRatingPerCritChance
			}
			if kfcShamanClassHealIDs[spell.ActionID.SpellID] {
				kfcShamanNear(t, spell.BonusCritRating, want)
			}
		}
		wantRegen := 0.0
		if id == 249398 {
			wantRegen = .08
		}
		kfcShamanNear(t, resto.PseudoStats.SpiritRegenRateCasting, wantRegen)
		wantCharges := int32(3)
		if id == 23200 {
			wantCharges = 4
		}
		if resto.WaterShieldAura.MaxStacks != wantCharges {
			t.Fatal("Relic leaked charge bonus", id)
		}
		kfcShamanMeasure("RELIC_OWNERSHIP", map[string]interface{}{"id": id, "regen": resto.PseudoStats.SpiritRegenRateCasting, "charges": resto.WaterShieldAura.MaxStacks})
		sim.Cleanup()
	}
	// Core normalizes imported equipment to its actual slot before ownership checks.
	sim, resto, _ := kfcShamanRelicFixture(t, 279249, 13, map[string]int32{})
	defer sim.Cleanup()
	if resto.Ranged().ID != 279249 || resto.kfcRelics == nil || resto.kfcRelics.itemID != 279249 {
		t.Fatal("Relic ownership disagrees with actual normalized equipment")
	}
}

func kfcShamanRelicCastCostMatrix(t *testing.T, id int32, ids []int32) {
	t.Helper()
	for rank := int32(0); rank <= 5; rank++ {
		for _, mode := range []string{"additive-percent-reference", "multiplicative-reference"} {
			values := []float64{}
			for _, spellID := range ids {
				sim, resto, units := kfcShamanRelicFixture(t, id, 16, map[string]int32{"riptide": 1, "tidal_focus": rank})
				spell := resto.GetSpell(core.ActionID{SpellID: spellID})
				if spell == nil || spell.Cost == nil {
					t.Fatal("Missing cost family", spellID)
				}
				base := spell.Cost.BaseCost
				if spell.CanCast(sim, units[1]) {
					t.Fatal("Unconfigured cost stacking admitted", id, spellID)
				}
				kfcShamanRelicConfigure(t, sim, resto, mode)
				factor := (100 - float64(rank) - 5) / 100
				if mode == "multiplicative-reference" {
					factor = (100 - float64(rank)) / 100 * .95
				}
				want := base * factor
				kfcShamanNear(t, spell.Cost.BaseCost, base)
				kfcShamanNear(t, spell.Cost.GetCurrentCost(), want)
				kfcShamanNear(t, spell.DefaultCast.Cost, want)
				if !spell.Cast(sim, units[1]) {
					t.Fatal("Configured rank rejected", id, spellID)
				}
				kfcShamanAdvance(t, sim, max(spell.DefaultCast.CastTime, 1500*time.Millisecond))
				kfcShamanNear(t, resto.Metrics.ManaSpent, want)
				values = append(values, float64(spellID), base, want, resto.Metrics.ManaSpent)
				sim.Cleanup()
			}
			kfcShamanMeasure("RELIC_COST", map[string]interface{}{"id": id, "talent": rank, "mode": mode, "ranks": values})
		}
	}
}

func TestKFCShamanRelicHealingWaveAllRanksActualMana(t *testing.T) {
	kfcShamanRelicCastCostMatrix(t, 272431, []int32{331, 332, 547, 913, 939, 959, 8005, 10395, 10396})
}

func TestKFCShamanRelicRiptideAllRanksActualMana(t *testing.T) {
	kfcShamanRelicCastCostMatrix(t, 22345, []int32{408521, 1239242, 1239243})
}

func TestKFCShamanRelicCostFamiliesDoNotModifyOtherCastsOrTicks(t *testing.T) {
	for _, id := range []int32{22345, 272431} {
		sim, resto, _ := kfcShamanRelicFixture(t, id, 16, map[string]int32{"riptide": 1, "water_shield": 1, "mana_tide_totem": 1, "natures_swiftness": 1, "tidal_focus": 5})
		before := map[*core.Spell]float64{}
		for _, spell := range resto.Spellbook {
			if spell.Cost != nil {
				before[spell] = spell.Cost.GetCurrentCost()
			}
		}
		kfcShamanRelicConfigure(t, sim, resto, "multiplicative-reference")
		count := 0
		for _, spell := range resto.Spellbook {
			affected := spell.ActionID.Tag == 0 && kfcShamanHealingRelicSpecs[id].Actions[spell.ActionID.SpellID]
			if spell.Cost != nil {
				want := before[spell]
				if affected {
					want *= .95
					count++
				}
				kfcShamanNear(t, spell.Cost.GetCurrentCost(), want)
			}
			if spell.ActionID.Tag != 0 && spell.Cost != nil && spell.Cost.KFCShamanRelicCostFactor() != 0 {
				t.Fatal("Periodic action received cast-cost factor")
			}
		}
		want := 3
		if id == 272431 {
			want = 9
		}
		if count != want {
			t.Fatal("Wrong direct family coverage", id, count)
		}
		kfcShamanMeasure("RELIC_FAMILY_SCOPE", []int32{id, int32(count)})
		sim.Cleanup()
	}
}

func TestKFCShamanRelicFractionalCostControlsAffordabilityAndSpend(t *testing.T) {
	sim, resto, units := kfcShamanRelicFixture(t, 272431, 16, map[string]int32{"tidal_focus": 5})
	defer sim.Cleanup()
	kfcShamanRelicConfigure(t, sim, resto, "multiplicative-reference")
	spell := resto.GetSpell(core.ActionID{SpellID: 10396})
	want := spell.Cost.BaseCost * .9025
	resto.SpendMana(sim, resto.CurrentMana()-(want-.001), resto.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 810}))
	if spell.CanCast(sim, units[1]) {
		t.Fatal("Insufficient fractional mana accepted")
	}
	resto.AddMana(sim, .002, resto.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 811}))
	spent := resto.Metrics.ManaSpent
	if !spell.Cast(sim, units[1]) {
		t.Fatal("Sufficient fractional mana rejected")
	}
	kfcShamanAdvance(t, sim, 3*time.Second)
	kfcShamanNear(t, resto.Metrics.ManaSpent-spent, want)
	kfcShamanMeasure("RELIC_FRACTIONAL_COST", []float64{spell.Cost.BaseCost, want, resto.Metrics.ManaSpent - spent})
}

func TestKFCShamanRelicPolicyIsFreshExplicitOwnedAndImmutable(t *testing.T) {
	for _, id := range []int32{0, 23200, 249398, 279249, 22395} {
		sim, resto, _ := kfcShamanRelicFixture(t, id, 16, map[string]int32{})
		if resto.ConfigureKFCShamanHealingRelicPolicy(sim, KFCShamanHealingRelicPolicy{CostStacking: "multiplicative-reference"}) == nil {
			t.Fatal("Noncost owner configured", id)
		}
		sim.Cleanup()
	}
	sim, resto, units := kfcShamanRelicFixture(t, 272431, 16, map[string]int32{})
	defer sim.Cleanup()
	for _, mode := range []string{"", "verified", "additive", "multiplicative"} {
		if resto.ConfigureKFCShamanHealingRelicPolicy(sim, KFCShamanHealingRelicPolicy{CostStacking: mode}) == nil {
			t.Fatal("Unknown reference admitted", mode)
		}
	}
	if resto.ConfigureKFCShamanHealingRelicPolicy(nil, KFCShamanHealingRelicPolicy{CostStacking: "multiplicative-reference"}) == nil {
		t.Fatal("Nil simulation admitted")
	}
	kfcShamanRelicConfigure(t, sim, resto, "multiplicative-reference")
	echo := resto.KFCShamanHealingRelicPolicyEcho()
	echo.CostStacking = "mutated"
	if resto.KFCShamanHealingRelicPolicyEcho().CostStacking != "multiplicative-reference" {
		t.Fatal("Policy echo aliases live policy")
	}
	if resto.ConfigureKFCShamanHealingRelicPolicy(sim, KFCShamanHealingRelicPolicy{CostStacking: "additive-percent-reference"}) == nil {
		t.Fatal("Policy changed after configuration")
	}
	if !resto.GetSpell(core.ActionID{SpellID: 331}).Cast(sim, units[1]) {
		t.Fatal("Configured cost family rejected")
	}
	if resto.ConfigureKFCShamanHealingRelicPolicy(sim, KFCShamanHealingRelicPolicy{CostStacking: "additive-percent-reference"}) == nil {
		t.Fatal("Policy changed after casting")
	}
	kfcShamanMeasure("RELIC_POLICY_GUARDS", 12)
}

func TestKFCShamanRelicCoreCostFactorBoundsAndDuplicateGuard(t *testing.T) {
	for _, factor := range []float64{0, -1, 1.01, math.NaN(), math.Inf(1), math.Inf(-1)} {
		sim, resto, _ := kfcShamanRelicFixture(t, 0, 16, map[string]int32{})
		func() {
			defer func() {
				if recover() == nil {
					t.Fatal("Invalid factor accepted", factor)
				}
			}()
			resto.GetSpell(core.ActionID{SpellID: 331}).Cost.SetKFCShamanRelicCostFactor(factor)
		}()
		sim.Cleanup()
	}
	sim, resto, _ := kfcShamanRelicFixture(t, 0, 16, map[string]int32{})
	defer sim.Cleanup()
	cost := resto.GetSpell(core.ActionID{SpellID: 331}).Cost
	base := cost.GetCurrentCost()
	cost.SetKFCShamanRelicCostFactor(1)
	kfcShamanNear(t, cost.GetCurrentCost(), base)
	func() {
		defer func() {
			if recover() == nil {
				t.Fatal("Duplicate factor accepted")
			}
		}()
		cost.SetKFCShamanRelicCostFactor(.95)
	}()
	kfcShamanMeasure("RELIC_COST_FACTOR_GUARDS", 7)
}

func TestKFCShamanRelicLesserHealingWaveCriticalScopeAndActualOutcomes(t *testing.T) {
	values := []float64{}
	for _, id := range []int32{0, 279249} {
		sim, resto, units := kfcShamanRelicFixture(t, id, 16, map[string]int32{"riptide": 1, "tidal_mastery": 5})
		for _, spellID := range []int32{8004, 8008, 8010, 10466, 10467, 10468, 331, 1064, 1239243} {
			spell := resto.GetSpell(core.ActionID{SpellID: spellID})
			want := 5.0
			if id == 279249 && kfcShamanHealingRelicSpecs[id].Actions[spellID] {
				want += 4
			}
			kfcShamanNear(t, spell.BonusCritRating, want*core.SpellCritRatingPerCritChance)
		}
		spell := resto.GetSpell(core.ActionID{SpellID: 10468})
		for n := 0; n < 10000; n++ {
			spell.CalcAndDealHealing(sim, units[1], 1, spell.OutcomeHealingCrit)
		}
		metrics := spell.SpellMetrics[units[1].UnitIndex]
		if metrics.Crits == 0 || metrics.Hits == 0 {
			t.Fatal("Critical outcome control degenerated")
		}
		values = append(values, float64(metrics.Crits), float64(metrics.Hits), metrics.TotalHealing)
		sim.Cleanup()
	}
	if values[3] <= values[0] || values[3]-values[0] < 250 || values[3]-values[0] > 550 {
		t.Fatal("Equipped critical bonus did not reach actual outcomes", values)
	}
	kfcShamanMeasure("RELIC_LHW_CRIT", values)
}

func TestKFCShamanRelicWaterShieldFourActualChargesICDAndReset(t *testing.T) {
	sim, resto, units := kfcShamanRelicFixture(t, 23200, 16, map[string]int32{"water_shield": 1})
	defer sim.Cleanup()
	resto.SpendMana(sim, 5000, resto.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 812}))
	if !resto.WaterShield.Cast(sim, &resto.Unit) {
		t.Fatal("Equipped shield rejected")
	}
	if resto.WaterShieldAura.GetStacks() != 4 {
		t.Fatal("Relic fourth charge absent")
	}
	gain := resto.MaxMana() * .02
	for index, at := range []time.Duration{0, 3500 * time.Millisecond, 7 * time.Second, 10500 * time.Millisecond} {
		if at > 0 {
			kfcShamanAdvance(t, sim, at)
		}
		kfcShamanRawCriticalHeal(t, sim, resto, units[1], "class-direct")
		kfcShamanRawCriticalHeal(t, sim, resto, units[1], "class-direct")
		kfcShamanNear(t, resto.kfcActives.shieldMetrics.ActualGainForCurrentIteration(), gain*float64(index+1))
		if resto.WaterShieldAura.GetStacks() != int32(3-index) {
			t.Fatal("Charge/ICD mismatch", index)
		}
	}
	if resto.WaterShieldAura.IsActive() {
		t.Fatal("Fourth charge did not exhaust aura")
	}
	kfcShamanMeasure("RELIC_SHIELD_FOUR", []float64{gain, resto.kfcActives.shieldMetrics.ActualGainForCurrentIteration()})
	sim.Cleanup()
	sim.Reset()
	if resto.WaterShieldAura.IsActive() {
		t.Fatal("Shield active across iteration")
	}
	if !resto.WaterShield.Cast(sim, &resto.Unit) || resto.WaterShieldAura.GetStacks() != 4 {
		t.Fatal("Reset lost fourth charge")
	}
}

func TestKFCShamanRelicWaterShieldRecastCapAndTalentOwnership(t *testing.T) {
	sim, resto, units := kfcShamanRelicFixture(t, 23200, 16, map[string]int32{"water_shield": 1})
	defer sim.Cleanup()
	if !resto.WaterShield.Cast(sim, &resto.Unit) {
		t.Fatal("Shield rejected")
	}
	kfcShamanRawCriticalHeal(t, sim, resto, units[1], "class-direct")
	kfcShamanNear(t, resto.kfcActives.shieldMetrics.ActualGainForCurrentIteration(), 0)
	if resto.WaterShieldAura.GetStacks() != 3 {
		t.Fatal("Capped event preserved charge")
	}
	kfcShamanAdvance(t, sim, 1500*time.Millisecond)
	if !resto.WaterShield.Cast(sim, &resto.Unit) || resto.WaterShieldAura.GetStacks() != 4 {
		t.Fatal("Recast did not refill fourth charge")
	}
	resto.SpendMana(sim, 1000, resto.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 813}))
	kfcShamanRawCriticalHeal(t, sim, resto, units[1], "class-direct")
	kfcShamanNear(t, resto.kfcActives.shieldMetrics.ActualGainForCurrentIteration(), 0)
	if resto.WaterShieldAura.GetStacks() != 4 {
		t.Fatal("Recast reset internal cooldown")
	}
	other, owner, _ := kfcShamanRelicFixture(t, 23200, 16, map[string]int32{})
	defer other.Cleanup()
	if owner.WaterShield != nil || owner.WaterShieldAura != nil {
		t.Fatal("Relic granted unlearned Water Shield")
	}
	kfcShamanMeasure("RELIC_SHIELD_RECAST", resto.WaterShieldAura.GetStacks())
}

func TestKFCShamanRelicCastingSpiritRegenerationAppliedOnceToActualTicks(t *testing.T) {
	for rank, want := range []float64{0, .17, .33, .5} {
		values := []float64{}
		for _, id := range []int32{0, 249398} {
			sim, resto, units := kfcShamanRelicFixture(t, id, 16, map[string]int32{"riptide": 1, "mindfulness": int32(rank)})
			rate := want
			if id != 0 {
				rate += .08
			}
			kfcShamanNear(t, resto.PseudoStats.SpiritRegenRateCasting, rate)
			if !resto.kfcRiptide.spells[1239243].Cast(sim, units[1]) {
				t.Fatal("Real mana cast rejected")
			}
			resto.SpendMana(sim, 3000, resto.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 814}))
			before := resto.CurrentMana()
			resto.ManaTick(sim)
			actual := resto.CurrentMana() - before
			kfcShamanNear(t, actual, 2*resto.ManaRegenPerSecondWhileCasting())
			values = append(values, rate, actual, 2*resto.ManaRegenPerSecondWhileNotCasting())
			sim.Cleanup()
			sim.Reset()
			kfcShamanNear(t, resto.PseudoStats.SpiritRegenRateCasting, rate)
			resto.ManaTick(sim)
			kfcShamanNear(t, resto.CurrentMana(), resto.MaxMana())
			sim.Cleanup()
		}
		kfcShamanNear(t, values[5], values[2])
		if values[4] <= values[1] {
			t.Fatal("Equipped casting regeneration absent", rank, values)
		}
		kfcShamanMeasure("RELIC_CASTING_REGEN", map[string]interface{}{"rank": rank, "values": values})
	}
}

func TestKFCShamanRelicCostAndCritDoNotAccumulateAcrossReset(t *testing.T) {
	for _, id := range []int32{22345, 272431, 279249} {
		sim, resto, units := kfcShamanRelicFixture(t, id, 16, map[string]int32{"riptide": 1, "tidal_focus": 5, "tidal_mastery": 5})
		if id != 279249 {
			kfcShamanRelicConfigure(t, sim, resto, "multiplicative-reference")
		}
		spellID := int32(10396)
		if id == 22345 {
			spellID = 1239243
		}
		if id == 279249 {
			spellID = 10468
		}
		spell := resto.GetSpell(core.ActionID{SpellID: spellID})
		cost := spell.Cost.GetCurrentCost()
		crit := spell.BonusCritRating
		for iteration := 0; iteration < 3; iteration++ {
			if !spell.Cast(sim, units[1]) {
				t.Fatal("Reset cast rejected", id, iteration)
			}
			kfcShamanAdvance(t, sim, max(spell.DefaultCast.CastTime, 1500*time.Millisecond))
			kfcShamanNear(t, resto.Metrics.ManaSpent, cost)
			kfcShamanNear(t, spell.BonusCritRating, crit)
			sim.Cleanup()
			sim.Reset()
		}
		kfcShamanMeasure("RELIC_RESET", []float64{float64(id), cost, crit})
		sim.Cleanup()
	}
}
