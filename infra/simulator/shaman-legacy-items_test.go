package restoration

import (
	"math"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/stats"
)

func kfcShamanLegacyReference(resto *RestorationShaman, power, seal float64) KFCShamanLegacyItemPolicy {
	policy := KFCShamanLegacyItemPolicy{Schema: "kfc-shaman-legacy-item-policy.v1", ID: "explicit-reference"}
	if resto.kfcLegacyItems.briar {
		policy.BriarwoodSpellPower = &power
	}
	if resto.kfcLegacyItems.royal {
		policy.RoyalSealSpellPower = &seal
	}
	if resto.kfcLegacyItems.eye {
		policy.EyeScriptReference = "captured-passive-unmodeled-script-reference"
	}
	return policy
}

func TestKFCShamanLegacyOwnershipAndExplicitReference(t *testing.T) {
	for _, id := range []int32{0, 12930, 18471, 13968} {
		ids := []int32{}
		if id > 0 {
			ids = append(ids, id)
		}
		sim, resto, target := kfcShamanItemsFixture(t, ids...)
		if resto.KFCShamanLegacyItemPolicyEcho() != nil {
			t.Fatal("Implicit legacy hypothesis")
		}
		wave := resto.GetSpell(core.ActionID{SpellID: 331})
		if wave.CanCast(sim, target) != (id == 0) {
			t.Fatal("Legacy gear bypassed explicit references", id)
		}
		if id > 0 {
			if id == 13968 && resto.GetSpell(core.ActionID{ItemID: 13968}).CanCast(sim, &resto.Unit) {
				t.Fatal("Eye use bypassed explicit script reference")
			}
			if err := resto.ConfigureKFCShamanLegacyItems(sim, kfcShamanLegacyReference(resto, 15, 18)); err != nil {
				t.Fatal(err)
			}
			if !wave.CanCast(sim, target) {
				t.Fatal("Configured legacy owner cannot heal", id)
			}
		} else if resto.ConfigureKFCShamanLegacyItems(sim, KFCShamanLegacyItemPolicy{Schema: "kfc-shaman-legacy-item-policy.v1", ID: "unowned", BriarwoodSpellPower: func() *float64 { v := 15.0; return &v }()}) == nil {
			t.Fatal("Unowned legacy hypothesis accepted")
		}
		kfcShamanMeasure("LEGACY_OWNERSHIP", id)
		sim.Cleanup()
	}
}

func TestKFCShamanLegacyAllStatDeltasResetAndCopies(t *testing.T) {
	for _, power := range []float64{15, 29, 30} {
		for _, seal := range []float64{18, 23} {
			sim, resto, _ := kfcShamanItemsFixture(t, 12930, 18471)
			before := resto.GetStat(stats.SpellPower)
			otherHealing, otherDamage := resto.GetStat(stats.HealingPower), resto.GetStat(stats.SpellDamage)
			policy := kfcShamanLegacyReference(resto, power, seal)
			if err := resto.ConfigureKFCShamanLegacyItems(sim, policy); err != nil {
				t.Fatal(err)
			}
			want := before + power - 29 + seal - 23
			kfcShamanNear(t, resto.GetStat(stats.SpellPower), want)
			kfcShamanNear(t, resto.GetStat(stats.HealingPower), otherHealing)
			kfcShamanNear(t, resto.GetStat(stats.SpellDamage), otherDamage)
			*policy.BriarwoodSpellPower = 1000
			*resto.KFCShamanLegacyItemPolicyEcho().RoyalSealSpellPower = 1000
			kfcShamanNear(t, *resto.KFCShamanLegacyItemPolicyEcho().BriarwoodSpellPower, power)
			kfcShamanNear(t, *resto.KFCShamanLegacyItemPolicyEcho().RoyalSealSpellPower, seal)
			sim.Cleanup()
			sim.Reset()
			kfcShamanNear(t, resto.GetStat(stats.SpellPower), want)
			kfcShamanMeasure("LEGACY_DELTAS", []float64{power, seal, want})
			sim.Cleanup()
		}
	}
}

