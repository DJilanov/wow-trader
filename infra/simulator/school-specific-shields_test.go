package core

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/stats"
)

func kfcSchoolShieldFixture() (*Simulation, *Unit, *Unit) {
	env := &Environment{Ruleset: proto.Ruleset_RulesetForever}
	target := &Unit{Env: env, Type: PlayerUnit, UnitIndex: 0, PseudoStats: stats.NewPseudoStats(), Metrics: NewUnitMetrics()}
	enemy := &Unit{Env: env, Type: EnemyUnit, UnitIndex: 1, PseudoStats: stats.NewPseudoStats(), Metrics: NewUnitMetrics()}
	env.AllUnits = []*Unit{target, enemy}
	return &Simulation{Environment: env, Duration: 30 * time.Second}, target, enemy
}

func kfcSchoolShieldNew(target *Unit, id int32, mask SpellSchool, duration time.Duration, callback func(*Simulation, *Spell, *SpellResult)) *Shield {
	spell := target.RegisterSpell(SpellConfig{ActionID: ActionID{SpellID: id}, DamageMultiplier: 1, ProcMask: ProcMaskEmpty, SpellSchool: SpellSchoolHoly,
		Shield: ShieldConfig{SelfOnly: true, AbsorbSchoolMask: mask, Aura: Aura{Label: fmt.Sprintf("School shield %d", id), Duration: duration}, OnDepleted: callback}})
	spell.finalize()
	return spell.SelfShield()
}

func kfcSchoolShieldHit(sim *Simulation, caster, target *Unit, school SpellSchool, amount float64, periodic bool) (float64, float64) {
	spell := caster.GetOrRegisterSpell(SpellConfig{ActionID: ActionID{SpellID: 900000 + int32(school)}, SpellSchool: school, ProcMask: ProcMaskSpellDamage, DamageMultiplier: 1, ThreatMultiplier: 1})
	spell.finalize()
	result := spell.NewResult(target)
	result.Outcome, result.Damage = OutcomeHit, amount
	if periodic {
		spell.DealPeriodicDamage(sim, result)
	} else {
		spell.DealDamage(sim, result)
	}
	return result.Damage, result.AbsorbedDamage
}

func kfcSchoolShieldMeasure(label string, value interface{}) {
	bytes, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	fmt.Printf("KFC_SCHOOL_SHIELD_%s %s\n", label, bytes)
}

func TestKFCSchoolShieldEverySchoolDirectAndPeriodic(t *testing.T) {
	magic := SpellSchoolHoly | SpellSchoolFire | SpellSchoolNature | SpellSchoolFrost | SpellSchoolShadow | SpellSchoolArcane
	for _, mask := range []SpellSchool{0, SpellSchoolPhysical, SpellSchoolHoly, SpellSchoolFire, SpellSchoolNature, SpellSchoolFrost, SpellSchoolShadow, SpellSchoolArcane, magic, magic | SpellSchoolPhysical} {
		for _, school := range []SpellSchool{SpellSchoolPhysical, SpellSchoolHoly, SpellSchoolFire, SpellSchoolNature, SpellSchoolFrost, SpellSchoolShadow, SpellSchoolArcane, SpellSchoolFire | SpellSchoolShadow} {
			for _, periodic := range []bool{false, true} {
				sim, target, caster := kfcSchoolShieldFixture()
				shield := kfcSchoolShieldNew(target, 900101, mask, time.Minute, nil)
				shield.Apply(sim, 100)
				damage, absorbed := kfcSchoolShieldHit(sim, caster, target, school, 40, periodic)
				want := 0.0
				if mask == 0 || mask&school != 0 {
					want = 40
				}
				if absorbed != want || damage != 40-want || shield.RemainingAbsorb() != 100-want || shield.Spell.SpellMetrics[0].TotalAbsorbedShielding != want {
					t.Fatalf("mask=%d school=%d periodic=%t damage=%g absorbed=%g remaining=%g", mask, school, periodic, damage, absorbed, shield.RemainingAbsorb())
				}
				kfcSchoolShieldMeasure("SCHOOL", []float64{float64(mask), float64(school), float64(map[bool]int{false: 0, true: 1}[periodic]), damage, absorbed, shield.RemainingAbsorb()})
			}
		}
	}
}

