package restoration

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"testing"
	"time"

	_ "github.com/wowsims/classic/sim/common"
	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
)

func kfcDruidItemRequest(ids ...int32) *proto.RaidSimRequest {
	request := kfcFeralheartRequest(0)
	request.Encounter.Duration = 900
	player := request.Raid.Parties[0].Players[0]
	player.BonusStats = &proto.UnitStats{Stats: stats.Stats{stats.Intellect: 200, stats.Mana: 10000}.ToFloatArray()}
	for index, id := range ids {
		player.Equipment.Items[12+index] = &proto.ItemSpec{Id: id}
	}
	return request
}

func kfcDruidItemFixture(t *testing.T, ids ...int32) (*core.Simulation, *RestorationDruid) {
	t.Helper()
	sim := core.NewSim(kfcDruidItemRequest(ids...), simsignals.CreateSignals())
	sim.Reset()
	healer := sim.Raid.Parties[0].Players[0].(*RestorationDruid)
	healer.PseudoStats.SpiritRegenMultiplier = 0
	healer.AddStatDynamic(sim, stats.MP5, -healer.GetStat(stats.MP5))
	healer.UpdateManaRegenRates()
	return sim, healer
}

func kfcDruidItemPolicy(chance float64, events string) KFCDruidItemEffectsPolicy {
	return KFCDruidItemEffectsPolicy{Schema: "kfc-druid-item-effects-policy.v1", ID: fmt.Sprintf("heart-%g-%s", chance, events), DormantHeartProcChance: &chance, DormantHeartHealingEvents: events}
}

func kfcDruidItemConfigure(t *testing.T, healer *RestorationDruid, chance float64, events string) {
	t.Helper()
	if err := healer.ConfigureKFCDruidItemEffects(kfcDruidItemPolicy(chance, events)); err != nil {
		t.Fatal(err)
	}
}

func kfcDruidItemMana(healer *RestorationDruid, id int32) (float64, float64) {
	gain, actual := 0.0, 0.0
	for _, row := range healer.Metrics.ToProto().Resources {
		if row.Id.GetSpellId() == id && row.Type == proto.ResourceType_ResourceTypeMana {
			gain += row.Gain
			actual += row.ActualGain
		}
	}
	return gain, actual
}

func kfcDruidItemSpend(sim *core.Simulation, healer *RestorationDruid, amount float64) {
	healer.SpendMana(sim, amount, healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 992}))
}

func TestKFCDruidItemOwnershipAndPolicyValidation(t *testing.T) {
	if !core.HasItemEffect(11819) {
		t.Fatal("Controls must load the same common item handlers as the production worker")
	}
	for _, ids := range [][]int32{nil, {18371}, {18371, 18371}, {249473}, {18371, 11819}} {
		_, healer := kfcDruidItemFixture(t, ids...)
		owned := len(ids) > 0 && ids[0] == 18371
		if (healer.GetSpell(core.ActionID{SpellID: 1302205}) != nil) != owned {
			t.Fatal("Mindtap ownership mismatch")
		}
		count := 0
		for _, spell := range healer.Spellbook {
			if spell.ActionID.SpellID == 1302205 {
				count++
			}
		}
		if owned && count != 1 {
			t.Fatal("Duplicate item copies duplicated one item cooldown")
		}
		err := healer.validateKFCDruidHealingCooldowns([]KFCDruidHealingCooldown{{SpellID: 1302205}})
		if (err == nil) != owned {
			t.Fatal("Unequipped resource cooldown admitted or equipped one rejected")
		}
	}
	for _, kind := range []string{"nil", "negative", "large", "nan", "infinite", "events", "schema", "id"} {
		_, healer := kfcDruidItemFixture(t, 249473)
		policy := kfcDruidItemPolicy(1, "completed-casts")
		switch kind {
		case "nil":
			policy.DormantHeartProcChance = nil
		case "negative":
			*policy.DormantHeartProcChance = -1
		case "large":
			*policy.DormantHeartProcChance = 1.1
		case "nan":
			*policy.DormantHeartProcChance = math.NaN()
		case "infinite":
			*policy.DormantHeartProcChance = math.Inf(1)
		case "events":
			policy.DormantHeartHealingEvents = "periodic"
		case "schema":
			policy.Schema = "other"
		case "id":
			policy.ID = ""
		}
		if healer.ConfigureKFCDruidItemEffects(policy) == nil {
			t.Fatal("Invalid item policy accepted: " + kind)
		}
	}
}

