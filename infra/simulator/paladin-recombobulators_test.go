package holy

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
	"google.golang.org/protobuf/encoding/protojson"
	googleProto "google.golang.org/protobuf/proto"
)

func kfcPaladinRecombRequest(ids []int32, engineering bool, conjured proto.Conjured) *proto.RaidSimRequest {
	request, _ := kfcPaladinWorkloadControl()
	request.Encounter.Duration = 900
	request.SimOptions.Interactive, request.SimOptions.IsTest = true, true
	player := request.Raid.Parties[0].Players[0]
	player.TalentsString = kfcPaladinPassiveString(1, 5)
	player.BonusStats.Stats[stats.Health] = 10000
	player.Consumes = &proto.Consumes{DefaultConjured: conjured}
	player.Profession1, player.Profession2 = proto.Profession_ProfessionUnknown, proto.Profession_ProfessionUnknown
	if engineering {
		player.Profession1 = proto.Profession_Engineering
	}
	player.Equipment = &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
	for slot := range player.Equipment.Items {
		player.Equipment.Items[slot] = &proto.ItemSpec{}
	}
	for slot, id := range ids {
		player.Equipment.Items[12+slot].Id = id
	}
	return request
}

func kfcPaladinRecombFixture(t *testing.T, ids []int32, engineering bool, conjured proto.Conjured) (*core.Simulation, *HolyPaladin) {
	t.Helper()
	sim := core.NewSim(kfcPaladinRecombRequest(ids, engineering, conjured), simsignals.CreateSignals())
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

func TestKFCPaladinRecombOwnershipProfessionAndSelection(t *testing.T) {
	for _, id := range []int32{4381, 18637} {
		for _, engineering := range []bool{false, true} {
			for _, owned := range []bool{false, true} {
				ids := []int32{}
				if owned {
					ids = append(ids, id)
				}
				_, healer := kfcPaladinRecombFixture(t, ids, engineering, proto.Conjured_ConjuredUnknown)
				allowed := owned && engineering
				if (healer.GetSpell(core.ActionID{ItemID: id}) != nil) != allowed {
					t.Fatal("Ownership or Engineering gate failed", id, owned, engineering)
				}
				if (healer.validateKFCPaladinHealingCooldowns([]KFCPaladinHealingCooldown{{ItemID: id}}) == nil) != allowed {
					t.Fatal("Explicit admission disagrees with ownership", id, owned, engineering)
				}
				if (healer.kfcPaladinRecombobulatorCriticalEcho() != nil) != allowed {
					t.Fatal("Critical echo implies unavailable item")
				}
			}
		}
	}
	for _, engineering := range []bool{false, true} {
		for _, owned := range []bool{false, true} {
			ids := []int32{}
			if owned {
				ids = append(ids, 4381)
			}
			player := kfcPaladinRecombRequest(ids, engineering, proto.Conjured_ConjuredMinorRecombobulator).Raid.Parties[0].Players[0]
			if (validateKFCPaladinWorkloadRequest(player) == nil) != (owned && engineering) {
				t.Fatal("Impossible selected consumable admitted")
			}
		}
	}
	_, healer := kfcPaladinRecombFixture(t, []int32{4381}, true, proto.Conjured_ConjuredMinorRecombobulator)
	count := 0
	for _, spell := range healer.Spellbook {
		if spell.ActionID.ItemID == 4381 {
			count++
		}
	}
	if count != 1 {
		t.Fatal("Selected consumable duplicated its equipped use", count)
	}
	func() {
		defer func() {
			if recover() == nil {
				t.Fatal("Unique-equipped duplicate was admitted")
			}
		}()
		kfcPaladinRecombFixture(t, []int32{4381, 4381}, true, proto.Conjured_ConjuredMinorRecombobulator)
	}()
}

func TestKFCPaladinRecombCurrentAmountsCriticalsAndZeroScaling(t *testing.T) {
	for _, row := range []struct {
		id                               int32
		lowHP, highHP, lowMana, highMana float64
	}{{4381, 202.5, 337.5, 96, 160}, {18637, 499.5, 832.5, 228, 380}} {
		for _, canCrit := range []bool{false, true} {
			sim, healer := kfcPaladinRecombFixture(t, []int32{row.id}, true, proto.Conjured_ConjuredUnknown)
			if err := healer.ConfigureKFCPaladinRecombobulatorCriticals(canCrit); err != nil {
				t.Fatal(err)
			}
			healer.AddStatDynamic(sim, stats.HealingPower, 100000)
			spell := healer.GetSpell(core.ActionID{ItemID: row.id})
			spell.BonusCritRating = 10000
			if spell.DefaultCast.GCD != 0 || spell.DefaultCast.CastTime != 0 {
				t.Fatal("Item gained cast time or GCD")
			}
			factor := 1.0
			if canCrit {
				factor = 1.5
			}
			totalHP, totalMana := 0.0, 0.0
			for cast := 0; cast < 10; cast++ {
				healer.GainHealth(sim, healer.MaxHealth(), healer.NewHealthMetrics(core.ActionID{SpellID: 1, Tag: 101}))
				healer.RemoveHealth(sim, 2000)
				healer.AddMana(sim, healer.MaxMana(), healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 102}))
				healer.SpendMana(sim, 1000, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 103}))
				spell.CD.Set(sim.CurrentTime)
				spell.SharedCD.Set(sim.CurrentTime)
				hp, mana := healer.CurrentHealth(), healer.CurrentMana()
				if !spell.CanCast(sim, &healer.Unit) || !spell.Cast(sim, &healer.Unit) {
					t.Fatal("Owned coupled use failed")
				}
				hp, mana = healer.CurrentHealth()-hp, healer.CurrentMana()-mana
				if hp < row.lowHP*factor || hp > row.highHP*factor || mana < row.lowMana || mana > row.highMana {
					t.Fatal("Wrong coupled bounds or coefficient", row.id, canCrit, hp, mana)
				}
				totalHP += hp
				totalMana += mana
			}
			kfcPaladinHeartMeasure(fmt.Sprintf("RECOMB_BOUNDS_%d_%t", row.id, canCrit), []float64{totalHP, totalMana})
		}
	}
}

