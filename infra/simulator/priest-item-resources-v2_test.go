package healing

import (
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
)

func kfcPriestResourceItemFixture(t *testing.T, ids ...int32) (*core.Simulation, *HealingPriest) {
	t.Helper()
	request := kfcWorkloadRequest(10000, 1, 900)
	player := request.Raid.Parties[0].Players[0]
	player.TalentsString = kfcItemTalents(&proto.PriestTalents{MentalStrength: 5})
	player.Equipment = kfcItemEquipment()
	for index, id := range ids {
		player.Equipment.Items[12+index].Id = id
	}
	request.SimOptions.Interactive, request.SimOptions.IsTest = true, true
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	healer := sim.Raid.Parties[0].Players[0].(*HealingPriest)
	healer.PseudoStats.SpiritRegenMultiplier = 0
	healer.AddStatDynamic(sim, stats.MP5, -healer.GetStat(stats.MP5))
	healer.UpdateManaRegenRates()
	return sim, healer
}

func kfcPriestResourceItemMana(healer *HealingPriest, id int32) (float64, float64) {
	gain, actual := 0.0, 0.0
	for _, row := range healer.Metrics.ToProto().Resources {
		if row.Id.GetSpellId() == id && row.Type == proto.ResourceType_ResourceTypeMana {
			gain += row.Gain
			actual += row.ActualGain
		}
	}
	return gain, actual
}

func TestKFCPriestMindtapOwnershipAndExplicitAdmission(t *testing.T) {
	for _, ids := range [][]int32{nil, {18371}, {18371, 18371}, {18371, 11819}} {
		_, healer := kfcPriestResourceItemFixture(t, ids...)
		owned := len(ids) > 0
		spell := healer.GetSpell(core.ActionID{SpellID: 1302205})
		if (spell != nil) != owned {
			t.Fatal("Mindtap ownership changed")
		}
		if (healer.validateKFCHealingCooldowns([]KFCHealingCooldown{{SpellID: 1302205}}) == nil) != owned {
			t.Fatal("Unowned Mindtap admitted or owned use rejected")
		}
		count := 0
		for _, registered := range healer.Spellbook {
			if registered.ActionID.SpellID == 1302205 {
				count++
			}
		}
		if owned && count != 1 {
			t.Fatal("Duplicate copies duplicated Mindtap use")
		}
	}
}

func TestKFCPriestMindtapTicksAndMentalStrengthPenalty(t *testing.T) {
	sim, healer := kfcPriestResourceItemFixture(t, 18371)
	beforeIntellect, beforeMaximum := healer.GetStat(stats.Intellect), healer.MaxMana()
	healer.SpendMana(sim, 6000, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 82}))
	spell := healer.GetSpell(core.ActionID{SpellID: 1302205})
	if !spell.Cast(sim, &healer.Unit) {
		t.Fatal("Mindtap use failed")
	}
	kfcPriestNear(t, healer.GetStat(stats.Intellect), beforeIntellect-60*1.1)
	kfcPriestNear(t, beforeMaximum-healer.MaxMana(), 60*15*1.1)
	for tick := 1; tick <= 10; tick++ {
		kfcPriestAdvance(t, sim, time.Duration(tick)*time.Second)
		gain, actual := kfcPriestResourceItemMana(healer, 1302205)
		kfcPriestNear(t, gain, 125*float64(tick))
		kfcPriestNear(t, actual, gain)
	}
	kfcPriestAdvance(t, sim, 11*time.Second)
	gain, _ := kfcPriestResourceItemMana(healer, 1302205)
	kfcPriestNear(t, gain, 1250)
	if spell.CD.ReadyAt() != 420*time.Second {
		t.Fatal("Mindtap personal cooldown changed")
	}
	kfcPriestAdvance(t, sim, 120*time.Second)
	kfcPriestNear(t, healer.GetStat(stats.Intellect), beforeIntellect)
	kfcPriestNear(t, healer.MaxMana(), beforeMaximum)
	kfcPriestHeartMeasure("MINDTAP", []float64{gain, beforeMaximum - healer.MaxMana()})
}

