package restoration

import (
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/stats"
)

func TestKFCDruidOwnedInnervateExplicitCostCooldownAndGCD(t *testing.T) {
	sim, resto := kfcDruidAdvancedFixture(500, nil, 2)
	spell := resto.GetSpell(core.ActionID{SpellID: 29166})
	if spell == nil || resto.HasActiveAuraWithTag(core.InnervateAuraTag) {
		t.Fatal("Owned Innervate missing or implicitly active")
	}
	kfcDruidNear(t, spell.Cost.GetCurrentCost(), .05*resto.BaseMana)
	before := resto.CurrentMana()
	if !spell.Cast(sim, &resto.Unit) {
		t.Fatal("Explicit self-cast failed")
	}
	kfcDruidNear(t, before-resto.CurrentMana(), .05*resto.BaseMana)
	if !resto.HasActiveAuraWithTag(core.InnervateAuraTag) || spell.CD.ReadyAt() != 360*time.Second || resto.GCD.ReadyAt() != 1500*time.Millisecond {
		t.Fatal("Incorrect owned cooldown, GCD or activation")
	}
	kfcDruidAdvancedResult("INNERVATE_COST", []float64{before - resto.CurrentMana(), spell.CD.ReadyAt().Seconds(), resto.GCD.ReadyAt().Seconds()})
}

func TestKFCDruidOwnedInnervateActualManaTicksAndExpiry(t *testing.T) {
	sim, resto := kfcDruidAdvancedFixture(500, map[string]int32{"reflection": 3}, 2)
	resto.SpendMana(sim, 5000, resto.NewManaMetrics(core.ActionID{SpellID: 29166, Tag: 99}))
	beforeCasting, beforeNotCasting := resto.ManaRegenPerSecondWhileCasting(), resto.ManaRegenPerSecondWhileNotCasting()
	spell := resto.GetSpell(core.ActionID{SpellID: 29166})
	if !spell.Cast(sim, &resto.Unit) {
		t.Fatal("Innervate failed")
	}
	expected := resto.SpiritManaRegenPerSecondDefault()*5 + resto.MP5ManaRegenPerSecond()
	kfcDruidNear(t, resto.ManaRegenPerSecondWhileCasting(), expected)
	kfcDruidNear(t, resto.ManaRegenPerSecondWhileNotCasting(), expected)
	before := resto.CurrentMana()
	resto.ManaTick(sim)
	kfcDruidNear(t, resto.CurrentMana()-before, 2*expected)
	kfcDruidAdvance(t, sim, 20*time.Second)
	if resto.HasActiveAuraWithTag(core.InnervateAuraTag) {
		t.Fatal("Innervate did not expire")
	}
	kfcDruidNear(t, resto.ManaRegenPerSecondWhileCasting(), beforeCasting)
	kfcDruidNear(t, resto.ManaRegenPerSecondWhileNotCasting(), beforeNotCasting)
	kfcDruidAdvancedResult("INNERVATE_REGEN", []float64{expected, 2 * expected, beforeCasting, beforeNotCasting})
}

func TestKFCDruidOwnedInnervateTargetsManaAndOverlap(t *testing.T) {
	for _, kind := range []string{"other-friendly", "opponent", "dead", "no-mana", "overlap"} {
		sim, resto := kfcDruidAdvancedFixture(500, nil, 2)
		spell := resto.GetSpell(core.ActionID{SpellID: 29166})
		target := &resto.Unit
		switch kind {
		case "other-friendly":
			target = &sim.Raid.GetFirstTargetDummy().Unit
		case "opponent":
			target = sim.Encounter.TargetUnits[0]
		case "dead":
			resto.RemoveHealth(sim, resto.MaxHealth())
		case "no-mana":
			resto.SpendMana(sim, resto.CurrentMana(), resto.NewManaMetrics(core.ActionID{SpellID: 29166, Tag: 99}))
		case "overlap":
			core.InnervateAura(resto.GetCharacter(), resto.Index).Activate(sim)
		}
		before := resto.CurrentMana()
		if spell.CanCast(sim, target) || spell.Cast(sim, target) {
			t.Fatalf("Invalid policy cast accepted: %s", kind)
		}
		kfcDruidNear(t, resto.CurrentMana(), before)
	}
}

func TestKFCDruidOwnedInnervateDynamicSpiritCapAndReset(t *testing.T) {
	sim, resto := kfcDruidAdvancedFixture(500, nil, 2)
	spell := resto.GetSpell(core.ActionID{SpellID: 29166})
	baseMultiplier, baseSources := resto.PseudoStats.SpiritRegenMultiplier, resto.PseudoStats.FullSpiritRegenSources
	if !spell.Cast(sim, &resto.Unit) {
		t.Fatal("Innervate failed")
	}
	before := resto.ManaRegenPerSecondWhileCasting()
	resto.AddStatDynamic(sim, stats.Spirit, 80)
	kfcDruidNear(t, resto.ManaRegenPerSecondWhileCasting()-before, 50)
	resto.AddMana(sim, resto.MaxMana(), resto.NewManaMetrics(core.ActionID{SpellID: 29166, Tag: 99}))
	resto.ManaTick(sim)
	kfcDruidNear(t, resto.CurrentMana(), resto.MaxMana())
	sim.Cleanup()
	sim.Reset()
	if resto.HasActiveAuraWithTag(core.InnervateAuraTag) || !spell.CD.IsReady(sim) {
		t.Fatal("Owned cooldown or aura leaked into next iteration")
	}
	kfcDruidNear(t, resto.PseudoStats.SpiritRegenMultiplier, baseMultiplier)
	if resto.PseudoStats.FullSpiritRegenSources != baseSources {
		t.Fatal("Full regeneration leaked into next iteration")
	}
	kfcDruidAdvancedResult("INNERVATE_RESET", []float64{resto.CurrentMana(), resto.PseudoStats.SpiritRegenMultiplier})
}
