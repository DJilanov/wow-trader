package holy

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/stats"
	"google.golang.org/protobuf/encoding/protojson"
	googleProto "google.golang.org/protobuf/proto"
)

func kfcPaladinUtilityFixture(t *testing.T, equipment map[int]int32) (*core.Simulation, *HolyPaladin) {
	t.Helper()
	request := kfcPaladinRegenerationRequest(equipment)
	request.Raid.Parties[0].Players[0].Rotation = &proto.APLRotation{Type: proto.APLRotation_TypeAPL}
	return kfcPaladinRegenerationFixture(t, request)
}

func kfcPaladinUtilityAttack(sim *core.Simulation, healer *HolyPaladin, mask core.ProcMask, outcome core.HitOutcome, amount float64) {
	spell := sim.Encounter.TargetUnits[0].GetOrRegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: 1, Tag: 141 + int32(mask)}, SpellSchool: core.SpellSchoolPhysical, ProcMask: mask, DamageMultiplier: 1})
	result := spell.NewResult(&healer.Unit)
	result.Damage, result.Outcome = amount, outcome
	spell.DealDamage(sim, result)
}

func TestKFCPaladinUtilityOwnershipAndCategories(t *testing.T) {
	_, none := kfcPaladinUtilityFixture(t, nil)
	for _, id := range []int32{4262, 8346, 11808} {
		if none.GetSpell(core.ActionID{ItemID: id}) != nil || none.validateKFCPaladinHealingCooldowns([]KFCPaladinHealingCooldown{{ItemID: id}}) == nil {
			t.Fatal("Unowned utility admitted", id)
		}
	}
	if none.GetSpell(core.ActionID{SpellID: 9777}) != nil || none.GetSpell(core.ActionID{SpellID: 1300891}) != nil {
		t.Fatal("Unowned passive utility admitted")
	}
	_, healer := kfcPaladinUtilityFixture(t, map[int]int32{6: 4262, 9: 8346, 0: 11808})
	for _, row := range []struct {
		id      int32
		cd, gcd time.Duration
	}{{4262, 5 * time.Minute, 1500 * time.Millisecond}, {8346, 30 * time.Minute, 1500 * time.Millisecond}, {11808, 5 * time.Minute, 0}} {
		spell := healer.GetSpell(core.ActionID{ItemID: row.id})
		if spell == nil || spell.CD.Duration != row.cd || spell.SharedCD.Timer != nil || spell.DefaultCast.GCD != row.gcd || spell.DefaultCast.CastTime != 0 || healer.validateKFCPaladinHealingCooldowns([]KFCPaladinHealingCooldown{{ItemID: row.id}}) != nil {
			t.Fatal("Utility cooldown or ownership changed", row.id)
		}
	}
	kfcPaladinHeartMeasure("UTILITY_OWNERSHIP", []int{4262, 8346, 11808})
}

func TestKFCPaladinUtilityDirectBoundsCriticalsAndZeroCoefficient(t *testing.T) {
	for _, row := range []struct {
		id        int32
		slot      int
		low, high float64
	}{{4262, 6, 225, 375}, {8346, 9, 300, 500}} {
		for _, critical := range []bool{false, true} {
			sim, healer := kfcPaladinUtilityFixture(t, map[int]int32{row.slot: row.id})
			if err := healer.ConfigureKFCPaladinHealingUtilities(sim, &critical, nil); err != nil {
				t.Fatal(err)
			}
			healer.AddStatDynamic(sim, stats.HealingPower, 100000)
			spell := healer.GetSpell(core.ActionID{ItemID: row.id})
			spell.BonusCritRating = 10000
			factor, sum := 1.0, 0.0
			if critical {
				factor = 1.5
			}
			for i := 0; i < 20; i++ {
				healer.GainHealth(sim, healer.MaxHealth(), healer.NewHealthMetrics(core.ActionID{SpellID: 1, Tag: 141}))
				healer.RemoveHealth(sim, 2000)
				before := healer.CurrentHealth()
				spell.CD.Set(sim.CurrentTime)
				healer.GCD.Set(sim.CurrentTime)
				if !spell.CanCast(sim, &healer.Unit) || !spell.Cast(sim, &healer.Unit) {
					t.Fatal("Owned utility failed")
				}
				gain := healer.CurrentHealth() - before
				if gain < row.low*factor || gain > row.high*factor {
					t.Fatal("Wrong utility heal or scaling", gain)
				}
				sum += gain
			}
			kfcPaladinHeartMeasure(fmt.Sprintf("UTILITY_DIRECT_%d_%t", row.id, critical), sum)
		}
	}
}

