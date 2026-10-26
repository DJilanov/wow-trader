package restoration

import (
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sync"

	"github.com/wowsims/classic/sim/core/proto"
	googleProto "google.golang.org/protobuf/proto"
)

//go:embed kfc_shaman_equipped_domain.json
var kfcShamanEquippedDomainJSON []byte

type kfcShamanEquipmentOwnership struct {
	ID            int32    `json:"id"`
	SingleCopy    bool     `json:"singleCopy"`
	LimitCategory int32    `json:"limitCategory"`
	QuestChoices  []string `json:"questChoices"`
}

type kfcShamanEquipmentItem struct {
	kfcShamanEquipmentOwnership
	Type         int32  `json:"type"`
	HandType     int32  `json:"handType"`
	SetID        int32  `json:"setId"`
	SourceStatus string `json:"sourceStatus"`
}

type kfcShamanEquipmentProfile struct {
	ID                 string                        `json:"id"`
	Faction            int32                         `json:"faction"`
	Professions        []int32                       `json:"professions"`
	AccessPolicy       json.RawMessage               `json:"accessPolicy"`
	AvailableRewardIDs []int32                       `json:"availableRewardIds"`
	Slots              [][]int32                     `json:"slots"`
	OwnershipOverrides []kfcShamanEquipmentOwnership `json:"ownershipOverrides"`
	slots              [17]map[int32]bool
	ownership          map[int32]kfcShamanEquipmentOwnership
}

type kfcShamanEquipmentEnchant struct {
	Slot      int     `json:"slot"`
	ItemID    int32   `json:"itemId"`
	EffectIDs []int32 `json:"effectIds"`
}

type kfcShamanEquipmentDomain struct {
	Schema   string                      `json:"schema"`
	Profiles []kfcShamanEquipmentProfile `json:"profiles"`
	Items    []kfcShamanEquipmentItem    `json:"items"`
	Enchants []kfcShamanEquipmentEnchant `json:"enchants"`
	identity string
	profiles map[string]*kfcShamanEquipmentProfile
	items    map[int32]kfcShamanEquipmentItem
	enchants [17]map[int32]map[int32]bool
}

var kfcShamanEquipmentDomainOnce sync.Once
var kfcShamanEquipmentDomainValue *kfcShamanEquipmentDomain
var kfcShamanEquipmentDomainError error

func kfcLoadShamanEquipmentDomain() (*kfcShamanEquipmentDomain, error) {
	kfcShamanEquipmentDomainOnce.Do(func() {
		value := &kfcShamanEquipmentDomain{}
		if err := json.Unmarshal(kfcShamanEquippedDomainJSON, value); err != nil {
			kfcShamanEquipmentDomainError = fmt.Errorf("invalid compiled Shaman equipment domain: %w", err)
			return
		}
		if value.Schema != "kfc-shaman-equipped-domain.v1" || len(value.Profiles) == 0 || len(value.Items) == 0 {
			kfcShamanEquipmentDomainError = fmt.Errorf("incomplete compiled Shaman equipment domain")
			return
		}
		digest := sha256.Sum256(kfcShamanEquippedDomainJSON)
		value.identity = hex.EncodeToString(digest[:])
		value.items = map[int32]kfcShamanEquipmentItem{}
		for _, item := range value.Items {
			if item.ID <= 0 || value.items[item.ID].ID != 0 {
				kfcShamanEquipmentDomainError = fmt.Errorf("duplicate or invalid compiled Shaman item")
				return
			}
			value.items[item.ID] = item
		}
		for slot := range value.enchants {
			value.enchants[slot] = map[int32]map[int32]bool{}
		}
		for _, row := range value.Enchants {
			if row.Slot < 0 || row.Slot >= 17 || value.items[row.ItemID].ID == 0 || value.enchants[row.Slot][row.ItemID] != nil {
				kfcShamanEquipmentDomainError = fmt.Errorf("invalid compiled Shaman enchant pair")
				return
			}
			effects := map[int32]bool{0: true}
			for _, id := range row.EffectIDs {
				if id <= 0 || effects[id] {
					kfcShamanEquipmentDomainError = fmt.Errorf("invalid compiled Shaman enchant effect")
					return
				}
				effects[id] = true
			}
			value.enchants[row.Slot][row.ItemID] = effects
		}
		value.profiles = map[string]*kfcShamanEquipmentProfile{}
		for index := range value.Profiles {
			profile := &value.Profiles[index]
			if profile.ID == "" || value.profiles[profile.ID] != nil || len(profile.Slots) != 17 || len(profile.Professions) != 2 || profile.Professions[0] >= profile.Professions[1] || (profile.Faction != 1 && profile.Faction != 2) {
				kfcShamanEquipmentDomainError = fmt.Errorf("invalid compiled Shaman acquisition profile")
				return
			}
			profile.ownership = map[int32]kfcShamanEquipmentOwnership{}
			for _, row := range profile.OwnershipOverrides {
				if value.items[row.ID].ID == 0 || profile.ownership[row.ID].ID != 0 {
					kfcShamanEquipmentDomainError = fmt.Errorf("invalid compiled Shaman ownership override")
					return
				}
				profile.ownership[row.ID] = row
			}
			for slot, ids := range profile.Slots {
				profile.slots[slot] = map[int32]bool{}
				for _, id := range ids {
					if value.items[id].ID == 0 || profile.slots[slot][id] || value.enchants[slot][id] == nil {
						kfcShamanEquipmentDomainError = fmt.Errorf("invalid compiled Shaman profile item")
						return
					}
					profile.slots[slot][id] = true
				}
			}
			value.profiles[profile.ID] = profile
		}
		kfcShamanEquipmentDomainValue = value
	})
	return kfcShamanEquipmentDomainValue, kfcShamanEquipmentDomainError
}

