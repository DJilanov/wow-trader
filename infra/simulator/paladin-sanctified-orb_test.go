package holy

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
	"google.golang.org/protobuf/encoding/protojson"
)

func kfcPaladinOrbFixture(t *testing.T, owned bool, conjured proto.Conjured, other int32) (*core.Simulation, *HolyPaladin) {
	t.Helper()
	request, _ := kfcPaladinWorkloadControl()
	request.Encounter.Duration = 900
	request.SimOptions.Interactive, request.SimOptions.IsTest = true, true
	player := request.Raid.Parties[0].Players[0]
	player.TalentsString = kfcPaladinPassiveString(1, 5)
	player.Consumes = &proto.Consumes{DefaultConjured: conjured}
	player.Equipment = &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
	for slot := range player.Equipment.Items {
		player.Equipment.Items[slot] = &proto.ItemSpec{}
	}
	if owned {
		player.Equipment.Items[12].Id = 20512
	}
	player.Equipment.Items[13].Id = other
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	healer := sim.Raid.Parties[0].Players[0].(*HolyPaladin)
	healer.PseudoStats.SpiritRegenMultiplier = 0
	healer.AddStatDynamic(sim, stats.MP5, -healer.GetStat(stats.MP5))
	healer.UpdateManaRegenRates()
	return sim, healer
}

func kfcPaladinOrbMana(healer *HolyPaladin) (float64, float64) {
	gain, actual := 0.0, 0.0
	for _, row := range healer.Metrics.ToProto().Resources {
		if row.Id.GetItemId() == 20512 && row.Type == proto.ResourceType_ResourceTypeMana {
			gain += row.Gain
			actual += row.ActualGain
		}
	}
	return gain, actual
}

func TestKFCPaladinOrbOwnershipAndExplicitUse(t *testing.T) {
	for _, owned := range []bool{false, true} {
		_, healer := kfcPaladinOrbFixture(t, owned, proto.Conjured_ConjuredUnknown, 0)
		if (healer.GetSpell(core.ActionID{ItemID: 20512}) != nil) != owned {
			t.Fatal("Orb ownership changed")
		}
		if (healer.validateKFCPaladinHealingCooldowns([]KFCPaladinHealingCooldown{{ItemID: 20512}}) == nil) != owned {
			t.Fatal("Orb explicit cooldown lost ownership validation")
		}
		if owned {
			if healer.KFCSanctifiedOrbArea() != "neutral" {
				t.Fatal("Orb default area changed")
			}
		} else if healer.ConfigureKFCSanctifiedOrbArea("haunted") == nil {
			t.Fatal("Unowned Orb accepted an area policy")
		}
		if healer.GetAura("ItemActive-20512") != nil {
			t.Fatal("Legacy Orb crit aura is still registered")
		}
	}
}

func TestKFCPaladinOrbManaBoundsAreasCapAndNoCriticalBonus(t *testing.T) {
	for _, area := range []string{"neutral", "haunted", "wasteland"} {
		sim, healer := kfcPaladinOrbFixture(t, true, proto.Conjured_ConjuredUnknown, 19288)
		if err := healer.ConfigureKFCSanctifiedOrbArea(area); err != nil {
			t.Fatal(err)
		}
		factor := 1.0
		if area != "neutral" {
			factor = 2
		}
		spell := healer.GetSpell(core.ActionID{ItemID: 20512})
		crit, melee := healer.GetStat(stats.SpellCrit), healer.GetStat(stats.MeleeCrit)
		total := 0.0
		for cast := 0; cast < 64; cast++ {
			healer.AddMana(sim, healer.MaxMana(), healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 92}))
			healer.SpendMana(sim, 1000, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 93}))
			before := healer.CurrentMana()
			spell.CD.Set(sim.CurrentTime)
			if !spell.Cast(sim, &healer.Unit) {
				t.Fatal("Orb bounded use failed")
			}
			gain := healer.CurrentMana() - before
			if gain < 318.75*factor || gain > 361.25*factor {
				t.Fatal("Orb amount outside source area bounds", area, gain)
			}
			total += gain
		}
		if healer.GetAura("Aura of the Blue Dragon").IsActive() {
			t.Fatal("Orb item use triggered a completed healing-cast proc")
		}
		kfcPaladinNear(t, healer.GetStat(stats.SpellCrit), crit)
		kfcPaladinNear(t, healer.GetStat(stats.MeleeCrit), melee)
		healer.AddMana(sim, healer.MaxMana(), healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 94}))
		spell.CD.Set(sim.CurrentTime)
		_, before := kfcPaladinOrbMana(healer)
		if !spell.Cast(sim, &healer.Unit) {
			t.Fatal("Orb cap control failed")
		}
		gain, actual := kfcPaladinOrbMana(healer)
		kfcPaladinNear(t, actual, before)
		if gain <= actual {
			t.Fatal("Orb raw/actual gain did not distinguish capped mana")
		}
		kfcPaladinHeartMeasure("ORB_BOUNDS_"+area, []float64{total / 64, gain, actual})
	}
}

