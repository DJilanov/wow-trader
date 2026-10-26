package restoration

import (
	"bytes"
	"compress/gzip"
	"context"
	_ "embed"
	"encoding/json"
	"io"
	"math"
	"reflect"
	"testing"

	"github.com/wowsims/classic/sim/core/proto"
)

//go:embed kfc_shaman_equipped_workload_cases.json.gz
var kfcShamanEquippedWorkloadCasesJSON []byte

type kfcShamanEquippedSourceCases struct {
	Sets []struct {
		ProfileID string               `json:"profileId"`
		SetID     int32                `json:"setId"`
		Pieces    int                  `json:"pieces"`
		Equipment *proto.EquipmentSpec `json:"equipment"`
	} `json:"sets"`
	Consumes []struct {
		Flask           int32 `json:"flask"`
		Food            int32 `json:"food"`
		MainHandImbue   int32 `json:"mainHandImbue"`
		DefaultPotion   int32 `json:"defaultPotion"`
		DefaultConjured int32 `json:"defaultConjured"`
		ManaRegenElixir int32 `json:"manaRegenElixir"`
	} `json:"consumes"`
}

func kfcShamanEquippedSourceData(t *testing.T) kfcShamanEquippedSourceCases {
	t.Helper()
	reader, err := gzip.NewReader(bytes.NewReader(kfcShamanEquippedWorkloadCasesJSON))
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Close()
	body, err := io.ReadAll(reader)
	if err != nil {
		t.Fatal(err)
	}
	var source kfcShamanEquippedSourceCases
	if err = json.Unmarshal(body, &source); err != nil {
		t.Fatal(err)
	}
	if len(source.Sets) != 34 || len(source.Consumes) != 1320 {
		t.Fatal("source coverage changed")
	}
	return source
}

func TestKFCShamanEquippedWorkloadCompleteSourceSetWitnesses(t *testing.T) {
	for _, entry := range kfcShamanEquippedSourceData(t).Sets {
		request, frame := kfcShamanEquippedControl(t, entry.ProfileID, nil)
		request.Raid.Parties[0].Players[0].Equipment = entry.Equipment
		kfcShamanEquippedTestPolicies(t, request.Raid.Parties[0].Players[0], &frame)
		result := kfcShamanEquippedResult(t, request, frame)
		if result.Assignment.SupportHpsMean <= 0 || result.SurvivalRate != 1 {
			t.Fatal("set witness failed actual healing", entry.SetID)
		}
		kfcShamanMeasure("EQUIPPED_WORKLOAD_SET", struct {
			SetID  int32                           `json:"setId"`
			Pieces int                             `json:"pieces"`
			Result *KFCShamanHealingWorkloadResult `json:"result"`
		}{entry.SetID, entry.Pieces, result})
	}
}

func TestKFCShamanEquippedWorkloadEveryCapturedConsumeContext(t *testing.T) {
	for index, row := range kfcShamanEquippedSourceData(t).Consumes {
		request, frame := kfcShamanEquippedControl(t, "2-4-11", nil)
		request.Raid.Parties[0].Players[0].Consumes = &proto.Consumes{Flask: proto.Flask(row.Flask), Food: proto.Food(row.Food), MainHandImbue: proto.WeaponImbue(row.MainHandImbue), DefaultPotion: proto.Potions(row.DefaultPotion), DefaultConjured: proto.Conjured(row.DefaultConjured), ManaRegenElixir: proto.ManaRegenElixir(row.ManaRegenElixir)}
		result := kfcShamanEquippedResult(t, request, frame)
		if result.SurvivalRate != 1 || result.Assignment.SupportHpsMean <= 0 {
			t.Fatal("consume context lost actual healing", index)
		}
		if kfcShamanEquippedItemUses(result, 12662) != 0 || kfcShamanEquippedItemUses(result, 13444) != 0 {
			t.Fatal("consume activated without decision", index)
		}
		kfcShamanMeasure("EQUIPPED_WORKLOAD_CONSUME", struct {
			Index           int    `json:"index"`
			RequestIdentity string `json:"requestIdentity"`
			HPS, Mana       float64
		}{index, result.Equipped.RequestIdentity, result.Assignment.SupportHpsMean, result.ManaRemainingMean})
	}
}

