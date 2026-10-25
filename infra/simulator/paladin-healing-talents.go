package holy

import (
	"fmt"
	"strings"

	"github.com/wowsims/classic/sim/core/proto"
	gproto "google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
)

type kfcPaladinTalentSlot struct {
	Maximum, Row, Prerequisite int
	Admitted                   bool
}

// KFC_PALADIN_TALENT_DOMAIN_VALUES

func validateKFCPaladinFullTalentBuild(value string) error {
	parts := strings.Split(value, "-")
	if len(parts) > len(kfcPaladinHealingTalentSlots) {
		return fmt.Errorf("too many Paladin talent trees")
	}
	points := make([][]int, len(kfcPaladinHealingTalentSlots))
	total := 0
	for treeIndex, tree := range kfcPaladinHealingTalentSlots {
		points[treeIndex] = make([]int, len(tree))
		if treeIndex >= len(parts) {
			continue
		}
		if len(parts[treeIndex]) > len(tree) {
			return fmt.Errorf("too many Paladin talent positions")
		}
		for index, rank := range []byte(parts[treeIndex]) {
			if rank < '0' || rank > '9' {
				return fmt.Errorf("invalid Paladin talent encoding")
			}
			amount, slot := int(rank-'0'), tree[index]
			if amount > slot.Maximum || (amount > 0 && !slot.Admitted) {
				return fmt.Errorf("unsupported Paladin healing talent rank")
			}
			points[treeIndex][index] = amount
			total += amount
		}
	}
	if total != 51 {
		return fmt.Errorf("Paladin study requires exactly 51 talent points, got %d", total)
	}
	for treeIndex, tree := range kfcPaladinHealingTalentSlots {
		for index, slot := range tree {
			if points[treeIndex][index] == 0 {
				continue
			}
			below := 0
			for otherIndex, other := range tree {
				if other.Row < slot.Row {
					below += points[treeIndex][otherIndex]
				}
			}
			if below < slot.Row*5 {
				return fmt.Errorf("locked Paladin talent tier")
			}
			if slot.Prerequisite >= 0 && points[treeIndex][slot.Prerequisite] != tree[slot.Prerequisite].Maximum {
				return fmt.Errorf("missing Paladin talent prerequisite")
			}
		}
	}
	return nil
}

func (holy *HolyPaladin) validateKFCHealingTalentDomain() {
	original := holy.Talents
	performance := gproto.Clone(original).(*proto.PaladinTalents)
	message := performance.ProtoReflect()
	for name, maximum := range kfcPaladinHealingUtilityFields {
		field := message.Descriptor().Fields().ByName(protoreflect.Name(name))
		if field == nil {
			panic("missing Paladin utility proto field: " + name)
		}
		if field.Kind() == protoreflect.Int32Kind {
			rank := message.Get(field).Int()
			if rank < 0 || rank > int64(maximum) {
				panic("invalid Paladin scoped utility rank: " + name)
			}
		} else if field.Kind() != protoreflect.BoolKind || maximum != 1 {
			panic("invalid Paladin utility proto kind: " + name)
		}
		message.Clear(field)
	}
	holy.Talents = performance
	defer func() { holy.Talents = original }()
	holy.validateKFCInstantCostTalents()
}
