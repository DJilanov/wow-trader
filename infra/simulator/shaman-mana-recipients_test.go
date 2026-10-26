package restoration

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	googleProto "google.golang.org/protobuf/proto"
)

func kfcShamanRecipientManaReference(index int32, maximum, starting float64, costs ...KFCShamanRecipientManaCost) KFCShamanRecipientManaPolicy {
	return KFCShamanRecipientManaPolicy{Schema: "kfc-shaman-recipient-mana.v1", ID: "controlled-recipient-mana", Regeneration: "none-reference", Payment: "all-or-nothing-no-retry-reference", Timing: "spend-before-pulses-reference", Recipients: []KFCShamanManaRecipient{{RaidIndex: index, MaximumMana: maximum, StartingMana: &starting, Costs: costs}}}
}

func kfcShamanRecipientManaFixture(t *testing.T, policy KFCShamanRecipientManaPolicy, count int, water KFCShamanWaterPolicy, headmaster bool) (*core.Simulation, *RestorationShaman, *kfcShamanRecipientManaState) {
	t.Helper()
	request := kfcShamanRequest(0)
	request.Encounter.Duration = 1800
	request.Raid.TargetDummies = int32(count)
	for len(request.Raid.Parties)*5 < count+1 {
		request.Raid.Parties = append(request.Raid.Parties, &proto.Party{})
	}
	player := request.Raid.Parties[0].Players[0]
	player.TalentsString = kfcRiptideTalentString(map[string]int32{"mana_tide_totem": 1, "riptide": 1, "water_shield": 1})
	if headmaster {
		player.Equipment = &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
		for i := range player.Equipment.Items {
			player.Equipment.Items[i] = &proto.ItemSpec{}
		}
		player.Equipment.Items[14].Id = 13937
	}
	pools, err := kfcShamanRecipientManaPools(&policy, 1800)
	if err != nil {
		t.Fatal(err)
	}
	sim, err := core.NewKFCManaRecipientSimulation(request, simsignals.CreateSignals(), pools)
	if err != nil {
		t.Fatal(err)
	}
	sim.Reset()
	resto := sim.Raid.Parties[0].Players[0].(*RestorationShaman)
	positions := map[int32]KFCShamanFriendlyPosition{}
	units := map[int32]*core.Unit{}
	for _, unit := range resto.kfcHealingPlayers() {
		positions[unit.UnitIndex] = KFCShamanFriendlyPosition{}
		units[unit.Index] = unit
	}
	if err = resto.ConfigureKFCShamanHealingPositions(sim, positions, 12.5, "nearest-injured-reference"); err != nil {
		t.Fatal(err)
	}
	if err = resto.ConfigureKFCShamanWaterPolicy(sim, water); err != nil {
		t.Fatal(err)
	}
	if err = resto.ConfigureKFCShamanResourcePolicy(sim, kfcShamanResourceDefault()); err != nil {
		t.Fatal(err)
	}
	if err = resto.ConfigureKFCShamanRiptidePolicy(sim, kfcRiptideDefault()); err != nil {
		t.Fatal(err)
	}
	state, err := resto.prepareKFCShamanRecipientMana(&policy, units)
	if err != nil {
		t.Fatal(err)
	}
	if err = state.reset(sim, &policy); err != nil {
		t.Fatal(err)
	}
	if headmaster {
		resto.setKFCShamanManaCapacityAccounting(true)
		p := kfcShamanUtilityReference()
		p.HeadmasterIntellect = "additive-reference"
		kfcShamanConfigureUtility(t, sim, resto, p)
	}
	sim.PrePull()
	state.schedule(sim, &policy)
	return sim, resto, state
}

func kfcShamanRecipientManaWater() KFCShamanWaterPolicy {
	return KFCShamanWaterPolicy{FirstPulse: "after-period-reference", Recipients: "party-reference", HealingScaling: "base-and-power-reference"}
}

func TestKFCShamanRecipientManaActualPoolAndNoInventedRegeneration(t *testing.T) {
	policy := kfcShamanRecipientManaReference(1, 1000, 100)
	sim, resto, state := kfcShamanRecipientManaFixture(t, policy, 4, kfcShamanRecipientManaWater(), false)
	defer sim.Cleanup()
	unit := state.units[1]
	kfcShamanNear(t, unit.MaxMana(), 1000)
	kfcShamanNear(t, unit.CurrentMana(), 100)
	if !unit.HasManaBar() || resto.kfcHealingPlayers()[2].HasManaBar() {
		t.Fatal("mana capability escaped declared recipients")
	}
	kfcShamanAdvance(t, sim, 6*time.Second)
	kfcShamanNear(t, unit.CurrentMana(), 100)
	kfcShamanMeasure("RECIPIENT_MANA_POOL", []float64{unit.MaxMana(), unit.CurrentMana()})
}

