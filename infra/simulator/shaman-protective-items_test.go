package restoration

import (
	"context"
	"math"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
)

func kfcShamanProtectiveTestPolicy(ids map[int32]bool) KFCShamanProtectivePolicy {
	p := KFCShamanProtectivePolicy{Schema: "kfc-shaman-protective-policy.v1", ID: "controlled-protective-reference", Cooldowns: "item-override-inherits-negative-reference"}
	if ids[10030] {
		p.AdmiralStamina = "disabled-reference"
	}
	if ids[10721] {
		p.HarmBelt = "no-overload-reference"
	}
	if ids[18638] || ids[18639] {
		p.SelfReflection = "self-ineligible-reference"
	}
	if ids[272437] {
		value := false
		p.AdaptiveEnemyInMelee = &value
		p.AdaptiveOutcome = "noncritical-hit-reference"
	}
	return p
}

func kfcShamanProtectiveFixture(t *testing.T, engineer bool, ids ...int32) (*core.Simulation, *RestorationShaman, []*core.Unit) {
	t.Helper()
	request := kfcShamanRequest(500)
	request.Encounter.Duration = 4000
	request.Raid.TargetDummies = 6
	request.Raid.Parties = append(request.Raid.Parties, &proto.Party{})
	player := request.Raid.Parties[0].Players[0]
	player.TalentsString = kfcRiptideTalentString(map[string]int32{"riptide": 1, "water_shield": 1})
	if engineer {
		player.Profession1 = proto.Profession_Engineering
	}
	player.Equipment = &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
	for i := range player.Equipment.Items {
		player.Equipment.Items[i] = &proto.ItemSpec{}
	}
	slots := map[int32]int{8367: 4, 10030: 0, 10543: 0, 10721: 7, 13164: 12, 18340: 1, 18638: 12, 18639: 12, 272437: 12, 11808: 0, 11819: 12, 272438: 12}
	for _, id := range ids {
		slot, ok := slots[id]
		if !ok {
			t.Fatal("unknown source item", id)
		}
		if slot == 12 && player.Equipment.Items[slot].Id != 0 {
			slot = 13
		}
		if player.Equipment.Items[slot].Id != 0 {
			t.Fatal("illegal source slot overlap", id)
		}
		player.Equipment.Items[slot].Id = id
	}
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	resto := sim.Raid.Parties[0].Players[0].(*RestorationShaman)
	kfcRiptideConfigure(t, sim, resto, kfcRiptideDefault(), kfcShamanResourceDefault())
	units := resto.kfcHealingPlayers()
	for _, unit := range units {
		unit.AddStatDynamic(sim, stats.Health, 50000)
		unit.GainHealth(sim, unit.MaxHealth(), unit.NewHealthMetrics(core.ActionID{SpellID: 1, Tag: 1800}))
	}
	return sim, resto, units
}

func kfcShamanProtectiveConfigure(t *testing.T, sim *core.Simulation, resto *RestorationShaman, p KFCShamanProtectivePolicy) {
	t.Helper()
	if err := resto.ConfigureKFCShamanProtectiveItems(sim, p); err != nil {
		t.Fatal(err)
	}
}

func kfcShamanProtectiveHit(sim *core.Simulation, resto *RestorationShaman, school core.SpellSchool, amount float64, periodic bool) (float64, float64) {
	action := core.ActionID{SpellID: 1, Tag: 1801 + int32(school)}
	spell := resto.GetOrRegisterSpell(core.SpellConfig{ActionID: action, SpellSchool: school, ProcMask: core.ProcMaskSpellDamageProc, DamageMultiplier: 1})
	result := spell.NewResult(&resto.Unit)
	result.Damage, result.Outcome = amount, core.OutcomeHit
	if periodic {
		spell.DealPeriodicDamage(sim, result)
	} else {
		spell.DealDamage(sim, result)
	}
	return result.Damage, result.AbsorbedDamage
}

