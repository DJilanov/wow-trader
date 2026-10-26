package restoration

import (
	"fmt"
	"math"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
)

var kfcShamanReactiveGear = map[int32][]struct {
	slot int
	id   int32
}{
	162: {{4, 6473}, {6, 10413}, {7, 10412}, {8, 10410}, {9, 10411}},
	163: {{4, 10328}, {5, 10333}, {6, 10331}, {7, 10329}, {8, 10330}, {9, 10332}},
	182: {{0, 16693}, {2, 16695}, {4, 16690}, {5, 16697}, {6, 16692}, {7, 16696}, {8, 16694}, {9, 16691}},
}

func kfcShamanReactivePolicy(timing string, self bool, chance float64) KFCShamanReactiveSetPolicy {
	return KFCShamanReactiveSetPolicy{Schema: "kfc-shaman-reactive-set-policy.v1", ID: fmt.Sprintf("%s-%t-%g", timing, self, chance), ThresholdTiming: timing, SelfDamageTriggers: self, DevoutChance: chance}
}

func kfcShamanReactiveFixture(t *testing.T, setID int32, pieces int, policy *KFCShamanReactiveSetPolicy) (*core.Simulation, *RestorationShaman) {
	t.Helper()
	request := kfcShamanRequest(500)
	request.Encounter.Duration = 1200
	player := request.Raid.Parties[0].Players[0]
	player.TalentsString = kfcRiptideTalentString(map[string]int32{"riptide": 1, "water_shield": 1})
	player.Equipment = &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
	for i := range player.Equipment.Items {
		player.Equipment.Items[i] = &proto.ItemSpec{}
	}
	for i, row := range kfcShamanReactiveGear[setID] {
		if i < pieces {
			player.Equipment.Items[row.slot].Id = row.id
		}
	}
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	resto := sim.Raid.Parties[0].Players[0].(*RestorationShaman)
	resources := kfcShamanResourceDefault()
	resources.ShieldTriggers = "all-critical-heals-reference"
	kfcRiptideConfigure(t, sim, resto, kfcRiptideDefault(), resources)
	if policy != nil {
		if err := resto.ConfigureKFCShamanReactiveSets(sim, *policy); err != nil {
			t.Fatal(err)
		}
	}
	return sim, resto
}

func kfcShamanReactiveDamage(sim *core.Simulation, resto *RestorationShaman, target *core.Unit, amount float64, self, periodic bool) {
	caster := sim.Encounter.TargetUnits[0]
	if self {
		caster = &resto.Unit
	}
	spell := caster.GetOrRegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: 1, Tag: 1112}, SpellSchool: core.SpellSchoolShadow, DefenseType: core.DefenseTypeMagic, ProcMask: core.ProcMaskSpellDamage, DamageMultiplier: 1})
	result := spell.NewResult(target)
	result.Damage, result.Outcome = amount, core.OutcomeHit
	if periodic {
		spell.DealPeriodicDamage(sim, result)
	} else {
		spell.DealDamage(sim, result)
	}
}

func TestKFCShamanReactiveOwnedThresholds(t *testing.T) {
	for _, row := range []struct {
		id     int32
		pieces int
	}{{162, 4}, {163, 6}, {182, 4}} {
		maxPieces := len(kfcShamanReactiveGear[row.id])
		for _, pieces := range []int{row.pieces - 1, row.pieces, maxPieces} {
			sim, resto := kfcShamanReactiveFixture(t, row.id, pieces, nil)
			state := resto.kfcReactiveSets
			present := state.viper != nil || state.scarlet != nil || state.devout != nil
			if present != (pieces >= row.pieces) {
				t.Fatal("Wrong reactive ownership", row, pieces)
			}
			count := 0
			for _, item := range resto.Equipment {
				if item.SetID == row.id {
					count++
				}
			}
			if count != pieces {
				t.Fatal("Fixture is not actual source equipment", count, pieces)
			}
			kfcShamanMeasure("REACTIVE_OWNERSHIP", []int{int(row.id), pieces})
			sim.Cleanup()
		}
	}
}

