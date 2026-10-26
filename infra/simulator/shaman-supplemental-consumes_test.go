package restoration

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
	googleProto "google.golang.org/protobuf/proto"
)

func kfcShamanSupplementalTestConsumes(row kfcShamanSupplementalConsume) *proto.Consumes {
	c := &proto.Consumes{}
	switch row.Field {
	case "healthElixir":
		c.HealthElixir = proto.HealthElixir(row.Value)
	case "zanzaBuff":
		c.ZanzaBuff = proto.ZanzaBuff(row.Value)
	case "alcohol":
		c.Alcohol = proto.Alcohol(row.Value)
	case "spellPowerBuff":
		c.SpellPowerBuff = proto.SpellPowerBuff(row.Value)
	case "firePowerBuff":
		c.FirePowerBuff = proto.FirePowerBuff(row.Value)
	case "shadowPowerBuff":
		c.ShadowPowerBuff = proto.ShadowPowerBuff(row.Value)
	case "frostPowerBuff":
		c.FrostPowerBuff = proto.FrostPowerBuff(row.Value)
	case "miscConsumes.raptorPunch":
		c.MiscConsumes = &proto.MiscConsumes{RaptorPunch: true}
	case "miscConsumes.jujuEmber":
		c.MiscConsumes = &proto.MiscConsumes{JujuEmber: true}
	case "miscConsumes.jujuChill":
		c.MiscConsumes = &proto.MiscConsumes{JujuChill: true}
	default:
		panic("Unknown supplemental consume test family")
	}
	return c
}

func kfcShamanSupplementalFixture(t *testing.T, consumes *proto.Consumes, mental bool, kings bool) (*core.Simulation, *RestorationShaman) {
	t.Helper()
	request := kfcShamanRequest(0)
	player := request.Raid.Parties[0].Players[0]
	player.Consumes = consumes
	if mental {
		player.TalentsString = kfcRiptideTalentString(map[string]int32{"mental_quickness": 2, "ancestral_knowledge": 5})
	}
	if kings {
		player.Buffs = &proto.IndividualBuffs{BlessingOfKings: true}
	}
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	actor := sim.Raid.Parties[0].Players[0].(*RestorationShaman)
	positions := map[int32]KFCShamanFriendlyPosition{}
	for index, unit := range actor.kfcHealingPlayers() {
		positions[unit.UnitIndex] = KFCShamanFriendlyPosition{X: float64(index) * 5}
	}
	if err := actor.ConfigureKFCShamanHealingPositions(sim, positions, 12.5, "nearest-injured-reference"); err != nil {
		t.Fatal(err)
	}
	return sim, actor
}

func TestKFCShamanSupplementalCurrentStats(t *testing.T) {
	sim, baseline := kfcShamanSupplementalFixture(t, nil, false, false)
	defer sim.Cleanup()
	keys := map[string]stats.Stat{"health": stats.Health, "stamina": stats.Stamina, "strength": stats.Strength, "agility": stats.Agility, "intellect": stats.Intellect, "spirit": stats.Spirit, "spellDamage": stats.SpellDamage, "firePower": stats.FirePower, "shadowPower": stats.ShadowPower, "frostPower": stats.FrostPower, "fireResistance": stats.FireResistance, "frostResistance": stats.FrostResistance}
	for _, row := range kfcShamanSupplementalConsumes {
		c := kfcShamanSupplementalTestConsumes(row)
		if err := validateKFCShamanEquippedConsumes(c); err != nil {
			t.Fatal(err)
		}
		current, actor := kfcShamanSupplementalFixture(t, c, false, false)
		observed := map[string]float64{}
		for key, stat := range keys {
			want := row.Stats[key]
			if key == "health" {
				want += row.Stats["stamina"] * 10
			}
			observed[key] = actor.GetStat(stat) - baseline.GetStat(stat)
			kfcShamanNear(t, observed[key], want)
		}
		kfcShamanNear(t, actor.MaxMana()-baseline.MaxMana(), row.Stats["intellect"]*15)
		kfcShamanNear(t, actor.GetStat(stats.HealingPower)-baseline.GetStat(stats.HealingPower), 0)
		kfcShamanNear(t, actor.GetStat(stats.SpellPower)-baseline.GetStat(stats.SpellPower), 0)
		kfcShamanMeasure("SUPPLEMENTAL_STATS", map[string]interface{}{"item": row.ItemID, "stats": observed, "mana": actor.MaxMana() - baseline.MaxMana()})
		current.Cleanup()
	}
}

