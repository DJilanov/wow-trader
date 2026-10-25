package healing

import (
	"context"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/priest"
	"google.golang.org/protobuf/encoding/protojson"
)

func kfcPriestRodFixture(t *testing.T, owned bool) (*core.Simulation, *HealingPriest) {
	t.Helper()
	request := kfcWorkloadRequest(10000, 1, 180)
	request.SimOptions.Interactive, request.SimOptions.IsTest = true, true
	player := request.Raid.Parties[0].Players[0]
	player.TalentsString = kfcItemTalents(&proto.PriestTalents{HolyNova: true})
	player.Equipment = kfcItemEquipment()
	if owned {
		player.Equipment.Items[14].Id = 18321
	}
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	healer := sim.Raid.Parties[0].Players[0].(*HealingPriest)
	positions := map[int32]priest.KFCFriendlyPosition{}
	for _, unit := range sim.Raid.AllUnits {
		positions[unit.UnitIndex] = priest.KFCFriendlyPosition{}
	}
	if err := healer.ConfigureKFCFriendlyPositions(positions); err != nil {
		t.Fatal(err)
	}
	return sim, healer
}

func kfcPriestRodMana(healer *HealingPriest) (float64, float64) {
	gain, actual := 0.0, 0.0
	for _, row := range healer.Metrics.ToProto().Resources {
		if row.Id.GetSpellId() == 1302191 && row.Type == proto.ResourceType_ResourceTypeMana {
			gain += row.Gain
			actual += row.ActualGain
		}
	}
	return gain, actual
}

func TestKFCPriestRodOwnershipAndEveryActualNovaRank(t *testing.T) {
	values := []float64{}
	for _, owned := range []bool{false, true} {
		for _, id := range []int32{15237, 15430, 15431, 27799, 27800, 27801} {
			sim, healer := kfcPriestRodFixture(t, owned)
			if (healer.GetAura("Priest Energetic Rod trigger") != nil) != owned {
				t.Fatal("Rod ownership changed")
			}
			spell := healer.GetSpell(core.ActionID{SpellID: id})
			if spell == nil || !spell.ProcMask.Matches(core.ProcMaskSpellDamage) || !spell.Cast(sim, sim.Encounter.TargetUnits[0]) {
				t.Fatal("Actual harmful Holy Nova parent did not cast", id)
			}
			kfcPriestAdvance(t, sim, 1500*time.Millisecond)
			gain, actual := kfcPriestRodMana(healer)
			want := 0.0
			if owned {
				want = 48
			}
			kfcPriestNear(t, gain, want)
			kfcPriestNear(t, actual, want)
			values = append(values, gain)
		}
	}
	kfcPriestHeartMeasure("ROD_RANKS", values)
}

func TestKFCPriestRodHelpfulPassiveAndUnregisteredExclusions(t *testing.T) {
	for _, id := range []int32{2060, 2061, 139} {
		sim, healer := kfcPriestRodFixture(t, true)
		target := &sim.Raid.GetFirstTargetDummy().Unit
		target.RemoveHealth(sim, 1000)
		spell := healer.GetSpell(core.ActionID{SpellID: id})
		if spell == nil || !spell.Cast(sim, target) {
			t.Fatal("Helpful control did not cast", id)
		}
		kfcPriestAdvance(t, sim, max(1500*time.Millisecond, spell.DefaultCast.CastTime))
		gain, _ := kfcPriestRodMana(healer)
		kfcPriestNear(t, gain, 0)
	}
	sim, healer := kfcPriestRodFixture(t, true)
	aura := healer.GetAura("Priest Energetic Rod trigger")
	spell := healer.GetSpell(core.ActionID{SpellID: 15237})
	unregistered := *spell
	aura.OnCastComplete(aura, sim, &unregistered)
	flags := spell.Flags
	for _, excluded := range []core.SpellFlag{core.SpellFlagPassiveSpell, core.SpellFlagNoOnCastComplete} {
		spell.Flags = flags | excluded
		aura.OnCastComplete(aura, sim, spell)
	}
	spell.Flags = flags
	aura.OnCastComplete(aura, sim, nil)
	gain, _ := kfcPriestRodMana(healer)
	kfcPriestNear(t, gain, 0)
}

