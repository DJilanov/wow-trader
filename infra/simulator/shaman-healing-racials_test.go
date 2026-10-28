package restoration

import (
	"context"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
	googleProto "google.golang.org/protobuf/proto"
)

func kfcShamanRacialReference() KFCShamanRacialPolicy {
	return KFCShamanRacialPolicy{Schema: "kfc-shaman-racial-policy.v1", CriticalHealing: "client-aura50-reference"}
}

func kfcShamanRacialFixture(t *testing.T, race proto.Race, hot KFCShamanRiptidePolicy, items ...int32) (*core.Simulation, *RestorationShaman, []*core.Unit) {
	t.Helper()
	request := kfcShamanRequest(500)
	request.Encounter.Duration = 310
	player := request.Raid.Parties[0].Players[0]
	player.Race = race
	player.TalentsString = kfcRiptideTalentString(map[string]int32{"riptide": 1, "water_shield": 1})
	player.Equipment = &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
	for index := range player.Equipment.Items {
		player.Equipment.Items[index] = &proto.ItemSpec{}
	}
	for _, id := range items {
		if id != 8346 {
			t.Fatal("Unknown racial item fixture")
		}
		player.Equipment.Items[9].Id = id
	}
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	resto := sim.Raid.Parties[0].Players[0].(*RestorationShaman)
	kfcRiptideConfigure(t, sim, resto, hot, kfcShamanResourceDefault())
	return sim, resto, resto.kfcHealingPlayers()
}

func kfcShamanRacialConfigure(t *testing.T, sim *core.Simulation, resto *RestorationShaman, policy KFCShamanRacialPolicy) {
	t.Helper()
	if err := resto.ConfigureKFCShamanRacials(sim, policy); err != nil {
		t.Fatal(err)
	}
}

func TestKFCShamanRacialPolicyValidationAndLegalRaces(t *testing.T) {
	for _, race := range []proto.Race{proto.Race_RaceDwarf, proto.Race_RaceOrc, proto.Race_RaceTauren, proto.Race_RaceTroll, proto.Race_RaceSkyborneWindshaper} {
		sim, resto, _ := kfcShamanRacialFixture(t, race, kfcRiptideDefault())
		kfcShamanRacialConfigure(t, sim, resto, kfcShamanRacialReference())
		sim.Cleanup()
	}
	sim, resto, _ := kfcShamanRacialFixture(t, proto.Race_RaceTroll, kfcRiptideDefault())
	defer sim.Cleanup()
	for _, change := range []func(*KFCShamanRacialPolicy){
		func(p *KFCShamanRacialPolicy) { p.Schema = "verified" },
		func(p *KFCShamanRacialPolicy) { p.CriticalHealing = "verified" },
		func(p *KFCShamanRacialPolicy) { p.Actions = []KFCShamanRacialAction{{SpellID: 20572, MaximumUses: 1}} },
		func(p *KFCShamanRacialPolicy) { p.Actions = []KFCShamanRacialAction{{SpellID: 20554, MaximumUses: 0}} },
		func(p *KFCShamanRacialPolicy) { p.Actions = []KFCShamanRacialAction{{SpellID: 20554, MaximumUses: 21}} },
		func(p *KFCShamanRacialPolicy) {
			p.Actions = []KFCShamanRacialAction{{SpellID: 20554, MaximumUses: 1, EarliestMS: -1}}
		},
		func(p *KFCShamanRacialPolicy) {
			p.Actions = []KFCShamanRacialAction{{SpellID: 20554, MaximumUses: 1, EarliestMS: 310000}}
		},
		func(p *KFCShamanRacialPolicy) {
			p.Actions = []KFCShamanRacialAction{{SpellID: 20554, MaximumUses: 1}, {SpellID: 20554, MaximumUses: 1}}
		},
	} {
		policy := kfcShamanRacialReference()
		change(&policy)
		if resto.ConfigureKFCShamanRacials(sim, policy) == nil || resto.kfcRacials != nil {
			t.Fatal("Invalid racial policy accepted or partially applied")
		}
	}
	humanSim, human, _ := kfcShamanRacialFixture(t, proto.Race_RaceHuman, kfcRiptideDefault())
	defer humanSim.Cleanup()
	if human.ConfigureKFCShamanRacials(humanSim, kfcShamanRacialReference()) == nil {
		t.Fatal("Human admitted as playable Shaman")
	}
}

