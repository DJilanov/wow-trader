package holy

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/stats"
	googleProto "google.golang.org/protobuf/proto"
)

// KFC_PALADIN_SELF_SET_FIXTURES

func kfcPaladinSelfSetRequest(setID int32, pieces int) *proto.RaidSimRequest {
	equipment := map[int]int32{}
	for _, row := range kfcPaladinSelfSetEquipment[setID][:pieces] {
		equipment[int(row.slot)] = row.id
	}
	request := kfcPaladinRegenerationRequest(equipment)
	request.Raid.Parties[0].Players[0].Rotation = &proto.APLRotation{Type: proto.APLRotation_TypeAPL}
	return request
}

func kfcPaladinSelfSetFixture(t *testing.T, setID int32, pieces int) (*core.Simulation, *HolyPaladin) {
	t.Helper()
	sim, healer := kfcPaladinRegenerationFixture(t, kfcPaladinSelfSetRequest(setID, pieces))
	count := 0
	for _, item := range healer.Equipment {
		if item.SetID == setID {
			count++
		}
	}
	if count != pieces {
		t.Fatal("Self-set equipment moved slots", setID, count, pieces)
	}
	return sim, healer
}

func kfcPaladinSelfSetDamage(sim *core.Simulation, healer *HolyPaladin, amount float64, self, periodic bool) {
	caster := sim.Encounter.TargetUnits[0]
	if self {
		caster = &healer.Unit
	}
	spell := caster.GetOrRegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: 1, Tag: 211}, SpellSchool: core.SpellSchoolShadow, DefenseType: core.DefenseTypeMagic, ProcMask: core.ProcMaskSpellDamage, DamageMultiplier: 1})
	result := spell.NewResult(&healer.Unit)
	result.Damage, result.Outcome = amount, core.OutcomeHit
	if periodic {
		spell.DealPeriodicDamage(sim, result)
	} else {
		spell.DealDamage(sim, result)
	}
}

func kfcPaladinSelfSetHealthResource(unit *core.Unit, id int32) (float64, float64) {
	raw, actual := 0.0, 0.0
	for _, row := range unit.Metrics.ToProto().Resources {
		if row.Id.GetSpellId() == id && row.Type == proto.ResourceType_ResourceTypeHealth {
			raw += row.Gain
			actual += row.ActualGain
		}
	}
	return raw, actual
}

func TestKFCPaladinSelfSetsOwnedThresholds(t *testing.T) {
	for _, row := range kfcPaladinSelfSetThresholds {
		for _, pieces := range []int{row.pieces - 1, row.pieces} {
			_, healer := kfcPaladinSelfSetFixture(t, row.setID, pieces)
			state := healer.selfSets
			present := false
			switch row.setID {
			case 162:
				present = state.viper != nil
			case 163:
				present = state.scarlet != nil
			case 182:
				present = state.devout != nil
			case 184, 189:
				present = state.vitality != nil
			case 1968:
				present = state.blessed != nil
			}
			if present != (pieces == row.pieces) {
				t.Fatal("Owned threshold changed", row.setID, pieces)
			}
		}
	}
	kfcPaladinHeartMeasure("SELF_SET_OWNERSHIP", true)
}

