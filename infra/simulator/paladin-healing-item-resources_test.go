package holy

import (
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
)

func kfcPaladinResourceItemFixture(t *testing.T, ids ...int32) (*core.Simulation, *HolyPaladin) {
	t.Helper()
	request, _ := kfcPaladinWorkloadControl()
	request.Encounter.Duration = 900
	player := request.Raid.Parties[0].Players[0]
	player.TalentsString = kfcPaladinPassiveString(1, 5)
	player.Equipment = &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
	for index := range player.Equipment.Items {
		player.Equipment.Items[index] = &proto.ItemSpec{}
	}
	for index, id := range ids {
		player.Equipment.Items[12+index].Id = id
	}
	request.SimOptions.Interactive, request.SimOptions.IsTest = true, true
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	healer := sim.Raid.Parties[0].Players[0].(*HolyPaladin)
	healer.PseudoStats.SpiritRegenMultiplier = 0
	healer.AddStatDynamic(sim, stats.MP5, -healer.GetStat(stats.MP5))
	healer.UpdateManaRegenRates()
	return sim, healer
}

func kfcPaladinResourceItemMana(healer *HolyPaladin, id int32) (float64, float64) {
	gain, actual := 0.0, 0.0
	for _, row := range healer.Metrics.ToProto().Resources {
		if row.Id.GetSpellId() == id && row.Type == proto.ResourceType_ResourceTypeMana {
			gain += row.Gain
			actual += row.ActualGain
		}
	}
	return gain, actual
}

func TestKFCPaladinMindtapOwnershipAndExplicitAdmission(t *testing.T) {
	for _, ids := range [][]int32{nil, {18371}, {18371, 18371}, {18371, 11819}} {
		_, healer := kfcPaladinResourceItemFixture(t, ids...)
		owned := len(ids) > 0
		spell := healer.GetSpell(core.ActionID{SpellID: 1302205})
		if (spell != nil) != owned {
			t.Fatal("Mindtap ownership changed")
		}
		if (healer.validateKFCPaladinHealingCooldowns([]KFCPaladinHealingCooldown{{SpellID: 1302205}}) == nil) != owned {
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

func TestKFCPaladinMindtapTicksAndDivineIntellectPenalty(t *testing.T) {
	sim, healer := kfcPaladinResourceItemFixture(t, 18371)
	beforeIntellect, beforeMaximum := healer.GetStat(stats.Intellect), healer.MaxMana()
	healer.SpendMana(sim, 6000, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 82}))
	spell := healer.GetSpell(core.ActionID{SpellID: 1302205})
	if !spell.Cast(sim, &healer.Unit) {
		t.Fatal("Mindtap use failed")
	}
	kfcPaladinNear(t, healer.GetStat(stats.Intellect), beforeIntellect-60*1.1)
	kfcPaladinNear(t, beforeMaximum-healer.MaxMana(), 60*15*1.1)
	for tick := 1; tick <= 10; tick++ {
		kfcPaladinAdvance(t, sim, time.Duration(tick)*time.Second)
		gain, actual := kfcPaladinResourceItemMana(healer, 1302205)
		kfcPaladinNear(t, gain, 125*float64(tick))
		kfcPaladinNear(t, actual, gain)
	}
	kfcPaladinAdvance(t, sim, 11*time.Second)
	gain, _ := kfcPaladinResourceItemMana(healer, 1302205)
	kfcPaladinNear(t, gain, 1250)
	if spell.CD.ReadyAt() != 420*time.Second {
		t.Fatal("Mindtap personal cooldown changed")
	}
	kfcPaladinAdvance(t, sim, 120*time.Second)
	kfcPaladinNear(t, healer.GetStat(stats.Intellect), beforeIntellect)
	kfcPaladinNear(t, healer.MaxMana(), beforeMaximum)
	kfcPaladinHeartMeasure("MINDTAP", []float64{gain, beforeMaximum - healer.MaxMana()})
}

func TestKFCPaladinMindtapClampNoFreeManaAndReset(t *testing.T) {
	sim, healer := kfcPaladinResourceItemFixture(t, 18371)
	maximum := healer.MaxMana()
	spell := healer.GetSpell(core.ActionID{SpellID: 1302205})
	if !spell.Cast(sim, &healer.Unit) {
		t.Fatal("Full-mana Mindtap use failed")
	}
	kfcPaladinNear(t, healer.CurrentMana(), healer.MaxMana())
	loss, actual := kfcPaladinResourceItemMana(healer, 1302206)
	kfcPaladinNear(t, -loss, 990)
	kfcPaladinNear(t, actual, loss)
	healer.SpendMana(sim, 5000, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 83}))
	kfcPaladinAdvance(t, sim, 119999*time.Millisecond)
	before := healer.CurrentMana()
	kfcPaladinAdvance(t, sim, 120*time.Second)
	kfcPaladinNear(t, healer.CurrentMana(), before)
	kfcPaladinNear(t, healer.MaxMana(), maximum)
	sim.Cleanup()
	sim.Reset()
	kfcPaladinNear(t, healer.MaxMana(), maximum)
	if !spell.IsReady(sim) {
		t.Fatal("Mindtap cooldown leaked across iterations")
	}
}