func TestKFCSchoolShieldSkipsIncompatiblePoolInOrder(t *testing.T) {
	sim, target, caster := kfcSchoolShieldFixture()
	fire := kfcSchoolShieldNew(target, 900102, SpellSchoolFire, time.Minute, nil)
	shadow := kfcSchoolShieldNew(target, 900103, SpellSchoolShadow, time.Minute, nil)
	all := kfcSchoolShieldNew(target, 900104, 0, time.Minute, nil)
	fire.Apply(sim, 100)
	shadow.Apply(sim, 50)
	all.Apply(sim, 80)
	damage, absorbed := kfcSchoolShieldHit(sim, caster, target, SpellSchoolShadow, 70, false)
	if damage != 0 || absorbed != 70 || fire.RemainingAbsorb() != 100 || shadow.IsActive() || all.RemainingAbsorb() != 60 {
		t.Fatal("incompatible head blocked a later compatible pool")
	}
	damage, absorbed = kfcSchoolShieldHit(sim, caster, target, SpellSchoolFire, 130, true)
	if damage != 0 || absorbed != 130 || fire.IsActive() || all.RemainingAbsorb() != 30 {
		t.Fatal("compatible pools lost application order")
	}
	kfcSchoolShieldMeasure("ORDER", []float64{fire.RemainingAbsorb(), shadow.RemainingAbsorb(), all.RemainingAbsorb()})
}

func TestKFCSchoolShieldCallbacksCanRemoveEarlierPool(t *testing.T) {
	sim, target, caster := kfcSchoolShieldFixture()
	fire := kfcSchoolShieldNew(target, 900105, SpellSchoolFire, time.Minute, nil)
	added := kfcSchoolShieldNew(target, 900106, SpellSchoolShadow, time.Minute, nil)
	count := 0
	shadow := kfcSchoolShieldNew(target, 900107, SpellSchoolShadow, time.Minute, func(sim *Simulation, incoming *Spell, result *SpellResult) {
		count++
		if incoming.Unit != caster || result.Target != target {
			t.Fatal("callback lost the original attacker/recipient")
		}
		fire.Deactivate(sim)
		added.Apply(sim, 30)
	})
	fire.Apply(sim, 100)
	shadow.Apply(sim, 20)
	damage, absorbed := kfcSchoolShieldHit(sim, caster, target, SpellSchoolShadow, 60, false)
	if damage != 10 || absorbed != 50 || count != 1 || len(target.activeShields) != 0 {
		t.Fatal("callback-induced slice mutation skipped a new compatible pool", damage, absorbed, count, len(target.activeShields))
	}
	kfcSchoolShieldMeasure("CALLBACK", []float64{damage, absorbed, float64(count)})
}

func TestKFCSchoolShieldWrongSchoolCannotTriggerDepletion(t *testing.T) {
	sim, target, caster := kfcSchoolShieldFixture()
	count := 0
	shield := kfcSchoolShieldNew(target, 900108, SpellSchoolShadow, time.Second, func(_ *Simulation, _ *Spell, _ *SpellResult) { count++ })
	shield.Apply(sim, 50)
	damage, absorb := kfcSchoolShieldHit(sim, caster, target, SpellSchoolFire, 100, true)
	if damage != 100 || absorb != 0 || count != 0 || shield.RemainingAbsorb() != 50 {
		t.Fatal("wrong-school damage consumed a pool or triggered depletion")
	}
	shield.Apply(sim, 60)
	if count != 0 {
		t.Fatal("refresh triggered depletion")
	}
	sim.CurrentTime = time.Second
	damage, absorb = kfcSchoolShieldHit(sim, caster, target, SpellSchoolShadow, 100, false)
	if damage != 100 || absorb != 0 || count != 0 || shield.IsActive() {
		t.Fatal("expiration behaved like depletion")
	}
	kfcSchoolShieldMeasure("NO_FALSE_DEPLETION", []float64{damage, absorb, float64(count)})
}

