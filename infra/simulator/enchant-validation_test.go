package core

import (
	_ "embed"
	"encoding/json"
	"testing"

	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/stats"
	"google.golang.org/protobuf/encoding/protojson"
)

//go:embed kfc_default_enchants.json
var kfcDefaultEnchantTestJSON []byte

func TestKfcEnchantDefaultPresets(t *testing.T) {
	var data struct {
		Presets []struct {
			Profile       string          `json:"profile"`
			Variant       string          `json:"variant"`
			Class         proto.Class     `json:"playerClass"`
			Gear          json.RawMessage `json:"gear"`
			EnchantTotals []float64       `json:"enchantTotals"`
			Optimization  *struct{}       `json:"optimization"`
		} `json:"presets"`
	}
	if err := json.Unmarshal(kfcDefaultEnchantTestJSON, &data); err != nil {
		t.Fatal(err)
	}
	if len(data.Presets) != 28 {
		t.Fatalf("expected 28 default gear lists, got %d", len(data.Presets))
	}
	for _, preset := range data.Presets {
		t.Run(preset.Profile+"/"+preset.Variant, func(t *testing.T) {
			var spec proto.EquipmentSpec
			if err := protojson.Unmarshal(preset.Gear, &spec); err != nil {
				t.Fatal(err)
			}
			equipment := ProtoToEquipment(&spec)
			if equipment[proto.ItemSlot_ItemSlotTrinket1].ID == equipment[proto.ItemSlot_ItemSlotTrinket2].ID {
				t.Fatal("duplicate starter trinkets")
			}
			if preset.Optimization == nil && (preset.Profile == "warlock" || preset.Profile == "mage" || preset.Profile == "balance_druid" || preset.Profile == "shadow_priest" || preset.Profile == "smite_priest" || preset.Profile == "elemental_shaman") {
				if equipment[proto.ItemSlot_ItemSlotTrinket1].ID != 272438 || equipment[proto.ItemSlot_ItemSlotTrinket2].ID != 249469 {
					t.Fatal("caster starter did not receive spell-power/hit trinkets")
				}
				if equipment[proto.ItemSlot_ItemSlotTrinket1].Stats[stats.SpellPower] != 22 || equipment[proto.ItemSlot_ItemSlotTrinket2].Stats[stats.MeleeHit] != 0.9 {
					t.Fatal("caster trinket stats changed or were not loaded")
				}
			}
			var totals stats.Stats
			count := 0
			for slot, item := range equipment {
				if item.Enchant.EffectID == 0 {
					continue
				}
				count++
				if err := ValidateKfcEnchant(60, proto.ItemSlot(slot), item, preset.Class, nil); err != nil {
					t.Fatal(err)
				}
				if item.Enchant.EffectID == 1900 || item.Enchant.EffectID == 8217 {
					t.Fatal("unverified proc in default preset")
				}
				totals = totals.Add(item.Enchant.Stats)
			}
			if count < 9 {
				t.Fatalf("only %d enchants survived equipment loading", count)
			}
			if totals != stats.FromFloatArray(preset.EnchantTotals) {
				t.Fatalf("enchant totals differ between UI and engine: %v", totals)
			}
		})
	}
}

func TestKfcEnchantStaticParity(t *testing.T) {
	for _, tc := range []struct {
		id   int32
		stat stats.Stat
		want float64
	}{
		{11815, stats.AttackPower, 20}, {13965, stats.MeleeCrit, 1},
		{12930, stats.SpellPower, 29}, {13968, stats.SpellCrit, 1},
	} {
		item, ok := ItemsByID[tc.id]
		if !ok || item.Stats[tc.stat] != tc.want {
			t.Errorf("provisional Classic item %d missing or has unexpected stats", tc.id)
		}
	}
	for _, tc := range []struct {
		id   int32
		stat stats.Stat
		want float64
	}{
		{247, stats.Agility, 3}, {66, stats.Stamina, 3}, {41, stats.Stamina, 2},
		{24, stats.Intellect, 2}, {1892, stats.Stamina, 10}, {1891, stats.Strength, 4},
		{8483, stats.AttackPower, 4}, {8483, stats.RangedAttackPower, 4},
		{2505, stats.HealingPower, 55}, {2505, stats.SpellDamage, 19},
	} {
		enchant, ok := EnchantsByEffectID[tc.id]
		if !ok || enchant.Stats[tc.stat] != tc.want {
			t.Errorf("enchant %d stat %v = %v, want %v", tc.id, tc.stat, enchant.Stats[tc.stat], tc.want)
		}
	}
	if EnchantsByEffectID[2523].Stats[stats.MeleeHit] != 0 || EnchantsByEffectID[2523].Stats[stats.SpellHit] != 0 {
		t.Fatal("ranged-only scope leaked into generic hit")
	}
	e := Equipment{}
	e[proto.ItemSlot_ItemSlotBack].Enchant = EnchantsByEffectID[247]
	if e.Stats()[stats.Agility] != 3 {
		t.Fatal("enchant was lost or counted twice")
	}
}

func TestKfcEnchantCompatibility(t *testing.T) {
	chest := Item{Name: "fixture", Type: proto.ItemType_ItemTypeChest, ArmorType: proto.ArmorType_ArmorTypePlate, ItemLevel: 60, Enchant: EnchantsByEffectID[1891]}
	if err := ValidateKfcEnchant(60, proto.ItemSlot_ItemSlotChest, chest, proto.Class_ClassWarrior, nil); err != nil {
		t.Fatal(err)
	}
	if ValidateKfcEnchant(60, proto.ItemSlot_ItemSlotNeck, chest, proto.Class_ClassWarrior, nil) == nil {
		t.Fatal("chest enchant accepted on necklace")
	}
	chest.Enchant = Enchant{EffectID: 999999}
	if ValidateKfcEnchant(60, proto.ItemSlot_ItemSlotChest, chest, proto.Class_ClassWarrior, nil) == nil {
		t.Fatal("unknown enchant accepted")
	}
	shield := Item{Name: "shield", Type: proto.ItemType_ItemTypeWeapon, WeaponType: proto.WeaponType_WeaponTypeShield, ItemLevel: 60, Enchant: EnchantsByEffectID[1900]}
	if ValidateKfcEnchant(60, proto.ItemSlot_ItemSlotOffHand, shield, proto.Class_ClassWarrior, nil) == nil {
		t.Fatal("weapon enchant accepted on shield")
	}
	staff := Item{Name: "staff", Type: proto.ItemType_ItemTypeWeapon, WeaponType: proto.WeaponType_WeaponTypeStaff, HandType: proto.HandType_HandTypeTwoHand, ItemLevel: 60, Enchant: EnchantsByEffectID[2646]}
	if err := ValidateKfcEnchant(60, proto.ItemSlot_ItemSlotMainHand, staff, proto.Class_ClassDruid, nil); err != nil {
		t.Fatal(err)
	}
	staff.HandType = proto.HandType_HandTypeOneHand
	if ValidateKfcEnchant(60, proto.ItemSlot_ItemSlotMainHand, staff, proto.Class_ClassDruid, nil) == nil {
		t.Fatal("two-hand enchant accepted on one-hand weapon")
	}
}