func TestKFCDruidMindtapTicksPenaltyCooldownAndExpiry(t *testing.T) {
	sim, healer := kfcDruidItemFixture(t, 18371)
	spell := healer.GetSpell(core.ActionID{SpellID: 1302205})
	maximum, intellect := healer.MaxMana(), healer.GetStat(stats.Intellect)
	kfcDruidItemSpend(sim, healer, 5000)
	before := healer.CurrentMana()
	if !spell.Cast(sim, &healer.Unit) {
		t.Fatal("Mindtap rejected")
	}
	kfcDruidNear(t, healer.GetStat(stats.Intellect), intellect-60)
	kfcDruidNear(t, healer.MaxMana(), maximum-900)
	kfcDruidNear(t, healer.CurrentMana(), before)
	if spell.CD.ReadyAt() != 7*time.Minute || spell.SharedCD.ReadyAt() != 10*time.Second {
		t.Fatal("Incorrect item/category cooldown")
	}
	kfcDruidAdvance(t, sim, 999*time.Millisecond)
	kfcDruidNear(t, healer.CurrentMana(), before)
	kfcDruidAdvance(t, sim, time.Second)
	kfcDruidNear(t, healer.CurrentMana(), before+125)
	kfcDruidAdvance(t, sim, 10*time.Second)
	gain, actual := kfcDruidItemMana(healer, 1302205)
	kfcDruidNear(t, gain, 1250)
	kfcDruidNear(t, actual, 1250)
	kfcDruidAdvance(t, sim, 119999*time.Millisecond)
	kfcDruidNear(t, healer.GetStat(stats.Intellect), intellect-60)
	before = healer.CurrentMana()
	kfcDruidAdvance(t, sim, 120*time.Second)
	kfcDruidNear(t, healer.MaxMana(), maximum)
	kfcDruidNear(t, healer.GetStat(stats.Intellect), intellect)
	kfcDruidNear(t, healer.CurrentMana(), before)
	if spell.IsReady(sim) {
		t.Fatal("Mindtap became ready when penalty expired")
	}
	kfcDruidAdvance(t, sim, 420*time.Second)
	if !spell.IsReady(sim) {
		t.Fatal("Seven-minute cooldown did not expire")
	}
	kfcDruidAdvancedResult("ITEM_MINDTAP", []float64{gain, actual, maximum - healer.MaxMana()})
}

func TestKFCDruidMindtapManaCapDeathAndReset(t *testing.T) {
	sim, healer := kfcDruidItemFixture(t, 18371)
	maximum := healer.MaxMana()
	spell := healer.GetSpell(core.ActionID{SpellID: 1302205})
	if !spell.Cast(sim, &healer.Unit) {
		t.Fatal("Mindtap full-mana control rejected")
	}
	kfcDruidNear(t, healer.CurrentMana(), maximum-900)
	kfcDruidAdvance(t, sim, 10*time.Second)
	gain, actual := kfcDruidItemMana(healer, 1302205)
	kfcDruidNear(t, gain, 1250)
	kfcDruidNear(t, actual, 0)
	_, loss := kfcDruidItemMana(healer, 1302206)
	kfcDruidNear(t, loss, -900)
	sim.Cleanup()
	sim.Reset()
	if !spell.IsReady(sim) || healer.GetAura("Druid Tapped Mind").IsActive() {
		t.Fatal("Mindtap state leaked across iterations")
	}
	kfcDruidNear(t, healer.MaxMana(), maximum)
	sim, healer = kfcDruidItemFixture(t, 18371)
	spell = healer.GetSpell(core.ActionID{SpellID: 1302205})
	kfcDruidItemSpend(sim, healer, 5000)
	if !spell.Cast(sim, &healer.Unit) {
		t.Fatal("Mindtap death control rejected")
	}
	kfcDruidAdvance(t, sim, time.Second)
	kfcSelfDamage(sim, healer, healer.CurrentHealth())
	kfcDruidAdvance(t, sim, 10*time.Second)
	gain, _ = kfcDruidItemMana(healer, 1302205)
	kfcDruidNear(t, gain, 125)
	if spell.CanCast(sim, &healer.Unit) {
		t.Fatal("Dead caster can use Mindtap")
	}
	kfcDruidAdvancedResult("ITEM_MINDTAP_CAP_DEATH", []float64{actual, loss, gain})
}