func TestKFCShamanEquippedWorkloadCooldownBoundsAndOwnership(t *testing.T) {
	changes := []func(*KFCShamanEquippedCooldown){
		func(row *KFCShamanEquippedCooldown) { row.ItemID = 999999 },
		func(row *KFCShamanEquippedCooldown) { row.ItemID = 18371 },
		func(row *KFCShamanEquippedCooldown) { row.MaximumUses = 0 },
		func(row *KFCShamanEquippedCooldown) { row.MaximumUses = 21 },
		func(row *KFCShamanEquippedCooldown) { row.EarliestMS = -1 },
		func(row *KFCShamanEquippedCooldown) { row.EarliestMS = math.MaxInt64 },
		func(row *KFCShamanEquippedCooldown) { row.EarliestMS = 12000 },
		func(row *KFCShamanEquippedCooldown) { row.RaidIndex = -2 },
		func(row *KFCShamanEquippedCooldown) { row.RaidIndex = 9 },
		func(row *KFCShamanEquippedCooldown) { row.RaidIndex = 1 },
		func(row *KFCShamanEquippedCooldown) { row.MinimumMissingMana = -1 },
		func(row *KFCShamanEquippedCooldown) { row.MinimumMissingHealth = math.NaN() },
		func(row *KFCShamanEquippedCooldown) { row.MinimumOwnHealth = math.Inf(1) },
	}
	for index, edit := range changes {
		request, frame := kfcShamanEquippedControl(t, "2-4-11", nil)
		request.Raid.Parties[0].Players[0].Consumes = &proto.Consumes{DefaultConjured: proto.Conjured_ConjuredDemonicRune}
		row := KFCShamanEquippedCooldown{ItemID: 12662, RaidIndex: -1, MaximumUses: 1}
		edit(&row)
		frame.Cooldowns = []KFCShamanEquippedCooldown{row}
		if _, err := RunKFCShamanEquippedHealingWorkload(context.Background(), request, frame); err == nil {
			t.Fatal("invalid cooldown accepted", index)
		}
	}
	request, frame := kfcShamanEquippedControl(t, "2-4-11", nil)
	request.Raid.Parties[0].Players[0].Consumes = &proto.Consumes{DefaultConjured: proto.Conjured_ConjuredDemonicRune}
	row := KFCShamanEquippedCooldown{ItemID: 12662, RaidIndex: -1, MaximumUses: 1}
	frame.Cooldowns = []KFCShamanEquippedCooldown{row, row}
	if _, err := RunKFCShamanEquippedHealingWorkload(context.Background(), request, frame); err == nil {
		t.Fatal("duplicate cooldown accepted")
	}
	kfcShamanMeasure("EQUIPPED_WORKLOAD_COOLDOWN_REJECTIONS", len(changes)+1)
}

func TestKFCShamanEquippedWorkloadAllFullTalentSeeds(t *testing.T) {
	for _, talents := range kfcShamanHealingStudySeeds {
		request, frame := kfcShamanEquippedControl(t, "2-4-11", nil)
		request.Raid.Parties[0].Players[0].TalentsString = talents
		kfcShamanEquippedTestPolicies(t, request.Raid.Parties[0].Players[0], &frame)
		result := kfcShamanEquippedResult(t, request, frame)
		if result.Assignment.SupportHpsMean <= 0 {
			t.Fatal("complete talent seed did not heal", talents)
		}
		kfcShamanMeasure("EQUIPPED_WORKLOAD_TALENTS", result)
	}
}

func TestKFCShamanEquippedWorkloadDormantGuardianDoesNotBecomeHealingActor(t *testing.T) {
	request, frame := kfcShamanEquippedControl(t, "2-4-11", map[int]int32{12: 16022})
	result := kfcShamanEquippedResult(t, request, frame)
	if result.Assignment.SupportHpsMean <= 0 || result.SurvivalRate != 1 {
		t.Fatal("dormant guardian changed the actual player assignment")
	}
	kfcShamanMeasure("EQUIPPED_WORKLOAD_DORMANT_GUARDIAN", result)
}

func TestKFCShamanEquippedWorkloadDirectUtilitiesAndHeadmaster(t *testing.T) {
	for _, item := range []int32{8346, 13937} {
		overrides := map[int]int32{6: 8346, 7: 4262}
		if item == 13937 {
			overrides = map[int]int32{14: 13937, 15: 0}
		}
		request, frame := kfcShamanEquippedControl(t, "2-4-11", overrides)
		if item == 13937 {
			frame.Effects.Utility.HeadmasterIntellect = "additive-reference"
		}
		frame.Cooldowns = []KFCShamanEquippedCooldown{{ItemID: item, RaidIndex: -1, EarliestMS: 1000, MinimumMissingHealth: 0, MaximumUses: 1}}
		result := kfcShamanEquippedResult(t, request, frame)
		if kfcShamanEquippedItemUses(result, item) != 1 || result.Equipped.CooldownUsesMean[0] != 1 {
			t.Fatal("actual owned utility use missing", item)
		}
		kfcShamanMeasure("EQUIPPED_WORKLOAD_DIRECT_UTILITY", result)
	}
}