func TestKFCPaladinSelfSetsViperTimingTicksCooldownAndDeath(t *testing.T) {
	for _, timing := range []string{"after-hit", "before-hit"} {
		sim, healer := kfcPaladinSelfSetFixture(t, 162, 4)
		if err := healer.ConfigureKFCPaladinSelfSets(sim, &KFCPaladinSelfSetPolicy{ThresholdTiming: &timing}); err != nil {
			t.Fatal(err)
		}
		healer.RemoveHealth(sim, healer.MaxHealth()*.7)
		healer.SpendMana(sim, 1000, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 212}))
		kfcPaladinSelfSetDamage(sim, healer, healer.MaxHealth()*.075, false, false)
		active := healer.selfSets.viper.Hot(&healer.Unit).IsActive()
		if active != (timing == "after-hit") {
			t.Fatal("Wrong threshold timing", timing)
		}
		beforeHP, beforeMana := healer.CurrentHealth(), healer.CurrentMana()
		kfcPaladinAdvance(t, sim, 5*time.Second)
		want := 0.0
		if active {
			want = 100
		}
		kfcPaladinNear(t, healer.CurrentHealth()-beforeHP, want)
		kfcPaladinNear(t, healer.CurrentMana()-beforeMana, want)
		if active {
			kfcPaladinNear(t, float64(healer.selfSets.viperCD.ReadyAt()), float64(5*time.Minute))
			kfcPaladinSelfSetDamage(sim, healer, 1, false, true)
			if healer.selfSets.viper.Hot(&healer.Unit).IsActive() {
				t.Fatal("Viper ignored its internal cooldown")
			}
			kfcPaladinAdvance(t, sim, 5*time.Minute)
			kfcPaladinSelfSetDamage(sim, healer, 1, false, true)
			if !healer.selfSets.viper.Hot(&healer.Unit).IsActive() {
				t.Fatal("Viper did not rearm")
			}
			healer.RemoveHealth(sim, healer.CurrentHealth())
			mana := healer.CurrentMana()
			kfcPaladinAdvance(t, sim, 305*time.Second)
			kfcPaladinNear(t, healer.CurrentHealth(), 0)
			kfcPaladinNear(t, healer.CurrentMana(), mana)
		}
		kfcPaladinHeartMeasure("SELF_SET_VIPER_"+timing, []float64{want, want})
	}
}

func TestKFCPaladinSelfSetsScarletAbsorbsLaterDamageOnlyAndExpires(t *testing.T) {
	sim, healer := kfcPaladinSelfSetFixture(t, 163, 6)
	healer.AddStatDynamic(sim, stats.HealingPower, 100000)
	healer.RemoveHealth(sim, healer.MaxHealth()*.79)
	before := healer.CurrentHealth()
	amount := healer.MaxHealth() * .02
	kfcPaladinSelfSetDamage(sim, healer, amount, false, false)
	kfcPaladinNear(t, before-healer.CurrentHealth(), amount)
	shield := healer.selfSets.scarlet.SelfShield()
	kfcPaladinNear(t, shield.RemainingAbsorb(), 480)
	before = healer.CurrentHealth()
	kfcPaladinSelfSetDamage(sim, healer, 100, false, true)
	kfcPaladinNear(t, healer.CurrentHealth(), before)
	kfcPaladinNear(t, shield.RemainingAbsorb(), 380)
	kfcPaladinNear(t, float64(healer.selfSets.scarletCD.ReadyAt()), float64(4*time.Minute))
	kfcPaladinAdvance(t, sim, 10*time.Second)
	if shield.IsActive() {
		t.Fatal("Scarlet shield did not expire")
	}
	kfcPaladinNear(t, shield.RemainingAbsorb(), 0)
	kfcPaladinSelfSetDamage(sim, healer, 1, false, false)
	if shield.IsActive() {
		t.Fatal("Scarlet ignored cooldown")
	}
	kfcPaladinHeartMeasure("SELF_SET_SCARLET", []float64{amount, 480, 380})
}

func TestKFCPaladinSelfSetsDevoutDirectPeriodicAndFullyAbsorbedHits(t *testing.T) {
	sim, healer := kfcPaladinSelfSetFixture(t, 182, 4)
	one := 1.0
	if err := healer.ConfigureKFCPaladinSelfSets(sim, &KFCPaladinSelfSetPolicy{DevoutProcChance: &one}); err != nil {
		t.Fatal(err)
	}
	healer.AddStatDynamic(sim, stats.HealingPower, 100000)
	shield := healer.selfSets.devout.SelfShield()
	kfcPaladinSelfSetDamage(sim, healer, 100, false, true)
	if shield.IsActive() {
		t.Fatal("Periodic damage incorrectly triggered Devout")
	}
	shield.Apply(sim, 488)
	before := healer.CurrentHealth()
	kfcPaladinSelfSetDamage(sim, healer, 100, false, false)
	kfcPaladinNear(t, healer.CurrentHealth(), before)
	kfcPaladinNear(t, shield.RemainingAbsorb(), 488)
	kfcPaladinNear(t, float64(healer.selfSets.devoutCD.ReadyAt()), float64(time.Minute))
	kfcPaladinSelfSetDamage(sim, healer, 100, false, false)
	kfcPaladinNear(t, shield.RemainingAbsorb(), 388)
	kfcPaladinAdvance(t, sim, 30*time.Second)
	if shield.IsActive() {
		t.Fatal("Devout did not expire")
	}
	kfcPaladinAdvance(t, sim, time.Minute)
	kfcPaladinSelfSetDamage(sim, healer, 100, false, false)
	kfcPaladinNear(t, shield.RemainingAbsorb(), 488)
	kfcPaladinHeartMeasure("SELF_SET_DEVOUT", []float64{488, 388, 60000})
}

