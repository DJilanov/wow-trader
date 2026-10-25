package holy

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/stats"
	"google.golang.org/protobuf/encoding/protojson"
)

func TestKFCPaladinBlueDragonActualCastsRefreshExpiryAndReset(t *testing.T) {
	sim, healer := kfcPaladinResourceItemFixture(t, 19288)
	aura := healer.GetAura("Aura of the Blue Dragon")
	if aura == nil || aura.IsActive() || aura.Duration != 15*time.Second {
		t.Fatal("Blue Dragon ownership, duration or initial state changed")
	}
	base := healer.GetStat(stats.Spirit)
	spell := healer.GetSpell(core.ActionID{SpellID: 635})
	target := &sim.Raid.GetFirstTargetDummy().Unit
	procs, casts := 0, 0
	for casts < 320 && procs < 2 {
		before := aura.ExpiresAt()
		if !spell.Cast(sim, target) {
			t.Fatal("Actual Blue Dragon healing cast failed")
		}
		casts++
		kfcPaladinAdvance(t, sim, sim.CurrentTime+spell.DefaultCast.CastTime)
		if aura.IsActive() {
			kfcPaladinNear(t, healer.GetStat(stats.Spirit)-base, 150)
			if aura.ExpiresAt() > before {
				procs++
			}
		}
	}
	if procs < 2 {
		t.Fatal("The fixed-seed real healing casts did not trigger Blue Dragon twice")
	}
	kfcPaladinAdvance(t, sim, aura.ExpiresAt())
	if aura.IsActive() {
		t.Fatal("Blue Dragon failed to expire")
	}
	kfcPaladinNear(t, healer.GetStat(stats.Spirit), base)
	sim.Cleanup()
	sim.Reset()
	if aura.IsActive() {
		t.Fatal("Blue Dragon aura leaked into a new iteration")
	}
	kfcPaladinNear(t, healer.GetStat(stats.Spirit), base)
	kfcPaladinHeartMeasure("BLUE_DRAGON_ACTUAL_CASTS", []float64{float64(casts), float64(procs), 150})
}

func TestKFCPaladinBlueDragonNoCastOrUnownedProc(t *testing.T) {
	_, unowned := kfcPaladinResourceItemFixture(t)
	if unowned.GetAura("Aura of the Blue Dragon") != nil {
		t.Fatal("Unowned Blue Dragon registered an aura")
	}
	sim, healer := kfcPaladinResourceItemFixture(t, 19288)
	spell := healer.GetSpell(core.ActionID{SpellID: 635})
	target := &sim.Raid.GetFirstTargetDummy().Unit
	for index := 0; index < 1000; index++ {
		spell.CalcAndDealPeriodicHealing(sim, target, 1, spell.OutcomeHealing)
	}
	if healer.GetAura("Aura of the Blue Dragon").IsActive() {
		t.Fatal("Periodic healing without a completed cast triggered Blue Dragon")
	}
}