func TestKFCPaladinUtilityTargetRangeCapsBusyAndDeath(t *testing.T) {
	sim, healer := kfcPaladinUtilityFixture(t, map[int]int32{6: 4262, 9: 8346})
	ally := &sim.Raid.GetFirstTargetDummy().Unit
	belt, gloves := healer.GetSpell(core.ActionID{ItemID: 4262}), healer.GetSpell(core.ActionID{ItemID: 8346})
	if belt.CanCast(sim, ally) || gloves.CanCast(sim, sim.Encounter.TargetUnits[0]) {
		t.Fatal("Wrong utility target admitted")
	}
	healer.KFCHealing.positions[ally.UnitIndex] = KFCPaladinFriendlyPosition{X: 40.01}
	if gloves.CanCast(sim, ally) {
		t.Fatal("Out-of-range utility admitted")
	}
	healer.KFCHealing.positions[ally.UnitIndex] = KFCPaladinFriendlyPosition{X: 40}
	ally.RemoveHealth(sim, 10)
	before := ally.CurrentHealth()
	if !gloves.CanCast(sim, ally) || !gloves.Cast(sim, ally) {
		t.Fatal("Boundary target rejected")
	}
	kfcPaladinNear(t, ally.CurrentHealth()-before, 10)
	if belt.CanCast(sim, &healer.Unit) {
		t.Fatal("Utility ignored GCD")
	}
	kfcPaladinAdvance(t, sim, 1500*time.Millisecond)
	healer.GetSpell(core.ActionID{SpellID: 10329}).Cast(sim, &healer.Unit)
	if belt.CanCast(sim, &healer.Unit) {
		t.Fatal("Utility interrupted hardcast")
	}
	healer.InterruptCast(sim)
	healer.GCD.Set(sim.CurrentTime)
	ally.RemoveHealth(sim, ally.CurrentHealth())
	gloves.CD.Set(sim.CurrentTime)
	if gloves.CanCast(sim, ally) {
		t.Fatal("Utility revived dead recipient")
	}
	healer.RemoveHealth(sim, healer.CurrentHealth())
	if belt.CanCast(sim, &healer.Unit) {
		t.Fatal("Dead caster used utility")
	}
	kfcPaladinHeartMeasure("UTILITY_TARGET_GUARDS", true)
}

func TestKFCPaladinUtilityControllerSelectionAndThresholds(t *testing.T) {
	sim, healer := kfcPaladinUtilityFixture(t, map[int]int32{6: 4262, 9: 8346})
	ally := &sim.Raid.GetFirstTargetDummy().Unit
	ally.RemoveHealth(sim, 1000)
	minimum := 1001.0
	policy := KFCPaladinHealingCooldown{ItemID: 8346, MinimumMissingHealth: &minimum}
	healer.tryKFCPaladinUtilityHeal(sim, KFCPaladinHealingWorkload{}, policy)
	spell := healer.GetSpell(core.ActionID{ItemID: 8346})
	if !spell.CD.IsReady(sim) {
		t.Fatal("Threshold consumed cooldown")
	}
	minimum = 1000
	before := ally.CurrentHealth()
	healer.tryKFCPaladinUtilityHeal(sim, KFCPaladinHealingWorkload{}, policy)
	if ally.CurrentHealth() <= before || spell.CD.IsReady(sim) {
		t.Fatal("Most-injured friendly not healed")
	}
	kfcPaladinHeartMeasure("UTILITY_SELECTION", ally.CurrentHealth()-before)
}