func TestKFCPaladinSelfSetsRegenerationTimingRatesAndNoHealingScale(t *testing.T) {
	for _, row := range []struct {
		id     int32
		pieces int
		spell  int32
		rate   float64
	}{{184, 6, 21347, 15}, {189, 6, 21347, 15}, {1968, 4, 1302375, 20}} {
		for _, period := range []int64{2000, 5000} {
			sim, healer := kfcPaladinSelfSetFixture(t, row.id, row.pieces)
			if err := healer.ConfigureKFCPaladinSelfSets(sim, &KFCPaladinSelfSetPolicy{RegenerationTickMs: &period}); err != nil {
				t.Fatal(err)
			}
			healer.AddStatDynamic(sim, stats.HealingPower, 100000)
			healer.AddStatDynamic(sim, stats.SpellCrit, 10000)
			healer.RemoveHealth(sim, 1000)
			kfcPaladinAdvance(t, sim, time.Duration(period)*time.Millisecond-time.Nanosecond)
			raw, _ := kfcPaladinSelfSetHealthResource(&healer.Unit, row.spell)
			kfcPaladinNear(t, raw, 0)
			kfcPaladinAdvance(t, sim, 10*time.Second)
			raw, actual := kfcPaladinSelfSetHealthResource(&healer.Unit, row.spell)
			kfcPaladinNear(t, raw, row.rate*2)
			kfcPaladinNear(t, actual, row.rate*2)
			for _, spell := range healer.Spellbook {
				for _, metric := range spell.SpellMetrics {
					kfcPaladinNear(t, metric.TotalHealing, 0)
				}
			}
			kfcPaladinHeartMeasure(fmt.Sprintf("SELF_SET_REGEN_%d_%d", row.id, period), []float64{raw, actual})
		}
	}
}

func TestKFCPaladinSelfSetsBlessedPartyRangeCapsDeathAndReset(t *testing.T) {
	request := kfcPaladinSelfSetRequest(1968, 4)
	other := googleProto.Clone(request.Raid.Parties[0].Players[0]).(*proto.Player)
	other.Name, other.Equipment = "Other party self-set control", &proto.EquipmentSpec{}
	request.Raid.Parties = append(request.Raid.Parties, &proto.Party{Players: []*proto.Player{other}})
	sim, healer := kfcPaladinRegenerationFixture(t, request)
	inside, outside := sim.Raid.AllUnits[1], sim.Raid.AllUnits[2]
	otherUnit := &sim.Raid.Parties[1].Players[0].GetCharacter().Unit
	healer.KFCHealing.positions[inside.UnitIndex] = KFCPaladinFriendlyPosition{X: 30}
	healer.KFCHealing.positions[outside.UnitIndex] = KFCPaladinFriendlyPosition{X: 30.01}
	for _, unit := range sim.Raid.AllUnits {
		unit.RemoveHealth(sim, 1000)
	}
	insideHP, outsideHP, otherHP := inside.CurrentHealth(), outside.CurrentHealth(), otherUnit.CurrentHealth()
	kfcPaladinAdvance(t, sim, 10*time.Second)
	kfcPaladinNear(t, inside.CurrentHealth()-insideHP, 40)
	kfcPaladinNear(t, outside.CurrentHealth(), outsideHP)
	kfcPaladinNear(t, otherUnit.CurrentHealth(), otherHP)
	inside.GainHealth(sim, inside.MaxHealth(), inside.NewHealthMetrics(core.ActionID{SpellID: 1, Tag: 213}))
	inside.RemoveHealth(sim, 1)
	rawBefore, actualBefore := kfcPaladinSelfSetHealthResource(inside, 1302375)
	kfcPaladinAdvance(t, sim, 12*time.Second)
	raw, actual := kfcPaladinSelfSetHealthResource(inside, 1302375)
	kfcPaladinNear(t, raw-rawBefore, 8)
	kfcPaladinNear(t, actual-actualBefore, 1)
	healer.RemoveHealth(sim, healer.CurrentHealth())
	inside.RemoveHealth(sim, 1000)
	insideHP = inside.CurrentHealth()
	kfcPaladinAdvance(t, sim, 20*time.Second)
	kfcPaladinNear(t, inside.CurrentHealth(), insideHP)
	kfcPaladinNear(t, healer.CurrentHealth(), 0)
	sim.Cleanup()
	sim.Reset()
	healer.RemoveHealth(sim, 1000)
	before := healer.CurrentHealth()
	kfcPaladinAdvance(t, sim, 2*time.Second)
	kfcPaladinNear(t, healer.CurrentHealth()-before, 8)
	kfcPaladinHeartMeasure("SELF_SET_PARTY_LIFECYCLE", []float64{40, raw - rawBefore, actual - actualBefore, 8})
}

