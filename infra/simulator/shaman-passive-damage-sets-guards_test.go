package restoration

import (
	"testing"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/stats"
)

func TestKFCShamanPassiveDamageGuardIndependentThresholds(t *testing.T) {
	for _, row := range []struct {
		ids                   []int32
		necropile, postmaster bool
	}{
		{ids: []int32{14626, 14629}},
		{ids: []int32{14626, 14629, 14633}, necropile: true},
		{ids: []int32{13388, 13389, 13390}},
		{ids: []int32{13388, 13389, 13390, 13392}, postmaster: true},
		{ids: []int32{14633, 14629, 14631, 13388, 13389, 13390, 13392}, necropile: true, postmaster: true},
	} {
		sim, resto := kfcShamanPassiveDamageFixture(t, row.ids...)
		state := resto.kfcPassiveDamageSets
		if state.necropile != row.necropile || state.postmaster != row.postmaster {
			t.Fatal("actual independent piece threshold failed", row.ids, state.necropile, state.postmaster)
		}
		if (state.drain != nil) != row.necropile || (state.reflection != nil) != row.postmaster {
			t.Fatal("threshold leaked a runtime effect", row.ids)
		}
		sim.Cleanup()
	}
	kfcShamanMeasure("PASSIVE_DAMAGE_GUARD_THRESHOLDS", 5)
}

func TestKFCShamanPassiveDamageGuardRejectsForeignSelfWrongFamilyAndHelpful(t *testing.T) {
	chance := 1.0
	sim, resto := kfcShamanPassiveDamageFixture(t, 14626, 14629, 14633, 272437)
	defer sim.Cleanup()
	kfcShamanPassiveDamageConfigure(t, sim, resto, &chance)
	kfcShamanProtectiveConfigure(t, sim, resto, kfcShamanProtectiveTestPolicy(resto.kfcProtectiveItems.owned))
	self := &resto.Unit
	enemy := resto.Env.Encounter.TargetUnits[0]
	for index, row := range []struct {
		owner, target *core.Unit
		id            core.ActionID
		mask          core.ProcMask
	}{
		{enemy, self, core.ActionID{SpellID: 1291099}, core.ProcMaskSpellDamageProc},
		{self, self, core.ActionID{SpellID: 1291099}, core.ProcMaskSpellDamageProc},
		{self, enemy, core.ActionID{SpellID: 1291099, Tag: 1902}, core.ProcMaskSpellDamageProc},
		{self, enemy, core.ActionID{SpellID: 16666, Tag: 1902}, core.ProcMaskSpellDamageProc},
		{self, enemy, core.ActionID{SpellID: 1291099, Tag: 1903}, core.ProcMaskSpellHealing},
	} {
		spell := row.owner.GetOrRegisterSpell(core.SpellConfig{ActionID: row.id, SpellSchool: core.SpellSchoolNature, ProcMask: row.mask, Flags: core.SpellFlagPassiveSpell | core.SpellFlagNoOnCastComplete, DamageMultiplier: 1})
		result := spell.NewResult(row.target)
		result.Damage = 1
		result.Outcome = core.OutcomeHit
		spell.DealDamage(sim, result)
		if resto.kfcPassiveDamageSets.opportunities != 0 || resto.kfcPassiveDamageSets.procs != 0 {
			t.Fatal("ineligible event generated a drain", index)
		}
	}
	spell := resto.GetSpell(core.ActionID{SpellID: 8004})
	target := resto.kfcHealingPlayers()[1]
	target.RemoveHealth(sim, 1000)
	if !spell.Cast(sim, target) {
		t.Fatal("actual helpful cast rejected", "targetValid", resto.kfcValidHealingTarget(target), "casterHealth", resto.CurrentHealth(), "targetHealth", target.CurrentHealth(), "mana", resto.CurrentMana(), "gcd", resto.GCD.ReadyAt(), "time", sim.CurrentTime)
	}
	kfcShamanAdvance(t, sim, spell.DefaultCast.CastTime)
	if resto.kfcPassiveDamageSets.opportunities != 0 || resto.kfcPassiveDamageSets.procs != 0 {
		t.Fatal("helpful spell generated a drain")
	}
	kfcShamanMeasure("PASSIVE_DAMAGE_GUARD_EVENTS", 6)
}

func TestKFCShamanPassiveDamageGuardHealingEqualsActualDamageAndUsedTimerResets(t *testing.T) {
	chance := 1.0
	sim, resto := kfcShamanPassiveDamageFixture(t, 14626, 14629, 14633, 272437)
	defer sim.Cleanup()
	kfcShamanPassiveDamageConfigure(t, sim, resto, &chance)
	resto.AddStatDynamic(sim, stats.HealingPower, 10000)
	resto.RemoveHealth(sim, 2000)
	before := resto.CurrentHealth()
	kfcShamanPassiveDamageExplosion(t, sim, resto)
	state := resto.kfcPassiveDamageSets
	enemy := resto.Env.Encounter.TargetUnits[0]
	damage := state.drain.SpellMetrics[enemy.UnitIndex].TotalDamage
	if damage <= 0 || damage > 28 || state.procs != 1 {
		t.Fatal("source drain damage outside reference", damage, state.procs)
	}
	kfcShamanNear(t, resto.CurrentHealth()-before, damage)
	kfcShamanNear(t, state.usefulHealing, damage)
	if state.drainCD.IsReady(sim) {
		t.Fatal("used drain timer did not start")
	}
	sim.Cleanup()
	sim.Reset()
	if !state.drainCD.IsReady(sim) || state.procs != 0 || state.opportunities != 0 || state.usefulHealing != 0 || state.policy == nil {
		t.Fatal("used timer/reset or owned policy state leaked")
	}
	kfcShamanMeasure("PASSIVE_DAMAGE_GUARD_EXACT_LEECH", damage)
}

func TestKFCShamanPassiveDamageGuardRejectsUnownedAdaptiveAndLatePolicy(t *testing.T) {
	chance := 1.0
	sim, resto := kfcShamanPassiveDamageFixture(t, 14626, 14629, 14633)
	defer sim.Cleanup()
	if resto.ConfigureKFCShamanPassiveDamageSets(sim, kfcShamanPassiveDamagePolicy(resto, &chance)) == nil {
		t.Fatal("unowned Adaptive routing accepted")
	}
	spell := resto.GetSpell(core.ActionID{SpellID: 8004})
	target := resto.kfcHealingPlayers()[1]
	target.RemoveHealth(sim, 1000)
	if !spell.Cast(sim, target) {
		t.Fatal("helpful cast rejected")
	}
	if resto.ConfigureKFCShamanPassiveDamageSets(sim, kfcShamanPassiveDamagePolicy(resto, nil)) == nil {
		t.Fatal("late policy accepted after casting")
	}
	kfcShamanMeasure("PASSIVE_DAMAGE_GUARD_UNOWNED_LATE", 2)
}
