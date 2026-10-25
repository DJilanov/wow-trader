package restoration

import (
	"fmt"
	"strings"

	"github.com/wowsims/classic/sim/core/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
)

type kfcShamanHealingStudyField struct {
	Field, ProtoField, Classification       string
	Tree, Index, Row, Maximum, Prerequisite int
}

// KFC_SHAMAN_HEALING_STUDY_FIELDS

func kfcShamanHealingStudyRanks(value string) ([3][]int, error) {
	var result [3][]int
	parts := strings.Split(value, "-")
	if len(parts) > len(result) {
		return result, fmt.Errorf("too many Shaman talent trees")
	}
	for tree, maximums := range kfcShamanComponentTalentMaximums {
		result[tree] = make([]int, len(maximums))
		if tree >= len(parts) {
			continue
		}
		if len(parts[tree]) > len(maximums) {
			return result, fmt.Errorf("too many Shaman talent positions")
		}
		for index, rank := range []byte(parts[tree]) {
			if rank < '0' || rank > '9' || int(rank-'0') > maximums[index] {
				return result, fmt.Errorf("invalid Shaman talent rank")
			}
			result[tree][index] = int(rank - '0')
		}
	}
	return result, nil
}

// ValidateKFCShamanHealingStudyTalents is mandatory at the full-build workload boundary; partial component controls remain separate.
func ValidateKFCShamanHealingStudyTalents(value string) error {
	points, err := kfcShamanHealingStudyRanks(value)
	if err != nil {
		return err
	}
	total := 0
	for _, field := range kfcShamanHealingStudyFields {
		rank := points[field.Tree][field.Index]
		total += rank
		if rank == 0 {
			continue
		}
		if field.Classification == "outside-study-domain" {
			return fmt.Errorf("unsupported healing-study talent: %s", field.Field)
		}
		below := 0
		for _, other := range kfcShamanHealingStudyFields {
			if other.Tree == field.Tree && other.Row < field.Row {
				below += points[other.Tree][other.Index]
			}
		}
		if below < field.Row*5 {
			return fmt.Errorf("locked Shaman talent tier: %s", field.Field)
		}
		if field.Prerequisite >= 0 {
			for _, other := range kfcShamanHealingStudyFields {
				if other.Tree == field.Tree && other.Index == field.Prerequisite && points[other.Tree][other.Index] != other.Maximum {
					return fmt.Errorf("missing Shaman prerequisite: %s", field.Field)
				}
			}
		}
	}
	if total != 51 {
		return fmt.Errorf("expected 51 Shaman talent points; got %d", total)
	}
	return nil
}

func kfcShamanScopedUtilityAllowed(field protoreflect.FieldDescriptor) bool {
	for _, source := range kfcShamanHealingStudyFields {
		if source.Classification != "scoped-utility" || source.ProtoField != string(field.Name()) {
			continue
		}
		return (source.Maximum == 1 && field.Kind() == protoreflect.BoolKind) || (source.Maximum > 1 && field.Kind() == protoreflect.Int32Kind)
	}
	return false
}

func validateKFCShamanHealingStudyFactory(player *proto.Player) {
	points, err := kfcShamanHealingStudyRanks(player.TalentsString)
	if err != nil {
		panic(err)
	}
	total, utility := 0, false
	for _, field := range kfcShamanHealingStudyFields {
		rank := points[field.Tree][field.Index]
		total += rank
		utility = utility || rank > 0 && field.Classification == "scoped-utility"
	}
	if total >= 51 || utility {
		if player.Level != 60 {
			panic("Shaman healing studies require level 60")
		}
		if err := ValidateKFCShamanHealingStudyTalents(player.TalentsString); err != nil {
			panic(err)
		}
	}
}