func TestKFCPaladinRecombSameFriendlyRecipientAndCaps(t *testing.T) {
	request := kfcPaladinRecombRequest([]int32{18637}, true, proto.Conjured_ConjuredUnknown)
	request.Raid.TargetDummies = 3
	ally := googleProto.Clone(request.Raid.Parties[0].Players[0]).(*proto.Player)
	ally.Name = "Friendly mana recipient"
	ally.Equipment = &proto.EquipmentSpec{}
	ally.Consumes = &proto.Consumes{}
	request.Raid.Parties[0].Players = append(request.Raid.Parties[0].Players, ally)
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
	recipient := sim.Raid.Parties[0].Players[1].GetCharacter()
	healer.SpendMana(sim, 1000, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 104}))
	recipient.SpendMana(sim, 1000, recipient.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 104}))
	recipient.RemoveHealth(sim, 2000)
	beforeCaster, beforeMana, beforeHP := healer.CurrentMana(), recipient.CurrentMana(), recipient.CurrentHealth()
	spell := healer.GetSpell(core.ActionID{ItemID: 18637})
	if !spell.Cast(sim, &recipient.Unit) {
		t.Fatal("Friendly coupled use failed")
	}
	kfcPaladinNear(t, healer.CurrentMana(), beforeCaster)
	health, mana := recipient.CurrentHealth()-beforeHP, recipient.CurrentMana()-beforeMana
	if health < 499.5 || health > 832.5 || mana < 228 || mana > 380 {
		t.Fatal("Healing and mana did not reach same ally", health, mana)
	}
	kfcPaladinHeartMeasure("RECOMB_ALLY", []float64{health, mana})
	spell.CD.Set(sim.CurrentTime)
	spell.SharedCD.Set(sim.CurrentTime)
	recipient.GainHealth(sim, recipient.MaxHealth(), recipient.NewHealthMetrics(core.ActionID{SpellID: 1, Tag: 105}))
	recipient.AddMana(sim, recipient.MaxMana(), recipient.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 106}))
	if !spell.Cast(sim, &recipient.Unit) {
		t.Fatal("Full recipient use failed")
	}
	kfcPaladinNear(t, recipient.CurrentMana(), recipient.MaxMana())
	kfcPaladinNear(t, recipient.CurrentHealth(), recipient.MaxHealth())
	for _, row := range recipient.Metrics.ToProto().Resources {
		if row.Id.GetItemId() == 18637 {
			if row.Gain <= row.ActualGain {
				t.Fatal("Capped mana was counted as actual gain")
			}
		}
	}
}

