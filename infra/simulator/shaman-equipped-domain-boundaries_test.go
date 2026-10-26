package restoration

import (
	"testing"

	"github.com/wowsims/classic/sim/core/proto"
)

func TestKFCShamanEquippedAdmissionRejectsOtherAcquisitionProfiles(t *testing.T) {
	data := kfcShamanEquipmentTestData(t)
	domain, err := kfcLoadShamanEquipmentDomain()
	if err != nil {
		t.Fatal(err)
	}
	rejected, phaseLeaks := 0, 0
	for index, raw := range domain.Profiles {
		profile := data.Profiles[index]
		if profile.ID != raw.ID {
			t.Fatal("source profile order changed")
		}
		for _, pair := range domain.Enchants {
			listed := false
			for _, id := range raw.Slots[pair.Slot] {
				listed = listed || id == pair.ItemID
			}
			if listed {
				continue
			}
			player := kfcShamanEquipmentTestPlayer(profile, profile.Seed)
			if pair.Slot == 15 {
				for _, id := range raw.Slots[14] {
					if domain.items[id].HandType != 4 {
						player.Equipment.Items[14] = &proto.ItemSpec{Id: id}
						break
					}
				}
			}
			player.Equipment.Items[pair.Slot] = &proto.ItemSpec{Id: pair.ItemID}
			if _, err := ValidateKFCShamanEquippedLoadout(player, profile.ID, data.DomainIdentity); err == nil {
				t.Fatalf("profile %s accepted unavailable item %d at slot %d", profile.ID, pair.ItemID, pair.Slot)
			}
			rejected++
			if domain.items[pair.ItemID].SetID == 519 {
				phaseLeaks++
			}
		}
	}
	if rejected != 13050 || phaseLeaks == 0 {
		t.Fatal("source exclusion coverage changed", rejected, phaseLeaks)
	}
	kfcShamanMeasure("EQUIPPED_PROFILE_BOUNDARIES", []int{rejected, phaseLeaks})
}

func TestKFCShamanEquippedAdmissionRaceFactionAndProfessionOrder(t *testing.T) {
	data := kfcShamanEquipmentTestData(t)
	accepted, rejected := 0, 0
	for _, profile := range data.Profiles {
		for race := proto.Race_RaceDwarf; race <= proto.Race_RaceSkyborneWindshaper; race++ {
			player := kfcShamanEquipmentTestPlayer(profile, profile.Seed)
			player.Race = race
			player.Profession1, player.Profession2 = player.Profession2, player.Profession1
			_, err := ValidateKFCShamanEquippedLoadout(player, profile.ID, data.DomainIdentity)
			alliance := race <= proto.Race_RaceNightElf || race == proto.Race_RaceSkyborneHighOrder
			if (err == nil) != (alliance == (profile.Race == proto.Race_RaceHuman)) {
				t.Fatalf("race/faction boundary changed for %s/%d: %v", profile.ID, race, err)
			}
			if err == nil {
				accepted++
			} else {
				rejected++
			}
		}
	}
	kfcShamanMeasure("EQUIPPED_RACE_PROFILE_BINDING", []int{accepted, rejected})
}
