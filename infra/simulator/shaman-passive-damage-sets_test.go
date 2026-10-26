package restoration

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"math"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
	googleProto "google.golang.org/protobuf/proto"
)

func kfcShamanPassiveDamageFixture(t *testing.T, ids ...int32) (*core.Simulation, *RestorationShaman) {
	t.Helper()
	request := kfcShamanRequest(0)
	request.Encounter.Duration = 400
	player := request.Raid.Parties[0].Players[0]
	player.TalentsString = kfcRiptideTalentString(map[string]int32{"riptide": 1, "water_shield": 1})
	player.Consumes = &proto.Consumes{DefaultConjured: proto.Conjured_ConjuredDemonicRune}
	player.Equipment = &proto.EquipmentSpec{Items: make([]*proto.ItemSpec, 17)}
	for i := range player.Equipment.Items {
		player.Equipment.Items[i] = &proto.ItemSpec{}
	}
	slots := map[int32]int{14626: 4, 14629: 5, 14631: 9, 14632: 8, 14633: 2, 13388: 4, 13389: 8, 13390: 0, 13391: 9, 13392: 10, 272437: 12, 11808: 0}
	for _, id := range ids {
		slot, ok := slots[id]
		if !ok || player.Equipment.Items[slot].Id != 0 {
			t.Fatal("invalid actual passive-damage fixture", id)
		}
		player.Equipment.Items[slot].Id = id
	}
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	resto := sim.Raid.Parties[0].Players[0].(*RestorationShaman)
	kfcRiptideConfigure(t, sim, resto, kfcRiptideDefault(), kfcShamanResourceDefault())
	for _, unit := range resto.kfcHealingPlayers() {
		unit.AddStatDynamic(sim, stats.Health, 50000)
		unit.GainHealth(sim, unit.MaxHealth(), unit.NewHealthMetrics(core.ActionID{SpellID: 1, Tag: 1900}))
	}
	return sim, resto
}

func kfcShamanPassiveDamagePolicy(resto *RestorationShaman, chance *float64) KFCShamanPassiveDamageSetPolicy {
	p := KFCShamanPassiveDamageSetPolicy{Schema: "kfc-shaman-passive-damage-policy.v1", ID: "controlled-passive-reference", Timing: "captured-proc-recovery-ms-reference"}
	if resto.kfcPassiveDamageSets.necropile {
		p.NecropileTrigger = "cast-only-reference"
		if chance != nil {
			p.NecropileTrigger = "adaptive-damage-reference"
			p.NecropileChance = chance
			p.DrainOutcome = "noncritical-hit-reference"
		}
	}
	if resto.kfcPassiveDamageSets.postmaster {
		p.Postmaster = "self-ineligible-after-hit-strict-below-reference"
	}
	return p
}

func kfcShamanPassiveDamageConfigure(t *testing.T, sim *core.Simulation, resto *RestorationShaman, chance *float64) {
	t.Helper()
	if err := resto.ConfigureKFCShamanPassiveDamageSets(sim, kfcShamanPassiveDamagePolicy(resto, chance)); err != nil {
		t.Fatal(err)
	}
}

func kfcShamanPassiveDamageExplosion(t *testing.T, sim *core.Simulation, resto *RestorationShaman) {
	t.Helper()
	spell := resto.GetSpell(core.ActionID{SpellID: 1291099})
	if spell == nil {
		t.Fatal("missing actual Adaptive explosion")
	}
	spell.CalcAndDealDamage(sim, resto.Env.Encounter.TargetUnits[0], 100, spell.OutcomeAlwaysHit)
}

func TestKFCShamanPassiveDamageExactOwnersAndNoManualDrain(t *testing.T) {
	for _, ids := range [][]int32{{}, {14626, 14629}, {14626, 14629, 14633, 272437}, {13388, 13389, 13390}, {13388, 13389, 13390, 13392}, {14633, 14629, 14631, 13388, 13389, 13390, 13392, 272437}} {
		sim, resto := kfcShamanPassiveDamageFixture(t, ids...)
		state := resto.kfcPassiveDamageSets
		if state.necropile || state.postmaster {
			kfcShamanPassiveDamageConfigure(t, sim, resto, nil)
		}
		if state.necropile {
			if state.drain == nil || state.drain.CanCast(sim, resto.Env.Encounter.TargetUnits[0]) {
				t.Fatal("unowned manual drain access")
			}
		}
		if !state.necropile && state.drain != nil || !state.postmaster && state.reflection != nil {
			t.Fatal("borrowed set effect")
		}
		kfcShamanMeasure("PASSIVE_DAMAGE_OWNERS", []interface{}{ids, state.necropile, state.postmaster})
		sim.Cleanup()
	}
}