func TestKFCShamanProtectiveActualOwnershipAndPolicyGate(t *testing.T) {
	for _, id := range []int32{8367, 10030, 10543, 10721, 13164, 18340, 18638, 18639, 272437} {
		sim, resto, _ := kfcShamanProtectiveFixture(t, true, id)
		state := resto.kfcProtectiveItems
		if len(state.owned) != 1 || !state.owned[id] || state.spells[id] == nil || resto.KFCShamanProtectivePolicyEcho() != nil || state.spells[id].CanCast(sim, &resto.Unit) {
			t.Fatal("implicit or incorrect protective ownership", id)
		}
		p := kfcShamanProtectiveTestPolicy(state.owned)
		kfcShamanProtectiveConfigure(t, sim, resto, p)
		if !state.spells[id].Cast(sim, &resto.Unit) {
			t.Fatal("owned source use rejected", id)
		}
		if state.spells[id].CD.ReadyAt() != time.Duration(state.rules[id].CooldownMS)*time.Millisecond {
			t.Fatal("wrong source cooldown", id)
		}
		kfcShamanMeasure("PROTECTIVE_OWNER", []int64{int64(id), int64(state.spells[id].CD.ReadyAt())})
		sim.Cleanup()
	}
}

func TestKFCShamanProtectiveEngineeringAndSelfOnlyUses(t *testing.T) {
	for _, id := range []int32{10543, 10721, 18638, 18639} {
		sim, resto, units := kfcShamanProtectiveFixture(t, false, id)
		kfcShamanProtectiveConfigure(t, sim, resto, kfcShamanProtectiveTestPolicy(resto.kfcProtectiveItems.owned))
		spell := resto.kfcProtectiveItems.spells[id]
		if spell.CanCast(sim, &resto.Unit) || spell.CanCast(sim, units[1]) {
			t.Fatal("profession or self restriction bypassed", id)
		}
		sim.Cleanup()
	}
	sim, resto, units := kfcShamanProtectiveFixture(t, true, 8367)
	kfcShamanProtectiveConfigure(t, sim, resto, kfcShamanProtectiveTestPolicy(resto.kfcProtectiveItems.owned))
	if resto.kfcProtectiveItems.spells[8367].CanCast(sim, units[1]) {
		t.Fatal("self shield targeted another player")
	}
	sim.Cleanup()
	kfcShamanMeasure("PROTECTIVE_PROFESSION", 4)
}

func TestKFCShamanProtectivePoolsFilterActualIncomingSchools(t *testing.T) {
	for _, row := range []struct {
		id   int32
		mask core.SpellSchool
	}{{8367, core.SpellSchoolHoly | core.SpellSchoolFire | core.SpellSchoolNature | core.SpellSchoolFrost | core.SpellSchoolShadow | core.SpellSchoolArcane}, {10543, core.SpellSchoolFire}, {10721, core.SpellSchoolPhysical | core.SpellSchoolHoly | core.SpellSchoolFire | core.SpellSchoolNature | core.SpellSchoolFrost | core.SpellSchoolShadow | core.SpellSchoolArcane}, {18340, core.SpellSchoolShadow}, {272437, core.SpellSchoolPhysical | core.SpellSchoolHoly | core.SpellSchoolFire | core.SpellSchoolNature | core.SpellSchoolFrost | core.SpellSchoolShadow | core.SpellSchoolArcane}} {
		for _, school := range []core.SpellSchool{core.SpellSchoolPhysical, core.SpellSchoolFire, core.SpellSchoolShadow} {
			for _, periodic := range []bool{false, true} {
				sim, resto, _ := kfcShamanProtectiveFixture(t, true, row.id)
				kfcShamanProtectiveConfigure(t, sim, resto, kfcShamanProtectiveTestPolicy(resto.kfcProtectiveItems.owned))
				spell := resto.kfcProtectiveItems.spells[row.id]
				resto.AddStatDynamic(sim, stats.HealingPower, 100000)
				if !spell.Cast(sim, &resto.Unit) {
					t.Fatal("pool cast rejected")
				}
				capacity := spell.SelfShield().RemainingAbsorb()
				damage, absorb := kfcShamanProtectiveHit(sim, resto, school, 50, periodic)
				want := 0.0
				if row.mask.Matches(school) {
					want = 50
				}
				kfcShamanNear(t, damage, 50-want)
				kfcShamanNear(t, absorb, want)
				kfcShamanNear(t, spell.SelfShield().RemainingAbsorb(), capacity-want)
				kfcShamanMeasure("PROTECTIVE_SCHOOL", []float64{float64(row.id), float64(school), capacity, damage, absorb})
				sim.Cleanup()
			}
		}
	}
}

