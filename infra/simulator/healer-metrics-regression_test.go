package core

import (
	"encoding/base64"
	"encoding/json"
	"math"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/stats"
	googleProto "google.golang.org/protobuf/proto"
)

type kfcHealingFixture struct {
	sim     *Simulation
	caster  *TargetDummy
	targets []*Unit
	pet     *Unit
	enemy   *Unit
	spell   *Spell
}

func kfcNewHealingFixture() *kfcHealingFixture {
	raid := NewRaid(&proto.Raid{Parties: []*proto.Party{{}}})
	env := &Environment{Ruleset: proto.Ruleset_RulesetForever, Raid: raid}
	caster := NewTargetDummy(0, raid.Parties[0], 0)
	raid.Parties[0].Players = []Agent{caster}
	caster.Env = env
	units := []*Unit{&caster.Unit}
	for i := 1; i <= 4; i++ {
		kind := PlayerUnit
		if i == 3 {
			kind = PetUnit
		}
		if i == 4 {
			kind = EnemyUnit
		}
		units = append(units, &Unit{Env: env, Type: kind, UnitIndex: int32(i),
			PseudoStats: stats.NewPseudoStats(), Metrics: NewUnitMetrics()})
	}
	env.AllUnits = units
	raid.AllUnits = units[:4]
	sim := &Simulation{Environment: env, Duration: 10 * time.Second,
		Options: &proto.SimOptions{Iterations: 1, SaveAllValues: true}, rand: NewSplitMix(7911)}
	for _, unit := range units {
		unit.AttackTables = make([]map[proto.CastType]*AttackTable, len(units))
		unit.stats[stats.Health] = 2000
		unit.EnableHealthBar()
		unit.healthBar.reset(sim)
	}
	spell := caster.RegisterSpell(SpellConfig{ActionID: ActionID{SpellID: 2061},
		SpellSchool: SpellSchoolHoly, ProcMask: ProcMaskSpellHealing, DamageMultiplier: 1})
	spell.finalize()
	return &kfcHealingFixture{sim: sim, caster: caster, targets: units[1:3], pet: units[3], enemy: units[4], spell: spell}
}

func kfcDeliverHeal(f *kfcHealingFixture, spell *Spell, target *Unit, amount float64, critical, periodic bool) SpellResult {
	result := spell.NewResult(target)
	result.Outcome = OutcomeHit
	if critical {
		result.Outcome = OutcomeCrit
	}
	result.Damage = amount
	if periodic {
		spell.DealPeriodicHealing(f.sim, result)
	} else {
		spell.DealHealing(f.sim, result)
	}
	return *result
}

func kfcFinishHealing(f *kfcHealingFixture) *proto.RaidSimResult {
	f.sim.Raid.doneIteration(f.sim)
	f.caster.Metrics.doneIteration(&f.caster.Unit, f.sim)
	return &proto.RaidSimResult{RaidMetrics: f.sim.Raid.GetMetrics(),
		EncounterMetrics: &proto.EncounterMetrics{}, IterationsDone: 1,
		AvgIterationDuration: 10, FirstIterationDuration: 10}
}

func kfcRequireHealing(t *testing.T, got, expected float64) {
	t.Helper()
	if math.Abs(got-expected) > 1e-9 || math.IsNaN(got) {
		t.Fatalf("healing accounting: got %v, want %v", got, expected)
	}
}