func TestKFCPaladinUtilityControllerValidation(t *testing.T) {
	_, healer := kfcPaladinUtilityFixture(t, map[int]int32{6: 4262, 9: 8346, 0: 11808})
	for _, index := range []int32{-2, 39, 40} {
		if healer.validateKFCPaladinHealingCooldowns([]KFCPaladinHealingCooldown{{ItemID: 8346, TargetRaidIndex: &index}}) == nil {
			t.Fatal("Invalid recipient admitted")
		}
	}
	ally := int32(1)
	if healer.validateKFCPaladinHealingCooldowns([]KFCPaladinHealingCooldown{{ItemID: 4262, TargetRaidIndex: &ally}}) == nil {
		t.Fatal("Belt healed a different recipient")
	}
	self := int32(0)
	if healer.validateKFCPaladinHealingCooldowns([]KFCPaladinHealingCooldown{{ItemID: 4262, TargetRaidIndex: &self}}) != nil {
		t.Fatal("Self belt policy rejected")
	}
	negative := -1.0
	if healer.validateKFCPaladinHealingCooldowns([]KFCPaladinHealingCooldown{{ItemID: 8346, MinimumMissingHealth: &negative}}) == nil {
		t.Fatal("Negative deficit admitted")
	}
	if healer.validateKFCPaladinHealingCooldowns([]KFCPaladinHealingCooldown{{ItemID: 11808, TargetRaidIndex: &self}}) == nil {
		t.Fatal("Mana channel acquired friendly targeting")
	}
	kfcPaladinHeartMeasure("UTILITY_POLICY_GUARDS", true)
}

func TestKFCPaladinUtilityResearchFreshnessAndAtomicity(t *testing.T) {
	value := true
	sim, none := kfcPaladinUtilityFixture(t, nil)
	if none.ConfigureKFCPaladinHealingUtilities(sim, &value, nil) == nil || none.ConfigureKFCPaladinHealingUtilities(sim, nil, &value) == nil {
		t.Fatal("Unowned research admitted")
	}
	sim, healer := kfcPaladinUtilityFixture(t, map[int]int32{9: 8346})
	if healer.ConfigureKFCPaladinHealingUtilities(sim, &value, &value) == nil || healer.healingUtilities.canCrit {
		t.Fatal("Failed configuration mutated state")
	}
	if healer.ConfigureKFCPaladinHealingUtilities(sim, &value, nil) != nil || healer.ConfigureKFCPaladinHealingUtilities(sim, &value, nil) == nil {
		t.Fatal("Research freshness failed")
	}
	value = false
	if !healer.healingUtilities.canCrit || !*healer.healingUtilities.criticalEcho {
		t.Fatal("Caller mutated critical policy")
	}
	sim, healer = kfcPaladinUtilityFixture(t, map[int]int32{0: 11808})
	healer.GetSpell(core.ActionID{ItemID: 11808}).Cast(sim, &healer.Unit)
	if healer.ConfigureKFCPaladinHealingUtilities(sim, nil, &value) == nil {
		t.Fatal("Channel changed after start")
	}
	sim, healer = kfcPaladinUtilityFixture(t, map[int]int32{9: 8346})
	healer.RemoveHealth(sim, healer.CurrentHealth())
	if healer.ConfigureKFCPaladinHealingUtilities(sim, &value, nil) == nil {
		t.Fatal("Dead actor changed research")
	}
	kfcPaladinHeartMeasure("UTILITY_RESEARCH_GUARDS", true)
}