func TestKFCShamanProtectiveVariablePoolAndExpiry(t *testing.T) {
	low, high := math.Inf(1), 0.0
	for i := 0; i < 20; i++ {
		sim, resto, _ := kfcShamanProtectiveFixture(t, true, 10543)
		sim.Reseed(int64(i))
		kfcShamanProtectiveConfigure(t, sim, resto, kfcShamanProtectiveTestPolicy(resto.kfcProtectiveItems.owned))
		spell := resto.kfcProtectiveItems.spells[10543]
		if !spell.Cast(sim, &resto.Unit) {
			t.Fatal("Fire pool rejected")
		}
		value := spell.SelfShield().RemainingAbsorb()
		if value < 300 || value > 500 {
			t.Fatal("wrong source pool variance", value)
		}
		low = min(low, value)
		high = max(high, value)
		kfcShamanAdvance(t, sim, 60*time.Second)
		damage, absorb := kfcShamanProtectiveHit(sim, resto, core.SpellSchoolFire, 50, true)
		if damage != 50 || absorb != 0 || spell.SelfShield().IsActive() {
			t.Fatal("expired Fire pool still protected")
		}
		kfcShamanMeasure("PROTECTIVE_VARIANCE", value)
		sim.Cleanup()
	}
	if low >= high {
		t.Fatal("pool variance was not rolled")
	}
}

func TestKFCShamanProtectiveSharedCooldownDirections(t *testing.T) {
	for _, row := range []struct {
		id, other    int32
		otherSpell   int32
		own, reverse time.Duration
	}{{18340, 11819, 15604, 30 * time.Second, 10 * time.Second}, {272437, 272438, 0, 15 * time.Second, 20 * time.Second}} {
		for _, reverse := range []bool{false, true} {
			sim, resto, _ := kfcShamanProtectiveFixture(t, true, row.id, row.other)
			kfcShamanProtectiveConfigure(t, sim, resto, kfcShamanProtectiveTestPolicy(resto.kfcProtectiveItems.owned))
			first := resto.kfcProtectiveItems.spells[row.id]
			var second *core.Spell
			if row.otherSpell != 0 {
				second = resto.GetSpell(core.ActionID{SpellID: row.otherSpell})
			} else {
				second = resto.GetSpell(core.ActionID{ItemID: row.other})
			}
			if second == nil {
				t.Fatal("missing actual shared item")
			}
			duration := row.own
			if reverse {
				first, second = second, first
				duration = row.reverse
			}
			if !first.Cast(sim, &resto.Unit) || second.IsReady(sim) {
				t.Fatal("shared cooldown failed", row.id, reverse)
			}
			kfcShamanAdvance(t, sim, duration-time.Millisecond)
			if second.IsReady(sim) {
				t.Fatal("shared cooldown ended early")
			}
			kfcShamanAdvance(t, sim, duration)
			if !second.IsReady(sim) {
				t.Fatal("shared cooldown did not end")
			}
			kfcShamanMeasure("PROTECTIVE_SHARED", []int64{int64(row.id), int64(duration)})
			sim.Cleanup()
		}
	}
}

