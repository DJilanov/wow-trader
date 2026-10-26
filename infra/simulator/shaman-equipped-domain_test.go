package restoration

import (
	"bytes"
	"compress/gzip"
	"context"
	_ "embed"
	"encoding/json"
	"io"
	"sync"
	"testing"

	"github.com/wowsims/classic/sim/core/proto"
	"google.golang.org/protobuf/encoding/protowire"
	googleProto "google.golang.org/protobuf/proto"
)

//go:embed kfc_shaman_equipped_domain_test_data.json.gz
var kfcShamanEquippedTestJSON []byte

type kfcShamanEquippedTestProfile struct {
	ID          string               `json:"id"`
	Race        proto.Race           `json:"race"`
	Professions []int32              `json:"professions"`
	Seed        *proto.EquipmentSpec `json:"seed"`
}

type kfcShamanEquippedTestLoadout struct {
	ProfileIndex int                  `json:"profileIndex"`
	Equipment    *proto.EquipmentSpec `json:"equipment"`
	Valid        bool                 `json:"valid"`
	Label        string               `json:"label"`
}

type kfcShamanEquippedTestData struct {
	DomainIdentity string                         `json:"domainIdentity"`
	Profiles       []kfcShamanEquippedTestProfile `json:"profiles"`
	SingleSlots    [][6]int32                     `json:"singleSlots"`
	EnchantCases   [][6]int32                     `json:"enchantCases"`
	Loadouts       []kfcShamanEquippedTestLoadout `json:"loadouts"`
}

var kfcShamanEquippedTestsOnce sync.Once
var kfcShamanEquippedTests kfcShamanEquippedTestData
var kfcShamanEquippedTestsError error

func kfcShamanEquipmentTestData(t *testing.T) *kfcShamanEquippedTestData {
	t.Helper()
	kfcShamanEquippedTestsOnce.Do(func() {
		reader, err := gzip.NewReader(bytes.NewReader(kfcShamanEquippedTestJSON))
		if err != nil {
			kfcShamanEquippedTestsError = err
			return
		}
		defer reader.Close()
		body, err := io.ReadAll(reader)
		if err != nil {
			kfcShamanEquippedTestsError = err
			return
		}
		kfcShamanEquippedTestsError = json.Unmarshal(body, &kfcShamanEquippedTests)
	})
	if kfcShamanEquippedTestsError != nil {
		t.Fatal(kfcShamanEquippedTestsError)
	}
	return &kfcShamanEquippedTests
}

func kfcShamanEquipmentTestPlayer(profile kfcShamanEquippedTestProfile, equipment *proto.EquipmentSpec) *proto.Player {
	return &proto.Player{Class: proto.Class_ClassShaman, Level: 60, Race: profile.Race,
		Profession1: proto.Profession(profile.Professions[0]), Profession2: proto.Profession(profile.Professions[1]),
		Equipment: googleProto.Clone(equipment).(*proto.EquipmentSpec)}
}

func TestKFCShamanEquippedAdmissionAllProfilesAndSourceLoadouts(t *testing.T) {
	data := kfcShamanEquipmentTestData(t)
	identity, err := KFCShamanEquippedDomainIdentity()
	if err != nil || identity != data.DomainIdentity || len(data.Profiles) != 90 {
		t.Fatal("domain identity or profile coverage changed", err)
	}
	accepted, rejected, conditional := 0, 0, 0
	for _, entry := range data.Loadouts {
		profile := data.Profiles[entry.ProfileIndex]
		player := kfcShamanEquipmentTestPlayer(profile, entry.Equipment)
		result, err := ValidateKFCShamanEquippedLoadout(player, profile.ID, identity)
		if (err == nil) != entry.Valid {
			t.Fatalf("source loadout %s profile %s: want %v, got %v", entry.Label, profile.ID, entry.Valid, err)
		}
		if entry.Valid {
			accepted++
			if len(result.ConditionalItemIDs) > 0 {
				conditional++
			}
			if result.WorkloadAdmission || result.NumericalQualified || result.PublicationAllowed {
				t.Fatal("equipment gate granted combat, numerical or publication qualification")
			}
		} else {
			rejected++
		}
	}
	if accepted < 4800 || rejected == 0 || conditional < 4620 {
		t.Fatal("missing complete source reward or ownership comparisons", accepted, rejected, conditional)
	}
	kfcShamanMeasure("EQUIPPED_SOURCE_LOADOUTS", []int{len(data.Profiles), accepted, rejected, conditional})
}

