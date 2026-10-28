package healing

import (
	"fmt"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
	googleProto "google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
)

func virtuousModelFixture(t *testing.T, pieces int, talents *proto.PriestTalents, power float64, ruleset proto.Ruleset) (*core.Simulation, *HealingPriest) {
	t.Helper()
	request := kfcWorkloadRequest(0, 1, 120)
	player := request.Raid.Parties[0].Players[0]
	player.Name = "Virtuous full-dispatch control"
	player.BonusStats = &proto.UnitStats{Stats: stats.Stats{stats.SpellPower: power, stats.Mana: 10000}.ToFloatArray()}
	for index := 0; index < pieces; index++ {
		player.Equipment.Items = append(player.Equipment.Items, &proto.ItemSpec{Id: int32(22078 + index)})
	}
	var allocation strings.Builder
	message := talents.ProtoReflect()
	for index := 0; index < message.Descriptor().Fields().Len(); index++ {
		if index == 18 || index == 35 {
			allocation.WriteByte('-')
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
		allocation.WriteByte(byte('0' + value))
	}
	player.TalentsString = allocation.String()
	request.SimOptions.Ruleset = ruleset
	request.SimOptions.IsTest, request.SimOptions.Interactive = true, true
	sim := core.NewSim(request, simsignals.CreateSignals())
	healer := sim.Raid.Parties[0].Players[0].(*HealingPriest)
	if !googleProto.Equal(healer.Talents, talents) {
		t.Fatal("Talents did not round-trip")
	}
	sim.Reset()
	return sim, healer
}

func TestKFCVirtuousModelEmbeddedCatalog(t *testing.T) {
	if len(core.ItemsByID) != 2688 {
		t.Fatal("Actual embedded catalog does not include all reviewed items", len(core.ItemsByID))
	}
	for id := int32(22078); id <= 22085; id++ {
		item, ok := core.ItemsByID[id]
		if !ok || item.SetID != 514 || item.Name == "" {
			t.Fatal("Missing current Virtuous item", id)
		}
	}
}

func TestKFCVirtuousModelCompleteDispatch(t *testing.T) {
	_, baseline := virtuousModelFixture(t, 0, &proto.PriestTalents{}, 0, proto.Ruleset_RulesetForever)
	for pieces := 0; pieces <= 8; pieces++ {
		t.Run(fmt.Sprint(pieces), func(t *testing.T) {
			_, healer := virtuousModelFixture(t, pieces, &proto.PriestTalents{}, 0, proto.Ruleset_RulesetForever)
			var actual, expected []int32
			for _, bonus := range healer.GetActiveSetBonuses() {
				if bonus.Name == "Vestments of the Virtuous" {
					actual = append(actual, bonus.NumPieces)
				}
			}
			for _, threshold := range []int32{2, 4, 6, 8} {
				if pieces >= int(threshold) {
					expected = append(expected, threshold)
				}
			}
			if !reflect.DeepEqual(actual, expected) {
				t.Fatal("Incorrect or duplicated set thresholds", actual, expected)
			}
			gear := healer.Equipment.Stats()
			resistance, power, armor := 0.0, 0.0, 0.0
			if pieces >= 2 {
				resistance = 8
			}
			if pieces >= 6 {
				power = 23
			}
			if pieces >= 8 {
				armor = 200
			}
			for _, stat := range []stats.Stat{stats.ArcaneResistance, stats.FireResistance, stats.FrostResistance, stats.NatureResistance, stats.ShadowResistance} {
				kfcPriestNear(t, healer.GetStat(stat)-baseline.GetStat(stat)-gear[stat], resistance)
			}
			kfcPriestNear(t, healer.GetStat(stats.SpellPower)-baseline.GetStat(stats.SpellPower)-gear[stats.SpellPower], power)
			kfcPriestNear(t, healer.GetStat(stats.HealingPower)-baseline.GetStat(stats.HealingPower)-gear[stats.HealingPower], 0)
			kfcPriestNear(t, healer.GetStat(stats.BonusArmor)-baseline.GetStat(stats.BonusArmor)-gear[stats.BonusArmor], armor)
			shield := healer.GetSpell(core.ActionID{SpellID: 27779})
			if (shield != nil) != (pieces >= 4) {
				t.Fatal("Shield threshold did not use full set dispatch")
			}
		})
	}
}

func TestKFCVirtuousModelExactIDAndClassicIsolation(t *testing.T) {
	_, healer := virtuousModelFixture(t, 0, &proto.PriestTalents{}, 0, proto.Ruleset_RulesetForever)
	for _, setID := range []int32{0, 182, 513, 1675} {
		var equipment core.Equipment
		for index := 0; index < 8; index++ {
			equipment[index] = core.Item{ID: int32(22078 + index), SetID: setID, SetName: "Vestments of the Virtuous"}
		}
		healer.Equipment = equipment
		for _, bonus := range healer.GetActiveSetBonuses() {
			if bonus.Name == "Vestments of the Virtuous" {
				t.Fatal("Same name crossed base-ID dispatch", setID, bonus.NumPieces)
			}
		}
	}
	// The healing prototype rejects Classic initialization; exercise the actual
	// core dispatcher with a Classic environment without changing that guard.
	classic := *healer.GetCharacter()
	classicEnvironment := *healer.Env
	classicEnvironment.Ruleset = proto.Ruleset_RulesetClassic
	classic.Env = &classicEnvironment
	classic.Equipment = virtuousReferenceEquipment(8, 514)
	for _, bonus := range classic.GetActiveSetBonuses() {
		if bonus.Name == "Vestments of the Virtuous" {
			t.Fatal("Forever set changed Classic dispatch")
		}
	}
}

func TestKFCVirtuousModelPriestTalentFamily(t *testing.T) {
	for rank, multiplier := range []float64{1, 1.07, 1.14, 1.2} {
		for _, power := range []float64{0, 1000} {
			t.Run(fmt.Sprintf("%d/%g", rank, power), func(t *testing.T) {
				sim, healer := virtuousModelFixture(t, 4, &proto.PriestTalents{ImprovedPowerWordShield: int32(rank), SoulWarding: true, MentalAgility: 3, SpiritualHealing: 3, TwinDisciplines: 5}, power, proto.Ruleset_RulesetForever)
				shield := healer.GetSpell(core.ActionID{SpellID: 27779})
				trigger := healer.GetAura("Virtuous incoming shield reference")
				if shield == nil || trigger == nil {
					t.Fatal("Full dispatcher did not install the shield")
				}
				trigger.Deactivate(sim)
				mana := healer.CurrentMana()
				if !shield.Cast(sim, &healer.Unit) {
					t.Fatal("Set shield could not apply")
				}
				kfcPriestNear(t, shield.SelfShield().RemainingAbsorb(), 488*multiplier)
				kfcPriestNear(t, healer.CurrentMana(), mana)
				if shield.CD.Duration != 0 || trigger.Icd.Duration != 60*time.Second {
					t.Fatal("Soul Warding modified item ICD")
				}
				if healer.WeakenedSouls.Get(&healer.Unit).IsActive() {
					t.Fatal("Set shield incorrectly applied Weakened Soul")
				}
			})
		}
	}
}

func TestKFCVirtuousModelIncomingEligibility(t *testing.T) {
	for _, control := range []struct {
		mask    core.ProcMask
		outcome core.HitOutcome
		allowed bool
	}{
		{core.ProcMaskMeleeMHAuto, core.OutcomeHit, true}, {core.ProcMaskMeleeOHAuto, core.OutcomeCrit, true},
		{core.ProcMaskMeleeMHSpecial, core.OutcomeHit, true}, {core.ProcMaskRangedAuto, core.OutcomeHit, true},
		{core.ProcMaskRangedSpecial, core.OutcomeHit, true}, {core.ProcMaskSpellDamage, core.OutcomeHit, true},
		{core.ProcMaskSpellDamage, core.OutcomeMiss, false}, {core.ProcMaskMeleeMHAuto, core.OutcomeDodge, false},
		{core.ProcMaskSpellHealing, core.OutcomeHit, false}, {core.ProcMaskEmpty, core.OutcomeHit, false},
		{core.ProcMaskSpellDamageProc, core.OutcomeHit, false},
	} {
		if core.ForeverVirtuousIncomingReference(&core.Spell{ProcMask: control.mask}, &core.SpellResult{Outcome: control.outcome}) != control.allowed {
			t.Fatal("Incoming reference drifted", control)
		}
	}
	if core.ForeverVirtuousIncomingReference(nil, &core.SpellResult{}) || core.ForeverVirtuousIncomingReference(&core.Spell{}, nil) {
		t.Fatal("Nil event was eligible")
	}
}

func TestKFCVirtuousModelIndependentPowerWordShield(t *testing.T) {
	for _, virtuousFirst := range []bool{true, false} {
		t.Run(fmt.Sprint(virtuousFirst), func(t *testing.T) {
			sim, healer := virtuousModelFixture(t, 4, &proto.PriestTalents{ImprovedPowerWordShield: 3}, 0, proto.Ruleset_RulesetForever)
			setShield := healer.GetSpell(core.ActionID{SpellID: 27779})
			healer.GetAura("Virtuous incoming shield reference").Deactivate(sim)
			castVirtuous := func() {
				if !setShield.Cast(sim, &healer.Unit) {
					t.Fatal("Set shield failed")
				}
			}
			castPriest := func() {
				if !healer.PowerWordShield[10].Cast(sim, &healer.Unit) {
					t.Fatal("Power Word: Shield failed")
				}
			}
			if virtuousFirst {
				castVirtuous()
				castPriest()
			} else {
				castPriest()
				castVirtuous()
			}
			pws := healer.PowerWordShield[10].Shield(&healer.Unit)
			setBefore, pwsBefore := setShield.SelfShield().RemainingAbsorb(), pws.RemainingAbsorb()
			if !setShield.SelfShield().IsActive() || !pws.IsActive() {
				t.Fatal("Distinct shield effects replaced each other")
			}
			incoming := sim.Encounter.TargetUnits[0].RegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: 1, Tag: 514}, SpellSchool: core.SpellSchoolHoly, ProcMask: core.ProcMaskSpellDamage, DamageMultiplier: 1})
			health := healer.CurrentHealth()
			virtuousReferenceDamage(sim, incoming, &healer.Unit, 600)
			kfcPriestNear(t, healer.CurrentHealth(), health)
			if virtuousFirst {
				kfcPriestNear(t, setShield.SelfShield().RemainingAbsorb(), 0)
				kfcPriestNear(t, pws.RemainingAbsorb(), pwsBefore-(600-setBefore))
			} else {
				kfcPriestNear(t, pws.RemainingAbsorb(), pwsBefore-600)
				kfcPriestNear(t, setShield.SelfShield().RemainingAbsorb(), setBefore)
			}
		})
	}
}
