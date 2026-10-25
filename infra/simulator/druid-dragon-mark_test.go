package restoration

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

func kfcDruidMarkRequest(owned bool) *proto.RaidSimRequest {
	request := kfcDruidItemRequest()
	request.Encounter.Duration = 1850
	if owned {
		request.Raid.Parties[0].Players[0].Equipment.Items[10] = &proto.ItemSpec{Id: 13143}
	}
	return request
}

func kfcDruidMarkFixture(t *testing.T, request *proto.RaidSimRequest) (*core.Simulation, *RestorationDruid) {
	t.Helper()
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	healer := sim.Raid.Parties[0].Players[0].(*RestorationDruid)
	healer.PseudoStats.SpiritRegenMultiplier = 0
	healer.AddStatDynamic(sim, stats.MP5, -healer.GetStat(stats.MP5))
	healer.UpdateManaRegenRates()
	if err := healer.ConfigureKFCHealingBenchmarkHealth(sim, 3000); err != nil {
		t.Fatal(err)
	}
	return sim, healer
}

func TestKFCDruidDragonMarkOwnershipAndIndependentCooldown(t *testing.T) {
	_, unowned := kfcDruidMarkFixture(t, kfcDruidMarkRequest(false))
	if unowned.GetSpell(core.ActionID{SpellID: 17252}) != nil || unowned.validateKFCDruidHealingCooldowns([]KFCDruidHealingCooldown{{SpellID: 17252}}) == nil {
		t.Fatal("Unowned ring ability admitted")
	}
	request := kfcDruidMarkRequest(true)
	request.Raid.Parties[0].Players[0].Equipment.Items[12] = &proto.ItemSpec{Id: 18371}
	sim, healer := kfcDruidMarkFixture(t, request)
	spell := healer.GetSpell(core.ActionID{SpellID: 17252})
	if spell == nil || healer.validateKFCDruidHealingCooldowns([]KFCDruidHealingCooldown{{SpellID: 17252}}) != nil {
		t.Fatal("Owned ring unavailable")
	}
	if core.HasItemEffect(13143) || spell.SharedCD.Timer != nil {
		t.Fatal("Class scope or independent item category changed")
	}
	if !spell.Cast(sim, &healer.Unit) || !healer.GetSpell(core.ActionID{SpellID: 1302205}).Cast(sim, &healer.Unit) {
		t.Fatal("Ring incorrectly shares a trinket cooldown")
	}
	if spell.CD.ReadyAt() != 30*time.Minute {
		t.Fatal("Incorrect ring cooldown")
	}
}

func TestKFCDruidDragonMarkAbsorptionStopsLinkedMana(t *testing.T) {
	sim, healer := kfcDruidMarkFixture(t, kfcDruidMarkRequest(true))
	spell := healer.GetSpell(core.ActionID{SpellID: 17252})
	kfcDruidItemSpend(sim, healer, 1000)
	if !spell.Cast(sim, &healer.Unit) {
		t.Fatal("Ring failed")
	}
	kfcSelfDamage(sim, healer, 200)
	kfcDruidNear(t, healer.CurrentHealth(), 3000)
	kfcDruidNear(t, spell.SelfShield().RemainingAbsorb(), 300)
	kfcDruidAdvance(t, sim, 4999*time.Millisecond)
	gain, _ := kfcDruidItemMana(healer, 17252)
	kfcDruidNear(t, gain, 0)
	kfcDruidAdvance(t, sim, 5*time.Second)
	gain, _ = kfcDruidItemMana(healer, 17252)
	kfcDruidNear(t, gain, 22)
	kfcSelfDamage(sim, healer, 400)
	kfcDruidNear(t, healer.CurrentHealth(), 2900)
	if spell.SelfShield().IsActive() {
		t.Fatal("Depleted shield remains active")
	}
	kfcDruidAdvance(t, sim, 20*time.Second)
	gain, _ = kfcDruidItemMana(healer, 17252)
	kfcDruidNear(t, gain, 22)
	metrics := spell.SpellMetrics[healer.UnitIndex]
	kfcDruidNear(t, metrics.TotalShielding, 500)
	kfcDruidNear(t, metrics.TotalAbsorbedShielding, 500)
	kfcDruidNear(t, metrics.TotalHealing, 0)
	if spell.IsReady(sim) {
		t.Fatal("Shield depletion cleared the personal cooldown")
	}
	kfcDruidAdvancedResult("MARK_ABSORB_MANA", []float64{healer.CurrentHealth(), metrics.TotalShielding, metrics.TotalAbsorbedShielding, gain})
}

