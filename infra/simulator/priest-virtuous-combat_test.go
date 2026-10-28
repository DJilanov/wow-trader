//go:build with_db

package virtuouscombat_test

import (
	"fmt"
	"math"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
	"github.com/wowsims/classic/sim/priest"
	"github.com/wowsims/classic/sim/priest/shadow"
	"github.com/wowsims/classic/sim/priest/smite"
	googleProto "google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
)

var virtuousCombatRegistration sync.Once

func virtuousCombatNear(t *testing.T, got, want float64) {
	t.Helper()
	if math.IsNaN(got) || math.IsInf(got, 0) || math.Abs(got-want) > 1e-7 {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func virtuousCombatTalents(talents *proto.PriestTalents) string {
	var result strings.Builder
	message := talents.ProtoReflect()
	for index := 0; index < message.Descriptor().Fields().Len(); index++ {
		if index == 18 || index == 35 {
			result.WriteByte('-')
		}
		field := message.Descriptor().Fields().Get(index)
		value := int64(0)
		if field.Kind() == protoreflect.BoolKind {
			if message.Get(field).Bool() {
				value = 1
			}
		} else {
			value = message.Get(field).Int()
		}
		result.WriteByte(byte('0' + value))
	}
	return result.String()
}

func virtuousCombatFixture(t *testing.T, role string, pieces int, kings bool, talents *proto.PriestTalents, power float64, ruleset proto.Ruleset, incomingHealth ...bool) (*core.Simulation, *priest.Priest) {
	t.Helper()
	virtuousCombatRegistration.Do(func() { shadow.RegisterShadowPriest(); smite.RegisterSmitePriest() })
	gear := &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
	for slot := range gear.Items {
		gear.Items[slot] = &proto.ItemSpec{}
	}
	slots := map[proto.ItemType]int{1: 0, 3: 2, 5: 4, 6: 5, 7: 6, 8: 7, 9: 8, 10: 9}
	for index := 0; index < pieces; index++ {
		id := int32(22078 + index)
		item, exists := core.ItemsByID[id]
		slot, valid := slots[item.Type]
		if !exists || !valid || gear.Items[slot].Id != 0 {
			t.Fatal("Missing current item or invalid Virtuous equipment geometry", id)
		}
		gear.Items[slot].Id = id
	}
	player := &proto.Player{Class: proto.Class_ClassPriest, Race: proto.Race_RaceHuman, Level: 60,
		Equipment: gear, TalentsString: virtuousCombatTalents(talents),
		BonusStats: &proto.UnitStats{Stats: stats.Stats{stats.SpellPower: power}.ToFloatArray()},
		Buffs:      &proto.IndividualBuffs{BlessingOfKings: kings},
		Rotation:   &proto.APLRotation{Type: proto.APLRotation_TypeAPL}}
	if role == "shadow" {
		player.Spec = &proto.Player_ShadowPriest{ShadowPriest: &proto.ShadowPriest{Options: &proto.ShadowPriest_Options{}}}
	} else if role == "smite" {
		player.Spec = &proto.Player_SmitePriest{SmitePriest: &proto.SmitePriest{Options: &proto.SmitePriest_Options{}}}
	} else {
		t.Fatal("Unexpected native Priest role", role)
	}
	encounter := core.MakeSingleTargetEncounter(0)
	encounter.Duration, encounter.DurationVariation = 120, 0
	raid := core.SinglePlayerRaidProto(player, nil, nil, nil)
	if len(incomingHealth) == 1 && incomingHealth[0] {
		player.HealingModel = &proto.HealingModel{BurstWindow: 6}
		raid.Tanks = []*proto.UnitReference{{Type: proto.UnitReference_Player, Index: 0}}
	}
	sim := core.NewSim(&proto.RaidSimRequest{Raid: raid, Encounter: encounter,
		SimOptions: &proto.SimOptions{Iterations: 1, RandomSeed: 1337, Ruleset: ruleset}}, simsignals.Signals{})
	sim.Options.Interactive = true
	sim.Reset()
	sim.PrePull()
	wearer := sim.Raid.Parties[0].Players[0].(priest.PriestAgent).GetPriest()
	if !googleProto.Equal(wearer.Talents, talents) {
		t.Fatal("Native Priest talent serialization changed", wearer.Talents, talents)
	}
	return sim, wearer
}

func virtuousCombatIdentity(t *testing.T, setID int32) func() {
	t.Helper()
	old := map[int32]core.Item{}
	for id := int32(22078); id <= 22085; id++ {
		item, exists := core.ItemsByID[id]
		if !exists || item.SetID != 514 {
			t.Fatal("Missing base Virtuous item", id)
		}
		old[id] = item
		item.SetID, item.SetName = setID, ""
		core.ItemsByID[id] = item
	}
	restore := func() {
		for id, item := range old {
			core.ItemsByID[id] = item
		}
	}
	t.Cleanup(restore)
	return restore
}

func TestKFCDpsVirtuousCatalog(t *testing.T) {
	if len(core.ItemsByID) != 2743 {
		t.Fatal("Expected the complete current embedded catalog", len(core.ItemsByID))
	}
	for id := int32(511); id <= 519; id++ {
		count := 0
		for _, item := range core.ItemsByID {
			if item.SetID == id {
				count++
			}
		}
		if count != 8 {
			t.Fatal("Base upgrade set is incomplete", id, count)
		}
	}
}

func TestKFCDpsVirtuousThresholds(t *testing.T) {
	for _, role := range []string{"shadow", "smite"} {
		for _, kings := range []bool{false, true} {
			for pieces := 0; pieces <= 8; pieces++ {
				t.Run(fmt.Sprintf("%s/kings-%v/pieces-%d", role, kings, pieces), func(t *testing.T) {
					restore := virtuousCombatIdentity(t, 0)
					_, baseline := virtuousCombatFixture(t, role, pieces, kings, &proto.PriestTalents{}, 0, proto.Ruleset_RulesetForever)
					restore()
					_, wearer := virtuousCombatFixture(t, role, pieces, kings, &proto.PriestTalents{}, 0, proto.Ruleset_RulesetForever)
					counts := map[int32]int{}
					for _, bonus := range wearer.GetActiveSetBonuses() {
						if bonus.Name == "Vestments of the Virtuous" {
							counts[bonus.NumPieces]++
						}
					}
					for _, threshold := range []int32{2, 4, 6, 8} {
						want := 0
						if pieces >= int(threshold) {
							want = 1
						}
						if counts[threshold] != want || !core.ForeverEquipmentBonusSupported(514, threshold) {
							t.Fatal("Missing or duplicated base Virtuous threshold", pieces, counts)
						}
					}
					if counts[3] != 0 || counts[5] != 0 {
						t.Fatal("Alternate thresholds leaked into base 514")
					}
					for stat := stats.Stat(0); stat < stats.Len; stat++ {
						want := 0.0
						if pieces >= 2 && stat >= stats.ArcaneResistance && stat <= stats.ShadowResistance {
							want = 8
						}
						if pieces >= 6 && stat == stats.SpellPower {
							want = 23
						}
						if pieces >= 8 && (stat == stats.BonusArmor || stat == stats.Armor) {
							want = 200
						}
						virtuousCombatNear(t, wearer.GetStat(stat)-baseline.GetStat(stat), want)
					}
					if (wearer.GetAura("Virtuous incoming shield reference") != nil) != (pieces >= 4) {
						t.Fatal("Wrong incoming shield registration boundary")
					}
				})
			}
		}
	}
}

func TestKFCDpsVirtuousShieldFamily(t *testing.T) {
	for _, role := range []string{"shadow", "smite"} {
		for rank, multiplier := range []float64{1, 1.07, 1.14, 1.2} {
			for _, power := range []float64{0, 1000} {
				t.Run(fmt.Sprintf("%s/rank-%d/power-%g", role, rank, power), func(t *testing.T) {
					talents := &proto.PriestTalents{ImprovedPowerWordShield: int32(rank), SoulWarding: true, MentalAgility: 3, SpiritualHealing: 5, TwinDisciplines: 5, Shadowform: role == "shadow"}
					sim, wearer := virtuousCombatFixture(t, role, 4, false, talents, power, proto.Ruleset_RulesetForever)
					if wearer.ShadowformAura != nil {
						wearer.ShadowformAura.Activate(sim)
					}
					shield, trigger := wearer.GetSpell(core.ActionID{SpellID: 27779}), wearer.GetAura("Virtuous incoming shield reference")
					if shield == nil || trigger == nil {
						t.Fatal("Native DPS actor did not register the shield")
					}
					trigger.Deactivate(sim)
					mana := wearer.CurrentMana()
					if !shield.Cast(sim, &wearer.Unit) {
						t.Fatal("Free passive shield failed, including under Shadowform")
					}
					virtuousCombatNear(t, shield.SelfShield().RemainingAbsorb(), 488*multiplier)
					virtuousCombatNear(t, wearer.CurrentMana(), mana)
					if shield.CD.Duration != 0 || trigger.Icd.Duration != 60*time.Second || shield.DefaultCast.GCD != 0 || shield.DefaultCast.CastTime != 0 || shield.Cost != nil {
						t.Fatal("Talent modifiers changed free passive cast or independent proc ICD")
					}
					if aura := wearer.GetAura("Weakened Soul"); aura != nil && aura.IsActive() {
						t.Fatal("Item shield applied Weakened Soul")
					}
				})
			}
		}
	}
}

func TestKFCDpsVirtuousIncomingReference(t *testing.T) {
	for _, event := range []struct {
		name     string
		mask     core.ProcMask
		outcome  core.HitOutcome
		friendly bool
		allowed  bool
	}{
		{"melee", core.ProcMaskMeleeMHAuto, core.OutcomeHit, false, true},
		{"offhand", core.ProcMaskMeleeOHAuto, core.OutcomeCrit, false, true},
		{"special", core.ProcMaskMeleeMHSpecial, core.OutcomeHit, false, true},
		{"ranged", core.ProcMaskRangedAuto, core.OutcomeHit, false, true},
		{"spell", core.ProcMaskSpellDamage, core.OutcomeHit, false, true},
		{"miss", core.ProcMaskSpellDamage, core.OutcomeMiss, false, false},
		{"dodge", core.ProcMaskMeleeMHAuto, core.OutcomeDodge, false, false},
		{"healing", core.ProcMaskSpellHealing, core.OutcomeHit, false, false},
		{"unclassified", core.ProcMaskEmpty, core.OutcomeHit, false, false},
		{"damage-proc", core.ProcMaskSpellDamageProc, core.OutcomeHit, false, false},
		{"friendly", core.ProcMaskSpellDamage, core.OutcomeHit, true, false},
	} {
		t.Run(event.name, func(t *testing.T) {
			sim, wearer := virtuousCombatFixture(t, "shadow", 4, false, &proto.PriestTalents{}, 0, proto.Ruleset_RulesetForever)
			trigger := wearer.GetAura("Virtuous incoming shield reference")
			unit := sim.Encounter.TargetUnits[0]
			if event.friendly {
				unit = &wearer.Unit
			}
			spell := &core.Spell{Unit: unit, ProcMask: event.mask}
			result := &core.SpellResult{Target: &wearer.Unit, Outcome: event.outcome, Damage: 1}
			count := 0
			for attempt := 0; attempt < 10000; attempt++ {
				trigger.Icd.Timer.Set(0)
				trigger.OnSpellHitTaken(trigger, sim, spell, result)
				if !trigger.Icd.IsReady(sim) {
					count++
				}
			}
			if event.allowed && (count < 140 || count > 270) || !event.allowed && count != 0 {
				t.Fatal("Unexpected declared incoming mask/chance", event.name, count)
			}
			fmt.Printf("KFC_DPS_VIRTUOUS_PROC %s %d\n", event.name, count)
		})
	}
}

func TestKFCDpsVirtuousAbsorptionAndReset(t *testing.T) {
	for _, role := range []string{"shadow", "smite"} {
		t.Run(role, func(t *testing.T) {
			sim, wearer := virtuousCombatFixture(t, role, 8, false, &proto.PriestTalents{ImprovedPowerWordShield: 3}, 1000, proto.Ruleset_RulesetForever, true)
			trigger, shield := wearer.GetAura("Virtuous incoming shield reference"), wearer.GetSpell(core.ActionID{SpellID: 27779})
			trigger.Deactivate(sim)
			if !shield.Cast(sim, &wearer.Unit) {
				t.Fatal("Passive item shield failed")
			}
			incoming := sim.Encounter.TargetUnits[0].RegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: 1, Tag: 514}, SpellSchool: core.SpellSchoolHoly, ProcMask: core.ProcMaskSpellDamage, DamageMultiplier: 1})
			damage := func(amount float64) {
				result := incoming.NewResult(&wearer.Unit)
				result.Damage, result.Outcome = amount, core.OutcomeHit
				incoming.DealDamage(sim, result)
			}
			health := wearer.CurrentHealth()
			damage(100)
			virtuousCombatNear(t, wearer.CurrentHealth(), health)
			virtuousCombatNear(t, shield.SelfShield().RemainingAbsorb(), 488*1.2-100)
			virtuousCombatNear(t, shield.SpellMetrics[wearer.UnitIndex].TotalAbsorbedShielding, 100)
			if shield.SelfShield().ExpiresAt() != 30*time.Second {
				t.Fatal("Wrong captured shield duration")
			}
			sim.CurrentTime = 30 * time.Second
			damage(100)
			virtuousCombatNear(t, wearer.CurrentHealth(), health-100)
			if shield.SelfShield().IsActive() || shield.SelfShield().RemainingAbsorb() != 0 {
				t.Fatal("Expired shield absorbed a later hit")
			}
			sim.Cleanup()
			sim.Reset()
			sim.PrePull()
			if !trigger.IsActive() || !trigger.Icd.IsReady(sim) || shield.SelfShield().IsActive() || shield.SelfShield().RemainingAbsorb() != 0 {
				t.Fatal("Shield, proc ICD or pool leaked across reset")
			}
		})
	}
}

