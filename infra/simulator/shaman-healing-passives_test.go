package restoration

import (
	"strings"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
)

func kfcShamanPassiveTalentString(fields map[string]int32) string {
	trees := [][]byte{[]byte(strings.Repeat("0", 16)), []byte(strings.Repeat("0", 18)), []byte(strings.Repeat("0", 16))}
	for field, rank := range fields {
		definition := kfcShamanPassiveDefinitions[field]
		trees[definition.Tree][definition.Index] = byte('0' + rank)
	}
	return strings.TrimRight(strings.Join([]string{strings.TrimRight(string(trees[0]), "0"), strings.TrimRight(string(trees[1]), "0"), strings.TrimRight(string(trees[2]), "0")}, "-"), "-")
}

func kfcShamanPassiveFixture(t *testing.T, fields map[string]int32, power float64) (*core.Simulation, *RestorationShaman, []*core.Unit) {
	t.Helper()
	request := kfcShamanRequest(power)
	request.Raid.Parties[0].Players[0].TalentsString = kfcShamanPassiveTalentString(fields)
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	resto := sim.Raid.Parties[0].Players[0].(*RestorationShaman)
	positions := map[int32]KFCShamanFriendlyPosition{}
	for _, unit := range resto.kfcHealingPlayers() {
		positions[unit.UnitIndex] = KFCShamanFriendlyPosition{}
	}
	if err := resto.ConfigureKFCShamanHealingPositions(sim, positions, 12.5, "nearest-injured-reference"); err != nil {
		t.Fatal(err)
	}
	return sim, resto, resto.kfcHealingPlayers()
}

func TestKFCShamanPassiveCastCostAndCriticalRankCurves(t *testing.T) {
	for rank := int32(0); rank <= 5; rank++ {
		sim, resto, _ := kfcShamanPassiveFixture(t, map[string]int32{"improved_healing_wave": rank, "tidal_focus": rank, "tidal_mastery": rank, "thundering_strikes": rank}, 0)
		wave := resto.GetSpell(core.ActionID{SpellID: 10396})
		lesser := resto.GetSpell(core.ActionID{SpellID: 10468})
		chain := resto.GetSpell(core.ActionID{SpellID: 10623})
		if wave.DefaultCast.CastTime != 3*time.Second-time.Duration(rank)*100*time.Millisecond || lesser.DefaultCast.CastTime != 1500*time.Millisecond || chain.DefaultCast.CastTime != 2500*time.Millisecond {
			t.Fatal("Wrong owned cast reduction")
		}
		for _, spell := range []*core.Spell{wave, lesser, chain} {
			kfcShamanNear(t, float64(spell.Cost.Multiplier), 100-float64(rank))
			kfcShamanNear(t, spell.BonusCritRating, float64(rank)*core.SpellCritRatingPerCritChance)
		}
		kfcShamanMeasure("PASSIVE_CAST_COST_CRIT", map[string]interface{}{"rank": rank, "cast": wave.DefaultCast.CastTime, "cost": wave.Cost.Multiplier, "crit": wave.BonusCritRating, "globalCrit": resto.GetStat(stats.SpellCrit)})
		sim.Cleanup()
	}
}