func TestKFCPaladinRecombChargesPersonalSharedAndReset(t *testing.T) {
	sim, healer := kfcPaladinRecombFixture(t, []int32{4381, 18637}, true, proto.Conjured_ConjuredDemonicRune)
	minor, major, rune := healer.GetSpell(core.ActionID{ItemID: 4381}), healer.GetSpell(core.ActionID{ItemID: 18637}), healer.GetSpell(core.ActionID{ItemID: 12662})
	if minor == nil || major == nil || rune == nil || minor.SharedCD.Timer != major.SharedCD.Timer || minor.SharedCD.Timer != rune.CD.Timer {
		t.Fatal("Effective item category1153 is not shared")
	}
	if !minor.Cast(sim, &healer.Unit) || minor.CD.ReadyAt() != 300*time.Second || minor.SharedCD.ReadyAt() != 120*time.Second {
		t.Fatal("Item personal/shared duration changed")
	}
	if major.CanCast(sim, &healer.Unit) || rune.CanCast(sim, &healer.Unit) {
		t.Fatal("Shared peer ready too early")
	}
	kfcPaladinAdvance(t, sim, 120*time.Second-time.Millisecond)
	if major.CanCast(sim, &healer.Unit) {
		t.Fatal("Shared peer unlocked early")
	}
	kfcPaladinAdvance(t, sim, 120*time.Second)
	if !major.CanCast(sim, &healer.Unit) || !major.Cast(sim, &healer.Unit) {
		t.Fatal("Shared peer did not unlock")
	}
	if minor.CanCast(sim, &healer.Unit) {
		t.Fatal("Personal cooldown bypassed")
	}
	for use := 1; use < 10; use++ {
		minor.CD.Set(sim.CurrentTime)
		minor.SharedCD.Set(sim.CurrentTime)
		if !minor.Cast(sim, &healer.Unit) {
			t.Fatal("Charges exhausted early", use)
		}
	}
	minor.CD.Set(sim.CurrentTime)
	minor.SharedCD.Set(sim.CurrentTime)
	if minor.CanCast(sim, &healer.Unit) {
		t.Fatal("Eleventh charged use admitted")
	}
	sim.Cleanup()
	sim.Reset()
	if !minor.CanCast(sim, &healer.Unit) || healer.recombobulators.charges[4381] != 10 || healer.recombobulators.charges[18637] != 10 {
		t.Fatal("Fully charged iteration reference failed reset")
	}
	kfcPaladinHeartMeasure("RECOMB_CHARGES", []int{healer.recombobulators.charges[4381], healer.recombobulators.charges[18637]})
}

func TestKFCPaladinRecombRangeBusyDeathAndResearchFreshness(t *testing.T) {
	sim, healer := kfcPaladinRecombFixture(t, []int32{18637}, true, proto.Conjured_ConjuredUnknown)
	spell := healer.GetSpell(core.ActionID{ItemID: 18637})
	target := &sim.Raid.GetFirstTargetDummy().Unit
	healer.KFCHealing.positions[target.UnitIndex] = KFCPaladinFriendlyPosition{X: 30}
	if !spell.CanCast(sim, target) {
		t.Fatal("Thirty yard friendly rejected")
	}
	healer.KFCHealing.positions[target.UnitIndex] = KFCPaladinFriendlyPosition{X: 30.01}
	if spell.CanCast(sim, target) {
		t.Fatal("Out-of-range friendly admitted")
	}
	healer.KFCHealing.positions[target.UnitIndex] = KFCPaladinFriendlyPosition{}
	if !healer.GetSpell(core.ActionID{SpellID: 10329}).Cast(sim, target) {
		t.Fatal("Busy control did not start")
	}
	if spell.CanCast(sim, target) || healer.ConfigureKFCPaladinRecombobulatorCriticals(true) == nil {
		t.Fatal("Busy use or late research admitted")
	}
	kfcPaladinAdvance(t, sim, 2500*time.Millisecond)
	if healer.ConfigureKFCPaladinRecombobulatorCriticals(true) == nil {
		t.Fatal("Research changed after a completed spell")
	}
	target.RemoveHealth(sim, target.CurrentHealth())
	if spell.CanCast(sim, target) {
		t.Fatal("Dead recipient admitted")
	}
	healer.RemoveHealth(sim, healer.CurrentHealth())
	if spell.CanCast(sim, &healer.Unit) {
		t.Fatal("Dead caster admitted")
	}
	_, fresh := kfcPaladinRecombFixture(t, []int32{4381}, true, proto.Conjured_ConjuredUnknown)
	if fresh.ConfigureKFCPaladinRecombobulatorCriticals(false) != nil || fresh.ConfigureKFCPaladinRecombobulatorCriticals(true) == nil {
		t.Fatal("Research freshness failed")
	}
}