func TestKFCShamanReactiveViperTimingTicksAndCooldown(t *testing.T) {
	for _, timing := range []string{"after-hit", "before-hit"} {
		policy := kfcShamanReactivePolicy(timing, false, .02)
		sim, resto := kfcShamanReactiveFixture(t, 162, 4, &policy)
		resto.RemoveHealth(sim, resto.MaxHealth()*.7)
		resto.SpendMana(sim, 1000, resto.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 1113}))
		kfcShamanReactiveDamage(sim, resto, &resto.Unit, resto.MaxHealth()*.075, false, false)
		active := resto.kfcReactiveSets.viper.Hot(&resto.Unit).IsActive()
		if active != (timing == "after-hit") {
			t.Fatal("Wrong Viper threshold timing", timing)
		}
		beforeHP, beforeMana := resto.CurrentHealth(), resto.CurrentMana()
		kfcShamanAdvance(t, sim, 999*time.Millisecond)
		kfcShamanNear(t, resto.CurrentHealth(), beforeHP)
		kfcShamanNear(t, resto.CurrentMana(), beforeMana)
		kfcShamanAdvance(t, sim, 5*time.Second)
		want := 0.0
		if active {
			want = 100
		}
		kfcShamanNear(t, resto.CurrentHealth()-beforeHP, want)
		kfcShamanNear(t, resto.kfcReactiveSets.viperMana.ActualGainForCurrentIteration(), want)
		if active {
			kfcShamanNear(t, float64(resto.kfcReactiveSets.viperCD.ReadyAt()), float64(300*time.Second))
			resto.RemoveHealth(sim, resto.CurrentHealth()-resto.MaxHealth()*.2)
			kfcShamanReactiveDamage(sim, resto, &resto.Unit, 1, false, true)
			if resto.kfcReactiveSets.viper.Hot(&resto.Unit).IsActive() {
				t.Fatal("Viper cooldown ignored")
			}
			kfcShamanAdvance(t, sim, 300*time.Second)
			kfcShamanReactiveDamage(sim, resto, &resto.Unit, 1, false, true)
			if !resto.kfcReactiveSets.viper.Hot(&resto.Unit).IsActive() {
				t.Fatal("Viper did not rearm")
			}
		}
		kfcShamanMeasure("REACTIVE_VIPER_TIMING", []float64{want, want})
		sim.Cleanup()
	}
}

func TestKFCShamanReactiveInclusiveThresholds(t *testing.T) {
	for _, row := range []struct {
		id        int32
		pieces    int
		threshold float64
	}{{162, 4, .25}, {163, 6, .2}} {
		for _, above := range []bool{false, true} {
			policy := kfcShamanReactivePolicy("after-hit", false, 0)
			sim, resto := kfcShamanReactiveFixture(t, row.id, row.pieces, &policy)
			target := resto.MaxHealth() * row.threshold
			if above {
				target += 1
			}
			resto.RemoveHealth(sim, resto.CurrentHealth()-target-10)
			kfcShamanReactiveDamage(sim, resto, &resto.Unit, 10, false, true)
			active := false
			if row.id == 162 {
				active = resto.kfcReactiveSets.viper.Hot(&resto.Unit).IsActive()
			} else {
				active = resto.kfcReactiveSets.scarlet.SelfShield().IsActive()
			}
			if active == above {
				t.Fatal("Threshold inclusivity changed", row.id, above, resto.CurrentHealth(), target)
			}
			kfcShamanMeasure("REACTIVE_BOUNDARY", []bool{above, active})
			sim.Cleanup()
		}
	}
}