func TestKFCShamanEquippedWorkloadSelfShieldCannotPadExternalAbsorbs(t *testing.T) {
	request, frame := kfcShamanEquippedControl(t, "2-4-11", map[int]int32{10: 13143})
	request.Raid.Parties[0].Players[0].Consumes = &proto.Consumes{DefaultConjured: proto.Conjured_ConjuredDemonicRune}
	frame.Workload.Damage = nil
	frame.Workload.Priorities = []KFCShamanHealingPriority{{SpellID: 10396, RaidIndex: -1, MinimumMissingHealth: 1}}
	frame.Cooldowns = []KFCShamanEquippedCooldown{{ItemID: 13143, RaidIndex: -1, MaximumUses: 1}, {ItemID: 12662, RaidIndex: -1, MaximumUses: 1}}
	result := kfcShamanEquippedResult(t, request, frame)
	if kfcShamanWorkloadCasts(result, 17252) != 1 || kfcShamanEquippedItemUses(result, 12662) != 1 || result.Metrics.AbsorbedHps.Avg <= 0 {
		t.Fatal("actual self shield/Rune interaction missing")
	}
	kfcShamanNear(t, result.Assignment.SupportHpsMean, 0)
	kfcShamanNear(t, result.Assignment.AbsorbedHpsMean, 0)
	kfcShamanNear(t, result.Assignment.DamageDemandMean, 0)
	kfcShamanMeasure("EQUIPPED_WORKLOAD_SELF_SHIELD_LEDGER", result)
}

func TestKFCShamanEquippedWorkloadCompleteRequestIdentity(t *testing.T) {
	identities := map[string]bool{}
	for index := 0; index < 8; index++ {
		request, frame := kfcShamanEquippedControl(t, "2-4-11", nil)
		request.Raid.Parties[0].Players[0].Consumes = &proto.Consumes{DefaultPotion: proto.Potions_MajorManaPotion, DefaultConjured: proto.Conjured_ConjuredDemonicRune}
		frame.Cooldowns = []KFCShamanEquippedCooldown{{ItemID: 13444, RaidIndex: -1, MinimumMissingMana: 500, MaximumUses: 1}, {ItemID: 12662, RaidIndex: -1, MinimumMissingMana: 500, MaximumUses: 1}}
		switch index {
		case 1:
			request.SimOptions.RandomSeed++
		case 2:
			request.SimOptions.Iterations = 2
		case 3:
			request.Raid.Parties[0].Players[0].Equipment.Items[0].Enchant = 2544
		case 4:
			request.Raid.Parties[0].Players[0].Consumes.Food = proto.Food(1)
		case 5:
			request.Raid.Parties[0].Players[0].Race = proto.Race_RaceOrc
		case 6:
			frame.Cooldowns[0], frame.Cooldowns[1] = frame.Cooldowns[1], frame.Cooldowns[0]
		case 7:
			frame.MP5Model = "per-second-reference"
			request.Raid.Parties[0].Players[0].ForeverMp5PerSecond = true
		}
		result := kfcShamanEquippedResult(t, request, frame)
		if identities[result.Equipped.RequestIdentity] {
			t.Fatal("distinct complete numerical inputs share an identity", index)
		}
		identities[result.Equipped.RequestIdentity] = true
		repeat := kfcShamanEquippedResult(t, request, frame)
		if repeat.Equipped.RequestIdentity != result.Equipped.RequestIdentity {
			t.Fatal("same complete input changed identity")
		}
	}
	kfcShamanMeasure("EQUIPPED_WORKLOAD_REQUEST_IDENTITIES", len(identities))
}

func TestKFCShamanEquippedWorkloadEveryOwnedPolicyIsRequired(t *testing.T) {
	source := kfcShamanEquippedSourceData(t)
	covered := map[string]bool{}
	for _, entry := range source.Sets {
		request, frame := kfcShamanEquippedControl(t, entry.ProfileID, nil)
		request.Raid.Parties[0].Players[0].Equipment = entry.Equipment
		kfcShamanEquippedTestPolicies(t, request.Raid.Parties[0].Players[0], &frame)
		for index := 0; index < reflect.TypeOf(frame.Effects).NumField(); index++ {
			copy := frame
			copy.Effects = frame.Effects
			field := reflect.ValueOf(&copy.Effects).Elem().Field(index)
			name := reflect.TypeOf(copy.Effects).Field(index).Name
			if field.IsNil() || covered[name] {
				continue
			}
			field.SetZero()
			if _, err := RunKFCShamanEquippedHealingWorkload(context.Background(), request, copy); err == nil {
				t.Fatal("missing equipped policy accepted", name)
			}
			covered[name] = true
		}
	}
	for _, name := range []string{"Relic", "Elements", "FiveThunders", "CastSets", "HealthRegen", "Reactive"} {
		if !covered[name] {
			t.Fatal("missing source policy witness", name)
		}
	}
	kfcShamanMeasure("EQUIPPED_WORKLOAD_POLICY_OWNERSHIP", len(covered))
}
