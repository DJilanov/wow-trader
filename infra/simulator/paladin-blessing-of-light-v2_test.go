package holy

import (
	"context"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
)

func kfcPaladinLightPolicy(target int32, blessing int32) KFCPaladinBlessingOfLightPolicy {
	return KFCPaladinBlessingOfLightPolicy{Schema: "kfc-paladin-blessing-of-light-policy.v1", Scaling: "full-tooltip-reference", MultiplierOrder: "before-healing-light",
		Assignments: []KFCPaladinBlessingOfLightAssignment{{RaidIndex: target, SpellID: blessing}}}
}

func kfcPaladinLightCast(t *testing.T, id int32, critical bool, policy *KFCPaladinBlessingOfLightPolicy, scaling *KFCPaladinHealingRankPolicy, talents map[int]int) float64 {
	t.Helper()
	sim, holy, units := kfcPaladinActiveFixture(t, 500, talents, 2)
	if scaling != nil {
		if err := holy.ConfigureKFCPaladinHealingRankScaling(*scaling); err != nil {
			t.Fatal(err)
		}
	}
	if policy != nil {
		if err := holy.ConfigureKFCPaladinBlessingOfLight(*policy); err != nil {
			t.Fatal(err)
		}
	}
	target := units[1]
	target.RemoveHealth(sim, 9000)
	spell := holy.GetSpell(core.ActionID{SpellID: id})
	if spell == nil {
		t.Fatal("missing control spell", id)
	}
	spell.BonusCritRating = -10000
	if critical {
		spell.BonusCritRating = 10000
	}
	before := target.CurrentHealth()
	if !spell.Cast(sim, target) {
		t.Fatal("Blessing of Light control cast rejected", id)
	}
	if spell.DefaultCast.CastTime > 0 {
		kfcPaladinAdvance(t, sim, spell.DefaultCast.CastTime)
	}
	return target.CurrentHealth() - before
}

func TestKFCPaladinBlessingOfLightAllRanksAndCriticals(t *testing.T) {
	observed := []float64{}
	for _, blessingID := range []int32{19977, 19978, 19979, 25890} {
		blessing := kfcPaladinBlessingOfLightRanks[blessingID]
		for _, rank := range kfcPaladinHealingRanks {
			for _, critical := range []bool{false, true} {
				policy := kfcPaladinLightPolicy(1, blessingID)
				base := kfcPaladinLightCast(t, rank.ID, critical, nil, nil, map[int]int{2: 3})
				actual := kfcPaladinLightCast(t, rank.ID, critical, &policy, nil, map[int]int{2: 3})
				bonus := blessing.HolyLight
				if kfcPaladinBlessingOfLightFamilies[rank.ID] == 1 {
					bonus = blessing.FlashOfLight
				}
				bonus *= 1.12
				if critical {
					bonus *= 1.5
				}
				kfcPaladinNear(t, actual-base, bonus)
				observed = append(observed, actual-base)
			}
		}
	}
	kfcPaladinActiveMeasure("LIGHT_RANK_BONUSES", observed)
}

func TestKFCPaladinBlessingOfLightScalingAndMultiplierCases(t *testing.T) {
	observed := []float64{}
	scaling := &KFCPaladinHealingRankPolicy{Schema: "kfc-paladin-rank-sensitivity.v1", ID: "light-rank-control", Kind: "level-distance-sensitivity", FullScalingGap: 5, CoefficientLossPerLevel: .04, ClassProcMode: "unchanged"}
	for _, test := range []struct {
		id     int32
		factor float64
		amount float64
	}{{635, 0, 400}, {10329, .96, 400}, {19943, 1, 115}, {19750, 0, 115}} {
		for _, scale := range []string{"full-tooltip-reference", "coefficient-factor"} {
			for _, order := range []string{"before-healing-light", "after-healing-light"} {
				policy := kfcPaladinLightPolicy(1, 19979)
				policy.Scaling, policy.MultiplierOrder = scale, order
				base := kfcPaladinLightCast(t, test.id, false, nil, scaling, map[int]int{2: 3})
				actual := kfcPaladinLightCast(t, test.id, false, &policy, scaling, map[int]int{2: 3})
				want := test.amount
				if scale == "coefficient-factor" {
					want *= test.factor
				}
				if order == "before-healing-light" {
					want *= 1.12
				}
				kfcPaladinNear(t, actual-base, want)
				observed = append(observed, actual-base)
			}
		}
	}
	kfcPaladinActiveMeasure("LIGHT_SENSITIVITY", observed)
}