func TestKFCPriestRodManaCapDeathPrecombatAndIterationReset(t *testing.T) {
	sim, healer := kfcPriestRodFixture(t, true)
	aura, spell := healer.GetAura("Priest Energetic Rod trigger"), healer.GetSpell(core.ActionID{SpellID: 15237})
	before := healer.CurrentMana()
	aura.OnCastComplete(aura, sim, spell)
	gain, actual := kfcPriestRodMana(healer)
	kfcPriestNear(t, gain, 48)
	kfcPriestNear(t, actual, 0)
	kfcPriestNear(t, healer.CurrentMana(), before)
	sim.Cleanup()
	sim.Reset()
	// Manual Reset retains aggregated resource metrics; it must not add a new gain.
	gain, _ = kfcPriestRodMana(healer)
	kfcPriestNear(t, gain, 48)
	sim.CurrentTime = -time.Second
	aura.OnCastComplete(aura, sim, spell)
	sim.CurrentTime = 0
	healer.RemoveHealth(sim, healer.CurrentHealth())
	aura.OnCastComplete(aura, sim, spell)
	gain, _ = kfcPriestRodMana(healer)
	kfcPriestNear(t, gain, 48)
	sim.Cleanup()
	sim.Reset()
	if !spell.Cast(sim, sim.Encounter.TargetUnits[0]) {
		t.Fatal("Rod did not recover after a new iteration")
	}
	kfcPriestAdvance(t, sim, 1500*time.Millisecond)
	gain, actual = kfcPriestRodMana(healer)
	kfcPriestNear(t, gain, 96)
	kfcPriestNear(t, actual, 48)
}

func TestKFCPriestRodActualHealingWorkloadResourceAccounting(t *testing.T) {
	request := kfcWorkloadRequest(10000, 1, 30)
	player := request.Raid.Parties[0].Players[0]
	player.TalentsString = kfcItemTalents(&proto.PriestTalents{HolyNova: true})
	player.Equipment = kfcItemEquipment()
	player.Equipment.Items[14].Id = 18321
	frame := kfcTankWorkload(30)
	for index := range frame.Damage {
		frame.Damage[index].Amount = 50
	}
	frame.Priorities = []KFCHealingPriority{{SpellID: 15237, RaidIndex: 1, MinimumMissingHealth: 50}}
	job := kfcHealingProtocolJob(t, "priest-rod-workload", request, frame, true)
	reply := RunKFCHealingJob(context.Background(), kfcHealingJobJSON(t, job))
	if reply.Status != "complete" || reply.Result == nil {
		t.Fatalf("Rod workload failed: %+v", reply.Error)
	}
	metrics := &proto.RaidMetrics{}
	if err := protojson.Unmarshal(reply.Result.Metrics, metrics); err != nil {
		t.Fatal(err)
	}
	playerMetrics := metrics.Parties[0].Players[0]
	casts, gained := int32(0), 0.0
	for _, action := range playerMetrics.Actions {
		if action.Id.GetSpellId() == 15237 {
			for _, target := range action.Targets {
				casts += target.Casts
			}
		}
	}
	for _, resource := range playerMetrics.Resources {
		if resource.Id.GetSpellId() == 1302191 && resource.Type == proto.ResourceType_ResourceTypeMana {
			gained += resource.Gain
		}
	}
	if casts == 0 {
		t.Fatal("Healing workload never cast Holy Nova")
	}
	kfcPriestNear(t, gained, float64(casts)*48)
	kfcPriestHeartMeasure("ROD_WORKLOAD_REQUEST", job)
	kfcPriestHeartMeasure("ROD_WORKLOAD_RESULT", reply)
}
