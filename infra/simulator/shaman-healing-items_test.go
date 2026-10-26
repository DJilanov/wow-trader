package restoration

import (
	"fmt"
	"math"
	"testing"
	"time"

	// Match the full simulator's shared item-effect registration.
	_ "github.com/wowsims/classic/sim/common"
	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
)

func kfcShamanItemPolicy(chance float64, events string) KFCShamanHealingItemEffectsPolicy {
	return KFCShamanHealingItemEffectsPolicy{Schema: "kfc-shaman-item-effects-policy.v1", ID: fmt.Sprintf("heart-%g-%s", chance, events), DormantHeartProcChance: &chance, DormantHeartHealingEvents: events}
}

func kfcShamanItemsFixture(t *testing.T, items ...int32) (*core.Simulation, *RestorationShaman, *core.Unit) {
	t.Helper()
	request := kfcShamanRequest(500)
	request.Encounter.Duration = 1200
	player := request.Raid.Parties[0].Players[0]
	player.TalentsString = kfcRiptideTalentString(map[string]int32{"riptide": 1, "water_shield": 1})
	player.Equipment = &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
	for slot := range player.Equipment.Items {
		player.Equipment.Items[slot] = &proto.ItemSpec{}
	}
	if len(items) > 2 {
		t.Fatal("At most two actual trinkets")
	}
	for index, item := range items {
		player.Equipment.Items[12+index].Id = item
	}
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	resto := sim.Raid.Parties[0].Players[0].(*RestorationShaman)
	resources := kfcShamanResourceDefault()
	resources.ShieldTriggers = "all-critical-heals-reference"
	kfcRiptideConfigure(t, sim, resto, kfcRiptideDefault(), resources)
	target := resto.kfcHealingPlayers()[1]
	target.AddStatDynamic(sim, stats.Health, 50000)
	target.GainHealth(sim, target.MaxHealth(), target.NewHealthMetrics(core.ActionID{SpellID: 1, Tag: 982}))
	return sim, resto, target
}

func TestKFCShamanItemsOwnershipAndInvalidPolicies(t *testing.T) {
	for _, owned := range []bool{false, true} {
		items := []int32{}
		if owned {
			items = append(items, 249473)
		}
		sim, resto, _ := kfcShamanItemsFixture(t, items...)
		if (resto.GetAura("Shaman Eternal Power") != nil) != owned || resto.KFCShamanHealingItemPolicyEcho() != nil {
			t.Fatal("Wrong item ownership or implicit policy")
		}
		sim.Cleanup()
	}
	for _, kind := range []string{"nil", "negative", "large", "nan", "infinite", "events", "schema", "id"} {
		sim, resto, _ := kfcShamanItemsFixture(t, 249473)
		policy := kfcShamanItemPolicy(1, "completed-casts")
		switch kind {
		case "nil":
			policy.DormantHeartProcChance = nil
		case "negative":
			*policy.DormantHeartProcChance = -1
		case "large":
			*policy.DormantHeartProcChance = 1.1
		case "nan":
			*policy.DormantHeartProcChance = math.NaN()
		case "infinite":
			*policy.DormantHeartProcChance = math.Inf(1)
		case "events":
			policy.DormantHeartHealingEvents = "periodic"
		case "schema":
			policy.Schema = "other"
		case "id":
			policy.ID = ""
		}
		if resto.ConfigureKFCShamanHealingItemEffects(sim, policy) == nil {
			t.Fatal("Invalid item policy admitted", kind)
		}
		sim.Cleanup()
	}
	kfcShamanMeasure("ITEMS_POLICY_VALIDATION", 8)
}

