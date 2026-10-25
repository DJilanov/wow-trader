package healing

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
	"google.golang.org/protobuf/encoding/protojson"
)

func kfcPriestMarkRequest(owned bool) *proto.RaidSimRequest {
	request := kfcWorkloadRequest(10000, 1, 1850)
	request.Encounter.Duration = 1850
	request.Raid.Parties[0].Players[0].Equipment = kfcItemEquipment()
	request.SimOptions.Interactive, request.SimOptions.IsTest = true, true
	if owned {
		request.Raid.Parties[0].Players[0].Equipment.Items[10] = &proto.ItemSpec{Id: 13143}
	}
	return request
}

func kfcPriestMarkFixture(t *testing.T, request *proto.RaidSimRequest) (*core.Simulation, *HealingPriest) {
	t.Helper()
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	healer := sim.Raid.Parties[0].Players[0].(*HealingPriest)
	healer.PseudoStats.SpiritRegenMultiplier = 0
	healer.AddStatDynamic(sim, stats.MP5, -healer.GetStat(stats.MP5))
	healer.UpdateManaRegenRates()
	if err := healer.ConfigureKFCHealingBenchmarkHealth(sim, 3000); err != nil {
		t.Fatal(err)
	}
	return sim, healer
}

func TestKFCPriestDragonMarkOwnershipAndIndependentCooldown(t *testing.T) {
	_, unowned := kfcPriestMarkFixture(t, kfcPriestMarkRequest(false))
	if unowned.GetSpell(core.ActionID{SpellID: 17252}) != nil || unowned.validateKFCHealingCooldowns([]KFCHealingCooldown{{SpellID: 17252}}) == nil {
		t.Fatal("Unowned ring ability admitted")
	}
	request := kfcPriestMarkRequest(true)
	request.Raid.Parties[0].Players[0].Equipment.Items[12] = &proto.ItemSpec{Id: 18371}
	sim, healer := kfcPriestMarkFixture(t, request)
	spell := healer.GetSpell(core.ActionID{SpellID: 17252})
	if spell == nil || healer.validateKFCHealingCooldowns([]KFCHealingCooldown{{SpellID: 17252}}) != nil {
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

func TestKFCPriestDragonMarkAbsorptionStopsLinkedMana(t *testing.T) {
	sim, healer := kfcPriestMarkFixture(t, kfcPriestMarkRequest(true))
	spell := healer.GetSpell(core.ActionID{SpellID: 17252})
	kfcPriestMarkSpend(sim, healer, 1000)
	if !spell.Cast(sim, &healer.Unit) {
		t.Fatal("Ring failed")
	}
	kfcPriestMarkDamage(sim, healer, 200)
	kfcPriestNear(t, healer.CurrentHealth(), 3000)
	kfcPriestNear(t, spell.SelfShield().RemainingAbsorb(), 300)
	kfcPriestAdvance(t, sim, 4999*time.Millisecond)
	gain, _ := kfcPriestResourceItemMana(healer, 17252)
	kfcPriestNear(t, gain, 0)
	kfcPriestAdvance(t, sim, 5*time.Second)
	gain, _ = kfcPriestResourceItemMana(healer, 17252)
	kfcPriestNear(t, gain, 22)
	kfcPriestMarkDamage(sim, healer, 400)
	kfcPriestNear(t, healer.CurrentHealth(), 2900)
	if spell.SelfShield().IsActive() {
		t.Fatal("Depleted shield remains active")
	}
	kfcPriestAdvance(t, sim, 20*time.Second)
	gain, _ = kfcPriestResourceItemMana(healer, 17252)
	kfcPriestNear(t, gain, 22)
	metrics := spell.SpellMetrics[healer.UnitIndex]
	kfcPriestNear(t, metrics.TotalShielding, 500)
	kfcPriestNear(t, metrics.TotalAbsorbedShielding, 500)
	kfcPriestNear(t, metrics.TotalHealing, 0)
	if spell.IsReady(sim) {
		t.Fatal("Shield depletion cleared the personal cooldown")
	}
	kfcPriestHeartMeasure("MARK_ABSORB_MANA", []float64{healer.CurrentHealth(), metrics.TotalShielding, metrics.TotalAbsorbedShielding, gain})
}

func TestKFCPriestDragonMarkAllSchoolsAndNoHealingCoefficient(t *testing.T) {
	output := []float64{}
	for _, school := range []core.SpellSchool{core.SpellSchoolPhysical, core.SpellSchoolHoly, core.SpellSchoolFire, core.SpellSchoolNature, core.SpellSchoolFrost, core.SpellSchoolShadow, core.SpellSchoolArcane} {
		request := kfcPriestMarkRequest(true)
		request.Raid.Parties[0].Players[0].BonusStats.Stats[stats.HealingPower] = 1000
		sim, healer := kfcPriestMarkFixture(t, request)
		spell := healer.GetSpell(core.ActionID{SpellID: 17252})
		if !spell.Cast(sim, &healer.Unit) {
			t.Fatal("All-school shield failed")
		}
		incoming := sim.Encounter.TargetUnits[0].RegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: 1, Tag: 993}, SpellSchool: school, ProcMask: core.ProcMaskSpellDamage, DamageMultiplier: 1})
		result := incoming.NewResult(&healer.Unit)
		result.Damage = 600
		result.Outcome = core.OutcomeHit
		incoming.DealDamage(sim, result)
		kfcPriestNear(t, healer.CurrentHealth(), 2900)
		kfcPriestNear(t, spell.SpellMetrics[healer.UnitIndex].TotalAbsorbedShielding, 500)
		output = append(output, float64(school), healer.CurrentHealth())
	}
	kfcPriestHeartMeasure("MARK_SCHOOLS", output)
}