func TestKFCShamanRecipientManaCoreRejectsBorrowedAbsentAndDuplicateSlots(t *testing.T) {
	for _, rows := range [][]core.KFCManaRecipientPool{{{RaidIndex: 0, MaximumMana: 1000}}, {{RaidIndex: 39, MaximumMana: 1000}}, {{RaidIndex: 1, MaximumMana: 1000}, {RaidIndex: 1, MaximumMana: 1000}}, {{RaidIndex: 1, MaximumMana: -1}}} {
		if _, err := core.NewKFCManaRecipientSimulation(kfcShamanRequest(0), simsignals.CreateSignals(), rows); err == nil {
			t.Fatal("invalid actor pool admitted", rows)
		}
	}
	request := kfcShamanRequest(0)
	sim, err := core.NewKFCManaRecipientSimulation(request, simsignals.CreateSignals(), nil)
	if err != nil {
		t.Fatal(err)
	}
	sim.Reset()
	if sim.Raid.GetFirstTargetDummy().HasManaBar() {
		t.Fatal("empty compatibility path enabled mana")
	}
	sim.Cleanup()
	kfcShamanMeasure("RECIPIENT_MANA_CORE_GATE", 5)
}

func TestKFCShamanRecipientManaCostsAreWholePaymentsWithoutOverdraw(t *testing.T) {
	policy := kfcShamanRecipientManaReference(1, 1000, 500, KFCShamanRecipientManaCost{AtMS: 1000, Amount: 600}, KFCShamanRecipientManaCost{AtMS: 2000, Amount: 400}, KFCShamanRecipientManaCost{AtMS: 3000, Amount: 200})
	sim, _, state := kfcShamanRecipientManaFixture(t, policy, 1, kfcShamanRecipientManaWater(), false)
	defer sim.Cleanup()
	kfcShamanAdvance(t, sim, 4*time.Second)
	metrics := &KFCShamanHealingAssignmentMetrics{}
	if err := state.finish(metrics); err != nil {
		t.Fatal(err)
	}
	kfcShamanNear(t, metrics.RecipientManaDemandMean, 1200)
	kfcShamanNear(t, metrics.RecipientManaSpentMean, 400)
	kfcShamanNear(t, metrics.RecipientUnpaidManaMean, 800)
	kfcShamanNear(t, metrics.RecipientManaCostsCompletedMean, 1)
	kfcShamanNear(t, metrics.RecipientManaCostsMissedMean, 2)
	kfcShamanNear(t, metrics.FinalLivingRecipientManaMean, 100)
	kfcShamanMeasure("RECIPIENT_MANA_PAYMENTS", metrics)
}

func TestKFCShamanRecipientManaActualTideUsesCapacityAndOwnManaSeparately(t *testing.T) {
	for _, maximum := range []float64{100, 1000} {
		policy := kfcShamanRecipientManaReference(1, maximum, 0)
		sim, resto, state := kfcShamanRecipientManaFixture(t, policy, 1, kfcShamanRecipientManaWater(), false)
		if !resto.ManaTideTotem[1].Cast(sim, &resto.Unit) {
			t.Fatal("actual Mana Tide rejected")
		}
		kfcShamanAdvance(t, sim, 13*time.Second)
		actual := resto.kfcWater.manaMetrics[16191][state.units[1].UnitIndex].ActualGainForCurrentIteration()
		kfcShamanNear(t, actual, min(maximum, 352))
		kfcShamanNear(t, state.units[1].CurrentMana(), actual)
		kfcShamanMeasure("RECIPIENT_MANA_TIDE", []float64{maximum, actual})
		sim.Cleanup()
	}
}