func TestKFCShamanItemsHeartExactSeededRatesAndStats(t *testing.T) {
	values := []float64{}
	for _, chance := range []float64{0, .02, .05, .1, 1} {
		sim, resto, _ := kfcShamanItemsFixture(t, 249473)
		oracle, _, _ := kfcShamanItemsFixture(t)
		if err := resto.ConfigureKFCShamanHealingItemEffects(sim, kfcShamanItemPolicy(chance, "completed-casts")); err != nil {
			t.Fatal(err)
		}
		trigger, buff := resto.GetAura("Shaman Dormant Heart trigger"), resto.GetAura("Shaman Eternal Power")
		healing, damage, power := resto.GetStat(stats.HealingPower), resto.GetStat(stats.SpellDamage), resto.GetStat(stats.SpellPower)
		count := 0
		for index := 0; index < 1000; index++ {
			trigger.OnCastComplete(trigger, sim, resto.GetSpell(core.ActionID{SpellID: 331}))
			expected := chance > 0 && oracle.Proc(chance, "Shaman Eternal Power")
			if buff.IsActive() != expected {
				t.Fatal("Heart differs from seeded oracle", chance, index)
			}
			if expected {
				count++
				kfcShamanNear(t, resto.GetStat(stats.HealingPower)-healing, 40)
				kfcShamanNear(t, resto.GetStat(stats.SpellDamage)-damage, 13)
				kfcShamanNear(t, resto.GetStat(stats.SpellPower), power)
			}
			buff.Deactivate(sim)
			kfcShamanNear(t, resto.GetStat(stats.HealingPower), healing)
		}
		values = append(values, chance, float64(count))
		sim.Cleanup()
		oracle.Cleanup()
	}
	kfcShamanMeasure("ITEMS_HEART_RATES", values)
}

func TestKFCShamanItemsHeartOnlyNineOwnedHealingWaveRanks(t *testing.T) {
	for _, events := range []string{"completed-casts", "direct-heals"} {
		sim, resto, target := kfcShamanItemsFixture(t, 249473)
		if err := resto.ConfigureKFCShamanHealingItemEffects(sim, kfcShamanItemPolicy(1, events)); err != nil {
			t.Fatal(err)
		}
		trigger, buff := resto.GetAura("Shaman Dormant Heart trigger"), resto.GetAura("Shaman Eternal Power")
		count := 0
		for _, spell := range resto.Spellbook {
			want := false
			for _, id := range []int32{331, 332, 547, 913, 939, 959, 8005, 10395, 10396} {
				want = want || spell == resto.GetSpell(core.ActionID{SpellID: id})
			}
			if events == "completed-casts" {
				trigger.OnCastComplete(trigger, sim, spell)
			} else {
				result := spell.NewResult(target)
				result.DirectDamageOrHealing = true
				trigger.OnHealDealt(trigger, sim, spell, result)
				spell.DisposeResult(result)
			}
			if buff.IsActive() != want {
				t.Fatal("Wrong Heart spell family", events, spell.ActionID)
			}
			if buff.IsActive() {
				count++
			}
			buff.Deactivate(sim)
		}
		if count != 9 || resto.GetSpell(core.ActionID{SpellID: 25357}) != nil {
			t.Fatal("Wrong nonraid Healing Wave scope", count)
		}
		kfcShamanMeasure("ITEMS_HEART_FAMILY", map[string]interface{}{"events": events, "ranks": count})
		sim.Cleanup()
	}
}