func TestKFCDpsVirtuousClassicAndAlternateIsolation(t *testing.T) {
	for _, role := range []string{"shadow", "smite"} {
		t.Run(role, func(t *testing.T) {
			_, classic := virtuousCombatFixture(t, role, 8, false, &proto.PriestTalents{}, 0, proto.Ruleset_RulesetClassic)
			if classic.GetAura("Virtuous incoming shield reference") != nil {
				t.Fatal("Forever item proc leaked into Classic")
			}
			restore := virtuousCombatIdentity(t, 1675)
			defer restore()
			_, alternate := virtuousCombatFixture(t, role, 8, false, &proto.PriestTalents{}, 0, proto.Ruleset_RulesetForever)
			if alternate.GetAura("Virtuous incoming shield reference") != nil {
				t.Fatal("Alternate set identity activated base 514")
			}
		})
	}
}

func TestKFCDpsVirtuousProviderRejectsInvalidTalents(t *testing.T) {
	for _, provider := range []*priest.Priest{nil, {}, {Talents: &proto.PriestTalents{ImprovedPowerWordShield: 4}}} {
		func() {
			defer func() {
				if recover() == nil {
					t.Fatal("Missing or invalid native talents received a default shield multiplier")
				}
			}()
			provider.KFCVirtuousShieldMultiplier()
		}()
	}
}
