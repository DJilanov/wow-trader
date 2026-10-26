package restoration

import (
	"context"
	"crypto/sha256"
	_ "embed"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"google.golang.org/protobuf/encoding/protojson"
	googleProto "google.golang.org/protobuf/proto"
)

//go:embed kfc_shaman_equipped_runtime_identity.txt
var kfcShamanEquippedRuntimeIdentityBytes []byte

//go:embed kfc_shaman_equipped_raid_support.json
var kfcShamanEquippedRaidSupportJSON []byte

type KFCShamanEquippedEffects struct {
	Relic        *KFCShamanHealingRelicPolicy       `json:"relic,omitempty"`
	Elements     *KFCShamanElementsPolicy           `json:"elements,omitempty"`
	FiveThunders *KFCShamanFiveThundersPolicy       `json:"fiveThunders,omitempty"`
	CastSets     *KFCShamanCastResourceSetPolicy    `json:"castSets,omitempty"`
	HealthRegen  *KFCShamanHealthRegenerationPolicy `json:"healthRegen,omitempty"`
	FlatRegen    *KFCShamanHealthRegenerationPolicy `json:"flatRegen,omitempty"`
	Heart        *KFCShamanHealingItemEffectsPolicy `json:"heart,omitempty"`
	Reactive     *KFCShamanReactiveSetPolicy        `json:"reactive,omitempty"`
	Utility      *KFCShamanUtilityPolicy            `json:"utility,omitempty"`
	Legacy       *KFCShamanLegacyItemPolicy         `json:"legacy,omitempty"`
}

type KFCShamanEquippedCooldown struct {
	ItemID               int32   `json:"itemId"`
	RaidIndex            int32   `json:"raidIndex"`
	EarliestMS           int64   `json:"earliestMs"`
	MinimumMissingMana   float64 `json:"minimumMissingMana"`
	MinimumMissingHealth float64 `json:"minimumMissingHealth"`
	MinimumOwnHealth     float64 `json:"minimumOwnHealth"`
	MaximumUses          int     `json:"maximumUses"`
}

type KFCShamanEquippedHealingWorkload struct {
	Schema          string                      `json:"schema"`
	RuntimeIdentity string                      `json:"runtimeIdentity"`
	DomainIdentity  string                      `json:"domainIdentity"`
	ProfileID       string                      `json:"profileId"`
	RaidSupport     string                      `json:"raidSupport"`
	MP5Model        string                      `json:"mp5Model"`
	Workload        KFCShamanHealingWorkload    `json:"workload"`
	Effects         KFCShamanEquippedEffects    `json:"effects"`
	Cooldowns       []KFCShamanEquippedCooldown `json:"cooldowns"`
}

type KFCShamanEquippedWorkloadReceipt struct {
	Schema             string                             `json:"schema"`
	RuntimeIdentity    string                             `json:"runtimeIdentity"`
	RequestIdentity    string                             `json:"requestIdentity"`
	RaidSupport        string                             `json:"raidSupport"`
	MP5Model           string                             `json:"mp5Model"`
	Loadout            *KFCShamanEquippedLoadoutAdmission `json:"loadout"`
	Effects            KFCShamanEquippedEffects           `json:"effects"`
	Cooldowns          []KFCShamanEquippedCooldown        `json:"cooldowns"`
	CooldownUsesMean   []float64                          `json:"cooldownUsesMean"`
	FullClassAdmission bool                               `json:"fullClassAdmission"`
	PublicationAllowed bool                               `json:"publicationAllowed"`
}

func KFCShamanEquippedRuntimeIdentity() (string, error) {
	value := strings.TrimSpace(string(kfcShamanEquippedRuntimeIdentityBytes))
	decoded, err := hex.DecodeString(value)
	if err != nil || len(decoded) != 32 || hex.EncodeToString(decoded) != value {
		return "", fmt.Errorf("invalid compiled Shaman runtime identity")
	}
	return value, nil
}

