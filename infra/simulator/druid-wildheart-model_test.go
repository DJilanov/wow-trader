package restoration

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
	"github.com/wowsims/classic/sim/druid"
)

var kfcWildheartIDs = []int32{16706, 16714, 16715, 16716, 16717, 16718, 16719, 16720}

func kfcWildheartRequest(t *testing.T, count int) *proto.RaidSimRequest {
	t.Helper()
	request := kfcFeralheartRequest(0)
	player := request.Raid.Parties[0].Players[0]
	slots := map[proto.ItemType]int{1: 0, 3: 2, 5: 4, 6: 5, 7: 6, 8: 7, 9: 8, 10: 9}
	for _, id := range kfcWildheartIDs[:count] {
		item, exists := core.ItemsByID[id]
		slot, correctType := slots[item.Type]
		if !exists || !correctType || item.SetID != 185 {
			t.Fatal("Missing exact compiled Wildheart item")
		}
		player.Equipment.Items[slot] = &proto.ItemSpec{Id: id}
	}
	fields := map[string]int32{"swiftmend": 1, "wildGrowth": 1}
	trees := []string{}
	for _, tree := range druid.ForeverTalentTreeFields {
		var value strings.Builder
		for _, field := range tree {
			value.WriteString(strconv.Itoa(int(fields[field])))
		}
		trees = append(trees, strings.TrimRight(value.String(), "0"))
	}
	player.TalentsString = strings.TrimRight(strings.Join(trees, "-"), "-")
	request.Raid.TargetDummies = 4
	return request
}

func kfcWildheartFixture(t *testing.T, count int) (*core.Simulation, *RestorationDruid) {
	t.Helper()
	sim := core.NewSim(kfcWildheartRequest(t, count), simsignals.CreateSignals())
	sim.Reset()
	return sim, sim.Raid.Parties[0].Players[0].(*RestorationDruid)
}

func kfcWildheartPolicy(chance float64, events string) KFCDruidHealingEquipmentPolicy {
	return KFCDruidHealingEquipmentPolicy{Schema: "kfc-druid-healing-equipment-policy.v1", ID: fmt.Sprintf("wildheart-%g-%s", chance, events), WildheartManaProcChance: &chance, WildheartHealingEvents: events}
}

func kfcWildheartConfigure(t *testing.T, healer *RestorationDruid, chance float64, events string) {
	t.Helper()
	if err := healer.ConfigureKFCDruidHealingEquipment(kfcWildheartPolicy(chance, events)); err != nil {
		t.Fatal(err)
	}
}

func kfcWildheartManaMetrics(character *core.Character) (int32, float64, float64) {
	var events int32
	gain, actual := 0.0, 0.0
	for _, metric := range character.Metrics.ToProto().Resources {
		if metric.Id.GetSpellId() == 27782 && metric.Type == proto.ResourceType_ResourceTypeMana && metric.Gain > 0 {
			events += metric.Events
			gain += metric.Gain
			actual += metric.ActualGain
		}
	}
	return events, gain, actual
}

func TestKFCDruidWildheartExactThresholdDispatch(t *testing.T) {
	_, bare := kfcWildheartFixture(t, 0)
	output := []float64{}
	for count := 1; count <= 8; count++ {
		_, healer := kfcWildheartFixture(t, count)
		var itemStats stats.Stats
		for _, id := range kfcWildheartIDs[:count] {
			itemStats = itemStats.Add(core.ItemsByID[id].Stats)
		}
		healing, mp5 := 0.0, 0.0
		if count >= 3 {
			healing = 18
		}
		if count >= 6 {
			mp5 = 8
		}
		kfcDruidNear(t, healer.GetStat(stats.HealingPower)-bare.GetStat(stats.HealingPower)-itemStats[stats.HealingPower], healing)
		kfcDruidNear(t, healer.GetStat(stats.MP5)-bare.GetStat(stats.MP5)-itemStats[stats.MP5], mp5)
		if (healer.GetAura("Nature's Bounty (Mana)") != nil) != (count >= 5) {
			t.Fatal("Five-piece proc missing or granted early")
		}
		output = append(output, float64(count), healing, mp5)
	}
	if !core.ForeverEquipmentBonusSupported(185, 5) || core.ForeverEquipmentBonusSupported(185, 4) {
		t.Fatal("Wrong Wildheart threshold marked implemented")
	}
	_, healer := kfcWildheartFixture(t, 5)
	for slot, item := range healer.Equipment {
		if item.SetID == 185 {
			item.SetID = 1667
			healer.Equipment[slot] = item
			break
		}
	}
	for _, bonus := range healer.GetActiveSetBonuses() {
		if bonus.Name == "Wildheart Raiment" && bonus.NumPieces == 5 {
			t.Fatal("Different set identities supplied a fifth piece")
		}
	}
	kfcDruidAdvancedResult("WILDHEART_THRESHOLDS", output)
}