func TestKFCShamanItemsHeartActualRanksAffectTheNextHeal(t *testing.T) {
	values := []float64{}
	for _, id := range []int32{331, 332, 547, 913, 939, 959, 8005, 10395, 10396} {
		amounts := [][]float64{}
		var expected float64
		for _, chance := range []float64{0, 1} {
			sim, resto, target := kfcShamanItemsFixture(t, 249473)
			if err := resto.ConfigureKFCShamanHealingItemEffects(sim, kfcShamanItemPolicy(chance, "completed-casts")); err != nil {
				t.Fatal(err)
			}
			spell := resto.GetSpell(core.ActionID{SpellID: id})
			spell.BonusCritRating = -10000
			expected = 40 * spell.BonusCoefficient * spell.DamageMultiplier
			row := []float64{}
			for cast := 0; cast < 2; cast++ {
				target.RemoveHealth(sim, max(0, target.CurrentHealth()-1))
				before := spell.SpellMetrics[target.UnitIndex].TotalHealing
				if !spell.Cast(sim, target) {
					t.Fatal("Actual Healing Wave failed", id)
				}
				kfcShamanAdvance(t, sim, sim.CurrentTime+spell.DefaultCast.CastTime)
				row = append(row, spell.SpellMetrics[target.UnitIndex].TotalHealing-before)
			}
			amounts = append(amounts, row)
			sim.Cleanup()
		}
		kfcShamanNear(t, amounts[1][0]-amounts[0][0], 0)
		kfcShamanNear(t, amounts[1][1]-amounts[0][1], expected)
		values = append(values, amounts[1][1]-amounts[0][1])
	}
	kfcShamanMeasure("ITEMS_HEART_NEXT_HEAL", values)
}

func TestKFCShamanItemsHeartRejectsPrecombatDeadPassiveAndForeignEvents(t *testing.T) {
	sim, resto, _ := kfcShamanItemsFixture(t, 249473)
	defer sim.Cleanup()
	if err := resto.ConfigureKFCShamanHealingItemEffects(sim, kfcShamanItemPolicy(1, "completed-casts")); err != nil {
		t.Fatal(err)
	}
	trigger, buff := resto.GetAura("Shaman Dormant Heart trigger"), resto.GetAura("Shaman Eternal Power")
	spell := resto.GetSpell(core.ActionID{SpellID: 331})
	sim.CurrentTime = -time.Second
	trigger.OnCastComplete(trigger, sim, spell)
	if buff.IsActive() {
		t.Fatal("Precombat Heart proc")
	}
	sim.CurrentTime = 0
	for _, flag := range []core.SpellFlag{core.SpellFlagPassiveSpell, core.SpellFlagNoOnCastComplete} {
		old := spell.Flags
		spell.Flags |= flag
		trigger.OnCastComplete(trigger, sim, spell)
		spell.Flags = old
		if buff.IsActive() {
			t.Fatal("Excluded spell flags proc")
		}
	}
	foreign := *spell
	trigger.OnCastComplete(trigger, sim, &foreign)
	if buff.IsActive() {
		t.Fatal("Foreign same-ID spell proc")
	}
	mask := spell.ProcMask
	spell.ProcMask = core.ProcMaskEmpty
	trigger.OnCastComplete(trigger, sim, spell)
	spell.ProcMask = mask
	if buff.IsActive() {
		t.Fatal("Nonhealing mask proc")
	}
	trigger.OnCastComplete(trigger, sim, nil)
	if buff.IsActive() {
		t.Fatal("Nil spell proc")
	}
	resto.RemoveHealth(sim, resto.CurrentHealth())
	trigger.OnCastComplete(trigger, sim, spell)
	if buff.IsActive() {
		t.Fatal("Dead owner proc")
	}
	kfcShamanMeasure("ITEMS_HEART_EXCLUSIONS", true)
}