type KFCShamanEquippedLoadoutAdmission struct {
	Schema             string               `json:"schema"`
	DomainIdentity     string               `json:"domainIdentity"`
	ProfileID          string               `json:"profileId"`
	Race               proto.Race           `json:"race"`
	Faction            int32                `json:"faction"`
	Professions        []int32              `json:"professions"`
	AccessPolicy       json.RawMessage      `json:"accessPolicy"`
	ConditionalItemIDs []int32              `json:"conditionalItemIds"`
	Equipment          *proto.EquipmentSpec `json:"equipment"`
	WorkloadAdmission  bool                 `json:"workloadAdmission"`
	NumericalQualified bool                 `json:"numericalQualified"`
	PublicationAllowed bool                 `json:"publicationAllowed"`
}

// KFCShamanEquippedDomainIdentity binds requests to the compiled acquisition/enchant snapshot.
func KFCShamanEquippedDomainIdentity() (string, error) {
	domain, err := kfcLoadShamanEquipmentDomain()
	if err != nil {
		return "", err
	}
	return domain.identity, nil
}

// ValidateKFCShamanEquippedLoadout is the pre-combat equipment gate. It does not admit a fight, item policies or consumes.
func ValidateKFCShamanEquippedLoadout(player *proto.Player, profileID, domainIdentity string) (*KFCShamanEquippedLoadoutAdmission, error) {
	domain, err := kfcLoadShamanEquipmentDomain()
	if err != nil {
		return nil, err
	}
	if domainIdentity != domain.identity {
		return nil, fmt.Errorf("Shaman equipment domain identity differs")
	}
	profile := domain.profiles[profileID]
	if player == nil || player.Class != proto.Class_ClassShaman || player.Level != 60 || profile == nil || player.Equipment == nil || len(player.Equipment.Items) != 17 || kfcShamanHealingUnknownFields(player.ProtoReflect()) {
		return nil, fmt.Errorf("Shaman loadout needs a known level60 acquisition profile and seventeen explicit slots")
	}
	faction := int32(0)
	switch player.Race {
	case proto.Race_RaceDwarf, proto.Race_RaceGnome, proto.Race_RaceHuman, proto.Race_RaceNightElf, proto.Race_RaceSkyborneHighOrder:
		faction = 1
	case proto.Race_RaceOrc, proto.Race_RaceTauren, proto.Race_RaceTroll, proto.Race_RaceUndead, proto.Race_RaceSkyborneWindshaper:
		faction = 2
	}
	first, second := int32(player.Profession1), int32(player.Profession2)
	if first > second {
		first, second = second, first
	}
	if faction == 0 || faction != profile.Faction || first != profile.Professions[0] || second != profile.Professions[1] {
		return nil, fmt.Errorf("Shaman race/faction or professions differ from acquisition profile")
	}
	ids, categories, quests := map[int32]bool{}, map[int32]bool{}, map[string]bool{}
	types := [17]int32{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 11, 12, 12, 13, 13, 14}
	for slot, spec := range player.Equipment.Items {
		if spec == nil || spec.Id < 0 || spec.Enchant < 0 || spec.RandomSuffix != 0 {
			return nil, fmt.Errorf("invalid or unadmitted Shaman item spec at slot %d", slot)
		}
		if spec.Id == 0 {
			if slot != 15 || spec.Enchant != 0 {
				return nil, fmt.Errorf("only the unenchanted offhand may be empty")
			}
			continue
		}
		item := domain.items[spec.Id]
		if !profile.slots[slot][spec.Id] || item.Type != types[slot] || !domain.enchants[slot][spec.Id][spec.Enchant] {
			return nil, fmt.Errorf("Shaman item/enchant outside acquisition and slot profile at %d", slot)
		}
		rules := item.kfcShamanEquipmentOwnership
		if override, ok := profile.ownership[spec.Id]; ok {
			rules = override
		}
		if rules.SingleCopy && ids[spec.Id] || rules.LimitCategory != 0 && categories[rules.LimitCategory] {
			return nil, fmt.Errorf("duplicate restricted Shaman item/category")
		}
		for _, quest := range rules.QuestChoices {
			if quests[quest] {
				return nil, fmt.Errorf("exclusive Shaman quest rewards")
			}
			quests[quest] = true
		}
		ids[spec.Id] = true
		if rules.LimitCategory != 0 {
			categories[rules.LimitCategory] = true
		}
	}
	if domain.items[player.Equipment.Items[14].Id].HandType == 4 && player.Equipment.Items[15].Id != 0 {
		return nil, fmt.Errorf("two-hand Shaman weapon requires an empty offhand")
	}
	conditional := []int32{}
	for _, id := range profile.AvailableRewardIDs {
		if ids[id] {
			conditional = append(conditional, id)
		}
	}
	return &KFCShamanEquippedLoadoutAdmission{
		Schema: "kfc-shaman-equipped-loadout-admission.v1", DomainIdentity: domain.identity, ProfileID: profile.ID,
		Race: player.Race, Faction: faction, Professions: append([]int32(nil), profile.Professions...),
		AccessPolicy: append(json.RawMessage(nil), profile.AccessPolicy...), ConditionalItemIDs: conditional,
		Equipment: googleProto.Clone(player.Equipment).(*proto.EquipmentSpec),
	}, nil
}