func TestKFCPaladinAnalyzerOwnedAdmissionAndDirectHealingCrit(t *testing.T) {
	for _, owned := range []bool{false, true} {
		var ids []int32
		if owned {
			ids = []int32{272438}
		}
		sim, healer := kfcPaladinResourceItemFixture(t, ids...)
		policy := []KFCPaladinHealingCooldown{{ItemID: 272438, RequireHealingDemand: true}}
		if (healer.validateKFCPaladinHealingCooldowns(policy) == nil) != owned {
			t.Fatal("Analyzer explicit use lost its ownership boundary")
		}
		if !owned {
			continue
		}
		aura := healer.GetAura("ItemActive-272438")
		use := healer.GetSpell(core.ActionID{ItemID: 272438})
		base := healer.GetStat(stats.SpellCrit)
		if aura == nil || aura.IsActive() || !use.Cast(sim, &healer.Unit) {
			t.Fatal("Owned Analyzer failed to activate explicitly")
		}
		kfcPaladinNear(t, healer.GetStat(stats.SpellCrit)-base, 5)
		if use.CD.ReadyAt() != 90*time.Second || use.SharedCD.ReadyAt() != 20*time.Second {
			t.Fatal("Analyzer personal/shared cooldown changed")
		}
		spell := healer.GetSpell(core.ActionID{SpellID: 635})
		target := &sim.Raid.GetFirstTargetDummy().Unit
		spell.BonusCritRating = -10000
		if !spell.Cast(sim, target) {
			t.Fatal("Noncritical Analyzer heal failed")
		}
		kfcPaladinAdvance(t, sim, spell.DefaultCast.CastTime)
		if !aura.IsActive() {
			t.Fatal("A noncritical heal consumed Analyzer")
		}
		spell.BonusCritRating = 10000
		if !spell.Cast(sim, target) {
			t.Fatal("Critical Analyzer heal failed")
		}
		kfcPaladinAdvance(t, sim, sim.CurrentTime+spell.DefaultCast.CastTime)
		if aura.IsActive() {
			t.Fatal("A direct healing crit did not consume Analyzer")
		}
		kfcPaladinNear(t, healer.GetStat(stats.SpellCrit), base)
		if use.CanCast(sim, &healer.Unit) {
			t.Fatal("Early consumption reset Analyzer cooldown")
		}
		kfcPaladinHeartMeasure("ANALYZER_DIRECT", []float64{5, use.CD.ReadyAt().Seconds(), use.SharedCD.ReadyAt().Seconds()})
	}
}

// This helper dispatches through OnHealDealt even though its result is periodic.
func TestKFCPaladinAnalyzerPeriodicCriticalRegression(t *testing.T) {
	sim, healer := kfcPaladinResourceItemFixture(t, 272438)
	use := healer.GetSpell(core.ActionID{ItemID: 272438})
	if !use.Cast(sim, &healer.Unit) {
		t.Fatal("Analyzer regression use failed")
	}
	spell := healer.GetSpell(core.ActionID{SpellID: 635})
	spell.CalcAndDealPeriodicHealing(sim, &sim.Raid.GetFirstTargetDummy().Unit, 1,
		func(_ *core.Simulation, result *core.SpellResult, _ *core.AttackTable) {
			if result.DirectDamageOrHealing {
				t.Fatal("Periodic helper lost its semantic boundary")
			}
			result.Outcome = core.OutcomeCrit
		})
	if !healer.GetAura("ItemActive-272438").IsActive() {
		t.Fatal("Periodic healing crit consumed the nonperiodic Analyzer charge")
	}
	kfcPaladinHeartMeasure("ANALYZER_PERIODIC_RETAINED", 1)
}

func TestKFCPaladinAnalyzerExpirySharedCategoryAndReset(t *testing.T) {
	for _, firstAnalyzer := range []bool{false, true} {
		sim, healer := kfcPaladinResourceItemFixture(t, 272438, 272439)
		first, second := healer.GetSpell(core.ActionID{ItemID: 272439}), healer.GetSpell(core.ActionID{ItemID: 272438})
		lock := 15 * time.Second
		if firstAnalyzer {
			first, second, lock = second, first, 20*time.Second
		}
		if !first.Cast(sim, &healer.Unit) || second.Cast(sim, &healer.Unit) {
			t.Fatal("Analyzer/Serenity shared category did not lock")
		}
		kfcPaladinAdvance(t, sim, lock)
		if !second.Cast(sim, &healer.Unit) {
			t.Fatal("Analyzer/Serenity did not unlock at the source boundary")
		}
		aura := healer.GetAura("ItemActive-272438")
		kfcPaladinAdvance(t, sim, aura.ExpiresAt())
		if aura.IsActive() {
			t.Fatal("Analyzer duration did not expire")
		}
		sim.Cleanup()
		sim.Reset()
		if aura.IsActive() || !first.IsReady(sim) || !second.IsReady(sim) {
			t.Fatal("Analyzer aura or cooldown leaked into another iteration")
		}
	}
}

