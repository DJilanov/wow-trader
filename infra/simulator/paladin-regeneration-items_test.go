package holy

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
	"google.golang.org/protobuf/encoding/protojson"
	googleProto "google.golang.org/protobuf/proto"
)

func kfcPaladinRegenerationRequest(equipment map[int]int32) *proto.RaidSimRequest {
	request := kfcPaladinRecombRequest(nil, false, proto.Conjured_ConjuredUnknown)
	request.Encounter.Duration = 1850
	for slot, id := range equipment {
		request.Raid.Parties[0].Players[0].Equipment.Items[slot].Id = id
	}
	return request
}

func kfcPaladinRegenerationFixture(t *testing.T, request *proto.RaidSimRequest) (*core.Simulation, *HolyPaladin) {
	t.Helper()
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	healer := sim.Raid.Parties[0].Players[0].(*HolyPaladin)
	positions := map[int32]KFCPaladinFriendlyPosition{}
	for _, unit := range sim.Raid.AllUnits {
		positions[unit.UnitIndex] = KFCPaladinFriendlyPosition{}
	}
	if err := healer.ConfigureKFCPaladinActiveHealing(positions, KFCPaladinVigilSingleRefund); err != nil {
		t.Fatal(err)
	}
	healer.PseudoStats.SpiritRegenMultiplier = 0
	healer.AddStatDynamic(sim, stats.MP5, -healer.GetStat(stats.MP5))
	healer.UpdateManaRegenRates()
	return sim, healer
}

func kfcPaladinRegenerationMana(healer *HolyPaladin, id int32) (float64, float64) {
	gain, actual := 0.0, 0.0
	for _, row := range healer.Metrics.ToProto().Resources {
		if row.Id.GetSpellId() == id && row.Type == proto.ResourceType_ResourceTypeMana {
			gain += row.Gain
			actual += row.ActualGain
		}
	}
	return gain, actual
}

func kfcPaladinRegenerationDamage(sim *core.Simulation, healer *HolyPaladin, amount float64) {
	spell := sim.Encounter.TargetUnits[0].GetOrRegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: 1, Tag: 121}, SpellSchool: core.SpellSchoolHoly, ProcMask: core.ProcMaskSpellDamage, DamageMultiplier: 1})
	result := spell.NewResult(&healer.Unit)
	result.Damage = amount
	result.Outcome = core.OutcomeHit
	spell.DealDamage(sim, result)
}

func TestKFCPaladinRunebladeTicksCapsDeathAndReset(t *testing.T) {
	sim, healer := kfcPaladinRegenerationFixture(t, kfcPaladinRegenerationRequest(map[int]int32{14: 13505}))
	healer.RemoveHealth(sim, 1000)
	before := healer.CurrentHealth()
	kfcPaladinAdvance(t, sim, 4999*time.Millisecond)
	kfcPaladinNear(t, healer.CurrentHealth(), before)
	kfcPaladinAdvance(t, sim, 5*time.Second)
	kfcPaladinNear(t, healer.CurrentHealth()-before, 60)
	kfcPaladinAdvance(t, sim, 10*time.Second)
	kfcPaladinNear(t, healer.CurrentHealth()-before, 120)
	ally := &sim.Raid.GetFirstTargetDummy().Unit
	ally.RemoveHealth(sim, 100)
	allyBefore := ally.CurrentHealth()
	healer.GainHealth(sim, healer.MaxHealth(), healer.NewHealthMetrics(core.ActionID{SpellID: 1, Tag: 122}))
	kfcPaladinAdvance(t, sim, 15*time.Second)
	kfcPaladinNear(t, healer.CurrentHealth(), healer.MaxHealth())
	kfcPaladinNear(t, ally.CurrentHealth(), allyBefore)
	healer.RemoveHealth(sim, healer.CurrentHealth())
	kfcPaladinAdvance(t, sim, 20*time.Second)
	kfcPaladinNear(t, healer.CurrentHealth(), 0)
	sim.Cleanup()
	sim.Reset()
	healer.RemoveHealth(sim, 1000)
	before = healer.CurrentHealth()
	kfcPaladinAdvance(t, sim, 5*time.Second)
	kfcPaladinNear(t, healer.CurrentHealth()-before, 60)
	kfcPaladinHeartMeasure("REGEN_RUNEBLADE", 60)
}