func TestKFCShamanRecipientManaPulseOrderingChangesCostFeasibility(t *testing.T) {
	for _, timing := range []string{"spend-before-pulses-reference", "spend-after-pulses-reference"} {
		policy := kfcShamanRecipientManaReference(1, 100, 100, KFCShamanRecipientManaCost{AtMS: 3000, Amount: 88}, KFCShamanRecipientManaCost{AtMS: 3001, Amount: 88})
		policy.Timing = timing
		sim, resto, state := kfcShamanRecipientManaFixture(t, policy, 1, kfcShamanRecipientManaWater(), false)
		if !resto.ManaTideTotem[1].Cast(sim, &resto.Unit) {
			t.Fatal("actual Tide rejected")
		}
		kfcShamanAdvance(t, sim, 13*time.Second)
		want := 176.0
		if timing == "spend-after-pulses-reference" {
			want = 88
		}
		kfcShamanNear(t, state.spent, want)
		kfcShamanMeasure("RECIPIENT_MANA_ORDER", map[string]interface{}{"timing": timing, "spent": state.spent})
		sim.Cleanup()
	}
}

func TestKFCShamanRecipientManaPartyRaidRangeAndDeadRecipients(t *testing.T) {
	for _, mode := range []string{"party-reference", "raid-reference"} {
		policy := kfcShamanRecipientManaReference(5, 1000, 0, KFCShamanRecipientManaCost{AtMS: 4000, Amount: 50})
		water := kfcShamanRecipientManaWater()
		water.Recipients = mode
		sim, resto, state := kfcShamanRecipientManaFixture(t, policy, 6, water, false)
		if !resto.ManaTideTotem[1].Cast(sim, &resto.Unit) {
			t.Fatal("Tide rejected")
		}
		kfcShamanAdvance(t, sim, 13*time.Second)
		want := 0.0
		if mode == "raid-reference" {
			want = 50
		}
		kfcShamanNear(t, state.spent, want)
		sim.Cleanup()
	}
	policy := kfcShamanRecipientManaReference(1, 1000, 0, KFCShamanRecipientManaCost{AtMS: 4000, Amount: 50})
	for _, dead := range []bool{false, true} {
		sim, resto, state := kfcShamanRecipientManaFixture(t, policy, 1, kfcShamanRecipientManaWater(), false)
		unit := state.units[1]
		if dead {
			unit.RemoveHealth(sim, unit.CurrentHealth())
		} else {
			resto.positions[unit.UnitIndex] = KFCShamanFriendlyPosition{X: 31}
		}
		if !resto.ManaTideTotem[1].Cast(sim, &resto.Unit) {
			t.Fatal("Tide rejected")
		}
		kfcShamanAdvance(t, sim, 13*time.Second)
		kfcShamanNear(t, unit.CurrentMana(), 0)
		kfcShamanNear(t, state.spent, 0)
		sim.Cleanup()
	}
	kfcShamanMeasure("RECIPIENT_MANA_RECIPIENT_GATES", 4)
}

func TestKFCShamanRecipientManaResetAndFractionalCapacity(t *testing.T) {
	policy := kfcShamanRecipientManaReference(1, .1, 0)
	sim, resto, state := kfcShamanRecipientManaFixture(t, policy, 1, kfcShamanRecipientManaWater(), false)
	if !resto.ManaTideTotem[1].Cast(sim, &resto.Unit) {
		t.Fatal("Tide rejected")
	}
	kfcShamanAdvance(t, sim, 13*time.Second)
	kfcShamanNear(t, state.units[1].CurrentMana(), .1)
	sim.Cleanup()
	sim.Reset()
	if err := state.reset(sim, &policy); err != nil {
		t.Fatal(err)
	}
	kfcShamanNear(t, state.units[1].CurrentMana(), 0)
	kfcShamanNear(t, state.spent, 0)
	sim.Cleanup()
	kfcShamanMeasure("RECIPIENT_MANA_RESET", .1)
}