func kfcShamanEquipmentCheckSlotCases(t *testing.T, cases [][6]int32) (int, int) {
	t.Helper()
	data := kfcShamanEquipmentTestData(t)
	accepted, rejected := 0, 0
	for index, row := range cases {
		profile := data.Profiles[row[0]]
		player := kfcShamanEquipmentTestPlayer(profile, profile.Seed)
		if row[4] != 0 {
			player.Equipment.Items[14] = &proto.ItemSpec{Id: row[4]}
		}
		player.Equipment.Items[row[1]] = &proto.ItemSpec{Id: row[2], Enchant: row[3]}
		_, err := ValidateKFCShamanEquippedLoadout(player, profile.ID, data.DomainIdentity)
		if (err == nil) != (row[5] == 1) {
			t.Fatalf("source comparison %d %v: got %v", index, row, err)
		}
		if err == nil {
			accepted++
		} else {
			rejected++
		}
	}
	return accepted, rejected
}

func TestKFCShamanEquippedAdmissionEveryProfileSlotCandidate(t *testing.T) {
	data := kfcShamanEquipmentTestData(t)
	accepted, rejected := kfcShamanEquipmentCheckSlotCases(t, data.SingleSlots)
	if accepted < 100000 || rejected == 0 {
		t.Fatal("missing candidate/ownership comparisons", accepted, rejected)
	}
	kfcShamanMeasure("EQUIPPED_SLOT_CANDIDATES", []int{accepted, rejected})
}

func TestKFCShamanEquippedAdmissionEveryCompatibleEnchantPair(t *testing.T) {
	data := kfcShamanEquipmentTestData(t)
	accepted, rejected := kfcShamanEquipmentCheckSlotCases(t, data.EnchantCases)
	if accepted < 5000 || rejected == 0 {
		t.Fatal("missing actual compatible and wrong-slot enchant comparisons", accepted, rejected)
	}
	kfcShamanMeasure("EQUIPPED_ENCHANT_PAIRS", []int{accepted, rejected})
}