func TestKFCShamanItemsHeartRefreshExpiryAndReset(t *testing.T) {
	sim, resto, target := kfcShamanItemsFixture(t, 249473)
	defer sim.Cleanup()
	if err := resto.ConfigureKFCShamanHealingItemEffects(sim, kfcShamanItemPolicy(1, "completed-casts")); err != nil {
		t.Fatal(err)
	}
	spell := resto.GetSpell(core.ActionID{SpellID: 331})
	spell.BonusCritRating = -10000
	before := resto.GetStat(stats.HealingPower)
	for cast := 0; cast < 2; cast++ {
		if !spell.Cast(sim, target) {
			t.Fatal("Refresh cast failed")
		}
		kfcShamanAdvance(t, sim, sim.CurrentTime+spell.DefaultCast.CastTime)
		kfcShamanNear(t, resto.GetStat(stats.HealingPower)-before, 40)
	}
	buff := resto.GetAura("Shaman Eternal Power")
	expires := buff.ExpiresAt()
	if buff.Duration != 15*time.Second || expires-sim.CurrentTime != 15*time.Second {
		t.Fatal("Heart must last exactly fifteen seconds from the latest proc")
	}
	if !resto.GetSpell(core.ActionID{SpellID: 8004}).Cast(sim, target) {
		t.Fatal("Lesser Healing Wave failed")
	}
	kfcShamanAdvance(t, sim, sim.CurrentTime+1500*time.Millisecond)
	if buff.ExpiresAt() != expires {
		t.Fatal("Excluded family refreshed Heart")
	}
	kfcShamanAdvance(t, sim, expires-time.Millisecond)
	if !buff.IsActive() {
		t.Fatal("Heart expired early")
	}
	kfcShamanAdvance(t, sim, expires)
	if buff.IsActive() {
		t.Fatal("Heart failed to expire")
	}
	kfcShamanNear(t, resto.GetStat(stats.HealingPower), before)
	sim.Cleanup()
	sim.Reset()
	if buff.IsActive() {
		t.Fatal("Heart survived reset")
	}
	kfcShamanNear(t, resto.GetStat(stats.HealingPower), before)
	if !spell.Cast(sim, target) {
		t.Fatal("Policy did not survive iteration reset")
	}
	kfcShamanAdvance(t, sim, spell.DefaultCast.CastTime)
	if !buff.IsActive() {
		t.Fatal("No proc after reset")
	}
	kfcShamanMeasure("ITEMS_HEART_LIFECYCLE", true)
}

func TestKFCShamanItemsPolicyFreshnessCopiesAndExplicitCastGate(t *testing.T) {
	sim, resto, target := kfcShamanItemsFixture(t, 249473)
	defer sim.Cleanup()
	spell := resto.GetSpell(core.ActionID{SpellID: 331})
	if spell.Cast(sim, target) {
		t.Fatal("Heart owner cast without an explicit policy")
	}
	policy := kfcShamanItemPolicy(.05, "completed-casts")
	if resto.ConfigureKFCShamanHealingItemEffects(nil, policy) == nil {
		t.Fatal("Nil simulation admitted")
	}
	positions := resto.positions
	resto.positions = nil
	if resto.ConfigureKFCShamanHealingItemEffects(sim, policy) == nil {
		t.Fatal("Missing geometry admitted")
	}
	resto.positions = positions
	if err := resto.ConfigureKFCShamanHealingItemEffects(sim, policy); err != nil {
		t.Fatal(err)
	}
	*policy.DormantHeartProcChance = 1
	echo := resto.KFCShamanHealingItemPolicyEcho()
	kfcShamanNear(t, *echo.DormantHeartProcChance, .05)
	*echo.DormantHeartProcChance = 0
	kfcShamanNear(t, *resto.KFCShamanHealingItemPolicyEcho().DormantHeartProcChance, .05)
	if resto.ConfigureKFCShamanHealingItemEffects(sim, kfcShamanItemPolicy(1, "completed-casts")) == nil {
		t.Fatal("Repeated policy admitted")
	}
	if !spell.Cast(sim, target) {
		t.Fatal("Configured cast rejected")
	}
	late, owner, _ := kfcShamanItemsFixture(t, 249473)
	defer late.Cleanup()
	kfcShamanAdvance(t, late, time.Second)
	if owner.kfcHealingItems.policy != nil || owner.kfcHealingItems.started || owner.GCD.ReadyAt() > 0 {
		t.Fatal("Late probe must be otherwise fresh")
	}
	if owner.ConfigureKFCShamanHealingItemEffects(late, kfcShamanItemPolicy(1, "completed-casts")) == nil {
		t.Fatal("Late policy admitted")
	}
	kfcShamanMeasure("ITEMS_POLICY_FRESH", true)
}