func TestKFCPaladinOrbCooldownAndIterationReset(t *testing.T) {
	sim, healer := kfcPaladinOrbFixture(t, true, proto.Conjured_ConjuredUnknown, 0)
	if err := healer.ConfigureKFCSanctifiedOrbArea("haunted"); err != nil {
		t.Fatal(err)
	}
	spell := healer.GetSpell(core.ActionID{ItemID: 20512})
	if spell.SharedCD.Timer != nil || spell.DefaultCast.GCD != 0 || spell.DefaultCast.CastTime != 0 {
		t.Fatal("Orb inherited a shared cooldown, GCD or cast time")
	}
	if !spell.Cast(sim, &healer.Unit) || spell.CD.ReadyAt() != 300*time.Second {
		t.Fatal("Orb personal cooldown changed")
	}
	kfcPaladinAdvance(t, sim, 300*time.Second-time.Millisecond)
	if spell.CanCast(sim, &healer.Unit) {
		t.Fatal("Orb ready before five minutes")
	}
	kfcPaladinAdvance(t, sim, 300*time.Second)
	if !spell.CanCast(sim, &healer.Unit) {
		t.Fatal("Orb did not become ready at five minutes")
	}
	sim.Cleanup()
	sim.Reset()
	if !spell.CanCast(sim, &healer.Unit) || healer.KFCSanctifiedOrbArea() != "haunted" {
		t.Fatal("Orb cooldown or reference area failed iteration reset")
	}
	kfcPaladinHeartMeasure("ORB_COOLDOWN", 300)
}

func TestKFCPaladinOrbIndependentOfResolvedConsumableAndTrinketCategories(t *testing.T) {
	for _, conjured := range []proto.Conjured{proto.Conjured_ConjuredDemonicRune, proto.Conjured_ConjuredMinorRecombobulator} {
		for _, orbFirst := range []bool{false, true} {
			sim, healer := kfcPaladinOrbFixture(t, true, conjured, 272439)
			healer.SpendMana(sim, 4000, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 95}))
			item := int32(12662)
			if conjured == proto.Conjured_ConjuredMinorRecombobulator {
				item = 4381
			}
			first, second := healer.GetSpell(core.ActionID{ItemID: item}), healer.GetSpell(core.ActionID{ItemID: 20512})
			if orbFirst {
				first, second = second, first
			}
			if first == nil || second == nil || !first.Cast(sim, &healer.Unit) || !second.CanCast(sim, &healer.Unit) || !second.Cast(sim, &healer.Unit) {
				t.Fatal("Orb was incorrectly grouped with item override category1153", conjured, orbFirst)
			}
			if !healer.GetSpell(core.ActionID{ItemID: 272439}).CanCast(sim, &healer.Unit) {
				t.Fatal("Orb inherited the offensive trinket cooldown category")
			}
		}
	}
}

func TestKFCPaladinOrbAreaFreshnessAndDeadController(t *testing.T) {
	for _, area := range []string{"", "unknown", "Haunted"} {
		_, healer := kfcPaladinOrbFixture(t, true, proto.Conjured_ConjuredUnknown, 0)
		if healer.ConfigureKFCSanctifiedOrbArea(area) == nil {
			t.Fatal("Invalid Orb area accepted", area)
		}
	}
	sim, healer := kfcPaladinOrbFixture(t, true, proto.Conjured_ConjuredUnknown, 0)
	if err := healer.ConfigureKFCSanctifiedOrbArea("neutral"); err != nil {
		t.Fatal(err)
	}
	if healer.ConfigureKFCSanctifiedOrbArea("haunted") == nil {
		t.Fatal("Orb area reconfigured")
	}
	healer.RemoveHealth(sim, healer.CurrentHealth())
	spell := healer.GetSpell(core.ActionID{ItemID: 20512})
	if spell.CanCast(sim, &healer.Unit) {
		t.Fatal("Dead caster can use Orb")
	}
	before := spell.CD.ReadyAt()
	healer.useKFCPaladinHealingCooldowns(sim, KFCPaladinHealingWorkload{Cooldowns: []KFCPaladinHealingCooldown{{ItemID: 20512}}})
	if spell.CD.ReadyAt() != before {
		t.Fatal("Dead controller consumed Orb cooldown")
	}
}

func TestKFCPaladinOrbActualWorkloadAndAreaEcho(t *testing.T) {
	for _, area := range []string{"neutral", "haunted", "wasteland"} {
		request, frame := kfcPaladinWorkloadControl()
		request.Encounter.Duration = 180
		request.SimOptions.Iterations = 8
		player := request.Raid.Parties[0].Players[0]
		player.TalentsString = kfcPaladinPassiveString(1, 5)
		player.Equipment = &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
		for slot := range player.Equipment.Items {
			player.Equipment.Items[slot] = &proto.ItemSpec{}
		}
		player.Equipment.Items[12].Id = 20512
		frame.OrbArea = &area
		frame.Cooldowns = []KFCPaladinHealingCooldown{{ItemID: 20512, RequireHealingDemand: true}}
		frame.Priorities = []KFCPaladinHealingPriority{{SpellID: 10329, RaidIndex: 1, MinimumMissingHealth: 500}}
		frame.Damage = nil
		for second := int64(1); second < 180; second++ {
			frame.Damage = append(frame.Damage, KFCPaladinHealingDamageEvent{AtMS: second * 1000, RaidIndex: 1, Amount: 200})
		}
		payload := kfcPaladinWorkloadPayload(t, request, frame, "paladin-orb-"+area, true)
		reply := RunKFCPaladinHealingJob(context.Background(), payload)
		if reply.Status != "complete" || reply.Result.OrbArea != area || reply.Result.SurvivalRate != 1 {
			t.Fatal("Orb workload or area echo failed", reply)
		}
		metrics := &proto.RaidMetrics{}
		if err := protojson.Unmarshal(reply.Result.Metrics, metrics); err != nil {
			t.Fatal(err)
		}
		gain := 0.0
		for _, resource := range metrics.Parties[0].Players[0].Resources {
			if resource.Id.GetItemId() == 20512 {
				gain += resource.Gain
			}
		}
		if gain <= 0 {
			t.Fatal("Actual workload never used its owned Orb")
		}
		kfcPaladinHeartMeasure("ORB_WORKLOAD_REQUEST", json.RawMessage(payload))
		kfcPaladinHeartMeasure("ORB_WORKLOAD_GAIN_"+area, gain)
	}
}