func TestKFCPaladinBenevolencePartyRangeCapsAndDeath(t *testing.T) {
	request := kfcPaladinRegenerationRequest(map[int]int32{14: 6323})
	other := googleProto.Clone(request.Raid.Parties[0].Players[0]).(*proto.Player)
	other.Name = "Other party"
	other.Equipment = &proto.EquipmentSpec{}
	request.Raid.Parties = append(request.Raid.Parties, &proto.Party{Players: []*proto.Player{other}})
	sim, healer := kfcPaladinRegenerationFixture(t, request)
	for _, unit := range sim.Raid.AllUnits {
		unit.RemoveHealth(sim, 1000)
	}
	units := sim.Raid.AllUnits
	inside, outside := units[1], units[2]
	healer.KFCHealing.positions[inside.UnitIndex] = KFCPaladinFriendlyPosition{X: 30}
	healer.KFCHealing.positions[outside.UnitIndex] = KFCPaladinFriendlyPosition{X: 30.01}
	otherUnit := &sim.Raid.Parties[1].Players[0].GetCharacter().Unit
	beforeInside, beforeOutside, beforeOther := inside.CurrentHealth(), outside.CurrentHealth(), otherUnit.CurrentHealth()
	kfcPaladinAdvance(t, sim, 5*time.Second)
	kfcPaladinNear(t, inside.CurrentHealth()-beforeInside, 4)
	kfcPaladinNear(t, outside.CurrentHealth(), beforeOutside)
	kfcPaladinNear(t, otherUnit.CurrentHealth(), beforeOther)
	inside.GainHealth(sim, inside.MaxHealth(), inside.NewHealthMetrics(core.ActionID{SpellID: 1, Tag: 123}))
	kfcPaladinAdvance(t, sim, 10*time.Second)
	kfcPaladinNear(t, inside.CurrentHealth(), inside.MaxHealth())
	inside.RemoveHealth(sim, 1000)
	beforeInside = inside.CurrentHealth()
	healer.RemoveHealth(sim, healer.CurrentHealth())
	kfcPaladinAdvance(t, sim, 15*time.Second)
	kfcPaladinNear(t, inside.CurrentHealth(), beforeInside)
	kfcPaladinNear(t, healer.CurrentHealth(), 0)
	kfcPaladinHeartMeasure("REGEN_BENEVOLENCE", []float64{4, beforeOutside, beforeOther})
}

func TestKFCPaladinRoyalSealAreaManaAndIterationReset(t *testing.T) {
	for _, area := range []string{"neutral", "haunted", "wasteland"} {
		sim, healer := kfcPaladinRegenerationFixture(t, kfcPaladinRegenerationRequest(map[int]int32{12: 18472}))
		if err := healer.ConfigureKFCPaladinItemArea(sim, area); err != nil {
			t.Fatal(err)
		}
		expected := 0.0
		if area == "haunted" {
			expected = 9
		}
		kfcPaladinNear(t, healer.GetStat(stats.MP5), expected)
		healer.SpendMana(sim, 1000, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 124}))
		before := healer.CurrentMana()
		kfcPaladinAdvance(t, sim, 10*time.Second)
		gain := healer.CurrentMana() - before
		kfcPaladinNear(t, gain, expected*2)
		if healer.kfcPaladinItemAreaEcho() != area {
			t.Fatal("Item area echo changed")
		}
		sim.Cleanup()
		sim.Reset()
		kfcPaladinNear(t, healer.GetStat(stats.MP5), expected)
		kfcPaladinHeartMeasure("REGEN_ROYAL_"+area, []float64{expected, gain})
	}
}

func TestKFCPaladinItemAreaFreshnessAndLegacyConsistency(t *testing.T) {
	for _, area := range []string{"", "Haunted", "unknown"} {
		sim, healer := kfcPaladinRegenerationFixture(t, kfcPaladinRegenerationRequest(map[int]int32{12: 18472}))
		if healer.ConfigureKFCPaladinItemArea(sim, area) == nil {
			t.Fatal("Invalid area admitted")
		}
	}
	sim, none := kfcPaladinRegenerationFixture(t, kfcPaladinRegenerationRequest(nil))
	if none.ConfigureKFCPaladinItemArea(sim, "haunted") == nil || none.kfcPaladinItemAreaEcho() != "" {
		t.Fatal("Unowned context admitted")
	}
	sim, healer := kfcPaladinRegenerationFixture(t, kfcPaladinRegenerationRequest(map[int]int32{12: 18472}))
	if healer.ConfigureKFCPaladinItemArea(sim, "haunted") != nil || healer.ConfigureKFCPaladinItemArea(sim, "neutral") == nil {
		t.Fatal("Area reconfiguration admitted")
	}
	sim, healer = kfcPaladinRegenerationFixture(t, kfcPaladinRegenerationRequest(map[int]int32{12: 18472}))
	healer.GetSpell(core.ActionID{SpellID: 10329}).Cast(sim, &healer.Unit)
	kfcPaladinAdvance(t, sim, 2500*time.Millisecond)
	if healer.ConfigureKFCPaladinItemArea(sim, "haunted") == nil {
		t.Fatal("Area changed after casting")
	}
	request, frame := kfcPaladinWorkloadControl()
	request.Raid.Parties[0].Players[0] = kfcPaladinRegenerationRequest(map[int]int32{12: 18472, 13: 20512}).Raid.Parties[0].Players[0]
	haunted, neutral := "haunted", "neutral"
	frame.ItemArea, frame.OrbArea = &haunted, &neutral
	if reply := RunKFCPaladinHealingJob(context.Background(), kfcPaladinWorkloadPayload(t, request, frame, "paladin-area-conflict", false)); reply.Status != "error" {
		t.Fatal("Conflicting area references admitted")
	}
}