func TestKFCShamanSupplementalFortitudeIndependentValues(t *testing.T) {
	sim, base := kfcShamanSupplementalFixture(t, nil, false, true)
	defer sim.Cleanup()
	for value, health := range []float64{0, 120, 27, 200, 400} {
		current, actor := kfcShamanSupplementalFixture(t, &proto.Consumes{HealthElixir: proto.HealthElixir(value)}, false, true)
		kfcShamanNear(t, actor.MaxHealth()-base.MaxHealth(), health)
		kfcShamanMeasure("SUPPLEMENTAL_FORTITUDE", []float64{float64(value), actor.MaxHealth() - base.MaxHealth()})
		current.Cleanup()
	}
}

func TestKFCShamanSupplementalIntellectDependenciesAndKings(t *testing.T) {
	sim, base := kfcShamanSupplementalFixture(t, nil, true, true)
	defer sim.Cleanup()
	for _, row := range []struct {
		consumes                   *proto.Consumes
		intellect, stamina, spirit float64
	}{
		{consumes: &proto.Consumes{ZanzaBuff: 6}, intellect: 25},
		{consumes: &proto.Consumes{Alcohol: 5}, intellect: -5, spirit: 25},
		{consumes: &proto.Consumes{MiscConsumes: &proto.MiscConsumes{RaptorPunch: true}}, intellect: 4, stamina: -5},
		{consumes: &proto.Consumes{ZanzaBuff: 6, Alcohol: 5, MiscConsumes: &proto.MiscConsumes{RaptorPunch: true}}, intellect: 24, stamina: -5, spirit: 25},
	} {
		current, actor := kfcShamanSupplementalFixture(t, row.consumes, true, true)
		intellect := row.intellect * 1.1 * 1.1
		kfcShamanNear(t, actor.GetStat(stats.Intellect)-base.GetStat(stats.Intellect), intellect)
		kfcShamanNear(t, actor.GetStat(stats.SpellPower)-base.GetStat(stats.SpellPower), intellect*.3)
		kfcShamanNear(t, actor.MaxMana()-base.MaxMana(), intellect*15)
		kfcShamanNear(t, actor.MaxHealth()-base.MaxHealth(), row.stamina*1.1*10)
		kfcShamanNear(t, actor.GetStat(stats.Spirit)-base.GetStat(stats.Spirit), row.spirit*1.1)
		kfcShamanMeasure("SUPPLEMENTAL_DEPENDENCIES", []float64{intellect, actor.MaxMana() - base.MaxMana(), actor.MaxHealth() - base.MaxHealth()})
		current.Cleanup()
	}
}

func TestKFCShamanSupplementalDamagePowerDoesNotBecomeHealing(t *testing.T) {
	values := []float64{}
	for _, consumes := range []*proto.Consumes{nil, {SpellPowerBuff: 1}, {SpellPowerBuff: 2}, {SpellPowerBuff: 3}, {FirePowerBuff: 1, ShadowPowerBuff: 1, FrostPowerBuff: 1}} {
		sim, actor := kfcShamanSupplementalFixture(t, consumes, false, false)
		target := actor.kfcHealingPlayers()[1]
		target.RemoveHealth(sim, 9000)
		spell := actor.GetSpell(core.ActionID{SpellID: 10468})
		spell.BonusCritRating = -10000
		if !spell.Cast(sim, target) {
			t.Fatal("Actual direct heal rejected")
		}
		kfcShamanAdvance(t, sim, 1500*time.Millisecond)
		values = append(values, spell.SpellMetrics[target.UnitIndex].TotalHealing)
		sim.Cleanup()
	}
	for _, value := range values {
		kfcShamanNear(t, value, values[0])
	}
	kfcShamanMeasure("SUPPLEMENTAL_NO_DAMAGE_HEALING", values)
}