func TestKFCShamanLegacyRejectInvalidAndMismatchedReferences(t *testing.T) {
	for _, kind := range []string{"schema", "id", "empty", "power", "seal", "nan", "infinite", "missing-briar", "missing-seal", "unowned-eye"} {
		sim, resto, _ := kfcShamanItemsFixture(t, 12930, 18471)
		policy := kfcShamanLegacyReference(resto, 15, 18)
		switch kind {
		case "schema":
			policy.Schema = "other"
		case "id":
			policy.ID = ""
		case "empty":
			policy.BriarwoodSpellPower = nil
			policy.RoyalSealSpellPower = nil
		case "power":
			*policy.BriarwoodSpellPower = 44
		case "seal":
			*policy.RoyalSealSpellPower = 36
		case "nan":
			*policy.BriarwoodSpellPower = math.NaN()
		case "infinite":
			*policy.RoyalSealSpellPower = math.Inf(1)
		case "missing-briar":
			policy.BriarwoodSpellPower = nil
		case "missing-seal":
			policy.RoyalSealSpellPower = nil
		case "unowned-eye":
			policy.EyeScriptReference = "captured-passive-unmodeled-script-reference"
		}
		if resto.ConfigureKFCShamanLegacyItems(sim, policy) == nil {
			t.Fatal("Invalid legacy reference accepted", kind)
		}
		sim.Cleanup()
	}
	kfcShamanMeasure("LEGACY_INVALID", 10)
}

func TestKFCShamanLegacyFreshnessGuards(t *testing.T) {
	for _, kind := range []string{"time", "geometry", "nil-sim", "hardcast", "history", "repeat"} {
		sim, resto, _ := kfcShamanItemsFixture(t, 12930)
		policy := kfcShamanLegacyReference(resto, 15, 18)
		argument := sim
		switch kind {
		case "time":
			sim.CurrentTime = time.Nanosecond
		case "geometry":
			resto.positions = nil
		case "nil-sim":
			argument = nil
		case "hardcast":
			resto.Hardcast.Expires = time.Nanosecond
		case "history":
			resto.GetSpell(core.ActionID{SpellID: 331}).SpellMetrics[resto.UnitIndex].Casts = 1
		case "repeat":
			if err := resto.ConfigureKFCShamanLegacyItems(sim, policy); err != nil {
				t.Fatal(err)
			}
		}
		if resto.ConfigureKFCShamanLegacyItems(argument, policy) == nil {
			t.Fatal("Late/repeated legacy reference accepted", kind)
		}
		sim.Cleanup()
	}
	kfcShamanMeasure("LEGACY_FRESHNESS", 6)
}

func TestKFCShamanLegacyActualHealingCoefficients(t *testing.T) {
	for _, id := range []int32{12930, 18471} {
		refs := []float64{15, 29, 30}
		if id == 18471 {
			refs = []float64{18, 23}
		}
		amounts := []float64{}
		for _, value := range refs {
			sim, resto, target := kfcShamanItemsFixture(t, id)
			power, seal := value, 18.0
			if id == 18471 {
				power, seal = 15, value
			}
			if err := resto.ConfigureKFCShamanLegacyItems(sim, kfcShamanLegacyReference(resto, power, seal)); err != nil {
				t.Fatal(err)
			}
			spell := resto.GetSpell(core.ActionID{SpellID: 10396})
			spell.BonusCritRating = -10000
			target.RemoveHealth(sim, 5000)
			before := target.CurrentHealth()
			if !spell.Cast(sim, target) {
				t.Fatal("Legacy healing control failed")
			}
			kfcShamanAdvance(t, sim, 3*time.Second)
			amounts = append(amounts, target.CurrentHealth()-before)
			sim.Cleanup()
		}
		for index := range refs {
			kfcShamanNear(t, amounts[index]-amounts[0], .857*(refs[index]-refs[0]))
		}
		kfcShamanMeasure("LEGACY_HEALING", map[string]interface{}{"id": id, "amounts": amounts})
	}
}