// RunKFCShamanEquippedHealingWorkload executes admitted complete equipment under explicit references and item-use decisions.
func RunKFCShamanEquippedHealingWorkload(ctx context.Context, input *proto.RaidSimRequest, frame KFCShamanEquippedHealingWorkload) (*KFCShamanHealingWorkloadResult, error) {
	if ctx == nil {
		return nil, fmt.Errorf("equipped Shaman workload requires a cancellation context")
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	identity, err := KFCShamanEquippedRuntimeIdentity()
	if err != nil {
		return nil, err
	}
	if input == nil || frame.Schema != "kfc-shaman-equipped-workload.v1" || frame.RuntimeIdentity != identity {
		return nil, fmt.Errorf("equipped Shaman runtime/schema identity differs")
	}
	// Own nested policy pointers and workload slices before configuring the actor.
	body, err := json.Marshal(frame)
	if err != nil {
		return nil, fmt.Errorf("invalid equipped Shaman workload: %w", err)
	}
	var owned KFCShamanEquippedHealingWorkload
	if err = json.Unmarshal(body, &owned); err != nil {
		return nil, err
	}
	return runKFCShamanHealingWorkload(ctx, input, owned.Workload, &owned)
}

func validateKFCShamanEquippedConsumes(consumes *proto.Consumes) error {
	if consumes == nil {
		return nil
	}
	allowed := &proto.Consumes{Flask: consumes.Flask, Food: consumes.Food, MainHandImbue: consumes.MainHandImbue,
		DefaultPotion: consumes.DefaultPotion, DefaultConjured: consumes.DefaultConjured, ManaRegenElixir: consumes.ManaRegenElixir}
	food := int32(consumes.Food)
	if !googleProto.Equal(consumes, allowed) || consumes.Flask < 0 || consumes.Flask > 4 || food < 0 || food > 11 || food == 5 ||
		(consumes.MainHandImbue != 0 && consumes.MainHandImbue != 16 && consumes.MainHandImbue != 20) ||
		(consumes.DefaultPotion != 0 && consumes.DefaultPotion != 5) ||
		(consumes.DefaultConjured != 0 && consumes.DefaultConjured != 2) ||
		(consumes.ManaRegenElixir != 0 && consumes.ManaRegenElixir != 2) {
		return fmt.Errorf("Shaman consumes outside the captured nonraid component axes")
	}
	return nil
}

func kfcShamanEquippedSupport() (*proto.RaidBuffs, *proto.PartyBuffs, *proto.IndividualBuffs, error) {
	var source struct {
		Version    string          `json:"version"`
		Raid       json.RawMessage `json:"raid"`
		Party      json.RawMessage `json:"party"`
		Individual json.RawMessage `json:"individual"`
	}
	if err := json.Unmarshal(kfcShamanEquippedRaidSupportJSON, &source); err != nil || source.Version != "full-v2" {
		return nil, nil, nil, fmt.Errorf("invalid compiled full-raid support")
	}
	raid, party, individual := &proto.RaidBuffs{}, &proto.PartyBuffs{}, &proto.IndividualBuffs{}
	for _, entry := range []struct {
		data   json.RawMessage
		target googleProto.Message
	}{{source.Raid, raid}, {source.Party, party}, {source.Individual, individual}} {
		if err := protojson.Unmarshal(entry.data, entry.target); err != nil {
			return nil, nil, nil, err
		}
	}
	return raid, party, individual, nil
}

func validateKFCShamanEquippedRequest(input *proto.RaidSimRequest, player *proto.Player, frame *KFCShamanEquippedHealingWorkload) (*KFCShamanEquippedWorkloadReceipt, error) {
	loadout, err := ValidateKFCShamanEquippedLoadout(player, frame.ProfileID, frame.DomainIdentity)
	if err != nil {
		return nil, err
	}
	if err = ValidateKFCShamanHealingStudyTalents(player.TalentsString); err != nil {
		return nil, err
	}
	if player.GetRestorationShaman() == nil || player.HealingModel != nil || kfcShamanHealingUnknownFields(input.ProtoReflect()) {
		return nil, fmt.Errorf("equipped Shaman requires the owned Restoration actor and known request fields")
	}
	if input.SimOptions == nil || input.SimOptions.Debug || input.SimOptions.DebugFirstIteration || len(input.Raid.Parties) < 1 || len(input.Raid.Parties) > 8 {
		return nil, fmt.Errorf("invalid Shaman simulator options or party count")
	}
	if options := player.GetRestorationShaman().GetOptions(); options != nil && !googleProto.Equal(options, &proto.RestorationShaman_Options{}) {
		return nil, fmt.Errorf("class imbues/options need separate healing admission")
	}
	if frame.MP5Model != "per-five-reference" && frame.MP5Model != "per-second-reference" || player.ForeverMp5PerSecond != (frame.MP5Model == "per-second-reference") {
		return nil, fmt.Errorf("Shaman MP5 flag and explicit reference differ")
	}
	if err = validateKFCShamanEquippedConsumes(player.Consumes); err != nil {
		return nil, err
	}
	allowed := &proto.Player{Name: player.Name, Level: player.Level, Class: player.Class, Race: player.Race,
		Equipment: player.Equipment, Consumes: player.Consumes, Buffs: player.Buffs, TalentsString: player.TalentsString,
		Profession1: player.Profession1, Profession2: player.Profession2, Spec: player.Spec,
		ForeverMp5PerSecond: player.ForeverMp5PerSecond, Rotation: player.Rotation}
	if !googleProto.Equal(player, allowed) || player.Rotation != nil && !googleProto.Equal(player.Rotation, &proto.APLRotation{Type: proto.APLRotation_TypeAPL}) {
		return nil, fmt.Errorf("Shaman workload forbids bonus stats, catalog/tier overrides, swaps and unreviewed player controls")
	}
	raidBuffs, partyBuffs, individualBuffs, err := kfcShamanEquippedSupport()
	if err != nil {
		return nil, err
	}
	if frame.RaidSupport != "full-v2" || !googleProto.Equal(input.Raid.Buffs, raidBuffs) || !googleProto.Equal(player.Buffs, individualBuffs) {
		return nil, fmt.Errorf("Shaman full-raid support differs from the reviewed frame")
	}
	if !googleProto.Equal(input.Raid, &proto.Raid{Parties: input.Raid.Parties, Buffs: input.Raid.Buffs, TargetDummies: input.Raid.TargetDummies}) || input.Raid.TargetDummies < 0 || input.Raid.TargetDummies > 39 {
		return nil, fmt.Errorf("Shaman raid contains undeclared agents, debuffs or incoming combat")
	}
	for _, party := range input.Raid.Parties {
		if party == nil || len(party.Players) > 5 || !googleProto.Equal(party.Buffs, partyBuffs) {
			return nil, fmt.Errorf("Shaman party support or roster differs")
		}
		for _, entry := range party.Players {
			if entry == nil || entry != player {
				return nil, fmt.Errorf("use only the controlled Shaman plus declared target dummies")
			}
		}
	}
	if len(frame.Cooldowns) > 24 {
		return nil, fmt.Errorf("too many Shaman cooldown decisions")
	}
	requestBytes, err := (googleProto.MarshalOptions{Deterministic: true}).Marshal(input)
	if err != nil {
		return nil, err
	}
	frameBytes, err := json.Marshal(frame)
	if err != nil {
		return nil, err
	}
	hash := sha256.New()
	hash.Write([]byte("kfc-shaman-equipped-request.v1"))
	for _, value := range [][]byte{requestBytes, frameBytes} {
		var size [8]byte
		binary.BigEndian.PutUint64(size[:], uint64(len(value)))
		hash.Write(size[:])
		hash.Write(value)
	}
	return &KFCShamanEquippedWorkloadReceipt{Schema: "kfc-shaman-equipped-receipt.v1", RuntimeIdentity: frame.RuntimeIdentity,
		RequestIdentity: hex.EncodeToString(hash.Sum(nil)), RaidSupport: frame.RaidSupport, MP5Model: frame.MP5Model,
		Loadout: loadout, Effects: frame.Effects, Cooldowns: frame.Cooldowns, CooldownUsesMean: make([]float64, len(frame.Cooldowns))}, nil
}

func (resto *RestorationShaman) configureKFCShamanEquippedEffects(sim *core.Simulation, effects KFCShamanEquippedEffects) error {
	relic := resto.kfcRelics != nil && len(resto.kfcRelics.costSpells) > 0
	reactive := resto.kfcReactiveSets != nil && (resto.kfcReactiveSets.viper != nil || resto.kfcReactiveSets.scarlet != nil || resto.kfcReactiveSets.devout != nil)
	utility := resto.kfcUtilityItems != nil && len(resto.kfcUtilityItems.owned) > 0
	legacy := resto.kfcLegacyItems != nil && (resto.kfcLegacyItems.briar || resto.kfcLegacyItems.royal || resto.kfcLegacyItems.eye)
	if relic != (effects.Relic != nil) || (resto.kfcElements != nil) != (effects.Elements != nil) ||
		(resto.kfcFiveThunders != nil) != (effects.FiveThunders != nil) || (resto.kfcCastResourceSets != nil) != (effects.CastSets != nil) ||
		(resto.kfcHealthRegeneration != nil) != (effects.HealthRegen != nil) || (resto.kfcFlatItemRegeneration != nil) != (effects.FlatRegen != nil) ||
		resto.kfcHealingItems.heartOwned != (effects.Heart != nil) || reactive != (effects.Reactive != nil) || utility != (effects.Utility != nil) || legacy != (effects.Legacy != nil) {
		return fmt.Errorf("Shaman effect references must match every equipped policy-dependent item/set")
	}
	if effects.Relic != nil {
		if err := resto.ConfigureKFCShamanHealingRelicPolicy(sim, *effects.Relic); err != nil {
			return err
		}
	}
	if effects.Elements != nil {
		if err := resto.ConfigureKFCShamanElementsPolicy(sim, *effects.Elements); err != nil {
			return err
		}
	}
	if effects.FiveThunders != nil {
		if err := resto.ConfigureKFCShamanFiveThundersPolicy(sim, *effects.FiveThunders); err != nil {
			return err
		}
	}
	if effects.CastSets != nil {
		if err := resto.ConfigureKFCShamanCastResourceSets(sim, *effects.CastSets); err != nil {
			return err
		}
	}
	if effects.HealthRegen != nil {
		if err := resto.ConfigureKFCShamanHealthRegeneration(sim, *effects.HealthRegen); err != nil {
			return err
		}
	}
	if effects.FlatRegen != nil {
		if err := resto.ConfigureKFCShamanFlatItemRegeneration(sim, *effects.FlatRegen); err != nil {
			return err
		}
	}
	if effects.Heart != nil {
		if err := resto.ConfigureKFCShamanHealingItemEffects(sim, *effects.Heart); err != nil {
			return err
		}
	}
	if effects.Reactive != nil {
		if err := resto.ConfigureKFCShamanReactiveSets(sim, *effects.Reactive); err != nil {
			return err
		}
	}
	if effects.Utility != nil {
		if err := resto.ConfigureKFCShamanUtilityItems(sim, *effects.Utility); err != nil {
			return err
		}
	}
	if effects.Legacy != nil {
		if err := resto.ConfigureKFCShamanLegacyItems(sim, *effects.Legacy); err != nil {
			return err
		}
	}
	return nil
}

func (resto *RestorationShaman) kfcShamanEquippedCooldownSpell(itemID int32) *core.Spell {
	if itemID == 13444 {
		if resto.Consumes.GetDefaultPotion() != proto.Potions_MajorManaPotion {
			return nil
		}
		return resto.GetSpell(core.ActionID{ItemID: itemID})
	}
	if itemID == 12662 {
		if resto.Consumes.GetDefaultConjured() != proto.Conjured_ConjuredDemonicRune {
			return nil
		}
		return resto.GetSpell(core.ActionID{ItemID: itemID})
	}
	owned := false
	for _, item := range resto.Equipment {
		owned = owned || item.ID == itemID
	}
	if !owned {
		return nil
	}
	switch itemID {
	case 18371:
		return resto.GetSpell(core.ActionID{SpellID: 1302205})
	case 11819:
		return resto.GetSpell(core.ActionID{SpellID: 15604})
	case 13143:
		return resto.GetSpell(core.ActionID{SpellID: 17252})
	case 4262, 8346, 4381, 18637, 11808, 13937, 272438, 272439, 13968:
		return resto.GetSpell(core.ActionID{ItemID: itemID})
	}
	return nil
}

func (resto *RestorationShaman) validateKFCShamanEquippedCooldowns(sim *core.Simulation, frame *KFCShamanEquippedHealingWorkload, units map[int32]*core.Unit) error {
	seen := map[int32]bool{}
	for _, row := range frame.Cooldowns {
		if seen[row.ItemID] || resto.kfcShamanEquippedCooldownSpell(row.ItemID) == nil || row.EarliestMS < 0 || float64(row.EarliestMS) >= sim.Duration.Seconds()*1000 ||
			row.MaximumUses < 1 || row.MaximumUses > 20 || row.RaidIndex < -1 || row.RaidIndex >= 0 && units[row.RaidIndex] == nil {
			return fmt.Errorf("unowned/unsupported or invalid Shaman cooldown decision")
		}
		for _, value := range []float64{row.MinimumMissingHealth, row.MinimumMissingMana, row.MinimumOwnHealth} {
			if !kfcFinite(value) || value < 0 || value > 1000000 {
				return fmt.Errorf("invalid Shaman cooldown threshold")
			}
		}
		if row.ItemID != 8346 && row.ItemID != 4381 && row.ItemID != 18637 && row.RaidIndex != -1 && row.RaidIndex != resto.Index {
			return fmt.Errorf("Shaman self-use item cannot target another player")
		}
		seen[row.ItemID] = true
	}
	return nil
}

func (resto *RestorationShaman) useKFCShamanEquippedCooldowns(sim *core.Simulation, frame *KFCShamanEquippedHealingWorkload, uses []int) {
	if !resto.kfcShamanItemsAlive() || resto.IsCasting(sim) || resto.IsChanneling(sim) {
		return
	}
	for index, row := range frame.Cooldowns {
		if uses[index] >= row.MaximumUses || sim.CurrentTime < time.Duration(row.EarliestMS)*time.Millisecond || resto.CurrentHealth() < row.MinimumOwnHealth {
			continue
		}
		spell := resto.kfcShamanEquippedCooldownSpell(row.ItemID)
		if spell == nil || !spell.IsReady(sim) {
			continue
		}
		var selected *core.Unit
		for _, unit := range resto.kfcHealingPlayers() {
			if !resto.kfcValidHealingTarget(unit) || !unit.IsEnabled() || row.RaidIndex >= 0 && unit.Index != row.RaidIndex {
				continue
			}
			if row.ItemID != 8346 && row.ItemID != 4381 && row.ItemID != 18637 && unit != &resto.Unit {
				continue
			}
			missingMana := 0.0
			if unit.HasManaBar() {
				missingMana = unit.MaxMana() - unit.CurrentMana()
			}
			if unit.MaxHealth()-unit.CurrentHealth() < row.MinimumMissingHealth || missingMana < row.MinimumMissingMana || !spell.CanCast(sim, unit) {
				continue
			}
			if selected == nil || unit.CurrentHealthPercent() < selected.CurrentHealthPercent() || unit.CurrentHealthPercent() == selected.CurrentHealthPercent() && unit.Index < selected.Index {
				selected = unit
			}
		}
		if selected != nil && spell.Cast(sim, selected) {
			uses[index]++
			if !resto.kfcShamanItemsAlive() || resto.IsCasting(sim) || resto.IsChanneling(sim) {
				return
			}
		}
	}
}

func kfcShamanEquippedInactiveExtras(sim *core.Simulation, units map[int32]*core.Unit) error {
	for _, unit := range sim.Raid.AllUnits {
		if units[unit.Index] != unit && unit.IsEnabled() {
			return fmt.Errorf("unadmitted active Shaman guardian/pet in player-only healing assignment")
		}
	}
	return nil
}