func TestKFCPaladinSelfSetsFreshnessOwnershipAndPolicyCopy(t *testing.T) {
	one, period, timing, enabled := 1.0, int64(5000), "before-hit", false
	sim, none := kfcPaladinSelfSetFixture(t, 162, 3)
	for _, policy := range []*KFCPaladinSelfSetPolicy{{ThresholdTiming: &timing}, {RegenerationTickMs: &period}, {SelfDamageTriggers: &enabled}, {DevoutProcChance: &one}, {}} {
		if none.ConfigureKFCPaladinSelfSets(sim, policy) == nil {
			t.Fatal("Unowned or empty self-set policy admitted")
		}
	}
	for _, chance := range []float64{-1, 1.01, math.NaN(), math.Inf(1)} {
		sim, healer := kfcPaladinSelfSetFixture(t, 182, 4)
		if healer.ConfigureKFCPaladinSelfSets(sim, &KFCPaladinSelfSetPolicy{DevoutProcChance: &chance}) == nil {
			t.Fatal("Invalid Devout chance admitted")
		}
	}
	sim, healer := kfcPaladinSelfSetFixture(t, 184, 6)
	if err := healer.ConfigureKFCPaladinSelfSets(sim, &KFCPaladinSelfSetPolicy{RegenerationTickMs: &period}); err != nil {
		t.Fatal(err)
	}
	period = 2000
	if healer.selfSets.tickMs != 5000 || *healer.selfSets.echo.RegenerationTickMs != 5000 {
		t.Fatal("Mutable policy alias")
	}
	if healer.ConfigureKFCPaladinSelfSets(sim, &KFCPaladinSelfSetPolicy{RegenerationTickMs: &period}) == nil {
		t.Fatal("Self-set policy changed twice")
	}
	sim, healer = kfcPaladinSelfSetFixture(t, 182, 4)
	kfcPaladinSelfSetDamage(sim, healer, 1, false, false)
	if healer.ConfigureKFCPaladinSelfSets(sim, &KFCPaladinSelfSetPolicy{DevoutProcChance: &one}) == nil {
		t.Fatal("Policy changed after damage")
	}
	sim, healer = kfcPaladinSelfSetFixture(t, 184, 6)
	kfcPaladinAdvance(t, sim, 2*time.Second)
	if healer.ConfigureKFCPaladinSelfSets(sim, &KFCPaladinSelfSetPolicy{RegenerationTickMs: &period}) == nil {
		t.Fatal("Policy changed after regeneration")
	}
	kfcPaladinHeartMeasure("SELF_SET_POLICY_GUARDS", true)
}