func TestKFCPaladinBlessingOfLightOnlyAssignedBasicHeals(t *testing.T) {
	other := kfcPaladinLightPolicy(2, 19979)
	kfcPaladinNear(t, kfcPaladinLightCast(t, 10329, false, &other, nil, nil), kfcPaladinLightCast(t, 10329, false, nil, nil, nil))
	assigned := kfcPaladinLightPolicy(1, 19979)
	for _, id := range []int32{1311606, 20473, 20929, 20930} {
		kfcPaladinNear(t, kfcPaladinLightCast(t, id, false, &assigned, nil, map[int]int{13: 1}), kfcPaladinLightCast(t, id, false, nil, nil, map[int]int{13: 1}))
	}
	sim, holy, units := kfcPaladinActiveFixture(t, 0, map[int]int{13: 1, 16: 1}, 2)
	if err := holy.ConfigureKFCPaladinBlessingOfLight(assigned); err != nil {
		t.Fatal(err)
	}
	for _, id := range []int32{25914, 1311657, 1311658, 1311659, 20216} {
		kfcPaladinNear(t, holy.kfcBlessingOfLightBonus(sim, units[1], &core.Spell{ActionID: core.ActionID{SpellID: id}}), 0)
	}
	if holy.kfcBlessingOfLightBonus(sim, nil, holy.GetSpell(core.ActionID{SpellID: 10329})) != 0 {
		t.Fatal("nil target received bonus")
	}
}

func TestKFCPaladinBlessingOfLightRejectsInvalidAndStackingPolicies(t *testing.T) {
	for _, kind := range []string{"schema", "scaling", "order", "empty", "too-many", "unknown-rank", "unknown-target", "duplicate", "rank-without-scaling", "configured-twice", "after-cast"} {
		sim, holy, units := kfcPaladinActiveFixture(t, 0, nil, 2)
		policy := kfcPaladinLightPolicy(1, 19979)
		switch kind {
		case "schema":
			policy.Schema = "foreign"
		case "scaling":
			policy.Scaling = "server-verified"
		case "order":
			policy.MultiplierOrder = "unknown"
		case "empty":
			policy.Assignments = nil
		case "too-many":
			policy.Assignments = make([]KFCPaladinBlessingOfLightAssignment, 41)
		case "unknown-rank":
			policy.Assignments[0].SpellID = 25292
		case "unknown-target":
			policy.Assignments[0].RaidIndex = 99
		case "duplicate":
			policy.Assignments = append(policy.Assignments, policy.Assignments[0])
		case "rank-without-scaling":
			policy.Scaling = "coefficient-factor"
		case "configured-twice":
			if err := holy.ConfigureKFCPaladinBlessingOfLight(policy); err != nil {
				t.Fatal(err)
			}
		case "after-cast":
			if !holy.GetSpell(core.ActionID{SpellID: 10329}).Cast(sim, units[1]) {
				t.Fatal("setup cast failed")
			}
		}
		if err := holy.ConfigureKFCPaladinBlessingOfLight(policy); err == nil {
			t.Fatal("invalid light policy accepted", kind)
		}
		if kind != "configured-twice" && holy.KFCBlessingOfLight != nil {
			t.Fatal("failed configuration left partial state", kind)
		}
	}
}

