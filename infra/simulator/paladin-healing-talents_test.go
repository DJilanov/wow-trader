package holy

import (
	"context"
	"strings"
	"testing"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/stats"
	gproto "google.golang.org/protobuf/proto"
)

var kfcPaladinFullTalentControlSeeds = []string{
	"05320013225101051-503230002-05",
	"05320013225101051-5002-551000002",
	"0532011322510105-503230002-05",
}

var kfcPaladinUtilityControlSlots = [][3]int{{0, 0, 5}, {0, 3, 2}, {0, 5, 2}, {0, 6, 1}, {0, 8, 2}, {1, 0, 5}, {1, 2, 3}, {1, 3, 2}, {1, 4, 5}, {1, 8, 2}, {2, 0, 5}, {2, 2, 2}, {2, 8, 2}}

func kfcPaladinTalentControlParts(value string) [][]byte {
	parts := strings.Split(value, "-")
	result := make([][]byte, len(kfcPaladinHealingTalentSlots))
	for ti, tree := range kfcPaladinHealingTalentSlots {
		result[ti] = []byte(strings.Repeat("0", len(tree)))
		if ti < len(parts) {
			copy(result[ti], []byte(parts[ti]))
		}
	}
	return result
}

func kfcPaladinTalentControlEncode(parts [][]byte) string {
	text := make([]string, len(parts))
	for i, part := range parts {
		text[i] = strings.TrimRight(string(part), "0")
	}
	return strings.TrimRight(strings.Join(text, "-"), "-")
}

func kfcPaladinTalentControlCore(value string) string {
	parts := kfcPaladinTalentControlParts(value)
	for _, slot := range kfcPaladinUtilityControlSlots {
		parts[slot[0]][slot[1]] = '0'
	}
	return kfcPaladinTalentControlEncode(parts)
}

func TestKFCPaladinFullTalentSeedsAndIllegalBuilds(t *testing.T) {
	for _, value := range kfcPaladinFullTalentControlSeeds {
		if err := validateKFCPaladinFullTalentBuild(value); err != nil {
			t.Fatal(value, err)
		}
	}
	for _, value := range []string{"", "-", "-1-1-1", "05320013225101051-503230002-06", "05320013225101051-503230002-05-", "X5320013225101051-503230002-05"} {
		if err := validateKFCPaladinFullTalentBuild(value); err == nil {
			t.Fatal("illegal build accepted", value)
		}
	}
	for _, kind := range []string{"tier", "prerequisite", "outside-domain"} {
		parts := kfcPaladinTalentControlParts(kfcPaladinFullTalentControlSeeds[0])
		switch kind {
		case "tier":
			parts[0][1] = '0'
			parts[1][4] = '5'
			parts[2][0] = '3'
		case "prerequisite":
			parts[0][13] = '0'
			parts[1][4] = '4'
		case "outside-domain":
			parts[1][2] = '2'
			parts[1][6] = '1'
		}
		if err := validateKFCPaladinFullTalentBuild(kfcPaladinTalentControlEncode(parts)); err == nil {
			t.Fatal("invalid full build accepted", kind)
		}
	}
}

func TestKFCPaladinFullTalentWorkloadsPreserveModeledHealing(t *testing.T) {
	observed := []float64{}
	for index, value := range kfcPaladinFullTalentControlSeeds {
		request, frame := kfcPaladinWorkloadControl()
		request.Raid.Parties[0].Players[0].TalentsString = kfcPaladinTalentControlCore(value)
		base := kfcPaladinRequireReply(t, RunKFCPaladinHealingJob(context.Background(), kfcPaladinWorkloadPayload(t, request, frame, "core-talents", false)))
		request.Raid.Parties[0].Players[0].TalentsString = value
		frame.RequireFullTalentBuild = true
		full := kfcPaladinRequireReply(t, RunKFCPaladinHealingJob(context.Background(), kfcPaladinWorkloadPayload(t, request, frame, "full-talents", false)))
		if base.LegalTalentBuild || !full.LegalTalentBuild {
			t.Fatal("full-build provenance lost", index)
		}
		for _, pair := range [][2]float64{{full.RawHPS, base.RawHPS}, {full.EffectiveHealingHPS, base.EffectiveHealingHPS}, {full.ManaRemainingMean, base.ManaRemainingMean}, {full.MissingHealthSecondsMean, base.MissingHealthSecondsMean}, {full.SurvivalRate, base.SurvivalRate}} {
			kfcPaladinNear(t, pair[0], pair[1])
		}
		observed = append(observed, full.RawHPS, full.ManaRemainingMean)
	}
	kfcPaladinActiveMeasure("TALENT_FULL_FIGHTS", observed)
}