func TestKFCShamanPassiveDamageExplicitChanceAndFreshPolicyCopy(t *testing.T) {
	chance := 1.0
	sim, resto := kfcShamanPassiveDamageFixture(t, 14626, 14629, 14633, 272437)
	defer sim.Cleanup()
	p := kfcShamanPassiveDamagePolicy(resto, &chance)
	for _, edit := range []func(*KFCShamanPassiveDamageSetPolicy){func(p *KFCShamanPassiveDamageSetPolicy) { p.NecropileChance = nil }, func(p *KFCShamanPassiveDamageSetPolicy) { v := math.NaN(); p.NecropileChance = &v }, func(p *KFCShamanPassiveDamageSetPolicy) {
		p.Postmaster = "self-ineligible-after-hit-strict-below-reference"
	}, func(p *KFCShamanPassiveDamageSetPolicy) { p.Timing = "guessed" }} {
		copy := copyKFCShamanPassiveDamagePolicy(p)
		edit(&copy)
		if resto.ConfigureKFCShamanPassiveDamageSets(sim, copy) == nil {
			t.Fatal("invalid reference accepted")
		}
	}
	if err := resto.ConfigureKFCShamanPassiveDamageSets(sim, p); err != nil {
		t.Fatal(err)
	}
	chance = 0
	echo := resto.KFCShamanPassiveDamagePolicyEcho()
	if echo == nil || *echo.NecropileChance != 1 {
		t.Fatal("borrowed caller chance")
	}
	*echo.NecropileChance = 0
	if *resto.KFCShamanPassiveDamagePolicyEcho().NecropileChance != 1 {
		t.Fatal("borrowed echo chance")
	}
	if resto.ConfigureKFCShamanPassiveDamageSets(sim, p) == nil {
		t.Fatal("reconfiguration accepted")
	}
	kfcShamanMeasure("PASSIVE_DAMAGE_POLICY_COPY", *resto.KFCShamanPassiveDamagePolicyEcho())
}

func TestKFCShamanPassiveDamageSeededChanceAndNoRecursiveDrain(t *testing.T) {
	chance := .5
	sim, resto := kfcShamanPassiveDamageFixture(t, 14626, 14629, 14633, 272437)
	defer sim.Cleanup()
	kfcShamanPassiveDamageConfigure(t, sim, resto, &chance)
	oracle, other := kfcShamanPassiveDamageFixture(t, 14626, 14629, 14633, 272437)
	defer oracle.Cleanup()
	kfcShamanPassiveDamageConfigure(t, oracle, other, nil)
	count := 0
	for i := 0; i < 100; i++ {
		if oracle.RandomFloat("KFC Shaman Necropile explicit chance") < chance {
			count++
		}
		kfcShamanPassiveDamageExplosion(t, sim, resto)
		kfcShamanAdvance(t, sim, time.Duration(i+1)*20*time.Millisecond)
	}
	state := resto.kfcPassiveDamageSets
	if state.opportunities != 100 || state.procs != count || count == 0 || count == 100 {
		t.Fatal("wrong chance or recursive drain", state.opportunities, state.procs, count)
	}
	kfcShamanMeasure("PASSIVE_DAMAGE_CHANCE", []int{state.opportunities, state.procs, count})
}

func TestKFCShamanPassiveDamageRecoveryCapAndDeadOwner(t *testing.T) {
	chance := 1.0
	sim, resto := kfcShamanPassiveDamageFixture(t, 14626, 14629, 14633, 272437)
	defer sim.Cleanup()
	kfcShamanPassiveDamageConfigure(t, sim, resto, &chance)
	resto.RemoveHealth(sim, 5)
	kfcShamanPassiveDamageExplosion(t, sim, resto)
	kfcShamanNear(t, resto.kfcPassiveDamageSets.usefulHealing, 5)
	kfcShamanNear(t, resto.CurrentHealth(), resto.MaxHealth())
	kfcShamanPassiveDamageExplosion(t, sim, resto)
	if resto.kfcPassiveDamageSets.procs != 1 {
		t.Fatal("source recovery ignored")
	}
	kfcShamanAdvance(t, sim, 10*time.Millisecond)
	kfcShamanPassiveDamageExplosion(t, sim, resto)
	if resto.kfcPassiveDamageSets.procs != 2 {
		t.Fatal("recovery did not expire")
	}
	resto.RemoveHealth(sim, resto.CurrentHealth())
	kfcShamanAdvance(t, sim, 20*time.Millisecond)
	kfcShamanPassiveDamageExplosion(t, sim, resto)
	if resto.CurrentHealth() != 0 || resto.kfcPassiveDamageSets.procs != 2 {
		t.Fatal("dead owner healed or proc'd")
	}
	kfcShamanMeasure("PASSIVE_DAMAGE_CAP", []float64{resto.kfcPassiveDamageSets.usefulHealing, float64(resto.kfcPassiveDamageSets.procs), resto.CurrentHealth()})
}

