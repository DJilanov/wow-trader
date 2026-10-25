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
	googleProto "google.golang.org/protobuf/proto"
)

func TestKFCPriestRenewCriticalTicks(t *testing.T) {
	sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{RenewedHope: 1})
	target.RemoveHealth(sim, 8000)
	spell := healer.Renew[9]
	spell.BonusCritRating = 10000
	chances := []float64{}
	observer := healer.GetAura("Renewed Hope healing trigger")
	observer.Deactivate(sim)
	observer.OnPeriodicHealDealt = func(_ *core.Aura, _ *core.Simulation, sp *core.Spell, result *core.SpellResult) {
		if sp == spell {
			if result.DirectDamageOrHealing || !result.DidCrit() {
				t.Fatal("Renew tick lost its periodic critical-heal semantics")
			}
			chances = append(chances, result.EffectiveCritChance)
		}
	}
	observer.Activate(sim)
	if !spell.Cast(sim, target) {
		t.Fatal("Critical Renew failed")
	}
	kfcPriestAdvance(t, sim, 15*time.Second)
	metrics := spell.SpellMetrics[target.UnitIndex]
	kfcPriestNear(t, metrics.TotalHealing, 1170*1.5)
	kfcPriestNear(t, metrics.TotalCritHealing, 1170*1.5)
	if metrics.CritTicks != 5 || metrics.Ticks != 0 || len(chances) != 5 {
		t.Fatalf("Expected five critical Renew ticks, got %+v", metrics)
	}
	for _, chance := range chances {
		kfcPriestNear(t, chance, 1)
	}
	fmt.Printf("KFC_PRIEST_RENEW_CRIT %.8f\n", metrics.TotalHealing)
}

func TestKFCPriestRenewLiveHealingCritAndRefresh(t *testing.T) {
	sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{})
	target.RemoveHealth(sim, 8000)
	spell := healer.Renew[9]
	spell.BonusCritRating = -10000
	if !spell.Cast(sim, target) {
		t.Fatal("Renew live crit setup failed")
	}
	spell.BonusCritRating = 10000
	kfcPriestAdvance(t, sim, 3*time.Second)
	if spell.SpellMetrics[target.UnitIndex].CritTicks != 1 {
		t.Fatal("Renew ignored a live crit gain between application and tick")
	}
	spell.BonusCritRating = -10000
	kfcPriestAdvance(t, sim, 6*time.Second)
	if spell.SpellMetrics[target.UnitIndex].CritTicks != 1 || spell.SpellMetrics[target.UnitIndex].Ticks != 1 {
		t.Fatal("Renew retained an expired crit bonus")
	}
	if !spell.Cast(sim, target) {
		t.Fatal("Renew refresh failed")
	}
	spell.BonusCritRating = 10000
	kfcPriestAdvance(t, sim, 9*time.Second)
	if spell.SpellMetrics[target.UnitIndex].CritTicks != 2 {
		t.Fatal("Renew refresh lost live crit behavior")
	}
	sim.Cleanup()
	sim.Reset()
	spell.BonusCritRating = -10000
	if !spell.Cast(sim, target) {
		t.Fatal("Renew iteration reset failed")
	}
	kfcPriestAdvance(t, sim, 3*time.Second)
	if spell.SpellMetrics[target.UnitIndex].CritTicks != 0 {
		t.Fatal("Renew crit state leaked between iterations")
	}
}

func TestKFCPriestRenewIgnoresDamageOnlyCritBonuses(t *testing.T) {
	sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{})
	target.RemoveHealth(sim, 8000)
	spell := healer.Renew[9]
	spell.BonusCritRating = -10000
	healer.AttackTables[target.UnitIndex][spell.CastType].BonusCritChanceTaken = 1000
	if !spell.Cast(sim, target) {
		t.Fatal("Renew healing crit context setup failed")
	}
	kfcPriestAdvance(t, sim, 15*time.Second)
	if spell.SpellMetrics[target.UnitIndex].CritTicks != 0 {
		t.Fatal("Renew used a damage-only target crit modifier")
	}
	kfcPriestNear(t, spell.SpellMetrics[target.UnitIndex].TotalHealing, 1170)
}