func TestKFCPriestDragonMarkManaCapsAndDeath(t *testing.T) {
	sim, healer := kfcPriestMarkFixture(t, kfcPriestMarkRequest(true))
	spell := healer.GetSpell(core.ActionID{SpellID: 17252})
	if !spell.Cast(sim, &healer.Unit) {
		t.Fatal("Full-mana shield failed")
	}
	kfcPriestAdvance(t, sim, 10*time.Second)
	gain, actual := kfcPriestResourceItemMana(healer, 17252)
	kfcPriestNear(t, gain, 44)
	kfcPriestNear(t, actual, 0)
	sim, healer = kfcPriestMarkFixture(t, kfcPriestMarkRequest(true))
	spell = healer.GetSpell(core.ActionID{SpellID: 17252})
	kfcPriestMarkSpend(sim, healer, 1000)
	if !spell.Cast(sim, &healer.Unit) {
		t.Fatal("Death control shield failed")
	}
	kfcPriestAdvance(t, sim, 5*time.Second)
	kfcPriestMarkDamage(sim, healer, 3500)
	kfcPriestNear(t, healer.CurrentHealth(), 0)
	kfcPriestAdvance(t, sim, 20*time.Second)
	gain, _ = kfcPriestResourceItemMana(healer, 17252)
	kfcPriestNear(t, gain, 22)
	if spell.CanCast(sim, &healer.Unit) {
		t.Fatal("Dead caster can activate ring")
	}
	kfcPriestHeartMeasure("MARK_CAP_DEATH", []float64{actual, gain})
}

func TestKFCPriestDragonMarkNaturalExpiryFinalTickAndCooldown(t *testing.T) {
	sim, healer := kfcPriestMarkFixture(t, kfcPriestMarkRequest(true))
	spell := healer.GetSpell(core.ActionID{SpellID: 17252})
	kfcPriestMarkSpend(sim, healer, 9000)
	if !spell.Cast(sim, &healer.Unit) {
		t.Fatal("Expiry control failed")
	}
	kfcPriestAdvance(t, sim, 1799999*time.Millisecond)
	gain, _ := kfcPriestResourceItemMana(healer, 17252)
	kfcPriestNear(t, gain, 359*22)
	if !spell.SelfShield().IsActive() || spell.IsReady(sim) {
		t.Fatal("Shield/cooldown ended early")
	}
	kfcPriestAdvance(t, sim, 1800*time.Second)
	gain, actual := kfcPriestResourceItemMana(healer, 17252)
	kfcPriestNear(t, gain, 360*22)
	kfcPriestNear(t, actual, 360*22)
	if spell.SelfShield().IsActive() || !spell.IsReady(sim) {
		t.Fatal("Natural expiry/cooldown did not complete")
	}
	kfcPriestAdvance(t, sim, 1805*time.Second)
	gain, _ = kfcPriestResourceItemMana(healer, 17252)
	kfcPriestNear(t, gain, 360*22)
	kfcPriestNear(t, spell.SpellMetrics[healer.UnitIndex].TotalAbsorbedShielding, 0)
	kfcPriestHeartMeasure("MARK_EXPIRY", []float64{gain, actual})
}

