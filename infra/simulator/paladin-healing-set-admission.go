package holy

import (
	"fmt"
	"sort"

	"github.com/wowsims/classic/sim/core/proto"
)

type kfcPaladinAdmittedSet struct {
	Name       string
	Profession proto.Profession
	Thresholds []int32
}

// KFC_PALADIN_ADMITTED_SET_VALUES

// This is class/assignment support, not a claim that a global set handler exists.
func (healer *HolyPaladin) KFCReviewedHealingSetThreshold(setID, pieces int32) bool {
	set, known := kfcPaladinAdmittedSets[setID]
	if !known || (set.Profession != proto.Profession_ProfessionUnknown && !healer.HasProfession(set.Profession)) {
		return false
	}
	for _, threshold := range set.Thresholds {
		if pieces == threshold {
			return true
		}
	}
	return false
}

func (healer *HolyPaladin) validateKFCPaladinSetAdmission() error {
	for _, item := range healer.Equipment {
		if item.SetID == 0 {
			continue
		}
		if _, known := kfcPaladinAdmittedSets[item.SetID]; !known {
			return fmt.Errorf("item set %d is outside the reviewed Paladin healing domain", item.SetID)
		}
	}
	return nil
}

// These names describe owned current thresholds; their effects are applied elsewhere.
func (healer *HolyPaladin) KFCReviewedHealingEquipmentSetNames() []string {
	if err := healer.validateKFCPaladinSetAdmission(); err != nil {
		panic(err)
	}
	counts := map[int32]int32{}
	for _, item := range healer.Equipment {
		counts[item.SetID]++
	}
	ids := make([]int, 0, len(counts))
	for id := range counts {
		if id != 0 {
			ids = append(ids, int(id))
		}
	}
	sort.Ints(ids)
	var names []string
	for _, id := range ids {
		set := kfcPaladinAdmittedSets[int32(id)]
		for _, threshold := range set.Thresholds {
			if counts[int32(id)] >= threshold && healer.KFCReviewedHealingSetThreshold(int32(id), threshold) {
				names = append(names, fmt.Sprintf("%s (%dpc)", set.Name, threshold))
			}
		}
	}
	return names
}