func TestKFCPaladinScopedUtilityCannotInventHealingOrMana(t *testing.T) {
	request, frame := kfcPaladinWorkloadControl()
	core := kfcPaladinTalentControlCore(kfcPaladinFullTalentControlSeeds[0])
	request.Raid.Parties[0].Players[0].TalentsString = core
	base := kfcPaladinRequireReply(t, RunKFCPaladinHealingJob(context.Background(), kfcPaladinWorkloadPayload(t, request, frame, "utility-baseline", false)))
	observed := []float64{}
	for _, slot := range kfcPaladinUtilityControlSlots {
		parts := kfcPaladinTalentControlParts(core)
		parts[slot[0]][slot[1]] = byte('0' + slot[2])
		request.Raid.Parties[0].Players[0].TalentsString = kfcPaladinTalentControlEncode(parts)
		result := kfcPaladinRequireReply(t, RunKFCPaladinHealingJob(context.Background(), kfcPaladinWorkloadPayload(t, request, frame, "one-scoped-utility", false)))
		for _, pair := range [][2]float64{{result.RawHPS, base.RawHPS}, {result.EffectiveHealingHPS, base.EffectiveHealingHPS}, {result.ManaRemainingMean, base.ManaRemainingMean}, {result.MissingHealthSecondsMean, base.MissingHealthSecondsMean}} {
			kfcPaladinNear(t, pair[0], pair[1])
		}
		observed = append(observed, result.RawHPS)
	}
	kfcPaladinActiveMeasure("TALENT_UTILITY", observed)
}

func TestKFCPaladinScopedUtilityRankGuardRestoresTalents(t *testing.T) {
	_, holy, _ := kfcPaladinPassiveFixture(0, kfcPaladinFullTalentControlSeeds[0])
	original := gproto.Clone(holy.Talents).(*proto.PaladinTalents)
	holy.validateKFCHealingTalentDomain()
	if !gproto.Equal(holy.Talents, original) {
		t.Fatal("validation changed actual talent effects")
	}
	for _, kind := range []string{"spiritual-focus-overflow", "stamina-rank-overflow", "unsupported-active"} {
		request, frame := kfcPaladinWorkloadControl()
		parts := kfcPaladinTalentControlParts("")
		switch kind {
		case "spiritual-focus-overflow":
			parts[0][3] = '3'
		case "stamina-rank-overflow":
			parts[1][8] = '9'
		case "unsupported-active":
			parts[1][12] = '1'
		}
		request.Raid.Parties[0].Players[0].TalentsString = kfcPaladinTalentControlEncode(parts)
		if reply := RunKFCPaladinHealingJob(context.Background(), kfcPaladinWorkloadPayload(t, request, frame, "invalid-utility", false)); reply.Status != "error" {
			t.Fatal("invalid scoped utility admitted", kind)
		}
	}
}

func TestKFCPaladinFullTalentRequirementIsExplicit(t *testing.T) {
	request, frame := kfcPaladinWorkloadControl()
	frame.RequireFullTalentBuild = true
	if reply := RunKFCPaladinHealingJob(context.Background(), kfcPaladinWorkloadPayload(t, request, frame, "partial-as-full", false)); reply.Status != "error" {
		t.Fatal("partial component control claimed a legal build")
	}
	request.Raid.Parties[0].Players[0].TalentsString = kfcPaladinFullTalentControlSeeds[0]
	policy := kfcPaladinLightPolicy(1, 19979)
	frame.BlessingOfLight = &policy
	result := kfcPaladinRequireReply(t, RunKFCPaladinHealingJob(context.Background(), kfcPaladinWorkloadPayload(t, request, frame, "full-talents-with-light", false)))
	if !result.LegalTalentBuild || result.BlessingOfLight == nil {
		t.Fatal("full build and target buff were not combined")
	}
}

func TestKFCPaladinScopedStatUtilitiesKeepTheirActualEffects(t *testing.T) {
	_, base, _ := kfcPaladinPassiveFixture(0, "")
	observed := []float64{}
	for _, test := range []struct {
		tree, index, rank int
		stat              stats.Stat
		factor, add       float64
	}{
		{0, 0, 5, stats.Strength, 1.1, 0}, {1, 8, 2, stats.Stamina, 1.04, 0}, {1, 4, 5, stats.Defense, 1, 20}, {1, 2, 3, stats.SpellHit, 1, 3 * core.SpellHitRatingPerHitChance}, {2, 0, 5, stats.Parry, 1, 5},
	} {
		parts := kfcPaladinTalentControlParts("")
		parts[test.tree][test.index] = byte('0' + test.rank)
		_, holy, _ := kfcPaladinPassiveFixture(0, kfcPaladinTalentControlEncode(parts))
		actual := holy.GetStat(test.stat)
		kfcPaladinNear(t, actual, base.GetStat(test.stat)*test.factor+test.add)
		observed = append(observed, actual)
	}
	kfcPaladinActiveMeasure("TALENT_SCOPED_STATS", observed)
}