func TestKFCHealingDelivery(t *testing.T) {
	f := kfcNewHealingFixture()
	target := f.targets[0]
	observations := [][3]float64{}
	f.caster.RegisterAura(Aura{Label: "Healing delivery observer", Duration: NeverExpires,
		OnHealDealt: func(_ *Aura, _ *Simulation, _ *Spell, result *SpellResult) {
			observations = append(observations, [3]float64{result.Damage, result.EffectiveHealing, result.Overhealing})
		}}).Activate(f.sim)
	target.RemoveHealth(f.sim, 500)
	kfcDeliverHeal(f, f.spell, target, 1000, false, false)
	kfcDeliverHeal(f, f.spell, target, 600, false, false)
	target.RemoveHealth(f.sim, 125)
	kfcDeliverHeal(f, f.spell, target, 400, true, false)
	want := [][3]float64{{1000, 500, 500}, {600, 0, 600}, {400, 125, 275}}
	if len(observations) != len(want) {
		t.Fatal("healing callbacks missing")
	}
	for i := range want {
		if observations[i] != want[i] {
			t.Fatalf("callback %d: %v", i, observations[i])
		}
	}
	metrics := f.spell.SpellMetrics[target.UnitIndex]
	kfcRequireHealing(t, metrics.TotalHealing, 2000)
	kfcRequireHealing(t, metrics.TotalEffectiveHealing, 625)
	kfcRequireHealing(t, metrics.TotalOverhealing, 1375)
	kfcRequireHealing(t, metrics.TotalCritHealing, 400)
	kfcRequireHealing(t, metrics.TotalEffectiveCritHealing, 125)
	result := kfcFinishHealing(f)
	unit := result.RaidMetrics.Parties[0].Players[0]
	kfcRequireHealing(t, unit.Hps.Avg, 62.5)
	kfcRequireHealing(t, unit.RawHealingHps.Avg, 200)
	kfcRequireHealing(t, unit.EffectiveHealingHps.Avg, 62.5)
	kfcRequireHealing(t, unit.OverhealingHps.Avg, 137.5)
	kfcRequireHealing(t, unit.AbsorbedHps.Avg, 0)
	kfcRequireHealing(t, result.RaidMetrics.Hps.Avg, 62.5)
	kfcRequireHealing(t, result.RaidMetrics.RawHealingHps.Avg, 200)
	kfcRequireHealing(t, result.RaidMetrics.Parties[0].OverhealingHps.Avg, 137.5)
	action := unit.Actions[0].Targets[target.UnitIndex]
	kfcRequireHealing(t, action.Healing, 2000)
	kfcRequireHealing(t, action.EffectiveHealing, 625)
	kfcRequireHealing(t, action.Overhealing, 1375)
	kfcRequireHealing(t, action.EffectiveCritHealing, 125)
	bytes, err := googleProto.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	decoded := &proto.RaidSimResult{}
	if err := googleProto.Unmarshal(bytes, decoded); err != nil || !googleProto.Equal(result, decoded) {
		t.Fatal("healing metrics lost during protocol round trip", err)
	}
	encoded, err := json.Marshal(map[string]float64{"raw": unit.RawHealingHps.Avg,
		"effective": unit.EffectiveHealingHps.Avg, "overhealing": unit.OverhealingHps.Avg,
		"absorbed": unit.AbsorbedHps.Avg, "hps": unit.Hps.Avg})
	if err != nil {
		t.Fatal(err)
	}
	t.Log("KFC_HEALING_CONTROL", string(encoded))
	t.Log("KFC_HEALING_PROTO", base64.StdEncoding.EncodeToString(bytes))
	f.caster.Metrics.reset()
	kfcRequireHealing(t, f.caster.Metrics.hps.Total, 0)
	kfcRequireHealing(t, f.caster.Metrics.rawHealing.Total, 0)
	kfcRequireHealing(t, f.caster.Metrics.effectiveHealing.Total, 0)
	kfcRequireHealing(t, f.caster.Metrics.overhealing.Total, 0)
	kfcRequireHealing(t, f.caster.Metrics.absorbedShielding.Total, 0)
	fresh := f.spell.NewResult(target)
	if fresh.EffectiveHealing != 0 || fresh.Overhealing != 0 {
		t.Fatal("cached result leaked prior healing")
	}
	f.spell.DisposeResult(fresh)
}