func TestKFCPaladinSelfSetsActualRuneAndCircleSelfDamageReferences(t *testing.T) {
	for _, set := range []struct {
		id     int32
		pieces int
	}{{162, 4}, {163, 6}, {182, 4}} {
		for _, circle := range []bool{false, true} {
			for _, selfDamage := range []bool{false, true} {
				request := kfcPaladinSelfSetRequest(set.id, set.pieces)
				player := request.Raid.Parties[0].Players[0]
				player.Consumes.DefaultConjured = proto.Conjured_ConjuredDemonicRune
				if circle {
					if player.Equipment.Items[0].Id != 0 {
						t.Fatal("Circle fixture replaced a set piece")
					}
					player.Equipment.Items[0].Id = 11808
				}
				sim, healer := kfcPaladinRegenerationFixture(t, request)
				chance := 1.0
				policy := &KFCPaladinSelfSetPolicy{SelfDamageTriggers: &selfDamage}
				if set.id == 182 {
					policy.DevoutProcChance = &chance
				}
				if err := healer.ConfigureKFCPaladinSelfSets(sim, policy); err != nil {
					t.Fatal(err)
				}
				healer.RemoveHealth(sim, healer.MaxHealth()*.81)
				healer.SpendMana(sim, 2000, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 214}))
				before := healer.CurrentHealth()
				id := int32(12662)
				if circle {
					id = 11808
				}
				spell := healer.GetSpell(core.ActionID{ItemID: id})
				if spell == nil || !spell.CanCast(sim, &healer.Unit) || !spell.Cast(sim, &healer.Unit) {
					t.Fatal("Real health-spending item failed", id)
				}
				if circle {
					kfcPaladinAdvance(t, sim, time.Second)
				}
				if healer.CurrentHealth() >= before {
					t.Fatal("Item did not spend health")
				}
				active := false
				switch set.id {
				case 162:
					active = healer.selfSets.viper.Hot(&healer.Unit).IsActive()
				case 163:
					active = healer.selfSets.scarlet.SelfShield().IsActive()
				case 182:
					active = healer.selfSets.devout.SelfShield().IsActive()
				}
				want := selfDamage && (set.id != 182 || !circle)
				if active != want {
					t.Fatal("Wrong real self-damage eligibility", set.id, circle, selfDamage, active)
				}
				kfcPaladinHeartMeasure(fmt.Sprintf("SELF_SET_PAYMENT_%d_%t_%t", set.id, circle, selfDamage), []bool{active, want})
			}
		}
	}
}

func TestKFCPaladinSelfSetsActualWorkloadPoliciesAndEcho(t *testing.T) {
	for _, set := range kfcPaladinSelfSetThresholds {
		for reference := 0; reference < 2; reference++ {
			request, frame := kfcPaladinWorkloadControl()
			player := kfcPaladinSelfSetRequest(set.setID, set.pieces).Raid.Parties[0].Players[0]
			player.TalentsString = "05320013225101051-503230002-05"
			request.Raid.Parties[0].Players[0] = player
			request.SimOptions.Iterations = 32
			frame.RequireFullTalentBuild = true
			policy := &KFCPaladinSelfSetPolicy{}
			if set.setID == 184 || set.setID == 189 || set.setID == 1968 {
				period := int64(2000 + reference*3000)
				policy.RegenerationTickMs = &period
			} else {
				enabled := reference == 1
				policy.SelfDamageTriggers = &enabled
				player.Consumes.DefaultConjured = proto.Conjured_ConjuredDemonicRune
				frame.Cooldowns = []KFCPaladinHealingCooldown{{ItemID: 12662, MinimumMissingMana: 1500}}
				// A synthetic low-health actor exercises the real Rune damage path.
				probe, healer := kfcPaladinRegenerationFixture(t, googleProto.Clone(request).(*proto.RaidSimRequest))
				player.BonusStats.Stats[stats.Health] += 1100 - healer.MaxHealth()
				probe.Cleanup()
				if set.setID == 182 {
					chance := 1.0
					policy.DevoutProcChance = &chance
				}
			}
			frame.SelfSetPolicy = policy
			id := fmt.Sprintf("paladin-self-set-%d-reference-%d", set.setID, reference)
			payload := kfcPaladinWorkloadPayload(t, request, frame, id, true)
			reply := RunKFCPaladinHealingJob(context.Background(), payload)
			if reply.Status != "complete" || reply.Result == nil || !reply.Result.LegalTalentBuild {
				t.Fatalf("Self-set workload failed: %+v; job %s", reply.Error, id)
			}
			expected, _ := json.Marshal(policy)
			actual, _ := json.Marshal(reply.Result.SelfSetPolicy)
			if string(actual) != string(expected) {
				t.Fatal("Self-set policy echo changed", string(actual), string(expected))
			}
			var job interface{}
			if err := json.Unmarshal(payload, &job); err != nil {
				t.Fatal(err)
			}
			kfcPaladinHeartMeasure("SELF_SET_WORKLOAD_REQUEST", job)
			kfcPaladinHeartMeasure("SELF_SET_WORKLOAD_"+id, reply.Result.ManaRemainingMean)
		}
	}
}
