package healing

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
	"github.com/wowsims/classic/sim/priest"
	"google.golang.org/protobuf/reflect/protoreflect"
)

func kfcItemEquipment(ids ...int32) *proto.EquipmentSpec {
	gear := &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
	for slot := range gear.Items {
		gear.Items[slot] = &proto.ItemSpec{}
	}
	for _, id := range ids {
		slot, known := map[int32]int{19288: 12, 272562: 0, 272563: 8, 272564: 4, 272565: 2, 272568: 9, 272569: 6}[id]
		if !known {
			panic("Unreviewed item in healer control")
		}
		gear.Items[slot] = &proto.ItemSpec{Id: id}
	}
	return gear
}

func kfcItemTalents(talents *proto.PriestTalents) string {
	var allocation strings.Builder
	message := talents.ProtoReflect()
	for index := 0; index < 52; index++ {
		if index == 18 || index == 35 {
			allocation.WriteByte('-')
		}
		field := message.Descriptor().Fields().Get(index)
		value := int64(0)
		if field.Kind() == protoreflect.BoolKind {
			if message.Get(field).Bool() {
				value = 1
			}
		} else {
			value = message.Get(field).Int()
		}
		allocation.WriteByte(byte('0' + value))
	}
	return allocation.String()
}

func kfcItemFixture(t *testing.T, talents *proto.PriestTalents, ids ...int32) (*core.Simulation, *HealingPriest, *core.Unit) {
	t.Helper()
	return kfcItemFixtureWithRace(t, talents, proto.Race_RaceHuman, ids...)
}

func kfcItemFixtureWithRace(t *testing.T, talents *proto.PriestTalents, race proto.Race, ids ...int32) (*core.Simulation, *HealingPriest, *core.Unit) {
	t.Helper()
	request := kfcWorkloadRequest(100000, 1, 1800)
	player := request.Raid.Parties[0].Players[0]
	player.Race = race
	player.Rotation = &proto.APLRotation{Type: proto.APLRotation_TypeAPL}
	player.Equipment = kfcItemEquipment(ids...)
	player.TalentsString = kfcItemTalents(talents)
	player.BonusStats.Stats[stats.SpellPower] = 500
	player.BonusStats.Stats[stats.Spirit] = 100
	request.SimOptions.Interactive, request.SimOptions.IsTest = true, true
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	healer := sim.Raid.Parties[0].Players[0].(*HealingPriest)
	positions := map[int32]priest.KFCFriendlyPosition{}
	for _, unit := range sim.Raid.AllUnits {
		positions[unit.UnitIndex] = priest.KFCFriendlyPosition{X: float64(unit.UnitIndex)}
	}
	if err := healer.ConfigureKFCFriendlyPositions(positions); err != nil {
		t.Fatal(err)
	}
	return sim, healer, &sim.Raid.GetFirstTargetDummy().Unit
}

func TestKFCPriestBlueDragonSpiritAndGuidance(t *testing.T) {
	sim, healer, _ := kfcItemFixture(t, &proto.PriestTalents{SpiritualGuidance: 5, Meditation: 3}, 19288)
	aura := healer.GetAura("Aura of the Blue Dragon")
	if aura == nil || aura.ActionID.SpellID != 23684 {
		t.Fatal("The equipped current Blue Dragon buff is missing")
	}
	beforeSpirit, beforePower := healer.GetStat(stats.Spirit), healer.GetStat(stats.HealingPower)
	beforeRegen, beforeSources := healer.ManaRegenPerSecondWhileCasting(), healer.PseudoStats.FullSpiritRegenSources
	aura.Activate(sim)
	kfcPriestNear(t, healer.GetStat(stats.Spirit)-beforeSpirit, 157.5)
	kfcPriestNear(t, healer.GetStat(stats.HealingPower)-beforePower, 157.5*.25)
	kfcPriestNear(t, healer.ManaRegenPerSecondWhileCasting()-beforeRegen, 157.5/8*.5)
	if healer.PseudoStats.FullSpiritRegenSources != beforeSources {
		t.Fatal("Blue Dragon retained the obsolete full-regeneration override")
	}
	fmt.Printf("KFC_HEALER_BLUE_DRAGON %.8f %.8f %.8f\n", healer.GetStat(stats.Spirit)-beforeSpirit, healer.GetStat(stats.HealingPower)-beforePower, healer.ManaRegenPerSecondWhileCasting()-beforeRegen)
}