func TestKFCDruidDragonMarkAllSchoolsAndNoHealingCoefficient(t *testing.T) {
	output := []float64{}
	for _, school := range []core.SpellSchool{core.SpellSchoolPhysical, core.SpellSchoolHoly, core.SpellSchoolFire, core.SpellSchoolNature, core.SpellSchoolFrost, core.SpellSchoolShadow, core.SpellSchoolArcane} {
		request := kfcDruidMarkRequest(true)
		request.Raid.Parties[0].Players[0].BonusStats.Stats[stats.HealingPower] = 1000
		sim, healer := kfcDruidMarkFixture(t, request)
		spell := healer.GetSpell(core.ActionID{SpellID: 17252})
		if !spell.Cast(sim, &healer.Unit) {
			t.Fatal("All-school shield failed")
		}
		incoming := sim.Encounter.TargetUnits[0].RegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: 1, Tag: 993}, SpellSchool: school, ProcMask: core.ProcMaskSpellDamage, DamageMultiplier: 1})
		result := incoming.NewResult(&healer.Unit)
		result.Damage = 600
		result.Outcome = core.OutcomeHit
		incoming.DealDamage(sim, result)
		kfcDruidNear(t, healer.CurrentHealth(), 2900)
		kfcDruidNear(t, spell.SpellMetrics[healer.UnitIndex].TotalAbsorbedShielding, 500)
		output = append(output, float64(school), healer.CurrentHealth())
	}
	kfcDruidAdvancedResult("MARK_SCHOOLS", output)
}

func TestKFCDruidDragonMarkManaCapsAndDeath(t *testing.T) {
	sim, healer := kfcDruidMarkFixture(t, kfcDruidMarkRequest(true))
	spell := healer.GetSpell(core.ActionID{SpellID: 17252})
	if !spell.Cast(sim, &healer.Unit) {
		t.Fatal("Full-mana shield failed")
	}
	kfcDruidAdvance(t, sim, 10*time.Second)
	gain, actual := kfcDruidItemMana(healer, 17252)
	kfcDruidNear(t, gain, 44)
	kfcDruidNear(t, actual, 0)
	sim, healer = kfcDruidMarkFixture(t, kfcDruidMarkRequest(true))
	spell = healer.GetSpell(core.ActionID{SpellID: 17252})
	kfcDruidItemSpend(sim, healer, 1000)
	if !spell.Cast(sim, &healer.Unit) {
		t.Fatal("Death control shield failed")
	}
	kfcDruidAdvance(t, sim, 5*time.Second)
	kfcSelfDamage(sim, healer, 3500)
	kfcDruidNear(t, healer.CurrentHealth(), 0)
	kfcDruidAdvance(t, sim, 20*time.Second)
	gain, _ = kfcDruidItemMana(healer, 17252)
	kfcDruidNear(t, gain, 22)
	if spell.CanCast(sim, &healer.Unit) {
		t.Fatal("Dead caster can activate ring")
	}
	kfcDruidAdvancedResult("MARK_CAP_DEATH", []float64{actual, gain})
}

func TestKFCDruidDragonMarkNaturalExpiryFinalTickAndCooldown(t *testing.T) {
	sim, healer := kfcDruidMarkFixture(t, kfcDruidMarkRequest(true))
	spell := healer.GetSpell(core.ActionID{SpellID: 17252})
	kfcDruidItemSpend(sim, healer, 9000)
	if !spell.Cast(sim, &healer.Unit) {
		t.Fatal("Expiry control failed")
	}
	kfcDruidAdvance(t, sim, 1799999*time.Millisecond)
	gain, _ := kfcDruidItemMana(healer, 17252)
	kfcDruidNear(t, gain, 359*22)
	if !spell.SelfShield().IsActive() || spell.IsReady(sim) {
		t.Fatal("Shield/cooldown ended early")
	}
	kfcDruidAdvance(t, sim, 1800*time.Second)
	gain, actual := kfcDruidItemMana(healer, 17252)
	kfcDruidNear(t, gain, 360*22)
	kfcDruidNear(t, actual, 360*22)
	if spell.SelfShield().IsActive() || !spell.IsReady(sim) {
		t.Fatal("Natural expiry/cooldown did not complete")
	}
	kfcDruidAdvance(t, sim, 1805*time.Second)
	gain, _ = kfcDruidItemMana(healer, 17252)
	kfcDruidNear(t, gain, 360*22)
	kfcDruidNear(t, spell.SpellMetrics[healer.UnitIndex].TotalAbsorbedShielding, 0)
	kfcDruidAdvancedResult("MARK_EXPIRY", []float64{gain, actual})
}