func TestKFCPaladinUtilityTruesilverMeleeMaskChanceAndBounds(t *testing.T) {
	sim, healer := kfcPaladinUtilityFixture(t, map[int]int32{4: 7939})
	spell := healer.GetSpell(core.ActionID{SpellID: 9777})
	healer.AddStatDynamic(sim, stats.HealingPower, 100000)
	for _, mask := range []core.ProcMask{core.ProcMaskSpellDamage, core.ProcMaskSpellDamageProc, core.ProcMaskRanged} {
		for i := 0; i < 500; i++ {
			kfcPaladinUtilityAttack(sim, healer, mask, core.OutcomeHit, 0)
		}
	}
	for i := 0; i < 500; i++ {
		kfcPaladinUtilityAttack(sim, healer, core.ProcMaskMeleeMHAuto, core.OutcomeMiss, 0)
	}
	if spell.SpellMetrics[healer.UnitIndex].Hits != 0 {
		t.Fatal("Wrong attack kind triggered Truesilver")
	}
	count, sum := 0, 0.0
	for i := 0; i < 10000; i++ {
		healer.GainHealth(sim, healer.MaxHealth(), healer.NewHealthMetrics(core.ActionID{SpellID: 1, Tag: 142}))
		healer.RemoveHealth(sim, 1000)
		before := healer.CurrentHealth()
		mask := core.ProcMaskMeleeMHAuto
		if i%2 == 1 {
			mask = core.ProcMaskMeleeMHSpecial
		}
		kfcPaladinUtilityAttack(sim, healer, mask, core.OutcomeHit, 1)
		gain := healer.CurrentHealth() - before + 1
		if gain > 0 {
			if gain < 60 || gain > 100 {
				t.Fatal("Wrong Truesilver bounds", gain)
			}
			count++
			sum += gain
		}
	}
	if count < 240 || count > 360 {
		t.Fatal("Truesilver chance not 3%", count)
	}
	kfcPaladinHeartMeasure("UTILITY_TRUESILVER", []float64{float64(count), sum})
}

func TestKFCPaladinUtilityTruesilverLethalHitCannotResurrect(t *testing.T) {
	sim, healer := kfcPaladinUtilityFixture(t, map[int]int32{4: 7939})
	kfcPaladinUtilityAttack(sim, healer, core.ProcMaskMeleeMHAuto, core.OutcomeHit, healer.MaxHealth()*2)
	for i := 0; i < 1000; i++ {
		kfcPaladinUtilityAttack(sim, healer, core.ProcMaskMeleeMHAuto, core.OutcomeHit, 1)
	}
	kfcPaladinNear(t, healer.CurrentHealth(), 0)
	kfcPaladinNear(t, float64(healer.GetSpell(core.ActionID{SpellID: 9777}).SpellMetrics[healer.UnitIndex].Hits), 0)
	kfcPaladinHeartMeasure("UTILITY_TRUESILVER_DEATH", true)
}

func TestKFCPaladinUtilityTruesilverCriticalSensitivity(t *testing.T) {
	sim, healer := kfcPaladinUtilityFixture(t, map[int]int32{4: 7939})
	critical := true
	if err := healer.ConfigureKFCPaladinHealingUtilities(sim, &critical, nil); err != nil {
		t.Fatal(err)
	}
	spell := healer.GetSpell(core.ActionID{SpellID: 9777})
	spell.BonusCritRating = 10000
	healer.AddStatDynamic(sim, stats.HealingPower, 100000)
	for i := 0; i < 1000; i++ {
		healer.GainHealth(sim, healer.MaxHealth(), healer.NewHealthMetrics(core.ActionID{SpellID: 1, Tag: 145}))
		healer.RemoveHealth(sim, 1000)
		before := healer.CurrentHealth()
		kfcPaladinUtilityAttack(sim, healer, core.ProcMaskMeleeMHAuto, core.OutcomeHit, 1)
		gain := healer.CurrentHealth() - before + 1
		if gain > 0 && (gain < 90 || gain > 150) {
			t.Fatal("Wrong critical Truesilver bounds", gain)
		}
	}
	metric := spell.SpellMetrics[healer.UnitIndex]
	if metric.Crits == 0 || metric.Hits > 0 {
		t.Fatal("Critical sensitivity ignored", metric.Crits, metric.Hits)
	}
	kfcPaladinHeartMeasure("UTILITY_TRUESILVER_CRIT", metric.Crits)
}