func TestKFCShamanRacialFreshActorIsolationAndCopiedActions(t *testing.T) {
	sim, resto, units := kfcShamanRacialFixture(t, proto.Race_RaceTroll, kfcRiptideDefault())
	defer sim.Cleanup()
	policy := kfcShamanRacialReference()
	policy.Actions = []KFCShamanRacialAction{{SpellID: 20554, MaximumUses: 1}}
	kfcShamanRacialConfigure(t, sim, resto, policy)
	policy.Actions[0].SpellID = 20572
	if resto.kfcRacials.policy.Actions[0].SpellID != 20554 {
		t.Fatal("Racial policy aliases caller")
	}
	if resto.ConfigureKFCShamanRacials(sim, kfcShamanRacialReference()) == nil {
		t.Fatal("Repeated policy accepted")
	}
	otherSim, other, otherUnits := kfcShamanRacialFixture(t, proto.Race_RaceDwarf, kfcRiptideDefault())
	defer otherSim.Cleanup()
	spell := other.GetSpell(core.ActionID{SpellID: 10396})
	spell.BonusCritRating = 10000
	spell.CalcAndDealHealing(otherSim, otherUnits[1], 100, spell.OutcomeHealingCrit)
	if other.ConfigureKFCShamanRacials(otherSim, kfcShamanRacialReference()) == nil {
		t.Fatal("Policy accepted after healing")
	}
	if other.kfcRacials != nil {
		t.Fatal("Policy leaked across actors")
	}
	if resto.kfcValidHealingTarget(units[1]) == false {
		t.Fatal("Racial changed geometry")
	}
}

func TestKFCShamanRacialActualDirectCritIncludesEntireHeal(t *testing.T) {
	for _, race := range []proto.Race{proto.Race_RaceDwarf, proto.Race_RaceTauren, proto.Race_RaceTroll} {
		amounts := []float64{}
		for _, critical := range []bool{false, true} {
			sim, resto, units := kfcShamanRacialFixture(t, race, kfcRiptideDefault())
			kfcShamanRacialConfigure(t, sim, resto, kfcShamanRacialReference())
			target := units[1]
			target.RemoveHealth(sim, 9000)
			spell := resto.GetSpell(core.ActionID{SpellID: 10396})
			spell.BonusCritRating = -10000
			if critical {
				spell.BonusCritRating = 10000
			}
			if !spell.Cast(sim, target) {
				t.Fatal("Racial heal rejected")
			}
			kfcShamanAdvance(t, sim, 3*time.Second)
			amounts = append(amounts, spell.SpellMetrics[target.UnitIndex].TotalHealing)
			sim.Cleanup()
		}
		want := 1.53
		if race == proto.Race_RaceTroll {
			want = 1.5
		}
		kfcShamanNear(t, amounts[1]/amounts[0], want)
		kfcShamanMeasure("RACIAL_DIRECT", struct {
			Race    int32
			Amounts []float64
		}{int32(race), amounts})
	}
	sim, resto, units := kfcShamanRacialFixture(t, proto.Race_RaceDwarf, kfcRiptideDefault())
	defer sim.Cleanup()
	kfcShamanRacialConfigure(t, sim, resto, kfcShamanRacialReference())
	spell := resto.GetSpell(core.ActionID{SpellID: 10396})
	spell.CritDamageBonus = 2
	spell.BonusCritRating = -10000
	base := spell.CalcHealing(sim, units[1], 100, resto.kfcShamanRacialHealingOutcome(spell.OutcomeHealingCrit)).Damage
	spell.BonusCritRating = 10000
	crit := spell.CalcHealing(sim, units[1], 100, resto.kfcShamanRacialHealingOutcome(spell.OutcomeHealingCrit)).Damage
	kfcShamanNear(t, crit/base, 2.04)
}