func TestKFCPriestBlueDragonRefreshExpiryReset(t *testing.T) {
	sim, healer, _ := kfcItemFixture(t, &proto.PriestTalents{SpiritualGuidance: 5}, 19288)
	aura := healer.GetAura("Aura of the Blue Dragon")
	before, beforePower := healer.GetStat(stats.Spirit), healer.GetStat(stats.HealingPower)
	aura.Activate(sim)
	kfcPriestAdvance(t, sim, 10*time.Second)
	aura.Activate(sim)
	kfcPriestNear(t, healer.GetStat(stats.Spirit)-before, 157.5)
	kfcPriestAdvance(t, sim, 24999*time.Millisecond)
	if !aura.IsActive() {
		t.Fatal("A reproc failed to refresh its 15-second duration")
	}
	kfcPriestAdvance(t, sim, 25*time.Second)
	if aura.IsActive() {
		t.Fatal("Blue Dragon did not expire")
	}
	kfcPriestNear(t, healer.GetStat(stats.Spirit), before)
	kfcPriestNear(t, healer.GetStat(stats.HealingPower), beforePower)
	aura.Activate(sim)
	sim.Cleanup()
	sim.Reset()
	if aura.IsActive() {
		t.Fatal("Blue Dragon leaked into the next iteration")
	}
	kfcPriestNear(t, healer.GetStat(stats.Spirit), before)
}

func TestKFCPriestBlueDragonRealSpellProcs(t *testing.T) {
	sim, healer, target := kfcItemFixture(t, &proto.PriestTalents{}, 19288)
	aura := healer.GetAura("Aura of the Blue Dragon")
	activations, original := 0, aura.OnGain
	aura.OnGain = func(a *core.Aura, s *core.Simulation) { activations++; original(a, s) }
	spell := healer.LesserHeal[1]
	spell.BonusCritRating = -10000
	for count := 0; count < 500; count++ {
		if !spell.Cast(sim, target) {
			t.Fatal("Blue Dragon's actual spell-cast control failed")
		}
		kfcPriestAdvance(t, sim, sim.CurrentTime+1500*time.Millisecond)
	}
	if activations < 1 || activations > 25 {
		t.Fatalf("Unexpected seeded two-percent proc behavior: %d", activations)
	}
	if spell.SpellMetrics[target.UnitIndex].Casts != 500 {
		t.Fatal("The proc control did not cast 500 real spells")
	}
	fmt.Printf("KFC_HEALER_BLUE_DRAGON_PROCS %d\n", activations)
}

func TestKFCPriestBlueDragonPeriodicExclusion(t *testing.T) {
	sim, healer, target := kfcItemFixture(t, &proto.PriestTalents{}, 19288)
	aura, spell := healer.GetAura("Aura of the Blue Dragon"), healer.Renew[1]
	spell.BonusCritRating = -10000
	for cycle := 0; cycle < 100; cycle++ {
		if !spell.Cast(sim, target) {
			t.Fatal("Renew proc exclusion cast failed")
		}
		aura.Deactivate(sim)
		kfcPriestAdvance(t, sim, sim.CurrentTime+15*time.Second)
		if aura.IsActive() {
			t.Fatal("A periodic Renew tick triggered the cast-only item")
		}
	}
	if spell.SpellMetrics[target.UnitIndex].Ticks != 500 {
		t.Fatal("The control did not deliver 500 real periodic heals")
	}
}

func TestKFCPriestBlueDragonCastOpportunityCounts(t *testing.T) {
	sim, healer, target := kfcItemFixture(t, &proto.PriestTalents{Penance: true, PrayerOfMending: true}, 19288)
	trigger := healer.GetAura("Aura of the Blue Dragon Trigger")
	count, original := 0, trigger.OnCastComplete
	trigger.OnCastComplete = func(a *core.Aura, s *core.Simulation, spell *core.Spell) {
		if spell.ProcMask.Matches(core.ProcMaskSpellHealing | core.ProcMaskSpellDamage) {
			count++
		}
		original(a, s, spell)
	}
	if !healer.Penance.Cast(sim, target) {
		t.Fatal("Penance opportunity cast failed")
	}
	kfcPriestAdvance(t, sim, 2*time.Second)
	if count != 1 {
		t.Fatalf("Penance granted %d opportunities instead of one parent cast", count)
	}
	if !healer.GetSpell(core.ActionID{SpellID: 10961}).Cast(sim, target) {
		t.Fatal("Party-heal opportunity cast failed")
	}
	kfcPriestAdvance(t, sim, 5*time.Second)
	if count != 2 {
		t.Fatal("Each Prayer recipient received an extra item opportunity")
	}
	if !healer.PrayerOfMending.Cast(sim, target) {
		t.Fatal("Mending opportunity cast failed")
	}
	kfcDamageTrigger(sim, target, 100)
	kfcPriestAdvance(t, sim, 8*time.Second)
	if count != 3 {
		t.Fatal("A triggered Mending bounce received an extra item opportunity")
	}
}