func TestKFCPaladinBlessingOfLightExpirationResetAndInputCopy(t *testing.T) {
	sim, holy, units := kfcPaladinActiveFixture(t, 500, map[int]int{2: 3}, 2)
	policy := kfcPaladinLightPolicy(1, 19979)
	if err := holy.ConfigureKFCPaladinBlessingOfLight(policy); err != nil {
		t.Fatal(err)
	}
	policy.Assignments[0].SpellID = 0
	if holy.KFCBlessingOfLight.policy.Assignments[0].SpellID != 19979 {
		t.Fatal("caller mutated policy")
	}
	spell := holy.GetSpell(core.ActionID{SpellID: 10329})
	coefficient, multiplier := spell.BonusCoefficient, spell.DamageMultiplier
	want := 0.0
	for iteration := 0; iteration < 3; iteration++ {
		if iteration > 0 {
			sim.Cleanup()
			sim.Reset()
		}
		units[1].RemoveHealth(sim, 9000)
		spell.BonusCritRating = -10000
		before := units[1].CurrentHealth()
		if !spell.Cast(sim, units[1]) {
			t.Fatal("reset cast rejected")
		}
		kfcPaladinAdvance(t, sim, spell.DefaultCast.CastTime)
		amount := units[1].CurrentHealth() - before
		// Iterations intentionally use different random seeds; compare against exact bounds.
		for _, rank := range kfcPaladinHealingRanks {
			if rank.ID == 10329 {
				low, high := rank.bounds(int(holy.Level))
				low = (low + 500*rank.Coefficient + 400) * 1.12
				high = (high + 500*rank.Coefficient + 400) * 1.12
				if amount < low || amount > high {
					t.Fatal("reset changed the bounded heal", amount, low, high)
				}
			}
		}
		kfcPaladinNear(t, holy.kfcBlessingOfLightBonus(sim, units[1], spell), 400)
		want = amount
		kfcPaladinNear(t, spell.BonusCoefficient, coefficient)
		kfcPaladinNear(t, spell.DamageMultiplier, multiplier)
	}
	sim.CurrentTime = 3600*time.Second - time.Nanosecond
	kfcPaladinNear(t, holy.kfcBlessingOfLightBonus(sim, units[1], spell), 400)
	sim.CurrentTime = 3600 * time.Second
	kfcPaladinNear(t, holy.kfcBlessingOfLightBonus(sim, units[1], spell), 0)
	kfcPaladinActiveMeasure("LIGHT_RESET", want)
}

func TestKFCPaladinBlessingOfLightWorkloadAndStrictWire(t *testing.T) {
	request, frame := kfcPaladinWorkloadControl()
	for i := range frame.Damage {
		frame.Damage[i].Amount = 300
	}
	frame.Priorities[0].SpellID = 19943
	base := kfcPaladinRequireReply(t, RunKFCPaladinHealingJob(context.Background(), kfcPaladinWorkloadPayload(t, request, frame, "paladin-before-light", false)))
	policy := kfcPaladinLightPolicy(1, 19979)
	frame.BlessingOfLight = &policy
	result := kfcPaladinRequireReply(t, RunKFCPaladinHealingJob(context.Background(), kfcPaladinWorkloadPayload(t, request, frame, "paladin-after-light", false)))
	if result.BlessingOfLight == nil || result.BlessingOfLight.Scaling != policy.Scaling || result.RawHPS <= base.RawHPS || result.SurvivalRate != 1 {
		t.Fatal("declared light policy did not reach real workload", base, result)
	}
	policy.Assignments = append(policy.Assignments, policy.Assignments[0])
	if reply := RunKFCPaladinHealingJob(context.Background(), kfcPaladinWorkloadPayload(t, request, frame, "duplicate-light", false)); reply.Status != "error" {
		t.Fatal("wire accepted stacking light")
	}
	kfcPaladinActiveMeasure("LIGHT_WORKLOAD", []float64{base.RawHPS, result.RawHPS, base.EffectiveHealingHPS, result.EffectiveHealingHPS, result.ManaRemainingMean})
}

func TestKFCPaladinWorkloadRejectsUndeclaredManaTide(t *testing.T) {
	for _, partyIndex := range []int{0, 1} {
		request, frame := kfcPaladinWorkloadControl()
		if partyIndex == 1 {
			request.Raid.Parties = append(request.Raid.Parties, &proto.Party{})
		}
		request.Raid.Parties[partyIndex].Buffs = &proto.PartyBuffs{ManaTideTotems: 1}
		if reply := RunKFCPaladinHealingJob(context.Background(), kfcPaladinWorkloadPayload(t, request, frame, "undeclared-mana-tide", false)); reply.Status != "error" {
			t.Fatal("undeclared external Mana Tide accepted", partyIndex)
		}
	}
}
