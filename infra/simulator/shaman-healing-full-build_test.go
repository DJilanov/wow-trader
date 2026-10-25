package restoration

import (
	"strings"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/simsignals"
)

// KFC_SHAMAN_HEALING_STUDY_SEEDS

func kfcShamanStudyEdit(value, field string, change int) string {
	parts := strings.Split(value, "-")
	for len(parts) < 3 {
		parts = append(parts, "")
	}
	for _, source := range kfcShamanHealingStudyFields {
		if source.Field != field {
			continue
		}
		for len(parts[source.Tree]) <= source.Index {
			parts[source.Tree] += "0"
		}
		part := []byte(parts[source.Tree])
		part[source.Index] = byte(int(part[source.Index]) + change)
		parts[source.Tree] = string(part)
		return strings.Join(parts, "-")
	}
	panic("Unknown test field")
}

func TestKFCShamanFullBuildSourceShapeAndThreeLegalSeeds(t *testing.T) {
	if len(kfcShamanHealingStudyFields) != 50 || len(kfcShamanHealingStudySeeds) != 3 {
		t.Fatal("Incomplete source domain")
	}
	classes := map[string]int{}
	for _, field := range kfcShamanHealingStudyFields {
		classes[field.Classification]++
		if field.Maximum != kfcShamanComponentTalentMaximums[field.Tree][field.Index] {
			t.Fatal("Source maximum drift")
		}
	}
	if classes["healing-source"] != 15 || classes["scoped-utility"] != 10 || classes["outside-study-domain"] != 25 {
		t.Fatal("Unknown scope classification")
	}
	for _, seed := range kfcShamanHealingStudySeeds {
		if err := ValidateKFCShamanHealingStudyTalents(seed); err != nil {
			t.Fatal(err)
		}
	}
	kfcShamanMeasure("FULL_BUILD_SOURCE", classes)
}

func TestKFCShamanFullBuildBudgetTierPrerequisiteAndOffensiveGuards(t *testing.T) {
	seed := kfcShamanHealingStudySeeds[0]
	bad := map[string]string{
		"empty": "", "too-many-trees": "---", "bad-character": "--x", "boolean-rank": "--0000000000000009",
		"fifty-points":             kfcShamanStudyEdit(seed, "naturalGrace", -1),
		"fifty-two-points":         kfcShamanStudyEdit(seed, "naturalGrace", 1),
		"missing-full-healing-way": kfcShamanStudyEdit(kfcShamanStudyEdit(seed, "healingWay", -1), "naturalGrace", 1),
		"offensive-field":          kfcShamanStudyEdit(kfcShamanStudyEdit(seed, "naturalGrace", -1), "convection", 1),
		"locked-tier":              kfcShamanStudyEdit(kfcShamanStudyEdit(kfcShamanHealingStudySeeds[2], "anticipation", -1), "naturalGrace", 1),
	}
	for name, value := range bad {
		if err := ValidateKFCShamanHealingStudyTalents(value); err == nil {
			t.Fatal("Illegal full build admitted", name)
		}
	}
	kfcShamanMeasure("FULL_BUILD_REJECT", len(bad))
}

func TestKFCShamanFullBuildFactoryCastsAllThreeSourceSeeds(t *testing.T) {
	for index, seed := range kfcShamanHealingStudySeeds {
		request := kfcShamanRequest(500)
		request.Raid.Parties[0].Players[0].TalentsString = seed
		sim := core.NewSim(request, simsignals.CreateSignals())
		sim.Reset()
		resto := sim.Raid.Parties[0].Players[0].(*RestorationShaman)
		kfcRiptideConfigure(t, sim, resto, kfcRiptideDefault(), kfcShamanResourceDefault())
		target := resto.kfcHealingPlayers()[1]
		target.RemoveHealth(sim, 9000)
		spell := resto.GetSpell(core.ActionID{SpellID: 10396})
		if index < 2 {
			spell = resto.kfcRiptide.spells[1239243]
		}
		spell.BonusCritRating = -10000
		if !spell.Cast(sim, target) {
			t.Fatal("Legal study spell rejected")
		}
		kfcShamanAdvance(t, sim, 3*time.Second)
		if target.CurrentHealth() <= 1000 {
			t.Fatal("Legal source build never healed")
		}
		kfcShamanMeasure("FULL_BUILD_CAST", map[string]interface{}{"index": index, "seed": seed, "healed": target.CurrentHealth() - 1000, "spent": resto.Metrics.ManaSpent, "power": spell.HealingPower(target)})
		sim.Cleanup()
	}
}

func TestKFCShamanFullBuildFactoryRejectsUtilityOutsideCompleteStudy(t *testing.T) {
	for _, value := range []string{kfcShamanStudyEdit(kfcShamanHealingStudySeeds[0], "improvedHealingWave", -1), kfcShamanStudyEdit("", "naturalGrace", 1), kfcShamanStudyEdit("", "improvedGhostWolf", 1)} {
		func() {
			defer func() {
				if recover() == nil {
					t.Fatal("Incomplete utility build reached engine")
				}
			}()
			request := kfcShamanRequest(0)
			request.Raid.Parties[0].Players[0].TalentsString = value
			core.NewSim(request, simsignals.CreateSignals())
		}()
	}
	func() {
		defer func() {
			if recover() == nil {
				t.Fatal("Lower-level study reached engine")
			}
		}()
		request := kfcShamanRequest(0)
		request.Raid.Parties[0].Players[0].Level = 59
		request.Raid.Parties[0].Players[0].TalentsString = kfcShamanHealingStudySeeds[0]
		core.NewSim(request, simsignals.CreateSignals())
	}()
	kfcShamanMeasure("FULL_BUILD_FACTORY_REJECT", 4)
}
