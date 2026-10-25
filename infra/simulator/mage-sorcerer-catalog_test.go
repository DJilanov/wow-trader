//go:build with_db

package mage

import (
	"fmt"
	"testing"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/stats"
)

func TestKfcSorcererCurrentCatalogStats(t *testing.T) {
	_, baseline := sorcererSim(0, proto.Ruleset_RulesetForever, false, false, 5)
	for _, pieces := range []int{1, 2, 4, 6, 8} {
		t.Run(fmt.Sprint(pieces), func(t *testing.T) {
			total := stats.Stats{}
			for _, id := range sorcererIDs[:pieces] {
				item, ok := core.ItemsByID[id]
				if !ok || item.SetID != 517 || item.Stats[stats.Intellect] <= 0 ||
					len(item.ClassAllowlist) != 1 || item.ClassAllowlist[0] != proto.Class_ClassMage {
					t.Fatalf("missing or incorrect current Mage item %d", id)
				}
				total = total.Add(item.Stats)
			}
			_, mage := sorcererSim(pieces, proto.Ruleset_RulesetForever, false, false, 5)
			for _, stat := range []stats.Stat{stats.Intellect, stats.SpellPower, stats.MP5, stats.BonusArmor,
				stats.ArcaneResistance, stats.FireResistance, stats.FrostResistance, stats.NatureResistance, stats.ShadowResistance} {
				want := total[stat]
				if pieces >= 2 && stat >= stats.ArcaneResistance && stat <= stats.ShadowResistance {
					want += 8
				}
				if pieces >= 6 && stat == stats.SpellPower {
					want += 23
				}
				if pieces >= 8 && stat == stats.BonusArmor {
					want += 200
				}
				sorcererNear(t, mage.GetStat(stat)-baseline.GetStat(stat), want)
			}
			wantArmor := total[stats.Armor] + 2*total[stats.Agility]
			if pieces >= 8 {
				wantArmor += 200
			}
			sorcererNear(t, mage.GetStat(stats.Armor)-baseline.GetStat(stats.Armor), wantArmor)
			if mage.GetAura("Sudden Insight") != nil {
				t.Fatal("current base items inherited alternate mana proc")
			}
		})
	}
}