func TestKFCPriestBlueDragonRequiresEquippedItem(t *testing.T) {
	_, healer, _ := kfcItemFixture(t, &proto.PriestTalents{})
	if healer.GetAura("Aura of the Blue Dragon") != nil || healer.GetAura("Aura of the Blue Dragon Trigger") != nil {
		t.Fatal("Unequipped Blue Dragon granted an effect")
	}
}

func TestKFCPriestCurrentBlueSetHealing(t *testing.T) {
	_, baseline, _ := kfcItemFixtureWithRace(t, &proto.PriestTalents{}, proto.Race_RaceUndead)
	for _, ids := range [][]int32{{272562}, {272562, 272563}, {272562, 272563, 272564, 272565, 272568, 272569}} {
		sim, healer, target := kfcItemFixtureWithRace(t, &proto.PriestTalents{}, proto.Race_RaceUndead, ids...)
		var gearPower, gearStamina float64
		for _, item := range healer.Equipment {
			gearPower += item.Stats[stats.SpellPower]
			gearStamina += item.Stats[stats.Stamina]
		}
		setPower, setStamina := 0.0, 0.0
		if len(ids) >= 2 {
			setPower = 23
		}
		if len(ids) >= 6 {
			setStamina = 20
		}
		kfcPriestNear(t, healer.GetStat(stats.SpellPower)-baseline.GetStat(stats.SpellPower), gearPower+setPower)
		kfcPriestNear(t, healer.GetStat(stats.Stamina)-baseline.GetStat(stats.Stamina), gearStamina+setStamina)
		target.RemoveHealth(sim, 4000)
		spell := healer.FlashHeal[7]
		spell.BonusCritRating = -10000
		if !spell.Cast(sim, target) {
			t.Fatal("Current blue set healing cast failed")
		}
		kfcPriestAdvance(t, sim, 1500*time.Millisecond)
		if spell.SpellMetrics[target.UnitIndex].TotalEffectiveHealing <= 0 {
			t.Fatal("Current blue set failed to heal")
		}
	}
}

func TestKFCPriestHealerItemExternalInputs(t *testing.T) {
	request := kfcWorkloadRequest(16000, 3, 180)
	request.Raid.Parties[0].Players[0].Equipment = kfcItemEquipment(19288)
	request.Raid.Parties[0].Players[0].TalentsString = kfcItemTalents(&proto.PriestTalents{SpiritualGuidance: 5, Meditation: 3})
	frame := kfcTankWorkload(180)
	item := kfcHealingProtocolJob(t, "external-blue-dragon", request, frame, false)
	request.Raid.Parties[0].Players[0].Equipment = kfcItemEquipment()
	baseline := kfcHealingProtocolJob(t, "external-no-blue-dragon", request, frame, false)
	jobs := map[string]KFCHealingJob{"blueDragon": item, "noBlueDragon": baseline}
	results := map[string]*KFCHealingJobResult{}
	for name, job := range jobs {
		reply := RunKFCHealingJob(context.Background(), kfcHealingJobJSON(t, job))
		if reply.Status != "complete" || reply.Result == nil {
			t.Fatalf("Item workload %s failed: %+v", name, reply.Error)
		}
		results[name] = reply.Result
	}
	if results["blueDragon"].ManaRemainingMean <= results["noBlueDragon"].ManaRemainingMean {
		t.Fatal("The seeded equipped item had no resource effect in the real workload")
	}
	encoded, err := json.Marshal(jobs)
	if err != nil {
		t.Fatal(err)
	}
	fmt.Printf("KFC_HEALER_ITEM_INPUTS %s\n", encoded)
}
