//go:build with_db

package feral_test

import (
	"fmt"
	"testing"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/stats"
)

func feralheartDpsCurrentItemStats(t *testing.T, pieces int) stats.Stats {
	t.Helper()
	var total stats.Stats
	for _, id := range feralheartDpsIDs[:pieces] {
		item, ok := core.ItemsByID[id]
		if !ok || item.SetID != 513 || item.Stats[stats.Intellect] <= 0 || len(item.ClassAllowlist) != 1 || item.ClassAllowlist[0] != proto.Class_ClassDruid {
			t.Fatalf("missing or incorrect current Feralheart item %d", id)
		}
		total = total.Add(item.Stats)
	}
	return total
}

func TestKfcFeralheartDpsCurrentCatalogStats(t *testing.T) {
	for _, caster := range []bool{false, true} {
		_, bare := feralheartDpsSim(0, caster, proto.Ruleset_RulesetForever)
		for _, pieces := range []int{1, 2, 4, 6, 8} {
			t.Run(fmt.Sprintf("caster-%v/pieces-%d", caster, pieces), func(t *testing.T) {
				total := feralheartDpsCurrentItemStats(t, pieces)
				_, wearer := feralheartDpsSim(pieces, caster, proto.Ruleset_RulesetForever)
				for _, stat := range []stats.Stat{stats.Intellect, stats.Spirit, stats.SpellPower, stats.SpellDamage, stats.HealingPower, stats.RangedAttackPower, stats.MP5, stats.BonusArmor,
					stats.ArcaneResistance, stats.FireResistance, stats.FrostResistance, stats.NatureResistance, stats.ShadowResistance} {
					want := total[stat]
					if pieces >= 2 && stat >= stats.ArcaneResistance && stat <= stats.ShadowResistance {
						want += 8
					}
					if pieces >= 6 && (stat == stats.SpellDamage || stat == stats.HealingPower) {
						want += 15
					}
					if pieces >= 6 && stat == stats.RangedAttackPower {
						want += 26
					}
					if pieces >= 8 && stat == stats.BonusArmor {
						want += 200
					}
					feralheartDpsNear(t, wearer.GetStat(stat)-bare.GetStat(stat), want)
				}
				armor := total[stats.Armor] + 2*total[stats.Agility]
				attackPower := total[stats.AttackPower] + 2*total[stats.Strength]
				if !caster {
					attackPower += total[stats.Agility]
				}
				if pieces >= 6 {
					attackPower += 26
				}
				if pieces >= 8 {
					armor += 200
				}
				feralheartDpsNear(t, wearer.GetStat(stats.AttackPower)-bare.GetStat(stats.AttackPower), attackPower)
				feralheartDpsNear(t, wearer.GetStat(stats.Armor)-bare.GetStat(stats.Armor), armor)
			})
		}
	}
}

func TestKfcFeralheartDpsBearBonusArmor(t *testing.T) {
	total := feralheartDpsCurrentItemStats(t, 8)
	bareRun, bare := feralheartDpsSim(0, false, proto.Ruleset_RulesetForever)
	fullRun, full := feralheartDpsSim(8, false, proto.Ruleset_RulesetForever)
	bare.CancelShapeshift(bareRun)
	full.CancelShapeshift(fullRun)
	bare.BearFormAura.Activate(bareRun)
	full.BearFormAura.Activate(fullRun)
	feralheartDpsNear(t, full.GetStat(stats.BonusArmor)-bare.GetStat(stats.BonusArmor), 200)
	// Bear multiplies equipped armor; the separate set bonus remains a flat 200.
	feralheartDpsNear(t, full.GetStat(stats.Armor)-bare.GetStat(stats.Armor), 4.6*total[stats.Armor]+2*total[stats.Agility]+200)
}