func TestKFCShamanItemsMindtapExactTicksAndCooldown(t *testing.T) {
	sim, resto, _ := kfcShamanItemsFixture(t, 18371)
	defer sim.Cleanup()
	spell := resto.GetSpell(core.ActionID{SpellID: 1302205})
	if spell == nil {
		t.Fatal("Missing Mindtap use")
	}
	resto.SpendMana(sim, resto.CurrentMana()*.8, resto.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 983}))
	if !spell.Cast(sim, &resto.Unit) {
		t.Fatal("Mindtap use failed")
	}
	metrics := resto.kfcHealingItems.mindtapMana
	if metrics == nil {
		t.Fatal("Missing owned mana ledger")
	}
	kfcShamanAdvance(t, sim, 999*time.Millisecond)
	kfcShamanNear(t, metrics.Gain, 0)
	kfcShamanAdvance(t, sim, time.Second)
	kfcShamanNear(t, metrics.Gain, 125)
	kfcShamanAdvance(t, sim, 10*time.Second)
	kfcShamanNear(t, metrics.Gain, 1250)
	kfcShamanNear(t, metrics.ActualGainForCurrentIteration(), 1250)
	kfcShamanAdvance(t, sim, 11*time.Second)
	kfcShamanNear(t, metrics.Gain, 1250)
	if spell.CD.Duration != 420*time.Second || spell.CD.ReadyAt() != 420*time.Second {
		t.Fatal("Wrong Mindtap cooldown", spell.CD.Duration, spell.CD.ReadyAt())
	}
	if spell.Cast(sim, &resto.Unit) {
		t.Fatal("Mindtap ignored cooldown")
	}
	kfcShamanMeasure("ITEMS_MINDTAP_TICKS", map[string]interface{}{"gain": metrics.Gain, "actual": metrics.ActualGainForCurrentIteration(), "cooldown": spell.CD.ReadyAt().Seconds()})
}

func TestKFCShamanItemsMindtapPenaltyClampsAndExpiryDoesNotGiftMana(t *testing.T) {
	sim, resto, _ := kfcShamanItemsFixture(t, 18371)
	defer sim.Cleanup()
	intellect, maximum := resto.GetStat(stats.Intellect), resto.MaxMana()
	if !resto.GetSpell(core.ActionID{SpellID: 1302205}).Cast(sim, &resto.Unit) {
		t.Fatal("Mindtap activation failed")
	}
	kfcShamanNear(t, resto.GetStat(stats.Intellect), intellect-60)
	if resto.MaxMana() >= maximum {
		t.Fatal("Penalty did not reduce capacity")
	}
	kfcShamanNear(t, resto.CurrentMana(), resto.MaxMana())
	penalty := resto.GetAura("Shaman Tapped Mind")
	if penalty == nil || penalty.Duration != 120*time.Second {
		t.Fatal("Wrong penalty duration")
	}
	before := resto.CurrentMana()
	penalty.Deactivate(sim)
	kfcShamanNear(t, resto.GetStat(stats.Intellect), intellect)
	kfcShamanNear(t, resto.MaxMana(), maximum)
	kfcShamanNear(t, resto.CurrentMana(), before)
	kfcShamanMeasure("ITEMS_MINDTAP_CAP", map[string]interface{}{"intellectLoss": 60, "capacityLoss": maximum - before, "manaAfterManualExpiry": resto.CurrentMana()})
	other, owner, _ := kfcShamanItemsFixture(t, 18371)
	defer other.Cleanup()
	oldInt := owner.GetStat(stats.Intellect)
	if !owner.GetSpell(core.ActionID{SpellID: 1302205}).Cast(other, &owner.Unit) {
		t.Fatal("Timed penalty activation failed")
	}
	kfcShamanAdvance(t, other, 120*time.Second-time.Millisecond)
	kfcShamanNear(t, owner.GetStat(stats.Intellect), oldInt-60)
	kfcShamanAdvance(t, other, 120*time.Second)
	kfcShamanNear(t, owner.GetStat(stats.Intellect), oldInt)
}

