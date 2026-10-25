package restoration

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
	"github.com/wowsims/classic/sim/druid"
)

func kfcDruidIdolFixture(t *testing.T, id int32, ownsSwift bool) (*core.Simulation, *RestorationDruid, *RestorationDruid, *core.Unit) {
	t.Helper()
	request := kfcFeralheartRequest(0)
	player := request.Raid.Parties[0].Players[0]
	player.Equipment.Items[16].Id = id
	player.BonusStats = &proto.UnitStats{Stats: stats.Stats{stats.HealingPower: 500, stats.Mana: 10000, stats.Spirit: 200}.ToFloatArray()}
	fields := map[string]int32{"wildGrowth": 1}
	if ownsSwift {
		fields["swiftmend"] = 1
	}
	trees := []string{}
	for _, tree := range druid.ForeverTalentTreeFields {
		var value strings.Builder
		for _, field := range tree {
			value.WriteString(strconv.Itoa(int(fields[field])))
		}
		trees = append(trees, strings.TrimRight(value.String(), "0"))
	}
	player.TalentsString = strings.TrimRight(strings.Join(trees, "-"), "-")
	foreign := kfcFeralheartRequest(0).Raid.Parties[0].Players[0]
	foreign.Name = "Foreign HoT ownership control"
	foreign.TalentsString = player.TalentsString
	request.Raid.Parties[0].Players = append(request.Raid.Parties[0].Players, foreign)
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	return sim, sim.Raid.Parties[0].Players[0].(*RestorationDruid), sim.Raid.Parties[0].Players[1].(*RestorationDruid), &sim.Raid.GetFirstTargetDummy().Unit
}

func TestKFCDruidIdolRegrowthOnlyInitialWithOwnRejuvenation(t *testing.T) {
	output := []float64{}
	for _, crit := range []bool{false, true} {
		amounts, snapshots := []float64{}, []float64{}
		for _, mode := range []string{"bare", "idol-no-hot", "idol-own-hot", "idol-foreign-hot"} {
			id := int32(22398)
			if mode == "bare" {
				id = 0
			}
			sim, healer, foreign, target := kfcDruidIdolFixture(t, id, true)
			target.RemoveHealth(sim, 9000)
			if mode == "idol-own-hot" {
				healer.GetSpell(core.ActionID{SpellID: 9841}).Hot(target).Apply(sim)
			}
			if mode == "idol-foreign-hot" {
				foreign.GetSpell(core.ActionID{SpellID: 9841}).Hot(target).Apply(sim)
			}
			spell := healer.GetSpell(core.ActionID{SpellID: 9858})
			spell.BonusCritRating = -10000
			if crit {
				spell.BonusCritRating = 10000
			}
			if !spell.Cast(sim, target) {
				t.Fatal("Regrowth cast rejected")
			}
			kfcDruidAdvance(t, sim, 2*time.Second)
			metric := spell.SpellMetrics[target.UnitIndex]
			amounts = append(amounts, metric.TotalHealing)
			kfcDruidNear(t, metric.TotalThreat, spell.ThreatFromDamage(core.OutcomeHit, metric.TotalHealing))
			hot := spell.Hot(target)
			snapshots = append(snapshots, hot.SnapshotBaseDamage*hot.SnapshotAttackerMultiplier)
		}
		kfcDruidNear(t, amounts[1], amounts[0])
		kfcDruidNear(t, amounts[2], amounts[0]*1.05)
		kfcDruidNear(t, amounts[3], amounts[0])
		for _, value := range snapshots {
			kfcDruidNear(t, value, snapshots[0])
		}
		output = append(output, amounts...)
	}
	kfcDruidAdvancedResult("IDOL_REGROWTH", output)
}

func TestKFCDruidIdolConditionalHealingChecksCompletion(t *testing.T) {
	amounts := []float64{}
	for _, id := range []int32{0, 22398} {
		sim, healer, _, target := kfcDruidIdolFixture(t, id, true)
		target.RemoveHealth(sim, 9000)
		hot := healer.GetSpell(core.ActionID{SpellID: 9841}).Hot(target)
		hot.Apply(sim)
		kfcDruidAdvance(t, sim, 11*time.Second)
		if !hot.IsActive() {
			t.Fatal("Rejuvenation expired before control cast")
		}
		spell := healer.GetSpell(core.ActionID{SpellID: 9858})
		spell.BonusCritRating = -10000
		if !spell.Cast(sim, target) {
			t.Fatal("Conditional Regrowth rejected")
		}
		kfcDruidAdvance(t, sim, 13*time.Second)
		if hot.IsActive() {
			t.Fatal("Rejuvenation should expire during Regrowth")
		}
		amounts = append(amounts, spell.SpellMetrics[target.UnitIndex].TotalHealing)
	}
	kfcDruidNear(t, amounts[0], amounts[1])
}