func TestKFCShamanRecipientManaHeadmasterGrowthExpiryAndCapacityLoss(t *testing.T) {
	policy := kfcShamanRecipientManaReference(1, 1000, 1000)
	sim, resto, state := kfcShamanRecipientManaFixture(t, policy, 1, kfcShamanRecipientManaWater(), true)
	defer sim.Cleanup()
	if !resto.kfcUtilityItems.spells[13937].Cast(sim, &resto.Unit) || !resto.ManaTideTotem[1].Cast(sim, &resto.Unit) {
		t.Fatal("actual party Intellect/Tide rejected")
	}
	kfcShamanNear(t, state.units[1].MaxMana(), 1300)
	kfcShamanAdvance(t, sim, 13*time.Second)
	kfcShamanNear(t, state.units[1].CurrentMana(), 1300)
	kfcShamanAdvance(t, sim, 900*time.Second)
	kfcShamanNear(t, state.units[1].MaxMana(), 1000)
	kfcShamanNear(t, state.units[1].CurrentMana(), 1000)
	if resto.CurrentMana() > resto.MaxMana()+1e-7 {
		t.Fatal("owner mana exceeded expired capacity")
	}
	metrics := &KFCShamanHealingAssignmentMetrics{}
	if err := state.finish(metrics); err != nil {
		t.Fatal(err)
	}
	kfcShamanMeasure("RECIPIENT_MANA_TEMPORARY_CAPACITY", []float64{state.units[1].MaxMana(), state.units[1].CurrentMana()})
}

func TestKFCShamanRecipientManaInvalidPolicyBoundaries(t *testing.T) {
	base := kfcShamanRecipientManaReference(1, 1000, 0)
	for _, edit := range []func(*KFCShamanRecipientManaPolicy){func(p *KFCShamanRecipientManaPolicy) { p.Recipients[0].StartingMana = nil }, func(p *KFCShamanRecipientManaPolicy) { p.Regeneration = "unlimited" }, func(p *KFCShamanRecipientManaPolicy) { p.Payment = "partial" }, func(p *KFCShamanRecipientManaPolicy) {
		p.Recipients[0].Costs = []KFCShamanRecipientManaCost{{AtMS: 12000, Amount: 1}}
	}, func(p *KFCShamanRecipientManaPolicy) { p.Recipients = append(p.Recipients, p.Recipients[0]) }} {
		body, _ := json.Marshal(base)
		var changed KFCShamanRecipientManaPolicy
		if err := json.Unmarshal(body, &changed); err != nil {
			t.Fatal(err)
		}
		edit(&changed)
		if changed.Validate(12) == nil {
			t.Fatal("invalid resource policy accepted")
		}
	}
	kfcShamanMeasure("RECIPIENT_MANA_POLICY_GATE", 5)
}

func TestKFCShamanRecipientManaActualWireAndSeparateHealingAccounting(t *testing.T) {
	request, frame := kfcShamanEquippedControl(t, "2-4-11", nil)
	request.Encounter.Duration = 14
	policy := kfcShamanRecipientManaReference(1, 1000, 0, KFCShamanRecipientManaCost{AtMS: 4000, Amount: 100}, KFCShamanRecipientManaCost{AtMS: 8000, Amount: 100})
	frame.RecipientMana = &policy
	frame.Workload.Priorities = append([]KFCShamanHealingPriority{{SpellID: 16190, RaidIndex: -1}}, frame.Workload.Priorities...)
	result := kfcShamanEquippedResult(t, request, frame)
	kfcShamanNear(t, result.Assignment.UsefulOtherManaTideManaMean, 352)
	kfcShamanNear(t, result.Assignment.RecipientManaDemandMean, 200)
	kfcShamanNear(t, result.Assignment.RecipientManaSpentMean, 100)
	kfcShamanNear(t, result.Assignment.RecipientUnpaidManaMean, 100)
	kfcShamanNear(t, result.Assignment.FinalLivingRecipientManaMean, 252)
	if result.Assignment.SupportHpsMean*request.Encounter.Duration > result.Assignment.DamageDemandMean+1e-7 {
		t.Fatal("resource utility inflated healing")
	}
	encoded, err := googleProto.Marshal(request)
	if err != nil {
		t.Fatal(err)
	}
	job := KFCShamanEquippedHealingJob{Schema: "kfc-shaman-equipped-job.v1", ID: "recipient-mana-transport-control", RequestBase64: base64.StdEncoding.EncodeToString(encoded), Workload: frame, Detail: true}
	payload, err := json.Marshal(job)
	if err != nil {
		t.Fatal(err)
	}
	reply := RunKFCShamanEquippedHealingJob(context.Background(), payload)
	if reply.Status != "complete" || reply.Result == nil || reply.Result.Equipped.RecipientMana == nil {
		t.Fatal("actual recipient-mana job rejected", reply.Error)
	}
	kfcShamanMeasure("RECIPIENT_MANA_WIRE", struct {
		Payload json.RawMessage                  `json:"payload"`
		Reply   KFCShamanEquippedHealingJobReply `json:"reply"`
	}{payload, reply})
}