func TestKFCShamanReactiveScarletAbsorbsSubsequentDamageOnly(t *testing.T) {
	policy := kfcShamanReactivePolicy("after-hit", false, .02)
	sim, resto := kfcShamanReactiveFixture(t, 163, 6, &policy)
	resto.AddStatDynamic(sim, stats.HealingPower, 100000)
	resto.RemoveHealth(sim, resto.MaxHealth()*.79)
	before := resto.CurrentHealth()
	damage := resto.MaxHealth() * .02
	kfcShamanReactiveDamage(sim, resto, &resto.Unit, damage, false, false)
	kfcShamanNear(t, before-resto.CurrentHealth(), damage)
	shield := resto.kfcReactiveSets.scarlet.SelfShield()
	kfcShamanNear(t, shield.RemainingAbsorb(), 480)
	before = resto.CurrentHealth()
	kfcShamanReactiveDamage(sim, resto, &resto.Unit, 100, false, true)
	kfcShamanNear(t, resto.CurrentHealth(), before)
	kfcShamanNear(t, shield.RemainingAbsorb(), 380)
	kfcShamanNear(t, float64(resto.kfcReactiveSets.scarletCD.ReadyAt()), float64(240*time.Second))
	kfcShamanAdvance(t, sim, 10*time.Second-time.Millisecond)
	if !shield.IsActive() {
		t.Fatal("Scarlet expired early")
	}
	kfcShamanAdvance(t, sim, 10*time.Second)
	if shield.IsActive() {
		t.Fatal("Scarlet did not expire")
	}
	kfcShamanMeasure("REACTIVE_SCARLET", []float64{damage, 480, 380})
	sim.Cleanup()
}

func TestKFCShamanReactiveDevoutSeededChanceAndCooldown(t *testing.T) {
	for _, chance := range []float64{0, .02, 1} {
		policy := kfcShamanReactivePolicy("after-hit", false, chance)
		sim, resto := kfcShamanReactiveFixture(t, 182, 4, &policy)
		oracle, _ := kfcShamanReactiveFixture(t, 0, 0, nil)
		count := 0
		incoming := sim.Encounter.TargetUnits[0].GetOrRegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: 1, Tag: 1114}, ProcMask: core.ProcMaskSpellDamage})
		for n := 0; n < 1000; n++ {
			result := incoming.NewResult(&resto.Unit)
			result.Damage, result.Outcome = 1, core.OutcomeHit
			resto.kfcShamanReactiveAfterDamage(sim, resto.CurrentHealth(), incoming, result, false)
			shield := resto.kfcReactiveSets.devout.SelfShield()
			want := oracle.Proc(chance, "KFC Shaman Devout protection")
			if shield.IsActive() != want {
				t.Fatal("Devout differs from seeded oracle", chance, n)
			}
			if want {
				count++
				kfcShamanNear(t, shield.RemainingAbsorb(), 488)
				kfcShamanNear(t, float64(resto.kfcReactiveSets.devoutCD.ReadyAt()), float64(60*time.Second))
			}
			shield.Deactivate(sim)
			resto.kfcReactiveSets.devoutCD.Timer.Reset()
		}
		kfcShamanMeasure("REACTIVE_DEVOUT_RATE", []float64{chance, float64(count)})
		sim.Cleanup()
		oracle.Cleanup()
	}
}

func TestKFCShamanReactiveSelfDamageAndPeriodicEligibility(t *testing.T) {
	for _, row := range []struct {
		id     int32
		pieces int
	}{{162, 4}, {163, 6}, {182, 4}} {
		for _, self := range []bool{false, true} {
			for _, periodic := range []bool{false, true} {
				policy := kfcShamanReactivePolicy("after-hit", self, 1)
				sim, resto := kfcShamanReactiveFixture(t, row.id, row.pieces, &policy)
				resto.RemoveHealth(sim, resto.MaxHealth()*.81)
				kfcShamanReactiveDamage(sim, resto, &resto.Unit, 1, true, periodic)
				active := false
				switch row.id {
				case 162:
					active = resto.kfcReactiveSets.viper.Hot(&resto.Unit).IsActive()
				case 163:
					active = resto.kfcReactiveSets.scarlet.SelfShield().IsActive()
				case 182:
					active = resto.kfcReactiveSets.devout.SelfShield().IsActive()
				}
				want := self && (row.id != 182 || !periodic)
				if active != want {
					t.Fatal("Wrong self/periodic routing", row.id, self, periodic, active)
				}
				kfcShamanMeasure("REACTIVE_SELF_ROUTING", []bool{self, periodic, active})
				sim.Cleanup()
			}
		}
	}
}