func TestKFCDruidIdolSynthesisCountsOwnedFamiliesOnceAndResets(t *testing.T) {
	output := []float64{}
	for count := 1; count <= 3; count++ {
		sim, healer, foreign, target := kfcDruidIdolFixture(t, 272429, true)
		for _, id := range []int32{9841, 9858, 1238215} {
			foreign.GetSpell(core.ActionID{SpellID: id}).Hot(target).Apply(sim)
		}
		swift := healer.GetSpell(core.ActionID{SpellID: 18562})
		if swift.CanCast(sim, target) {
			t.Fatal("Foreign HoTs unlocked Swiftmend")
		}
		for _, id := range []int32{9841, 9858, 1238215}[:count] {
			healer.GetSpell(core.ActionID{SpellID: id}).Hot(target).Apply(sim)
		}
		// Even a malformed duplicate rank cannot count as a second owned HoT family.
		healer.GetSpell(core.ActionID{SpellID: 774}).Hot(target).Apply(sim)
		if !swift.Cast(sim, target) {
			t.Fatal("Synthesis Swiftmend rejected")
		}
		want := time.Duration(15-count) * time.Second
		if swift.CD.ReadyAt() != want {
			t.Fatalf("Synthesis cooldown: got %v, want %v", swift.CD.ReadyAt(), want)
		}
		output = append(output, float64(count), swift.CD.ReadyAt().Seconds())
		sim.Cleanup()
		sim.Reset()
		if !swift.CD.IsReady(sim) || healer.kfcHasOwnedIdolHot(target, "rejuvenation") {
			t.Fatal("Synthesis cooldown or HoTs leaked across iterations")
		}
		healer.GetSpell(core.ActionID{SpellID: 9841}).Hot(target).Apply(sim)
		if !swift.Cast(sim, target) || swift.CD.ReadyAt() != 14*time.Second {
			t.Fatal("Synthesis did not reset to the one-HoT case")
		}
	}
	kfcDruidAdvancedResult("IDOL_SYNTHESIS", output)
}

func TestKFCDruidIdolSwiftnessOnlyChangesOwnedSwiftmendCooldown(t *testing.T) {
	output := []float64{}
	for _, id := range []int32{0, 22398, 249396, 272429, 279250} {
		_, unowned, _, _ := kfcDruidIdolFixture(t, id, false)
		if unowned.GetSpell(core.ActionID{SpellID: 18562}) != nil {
			t.Fatal("Idol granted an unowned talent")
		}
		sim, healer, _, target := kfcDruidIdolFixture(t, id, true)
		swift := healer.GetSpell(core.ActionID{SpellID: 18562})
		want := 15 * time.Second
		if id == 279250 {
			want = 12 * time.Second
		}
		if swift.CD.Duration != want {
			t.Fatal("Static Swiftmend cooldown changed incorrectly")
		}
		healer.GetSpell(core.ActionID{SpellID: 9841}).Hot(target).Apply(sim)
		if !swift.Cast(sim, target) {
			t.Fatal("Equipped Swiftmend rejected")
		}
		if id == 279250 && swift.CD.ReadyAt() != 12*time.Second {
			t.Fatal("Swiftness did not update actual timer")
		}
		if healer.GetSpell(core.ActionID{SpellID: 1238215}).CD.Duration != 6*time.Second || healer.GetSpell(core.ActionID{SpellID: 9863}).CD.Duration != 300*time.Second {
			t.Fatal("Swiftmend idol changed another cooldown")
		}
		output = append(output, float64(id), swift.CD.Duration.Seconds())
	}
	kfcDruidAdvancedResult("IDOL_SWIFT_COOLDOWN", output)
}

func TestKFCDruidIdolMushroomMultipliesSpiritOnce(t *testing.T) {
	_, bare, _, _ := kfcDruidIdolFixture(t, 0, true)
	sim, healer, _, _ := kfcDruidIdolFixture(t, 249396, true)
	want := bare.GetStat(stats.Spirit) * 1.05
	kfcDruidNear(t, healer.GetStat(stats.Spirit), want)
	sim.Cleanup()
	sim.Reset()
	kfcDruidNear(t, healer.GetStat(stats.Spirit), want)
	kfcDruidNear(t, healer.GetStat(stats.HealingPower), bare.GetStat(stats.HealingPower))
	kfcDruidAdvancedResult("IDOL_SPIRIT", []float64{bare.GetStat(stats.Spirit), want})
}

func TestKFCDruidIdolEquippedWorkloadHasNoSyntheticStats(t *testing.T) {
	// These modest legality controls test real equipped jobs, not optimized builds or encounter qualification.
	seed := []int32{22109, 6695, 22112, 1930, 22113, 22106, 22111, 22107, 22108, 22110, 942, 942, 1490, 11819, 1155, 0, 0}
	for _, id := range []int32{22398, 249396, 272429, 279250} {
		request, frame := kfcDruidWorkloadControl()
		player := request.Raid.Parties[0].Players[0]
		player.Name = "Equipped Druid transport control"
		player.BonusStats = nil
		player.Equipment.Items = make([]*proto.ItemSpec, 17)
		for slot, itemID := range seed {
			player.Equipment.Items[slot] = &proto.ItemSpec{Id: itemID}
		}
		player.Equipment.Items[16].Id = id
		name := "druid-equipped-idol-" + strconv.Itoa(int(id))
		payload := kfcDruidControlPayload(t, request, frame, name, false)
		reply := RunKFCDruidHealingJob(context.Background(), payload)
		if reply.Status != "complete" || reply.Result == nil || reply.Result.SurvivalRate != 1 || reply.Result.EffectiveHealingHPS <= 0 {
			t.Fatalf("Equipped workload rejected: %+v", reply)
		}
		kfcDruidNear(t, reply.Result.DeliveredIncomingDamageMean, reply.Result.PlannedIncomingPostMitigationDamage)
		if reply.Result.ClassQualified || reply.Result.PublicationAllowed {
			t.Fatal("Equipped transport control was marked qualified")
		}
		kfcDruidAdvancedResult("IDOL_EQUIPPED_REQUEST", json.RawMessage(payload))
		kfcDruidAdvancedResult("IDOL_EQUIPPED_RESULT", reply)
	}
}