func TestKFCPaladinUtilityDirectGCDUsesExistingForeverHaste(t *testing.T) {
	for _, row := range []struct {
		slot int
		id   int32
	}{{6, 4262}, {9, 8346}} {
		sim, healer := kfcPaladinUtilityFixture(t, map[int]int32{row.slot: row.id})
		healer.MultiplyCastSpeed(2)
		spell := healer.GetSpell(core.ActionID{ItemID: row.id})
		if !spell.Cast(sim, &healer.Unit) {
			t.Fatal("Owned utility failed")
		}
		if healer.GCD.ReadyAt() != time.Second {
			t.Fatal("Item GCD stopped following Forever's nonphysical-school policy", healer.GCD.ReadyAt())
		}
		if healer.GetConjuredCD().ReadyAt() > sim.CurrentTime {
			t.Fatal("Utility consumed the conjured timer")
		}
		kfcPaladinHeartMeasure(fmt.Sprintf("UTILITY_GCD_%d", row.id), int64(healer.GCD.ReadyAt()))
	}
}

func TestKFCPaladinUtilityGracePartyRangeDeadAndSingleTrigger(t *testing.T) {
	request := kfcPaladinRegenerationRequest(map[int]int32{14: 11923})
	other := googleProto.Clone(request.Raid.Parties[0].Players[0]).(*proto.Player)
	other.Equipment = &proto.EquipmentSpec{}
	other.Name = "Other party"
	request.Raid.Parties = append(request.Raid.Parties, &proto.Party{Players: []*proto.Player{other}})
	sim, healer := kfcPaladinRegenerationFixture(t, request)
	for _, unit := range sim.Raid.AllUnits {
		unit.RemoveHealth(sim, 2000)
	}
	inside, outside, dead := sim.Raid.AllUnits[1], sim.Raid.AllUnits[2], sim.Raid.AllUnits[3]
	healer.KFCHealing.positions[inside.UnitIndex] = KFCPaladinFriendlyPosition{X: 40}
	healer.KFCHealing.positions[outside.UnitIndex] = KFCPaladinFriendlyPosition{X: 40.01}
	dead.RemoveHealth(sim, dead.CurrentHealth())
	otherUnit := &sim.Raid.Parties[1].Players[0].GetCharacter().Unit
	beforeInside, beforeOutside, beforeOther := inside.CurrentHealth(), outside.CurrentHealth(), otherUnit.CurrentHealth()
	healer.AddStatDynamic(sim, stats.HealingPower, 100000)
	healer.GetSpell(core.ActionID{SpellID: 1300891}).BonusCritRating = 10000
	kfcPaladinRegenerationDamage(sim, healer, healer.MaxHealth()*2)
	gain := inside.CurrentHealth() - beforeInside
	if gain < 1081.92 || gain > 1270.08 {
		t.Fatal("Wrong Grace bounds, crit or coefficient", gain)
	}
	kfcPaladinNear(t, outside.CurrentHealth(), beforeOutside)
	kfcPaladinNear(t, otherUnit.CurrentHealth(), beforeOther)
	kfcPaladinNear(t, dead.CurrentHealth(), 0)
	kfcPaladinNear(t, healer.CurrentHealth(), 0)
	beforeInside = inside.CurrentHealth()
	kfcPaladinRegenerationDamage(sim, healer, 100)
	kfcPaladinNear(t, inside.CurrentHealth(), beforeInside)
	kfcPaladinHeartMeasure("UTILITY_GRACE", gain)
}