func TestKFCPaladinHealingDoesNotTriggerOffensiveItems(t *testing.T) {
	sim, healer := kfcPaladinResourceItemFixture(t, 22268)
	aura := healer.GetAura("Draconic Infusion")
	if aura == nil {
		t.Fatal("Emblem control is not equipped")
	}
	before := healer.GetStat(stats.SpellPower)
	for _, rank := range kfcPaladinHealingRanks {
		spell := healer.GetSpell(core.ActionID{SpellID: rank.ID})
		if !spell.Cast(sim, &sim.Raid.GetFirstTargetDummy().Unit) {
			t.Fatal("Offensive exclusion healing cast failed", rank.ID)
		}
		kfcPaladinAdvance(t, sim, sim.CurrentTime+spell.DefaultCast.CastTime)
		if aura.IsActive() {
			t.Fatal("Helpful Paladin healing triggered harmful-only Emblem", rank.ID)
		}
	}
	kfcPaladinNear(t, healer.GetStat(stats.SpellPower), before)
	if core.HasItemEffect(18321) || healer.GetSpell(core.ActionID{SpellID: 1302191}) != nil {
		t.Fatal("Pure helpful controller unexpectedly acquired an offensive Rod proc")
	}
	kfcPaladinHeartMeasure("HELPFUL_OFFENSIVE_EXCLUSION", len(kfcPaladinHealingRanks))
}

func TestKFCPaladinCastCritActualWorkloadJobs(t *testing.T) {
	for _, pair := range [][2]int32{{19288, 11819}, {272438, 11819}, {272438, 272439}} {
		request, frame := kfcPaladinWorkloadControl()
		request.Encounter.Duration = 180
		request.SimOptions.Iterations = 8
		player := request.Raid.Parties[0].Players[0]
		player.TalentsString = kfcPaladinPassiveString(1, 5)
		player.Equipment = &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
		for index := range player.Equipment.Items {
			player.Equipment.Items[index] = &proto.ItemSpec{}
		}
		player.Equipment.Items[12].Id, player.Equipment.Items[13].Id = pair[0], pair[1]
		frame.Priorities = []KFCPaladinHealingPriority{{SpellID: 635, RaidIndex: 1, MinimumMissingHealth: 200}}
		frame.Damage = nil
		for second := int64(1); second < 180; second++ {
			frame.Damage = append(frame.Damage, KFCPaladinHealingDamageEvent{AtMS: second * 1000, RaidIndex: 1, Amount: 100})
		}
		if pair[0] == 272438 {
			frame.Cooldowns = []KFCPaladinHealingCooldown{{ItemID: 272438, RequireHealingDemand: true}}
		}
		if pair[1] == 272439 {
			frame.Cooldowns = append(frame.Cooldowns, KFCPaladinHealingCooldown{ItemID: 272439, RequireHealingDemand: true})
		}
		payload := kfcPaladinWorkloadPayload(t, request, frame, "paladin-cast-crit-control", true)
		reply := RunKFCPaladinHealingJob(context.Background(), payload)
		if reply.Status != "complete" || reply.Result.SurvivalRate != 1 {
			t.Fatal("Cast/crit actual workload failed", reply)
		}
		if pair[0] == 272438 {
			found := false
			metrics := &proto.RaidMetrics{}
			if err := protojson.Unmarshal(reply.Result.Metrics, metrics); err != nil {
				t.Fatal(err)
			}
			for _, action := range metrics.Parties[0].Players[0].Actions {
				if action.Id.GetItemId() == 272438 {
					for _, target := range action.Targets {
						found = found || target.Casts > 0
					}
				}
			}
			if !found {
				t.Fatal("Analyzer was never used by the actual controller")
			}
		}
		kfcPaladinHeartMeasure("CAST_CRIT_WORKLOAD_REQUEST", json.RawMessage(payload))
		kfcPaladinHeartMeasure("CAST_CRIT_WORKLOAD_RESULT", reply.Result.EffectiveHealingHPS)
	}
}