func TestKFCHealingPeriodicAndExternal(t *testing.T) {
	f := kfcNewHealingFixture()
	f.targets[0].RemoveHealth(f.sim, 100)
	f.targets[1].RemoveHealth(f.sim, 250)
	kfcDeliverHeal(f, f.spell, f.targets[0], 200, false, true)
	kfcDeliverHeal(f, f.spell, f.targets[1], 300, false, false)
	kfcDeliverHeal(f, f.spell, f.targets[0], 200, false, true)
	f.targets[0].RemoveHealth(f.sim, 50)
	f.targets[0].GainHealth(f.sim, 50, f.targets[0].NewHealthMetrics(ActionID{OtherID: proto.OtherAction_OtherActionHealingModel}))
	result := kfcFinishHealing(f)
	unit := result.RaidMetrics.Parties[0].Players[0]
	kfcRequireHealing(t, unit.RawHealingHps.Avg, 70)
	kfcRequireHealing(t, unit.Hps.Avg, 35)
	kfcRequireHealing(t, unit.OverhealingHps.Avg, 35)
	action := unit.Actions[0]
	kfcRequireHealing(t, action.Targets[1].EffectiveHealing, 100)
	kfcRequireHealing(t, action.Targets[1].Overhealing, 300)
	kfcRequireHealing(t, action.Targets[2].EffectiveHealing, 250)
	kfcRequireHealing(t, unit.Dps.Avg, 0)
}

func TestKFCHealingDeadAndUntracked(t *testing.T) {
	f := kfcNewHealingFixture()
	f.targets[0].RemoveHealth(f.sim, 2000)
	kfcDeliverHeal(f, f.spell, f.targets[0], 1000, false, false)
	kfcRequireHealing(t, f.targets[0].CurrentHealth(), 0)
	kfcRequireHealing(t, f.spell.SpellMetrics[1].TotalHealing, 0)
	f.targets[1].healthBar = healthBar{}
	kfcDeliverHeal(f, f.spell, f.targets[1], 1000, false, false)
	unit := kfcFinishHealing(f).RaidMetrics.Parties[0].Players[0]
	kfcRequireHealing(t, unit.Hps.Avg, 0)
	kfcRequireHealing(t, unit.RawHealingHps.Avg, 100)
	kfcRequireHealing(t, unit.OverhealingHps.Avg, 100)
	for _, value := range []float64{-1, math.NaN(), math.Inf(1), math.Inf(-1)} {
		t.Run("invalid-amount", func(t *testing.T) {
			defer func() {
				if recover() == nil {
					t.Fatal("invalid healing accepted")
				}
			}()
			kfcDeliverHeal(f, f.spell, f.targets[1], value, false, false)
		})
	}
}