func TestKFCDruidManaTrinketsShareActualCategoryCooldown(t *testing.T) {
	for _, firstID := range []int32{1302205, 15604} {
		sim, healer := kfcDruidItemFixture(t, 18371, 11819)
		kfcDruidItemSpend(sim, healer, 5000)
		first := healer.GetSpell(core.ActionID{SpellID: firstID})
		nextID := int32(15604)
		if firstID == 15604 {
			nextID = 1302205
		}
		next := healer.GetSpell(core.ActionID{SpellID: nextID})
		if first == nil || next == nil {
			t.Fatal("An equipped resource item has no registered spell")
		}
		if !first.Cast(sim, &healer.Unit) {
			t.Fatal("First trinket failed")
		}
		if next.IsReady(sim) || next.CanCast(sim, &healer.Unit) || next.Cast(sim, &healer.Unit) {
			t.Fatal("Shared cooldown bypassed")
		}
		kfcDruidAdvance(t, sim, 9999*time.Millisecond)
		if next.CanCast(sim, &healer.Unit) {
			t.Fatal("Shared cooldown expired early")
		}
		kfcDruidAdvance(t, sim, 10*time.Second)
		if !next.Cast(sim, &healer.Unit) {
			t.Fatal("Shared cooldown did not release second trinket")
		}
		if next.SharedCD.ReadyAt() != 20*time.Second {
			t.Fatal("Second trinket did not extend the shared cooldown")
		}
	}
	kfcDruidAdvancedResult("ITEM_SHARED_COOLDOWN", true)
}

func TestKFCDruidSecondWindCannotGrantManaAfterDeath(t *testing.T) {
	sim, healer := kfcDruidItemFixture(t, 11819)
	kfcDruidItemSpend(sim, healer, 1000)
	spell := healer.GetSpell(core.ActionID{SpellID: 15604})
	if !spell.Cast(sim, &healer.Unit) {
		t.Fatal("Second Wind rejected")
	}
	kfcDruidAdvance(t, sim, time.Second)
	kfcSelfDamage(sim, healer, healer.CurrentHealth())
	kfcDruidAdvance(t, sim, 10*time.Second)
	gain, _ := kfcDruidItemMana(healer, 15604)
	kfcDruidNear(t, gain, 63)
	if spell.CanCast(sim, &healer.Unit) {
		t.Fatal("Dead caster can use Second Wind")
	}
	kfcDruidAdvancedResult("ITEM_SECOND_WIND_DEATH", gain)
}