func TestKFCShamanProtectiveAdaptiveOnlyExplodesOnDepletion(t *testing.T) {
	for _, melee := range []bool{false, true} {
		sim, resto, _ := kfcShamanProtectiveFixture(t, true, 272437)
		p := kfcShamanProtectiveTestPolicy(resto.kfcProtectiveItems.owned)
		p.AdaptiveEnemyInMelee = &melee
		kfcShamanProtectiveConfigure(t, sim, resto, p)
		spell := resto.kfcProtectiveItems.spells[272437]
		if !spell.Cast(sim, &resto.Unit) {
			t.Fatal("Adaptive rejected")
		}
		explosion := resto.GetSpell(core.ActionID{SpellID: 1291099})
		target := resto.Env.Encounter.TargetUnits[0]
		before := explosion.SpellMetrics[target.UnitIndex].Hits
		spell.SelfShield().Apply(sim, 450)
		spell.SelfShield().Deactivate(sim)
		if explosion.SpellMetrics[target.UnitIndex].Hits != before {
			t.Fatal("replacement/manual expiration exploded")
		}
		spell.SelfShield().Apply(sim, 450)
		kfcShamanProtectiveHit(sim, resto, core.SpellSchoolShadow, 500, false)
		hits := explosion.SpellMetrics[target.UnitIndex].Hits - before
		want := int32(0)
		if melee {
			want = 1
		}
		if hits != want {
			t.Fatal("wrong actual depletion explosion", melee, hits)
		}
		kfcShamanProtectiveHit(sim, resto, core.SpellSchoolShadow, 500, false)
		if explosion.SpellMetrics[target.UnitIndex].Hits-before != want {
			t.Fatal("duplicate depletion explosion")
		}
		kfcShamanMeasure("PROTECTIVE_EXPLOSION", []float64{float64(hits), explosion.SpellMetrics[target.UnitIndex].TotalDamage})
		sim.Cleanup()
	}
}

func TestKFCShamanProtectiveAdmiralRangeRefreshAndHealthReferences(t *testing.T) {
	for _, health := range []string{"maximum-only-reference", "grant-on-gain-reference"} {
		sim, resto, units := kfcShamanProtectiveFixture(t, true, 10030)
		resto.positions[units[2].UnitIndex] = KFCShamanFriendlyPosition{X: 31}
		resto.positions[units[3].UnitIndex] = KFCShamanFriendlyPosition{X: 30}
		p := kfcShamanProtectiveTestPolicy(resto.kfcProtectiveItems.owned)
		p.AdmiralStamina, p.AdmiralHealth = "additive-reference", health
		p.AdmiralRecipientHealth = "ten-health-per-stamina-reference"
		kfcShamanProtectiveConfigure(t, sim, resto, p)
		base := make([]float64, len(units))
		for i, u := range units {
			base[i] = u.GetStat(stats.Stamina)
			u.RemoveHealth(sim, 200)
		}
		before := units[1].CurrentHealth()
		spell := resto.kfcProtectiveItems.spells[10030]
		if !spell.Cast(sim, &resto.Unit) {
			t.Fatal("Admiral rejected")
		}
		for i, u := range units {
			want := base[i]
			if i < 5 && i != 2 {
				want += 10
			}
			kfcShamanNear(t, u.GetStat(stats.Stamina), want)
		}
		if (units[1].CurrentHealth() > before) != (health == "grant-on-gain-reference") {
			t.Fatal("wrong health grant reference")
		}
		kfcShamanAdvance(t, sim, time.Minute)
		if !spell.Cast(sim, &resto.Unit) {
			t.Fatal("Admiral refresh rejected")
		}
		kfcShamanNear(t, units[1].GetStat(stats.Stamina), base[1]+10)
		kfcShamanAdvance(t, sim, 660*time.Second)
		for i, u := range units {
			kfcShamanNear(t, u.GetStat(stats.Stamina), base[i])
			if u.CurrentHealth() > u.MaxHealth() {
				t.Fatal("expired stamina left health above cap")
			}
		}
		kfcShamanMeasure("PROTECTIVE_ADMIRAL", []float64{resto.kfcProtectiveItems.externalDeficitAdjustment, units[1].CurrentHealth()})
		sim.Cleanup()
	}
}