func TestKFCShamanPassiveDamageActualAdaptiveDepletionAndRouting(t *testing.T) {
	for _, chance := range []float64{0, 1} {
		sim, resto := kfcShamanPassiveDamageFixture(t, 14626, 14629, 14633, 272437, 11808)
		kfcShamanPassiveDamageConfigure(t, sim, resto, &chance)
		p := kfcShamanProtectiveTestPolicy(resto.kfcProtectiveItems.owned)
		melee := true
		p.AdaptiveEnemyInMelee = &melee
		kfcShamanProtectiveConfigure(t, sim, resto, p)
		kfcShamanConfigureUtility(t, sim, resto, kfcShamanUtilityReference())
		resto.SpendMana(sim, 5000, resto.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 1901}))
		if !resto.GetSpell(core.ActionID{ItemID: 12662}).Cast(sim, &resto.Unit) {
			t.Fatal("actual Rune rejected")
		}
		if !resto.kfcProtectiveItems.spells[272437].Cast(sim, &resto.Unit) || !resto.kfcUtilityItems.spells[11808].Cast(sim, &resto.Unit) {
			t.Fatal("actual shield/channel rejected")
		}
		kfcShamanAdvance(t, sim, 11*time.Second)
		state := resto.kfcPassiveDamageSets
		if state.opportunities != 1 || state.procs != int(chance) || chance == 1 && state.usefulHealing <= 0 {
			t.Fatal("actual depletion routing wrong", state.opportunities, state.procs, state.usefulHealing)
		}
		kfcShamanMeasure("PASSIVE_DAMAGE_ACTUAL_DEPLETION", []float64{chance, float64(state.opportunities), float64(state.procs), state.usefulHealing})
		sim.Cleanup()
	}
}

func TestKFCShamanPassiveDamageCastOnlyAndReset(t *testing.T) {
	sim, resto := kfcShamanPassiveDamageFixture(t, 14626, 14629, 14633, 272437)
	defer sim.Cleanup()
	kfcShamanPassiveDamageConfigure(t, sim, resto, nil)
	kfcShamanPassiveDamageExplosion(t, sim, resto)
	if resto.kfcPassiveDamageSets.opportunities != 0 || resto.kfcPassiveDamageSets.procs != 0 {
		t.Fatal("cast-only reference chained a passive proc")
	}
	sim.Cleanup()
	sim.Reset()
	state := resto.kfcPassiveDamageSets
	if state.started || state.opportunities != 0 || state.procs != 0 || state.usefulHealing != 0 || state.firing || resto.KFCShamanPassiveDamagePolicyEcho() == nil {
		t.Fatal("iteration reset lost policy or retained events")
	}
	kfcShamanMeasure("PASSIVE_DAMAGE_RESET", resto.KFCShamanPassiveDamagePolicyEcho())
}

func TestKFCShamanPassiveDamagePostmasterActualThresholdExpiryAndCooldown(t *testing.T) {
	sim, resto := kfcShamanPassiveDamageFixture(t, 13388, 13389, 13390, 13392)
	defer sim.Cleanup()
	kfcShamanPassiveDamageConfigure(t, sim, resto, nil)
	state := resto.kfcPassiveDamageSets
	resto.RemoveHealth(sim, resto.CurrentHealth()-resto.MaxHealth()/4-1)
	kfcShamanProtectiveHit(sim, resto, core.SpellSchoolShadow, 1, false)
	if state.reflection.IsActive() {
		t.Fatal("strict-below reference activated at exactly25percent")
	}
	kfcShamanProtectiveHit(sim, resto, core.SpellSchoolShadow, 1, false)
	if !state.reflection.IsActive() || state.reflection.GetStacks() != 1 || state.reflectionCD.ReadyAt() != 180*time.Second {
		t.Fatal("actual threshold buff absent")
	}
	before := resto.CurrentHealth()
	damage, _ := kfcShamanProtectiveHit(sim, resto, core.SpellSchoolFire, 5, true)
	kfcShamanNear(t, before-resto.CurrentHealth(), 5)
	kfcShamanNear(t, damage, 5)
	if state.reflection.GetStacks() != 1 {
		t.Fatal("self damage consumed reflection")
	}
	kfcShamanAdvance(t, sim, 6*time.Second)
	if state.reflection.IsActive() {
		t.Fatal("source buff expiry ignored")
	}
	kfcShamanProtectiveHit(sim, resto, core.SpellSchoolShadow, 1, false)
	if state.reflection.IsActive() {
		t.Fatal("source cooldown ignored")
	}
	kfcShamanAdvance(t, sim, 180*time.Second)
	kfcShamanProtectiveHit(sim, resto, core.SpellSchoolShadow, 1, false)
	if !state.reflection.IsActive() {
		t.Fatal("source cooldown never expired")
	}
	kfcShamanMeasure("PASSIVE_DAMAGE_POSTMASTER", []int64{int64(state.reflection.Duration), int64(state.reflectionCD.ReadyAt()), int64(state.reflection.GetStacks())})
}