func TestKFCShamanRacialRiptideDirectAndPeriodicPowerModes(t *testing.T) {
	for _, mode := range []string{"snapshot-reference", "dynamic-reference"} {
		amounts := [][2]float64{}
		for _, critical := range []bool{false, true} {
			hot := kfcRiptideDefault()
			hot.HotPower = mode
			if critical {
				hot.HotCriticals = "critical-reference"
			}
			sim, resto, units := kfcShamanRacialFixture(t, proto.Race_RaceDwarf, hot)
			kfcShamanRacialConfigure(t, sim, resto, kfcShamanRacialReference())
			target := units[1]
			target.RemoveHealth(sim, 9000)
			spell := resto.kfcRiptide.spells[408521]
			spell.BonusCritRating = -10000
			if critical {
				spell.BonusCritRating = 10000
				resto.kfcRiptide.pulses[408521].BonusCritRating = 10000
			}
			if !spell.Cast(sim, target) {
				t.Fatal("Racial Riptide rejected")
			}
			kfcShamanAdvance(t, sim, 15*time.Second)
			amounts = append(amounts, [2]float64{spell.SpellMetrics[target.UnitIndex].TotalHealing, resto.kfcRiptide.pulses[408521].SpellMetrics[target.UnitIndex].TotalHealing})
			sim.Cleanup()
		}
		for index := range amounts[0] {
			kfcShamanNear(t, amounts[1][index]/amounts[0][index], 1.53)
		}
		kfcShamanMeasure("RACIAL_RIPTIDE", struct {
			Mode    string
			Amounts [][2]float64
		}{mode, amounts})
	}
}

func TestKFCShamanRacialCriticalItemUsesSameOutcome(t *testing.T) {
	amounts := []float64{}
	for _, critical := range []bool{false, true} {
		sim, resto, units := kfcShamanRacialFixture(t, proto.Race_RaceDwarf, kfcRiptideDefault(), 8346)
		policy := kfcShamanUtilityReference()
		policy.HealingCanCrit = critical
		kfcShamanConfigureUtility(t, sim, resto, policy)
		kfcShamanRacialConfigure(t, sim, resto, kfcShamanRacialReference())
		target := units[1]
		target.RemoveHealth(sim, 9000)
		spell := resto.kfcUtilityItems.spells[8346]
		spell.BonusCritRating = 10000
		if !spell.Cast(sim, target) {
			t.Fatal("Racial item heal rejected")
		}
		amounts = append(amounts, spell.SpellMetrics[target.UnitIndex].TotalHealing)
		sim.Cleanup()
	}
	kfcShamanNear(t, amounts[1]/amounts[0], 1.53)
	kfcShamanMeasure("RACIAL_ITEM", amounts)
}

func TestKFCShamanRacialTrollActualSpeedExpiryAndCooldown(t *testing.T) {
	sim, resto, _ := kfcShamanRacialFixture(t, proto.Race_RaceTroll, kfcRiptideDefault())
	defer sim.Cleanup()
	policy := kfcShamanRacialReference()
	policy.Actions = []KFCShamanRacialAction{{SpellID: 20554, EarliestMS: 1000, MaximumUses: 2}}
	kfcShamanRacialConfigure(t, sim, resto, policy)
	base, mana := resto.CastSpeed, resto.CurrentMana()
	uses := []int{0}
	resto.useKFCShamanRacials(sim, uses)
	if uses[0] != 0 {
		t.Fatal("Racial ignored earliest time")
	}
	kfcShamanAdvance(t, sim, time.Second)
	resto.useKFCShamanRacials(sim, uses)
	kfcShamanNear(t, resto.CastSpeed, base/1.1)
	kfcShamanNear(t, resto.CurrentMana(), mana)
	if uses[0] != 1 {
		t.Fatal("Racial not counted")
	}
	resto.useKFCShamanRacials(sim, uses)
	if uses[0] != 1 {
		t.Fatal("Racial cooldown ignored")
	}
	kfcShamanAdvance(t, sim, 11*time.Second)
	kfcShamanNear(t, resto.CastSpeed, base)
	kfcShamanAdvance(t, sim, 181*time.Second)
	resto.useKFCShamanRacials(sim, uses)
	if uses[0] != 2 {
		t.Fatal("Second owned racial not used")
	}
	kfcShamanNear(t, resto.CastSpeed, base/1.1)
	kfcShamanMeasure("RACIAL_TROLL", uses)
}

