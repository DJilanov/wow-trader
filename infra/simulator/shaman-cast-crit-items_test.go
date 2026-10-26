package restoration

import (
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/stats"
)

func TestKFCShamanCastCritOwnershipAndExplicitUse(t *testing.T) {
	for _, id := range []int32{0, 19288, 272438} {
		ids := []int32{}
		if id != 0 {
			ids = append(ids, id)
		}
		sim, resto, _ := kfcShamanItemsFixture(t, ids...)
		dragon, analyzer := resto.GetAura("Aura of the Blue Dragon"), resto.GetAura("ItemActive-272438")
		if (dragon != nil) != (id == 19288) || (analyzer != nil) != (id == 272438) {
			t.Fatal("Wrong shared item owner", id)
		}
		if dragon != nil && dragon.IsActive() || analyzer != nil && analyzer.IsActive() {
			t.Fatal("Implicit item activation", id)
		}
		if id == 272438 {
			use := resto.GetSpell(core.ActionID{ItemID: id})
			base := resto.GetStat(stats.SpellCrit)
			if use == nil || !use.Cast(sim, &resto.Unit) {
				t.Fatal("Explicit owned Analyzer use failed")
			}
			kfcShamanNear(t, resto.GetStat(stats.SpellCrit)-base, 5)
			if use.CD.ReadyAt() != 90*time.Second || use.SharedCD.ReadyAt() != 20*time.Second {
				t.Fatal("Wrong Analyzer cooldowns")
			}
		}
		sim.Cleanup()
	}
	kfcShamanMeasure("CAST_CRIT_OWNERSHIP", 3)
}

func TestKFCShamanCastCritBlueDragonSeededCompletedCastChance(t *testing.T) {
	sim, resto, _ := kfcShamanItemsFixture(t, 19288)
	oracle, _, _ := kfcShamanItemsFixture(t)
	defer sim.Cleanup()
	defer oracle.Cleanup()
	trigger, aura := resto.GetAura("Aura of the Blue Dragon Trigger"), resto.GetAura("Aura of the Blue Dragon")
	if trigger == nil || trigger.OnCastComplete == nil || aura == nil {
		t.Fatal("Real Blue Dragon registration missing")
	}
	base := resto.GetStat(stats.Spirit)
	castingRate := resto.PseudoStats.SpiritRegenRateCasting
	bonus := resto.ApplyStatDependencies(stats.Stats{stats.Spirit: 150})[stats.Spirit]
	count := 0
	for index := 0; index < 1000; index++ {
		trigger.OnCastComplete(trigger, sim, resto.GetSpell(core.ActionID{SpellID: 331}))
		want := oracle.Proc(.02, "Aura of the Blue Dragon Trigger")
		if aura.IsActive() != want {
			t.Fatal("Blue Dragon differs from seeded oracle", index)
		}
		if want {
			count++
			kfcShamanNear(t, resto.GetStat(stats.Spirit)-base, bonus)
		}
		kfcShamanNear(t, resto.PseudoStats.SpiritRegenRateCasting, castingRate)
		aura.Deactivate(sim)
		kfcShamanNear(t, resto.GetStat(stats.Spirit), base)
	}
	kfcShamanMeasure("CAST_CRIT_BLUE_DRAGON_RATE", []float64{float64(count), bonus, castingRate})
}