func TestKFCShamanItemsMindtapRejectsInsufficientIntellect(t *testing.T) {
	sim, resto, _ := kfcShamanItemsFixture(t, 18371)
	defer sim.Cleanup()
	resto.AddStatDynamic(sim, stats.Intellect, 59-resto.GetStat(stats.Intellect))
	if resto.GetSpell(core.ActionID{SpellID: 1302205}).Cast(sim, &resto.Unit) {
		t.Fatal("Mindtap allowed insufficient intellect")
	}
	if resto.GetAura("Shaman Tapped Mind").IsActive() {
		t.Fatal("Rejected item applied penalty")
	}
	resto.AddStatDynamic(sim, stats.Intellect, 1)
	if !resto.GetSpell(core.ActionID{SpellID: 1302205}).Cast(sim, &resto.Unit) {
		t.Fatal("Mindtap rejected the exact sixty-intellect boundary")
	}
	kfcShamanMeasure("ITEMS_MINDTAP_LOW_INT", true)
}

func TestKFCShamanItemsSecondWindExactTicksAndCooldown(t *testing.T) {
	sim, resto, _ := kfcShamanItemsFixture(t, 11819)
	defer sim.Cleanup()
	resto.SpendMana(sim, 2000, resto.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 984}))
	spell := resto.GetSpell(core.ActionID{SpellID: 15604})
	if spell == nil || !spell.Cast(sim, &resto.Unit) {
		t.Fatal("Second Wind use failed")
	}
	metrics := resto.kfcHealingItems.secondWindMana
	if metrics == nil {
		t.Fatal("Missing Second Wind mana ledger")
	}
	kfcShamanAdvance(t, sim, 999*time.Millisecond)
	kfcShamanNear(t, metrics.Gain, 0)
	kfcShamanAdvance(t, sim, time.Second)
	kfcShamanNear(t, metrics.Gain, 63)
	kfcShamanAdvance(t, sim, 10*time.Second)
	kfcShamanNear(t, metrics.Gain, 630)
	kfcShamanNear(t, metrics.ActualGainForCurrentIteration(), 630)
	kfcShamanAdvance(t, sim, 11*time.Second)
	kfcShamanNear(t, metrics.Gain, 630)
	if spell.CD.Duration != 900*time.Second || spell.CD.ReadyAt() != 900*time.Second {
		t.Fatal("Wrong Second Wind cooldown")
	}
	kfcShamanMeasure("ITEMS_SECOND_WIND", map[string]interface{}{"gain": metrics.Gain, "actual": metrics.ActualGainForCurrentIteration()})
}

func TestKFCShamanItemsManaTrinketsShareTheTenSecondCategory(t *testing.T) {
	for _, firstID := range []int32{1302205, 15604} {
		sim, resto, _ := kfcShamanItemsFixture(t, 18371, 11819)
		first := resto.GetSpell(core.ActionID{SpellID: firstID})
		secondID := int32(15604)
		if firstID == 15604 {
			secondID = 1302205
		}
		second := resto.GetSpell(core.ActionID{SpellID: secondID})
		if first.SharedCD.Timer == nil || first.SharedCD.Timer != second.SharedCD.Timer || first.SharedCD.Duration != 10*time.Second {
			t.Fatal("Wrong mana item category")
		}
		if !first.Cast(sim, &resto.Unit) || second.Cast(sim, &resto.Unit) {
			t.Fatal("Shared category failed at activation")
		}
		kfcShamanAdvance(t, sim, 10*time.Second-time.Millisecond)
		if second.Cast(sim, &resto.Unit) {
			t.Fatal("Shared category expired early")
		}
		kfcShamanAdvance(t, sim, 10*time.Second)
		if !second.Cast(sim, &resto.Unit) {
			t.Fatal("Shared category failed to recover")
		}
		kfcShamanMeasure("ITEMS_MANA_SHARED", firstID)
		sim.Cleanup()
	}
}