func TestKFCShamanPassiveDamageMissingPolicyRejectedByWorkload(t *testing.T) {
	for _, items := range []map[int]int32{{2: 14633, 5: 14629, 8: 14632}, {0: 13390, 4: 13388, 8: 13389, 10: 13392}} {
		request, frame := kfcShamanEquippedControl(t, "2-4-11", items)
		if frame.Effects.PassiveDamage == nil {
			t.Fatal("fixture omitted owned reference")
		}
		frame.Effects.PassiveDamage = nil
		if _, err := RunKFCShamanEquippedHealingWorkload(context.Background(), request, frame); err == nil {
			t.Fatal("owned passive set silently omitted")
		}
	}
	kfcShamanMeasure("PASSIVE_DAMAGE_MISSING_POLICY", 2)
}

func TestKFCShamanPassiveDamageActualWireAndExternalHealingLedger(t *testing.T) {
	request, frame := kfcShamanEquippedControl(t, "2-4-11", map[int]int32{0: 11808, 2: 14633, 5: 14629, 8: 14632, 12: 272437})
	melee := true
	chance := 1.0
	frame.Effects.Protective.AdaptiveEnemyInMelee = &melee
	frame.Effects.PassiveDamage.NecropileTrigger = "adaptive-damage-reference"
	frame.Effects.PassiveDamage.NecropileChance = &chance
	frame.Effects.PassiveDamage.DrainOutcome = "noncritical-hit-reference"
	request.Raid.Parties[0].Players[0].Consumes = &proto.Consumes{DefaultConjured: proto.Conjured_ConjuredDemonicRune}
	frame.Cooldowns = []KFCShamanEquippedCooldown{{ItemID: 272437, RaidIndex: -1, MaximumUses: 1}, {ItemID: 12662, RaidIndex: -1, MaximumUses: 1}, {ItemID: 11808, RaidIndex: -1, MaximumUses: 1}}
	encoded, err := googleProto.Marshal(request)
	if err != nil {
		t.Fatal(err)
	}
	job := KFCShamanEquippedHealingJob{Schema: "kfc-shaman-equipped-job.v1", ID: "passive-damage-transport-control", RequestBase64: base64.StdEncoding.EncodeToString(encoded), Workload: frame, Detail: true}
	payload, err := json.Marshal(job)
	if err != nil {
		t.Fatal(err)
	}
	reply := RunKFCShamanEquippedHealingJob(context.Background(), payload)
	if reply.Status != "complete" || reply.Result == nil {
		t.Fatal("actual passive-damage job failed", reply.Error)
	}
	result := kfcShamanEquippedResult(t, request, frame)
	drains := 0
	for _, action := range result.Metrics.Parties[0].Players[0].Actions {
		if action.Id.GetSpellId() == 1299735 {
			for _, target := range action.Targets {
				drains += int(target.Hits + target.Crits)
			}
		}
	}
	if drains != 1 || result.Assignment.AbsorbedHpsMean != 0 || result.Assignment.SupportHpsMean*request.Encounter.Duration > result.Assignment.DamageDemandMean+1e-7 {
		t.Fatal("missing real drain or external HPS padded", drains, result.Assignment)
	}
	kfcShamanMeasure("PASSIVE_DAMAGE_WIRE", struct {
		Payload json.RawMessage                  `json:"payload"`
		Reply   KFCShamanEquippedHealingJobReply `json:"reply"`
	}{payload, reply})
}