func TestKFCShamanCastCritBlueDragonActualCastsRefreshExpiryAndReset(t *testing.T) {
	sim, resto, target := kfcShamanItemsFixture(t, 19288)
	defer sim.Cleanup()
	aura := resto.GetAura("Aura of the Blue Dragon")
	base := resto.GetStat(stats.Spirit)
	bonus := resto.ApplyStatDependencies(stats.Stats{stats.Spirit: 150})[stats.Spirit]
	spell := resto.GetSpell(core.ActionID{SpellID: 331})
	casts, procs := 0, 0
	for casts < 320 && procs < 2 {
		expires := aura.ExpiresAt()
		if !spell.Cast(sim, target) {
			t.Fatal("Actual Shaman healing cast failed", casts)
		}
		casts++
		kfcShamanAdvance(t, sim, sim.CurrentTime+spell.DefaultCast.CastTime)
		if aura.IsActive() {
			kfcShamanNear(t, resto.GetStat(stats.Spirit)-base, bonus)
			if aura.ExpiresAt() > expires {
				procs++
			}
		}
	}
	if procs < 2 {
		t.Fatal("Fixed-seed completed casts did not produce two actual procs")
	}
	if aura.Duration != 15*time.Second {
		t.Fatal("Wrong Blue Dragon duration")
	}
	kfcShamanAdvance(t, sim, aura.ExpiresAt())
	if aura.IsActive() {
		t.Fatal("Blue Dragon did not expire")
	}
	kfcShamanNear(t, resto.GetStat(stats.Spirit), base)
	sim.Cleanup()
	sim.Reset()
	if aura.IsActive() {
		t.Fatal("Blue Dragon survived reset")
	}
	kfcShamanNear(t, resto.GetStat(stats.Spirit), base)
	kfcShamanMeasure("CAST_CRIT_BLUE_DRAGON_ACTUAL", []float64{float64(casts), float64(procs), bonus})
}

func TestKFCShamanCastCritBlueDragonIgnoresHealRecipientsAndPeriodicTicks(t *testing.T) {
	sim, resto, target := kfcShamanItemsFixture(t, 19288)
	defer sim.Cleanup()
	spell := resto.GetSpell(core.ActionID{SpellID: 10623})
	for n := 0; n < 1000; n++ {
		spell.CalcAndDealHealing(sim, target, 1, spell.OutcomeHealing)
		spell.CalcAndDealPeriodicHealing(sim, target, 1, spell.OutcomeHealing)
	}
	if resto.GetAura("Aura of the Blue Dragon").IsActive() {
		t.Fatal("Recipients or periodic ticks counted as completed casts")
	}
	kfcShamanMeasure("CAST_CRIT_BLUE_DRAGON_NO_CAST", 2000)
}

func TestKFCShamanCastCritAnalyzerDirectCriticalHealingFamilies(t *testing.T) {
	for _, family := range []string{"healing-wave", "lesser-healing-wave", "chain-heal", "riptide"} {
		sim, resto, target := kfcShamanItemsFixture(t, 272438)
		var spell *core.Spell
		for _, candidate := range resto.Spellbook {
			if candidate.ActionID.Tag == 0 && kfcShamanWorkloadFamily(candidate.ActionID.SpellID) == family {
				spell = candidate
				break
			}
		}
		if spell == nil {
			t.Fatal("Missing actual healing family", family)
		}
		aura := resto.GetAura("ItemActive-272438")
		use := resto.GetSpell(core.ActionID{ItemID: 272438})
		base := resto.GetStat(stats.SpellCrit)
		if !use.Cast(sim, &resto.Unit) {
			t.Fatal("Analyzer use failed")
		}
		spell.BonusCritRating = -10000
		if !spell.Cast(sim, target) {
			t.Fatal("Noncritical family cast failed", family)
		}
		kfcShamanAdvance(t, sim, max(resto.GCD.ReadyAt(), sim.CurrentTime+spell.DefaultCast.CastTime))
		if !aura.IsActive() {
			t.Fatal("Noncritical family heal consumed Analyzer", family)
		}
		if spell.CD.Timer != nil && spell.CD.ReadyAt() > sim.CurrentTime {
			kfcShamanAdvance(t, sim, spell.CD.ReadyAt())
		}
		spell.BonusCritRating = 10000
		if !spell.Cast(sim, target) {
			t.Fatal("Critical family cast failed", family)
		}
		if spell.DefaultCast.CastTime > 0 {
			kfcShamanAdvance(t, sim, sim.CurrentTime+spell.DefaultCast.CastTime)
		}
		if aura.IsActive() {
			t.Fatal("Direct family crit did not consume Analyzer", family)
		}
		kfcShamanNear(t, resto.GetStat(stats.SpellCrit), base)
		if use.CanCast(sim, &resto.Unit) {
			t.Fatal("Consumption reset the item cooldown")
		}
		kfcShamanMeasure("CAST_CRIT_ANALYZER_FAMILY", family)
		sim.Cleanup()
	}
}