func TestKFCPriestRenewCritExcludesDirectOnlyProcs(t *testing.T) {
	sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{DivineAegis: 3, Inspiration: 3, PrayerOfMending: true, RenewedHope: 5})
	target.RemoveHealth(sim, 8000)
	if !healer.PrayerOfMending.Cast(sim, target) {
		t.Fatal("Renew Mending exclusion setup failed")
	}
	kfcPriestAdvance(t, sim, 1500*time.Millisecond)
	spell := healer.Renew[9]
	spell.BonusCritRating = 10000
	if !spell.Cast(sim, target) {
		t.Fatal("Renew proc exclusion control failed")
	}
	kfcPriestAdvance(t, sim, 16500*time.Millisecond)
	if spell.SpellMetrics[target.UnitIndex].CritTicks != 5 {
		t.Fatal("Proc exclusion test did not actually deliver critical ticks")
	}
	kfcPriestNear(t, healer.KFCDivineAegis.Shield(target).RemainingAbsorb(), 0)
	kfcPriestNear(t, healer.KFCMendingHeal.SpellMetrics[target.UnitIndex].TotalHealing, 0)
	if healer.KFCInspiration.Get(target).IsActive() {
		t.Fatal("Periodic critical Renew triggered Inspiration")
	}
}

func TestKFCPriestInnerFocusDoesNotBoostRenewCrit(t *testing.T) {
	sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{InnerFocus: true})
	spell := healer.Renew[9]
	chance := min(1, max(0, spell.HealingCritChance()))
	if !healer.InnerFocus.Cast(sim, &healer.Unit) {
		t.Fatal("Focused Renew setup failed")
	}
	kfcPriestNear(t, min(1, max(0, spell.HealingCritChance())), chance)
	if !spell.Cast(sim, target) {
		t.Fatal("Focused Renew failed")
	}
	kfcPriestNear(t, healer.Metrics.ManaSpent, 0)
	kfcPriestNear(t, min(1, max(0, spell.HealingCritChance())), chance)
	if healer.InnerFocusAura.IsActive() {
		t.Fatal("Renew did not consume the single free spell")
	}
}

func TestKFCPriestShieldRejectsWeakerReplacement(t *testing.T) {
	sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{})
	strong, weak := healer.PowerWordShield[10], healer.PowerWordShield[1]
	if !strong.Cast(sim, target) {
		t.Fatal("Strong shield setup failed")
	}
	kfcPriestAdvance(t, sim, 15*time.Second)
	beforeMana := healer.CurrentMana()
	if weak.CanCast(sim, target) || weak.Cast(sim, target) {
		t.Fatal("A weaker shield replaced a stronger active shield")
	}
	kfcPriestNear(t, healer.CurrentMana(), beforeMana)
	kfcPriestNear(t, strong.Shield(target).RemainingAbsorb(), 978)
	if healer.WeakenedSouls.Get(target).IsActive() {
		t.Fatal("Rejected shield applied Weakened Soul")
	}
	if !strong.Cast(sim, target) {
		t.Fatal("An equal full shield could not refresh after Weakened Soul")
	}
}

func TestKFCPriestShieldCanReplaceDepletedStrongerRank(t *testing.T) {
	sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{})
	strong, weak := healer.PowerWordShield[10], healer.PowerWordShield[1]
	if !strong.Cast(sim, target) {
		t.Fatal("Shield remainder control setup failed")
	}
	kfcDamageTrigger(sim, target, 950)
	kfcPriestAdvance(t, sim, 15*time.Second)
	kfcPriestNear(t, strong.Shield(target).RemainingAbsorb(), 28)
	if !weak.Cast(sim, target) || strong.Shield(target).IsActive() || !weak.Shield(target).IsActive() {
		t.Fatal("A stronger fresh pool did not replace the smaller remaining pool")
	}
	kfcPriestNear(t, strong.SpellMetrics[target.UnitIndex].TotalAbsorbedShielding, 950)
	kfcPriestNear(t, weak.SpellMetrics[target.UnitIndex].TotalAbsorbedShielding, 0)
}

func TestKFCPriestShieldFamilyAcrossCasters(t *testing.T) {
	request := kfcWorkloadRequest(10000, 1, 60)
	second := googleProto.Clone(request.Raid.Parties[0].Players[0]).(*proto.Player)
	second.Name = "Second Priest control"
	request.Raid.Parties[0].Players = append(request.Raid.Parties[0].Players, second)
	request.Raid.TargetDummies = 1
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	first := sim.Raid.Parties[0].Players[0].(*HealingPriest)
	other := sim.Raid.Parties[0].Players[1].(*HealingPriest)
	target := &sim.Raid.GetFirstTargetDummy().Unit
	if !first.PowerWordShield[10].Cast(sim, target) {
		t.Fatal("Cross-caster shield setup failed")
	}
	kfcPriestAdvance(t, sim, 15*time.Second)
	if other.PowerWordShield[1].CanCast(sim, target) {
		t.Fatal("A second caster ignored the stronger existing shield")
	}
	if !other.PowerWordShield[10].Cast(sim, target) || first.PowerWordShield[10].Shield(target).IsActive() {
		t.Fatal("Different casters stacked Power Word: Shield")
	}
}