func TestKFCPaladinMindtapAndSecondWindShareOnlyTheirCategory(t *testing.T) {
	for _, firstMindtap := range []bool{false, true} {
		sim, healer := kfcPaladinResourceItemFixture(t, 18371, 11819)
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
		kfcPaladinAdvance(t, sim, 10*time.Second)
		if !second.Cast(sim, &healer.Unit) {
			t.Fatal("Shared category did not unlock after ten seconds")
		}
		kfcPaladinAdvance(t, sim, 20*time.Second)
		mindtap, _ := kfcPaladinResourceItemMana(healer, 1302205)
		wind, _ := kfcPaladinResourceItemMana(healer, 15604)
		kfcPaladinNear(t, mindtap, 1250)
		kfcPaladinNear(t, wind, 630)
	}
}

func TestKFCPaladinResourceItemsStopAfterDeath(t *testing.T) {
	for _, id := range []int32{18371, 11819} {
		sim, healer := kfcPaladinResourceItemFixture(t, id)
		healer.SpendMana(sim, 6000, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 85}))
		spellID, tickAmount := int32(1302205), 125.0
		if id == 11819 {
			spellID, tickAmount = 15604, 63
		}
		spell := healer.GetSpell(core.ActionID{SpellID: spellID})
		if !spell.Cast(sim, &healer.Unit) {
			t.Fatal("Resource death control use failed")
		}
		kfcPaladinAdvance(t, sim, time.Second)
		healer.RemoveHealth(sim, healer.CurrentHealth())
		kfcPaladinAdvance(t, sim, 11*time.Second)
		gain, _ := kfcPaladinResourceItemMana(healer, spellID)
		kfcPaladinNear(t, gain, tickAmount)
		if spell.CanCast(sim, &healer.Unit) {
			t.Fatal("Dead Paladin can use resource item")
		}
	}
}

func TestKFCPaladinSerenityOwnedUseAndIndependentCategory(t *testing.T) {
	sim, healer := kfcPaladinResourceItemFixture(t, 272439, 18371)
	policy := []KFCPaladinHealingCooldown{{ItemID: 272439}}
	if err := healer.validateKFCPaladinHealingCooldowns(policy); err != nil {
		t.Fatal(err)
	}
	spell := healer.GetInitialMajorCooldown(core.ActionID{ItemID: 272439}).Spell
	before := healer.GetStat(stats.Spirit)
	if spell == nil || !spell.Cast(sim, &healer.Unit) {
		t.Fatal("Owned Serenity use failed")
	}
	kfcPaladinNear(t, healer.GetStat(stats.Spirit)-before, 72*1.05)
	healer.SpendMana(sim, 6000, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 86}))
	if !healer.GetSpell(core.ActionID{SpellID: 1302205}).Cast(sim, &healer.Unit) {
		t.Fatal("Serenity incorrectly blocked the independent mana-item category")
	}
	kfcPaladinAdvance(t, sim, 15*time.Second)
	kfcPaladinNear(t, healer.GetStat(stats.Spirit), before)
	if spell.CD.ReadyAt() != 90*time.Second {
		t.Fatal("Serenity cooldown changed")
	}
	_, without := kfcPaladinResourceItemFixture(t)
	if without.validateKFCPaladinHealingCooldowns(policy) == nil {
		t.Fatal("Unequipped Serenity admitted")
	}
}