func TestKFCShamanReactiveExclusionsAndAbsorbedHits(t *testing.T) {
	for _, kind := range []string{"nil-spell", "nil-result", "miss", "precombat", "dead", "other-target", "periodic", "absorbed"} {
		policy := kfcShamanReactivePolicy("after-hit", false, 1)
		sim, resto := kfcShamanReactiveFixture(t, 182, 4, &policy)
		incoming := sim.Encounter.TargetUnits[0].GetOrRegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: 1, Tag: 1115}, ProcMask: core.ProcMaskSpellDamage})
		result := incoming.NewResult(&resto.Unit)
		result.Damage, result.Outcome = 1, core.OutcomeHit
		switch kind {
		case "nil-spell":
			incoming = nil
		case "nil-result":
			result = nil
		case "miss":
			result.Outcome = core.OutcomeMiss
		case "precombat":
			sim.CurrentTime = -time.Second
		case "dead":
			resto.RemoveHealth(sim, resto.CurrentHealth())
		case "other-target":
			result.Target = resto.kfcHealingPlayers()[1]
		case "absorbed":
			result.Damage, result.AbsorbedDamage = 0, 1
		}
		resto.kfcShamanReactiveAfterDamage(sim, resto.CurrentHealth(), incoming, result, kind == "periodic")
		if resto.kfcReactiveSets.devout.SelfShield().IsActive() != (kind == "absorbed") {
			t.Fatal("Wrong excluded reactive event", kind)
		}
		sim.CurrentTime = 0
		sim.Cleanup()
	}
	kfcShamanMeasure("REACTIVE_EXCLUSIONS", 8)
}

func TestKFCShamanReactiveDeathResetAndNoProcCascade(t *testing.T) {
	policy := kfcShamanReactivePolicy("after-hit", false, .02)
	sim, resto := kfcShamanReactiveFixture(t, 162, 4, &policy)
	resto.AddStatDynamic(sim, stats.HealingPower, 100000)
	resto.AddStatDynamic(sim, stats.SpellCrit, 10000)
	if resto.WaterShield == nil || !resto.WaterShield.Cast(sim, &resto.Unit) {
		t.Fatal("Water Shield did not activate")
	}
	kfcShamanAdvance(t, sim, 1500*time.Millisecond)
	resto.RemoveHealth(sim, resto.MaxHealth()*.81)
	resto.SpendMana(sim, 1000, resto.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 1116}))
	kfcShamanReactiveDamage(sim, resto, &resto.Unit, 1, false, true)
	hp := resto.CurrentHealth()
	kfcShamanAdvance(t, sim, 6500*time.Millisecond)
	kfcShamanNear(t, resto.CurrentHealth()-hp, 100)
	kfcShamanNear(t, resto.kfcReactiveSets.viperMana.ActualGainForCurrentIteration(), 100)
	metrics := resto.kfcReactiveSets.viper.SpellMetrics[resto.UnitIndex]
	if metrics.Crits != 0 || metrics.CritTicks != 0 || metrics.Ticks != 5 {
		t.Fatal("Viper became critical or repeated", metrics)
	}
	sim.Cleanup()
	sim.Reset()
	resto.RemoveHealth(sim, resto.MaxHealth()*.81)
	kfcShamanAdvance(t, sim, 5*time.Second)
	kfcShamanNear(t, resto.kfcReactiveSets.viperMana.ActualGainForCurrentIteration(), 0)
	if resto.kfcReactiveSets.viper.Hot(&resto.Unit).IsActive() {
		t.Fatal("Viper survived reset without damage")
	}
	kfcShamanReactiveDamage(sim, resto, &resto.Unit, 1, false, true)
	if !resto.kfcReactiveSets.viper.Hot(&resto.Unit).IsActive() {
		t.Fatal("Viper failed to rearm after reset")
	}
	resto.RemoveHealth(sim, resto.CurrentHealth())
	kfcShamanAdvance(t, sim, 10*time.Second)
	kfcShamanNear(t, resto.CurrentHealth(), 0)
	kfcShamanNear(t, resto.kfcReactiveSets.viperMana.ActualGainForCurrentIteration(), 0)
	kfcShamanMeasure("REACTIVE_LIFECYCLE", []float64{100, 100, 5})
	sim.Cleanup()
}