func TestKFCShamanEquippedAdmissionMalformedAndWrongProfile(t *testing.T) {
	data := kfcShamanEquipmentTestData(t)
	profile := data.Profiles[0]
	base := kfcShamanEquipmentTestPlayer(profile, profile.Seed)
	changes := []func(*proto.Player){
		func(player *proto.Player) { player.Level = 59 },
		func(player *proto.Player) { player.Class = proto.Class_ClassPaladin },
		func(player *proto.Player) { player.Race = proto.Race_RaceUnknown },
		func(player *proto.Player) { player.Race = proto.Race(11) },
		func(player *proto.Player) { player.Race = proto.Race_RaceTroll },
		func(player *proto.Player) { player.Race = proto.Race_RaceSkyborneWindshaper },
		func(player *proto.Player) { player.Profession1 = player.Profession2 },
		func(player *proto.Player) { player.Profession1 = proto.Profession_ProfessionUnknown },
		func(player *proto.Player) { player.Equipment = nil },
		func(player *proto.Player) { player.Equipment.Items = player.Equipment.Items[:16] },
		func(player *proto.Player) { player.Equipment.Items[0] = nil },
		func(player *proto.Player) { player.Equipment.Items[0].Id = 0 },
		func(player *proto.Player) { player.Equipment.Items[0].Id = -1 },
		func(player *proto.Player) { player.Equipment.Items[0].Id = 999999999 },
		func(player *proto.Player) { player.Equipment.Items[0].RandomSuffix = 1 },
		func(player *proto.Player) { player.Equipment.Items[0].Enchant = -1 },
		func(player *proto.Player) { player.Equipment.Items[0].Enchant = 2566 },
		func(player *proto.Player) { player.Equipment.Items[0].Enchant = 2587 },
		func(player *proto.Player) { player.Equipment.Items[15].Enchant = 1 },
		func(player *proto.Player) { player.Equipment.Items[15].Id = player.Equipment.Items[14].Id },
		func(player *proto.Player) {
			player.ProtoReflect().SetUnknown(protowire.AppendVarint(protowire.AppendTag(nil, 999, protowire.VarintType), 1))
		},
		func(player *proto.Player) {
			player.Equipment.Items[0].ProtoReflect().SetUnknown(protowire.AppendVarint(protowire.AppendTag(nil, 999, protowire.VarintType), 1))
		},
	}
	for index, mutate := range changes {
		player := googleProto.Clone(base).(*proto.Player)
		mutate(player)
		if _, err := ValidateKFCShamanEquippedLoadout(player, profile.ID, data.DomainIdentity); err == nil {
			t.Fatalf("malformed request %d accepted", index)
		}
	}
	for _, entry := range []struct {
		player            *proto.Player
		profile, identity string
	}{{nil, profile.ID, data.DomainIdentity}, {base, "unknown", data.DomainIdentity}, {base, profile.ID, ""}, {base, profile.ID, "wrong-model"}} {
		if _, err := ValidateKFCShamanEquippedLoadout(entry.player, entry.profile, entry.identity); err == nil {
			t.Fatal("unknown player/profile/domain accepted")
		}
	}
	kfcShamanMeasure("EQUIPPED_REJECTIONS", len(changes)+4)
}

func TestKFCShamanEquippedAdmissionPreservesInputAndCopiesReceipt(t *testing.T) {
	data := kfcShamanEquipmentTestData(t)
	profile := data.Profiles[len(data.Profiles)-1]
	player := kfcShamanEquipmentTestPlayer(profile, profile.Seed)
	player.Profession1, player.Profession2 = player.Profession2, player.Profession1
	before := googleProto.Clone(player)
	result, err := ValidateKFCShamanEquippedLoadout(player, profile.ID, data.DomainIdentity)
	if err != nil || !googleProto.Equal(before, player) {
		t.Fatal("request changed", err)
	}
	result.Equipment.Items[0].Id = 999
	result.Professions[0] = 999
	result.AccessPolicy[0] = 'x'
	next, err := ValidateKFCShamanEquippedLoadout(player, profile.ID, data.DomainIdentity)
	if err != nil || next.Equipment.Items[0].Id == 999 || next.Professions[0] == 999 || next.AccessPolicy[0] == 'x' || !googleProto.Equal(before, player) {
		t.Fatal("receipt aliases caller or compiled domain", err)
	}
	kfcShamanMeasure("EQUIPPED_CALLER_PRESERVATION", next)
}

func TestKFCShamanEquippedAdmissionDoesNotBypassSpellOnlyWorkload(t *testing.T) {
	data := kfcShamanEquipmentTestData(t)
	profile := data.Profiles[0]
	request, frame := kfcShamanWorkloadControl()
	request.Raid.Parties[0].Players[0].Equipment = googleProto.Clone(profile.Seed).(*proto.EquipmentSpec)
	if _, err := RunKFCShamanHealingWorkload(context.Background(), request, frame); err == nil {
		t.Fatal("spell-only workload admitted equipment without integrated fight admission")
	}
	if reply := RunKFCShamanHealingJob(context.Background(), kfcShamanWorkloadPayload(t, request, frame, true)); reply.Status != "error" || reply.Error == nil || reply.Error.Code != "workload_failed" {
		t.Fatal("old job transport bypassed equipment guard", reply)
	}
	kfcShamanMeasure("EQUIPPED_OLD_GUARD_PRESERVED", true)
}