func TestKFCDruidDragonMarkCancellationRefreshAndReset(t *testing.T) {
	sim, healer := kfcDruidMarkFixture(t, kfcDruidMarkRequest(true))
	spell := healer.GetSpell(core.ActionID{SpellID: 17252})
	kfcDruidItemSpend(sim, healer, 1000)
	if !spell.Cast(sim, &healer.Unit) {
		t.Fatal("Refresh control failed")
	}
	kfcDruidAdvance(t, sim, 2*time.Second)
	spell.SelfShield().Apply(sim, 500)
	kfcDruidAdvance(t, sim, 5*time.Second)
	gain, _ := kfcDruidItemMana(healer, 17252)
	kfcDruidNear(t, gain, 0)
	kfcDruidAdvance(t, sim, 7*time.Second)
	gain, _ = kfcDruidItemMana(healer, 17252)
	kfcDruidNear(t, gain, 22)
	spell.SelfShield().Deactivate(sim)
	kfcDruidAdvance(t, sim, 20*time.Second)
	gain, _ = kfcDruidItemMana(healer, 17252)
	kfcDruidNear(t, gain, 22)
	sim.Cleanup()
	sim.Reset()
	kfcDruidItemSpend(sim, healer, 1000)
	if !spell.IsReady(sim) || spell.SelfShield().IsActive() {
		t.Fatal("Ring leaked across iterations")
	}
	kfcDruidAdvance(t, sim, 5*time.Second)
	gain, _ = kfcDruidItemMana(healer, 17252)
	kfcDruidNear(t, gain, 22)
	if !spell.Cast(sim, &healer.Unit) {
		t.Fatal("Reset ring cannot activate")
	}
	kfcDruidAdvance(t, sim, 10*time.Second)
	gain, _ = kfcDruidItemMana(healer, 17252)
	kfcDruidNear(t, gain, 44)
	kfcDruidAdvancedResult("MARK_RESET", gain)
}

func TestKFCDruidDragonMarkAlwaysShieldsSelf(t *testing.T) {
	sim, healer := kfcDruidMarkFixture(t, kfcDruidMarkRequest(true))
	spell := healer.GetSpell(core.ActionID{SpellID: 17252})
	target := &sim.Raid.GetFirstTargetDummy().Unit
	if !spell.Cast(sim, target) || !spell.SelfShield().IsActive() {
		t.Fatal("Selected target redirected a self-only item")
	}
	kfcSelfDamage(sim, healer, 500)
	kfcDruidNear(t, healer.CurrentHealth(), 3000)
}

func TestKFCDruidDragonMarkEquippedWorkloadControls(t *testing.T) {
	for index := 0; index < 6; index++ {
		request, frame := kfcDruidWorkloadControl()
		player := request.Raid.Parties[0].Players[0]
		player.BonusStats = nil
		player.Equipment = &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
		for slot, id := range kfcDruidEquippedControlIds {
			player.Equipment.Items[slot] = &proto.ItemSpec{Id: id}
		}
		player.Equipment.Items[10].Id = 13143
		player.Equipment.Items[16].Id = 22398
		if index > 0 {
			frame.Cooldowns = []KFCDruidHealingCooldown{{SpellID: 17252}}
		}
		if index == 2 || index == 3 {
			frame.AllowCasterDamage = true
			frame.Targets[0].MaximumHealth = 3000
			if index == 2 {
				frame.Damage = append(frame.Damage, KFCDruidHealingDamageEvent{AtMS: 1000, RaidIndex: 0, Amount: 200}, KFCDruidHealingDamageEvent{AtMS: 7000, RaidIndex: 0, Amount: 400})
			} else {
				frame.Damage = []KFCDruidHealingDamageEvent{{AtMS: 1000, RaidIndex: 0, Amount: 3500}}
			}
		}
		if index == 4 {
			frame.Damage = nil
			frame.Cooldowns[0].RequireHealingDemand = true
		}
		if index == 5 {
			frame.Cooldowns[0].MinimumMissingMana = 1000
			frame.Cooldowns[0].RequireHealingDemand = true
		}
		payload := kfcDruidControlPayload(t, request, frame, fmt.Sprintf("dragon-mark-%d", index), false)
		reply := RunKFCDruidHealingJob(context.Background(), payload)
		if reply.Status != "complete" || reply.Result == nil {
			t.Fatalf("Ring workload failed: %+v", reply)
		}
		want := 1.0
		if index == 3 {
			want = 0
		}
		kfcDruidNear(t, reply.Result.SurvivalRate, want)
		if index == 2 || index == 3 {
			kfcDruidNear(t, reply.Result.AbsorbedHPS, 500/request.Encounter.Duration)
		} else {
			kfcDruidNear(t, reply.Result.AbsorbedHPS, 0)
		}
		kfcDruidAdvancedResult("MARK_EQUIPPED_REQUEST", json.RawMessage(payload))
		kfcDruidAdvancedResult("MARK_EQUIPPED_RESULT", reply)
	}
}