func TestKFCPriestDragonMarkCancellationRefreshAndReset(t *testing.T) {
	sim, healer := kfcPriestMarkFixture(t, kfcPriestMarkRequest(true))
	spell := healer.GetSpell(core.ActionID{SpellID: 17252})
	kfcPriestMarkSpend(sim, healer, 1000)
	if !spell.Cast(sim, &healer.Unit) {
		t.Fatal("Refresh control failed")
	}
	kfcPriestAdvance(t, sim, 2*time.Second)
	spell.SelfShield().Apply(sim, 500)
	kfcPriestAdvance(t, sim, 5*time.Second)
	gain, _ := kfcPriestResourceItemMana(healer, 17252)
	kfcPriestNear(t, gain, 0)
	kfcPriestAdvance(t, sim, 7*time.Second)
	gain, _ = kfcPriestResourceItemMana(healer, 17252)
	kfcPriestNear(t, gain, 22)
	spell.SelfShield().Deactivate(sim)
	kfcPriestAdvance(t, sim, 20*time.Second)
	gain, _ = kfcPriestResourceItemMana(healer, 17252)
	kfcPriestNear(t, gain, 22)
	sim.Cleanup()
	sim.Reset()
	kfcPriestMarkSpend(sim, healer, 1000)
	if !spell.IsReady(sim) || spell.SelfShield().IsActive() {
		t.Fatal("Ring leaked across iterations")
	}
	kfcPriestAdvance(t, sim, 5*time.Second)
	gain, _ = kfcPriestResourceItemMana(healer, 17252)
	kfcPriestNear(t, gain, 22)
	if !spell.Cast(sim, &healer.Unit) {
		t.Fatal("Reset ring cannot activate")
	}
	kfcPriestAdvance(t, sim, 10*time.Second)
	gain, _ = kfcPriestResourceItemMana(healer, 17252)
	kfcPriestNear(t, gain, 44)
	kfcPriestHeartMeasure("MARK_RESET", gain)
}

func TestKFCPriestDragonMarkAlwaysShieldsSelf(t *testing.T) {
	sim, healer := kfcPriestMarkFixture(t, kfcPriestMarkRequest(true))
	spell := healer.GetSpell(core.ActionID{SpellID: 17252})
	target := &sim.Raid.GetFirstTargetDummy().Unit
	if !spell.Cast(sim, target) || !spell.SelfShield().IsActive() {
		t.Fatal("Selected target redirected a self-only item")
	}
	kfcPriestMarkDamage(sim, healer, 500)
	kfcPriestNear(t, healer.CurrentHealth(), 3000)
}

func kfcPriestMarkSpend(sim *core.Simulation, healer *HealingPriest, amount float64) {
	healer.SpendMana(sim, amount, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 122}))
}
func kfcPriestMarkDamage(sim *core.Simulation, healer *HealingPriest, amount float64) {
	spell := sim.Encounter.TargetUnits[0].GetOrRegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: 1, Tag: 123}, SpellSchool: core.SpellSchoolHoly, ProcMask: core.ProcMaskSpellDamage, DamageMultiplier: 1})
	result := spell.NewResult(&healer.Unit)
	result.Damage = amount
	result.Outcome = core.OutcomeHit
	spell.DealDamage(sim, result)
}
func TestKFCPriestDragonMarkActualWorkload(t *testing.T) {
	for index := 0; index < 3; index++ {
		request := kfcWorkloadRequest(10000, 4, 60)
		request.Raid.Parties[0].Players[0].Equipment = kfcItemEquipment()
		request.Raid.Parties[0].Players[0].Equipment.Items[10].Id = 13143
		frame := kfcTankWorkload(60)
		if index > 0 {
			frame.Cooldowns = []KFCHealingCooldown{{SpellID: 17252}}
		}
		if index == 2 {
			frame.Cooldowns[0].MinimumMissingMana = 1000
			frame.Cooldowns[0].RequireHealingDemand = true
		}
		job := kfcHealingProtocolJob(t, fmt.Sprintf("priest-mark-workload-%d", index), request, frame, true)
		reply := RunKFCHealingJob(context.Background(), kfcHealingJobJSON(t, job))
		if reply.Status != "complete" || reply.Result == nil || reply.Result.SurvivalRate != 1 {
			t.Fatalf("Mark workload failed: %+v", reply)
		}
		metrics := &proto.RaidMetrics{}
		if err := protojson.Unmarshal(reply.Result.Metrics, metrics); err != nil {
			t.Fatal(err)
		}
		gain := 0.0
		for _, row := range metrics.Parties[0].Players[0].Resources {
			if row.Id.GetSpellId() == 17252 {
				gain += row.Gain
			}
		}
		if (index == 0 && gain != 0) || (index > 0 && gain <= 0) {
			t.Fatal("Explicit owned ring was missing or activated automatically", index, gain)
		}
		kfcPriestNear(t, reply.Result.AbsorbedHPS, 0)
		kfcPriestHeartMeasure("MARK_WORKLOAD_REQUEST", job)
		kfcPriestHeartMeasure(fmt.Sprintf("MARK_WORKLOAD_%d", index), []float64{gain, reply.Result.HPS, reply.Result.ManaRemainingMean})
	}
}