func TestKFCPaladinRecombFriendlyControllerAndValidation(t *testing.T) {
	sim, healer := kfcPaladinRecombFixture(t, []int32{18637}, true, proto.Conjured_ConjuredUnknown)
	index, minimum := int32(1), 100.0
	policy := KFCPaladinHealingCooldown{ItemID: 18637, TargetRaidIndex: &index, MinimumMissingHealth: &minimum, MinimumMissingMana: 1000}
	if err := healer.validateKFCPaladinHealingCooldowns([]KFCPaladinHealingCooldown{policy}); err != nil {
		t.Fatal(err)
	}
	target := &sim.Raid.GetFirstTargetDummy().Unit
	target.RemoveHealth(sim, 2000)
	before := target.CurrentHealth()
	healer.useKFCPaladinHealingCooldowns(sim, KFCPaladinHealingWorkload{Cooldowns: []KFCPaladinHealingCooldown{policy}})
	if target.CurrentHealth() <= before {
		t.Fatal("Health-only friendly demand incorrectly used caster mana threshold")
	}
	for _, invalid := range []int32{-2, 5, 40} {
		policy.TargetRaidIndex = &invalid
		if healer.validateKFCPaladinHealingCooldowns([]KFCPaladinHealingCooldown{policy}) == nil {
			t.Fatal("Invalid recipient accepted", invalid)
		}
	}
	policy.TargetRaidIndex = &index
	for _, invalid := range []float64{-1, math.NaN(), math.Inf(1), 1000001} {
		policy.MinimumMissingHealth = &invalid
		if healer.validateKFCPaladinHealingCooldowns([]KFCPaladinHealingCooldown{policy}) == nil {
			t.Fatal("Invalid health threshold accepted")
		}
	}
	policy.ItemID = 13444
	policy.MinimumMissingHealth = nil
	if healer.validateKFCPaladinHealingCooldowns([]KFCPaladinHealingCooldown{policy}) == nil {
		t.Fatal("Friendly targeting leaked into potion policies")
	}
}

func TestKFCPaladinRecombActualWorkloadCriticalAndRecipientEcho(t *testing.T) {
	for _, id := range []int32{4381, 18637} {
		for _, canCrit := range []bool{false, true} {
			for _, index := range []int32{0, -1} {
				request := kfcPaladinRecombRequest([]int32{id}, true, proto.Conjured_ConjuredUnknown)
				request.Encounter.Duration = 30
				request.SimOptions.Iterations = 8
				_, frame := kfcPaladinWorkloadControl()
				frame.RecombobulatorCanCrit = &canCrit
				minimum := 100.0
				frame.Cooldowns = []KFCPaladinHealingCooldown{{ItemID: id, TargetRaidIndex: &index, MinimumMissingHealth: &minimum, MinimumMissingMana: 500}}
				frame.Priorities = []KFCPaladinHealingPriority{{SpellID: 10329, RaidIndex: 1, MinimumMissingHealth: 500}}
				frame.Targets[0].MaximumHealth = 10000
				frame.Damage = nil
				for second := int64(1); second < 30; second++ {
					frame.Damage = append(frame.Damage, KFCPaladinHealingDamageEvent{AtMS: second * 1000, RaidIndex: 1, Amount: 150})
				}
				name := fmt.Sprintf("paladin-recomb-%d-%t-%d", id, canCrit, index)
				payload := kfcPaladinWorkloadPayload(t, request, frame, name, true)
				reply := RunKFCPaladinHealingJob(context.Background(), payload)
				result := kfcPaladinRequireReply(t, reply)
				if result.RecombobulatorCanCrit == nil || *result.RecombobulatorCanCrit != canCrit || result.SurvivalRate != 1 {
					t.Fatal("Recombobulator echo or survival failed")
				}
				metrics := &proto.RaidMetrics{}
				if err := protojson.Unmarshal(result.Metrics, metrics); err != nil {
					t.Fatal(err)
				}
				uses, healing := int32(0), 0.0
				for _, action := range metrics.Parties[0].Players[0].Actions {
					if action.Id.GetItemId() == id {
						for _, target := range action.Targets {
							uses += target.Hits + target.Crits
							healing += target.Healing
						}
					}
				}
				if uses != 8 || healing <= 0 {
					t.Fatal("Actual owned friendly workload omitted charged use", name, uses, healing)
				}
				kfcPaladinHeartMeasure("RECOMB_WORKLOAD_REQUEST", json.RawMessage(payload))
				kfcPaladinHeartMeasure("RECOMB_WORKLOAD_"+name, []float64{float64(uses), healing, result.HPS, result.ManaRemainingMean})
			}
		}
	}
}