func TestKFCDruidWildheartProbabilitiesAndExactMana(t *testing.T) {
	output := []float64{}
	for _, chance := range []float64{0, .02, .05, .1, 1} {
		sim, healer := kfcWildheartFixture(t, 5)
		oracle, _ := kfcWildheartFixture(t, 4)
		kfcWildheartConfigure(t, healer, chance, "completed-casts")
		healer.SpendMana(sim, 1000, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 90}))
		aura := healer.GetAura("Nature's Bounty (Mana)")
		spell := healer.GetSpell(core.ActionID{SpellID: 5185})
		want := 0
		for i := 0; i < 1000; i++ {
			before := healer.CurrentMana()
			aura.OnCastComplete(aura, sim, spell)
			delta := healer.CurrentMana() - before
			if chance > 0 && oracle.Proc(chance, "Nature's Bounty (Mana)") {
				want++
				kfcDruidNear(t, delta, 200)
			} else {
				kfcDruidNear(t, delta, 0)
			}
			healer.SpendMana(sim, delta, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 91}))
		}
		events, gain, actual := kfcWildheartManaMetrics(healer.GetCharacter())
		if events != int32(want) {
			t.Fatal("Proc probability or opportunity count changed")
		}
		kfcDruidNear(t, gain, float64(want)*200)
		kfcDruidNear(t, actual, gain)
		output = append(output, chance, float64(events), actual)
	}
	kfcDruidAdvancedResult("WILDHEART_RATES", output)
}

func TestKFCDruidWildheartRealCastsAndPeriodicExclusion(t *testing.T) {
	output := []float64{}
	for _, mode := range []string{"completed-casts", "direct-heals"} {
		for _, id := range []int32{774, 8936, 740, 408120} {
			sim, healer := kfcWildheartFixture(t, 5)
			kfcWildheartConfigure(t, healer, 1, mode)
			healer.SpendMana(sim, 3000, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 90}))
			kfcDruidWound(sim)
			target := &sim.Raid.GetFirstTargetDummy().Unit
			if id == 740 {
				target = &healer.Unit
			}
			spell := healer.GetSpell(core.ActionID{SpellID: id})
			if !spell.Cast(sim, target) {
				t.Fatal("Equipped healing cast rejected")
			}
			kfcDruidAdvance(t, sim, 12*time.Second)
			want := int32(1)
			if mode == "direct-heals" && id != 8936 {
				want = 0
			}
			events, gain, _ := kfcWildheartManaMetrics(healer.GetCharacter())
			if events != want || gain != float64(want)*200 {
				t.Fatalf("%s rank %d had %d mana opportunities, want %d", mode, id, events, want)
			}
			output = append(output, float64(id), float64(events), gain)
		}
	}
	kfcDruidAdvancedResult("WILDHEART_CASTS", output)
}