func TestKFCShamanLegacyEyeCapturedPassiveAndNoInventedScript(t *testing.T) {
	sim, resto, _ := kfcShamanItemsFixture(t, 13968)
	oracle, plain, _ := kfcShamanItemsFixture(t)
	defer sim.Cleanup()
	defer oracle.Cleanup()
	kfcShamanNear(t, resto.GetStat(stats.SpellCrit)-plain.GetStat(stats.SpellCrit), 1)
	policy := kfcShamanLegacyReference(resto, 15, 18)
	policy.EyeScriptReference = "verified-no-script"
	if resto.ConfigureKFCShamanLegacyItems(sim, policy) == nil {
		t.Fatal("Unverified script was promoted")
	}
	policy.EyeScriptReference = "captured-passive-unmodeled-script-reference"
	if err := resto.ConfigureKFCShamanLegacyItems(sim, policy); err != nil {
		t.Fatal(err)
	}
	if resto.GetSpell(core.ActionID{SpellID: 1318846}) != nil || resto.GetAura("Shaman assumed Eye script") != nil {
		t.Fatal("Invented Eye script behavior")
	}
	kfcShamanMeasure("LEGACY_EYE_PASSIVE", 1)
}

func TestKFCShamanLegacyEyeActiveDoesNotImproveHealing(t *testing.T) {
	amounts := []float64{}
	for _, use := range []bool{false, true} {
		sim, resto, target := kfcShamanItemsFixture(t, 13968)
		if err := resto.ConfigureKFCShamanLegacyItems(sim, kfcShamanLegacyReference(resto, 15, 18)); err != nil {
			t.Fatal(err)
		}
		beforeHit, beforeCrit := resto.GetStat(stats.SpellHit), resto.GetStat(stats.SpellCrit)
		if use {
			spell := resto.GetSpell(core.ActionID{ItemID: 13968})
			if !spell.Cast(sim, &resto.Unit) {
				t.Fatal("Eye active failed")
			}
			kfcShamanNear(t, resto.GetStat(stats.SpellHit)-beforeHit, 7*core.SpellHitRatingPerHitChance)
			kfcShamanNear(t, resto.GetStat(stats.SpellCrit), beforeCrit)
			if spell.CD.ReadyAt() != 5*time.Minute || spell.SharedCD.ReadyAt() != 20*time.Second {
				t.Fatal("Eye current cooldown mismatch")
			}
		}
		heal := resto.GetSpell(core.ActionID{SpellID: 10396})
		heal.BonusCritRating = -10000
		target.RemoveHealth(sim, 5000)
		before := target.CurrentHealth()
		if !heal.Cast(sim, target) {
			t.Fatal("Eye healing comparison failed")
		}
		kfcShamanAdvance(t, sim, 3*time.Second)
		amounts = append(amounts, target.CurrentHealth()-before)
		kfcShamanAdvance(t, sim, 20*time.Second)
		kfcShamanNear(t, resto.GetStat(stats.SpellHit), beforeHit)
		sim.Cleanup()
	}
	kfcShamanNear(t, amounts[0], amounts[1])
	kfcShamanMeasure("LEGACY_EYE_ACTIVE_HEALING", amounts)
}

func TestKFCShamanLegacyEyeSharesCurrentSerenityCategory(t *testing.T) {
	for _, eyeFirst := range []bool{false, true} {
		sim, resto, _ := kfcShamanItemsFixture(t, 13968, 272439)
		if err := resto.ConfigureKFCShamanLegacyItems(sim, kfcShamanLegacyReference(resto, 15, 18)); err != nil {
			t.Fatal(err)
		}
		eye, serenity := resto.GetSpell(core.ActionID{ItemID: 13968}), resto.GetSpell(core.ActionID{ItemID: 272439})
		first, second, wait := serenity, eye, 15*time.Second
		if eyeFirst {
			first, second, wait = eye, serenity, 20*time.Second
		}
		if !first.Cast(sim, &resto.Unit) || second.CanCast(sim, &resto.Unit) {
			t.Fatal("Eye/Serenity shared timer missing")
		}
		kfcShamanAdvance(t, sim, wait-time.Millisecond)
		if second.CanCast(sim, &resto.Unit) {
			t.Fatal("Shared timer ended early")
		}
		kfcShamanAdvance(t, sim, wait)
		if !second.Cast(sim, &resto.Unit) {
			t.Fatal("Shared timer did not unlock")
		}
		kfcShamanMeasure("LEGACY_EYE_SHARED", int64(wait))
		sim.Cleanup()
	}
}
