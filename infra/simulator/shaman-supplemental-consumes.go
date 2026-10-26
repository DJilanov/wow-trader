package restoration

import (
	_ "embed"
	"encoding/json"
	"fmt"

	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/stats"
	googleProto "google.golang.org/protobuf/proto"
)

//go:embed kfc_shaman_supplemental_consume_rules.json
var kfcShamanSupplementalConsumeJSON []byte

type kfcShamanSupplementalConsume struct {
	Field      string             `json:"field"`
	Value      int32              `json:"value"`
	ItemID     int32              `json:"itemId"`
	DurationMS int64              `json:"durationMs"`
	Stats      map[string]float64 `json:"stats"`
}

var kfcShamanSupplementalConsumes = func() []kfcShamanSupplementalConsume {
	var rules struct {
		Schema string                         `json:"schema"`
		Items  []kfcShamanSupplementalConsume `json:"items"`
	}
	if err := json.Unmarshal(kfcShamanSupplementalConsumeJSON, &rules); err != nil || rules.Schema != "kfc-shaman-supplemental-consume-rules.v1" || len(rules.Items) != 23 {
		panic("Invalid captured Shaman supplemental consume rules")
	}
	return rules.Items
}()

func validateKFCShamanEquippedConsumes(consumes *proto.Consumes) error {
	if consumes == nil {
		return nil
	}
	allowed := &proto.Consumes{Flask: consumes.Flask, Food: consumes.Food, MainHandImbue: consumes.MainHandImbue,
		DefaultPotion: consumes.DefaultPotion, DefaultConjured: consumes.DefaultConjured, ManaRegenElixir: consumes.ManaRegenElixir,
		HealthElixir: consumes.HealthElixir, ZanzaBuff: consumes.ZanzaBuff, Alcohol: consumes.Alcohol,
		SpellPowerBuff: consumes.SpellPowerBuff, FirePowerBuff: consumes.FirePowerBuff, ShadowPowerBuff: consumes.ShadowPowerBuff, FrostPowerBuff: consumes.FrostPowerBuff}
	if misc := consumes.MiscConsumes; misc != nil {
		allowed.MiscConsumes = &proto.MiscConsumes{RaptorPunch: misc.RaptorPunch, JujuEmber: misc.JujuEmber, JujuChill: misc.JujuChill}
	}
	food := int32(consumes.Food)
	if !googleProto.Equal(consumes, allowed) || consumes.Flask < 0 || consumes.Flask > 4 || food < 0 || food > 11 || food == 5 ||
		(consumes.MainHandImbue != 0 && consumes.MainHandImbue != 16 && consumes.MainHandImbue != 20) ||
		(consumes.DefaultPotion != 0 && consumes.DefaultPotion != 5) || (consumes.DefaultConjured != 0 && consumes.DefaultConjured != 2) ||
		(consumes.ManaRegenElixir != 0 && consumes.ManaRegenElixir != 2) || consumes.HealthElixir < 0 || consumes.HealthElixir > 4 ||
		(consumes.ZanzaBuff != 0 && (consumes.ZanzaBuff < 4 || consumes.ZanzaBuff > 8)) || consumes.Alcohol < 0 || consumes.Alcohol > 5 ||
		consumes.SpellPowerBuff < 0 || consumes.SpellPowerBuff > 3 || consumes.FirePowerBuff < 0 || consumes.FirePowerBuff > 1 ||
		consumes.ShadowPowerBuff < 0 || consumes.ShadowPowerBuff > 1 || consumes.FrostPowerBuff < 0 || consumes.FrostPowerBuff > 1 {
		return fmt.Errorf("Shaman consumes outside the captured nonraid supplemental axes")
	}
	return nil
}

func kfcShamanSupplementalConsumeValue(consumes *proto.Consumes, field string) int32 {
	switch field {
	case "healthElixir":
		return int32(consumes.GetHealthElixir())
	case "zanzaBuff":
		return int32(consumes.GetZanzaBuff())
	case "alcohol":
		return int32(consumes.GetAlcohol())
	case "spellPowerBuff":
		return int32(consumes.GetSpellPowerBuff())
	case "firePowerBuff":
		return int32(consumes.GetFirePowerBuff())
	case "shadowPowerBuff":
		return int32(consumes.GetShadowPowerBuff())
	case "frostPowerBuff":
		return int32(consumes.GetFrostPowerBuff())
	case "miscConsumes.raptorPunch":
		if consumes.GetMiscConsumes().GetRaptorPunch() {
			return 1
		}
	case "miscConsumes.jujuEmber":
		if consumes.GetMiscConsumes().GetJujuEmber() {
			return 1
		}
	case "miscConsumes.jujuChill":
		if consumes.GetMiscConsumes().GetJujuChill() {
			return 1
		}
	default:
		panic("Unknown captured Shaman consume family")
	}
	return 0
}

func validateKFCShamanSupplementalConsumeDuration(consumes *proto.Consumes, seconds float64) error {
	if !kfcFinite(seconds) || seconds < 1 || seconds > 1800 {
		return fmt.Errorf("Invalid Shaman consume assignment duration")
	}
	for _, row := range kfcShamanSupplementalConsumes {
		if kfcShamanSupplementalConsumeValue(consumes, row.Field) == row.Value && seconds*1000 > float64(row.DurationMS) {
			return fmt.Errorf("Shaman consume item %d expires before assignment ends; no refresh is admitted", row.ItemID)
		}
	}
	return nil
}

// The shared engine already applies every other captured payload. Keep the new
// Forever values local to Restoration and leave existing enum meanings intact.
func (resto *RestorationShaman) applyKFCShamanSupplementalConsumes() {
	if !resto.Env.IsForever() {
		return
	}
	for _, row := range kfcShamanSupplementalConsumes {
		if kfcShamanSupplementalConsumeValue(resto.Consumes, row.Field) != row.Value {
			continue
		}
		switch row.ItemID {
		case 250334, 250335:
			resto.AddStat(stats.Health, row.Stats["health"])
		case 250342:
			resto.AddStat(stats.SpellDamage, row.Stats["spellDamage"])
		}
	}
}