func TestKFCPaladinDragonMarkOwnershipCategoryAndBusyGuard(t *testing.T) {
	_, unowned := kfcPaladinRegenerationFixture(t, kfcPaladinRegenerationRequest(nil))
	if unowned.GetSpell(core.ActionID{SpellID: 17252}) != nil || unowned.validateKFCPaladinHealingCooldowns([]KFCPaladinHealingCooldown{{SpellID: 17252}}) == nil {
		t.Fatal("Unowned ring admitted")
	}
	sim, healer := kfcPaladinRegenerationFixture(t, kfcPaladinRegenerationRequest(map[int]int32{10: 13143, 12: 18371}))
	spell := healer.GetSpell(core.ActionID{SpellID: 17252})
	if spell == nil || spell.SharedCD.Timer != nil || spell.DefaultCast.GCD != 0 || spell.DefaultCast.CastTime != 0 || healer.validateKFCPaladinHealingCooldowns([]KFCPaladinHealingCooldown{{SpellID: 17252}}) != nil {
		t.Fatal("Owned ring category or admission changed")
	}
	healer.SpendMana(sim, 1000, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 125}))
	if !spell.Cast(sim, &healer.Unit) || spell.CD.ReadyAt() != 1800*time.Second {
		t.Fatal("Ring duration changed")
	}
	if !healer.GetSpell(core.ActionID{SpellID: 1302205}).Cast(sim, &healer.Unit) {
		t.Fatal("Ring incorrectly blocked independent mana trinket")
	}
	sim, healer = kfcPaladinRegenerationFixture(t, kfcPaladinRegenerationRequest(map[int]int32{10: 13143}))
	healer.GetSpell(core.ActionID{SpellID: 10329}).Cast(sim, &healer.Unit)
	if healer.GetSpell(core.ActionID{SpellID: 17252}).CanCast(sim, &healer.Unit) {
		t.Fatal("Busy ring use admitted")
	}
}

func TestKFCPaladinDragonMarkAbsorbManaDepletionAndDeath(t *testing.T) {
	sim, healer := kfcPaladinRegenerationFixture(t, kfcPaladinRegenerationRequest(map[int]int32{10: 13143}))
	spell := healer.GetSpell(core.ActionID{SpellID: 17252})
	healer.AddStatDynamic(sim, stats.HealingPower, 100000)
	healer.SpendMana(sim, 2000, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 126}))
	before := healer.CurrentHealth()
	if !spell.Cast(sim, &healer.Unit) {
		t.Fatal("Ring use failed")
	}
	kfcPaladinRegenerationDamage(sim, healer, 200)
	kfcPaladinNear(t, healer.CurrentHealth(), before)
	kfcPaladinNear(t, spell.SelfShield().RemainingAbsorb(), 300)
	kfcPaladinAdvance(t, sim, 5*time.Second)
	gain, _ := kfcPaladinRegenerationMana(healer, 17252)
	kfcPaladinNear(t, gain, 22)
	kfcPaladinRegenerationDamage(sim, healer, 400)
	kfcPaladinNear(t, healer.CurrentHealth(), before-100)
	if spell.SelfShield().IsActive() {
		t.Fatal("Depleted shield still active")
	}
	kfcPaladinAdvance(t, sim, 20*time.Second)
	gain, _ = kfcPaladinRegenerationMana(healer, 17252)
	kfcPaladinNear(t, gain, 22)
	metrics := spell.SpellMetrics[healer.UnitIndex]
	kfcPaladinNear(t, metrics.TotalShielding, 500)
	kfcPaladinNear(t, metrics.TotalAbsorbedShielding, 500)
	kfcPaladinNear(t, metrics.TotalHealing, 0)
	kfcPaladinHeartMeasure("REGEN_MARK_ABSORB", []float64{gain, metrics.TotalShielding, metrics.TotalAbsorbedShielding})
	sim.Cleanup()
	sim.Reset()
	if !spell.Cast(sim, &healer.Unit) {
		t.Fatal("Ring did not reset")
	}
	beforeDeath, _ := kfcPaladinRegenerationMana(healer, 17252)
	healer.RemoveHealth(sim, healer.CurrentHealth())
	kfcPaladinAdvance(t, sim, 10*time.Second)
	gain, _ = kfcPaladinRegenerationMana(healer, 17252)
	kfcPaladinNear(t, gain, beforeDeath)
}