func TestKFCShamanProtectiveResistanceAndSelfReflectionReferences(t *testing.T) {
	sim, resto, _ := kfcShamanProtectiveFixture(t, true, 13164)
	kfcShamanProtectiveConfigure(t, sim, resto, kfcShamanProtectiveTestPolicy(resto.kfcProtectiveItems.owned))
	before := resto.GetStat(stats.FireResistance)
	if !resto.kfcProtectiveItems.spells[13164].Cast(sim, &resto.Unit) {
		t.Fatal("resistance use rejected")
	}
	kfcShamanNear(t, resto.GetStat(stats.FireResistance), before+20)
	kfcShamanAdvance(t, sim, 300*time.Second)
	kfcShamanNear(t, resto.GetStat(stats.FireResistance), before)
	sim.Cleanup()
	for _, row := range []struct {
		id     int32
		school core.SpellSchool
	}{{18638, core.SpellSchoolFire}, {18639, core.SpellSchoolShadow}} {
		sim, resto, _ := kfcShamanProtectiveFixture(t, true, row.id)
		kfcShamanProtectiveConfigure(t, sim, resto, kfcShamanProtectiveTestPolicy(resto.kfcProtectiveItems.owned))
		if !resto.kfcProtectiveItems.spells[row.id].Cast(sim, &resto.Unit) || !resto.kfcProtectiveItems.auras[row.id].IsActive() {
			t.Fatal("reflector activation rejected")
		}
		damage, absorb := kfcShamanProtectiveHit(sim, resto, row.school, 100, row.id == 18638)
		if damage != 100 || absorb != 0 {
			t.Fatal("self-ineligible reference incorrectly prevented own damage")
		}
		kfcShamanAdvance(t, sim, 5*time.Second)
		if resto.kfcProtectiveItems.auras[row.id].IsActive() {
			t.Fatal("reflector duration changed")
		}
		kfcShamanMeasure("PROTECTIVE_REFLECTION", []float64{float64(row.id), damage, absorb})
		sim.Cleanup()
	}
}

func TestKFCShamanProtectiveNoImplicitOverloadAndOwnedPolicyMemory(t *testing.T) {
	sim, resto, _ := kfcShamanProtectiveFixture(t, true, 10721)
	p := kfcShamanProtectiveTestPolicy(resto.kfcProtectiveItems.owned)
	p.HarmBelt = "disabled-use-reference"
	kfcShamanProtectiveConfigure(t, sim, resto, p)
	if resto.kfcProtectiveItems.spells[10721].CanCast(sim, &resto.Unit) {
		t.Fatal("disabled uncertain belt was used")
	}
	p.HarmBelt = "no-overload-reference"
	if resto.KFCShamanProtectivePolicyEcho().HarmBelt != "disabled-use-reference" {
		t.Fatal("borrowed policy")
	}
	sim.Cleanup()
	sim, resto, _ = kfcShamanProtectiveFixture(t, true, 272437)
	p = kfcShamanProtectiveTestPolicy(resto.kfcProtectiveItems.owned)
	kfcShamanProtectiveConfigure(t, sim, resto, p)
	*p.AdaptiveEnemyInMelee = true
	echo := resto.KFCShamanProtectivePolicyEcho()
	if *echo.AdaptiveEnemyInMelee {
		t.Fatal("borrowed adaptive pointer")
	}
	*echo.AdaptiveEnemyInMelee = true
	if *resto.KFCShamanProtectivePolicyEcho().AdaptiveEnemyInMelee {
		t.Fatal("borrowed echo")
	}
	if err := resto.ConfigureKFCShamanProtectiveItems(sim, p); err == nil {
		t.Fatal("protective policy reconfigured")
	}
	sim.Cleanup()
	kfcShamanMeasure("PROTECTIVE_OWNED_POLICY", 2)
}

