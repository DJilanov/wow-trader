package restoration

import (
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
)

func TestKFCDruidHeartOnlyRegisteredHealingTouchFamily(t *testing.T) {
	values := []float64{}
	for _, events := range []string{"completed-casts", "direct-heals"} {
		sim, healer := kfcDruidItemFixture(t, 249473)
		kfcDruidItemConfigure(t, healer, 1, events)
		aura, buff := healer.GetAura("Druid Dormant Heart trigger"), healer.GetAura("Druid Eternal Power")
		count := 0
		for family, spells := range healer.familySpells {
			for _, spell := range spells {
				if events == "completed-casts" {
					aura.OnCastComplete(aura, sim, spell)
				} else {
					result := spell.NewResult(&healer.Unit)
					result.DirectDamageOrHealing = true
					aura.OnHealDealt(aura, sim, spell, result)
					spell.DisposeResult(result)
				}
				if buff.IsActive() != (family == "healing-touch") {
					t.Fatal("Dormant Heart family restriction violated", events, family, spell.ActionID)
				}
				if buff.IsActive() {
					count++
				}
				buff.Deactivate(sim)
			}
		}
		if count != len(healer.familySpells["healing-touch"]) || count == 0 {
			t.Fatal("Missing Healing Touch ranks")
		}
		values = append(values, float64(count))
	}
	kfcDruidAdvancedResult("HEART_FAMILY_RANKS", values)
}

func TestKFCDruidHeartActualOtherHealingDoesNotTriggerOrRefresh(t *testing.T) {
	for _, events := range []string{"completed-casts", "direct-heals"} {
		sim, healer := kfcDruidItemFixture(t, 249473)
		kfcDruidItemConfigure(t, healer, 1, events)
		target := &sim.Raid.GetFirstTargetDummy().Unit
		target.RemoveHealth(sim, 9000)
		buff := healer.GetAura("Druid Eternal Power")
		for _, id := range []int32{774, 8936} {
			spell := healer.GetSpell(core.ActionID{SpellID: id})
			spell.BonusCritRating = -10000
			if !spell.Cast(sim, target) {
				t.Fatal("Other-family actual cast rejected", id)
			}
			kfcDruidAdvance(t, sim, sim.CurrentTime+max(1500*time.Millisecond, spell.DefaultCast.CastTime))
			if buff.IsActive() {
				t.Fatal("Actual Rejuvenation/Regrowth triggered Eternal Power", id)
			}
		}
		spell := healer.GetSpell(core.ActionID{SpellID: 5185})
		spell.BonusCritRating = -10000
		if !spell.Cast(sim, target) {
			t.Fatal("Healing Touch cast rejected")
		}
		kfcDruidAdvance(t, sim, sim.CurrentTime+max(1500*time.Millisecond, spell.DefaultCast.CastTime))
		if !buff.IsActive() {
			t.Fatal("Healing Touch did not trigger Eternal Power")
		}
		expiry := buff.ExpiresAt()
		if !healer.GetSpell(core.ActionID{SpellID: 774}).Cast(sim, target) {
			t.Fatal("Rejuvenation refresh control rejected")
		}
		kfcDruidAdvance(t, sim, sim.CurrentTime+1500*time.Millisecond)
		if buff.ExpiresAt() != expiry {
			t.Fatal("Other-family cast refreshed Eternal Power")
		}
		kfcDruidAdvance(t, sim, expiry)
		if buff.IsActive() {
			t.Fatal("Eternal Power did not expire without a Healing Touch refresh")
		}
	}
}

func TestKFCDruidHeartEveryTouchRankActualCompletion(t *testing.T) {
	_, reference := kfcDruidItemFixture(t, 249473)
	values := []float64{}
	for _, rank := range reference.familySpells["healing-touch"] {
		sim, healer := kfcDruidItemFixture(t, 249473)
		kfcDruidItemConfigure(t, healer, 1, "completed-casts")
		spell := healer.GetSpell(rank.ActionID)
		spell.BonusCritRating = -10000
		target := &sim.Raid.GetFirstTargetDummy().Unit
		target.RemoveHealth(sim, 9000)
		if !spell.Cast(sim, target) {
			t.Fatal("Healing Touch rank cast failed", rank.ActionID)
		}
		buff := healer.GetAura("Druid Eternal Power")
		if buff.IsActive() {
			t.Fatal("Eternal Power procced before cast completion")
		}
		kfcDruidAdvance(t, sim, sim.CurrentTime+spell.DefaultCast.CastTime)
		if !buff.IsActive() {
			t.Fatal("Actual completed Healing Touch rank did not proc", rank.ActionID)
		}
		values = append(values, spell.HealingPower(target))
	}
	kfcDruidAdvancedResult("HEART_FAMILY_ACTUAL", values)
}

func TestKFCDruidHeartRejectsPrecombatBothEventPolicies(t *testing.T) {
	for _, events := range []string{"completed-casts", "direct-heals"} {
		sim, healer := kfcDruidItemFixture(t, 249473)
		kfcDruidItemConfigure(t, healer, 1, events)
		aura, buff := healer.GetAura("Druid Dormant Heart trigger"), healer.GetAura("Druid Eternal Power")
		spell := healer.GetSpell(core.ActionID{SpellID: 5185})
		sim.CurrentTime = -time.Second
		aura.OnCastComplete(aura, sim, spell)
		result := spell.NewResult(&healer.Unit)
		result.DirectDamageOrHealing = true
		aura.OnHealDealt(aura, sim, spell, result)
		spell.DisposeResult(result)
		if buff.IsActive() {
			t.Fatal("Precombat Healing Touch triggered Eternal Power")
		}
		sim.CurrentTime = 0
	}
}