func TestKFCDruidWildheartPolicyValidationAndOwnership(t *testing.T) {
	for _, kind := range []string{"missing", "negative", "large", "nan", "infinite", "schema", "events", "identifier"} {
		_, healer := kfcWildheartFixture(t, 5)
		policy := kfcWildheartPolicy(.02, "completed-casts")
		switch kind {
		case "missing":
			policy.WildheartManaProcChance = nil
		case "negative":
			*policy.WildheartManaProcChance = -.01
		case "large":
			*policy.WildheartManaProcChance = 1.01
		case "nan":
			*policy.WildheartManaProcChance = math.NaN()
		case "infinite":
			*policy.WildheartManaProcChance = math.Inf(1)
		case "schema":
			policy.Schema = "unversioned"
		case "events":
			policy.WildheartHealingEvents = "every-tick"
		case "identifier":
			policy.ID = ""
		}
		if healer.ConfigureKFCDruidHealingEquipment(policy) == nil {
			t.Fatalf("Invalid equipment policy accepted: %s", kind)
		}
	}
	_, healer := kfcWildheartFixture(t, 5)
	policy := kfcWildheartPolicy(1, "completed-casts")
	if err := healer.ConfigureKFCDruidHealingEquipment(policy); err != nil {
		t.Fatal(err)
	}
	*policy.WildheartManaProcChance = 0
	kfcDruidNear(t, healer.KFCWildheartManaProcChance(), 1)
	if healer.ConfigureKFCDruidHealingEquipment(policy) == nil {
		t.Fatal("Equipment policy changed twice")
	}
	sim, healer := kfcWildheartFixture(t, 5)
	if !healer.GetSpell(core.ActionID{SpellID: 774}).Cast(sim, &healer.Unit) || healer.ConfigureKFCDruidHealingEquipment(policy) == nil {
		t.Fatal("Equipment policy changed after casting")
	}
}

func TestKFCDruidWildheartManaCapDeathAndPassiveExclusion(t *testing.T) {
	sim, healer := kfcWildheartFixture(t, 5)
	kfcWildheartConfigure(t, healer, 1, "direct-heals")
	aura := healer.GetAura("Nature's Bounty (Mana)")
	spell := healer.GetSpell(core.ActionID{SpellID: 5185})
	result := spell.NewResult(&healer.Unit)
	result.Outcome = core.OutcomeHit
	result.DirectDamageOrHealing = true
	aura.OnHealDealt(aura, sim, spell, result)
	events, gain, actual := kfcWildheartManaMetrics(healer.GetCharacter())
	if events != 1 || gain != 200 || actual != 0 {
		t.Fatal("Mana cap accounting is incorrect")
	}
	healer.SpendMana(sim, 1000, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 90}))
	before := healer.CurrentMana()
	result.DirectDamageOrHealing = false
	aura.OnHealDealt(aura, sim, spell, result)
	result.DirectDamageOrHealing = true
	previous := spell.Flags
	spell.Flags |= core.SpellFlagPassiveSpell
	aura.OnHealDealt(aura, sim, spell, result)
	aura.OnCastComplete(aura, sim, spell)
	spell.Flags = previous
	result.Outcome = core.OutcomeMiss
	aura.OnHealDealt(aura, sim, spell, result)
	result.Outcome = core.OutcomeHit
	healer.RemoveHealth(sim, healer.CurrentHealth())
	aura.OnHealDealt(aura, sim, spell, result)
	spell.DisposeResult(result)
	kfcDruidNear(t, healer.CurrentMana(), before)
}

func TestKFCDruidWildheartResetAndExactSetPolicyScope(t *testing.T) {
	sim, healer := kfcWildheartFixture(t, 5)
	kfcWildheartConfigure(t, healer, 0, "direct-heals")
	aura := healer.GetAura("Nature's Bounty (Mana)")
	sim.Cleanup()
	sim.Reset()
	if !aura.IsActive() || healer.KFCWildheartManaProcChance() != 0 || !healer.KFCWildheartManaDirectHealingEvents() {
		t.Fatal("Configured equipment research did not survive reset")
	}
	_, bare := kfcWildheartFixture(t, 4)
	kfcWildheartConfigure(t, bare, 1, "direct-heals")
	if bare.GetAura("Nature's Bounty (Mana)") != nil || bare.KFCWildheartManaProcChance() != .02 || bare.KFCWildheartManaDirectHealingEvents() {
		t.Fatal("Wildheart policy leaked to another set identity or missing threshold")
	}
	kfcDruidAdvancedResult("WILDHEART_RESET", []float64{healer.KFCWildheartManaProcChance(), bare.KFCWildheartManaProcChance()})
}

