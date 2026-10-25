package healing

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
)

func kfcEmblemRequest(equipped bool) *proto.RaidSimRequest {
	request := kfcWorkloadRequest(100000, 1, 60)
	player := request.Raid.Parties[0].Players[0]
	player.Equipment = kfcItemEquipment()
	player.Rotation = &proto.APLRotation{Type: proto.APLRotation_TypeAPL}
	if equipped {
		player.Equipment.Items[12] = &proto.ItemSpec{Id: 22268}
	}
	request.SimOptions.Interactive, request.SimOptions.IsTest = true, true
	request.Encounter.Targets[0].Level = 60
	return request
}

func kfcEmblemFixture(mob proto.MobType) (*core.Simulation, *HealingPriest, *core.Unit) {
	request := kfcEmblemRequest(true)
	request.Encounter.Targets[0].MobType = mob
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	healer := sim.Raid.Parties[0].Players[0].(*HealingPriest)
	return sim, healer, sim.Encounter.TargetUnits[0]
}

func TestKFCPriestEmblemHarmfulCastAndHealingExclusion(t *testing.T) {
	sim, healer, enemy := kfcEmblemFixture(proto.MobType_MobTypeUndead)
	aura := healer.GetAura("Draconic Infusion")
	if aura == nil || aura.ActionID.SpellID != 1318930 || aura.IsActive() {
		t.Fatal("The Emblem passive was missing or active before any cast")
	}
	target := &sim.Raid.GetFirstTargetDummy().Unit
	target.RemoveHealth(sim, 3000)
	if !healer.FlashHeal[7].Cast(sim, target) {
		t.Fatal("The healing exclusion control did not cast")
	}
	kfcPriestAdvance(t, sim, 1500*time.Millisecond)
	if aura.IsActive() {
		t.Fatal("A direct healing cast activated the harmful-cast-only item")
	}
	if !healer.Renew[9].Cast(sim, target) {
		t.Fatal("The periodic healing exclusion control did not cast")
	}
	if aura.IsActive() {
		t.Fatal("A Renew parent cast activated the harmful-cast-only item")
	}
	kfcPriestAdvance(t, sim, 18*time.Second)
	if aura.IsActive() {
		t.Fatal("Direct or periodic healing activated a harmful-cast-only item")
	}
	if !healer.Smite[8].Cast(sim, enemy) {
		t.Fatal("The harmful cast control did not cast")
	}
	kfcPriestAdvance(t, sim, 19*time.Second)
	if aura.IsActive() {
		t.Fatal("A cast triggered the Emblem before completing")
	}
	kfcPriestAdvance(t, sim, 20500*time.Millisecond)
	if !aura.IsActive() || aura.ExpiresAt() != 30500*time.Millisecond {
		t.Fatal("A completed harmful cast failed to activate the ten-second buff")
	}
}

func kfcEmblemActualHealing(t *testing.T, mob proto.MobType, active bool) float64 {
	t.Helper()
	sim, healer, _ := kfcEmblemFixture(mob)
	target := &sim.Raid.GetFirstTargetDummy().Unit
	target.MobType = proto.MobType_MobTypeDragonkin
	target.RemoveHealth(sim, 4000)
	if active {
		healer.GetAura("Draconic Infusion").Activate(sim)
	}
	spell := healer.FlashHeal[7]
	spell.BonusCritRating = -10000
	if !spell.Cast(sim, target) {
		t.Fatal("The equipped Emblem healing control did not cast")
	}
	kfcPriestAdvance(t, sim, 1500*time.Millisecond)
	return spell.SpellMetrics[target.UnitIndex].TotalHealing
}

func TestKFCPriestEmblemPayloadAndDragonkinDamage(t *testing.T) {
	values := map[string][]float64{}
	for _, tc := range []struct {
		name        string
		mob         proto.MobType
		damageBonus float64
	}{{"undead", proto.MobType_MobTypeUndead, 35}, {"dragonkin", proto.MobType_MobTypeDragonkin, 70}} {
		t.Run(tc.name, func(t *testing.T) {
			sim, healer, enemy := kfcEmblemFixture(tc.mob)
			aura := healer.GetAura("Draconic Infusion")
			beforePower := healer.GetStat(stats.SpellPower)
			beforeDamage := healer.Smite[8].GetBonusDamage(enemy)
			aura.Activate(sim)
			kfcPriestNear(t, healer.GetStat(stats.SpellPower)-beforePower, 35)
			kfcPriestNear(t, healer.Smite[8].GetBonusDamage(enemy)-beforeDamage, tc.damageBonus)
			healing := kfcEmblemActualHealing(t, tc.mob, true) - kfcEmblemActualHealing(t, tc.mob, false)
			kfcPriestNear(t, healing, 35*.429)
			values[tc.name] = []float64{healer.Smite[8].GetBonusDamage(enemy) - beforeDamage, healing}
		})
	}
	encoded, err := json.Marshal(values)
	if err != nil {
		t.Fatal(err)
	}
	fmt.Printf("KFC_HEALER_EMBLEM_VALUES %s\n", encoded)
}