func TestKFCPaladinDragonMarkNaturalExpiryManualCancelAndCaps(t *testing.T) {
	for _, cancel := range []bool{false, true} {
		sim, healer := kfcPaladinRegenerationFixture(t, kfcPaladinRegenerationRequest(map[int]int32{10: 13143}))
		spell := healer.GetSpell(core.ActionID{SpellID: 17252})
		if !spell.Cast(sim, &healer.Unit) {
			t.Fatal("Ring expiry control failed")
		}
		if cancel {
			kfcPaladinAdvance(t, sim, 6*time.Second)
			spell.SelfShield().Deactivate(sim)
		}
		kfcPaladinAdvance(t, sim, 1800*time.Second)
		gain, actual := kfcPaladinRegenerationMana(healer, 17252)
		expected := 22.0 * 360
		if cancel {
			expected = 22
		}
		kfcPaladinNear(t, gain, expected)
		kfcPaladinNear(t, actual, 0)
		if spell.SelfShield().IsActive() {
			t.Fatal("Expired shield stayed active")
		}
		kfcPaladinAdvance(t, sim, 1810*time.Second)
		later, _ := kfcPaladinRegenerationMana(healer, 17252)
		kfcPaladinNear(t, later, expected)
		kfcPaladinHeartMeasure(fmt.Sprintf("REGEN_MARK_EXPIRY_%t", cancel), []float64{gain, actual})
	}
}

func TestKFCPaladinRegenerationActualWorkloadsAndAreaEcho(t *testing.T) {
	for _, entry := range []struct {
		name      string
		equipment map[int]int32
		area      string
		mark      bool
	}{{"mark", map[int]int32{10: 13143}, "", true}, {"seal-neutral", map[int]int32{12: 18472}, "neutral", false}, {"seal-haunted", map[int]int32{12: 18472}, "haunted", false}, {"seal-wasteland", map[int]int32{12: 18472}, "wasteland", false}, {"baron", map[int]int32{14: 6323}, "", false}, {"runeblade", map[int]int32{14: 13505}, "", false}, {"orb-seal-haunted", map[int]int32{12: 18472, 13: 20512}, "haunted", false}} {
		request, frame := kfcPaladinWorkloadControl()
		request.Raid.Parties[0].Players[0] = kfcPaladinRegenerationRequest(entry.equipment).Raid.Parties[0].Players[0]
		request.Encounter.Duration = 60
		request.SimOptions.Iterations = 4
		frame.Damage = nil
		for second := int64(1); second < 60; second++ {
			frame.Damage = append(frame.Damage, KFCPaladinHealingDamageEvent{AtMS: second * 1000, RaidIndex: 1, Amount: 200})
		}
		if entry.area != "" {
			frame.ItemArea = &entry.area
		}
		if entry.mark {
			frame.Cooldowns = []KFCPaladinHealingCooldown{{SpellID: 17252, MinimumMissingMana: 1, RequireHealingDemand: true}}
		}
		if entry.equipment[13] == 20512 {
			frame.Cooldowns = []KFCPaladinHealingCooldown{{ItemID: 20512, MinimumMissingMana: 1, RequireHealingDemand: true}}
		}
		payload := kfcPaladinWorkloadPayload(t, request, frame, "paladin-regeneration-"+entry.name, true)
		reply := RunKFCPaladinHealingJob(context.Background(), payload)
		result := kfcPaladinRequireReply(t, reply)
		if result.SurvivalRate != 1 || result.ItemArea != entry.area {
			t.Fatal("Regeneration survival or area echo changed", entry.name, result.ItemArea)
		}
		metrics := &proto.RaidMetrics{}
		if err := protojson.Unmarshal(result.Metrics, metrics); err != nil {
			t.Fatal(err)
		}
		if entry.mark {
			gain := 0.0
			for _, row := range metrics.Parties[0].Players[0].Resources {
				if row.Id.GetSpellId() == 17252 {
					gain += row.Gain
				}
			}
			if gain <= 0 {
				t.Fatal("Actual ring workload restored no mana")
			}
			kfcPaladinNear(t, result.AbsorbedHPS, 0)
		}
		if entry.equipment[13] == 20512 && result.OrbArea != entry.area {
			t.Fatal("Unified area did not configure Orb")
		}
		kfcPaladinHeartMeasure("REGEN_WORKLOAD_REQUEST", json.RawMessage(payload))
		kfcPaladinHeartMeasure("REGEN_WORKLOAD_"+entry.name, []float64{result.HPS, result.ManaRemainingMean, result.AbsorbedHPS})
	}
}