func TestKFCPaladinUtilityCircleDelayedTicksCapsAndDuration(t *testing.T) {
	sim, healer := kfcPaladinUtilityFixture(t, map[int]int32{0: 11808})
	healer.SpendMana(sim, 1500, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 143}))
	spell := healer.GetSpell(core.ActionID{ItemID: 11808})
	beforeMana, beforeHealth := healer.CurrentMana(), healer.CurrentHealth()
	if !spell.CanCast(sim, &healer.Unit) || !spell.Cast(sim, &healer.Unit) || !healer.IsChanneling(sim) {
		t.Fatal("Circle did not channel")
	}
	kfcPaladinNear(t, healer.CurrentMana(), beforeMana)
	kfcPaladinAdvance(t, sim, 999*time.Millisecond)
	kfcPaladinNear(t, healer.CurrentMana(), beforeMana)
	kfcPaladinAdvance(t, sim, 10*time.Second)
	mana, health := healer.CurrentMana()-beforeMana, beforeHealth-healer.CurrentHealth()
	if mana < 592.5 || mana > 987.5 || health <= 0 || health > 987.5 || healer.IsChanneling(sim) {
		t.Fatal("Wrong channel resource totals or duration", mana, health)
	}
	if spell.SelfHot().TickCount != 10 {
		t.Fatal("Circle did not tick ten times", spell.SelfHot().TickCount)
	}
	pulse := healer.GetSpell(core.ActionID{ItemID: 11808})
	if pulse.SpellMetrics[healer.UnitIndex].CritTicks != 0 {
		t.Fatal("Circle critted")
	}
	kfcPaladinHeartMeasure("UTILITY_CIRCLE_FULL", []float64{mana, health})
}

func TestKFCPaladinUtilityCircleInterruptionDeathAndReset(t *testing.T) {
	for _, death := range []bool{false, true} {
		sim, healer := kfcPaladinUtilityFixture(t, map[int]int32{0: 11808})
		healer.SpendMana(sim, 1500, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 144}))
		spell := healer.GetSpell(core.ActionID{ItemID: 11808})
		spell.Cast(sim, &healer.Unit)
		if death {
			healer.RemoveHealth(sim, healer.CurrentHealth()-1)
		}
		kfcPaladinAdvance(t, sim, 1500*time.Millisecond)
		if !death {
			healer.InterruptCast(sim)
		}
		mana, health := healer.CurrentMana(), healer.CurrentHealth()
		kfcPaladinAdvance(t, sim, 11*time.Second)
		kfcPaladinNear(t, healer.CurrentMana(), mana)
		kfcPaladinNear(t, healer.CurrentHealth(), health)
		if healer.IsChanneling(sim) || spell.SelfHot().TickCount != 1 {
			t.Fatal("Stopped Circle kept ticking", death, spell.SelfHot().TickCount)
		}
		if death && health != 0 {
			t.Fatal("Circle failed to kill low-health owner")
		}
		sim.Cleanup()
		sim.Reset()
		if healer.IsChanneling(sim) || spell.SelfHot().IsActive() || !spell.CanCast(sim, &healer.Unit) {
			t.Fatal("Reset retained channel or cooldown")
		}
		kfcPaladinHeartMeasure(fmt.Sprintf("UTILITY_CIRCLE_STOP_%t", death), []float64{mana, health})
	}
}

func TestKFCPaladinUtilityCircleHasteSensitivity(t *testing.T) {
	for _, scaled := range []bool{false, true} {
		sim, healer := kfcPaladinUtilityFixture(t, map[int]int32{0: 11808})
		if err := healer.ConfigureKFCPaladinHealingUtilities(sim, nil, &scaled); err != nil {
			t.Fatal(err)
		}
		healer.AddStatDynamic(sim, stats.SpellHaste, core.HasteRatingPerHastePercent*100)
		spell := healer.GetSpell(core.ActionID{ItemID: 11808})
		spell.Cast(sim, &healer.Unit)
		expected := time.Second
		if scaled {
			expected = 500 * time.Millisecond
		}
		if spell.SelfHot().TickPeriod() != expected || spell.SelfHot().Duration != expected*10 {
			t.Fatal("Wrong channel haste sensitivity", scaled, spell.SelfHot().TickPeriod())
		}
		kfcPaladinHeartMeasure(fmt.Sprintf("UTILITY_CIRCLE_HASTE_%t", scaled), int64(spell.SelfHot().Duration))
	}
}