func TestKFCPriestEmblemRefreshExpiryAndReset(t *testing.T) {
	sim, healer, enemy := kfcEmblemFixture(proto.MobType_MobTypeDragonkin)
	aura := healer.GetAura("Draconic Infusion")
	beforePower, beforeDamage := healer.GetStat(stats.SpellPower), healer.Smite[8].GetBonusDamage(enemy)
	aura.Activate(sim)
	kfcPriestAdvance(t, sim, 9*time.Second)
	aura.Activate(sim)
	kfcPriestNear(t, healer.GetStat(stats.SpellPower)-beforePower, 35)
	kfcPriestNear(t, healer.Smite[8].GetBonusDamage(enemy)-beforeDamage, 70)
	kfcPriestAdvance(t, sim, 18999*time.Millisecond)
	if !aura.IsActive() {
		t.Fatal("The Emblem buff did not refresh")
	}
	kfcPriestAdvance(t, sim, 19*time.Second)
	if aura.IsActive() {
		t.Fatal("The Emblem buff did not expire")
	}
	kfcPriestNear(t, healer.GetStat(stats.SpellPower), beforePower)
	kfcPriestNear(t, healer.Smite[8].GetBonusDamage(enemy), beforeDamage)
	aura.Activate(sim)
	sim.Cleanup()
	sim.Reset()
	if aura.IsActive() {
		t.Fatal("The Emblem buff leaked into the next iteration")
	}
	kfcPriestNear(t, healer.GetStat(stats.SpellPower), beforePower)
	kfcPriestNear(t, healer.Smite[8].GetBonusDamage(enemy), beforeDamage)
}

func TestKFCPriestEmblemPeriodicDamageExclusion(t *testing.T) {
	sim, healer, enemy := kfcEmblemFixture(proto.MobType_MobTypeUndead)
	aura := healer.GetAura("Draconic Infusion")
	spell := healer.ShadowWordPain[8]
	if !spell.Cast(sim, enemy) || !aura.IsActive() {
		t.Fatal("The real periodic-damage parent did not trigger the item")
	}
	aura.Deactivate(sim)
	kfcPriestAdvance(t, sim, 15*time.Second)
	if aura.IsActive() {
		t.Fatal("A periodic damage tick retriggered the cast-only buff")
	}
	if spell.SpellMetrics[enemy.UnitIndex].Ticks+spell.SpellMetrics[enemy.UnitIndex].CritTicks < 1 {
		t.Fatal("The exclusion control did not deliver actual damage ticks")
	}
}

func TestKFCPriestEmblemRequiresEquipmentAndHasNoOnUse(t *testing.T) {
	sim, healer, _ := kfcEmblemFixture(proto.MobType_MobTypeDragonkin)
	if healer.GetInitialMajorCooldown(core.ActionID{ItemID: 22268}).Spell != nil || healer.GetSpell(core.ActionID{ItemID: 22268}) != nil {
		t.Fatal("The passive Emblem retained its obsolete on-use spell")
	}
	if err := healer.validateKFCHealingCooldowns([]KFCHealingCooldown{{ItemID: 22268}}); err == nil {
		t.Fatal("The resource driver admitted a passive item")
	}
	sim.Cleanup()
	sim = core.NewSim(kfcEmblemRequest(false), simsignals.CreateSignals())
	sim.Reset()
	healer = sim.Raid.Parties[0].Players[0].(*HealingPriest)
	if healer.GetAura("Draconic Infusion") != nil || healer.GetAura("Draconic Infusion Trigger") != nil {
		t.Fatal("An unequipped Emblem granted a proc")
	}
}

func TestKFCPriestEmblemExternalInputs(t *testing.T) {
	jobs := map[string]KFCHealingJob{}
	var reference float64
	for _, equipped := range []bool{false, true} {
		name := "emblemNone"
		if equipped {
			name = "emblemHealOnly"
		}
		job := kfcHealingProtocolJob(t, "external-"+name, kfcEmblemRequest(equipped), kfcTankWorkload(60), true)
		reply := RunKFCHealingJob(context.Background(), kfcHealingJobJSON(t, job))
		if reply.Status != "complete" || reply.Result == nil || reply.Result.HPS <= 0 {
			t.Fatalf("Emblem runner control failed: %+v", reply.Error)
		}
		if equipped {
			kfcPriestNear(t, reply.Result.HPS, reference)
		} else {
			reference = reply.Result.HPS
		}
		jobs[name] = job
	}
	encoded, err := json.Marshal(jobs)
	if err != nil {
		t.Fatal(err)
	}
	fmt.Printf("KFC_HEALER_EMBLEM_INPUTS %s\n", encoded)
}