func TestKFCShamanItemsManaCapDeathAndStaleTicks(t *testing.T) {
	for _, id := range []int32{18371, 11819} {
		sim, resto, _ := kfcShamanItemsFixture(t, id)
		spellID := int32(1302205)
		if id == 11819 {
			spellID = 15604
		}
		if !resto.GetSpell(core.ActionID{SpellID: spellID}).Cast(sim, &resto.Unit) {
			t.Fatal("Use failed")
		}
		metrics := resto.kfcHealingItems.mindtapMana
		if id == 11819 {
			metrics = resto.kfcHealingItems.secondWindMana
		}
		kfcShamanAdvance(t, sim, time.Second)
		if metrics.Gain <= 0 {
			t.Fatal("Missing positive tick")
		}
		kfcShamanNear(t, metrics.ActualGainForCurrentIteration(), 0)
		before := metrics.Gain
		resto.RemoveHealth(sim, resto.CurrentHealth())
		kfcShamanAdvance(t, sim, 10*time.Second)
		kfcShamanNear(t, metrics.Gain, before)
		kfcShamanMeasure("ITEMS_MANA_DEATH", map[string]interface{}{"id": id, "gain": metrics.Gain})
		sim.Cleanup()
		fresh, owner, _ := kfcShamanItemsFixture(t, id)
		owner.SpendMana(fresh, 2000, owner.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 985}))
		if !owner.GetSpell(core.ActionID{SpellID: spellID}).Cast(fresh, &owner.Unit) {
			t.Fatal("Stale-tick probe failed")
		}
		ledger := owner.kfcHealingItems.mindtapMana
		if id == 11819 {
			ledger = owner.kfcHealingItems.secondWindMana
		}
		aura := owner.GetAura("KFC Shaman healing-item lifecycle")
		aura.OnReset(aura, fresh)
		kfcShamanAdvance(t, fresh, 10*time.Second)
		kfcShamanNear(t, ledger.Gain, 0)
		kfcShamanMeasure("ITEMS_MANA_STALE", id)
		fresh.Cleanup()
	}
}

func TestKFCShamanItemsSerenitySpiritDurationAndIndependentCategory(t *testing.T) {
	sim, resto, _ := kfcShamanItemsFixture(t, 272439, 18371)
	defer sim.Cleanup()
	serenity, mindtap := resto.GetSpell(core.ActionID{ItemID: 272439}), resto.GetSpell(core.ActionID{SpellID: 1302205})
	if serenity == nil || serenity.SharedCD.Timer == nil || serenity.SharedCD.Duration != 15*time.Second || serenity.SharedCD.Timer == mindtap.SharedCD.Timer {
		t.Fatal("Wrong Serenity category")
	}
	spirit := resto.GetStat(stats.Spirit)
	if !serenity.Cast(sim, &resto.Unit) || !mindtap.Cast(sim, &resto.Unit) {
		t.Fatal("Independent categories blocked one another")
	}
	kfcShamanNear(t, resto.GetStat(stats.Spirit), spirit+72)
	kfcShamanAdvance(t, sim, 15*time.Second-time.Millisecond)
	kfcShamanNear(t, resto.GetStat(stats.Spirit), spirit+72)
	kfcShamanAdvance(t, sim, 15*time.Second)
	kfcShamanNear(t, resto.GetStat(stats.Spirit), spirit)
	if serenity.CD.Duration != 90*time.Second || serenity.CD.ReadyAt() != 90*time.Second {
		t.Fatal("Wrong Serenity cooldown")
	}
	kfcShamanMeasure("ITEMS_SERENITY", map[string]interface{}{"spirit": 72, "duration": 15, "cooldown": 90})
}