func TestKFCPriestMindtapClampNoFreeManaAndReset(t *testing.T) {
	sim, healer := kfcPriestResourceItemFixture(t, 18371)
	maximum := healer.MaxMana()
	spell := healer.GetSpell(core.ActionID{SpellID: 1302205})
	if !spell.Cast(sim, &healer.Unit) {
		t.Fatal("Full-mana Mindtap use failed")
	}
	kfcPriestNear(t, healer.CurrentMana(), healer.MaxMana())
	loss, actual := kfcPriestResourceItemMana(healer, 1302206)
	kfcPriestNear(t, -loss, 990)
	kfcPriestNear(t, actual, loss)
	healer.SpendMana(sim, 5000, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 83}))
	kfcPriestAdvance(t, sim, 119999*time.Millisecond)
	before := healer.CurrentMana()
	kfcPriestAdvance(t, sim, 120*time.Second)
	kfcPriestNear(t, healer.CurrentMana(), before)
	kfcPriestNear(t, healer.MaxMana(), maximum)
	sim.Cleanup()
	sim.Reset()
	kfcPriestNear(t, healer.MaxMana(), maximum)
	if !spell.IsReady(sim) {
		t.Fatal("Mindtap cooldown leaked across iterations")
	}
}

func TestKFCPriestMindtapAndSecondWindShareOnlyTheirCategory(t *testing.T) {
	for _, firstMindtap := range []bool{false, true} {
		sim, healer := kfcPriestResourceItemFixture(t, 18371, 11819)
		healer.SpendMana(sim, 6000, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 84}))
		first, second := healer.GetSpell(core.ActionID{SpellID: 1302205}), healer.GetSpell(core.ActionID{SpellID: 15604})
		if !firstMindtap {
			first, second = second, first
		}
		if !first.Cast(sim, &healer.Unit) {
			t.Fatal("First shared-category use failed")
		}
		before := second.CD.ReadyAt()
		if second.Cast(sim, &healer.Unit) || second.CD.ReadyAt() != before {
			t.Fatal("Blocked shared use succeeded or consumed personal cooldown")
		}
		kfcPriestAdvance(t, sim, 10*time.Second)
		if !second.Cast(sim, &healer.Unit) {
			t.Fatal("Shared category did not unlock after ten seconds")
		}
		kfcPriestAdvance(t, sim, 20*time.Second)
		mindtap, _ := kfcPriestResourceItemMana(healer, 1302205)
		wind, _ := kfcPriestResourceItemMana(healer, 15604)
		kfcPriestNear(t, mindtap, 1250)
		kfcPriestNear(t, wind, 630)
	}
}

func TestKFCPriestResourceItemsStopAfterDeath(t *testing.T) {
	for _, id := range []int32{18371, 11819} {
		sim, healer := kfcPriestResourceItemFixture(t, id)
		healer.SpendMana(sim, 6000, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 85}))
		spellID, tickAmount := int32(1302205), 125.0
		if id == 11819 {
			spellID, tickAmount = 15604, 63
		}
		spell := healer.GetSpell(core.ActionID{SpellID: spellID})
		if !spell.Cast(sim, &healer.Unit) {
			t.Fatal("Resource death control use failed")
		}
		kfcPriestAdvance(t, sim, time.Second)
		healer.RemoveHealth(sim, healer.CurrentHealth())
		kfcPriestAdvance(t, sim, 11*time.Second)
		gain, _ := kfcPriestResourceItemMana(healer, spellID)
		kfcPriestNear(t, gain, tickAmount)
		if spell.CanCast(sim, &healer.Unit) {
			t.Fatal("Dead Priest can use resource item")
		}
	}
}

func TestKFCPriestSerenityOwnedUseAndIndependentCategory(t *testing.T) {
	sim, healer := kfcPriestResourceItemFixture(t, 272439, 18371)
	policy := []KFCHealingCooldown{{ItemID: 272439}}
	if err := healer.validateKFCHealingCooldowns(policy); err != nil {
		t.Fatal(err)
	}
	spell := healer.GetInitialMajorCooldown(core.ActionID{ItemID: 272439}).Spell
	before := healer.GetStat(stats.Spirit)
	if spell == nil || !spell.Cast(sim, &healer.Unit) {
		t.Fatal("Owned Serenity use failed")
	}
	kfcPriestNear(t, healer.GetStat(stats.Spirit)-before, 72*1.05)
	healer.SpendMana(sim, 6000, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 86}))
	if !healer.GetSpell(core.ActionID{SpellID: 1302205}).Cast(sim, &healer.Unit) {
		t.Fatal("Serenity incorrectly blocked the independent mana-item category")
	}
	kfcPriestAdvance(t, sim, 15*time.Second)
	kfcPriestNear(t, healer.GetStat(stats.Spirit), before)
	if spell.CD.ReadyAt() != 90*time.Second {
		t.Fatal("Serenity cooldown changed")
	}
	_, without := kfcPriestResourceItemFixture(t)
	if without.validateKFCHealingCooldowns(policy) == nil {
		t.Fatal("Unequipped Serenity admitted")
	}
}
