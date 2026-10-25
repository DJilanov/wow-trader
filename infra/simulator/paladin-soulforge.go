package holy

import "github.com/wowsims/classic/sim/core/stats"

// KFC_PALADIN_SOULFORGE_VALUES

func (holy *HolyPaladin) registerKFCSoulforgeHealing() {
	if !holy.Env.IsForever() {
		panic("Current Soulforge controls require Forever rules")
	}
	pieces := 0
	for _, item := range holy.Equipment {
		if item.SetID == 516 {
			pieces++
		}
	}
	if pieces >= 2 {
		holy.AddStats(stats.Stats{stats.ArcaneResistance: kfcSoulforgeResistances, stats.FireResistance: kfcSoulforgeResistances, stats.FrostResistance: kfcSoulforgeResistances, stats.NatureResistance: kfcSoulforgeResistances, stats.ShadowResistance: kfcSoulforgeResistances})
	}
	// The four-piece proc requires melee attacks, which the declared healing controller excludes.
	if pieces >= 6 {
		holy.AddStats(stats.Stats{stats.AttackPower: kfcSoulforgeAttackPower, stats.RangedAttackPower: kfcSoulforgeAttackPower})
	}
	if pieces >= 8 {
		holy.AddStat(stats.BonusArmor, kfcSoulforgeBonusArmor)
	}
}