func TestKFCShamanProtectiveActualEquippedUsesAndExternalLedger(t *testing.T) {
	for _, row := range []struct {
		id   int32
		slot int
	}{{8367, 4}, {10030, 0}, {10543, 0}, {10721, 7}, {13164, 12}, {18340, 1}, {18638, 12}, {18639, 12}, {272437, 12}} {
		request, frame := kfcShamanEquippedControl(t, "2-4-11", map[int]int32{row.slot: row.id})
		request.Raid.Parties[0].Players[0].Consumes = &proto.Consumes{DefaultConjured: proto.Conjured_ConjuredDemonicRune}
		frame.Cooldowns = []KFCShamanEquippedCooldown{{ItemID: row.id, RaidIndex: -1, MaximumUses: 1}, {ItemID: 12662, RaidIndex: -1, MaximumUses: 1}}
		result := kfcShamanEquippedResult(t, request, frame)
		if result.Equipped.CooldownUsesMean[0] != 1 || result.Equipped.CooldownUsesMean[1] != 1 || result.Assignment.AbsorbedHpsMean != 0 || result.Assignment.SupportHpsMean*request.Encounter.Duration > result.Assignment.DamageDemandMean+1e-7 {
			t.Fatal("actual use/own protection inflated external support", row.id)
		}
		kfcShamanMeasure("PROTECTIVE_EQUIPPED", result)
	}
}

func TestKFCShamanProtectiveAdmiralCannotPadAnotherRecipientsDemand(t *testing.T) {
	request, frame := kfcShamanEquippedControl(t, "2-4-11", map[int]int32{0: 10030})
	frame.Effects.Protective.AdmiralStamina = "additive-reference"
	frame.Effects.Protective.AdmiralHealth = "maximum-only-reference"
	frame.Effects.Protective.AdmiralRecipientHealth = "ten-health-per-stamina-reference"
	frame.Cooldowns = []KFCShamanEquippedCooldown{{ItemID: 10030, RaidIndex: -1, MaximumUses: 1}}
	frame.Workload.Damage = []KFCShamanHealingDamageEvent{{AtMS: 2000, RaidIndex: 2, Amount: 1000}}
	frame.Workload.Priorities = []KFCShamanHealingPriority{{SpellID: 331, RaidIndex: 1, MinimumMissingHealth: 1}}
	result := kfcShamanEquippedResult(t, request, frame)
	if result.Assignment.ExternalNonHealingDeficitAdjustmentMean <= 0 || result.Assignment.SupportHpsMean != 0 || result.Assignment.HealthRestoredHpsMean != 0 {
		t.Fatal("temporary capacity healing was credited against another player's damage", result.Assignment)
	}
	kfcShamanMeasure("PROTECTIVE_CAPACITY_NO_PADDING", result.Assignment)
}

func TestKFCShamanProtectiveResetAndMissingOwnedReference(t *testing.T) {
	request, frame := kfcShamanEquippedControl(t, "2-4-11", map[int]int32{0: 10030})
	frame.Effects.Protective.AdmiralStamina = "additive-reference"
	frame.Effects.Protective.AdmiralHealth = "grant-on-gain-reference"
	frame.Effects.Protective.AdmiralRecipientHealth = "ten-health-per-stamina-reference"
	frame.Cooldowns = []KFCShamanEquippedCooldown{{ItemID: 10030, RaidIndex: -1, MaximumUses: 1}}
	request.SimOptions.Iterations = 2
	result := kfcShamanEquippedResult(t, request, frame)
	if result.Equipped.CooldownUsesMean[0] != 1 || result.Assignment.ExternalNonHealingDeficitAdjustmentMean != 0 {
		t.Fatal("stat/adjustment/use state leaked across iterations")
	}
	frame.Effects.Protective = nil
	if _, err := RunKFCShamanEquippedHealingWorkload(context.Background(), request, frame); err == nil {
		t.Fatal("missing owned protection reference accepted")
	}
	kfcShamanMeasure("PROTECTIVE_RESET", result.Assignment)
}
