package holy

import (
	"context"
	"testing"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/stats"
)

func kfcPaladinSoulforgeFixture(t *testing.T, count int, withoutSet bool) (*core.Simulation, *HolyPaladin, *core.Unit) {
	t.Helper()
	ids := []int32{22086, 22087, 22088, 22089, 22090, 22091, 22092, 22093}
	slots := []int{7, 9, 5, 4, 6, 0, 8, 2}
	gear := &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
	for i := range gear.Items {
		gear.Items[i] = &proto.ItemSpec{}
	}
	for i := 0; i < count; i++ {
		gear.Items[slots[i]].Id = ids[i]
	}
	if withoutSet {
		// A counterfactual control preserves the exact equipped stats and IDs, removing only set identity in memory.
		original := map[int32]core.Item{}
		for _, id := range ids {
			item := core.ItemsByID[id]
			original[id] = item
			item.SetID = 0
			item.SetName = ""
			core.ItemsByID[id] = item
		}
		defer func() {
			for id, item := range original {
				core.ItemsByID[id] = item
			}
		}()
	}
	return kfcPaladinEquippedControl(t, gear)
}

func TestKFCPaladinSoulforgeEveryThresholdAndEquippedSlot(t *testing.T) {
	values := []float64{}
	for count := 0; count <= 8; count++ {
		_, actual, _ := kfcPaladinSoulforgeFixture(t, count, false)
		_, base, _ := kfcPaladinSoulforgeFixture(t, count, true)
		resist, ap, armor := 0.0, 0.0, 0.0
		if count >= 2 {
			resist = 8
		}
		if count >= 6 {
			ap = 40
		}
		if count >= 8 {
			armor = 200
		}
		for _, stat := range []stats.Stat{stats.ArcaneResistance, stats.FireResistance, stats.FrostResistance, stats.NatureResistance, stats.ShadowResistance} {
			kfcPaladinNear(t, actual.GetStat(stat)-base.GetStat(stat), resist)
		}
		kfcPaladinNear(t, actual.GetStat(stats.AttackPower)-base.GetStat(stats.AttackPower), ap)
		kfcPaladinNear(t, actual.GetStat(stats.RangedAttackPower)-base.GetStat(stats.RangedAttackPower), ap)
		kfcPaladinNear(t, actual.GetStat(stats.BonusArmor)-base.GetStat(stats.BonusArmor), armor)
		kfcPaladinNear(t, actual.GetStat(stats.SpellPower), base.GetStat(stats.SpellPower))
		values = append(values, actual.GetStat(stats.FireResistance)-base.GetStat(stats.FireResistance), actual.GetStat(stats.AttackPower)-base.GetStat(stats.AttackPower), actual.GetStat(stats.BonusArmor)-base.GetStat(stats.BonusArmor))
	}
	kfcPaladinActiveMeasure("SOULFORGE_THRESHOLDS", values)
}

func TestKFCPaladinSoulforgeCannotProcFromHealingOrAccumulateOnReset(t *testing.T) {
	sim, holy, target := kfcPaladinSoulforgeFixture(t, 8, false)
	spell := holy.GetSpell(core.ActionID{SpellID: 635})
	spell.BonusCritRating = -10000
	power := spell.HealingPower(target)
	armor := holy.GetStat(stats.BonusArmor)
	for i := 0; i < 20; i++ {
		target.RemoveHealth(sim, 500)
		if !spell.Cast(sim, target) {
			t.Fatal("Soulforge cast rejected", i)
		}
		kfcPaladinAdvance(t, sim, sim.CurrentTime+spell.DefaultCast.CastTime)
		kfcPaladinNear(t, spell.HealingPower(target), power)
	}
	for iteration := 0; iteration < 3; iteration++ {
		sim.Cleanup()
		sim.Reset()
		kfcPaladinNear(t, holy.GetStat(stats.BonusArmor), armor)
		kfcPaladinNear(t, spell.HealingPower(target), power)
	}
	kfcPaladinActiveMeasure("SOULFORGE_HEALING_ONLY", []float64{power, armor})
}

func TestKFCPaladinSoulforgeDoesNotMergeSameNamedVariants(t *testing.T) {
	_, holy, _ := kfcPaladinSoulforgeFixture(t, 8, true)
	before := holy.GetStat(stats.BonusArmor)
	for slot := range holy.Equipment {
		if holy.Equipment[slot].ID >= 22086 && holy.Equipment[slot].ID <= 22093 {
			holy.Equipment[slot].SetID = 1673
			holy.Equipment[slot].SetName = "Soulforge Armor"
		}
	}
	holy.registerKFCSoulforgeHealing()
	kfcPaladinNear(t, holy.GetStat(stats.BonusArmor), before)
}

func TestKFCPaladinSoulforgeWorksInActualFullTalentWorkload(t *testing.T) {
	request, frame := kfcPaladinWorkloadControl()
	player := request.Raid.Parties[0].Players[0]
	player.TalentsString = kfcPaladinFullTalentControlSeeds[0]
	frame.RequireFullTalentBuild = true
	seed := []int32{22091, 6695, 22093, 1930, 22089, 22088, 22090, 22086, 22092, 22087, 942, 942, 1490, 11819, 2816, 6341, 279248}
	player.Equipment = &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, len(seed))}
	for slot, id := range seed {
		player.Equipment.Items[slot] = &proto.ItemSpec{Id: id}
	}
	policy := kfcPaladinLightPolicy(1, 19979)
	frame.BlessingOfLight = &policy
	reply := RunKFCPaladinHealingJob(context.Background(), kfcPaladinWorkloadPayload(t, request, frame, "paladin-full-soulforge-control", true))
	result := kfcPaladinRequireReply(t, reply)
	if !result.LegalTalentBuild || result.SurvivalRate != 1 || result.RawHPS <= 0 {
		t.Fatal("Full equipped Soulforge workload failed")
	}
	kfcPaladinActiveMeasure("SOULFORGE_WORKLOAD", []float64{result.RawHPS, result.ManaRemainingMean, result.EffectiveHealingHPS})
}