func TestKFCShamanSupplementalDurationAndStrictBoundaries(t *testing.T) {
	for _, row := range kfcShamanSupplementalConsumes {
		c := kfcShamanSupplementalTestConsumes(row)
		maximum := min(1800, float64(row.DurationMS)/1000)
		if err := validateKFCShamanSupplementalConsumeDuration(c, maximum); err != nil {
			t.Fatal(err)
		}
		if row.DurationMS < 1800000 && validateKFCShamanSupplementalConsumeDuration(c, maximum+.001) == nil {
			t.Fatal("Expired consume admitted", row.ItemID)
		}
	}
	for _, c := range []*proto.Consumes{{HealthElixir: 5}, {HealthElixir: -1}, {ZanzaBuff: 1}, {ZanzaBuff: 9}, {Alcohol: 6}, {FirePowerBuff: 2}, {SpellPowerBuff: 4}, {MainHandImbue: 21}, {DefaultPotion: 1}, {ManaRegenElixir: 1}, {MiscConsumes: &proto.MiscConsumes{JujuFlurry: true}}, {MiscConsumes: &proto.MiscConsumes{JujuEscape: true}}, {AttackPowerBuff: 1}} {
		if validateKFCShamanEquippedConsumes(c) == nil {
			t.Fatal("Unreviewed consume accepted", c)
		}
	}
	kfcShamanMeasure("SUPPLEMENTAL_BOUNDARIES", len(kfcShamanSupplementalConsumes))
}

func TestKFCShamanSupplementalDurationEnforcedByActualWorkload(t *testing.T) {
	request, frame := kfcShamanEquippedControl(t, "2-4-11", nil)
	request.Encounter.Duration = 301
	request.Raid.Parties[0].Players[0].Consumes = &proto.Consumes{MiscConsumes: &proto.MiscConsumes{RaptorPunch: true}}
	if _, err := RunKFCShamanEquippedHealingWorkload(context.Background(), request, frame); err == nil {
		t.Fatal("Expired Raptor Punch accepted by actual workload")
	}
	request.Encounter.Duration = 300
	result := kfcShamanEquippedResult(t, request, frame)
	kfcShamanMeasure("SUPPLEMENTAL_DURATION_WORKLOAD", result.Assignment)
}

func TestKFCShamanSupplementalActualNumericWireAndRepeat(t *testing.T) {
	request, frame := kfcShamanEquippedControl(t, "2-4-11", nil)
	request.Raid.Parties[0].Players[0].Consumes = &proto.Consumes{HealthElixir: 4, ZanzaBuff: 6, Alcohol: 5, SpellPowerBuff: 3, FirePowerBuff: 1, ShadowPowerBuff: 1, FrostPowerBuff: 1, MiscConsumes: &proto.MiscConsumes{RaptorPunch: true, JujuEmber: true, JujuChill: true}, MainHandImbue: 16, Flask: 3, ManaRegenElixir: 2}
	encoded, err := googleProto.Marshal(request)
	if err != nil {
		t.Fatal(err)
	}
	job := KFCShamanEquippedHealingJob{Schema: "kfc-shaman-equipped-job.v1", ID: "current-supplemental-wire", RequestBase64: base64.StdEncoding.EncodeToString(encoded), Workload: frame, Detail: true}
	body, err := json.Marshal(job)
	if err != nil {
		t.Fatal(err)
	}
	a := RunKFCShamanEquippedHealingJob(context.Background(), body)
	b := RunKFCShamanEquippedHealingJob(context.Background(), body)
	if a.Status != "complete" || b.Status != "complete" {
		t.Fatal("Actual supplemental wire rejected", a, b)
	}
	if a.Result.Equipped.RequestIdentity != b.Result.Equipped.RequestIdentity {
		t.Fatal("Repeated job identity changed")
	}
	kfcShamanNear(t, a.Result.Assignment.SupportHpsMean, b.Result.Assignment.SupportHpsMean)
	kfcShamanNear(t, a.Result.ManaRemainingMean, b.Result.ManaRemainingMean)
	kfcShamanMeasure("SUPPLEMENTAL_WIRE", map[string]interface{}{"payload": job, "reply": a})
}