func TestKFCPaladinUtilityChannelBlocksSameDecisionHealing(t *testing.T) {
	request, frame := kfcPaladinWorkloadControl()
	request.Raid.Parties[0].Players[0] = kfcPaladinRegenerationRequest(map[int]int32{0: 11808}).Raid.Parties[0].Players[0]
	request.Encounter.Duration = 9
	frame.Cooldowns = []KFCPaladinHealingCooldown{{ItemID: 11808}}
	frame.Damage = []KFCPaladinHealingDamageEvent{{AtMS: 0, RaidIndex: 1, Amount: 2000}}
	frame.Priorities = []KFCPaladinHealingPriority{{SpellID: 10329, RaidIndex: 1, MinimumMissingHealth: 1}}
	reply := RunKFCPaladinHealingJob(context.Background(), kfcPaladinWorkloadPayload(t, request, frame, "paladin-circle-busy-control", true))
	if reply.Status != "complete" {
		t.Fatalf("Channel workload failed: %+v", reply.Error)
	}
	metrics := &proto.RaidMetrics{}
	if err := protojson.Unmarshal(reply.Result.Metrics, metrics); err != nil {
		t.Fatal(err)
	}
	for _, action := range metrics.Parties[0].Players[0].Actions {
		if action.Id.GetSpellId() == 10329 {
			for _, target := range action.Targets {
				if target.Casts > 0 {
					t.Fatal("Healing cast started inside active item channel")
				}
			}
		}
	}
	kfcPaladinHeartMeasure("UTILITY_CIRCLE_BUSY", reply.Result)
}

func TestKFCPaladinUtilityActualWorkloadAndReferenceEcho(t *testing.T) {
	for _, row := range []struct {
		id   int32
		slot int
	}{{4262, 6}, {8346, 9}, {11808, 0}, {7939, 4}, {11923, 14}} {
		request, frame := kfcPaladinWorkloadControl()
		request.Raid.Parties[0].Players[0] = kfcPaladinRegenerationRequest(map[int]int32{row.slot: row.id}).Raid.Parties[0].Players[0]
		request.Encounter.Duration = 60
		frame.Cooldowns = nil
		if row.id == 4262 || row.id == 8346 {
			value := false
			frame.UtilityHealingCanCrit = &value
			frame.Cooldowns = []KFCPaladinHealingCooldown{{ItemID: row.id}}
		}
		if row.id == 11808 {
			value := true
			frame.CircleChannelScales = &value
			frame.Cooldowns = []KFCPaladinHealingCooldown{{ItemID: 11808, MinimumMissingMana: 100}}
		}
		job := kfcPaladinWorkloadPayload(t, request, frame, fmt.Sprintf("paladin-utility-workload-%d", row.id), true)
		reply := RunKFCPaladinHealingJob(context.Background(), job)
		if reply.Status != "complete" {
			t.Fatalf("Utility workload failed %d: %+v", row.id, reply.Error)
		}
		if row.id == 8346 || row.id == 11808 {
			metrics := &proto.RaidMetrics{}
			if err := protojson.Unmarshal(reply.Result.Metrics, metrics); err != nil {
				t.Fatal(err)
			}
			found := false
			for _, action := range metrics.Parties[0].Players[0].Actions {
				if action.Id.GetItemId() == row.id {
					for _, target := range action.Targets {
						found = found || target.Casts+target.Hits+target.Crits > 0
					}
				}
			}
			if !found {
				t.Fatal("Utility never used in actual workload", row.id)
			}
		}
		if row.id == 11808 && (reply.Result.CircleChannelScales == nil || !*reply.Result.CircleChannelScales) {
			t.Fatal("Channel reference missing")
		}
		if row.id == 8346 && (reply.Result.UtilityHealingCanCrit == nil || *reply.Result.UtilityHealingCanCrit) {
			t.Fatal("Critical reference missing")
		}
		var decoded interface{}
		if err := json.Unmarshal(job, &decoded); err != nil {
			t.Fatal(err)
		}
		kfcPaladinHeartMeasure("UTILITY_WORKLOAD_REQUEST", decoded)
		kfcPaladinHeartMeasure(fmt.Sprintf("UTILITY_WORKLOAD_%d", row.id), reply.Result)
	}
}
