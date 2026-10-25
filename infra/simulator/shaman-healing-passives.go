package restoration

import (
	"fmt"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/stats"
	"github.com/wowsims/classic/sim/shaman"
	"google.golang.org/protobuf/reflect/protoreflect"
)

type kfcShamanPassiveDefinition struct {
	Tree, Index int
	Maximum     int32
	Effects     [][]float64
}

// KFC_SHAMAN_HEALING_PASSIVE_VALUES

func newKFCShamanPassiveAgent(character *core.Character, player *proto.Player) *RestorationShaman {
	resto := &RestorationShaman{Shaman: shaman.NewShaman(character, player.TalentsString, proto.ShamanWeaponImbue(0), proto.ShamanWeaponImbue(0))}
	resto.Talents.ProtoReflect().Range(func(field protoreflect.FieldDescriptor, value protoreflect.Value) bool {
		definition, ok := kfcShamanPassiveDefinitions[string(field.Name())]
		if !ok || field.Kind() != protoreflect.Int32Kind || value.Int() < 0 || value.Int() > int64(definition.Maximum) {
			panic(fmt.Sprintf("Unqualified Shaman passive field: %s", field.Name()))
		}
		return true
	})
	return resto
}

func kfcShamanPassiveValue(field string, effect int, rank int32) float64 {
	definition, ok := kfcShamanPassiveDefinitions[field]
	if !ok || rank < 0 || rank > definition.Maximum || effect < 0 || effect >= len(definition.Effects) {
		panic("Invalid Shaman passive source lookup")
	}
	return definition.Effects[effect][rank]
}

// Only these source-bound passives are admitted; the inherited offensive and active talent handlers are not invoked.
func (resto *RestorationShaman) ApplyTalents() {
	talents := resto.Talents
	if talents.AncestralKnowledge > 0 {
		resto.MultiplyStat(stats.Intellect, 1+kfcShamanPassiveValue("ancestral_knowledge", 0, talents.AncestralKnowledge)/100)
	}
	if talents.MentalQuickness > 0 {
		resto.AddStatDependency(stats.Intellect, stats.SpellPower, kfcShamanPassiveValue("mental_quickness", 0, talents.MentalQuickness)/100)
	}
	critical := kfcShamanPassiveValue("thundering_strikes", 0, talents.ThunderingStrikes)
	resto.AddStat(stats.MeleeCrit, core.CritRatingPerCritChance*critical)
	resto.AddStat(stats.SpellCrit, core.SpellCritRatingPerCritChance*critical)
	resto.PseudoStats.SpiritRegenRateCasting += kfcShamanPassiveValue("mindfulness", 0, talents.Mindfulness) / 100

	resto.OnSpellRegistered(func(spell *core.Spell) {
		var selected *kfcShamanHealingRank
		for index := range kfcShamanHealingRanks {
			if kfcShamanHealingRanks[index].ID == spell.ActionID.SpellID {
				selected = &kfcShamanHealingRanks[index]
				break
			}
		}
		if selected == nil {
			return
		}
		if spell.Cost != nil {
			spell.Cost.Multiplier += int32(kfcShamanPassiveValue("tidal_focus", 0, talents.TidalFocus))
		}
		spell.BonusCritRating += core.SpellCritRatingPerCritChance * kfcShamanPassiveValue("tidal_mastery", 0, talents.TidalMastery)
		modifier := kfcShamanPassiveValue("purification", 0, talents.Purification)
		if selected.Family == "healing-wave" {
			spell.DefaultCast.CastTime += time.Duration(kfcShamanPassiveValue("improved_healing_wave", 0, talents.ImprovedHealingWave)) * time.Millisecond
			modifier += kfcShamanPassiveValue("healing_way", 0, talents.HealingWay)
		}
		// The two same-operation source modifiers are added in this explicitly declared reference.
		spell.DamageMultiplierAdditive += modifier / 100
	})
}