func TestKFCShamanReactivePolicyGuardsAndCopies(t *testing.T) {
	for _, kind := range []string{"unowned", "schema", "id", "timing", "negative", "large", "nan", "infinite", "late", "casting"} {
		policy := kfcShamanReactivePolicy("after-hit", false, .02)
		id, pieces := int32(182), 4
		if kind == "unowned" {
			id, pieces = 0, 0
		}
		sim, resto := kfcShamanReactiveFixture(t, id, pieces, nil)
		switch kind {
		case "schema":
			policy.Schema = "bad"
		case "id":
			policy.ID = ""
		case "timing":
			policy.ThresholdTiming = "guess"
		case "negative":
			policy.DevoutChance = -1
		case "large":
			policy.DevoutChance = 1.1
		case "nan":
			policy.DevoutChance = math.NaN()
		case "infinite":
			policy.DevoutChance = math.Inf(1)
		case "late":
			kfcShamanAdvance(t, sim, time.Second)
		case "casting":
			resto.Hardcast.Expires = time.Second
		}
		if resto.ConfigureKFCShamanReactiveSets(sim, policy) == nil {
			t.Fatal("Invalid reactive policy admitted", kind)
		}
		sim.Cleanup()
	}
	policy := kfcShamanReactivePolicy("after-hit", false, .02)
	sim, resto := kfcShamanReactiveFixture(t, 182, 4, &policy)
	policy.ThresholdTiming = "before-hit"
	echo := resto.KFCShamanReactiveSetPolicyEcho()
	echo.DevoutChance = 1
	if resto.kfcReactiveSets.policy.ThresholdTiming != "after-hit" || resto.kfcReactiveSets.policy.DevoutChance != .02 {
		t.Fatal("Mutable policy alias")
	}
	if resto.ConfigureKFCShamanReactiveSets(sim, policy) == nil {
		t.Fatal("Reactive policy replaced")
	}
	kfcShamanMeasure("REACTIVE_POLICY_GUARDS", 10)
	sim.Cleanup()
}

func TestKFCShamanReactiveOrderedReceiverAndMissingPolicy(t *testing.T) {
	policy := kfcShamanReactivePolicy("after-hit", false, 1)
	sim, resto := kfcShamanReactiveFixture(t, 182, 4, &policy)
	other := resto.kfcHealingPlayers()[1]
	before := other.CurrentHealth()
	kfcShamanReactiveDamage(sim, resto, other, 10, false, false)
	kfcShamanNear(t, before-other.CurrentHealth(), 10)
	if resto.kfcReactiveSets.devout.SelfShield().IsActive() {
		t.Fatal("Another player's damage triggered owner")
	}
	before = resto.CurrentHealth()
	kfcShamanReactiveDamage(sim, resto, &resto.Unit, 10, false, false)
	kfcShamanNear(t, before-resto.CurrentHealth(), 10)
	kfcShamanReactiveDamage(sim, resto, &resto.Unit, 100, false, false)
	kfcShamanNear(t, before-resto.CurrentHealth(), 10)
	kfcShamanNear(t, resto.kfcReactiveSets.devout.SelfShield().RemainingAbsorb(), 388)
	sim.Cleanup()
	sim, resto = kfcShamanReactiveFixture(t, 182, 4, nil)
	caught := false
	func() {
		defer func() { caught = recover() != nil }()
		kfcShamanReactiveDamage(sim, resto, &resto.Unit, 1, false, false)
	}()
	if !caught {
		t.Fatal("Unconfigured owned reactive effect silently ignored")
	}
	kfcShamanMeasure("REACTIVE_ORDERED_RECEIVER", []float64{10, 388})
	sim.Cleanup()
}