func TestKFCShamanCastCritAnalyzerPeriodicCriticalRegression(t *testing.T) {
	sim, resto, target := kfcShamanItemsFixture(t, 272438)
	defer sim.Cleanup()
	if !resto.GetSpell(core.ActionID{ItemID: 272438}).Cast(sim, &resto.Unit) {
		t.Fatal("Analyzer use failed")
	}
	spell := resto.GetSpell(core.ActionID{SpellID: 331})
	spell.CalcAndDealPeriodicHealing(sim, target, 1, func(_ *core.Simulation, result *core.SpellResult, _ *core.AttackTable) {
		if result.DirectDamageOrHealing {
			t.Fatal("Periodic helper lost its semantic boundary")
		}
		result.Outcome = core.OutcomeCrit
	})
	if !resto.GetAura("ItemActive-272438").IsActive() {
		t.Fatal("Periodic critical healing consumed Analyzer")
	}
	kfcShamanMeasure("CAST_CRIT_ANALYZER_PERIODIC_RETAINED", true)
}

func TestKFCShamanCastCritAnalyzerSharedCategoryExpiryAndReset(t *testing.T) {
	for _, analyzerFirst := range []bool{false, true} {
		sim, resto, _ := kfcShamanItemsFixture(t, 272438, 272439)
		first, second := resto.GetSpell(core.ActionID{ItemID: 272439}), resto.GetSpell(core.ActionID{ItemID: 272438})
		lock := 15 * time.Second
		if analyzerFirst {
			first, second, lock = second, first, 20*time.Second
		}
		if first.SharedCD.Timer != second.SharedCD.Timer {
			t.Fatal("Analyzer/Serenity use different shared categories")
		}
		if !first.Cast(sim, &resto.Unit) || second.CanCast(sim, &resto.Unit) {
			t.Fatal("Shared category failed to lock")
		}
		secondReady := second.CD.ReadyAt()
		kfcShamanAdvance(t, sim, lock-time.Millisecond)
		if second.CanCast(sim, &resto.Unit) || second.CD.ReadyAt() != secondReady {
			t.Fatal("Shared item unlocked early or consumed its personal cooldown")
		}
		if analyzerFirst && !resto.GetAura("ItemActive-272438").IsActive() {
			t.Fatal("Analyzer expired before its own twenty-second boundary")
		}
		kfcShamanAdvance(t, sim, lock)
		if !second.Cast(sim, &resto.Unit) {
			t.Fatal("Shared category failed to unlock at source boundary")
		}
		aura := resto.GetAura("ItemActive-272438")
		if !analyzerFirst {
			kfcShamanAdvance(t, sim, aura.ExpiresAt()-time.Millisecond)
			if !aura.IsActive() {
				t.Fatal("Analyzer expired early")
			}
			kfcShamanAdvance(t, sim, aura.ExpiresAt())
		}
		if aura.IsActive() {
			t.Fatal("Analyzer did not expire")
		}
		sim.Cleanup()
		sim.Reset()
		if aura.IsActive() || !first.IsReady(sim) || !second.IsReady(sim) {
			t.Fatal("Analyzer aura/cooldowns leaked across reset")
		}
		kfcShamanMeasure("CAST_CRIT_ANALYZER_SHARED", lock.Seconds())
		sim.Cleanup()
	}
}

func TestKFCShamanCastCritHelpfulCastsDoNotTriggerOffensiveItems(t *testing.T) {
	sim, resto, target := kfcShamanItemsFixture(t, 22268)
	defer sim.Cleanup()
	aura := resto.GetAura("Draconic Infusion")
	if aura == nil {
		t.Fatal("Offensive item control is not equipped")
	}
	for _, rank := range kfcShamanHealingRanks {
		spell := resto.GetSpell(core.ActionID{SpellID: rank.ID})
		if !spell.Cast(sim, target) {
			t.Fatal("Helpful rank cast failed", rank.ID)
		}
		kfcShamanAdvance(t, sim, max(resto.GCD.ReadyAt(), sim.CurrentTime+spell.DefaultCast.CastTime))
		if aura.IsActive() {
			t.Fatal("Helpful healing triggered harmful-only Emblem", rank.ID)
		}
	}
	kfcShamanMeasure("CAST_CRIT_HELPFUL_OFFENSIVE_EXCLUSION", len(kfcShamanHealingRanks))
}