func TestKFCShamanRacialOrcActualHealingPowerAndExpiry(t *testing.T) {
	sim, resto, units := kfcShamanRacialFixture(t, proto.Race_RaceOrc, kfcRiptideDefault())
	defer sim.Cleanup()
	policy := kfcShamanRacialReference()
	policy.Actions = []KFCShamanRacialAction{{SpellID: 20572, MaximumUses: 1}}
	kfcShamanRacialConfigure(t, sim, resto, policy)
	spell := resto.GetSpell(core.ActionID{SpellID: 10396})
	before := spell.HealingPower(units[1])
	mana := resto.CurrentMana()
	uses := []int{0}
	resto.useKFCShamanRacials(sim, uses)
	kfcShamanNear(t, spell.HealingPower(units[1]), before*1.1)
	kfcShamanNear(t, resto.CurrentMana(), mana)
	if uses[0] != 1 {
		t.Fatal("Blood Fury not counted")
	}
	kfcShamanAdvance(t, sim, 15*time.Second)
	kfcShamanNear(t, spell.HealingPower(units[1]), before)
	kfcShamanMeasure("RACIAL_ORC", before)
}

func TestKFCShamanRacialWorkloadMeanResetEchoAndNoImplicitActivation(t *testing.T) {
	request, frame := kfcShamanWorkloadControl()
	before := googleProto.Clone(request)
	plain := kfcShamanWorkloadResult(t, request, frame)
	if kfcShamanWorkloadCasts(plain, 20554) != 0 || plain.Racials != nil || len(plain.RacialUsesMean) != 0 {
		t.Fatal("Racial action was implicit")
	}
	policy := kfcShamanRacialReference()
	policy.Actions = []KFCShamanRacialAction{{SpellID: 20554, MaximumUses: 1}}
	frame.Racials = &policy
	result := kfcShamanWorkloadResult(t, request, frame)
	if len(result.RacialUsesMean) != 1 || result.RacialUsesMean[0] != 1 || kfcShamanWorkloadCasts(result, 20554) != 2 {
		t.Fatal("Racial mean/reset or actual casts wrong")
	}
	if result.Racials == frame.Racials || !googleProto.Equal(request, before) {
		t.Fatal("Racial result aliases caller or changes request")
	}
	result.Racials.Actions[0].MaximumUses = 2
	if policy.Actions[0].MaximumUses != 1 {
		t.Fatal("Result actions alias input")
	}
	result.Racials.Actions[0].MaximumUses = 1
	request.Raid.Parties[0].Players[0].Race = proto.Race_RaceHuman
	if _, err := RunKFCShamanHealingWorkload(context.Background(), request, frame); err == nil {
		t.Fatal("Illegal playable race accepted")
	}
	kfcShamanMeasure("RACIAL_WORKLOAD", result)
}

func TestKFCShamanRacialRankSensitivityAndPassiveStatsIsolation(t *testing.T) {
	sim, resto, units := kfcShamanRacialFixture(t, proto.Race_RaceDwarf, kfcRiptideDefault())
	defer sim.Cleanup()
	intellect, crit := resto.GetStat(stats.Intellect), resto.GetStat(stats.SpellCrit)
	kfcShamanRacialConfigure(t, sim, resto, kfcShamanRacialReference())
	kfcShamanRankConfigure(t, sim, resto, kfcShamanRankPolicy())
	kfcShamanNear(t, resto.GetStat(stats.Intellect), intellect)
	kfcShamanNear(t, resto.GetStat(stats.SpellCrit), crit)
	spell := resto.GetSpell(core.ActionID{SpellID: 959})
	spell.BonusCritRating = 10000
	value := spell.CalcHealing(sim, units[1], 100, resto.kfcShamanRacialHealingOutcome(spell.OutcomeHealingCrit)).Damage
	kfcShamanNear(t, value, (100+500*.857*.45)*1.53)
	kfcShamanMeasure("RACIAL_RANK", value)
}