func TestKFCPriestShieldDoesNotReplaceOtherAbsorbFamilies(t *testing.T) {
	sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{DivineAegis: 3})
	aegis := healer.KFCDivineAegis.Shield(target)
	aegis.Apply(sim, 1000)
	if !healer.PowerWordShield[1].Cast(sim, target) || !aegis.IsActive() {
		t.Fatal("Power Word: Shield replacement consumed another absorb family")
	}
	kfcPriestNear(t, aegis.RemainingAbsorb(), 1000)
}

func TestKFCPriestMentalStrengthResourceScaling(t *testing.T) {
	_, baseline, _ := kfcActiveFixture(t, &proto.PriestTalents{})
	intellect, mana := baseline.GetStat(stats.Intellect), baseline.MaxMana()
	for points := int32(1); points <= 5; points++ {
		_, healer, _ := kfcActiveFixture(t, &proto.PriestTalents{MentalStrength: points})
		delta := intellect * .02 * float64(points)
		kfcPriestNear(t, healer.GetStat(stats.Intellect), intellect+delta)
		kfcPriestNear(t, healer.MaxMana(), mana+15*delta)
	}
}

func TestKFCPriestMeditationActualManaTicks(t *testing.T) {
	for points, percent := range []float64{0, .17, .33, .50} {
		sim, healer, target := kfcActiveFixture(t, &proto.PriestTalents{Meditation: int32(points)})
		target.RemoveHealth(sim, 4000)
		before := healer.CurrentMana()
		spell := healer.FlashHeal[7]
		if !spell.Cast(sim, target) {
			t.Fatal("Meditation resource control failed")
		}
		spirit := 6.25 + healer.GetStat(stats.Spirit)/8
		casting := healer.MP5ManaRegenPerSecond() + spirit*percent
		kfcPriestNear(t, healer.ManaRegenPerSecondWhileCasting(), casting)
		kfcPriestAdvance(t, sim, 4*time.Second)
		kfcPriestNear(t, healer.CurrentMana(), before-380+4*casting)
	}
}

func TestKFCPriestSpiritualGuidanceDynamicHealing(t *testing.T) {
	_, baseline, _ := kfcActiveFixture(t, &proto.PriestTalents{})
	for points, damage := range []float64{0, 1, 3, 5, 6, 8} {
		sim, healer, _ := kfcActiveFixture(t, &proto.PriestTalents{SpiritualGuidance: int32(points)})
		spirit := healer.GetStat(stats.Spirit)
		kfcPriestNear(t, healer.GetStat(stats.HealingPower)-baseline.GetStat(stats.HealingPower), spirit*.05*float64(points))
		kfcPriestNear(t, healer.GetStat(stats.SpellDamage)-baseline.GetStat(stats.SpellDamage), spirit*damage/100)
		before := healer.GetStat(stats.HealingPower)
		beforeSpirit := healer.GetStat(stats.Spirit)
		healer.AddStatDynamic(sim, stats.Spirit, 100)
		kfcPriestNear(t, healer.GetStat(stats.HealingPower)-before, (healer.GetStat(stats.Spirit)-beforeSpirit)*.05*float64(points))
	}
}

func TestKFCPriestCurrentRuleExternalInputs(t *testing.T) {
	request := kfcWorkloadRequest(10000, 3, 20)
	request.Raid.Parties[0].Players[0].BonusStats.Stats[stats.SpellCrit] = -10000
	workload := kfcTankWorkload(20)
	workload.Name = "renew-critical-control"
	workload.Damage = []KFCHealingDamageEvent{{AtMS: 0, RaidIndex: 1, Amount: 6000}}
	workload.Priorities = []KFCHealingPriority{{SpellID: 10928, RaidIndex: 1, MinimumMissingHealth: 1, KeepRenew: true}}
	normal := kfcHealingProtocolJob(t, "renew-no-crit", request, workload, false)
	request.Raid.Parties[0].Players[0].BonusStats.Stats[stats.SpellCrit] = 10000
	critical := kfcHealingProtocolJob(t, "renew-all-crit", request, workload, false)
	low := RunKFCHealingJob(context.Background(), kfcHealingJobJSON(t, normal))
	high := RunKFCHealingJob(context.Background(), kfcHealingJobJSON(t, critical))
	if low.Result == nil || high.Result == nil {
		t.Fatalf("Renew external controls failed: low=%+v high=%+v", low.Error, high.Error)
	}
	kfcPriestNear(t, high.Result.HPS, low.Result.HPS*1.5)
	encoded, err := json.Marshal(map[string]KFCHealingJob{"renewNoCrit": normal, "renewAllCrit": critical})
	if err != nil {
		t.Fatal(err)
	}
	fmt.Printf("KFC_PRIEST_CURRENT_RULE_INPUTS %s\n", encoded)
}