func TestKFCDruidWildheartEquippedWorkloadAndPolicyEcho(t *testing.T) {
	policies := []*KFCDruidHealingEquipmentPolicy{nil}
	for _, chance := range []float64{0, .02, .05, .1, 1} {
		policy := kfcWildheartPolicy(chance, "completed-casts")
		policies = append(policies, &policy)
	}
	direct := kfcWildheartPolicy(.02, "direct-heals")
	policies = append(policies, &direct)
	for index, policy := range policies {
		request, frame := kfcDruidWorkloadControl()
		player := request.Raid.Parties[0].Players[0]
		player.BonusStats = nil
		player.Equipment = kfcWildheartRequest(t, 8).Raid.Parties[0].Players[0].Equipment
		for slot, id := range kfcDruidEquippedControlIds {
			if player.Equipment.Items[slot].Id == 0 {
				player.Equipment.Items[slot] = &proto.ItemSpec{Id: id}
			}
		}
		player.Equipment.Items[16].Id = 22398
		frame.EquipmentPolicy = policy
		id := "wildheart-equipped-policy-" + strconv.Itoa(index)
		payload := kfcDruidControlPayload(t, request, frame, id, false)
		reply := RunKFCDruidHealingJob(context.Background(), payload)
		if reply.Status != "complete" || reply.Result == nil || reply.Result.EquipmentPolicy == nil || reply.Result.SurvivalRate != 1 {
			t.Fatalf("Equipped Wildheart job failed: %+v", reply)
		}
		if policy == nil {
			if reply.Result.EquipmentPolicy.ID != "wildheart-reference" {
				t.Fatal("Implicit reference policy was not disclosed")
			}
		} else if *reply.Result.EquipmentPolicy.WildheartManaProcChance != *policy.WildheartManaProcChance || reply.Result.EquipmentPolicy.WildheartHealingEvents != policy.WildheartHealingEvents {
			t.Fatal("Equipment policy was not echoed")
		}
		kfcDruidAdvancedResult("WILDHEART_EQUIPPED_REQUEST", json.RawMessage(payload))
		kfcDruidAdvancedResult("WILDHEART_EQUIPPED_RESULT", reply)
	}
}

func TestKFCDruidWildheartNonHealingAgentKeepsReference(t *testing.T) {
	request := kfcWildheartRequest(t, 5)
	player := request.Raid.Parties[0].Players[0]
	player.TalentsString = ""
	player.Spec = &proto.Player_FeralDruid{FeralDruid: &proto.FeralDruid{Options: &proto.FeralDruid_Options{}}}
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	character := sim.Raid.Parties[0].Players[0].GetCharacter()
	character.SpendMana(sim, 1000, character.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 90}))
	aura := character.GetAura("Nature's Bounty (Mana)")
	if aura == nil {
		t.Fatal("Exact Wildheart dispatch missing on the non-healing agent")
	}
	oracle, _ := kfcWildheartFixture(t, 4)
	spell := &core.Spell{ProcMask: core.ProcMaskSpellHealing}
	want := 0
	for i := 0; i < 1000; i++ {
		before := character.CurrentMana()
		aura.OnCastComplete(aura, sim, spell)
		if oracle.Proc(.02, "Nature's Bounty (Mana)") {
			want++
		}
		character.SpendMana(sim, character.CurrentMana()-before, character.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 91}))
	}
	events, gain, _ := kfcWildheartManaMetrics(character)
	if events != int32(want) || gain != float64(want)*200 {
		t.Fatal("Shared fallback changed the inherited reference probability")
	}
	kfcDruidAdvancedResult("WILDHEART_FERAL_REFERENCE", []float64{float64(events), gain})
}