func TestKFCHealingOwnedPetAndAbsorbs(t *testing.T) {
	f := kfcNewHealingFixture()
	f.targets[0].RemoveHealth(f.sim, 200)
	kfcDeliverHeal(f, f.spell, f.targets[0], 1000, false, false)
	petHeal := f.pet.RegisterSpell(SpellConfig{ActionID: ActionID{SpellID: 2050},
		SpellSchool: SpellSchoolHoly, ProcMask: ProcMaskSpellHealing, DamageMultiplier: 1})
	petHeal.finalize()
	f.targets[1].RemoveHealth(f.sim, 20)
	kfcDeliverHeal(f, petHeal, f.targets[1], 50, false, false)
	shield := f.pet.RegisterSpell(SpellConfig{ActionID: ActionID{SpellID: 17}, SpellSchool: SpellSchoolHoly, ProcMask: ProcMaskEmpty,
		DamageMultiplier: 1, Shield: ShieldConfig{SelfOnly: true, Aura: Aura{Label: "Healing accounting shield", Duration: 5 * time.Second}}})
	shield.finalize()
	incoming := f.enemy.RegisterSpell(SpellConfig{ActionID: ActionID{SpellID: 1}, SpellSchool: SpellSchoolShadow,
		ProcMask: ProcMaskSpellDamage, Flags: SpellFlagNoOnDamageDealt, DamageMultiplier: 1})
	incoming.finalize()
	shield.SelfShield().Apply(f.sim, 90)
	hit := incoming.NewResult(f.pet)
	hit.Damage, hit.Outcome = 30, OutcomeHit
	incoming.DealDamage(f.sim, hit)
	shield.SelfShield().Deactivate(f.sim)
	f.pet.Metrics.addSpellMetrics(petHeal, petHeal.ActionID, petHeal.SpellMetrics)
	f.pet.Metrics.addSpellMetrics(shield, shield.ActionID, shield.SpellMetrics)
	f.pet.Metrics.doneIteration(f.pet, f.sim)
	f.caster.Metrics.AddFinalPetMetrics(&f.pet.Metrics)
	unit := kfcFinishHealing(f).RaidMetrics.Parties[0].Players[0]
	kfcRequireHealing(t, unit.RawHealingHps.Avg, 105)
	kfcRequireHealing(t, unit.EffectiveHealingHps.Avg, 22)
	kfcRequireHealing(t, unit.OverhealingHps.Avg, 83)
	kfcRequireHealing(t, unit.AbsorbedHps.Avg, 3)
	kfcRequireHealing(t, unit.Hps.Avg, 25)
	recorded := f.pet.Metrics.actions[shield.ActionID].Targets[3].ToProto(3)
	kfcRequireHealing(t, recorded.Shielding, 90)
	kfcRequireHealing(t, recorded.AbsorbedShielding, 30)
	kfcRequireHealing(t, recorded.UnusedShielding, 60)
}

func kfcCombineHealing(first, second *proto.RaidSimResult) *proto.RaidSimResult {
	combiner := &raidSimResultCombiner{}
	combiner.SetBaseResult(first)
	total := float64(first.IterationsDone + second.IterationsDone)
	combiner.AddResult(first, false, float64(first.IterationsDone)/total)
	combiner.AddResult(second, true, float64(second.IterationsDone)/total)
	return combiner.Combined
}

func TestKFCHealingConcurrentAggregation(t *testing.T) {
	measure := func(raw, missing float64) *proto.RaidSimResult {
		f := kfcNewHealingFixture()
		f.targets[0].RemoveHealth(f.sim, missing)
		kfcDeliverHeal(f, f.spell, f.targets[0], raw, false, false)
		return kfcFinishHealing(f)
	}
	first, second := measure(1000, 500), measure(800, 200)
	result := kfcCombineHealing(first, kfcCombineHealing(second, second))
	unit := result.RaidMetrics.Parties[0].Players[0]
	if result.IterationsDone != 3 {
		t.Fatal("parallel ranges lost iterations")
	}
	for _, metrics := range []*proto.DistributionMetrics{unit.Hps, result.RaidMetrics.Hps, result.RaidMetrics.Parties[0].Hps} {
		kfcRequireHealing(t, metrics.Avg, 30)
		kfcRequireHealing(t, metrics.Stdev, math.Sqrt(200))
		if metrics.AggregatorData.N != 3 || len(metrics.AllValues) != 3 {
			t.Fatal("parallel samples lost")
		}
	}
	kfcRequireHealing(t, unit.RawHealingHps.Avg, 260.0/3)
	kfcRequireHealing(t, unit.OverhealingHps.Avg, 170.0/3)
	kfcRequireHealing(t, result.RaidMetrics.EffectiveHealingHps.Avg, 30)
	kfcRequireHealing(t, result.RaidMetrics.Parties[0].OverhealingHps.Avg, 170.0/3)
	action := unit.Actions[0].Targets[1]
	kfcRequireHealing(t, action.Healing, 2600)
	kfcRequireHealing(t, action.EffectiveHealing, 900)
	kfcRequireHealing(t, action.Overhealing, 1700)
}
