package restoration

import (
	"context"
	"encoding/json"
	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
	"math"
	"testing"
	"time"
)

func kfcUtilityPolicy() KFCDruidUtilityProbePolicy {
	zero := 0.0
	return KFCDruidUtilityProbePolicy{Schema: "kfc-druid-utility-probe.v1", ID: "optimistic-contender", Mode: "optimistic-contender", HeadmasterIntellect: &zero}
}
func kfcUtilityRequest(ids ...int32) *proto.RaidSimRequest {
	request := kfcFeralheartRequest(0)
	request.Encounter.Duration = 180
	request.Raid.TargetDummies = 4
	player := request.Raid.Parties[0].Players[0]
	player.BonusStats = nil
	player.Profession1 = proto.Profession_Engineering
	player.Profession2 = proto.Profession_Tailoring
	for slot, id := range kfcDruidEquippedControlIds {
		player.Equipment.Items[slot] = &proto.ItemSpec{Id: id}
	}
	for _, id := range ids {
		slot := 14
		switch id {
		case 11808:
			slot = 0
		case 8346:
			slot = 6
		case 18637:
			slot = 12
		}
		player.Equipment.Items[slot] = &proto.ItemSpec{Id: id}
		if id == 13937 {
			player.Equipment.Items[15] = &proto.ItemSpec{}
		}
	}
	return request
}
func kfcUtilityFixture(t *testing.T, ids ...int32) (*core.Simulation, *RestorationDruid) {
	t.Helper()
	sim := core.NewSim(kfcUtilityRequest(ids...), simsignals.CreateSignals())
	sim.Reset()
	healer := sim.Raid.Parties[0].Players[0].(*RestorationDruid)
	positions := map[int32]KFCDruidFriendlyPosition{}
	for _, unit := range sim.Raid.AllUnits {
		positions[unit.UnitIndex] = KFCDruidFriendlyPosition{}
		if err := unit.ConfigureKFCHealingBenchmarkHealth(sim, 5000); err != nil {
			t.Fatal(err)
		}
	}
	if err := healer.ConfigureKFCDruidHealing(positions, KFCDruidHealingPolicy{WildGrowthDecay: .1, SwiftmendSelection: "shortest"}); err != nil {
		t.Fatal(err)
	}
	return sim, healer
}
func TestKFCDruidUtilityProbeOwnedIntellectResetAndFreshness(t *testing.T) {
	request := kfcUtilityRequest(13937)
	request.Raid.Parties[0].Players[0].Buffs = &proto.IndividualBuffs{BlessingOfKings: true}
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	healer := sim.Raid.Parties[0].Players[0].(*RestorationDruid)
	base := healer.GetStat(stats.Intellect)
	before := healer.MaxMana()
	policy := kfcUtilityPolicy()
	amount := 20.0
	policy.HeadmasterIntellect = &amount
	if err := healer.ConfigureKFCUtilityProbe(sim, policy); err != nil {
		t.Fatal(err)
	}
	kfcDruidNear(t, healer.GetStat(stats.Intellect)-base, 22)
	kfcDruidNear(t, healer.MaxMana()-before, 330)
	kfcDruidNear(t, healer.CurrentMana(), healer.MaxMana())
	amount = 0
	kfcDruidNear(t, *healer.kfcResolvedUtilityProbe().HeadmasterIntellect, 20)
	if healer.ConfigureKFCUtilityProbe(sim, policy) == nil {
		t.Fatal("Repeated configuration accepted")
	}
	sim.Cleanup()
	sim.Reset()
	kfcDruidNear(t, healer.GetStat(stats.Intellect)-base, 22)
	kfcDruidNear(t, healer.MaxMana()-before, 330)
	kfcDruidAdvancedResult("UTILITY_INTELLECT", []float64{healer.GetStat(stats.Intellect) - base, healer.MaxMana() - before})
}
func TestKFCDruidUtilityProbeIndependentManaAndHealEnvelope(t *testing.T) {
	sim, healer := kfcUtilityFixture(t, 8346, 18637)
	p := kfcUtilityPolicy()
	p.Gauntlets = true
	p.Recombobulator = true
	if err := healer.ConfigureKFCUtilityProbe(sim, p); err != nil {
		t.Fatal(err)
	}
	target := &sim.Raid.GetFirstTargetDummy().Unit
	target.RemoveHealth(sim, 3000)
	healer.SpendMana(sim, 1000, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 71}))
	before := healer.CurrentMana()
	health := target.CurrentHealth()
	healer.useKFCUtilityProbes(sim)
	kfcDruidNear(t, healer.CurrentMana()-before, 380)
	kfcDruidNear(t, target.CurrentHealth()-health, 1998.75)
	if healer.GCD.ReadyAt() > sim.CurrentTime || healer.IsChanneling(sim) {
		t.Fatal("Envelope incorrectly charges a real-use cost")
	}
	healed := target.CurrentHealth()
	mana := healer.CurrentMana()
	healer.useKFCUtilityProbes(sim)
	kfcDruidNear(t, target.CurrentHealth(), healed)
	kfcDruidNear(t, healer.CurrentMana(), mana)
	kfcDruidAdvancedResult("UTILITY_HEAL_MANA", []float64{healed - health, mana - before})
}
func TestKFCDruidUtilityProbeCircleManaCostScope(t *testing.T) {
	sim, healer := kfcUtilityFixture(t, 11808)
	p := kfcUtilityPolicy()
	p.Circle = true
	p.MinimumMissingMana = 1000
	if err := healer.ConfigureKFCUtilityProbe(sim, p); err != nil {
		t.Fatal(err)
	}
	healer.SpendMana(sim, 999, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 72}))
	before := healer.CurrentMana()
	healer.useKFCUtilityProbes(sim)
	kfcDruidNear(t, healer.CurrentMana(), before)
	healer.SpendMana(sim, 501, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 73}))
	before = healer.CurrentMana()
	health := healer.CurrentHealth()
	healer.useKFCUtilityProbes(sim)
	kfcDruidNear(t, healer.CurrentMana()-before, 987.5)
	kfcDruidNear(t, healer.CurrentHealth(), health)
	healer.useKFCUtilityProbes(sim)
	kfcDruidNear(t, healer.CurrentMana()-before, 987.5)
	kfcDruidAdvancedResult("UTILITY_CIRCLE", []float64{healer.CurrentMana() - before, healer.CurrentHealth() - health})
}
func TestKFCDruidUtilityProbeBaronPartyRangeAndDeath(t *testing.T) {
	sim, healer := kfcUtilityFixture(t, 6323)
	p := kfcUtilityPolicy()
	p.BaronRegeneration = true
	if err := healer.ConfigureKFCUtilityProbe(sim, p); err != nil {
		t.Fatal(err)
	}
	target := &sim.Raid.GetFirstTargetDummy().Unit
	target.RemoveHealth(sim, 100)
	before := target.CurrentHealth()
	kfcDruidAdvance(t, sim, 5*time.Second)
	kfcDruidNear(t, target.CurrentHealth()-before, 4)
	healer.positions[target.UnitIndex] = KFCDruidFriendlyPosition{X: 31}
	kfcDruidAdvance(t, sim, 10*time.Second)
	kfcDruidNear(t, target.CurrentHealth()-before, 4)
	healer.positions[target.UnitIndex] = KFCDruidFriendlyPosition{}
	healer.RemoveHealth(sim, healer.CurrentHealth())
	kfcDruidAdvance(t, sim, 15*time.Second)
	kfcDruidNear(t, target.CurrentHealth()-before, 4)
	kfcDruidAdvancedResult("UTILITY_REGEN", target.CurrentHealth()-before)
}
func TestKFCDruidUtilityProbeDisabledAndOwnershipGuards(t *testing.T) {
	for _, id := range []int32{11808, 8346, 18637, 6323, 13937} {
		sim, healer := kfcUtilityFixture(t)
		p := kfcUtilityPolicy()
		switch id {
		case 11808:
			p.Circle = true
		case 8346:
			p.Gauntlets = true
		case 18637:
			p.Recombobulator = true
		case 6323:
			p.BaronRegeneration = true
		case 13937:
			value := 20.0
			p.HeadmasterIntellect = &value
		}
		if healer.ConfigureKFCUtilityProbe(sim, p) == nil {
			t.Fatal("Unowned probe accepted", id)
		}
	}
	sim, healer := kfcUtilityFixture(t, 11808, 8346, 18637)
	healer.SpendMana(sim, 1500, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 74}))
	target := &sim.Raid.GetFirstTargetDummy().Unit
	target.RemoveHealth(sim, 1000)
	beforeMana, beforeHealth := healer.CurrentMana(), target.CurrentHealth()
	healer.useKFCUtilityProbes(sim)
	kfcDruidNear(t, healer.CurrentMana(), beforeMana)
	kfcDruidNear(t, target.CurrentHealth(), beforeHealth)
	p := kfcUtilityPolicy()
	p.MinimumMissingMana = math.NaN()
	if p.Validate() == nil {
		t.Fatal("Nonfinite threshold accepted")
	}
	p = kfcUtilityPolicy()
	p.Mode = "disabled"
	p.Circle = true
	if p.Validate() == nil {
		t.Fatal("Disabled probe grants mana")
	}
	kfcDruidAdvancedResult("UTILITY_DISABLED", []float64{healer.CurrentMana() - beforeMana, target.CurrentHealth() - beforeHealth})
}
func TestKFCDruidUtilityProbeWorkloadTransport(t *testing.T) {
	request, frame := kfcDruidWorkloadControl()
	request.Raid.Parties[0].Players[0] = kfcUtilityRequest(8346).Raid.Parties[0].Players[0]
	p := kfcUtilityPolicy()
	p.Gauntlets = true
	frame.UtilityProbe = &p
	payload := kfcDruidControlPayload(t, request, frame, "utility-probe", false)
	reply := RunKFCDruidHealingJob(context.Background(), payload)
	if reply.Status != "complete" || reply.Result.UtilityProbe == nil || reply.Result.UtilityProbe.Mode != "optimistic-contender" {
		t.Fatalf("Probe transport failed: %+v", reply.Error)
	}
	kfcDruidNear(t, reply.Result.DeliveredIncomingDamageMean, 2900)
	kfcDruidAdvancedResult("UTILITY_REQUEST", json.RawMessage(payload))
	kfcDruidAdvancedResult("UTILITY_REPLY", reply)
}