func TestKFCShamanItemsUsesDoNotTriggerHeartOrWaterShield(t *testing.T) {
	for _, id := range []int32{18371, 11819, 272439} {
		sim, resto, _ := kfcShamanItemsFixture(t, 249473, id)
		if err := resto.ConfigureKFCShamanHealingItemEffects(sim, kfcShamanItemPolicy(1, "completed-casts")); err != nil {
			t.Fatal(err)
		}
		resto.AddStatDynamic(sim, stats.SpellCrit, 100)
		if !resto.WaterShield.Cast(sim, &resto.Unit) {
			t.Fatal("Shield cast failed")
		}
		kfcShamanAdvance(t, sim, 1500*time.Millisecond)
		if resto.GetAura("Shaman Eternal Power").IsActive() {
			t.Fatal("Water Shield triggered Heart")
		}
		var use *core.Spell
		if id == 272439 {
			use = resto.GetSpell(core.ActionID{ItemID: id})
		} else {
			spellID := int32(1302205)
			if id == 11819 {
				spellID = 15604
			}
			use = resto.GetSpell(core.ActionID{SpellID: spellID})
		}
		if !use.Cast(sim, &resto.Unit) {
			t.Fatal("Item use failed", id)
		}
		if resto.GetAura("Shaman Eternal Power").IsActive() {
			t.Fatal("Item use triggered Heart", id)
		}
		kfcShamanAdvance(t, sim, 12*time.Second)
		kfcShamanNear(t, resto.kfcActives.shieldMetrics.ActualGainForCurrentIteration(), 0)
		kfcShamanMeasure("ITEMS_NO_CLASS_PROC", id)
		sim.Cleanup()
	}
}

func TestKFCShamanItemsNoImplicitUseAndResetRestoresState(t *testing.T) {
	sim, resto, _ := kfcShamanItemsFixture(t, 18371, 11819)
	defer sim.Cleanup()
	kfcShamanAdvance(t, sim, 10*time.Second)
	kfcShamanNear(t, resto.kfcHealingItems.mindtapMana.Gain, 0)
	kfcShamanNear(t, resto.kfcHealingItems.secondWindMana.Gain, 0)
	if resto.GetAura("Shaman Tapped Mind").IsActive() {
		t.Fatal("Implicit mana item activation")
	}
	sim.Cleanup()
	sim.Reset()
	intellect := resto.GetStat(stats.Intellect)
	if !resto.GetSpell(core.ActionID{SpellID: 1302205}).Cast(sim, &resto.Unit) {
		t.Fatal("Item activation after reset failed")
	}
	kfcShamanAdvance(t, sim, 5*time.Second)
	if resto.kfcHealingItems.mindtapMana.Gain <= 0 {
		t.Fatal("Missing actual pre-reset resource events")
	}
	sim.Cleanup()
	sim.Reset()
	kfcShamanNear(t, resto.GetStat(stats.Intellect), intellect)
	if resto.GetAura("Shaman Tapped Mind").IsActive() {
		t.Fatal("Penalty survived reset")
	}
	ledger := resto.kfcHealingItems.mindtapMana
	lifetimeGain := ledger.Gain
	kfcShamanNear(t, ledger.ActualGainForCurrentIteration(), 0)
	if ledger.EventsForCurrentIteration() != 0 {
		t.Fatal("Previous mana events leaked into the new iteration")
	}
	kfcShamanAdvance(t, sim, 10*time.Second)
	kfcShamanNear(t, ledger.Gain, lifetimeGain)
	kfcShamanNear(t, ledger.ActualGainForCurrentIteration(), 0)
	resto.SpendMana(sim, 2000, resto.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 986}))
	if !resto.GetSpell(core.ActionID{SpellID: 1302205}).Cast(sim, &resto.Unit) {
		t.Fatal("Fresh iteration could not reactivate Mindtap")
	}
	kfcShamanAdvance(t, sim, 11*time.Second)
	if ledger.ActualGainForCurrentIteration() <= 0 {
		t.Fatal("No useful mana after explicit reactivation")
	}
	kfcShamanMeasure("ITEMS_RESET", true)
}