func TestKFCSchoolShieldResourceSelfDamageUsesIncomingSchool(t *testing.T) {
	sim, target, _ := kfcSchoolShieldFixture()
	fire := kfcSchoolShieldNew(target, 900109, SpellSchoolFire, time.Minute, nil)
	shadow := kfcSchoolShieldNew(target, 900110, SpellSchoolShadow, time.Minute, nil)
	fire.Apply(sim, 400)
	shadow.Apply(sim, 1176)
	damage, absorb := kfcSchoolShieldHit(sim, target, target, SpellSchoolShadow, 1000, false)
	if damage != 0 || absorb != 1000 || fire.RemainingAbsorb() != 400 || shadow.RemainingAbsorb() != 176 {
		t.Fatal("Rune-like direct damage consumed the wrong self shield")
	}
	damage, absorb = kfcSchoolShieldHit(sim, target, target, SpellSchoolFire, 98.75, true)
	if damage != 0 || absorb != 98.75 || fire.RemainingAbsorb() != 301.25 || shadow.RemainingAbsorb() != 176 {
		t.Fatal("Circle-like periodic damage consumed the wrong self shield")
	}
	kfcSchoolShieldMeasure("SELF", []float64{fire.RemainingAbsorb(), shadow.RemainingAbsorb()})
}

func TestKFCSchoolShieldMagicMaskExcludesPhysicalAndResetClearsPools(t *testing.T) {
	sim, target, caster := kfcSchoolShieldFixture()
	magic := SpellSchoolHoly | SpellSchoolFire | SpellSchoolNature | SpellSchoolFrost | SpellSchoolShadow | SpellSchoolArcane
	shield := kfcSchoolShieldNew(target, 900111, magic, time.Minute, nil)
	shield.Apply(sim, 600)
	damage, absorb := kfcSchoolShieldHit(sim, caster, target, SpellSchoolPhysical, 100, false)
	if damage != 100 || absorb != 0 || shield.RemainingAbsorb() != 600 {
		t.Fatal("magic pool absorbed physical damage")
	}
	damage, absorb = kfcSchoolShieldHit(sim, caster, target, SpellSchoolHoly, 300, false)
	if damage != 0 || absorb != 300 || shield.RemainingAbsorb() != 300 {
		t.Fatal("magic pool failed on Holy")
	}
	target.auraTracker.doneIteration(sim)
	if len(target.activeShields) != 0 || shield.RemainingAbsorb() != 0 {
		t.Fatal("school pool leaked across cleanup")
	}
	shield.Apply(sim, 600)
	damage, absorb = kfcSchoolShieldHit(sim, caster, target, SpellSchoolArcane, 700, false)
	if damage != 100 || absorb != 600 {
		t.Fatal("reapplied pool lost its mask or finite capacity")
	}
	kfcSchoolShieldMeasure("MAGIC_RESET", []float64{damage, absorb, shield.RemainingAbsorb()})
}

func TestKFCSchoolShieldInvalidMaskRejected(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Fatal("invalid school mask accepted")
		}
	}()
	_, target, _ := kfcSchoolShieldFixture()
	kfcSchoolShieldNew(target, 900112, SpellSchool(1), time.Minute, nil)
}

func TestKFCSchoolShieldClientMaskConversion(t *testing.T) {
	for mask := int32(0); mask < 128; mask++ {
		got, err := SpellSchoolFromClientMask(mask)
		if err != nil {
			t.Fatal(err)
		}
		for _, row := range []struct {
			client int32
			engine SpellSchool
		}{{1, SpellSchoolPhysical}, {2, SpellSchoolHoly}, {4, SpellSchoolFire}, {8, SpellSchoolNature}, {16, SpellSchoolFrost}, {32, SpellSchoolShadow}, {64, SpellSchoolArcane}} {
			if got.Matches(row.engine) != (mask&row.client != 0) {
				t.Fatal("client mask was confused with internal flags", mask, got, row)
			}
		}
		kfcSchoolShieldMeasure("CLIENT_MASK", []int{int(mask), int(got)})
	}
	for _, mask := range []int32{-1, 128, 255, 2147483647} {
		if _, err := SpellSchoolFromClientMask(mask); err == nil {
			t.Fatal("invalid client mask accepted", mask)
		}
	}
}