func TestKFCDruidDormantHeartExactProbabilityAndStats(t *testing.T) {
	output := []float64{}
	for _, chance := range []float64{0, .02, .05, .1, 1} {
		sim, healer := kfcDruidItemFixture(t, 249473)
		oracle, _ := kfcDruidItemFixture(t)
		kfcDruidItemConfigure(t, healer, chance, "completed-casts")
		aura, buff := healer.GetAura("Druid Dormant Heart trigger"), healer.GetAura("Druid Eternal Power")
		parent := healer.GetSpell(core.ActionID{SpellID: 774})
		healing, damage, power := healer.GetStat(stats.HealingPower), healer.GetStat(stats.SpellDamage), healer.GetStat(stats.SpellPower)
		procs := 0
		for i := 0; i < 1000; i++ {
			aura.OnCastComplete(aura, sim, parent)
			want := chance > 0 && oracle.Proc(chance, "Druid Eternal Power")
			if buff.IsActive() != want {
				t.Fatal("Dormant Heart probability changed")
			}
			if want {
				procs++
				kfcDruidNear(t, healer.GetStat(stats.HealingPower), healing+40)
				kfcDruidNear(t, healer.GetStat(stats.SpellDamage), damage+13)
				kfcDruidNear(t, healer.GetStat(stats.SpellPower), power)
			}
			buff.Deactivate(sim)
			kfcDruidNear(t, healer.GetStat(stats.HealingPower), healing)
		}
		output = append(output, chance, float64(procs))
	}
	kfcDruidAdvancedResult("ITEM_HEART_PROBABILITY", output)
}

func TestKFCDruidDormantHeartActualCastsAndEventExclusions(t *testing.T) {
	amounts := [][]float64{}
	for _, chance := range []float64{0, 1} {
		sim, healer := kfcDruidItemFixture(t, 249473)
		kfcDruidItemConfigure(t, healer, chance, "completed-casts")
		target := &sim.Raid.GetFirstTargetDummy().Unit
		target.RemoveHealth(sim, 9000)
		spell := healer.GetSpell(core.ActionID{SpellID: 5185})
		spell.BonusCritRating = -10000
		heals := []float64{}
		for cast := 0; cast < 2; cast++ {
			before := spell.SpellMetrics[target.UnitIndex].TotalHealing
			if !spell.Cast(sim, target) {
				t.Fatal("Heart actual cast failed")
			}
			kfcDruidAdvance(t, sim, sim.CurrentTime+1500*time.Millisecond)
			heals = append(heals, spell.SpellMetrics[target.UnitIndex].TotalHealing-before)
		}
		amounts = append(amounts, heals)
		if chance == 1 {
			kfcDruidAdvance(t, sim, 17999*time.Millisecond)
			if !healer.GetAura("Druid Eternal Power").IsActive() {
				t.Fatal("Heart refresh lost duration")
			}
			kfcDruidAdvance(t, sim, 18*time.Second)
			if healer.GetAura("Druid Eternal Power").IsActive() {
				t.Fatal("Heart did not expire")
			}
		}
	}
	kfcDruidNear(t, amounts[1][0]-amounts[0][0], 0)
	kfcDruidNear(t, amounts[1][1]-amounts[0][1], .429*40)
	for _, events := range []string{"completed-casts", "direct-heals"} {
		sim, healer := kfcDruidItemFixture(t, 249473)
		kfcDruidItemConfigure(t, healer, 1, events)
		aura, buff := healer.GetAura("Druid Dormant Heart trigger"), healer.GetAura("Druid Eternal Power")
		parent := healer.GetSpell(core.ActionID{SpellID: 5185})
		periodic := parent.NewResult(&healer.Unit)
		aura.OnHealDealt(aura, sim, parent, periodic)
		parent.DisposeResult(periodic)
		if buff.IsActive() {
			t.Fatal("Periodic healing proc leaked")
		}
		for index, mask := range []core.ProcMask{core.ProcMaskSpellDamage, core.ProcMaskSpellHealing} {
			flags := core.SpellFlagPassiveSpell
			if index == 0 {
				flags = 0
			}
			child := healer.Character.RegisterSpell(core.SpellConfig{ActionID: core.ActionID{SpellID: 1, Tag: int32(index)}, ProcMask: mask, Flags: flags})
			aura.OnCastComplete(aura, sim, child)
			result := child.NewResult(&healer.Unit)
			result.DirectDamageOrHealing = true
			aura.OnHealDealt(aura, sim, child, result)
			child.DisposeResult(result)
		}
		if buff.IsActive() {
			t.Fatal("Harmful/passive proc leaked")
		}
		aura.OnCastComplete(aura, sim, parent)
		if buff.IsActive() != (events == "completed-casts") {
			t.Fatal("Completed-cast policy ignored")
		}
		buff.Deactivate(sim)
		result := parent.NewResult(&healer.Unit)
		result.DirectDamageOrHealing = true
		aura.OnHealDealt(aura, sim, parent, result)
		parent.DisposeResult(result)
		if buff.IsActive() != (events == "direct-heals") {
			t.Fatal("Direct-heal policy ignored")
		}
	}
	kfcDruidAdvancedResult("ITEM_HEART_CASTS", amounts)
}