func TestKFCShamanPassiveHealingWayAndPurificationAffectBaseAndPowerOnce(t *testing.T) {
	for _, id := range []int32{10396, 10468, 10623} {
		values := []float64{}
		for _, enabled := range []bool{false, true} {
			fields := map[string]int32{}
			if enabled {
				fields = map[string]int32{"healing_way": 3, "purification": 5}
			}
			sim, resto, units := kfcShamanPassiveFixture(t, fields, 500)
			target := units[1]
			target.RemoveHealth(sim, 9000)
			spell := resto.GetSpell(core.ActionID{SpellID: id})
			spell.BonusCritRating = -10000
			before := target.CurrentHealth()
			if !spell.Cast(sim, target) {
				t.Fatal("Passive healing rejected")
			}
			kfcShamanAdvance(t, sim, spell.DefaultCast.CastTime)
			values = append(values, target.CurrentHealth()-before)
			sim.Cleanup()
		}
		factor := 1.1
		if id == 10396 {
			factor = 1.35
		}
		kfcShamanNear(t, values[1], values[0]*factor)
		kfcShamanMeasure("PASSIVE_HEALING", map[string]interface{}{"id": id, "values": values, "sameOperationStacking": "additive-reference"})
	}
	for rank, want := range []float64{0, .08, .17, .25} {
		kfcShamanNear(t, kfcShamanPassiveValue("healing_way", 0, int32(rank))/100, want)
	}
}

func TestKFCShamanPassiveIntellectAndMentalQuicknessDoNotDoubleHealingPower(t *testing.T) {
	values := []float64{}
	for _, enabled := range []bool{false, true} {
		fields := map[string]int32{}
		if enabled {
			fields = map[string]int32{"ancestral_knowledge": 5, "mental_quickness": 2}
		}
		sim, resto, units := kfcShamanPassiveFixture(t, fields, 0)
		intellect := resto.GetStat(stats.Intellect)
		power := resto.GetStat(stats.SpellPower)
		values = append(values, intellect, power, resto.GetStat(stats.HealingPower))
		target := units[1]
		target.RemoveHealth(sim, 9000)
		spell := resto.GetSpell(core.ActionID{SpellID: 10396})
		spell.BonusCritRating = -10000
		before := target.CurrentHealth()
		if !spell.Cast(sim, target) {
			t.Fatal("Intellect control rejected")
		}
		kfcShamanAdvance(t, sim, 3*time.Second)
		values = append(values, target.CurrentHealth()-before)
		sim.Cleanup()
	}
	kfcShamanNear(t, values[4], values[0]*1.1)
	kfcShamanNear(t, values[5]-values[1], values[4]*.3)
	kfcShamanNear(t, values[6], values[2])
	kfcShamanNear(t, values[7]-values[3], values[4]*.3*.857)
	kfcShamanMeasure("PASSIVE_INTELLECT", values)
}

func TestKFCShamanPassiveMindfulnessUsesAbsoluteLearnedCurves(t *testing.T) {
	for rank, want := range []float64{0, .17, .33, .5} {
		sim, resto, _ := kfcShamanPassiveFixture(t, map[string]int32{"mindfulness": int32(rank)}, 0)
		kfcShamanNear(t, resto.PseudoStats.SpiritRegenRateCasting, want)
		kfcShamanMeasure("PASSIVE_REGEN", map[string]interface{}{"rank": rank, "castingRegen": resto.PseudoStats.SpiritRegenRateCasting})
		sim.Cleanup()
	}
}

func TestKFCShamanPassiveRejectsUnqualifiedFieldsAndInvalidRankLookups(t *testing.T) {
	for _, talents := range []string{"5", "-000000000000000001", "--00000000000001"} {
		func() {
			defer func() {
				if recover() == nil {
					t.Fatal("Unqualified Shaman talent accepted")
				}
			}()
			request := kfcShamanRequest(0)
			request.Raid.Parties[0].Players[0].TalentsString = talents
			core.NewSim(request, simsignals.CreateSignals())
		}()
	}
	for _, entry := range []struct {
		field  string
		effect int
		rank   int32
	}{{"mental_quickness", 0, 3}, {"mindfulness", 0, -1}, {"totemic_focus", 0, 1}, {"mental_quickness", 2, 1}} {
		func() {
			defer func() {
				if recover() == nil {
					t.Fatal("Invalid source passive lookup accepted")
				}
			}()
			kfcShamanPassiveValue(entry.field, entry.effect, entry.rank)
		}()
	}
	kfcShamanMeasure("PASSIVE_GUARDS", 7)
}