func TestKFCDruidItemPolicyOwnershipFreshnessAndReset(t *testing.T) {
	sim, healer := kfcDruidItemFixture(t, 249473)
	policy := kfcDruidItemPolicy(1, "completed-casts")
	if err := healer.ConfigureKFCDruidItemEffects(policy); err != nil {
		t.Fatal(err)
	}
	*policy.DormantHeartProcChance = 0
	kfcDruidNear(t, *healer.kfcResolvedItemEffectsPolicy().DormantHeartProcChance, 1)
	if healer.ConfigureKFCDruidItemEffects(kfcDruidItemPolicy(0, "completed-casts")) == nil {
		t.Fatal("Policy changed after configuration")
	}
	parent := healer.GetSpell(core.ActionID{SpellID: 774})
	aura, buff := healer.GetAura("Druid Dormant Heart trigger"), healer.GetAura("Druid Eternal Power")
	aura.OnCastComplete(aura, sim, parent)
	if !buff.IsActive() {
		t.Fatal("Caller changed the actor-owned policy")
	}
	sim.Cleanup()
	sim.Reset()
	if buff.IsActive() {
		t.Fatal("Heart buff leaked across iterations")
	}
	kfcSelfDamage(sim, healer, healer.CurrentHealth())
	aura.OnCastComplete(aura, sim, parent)
	if buff.IsActive() {
		t.Fatal("Dead caster can proc Heart")
	}
}

func TestKFCDruidResourceItemsEquippedWorkloadPolicies(t *testing.T) {
	for index := 0; index < 9; index++ {
		request, frame := kfcDruidWorkloadControl()
		player := request.Raid.Parties[0].Players[0]
		player.BonusStats = nil
		player.Equipment = &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
		for slot, id := range kfcDruidEquippedControlIds {
			player.Equipment.Items[slot] = &proto.ItemSpec{Id: id}
		}
		player.Equipment.Items[16].Id = 22398
		if index < 6 {
			player.Equipment.Items[12].Id = 249473
			chance := []float64{1, 0, .02, .05, .1, 1}[index]
			events := "completed-casts"
			if index == 5 {
				events = "direct-heals"
			}
			policy := kfcDruidItemPolicy(chance, events)
			frame.ItemEffectsPolicy = &policy
		} else {
			player.Equipment.Items[12].Id = 18371
			if index == 7 {
				frame.Cooldowns = []KFCDruidHealingCooldown{{SpellID: 1302205, MinimumMissingMana: 1500}}
			}
			if index == 8 {
				player.Equipment.Items[12].Id = 249473
			}
		}
		payload := kfcDruidControlPayload(t, request, frame, fmt.Sprintf("resource-items-%d", index), false)
		reply := RunKFCDruidHealingJob(context.Background(), payload)
		if reply.Status != "complete" || reply.Result == nil || reply.Result.SurvivalRate != 1 || reply.Result.ItemEffectsPolicy == nil {
			t.Fatalf("Resource item workload failed: %+v", reply)
		}
		kfcDruidAdvancedResult("ITEM_RESOURCE_EQUIPPED_REQUEST", json.RawMessage(payload))
		kfcDruidAdvancedResult("ITEM_RESOURCE_EQUIPPED_RESULT", reply)
	}
}
