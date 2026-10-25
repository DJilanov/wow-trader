package healing

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
	"github.com/wowsims/classic/sim/core/simsignals"
	"github.com/wowsims/classic/sim/core/stats"
	"github.com/wowsims/classic/sim/priest"
	"google.golang.org/protobuf/encoding/protojson"
	googleProto "google.golang.org/protobuf/proto"
)

func kfcHealingDungeonSetRequest(set int32, pieces int) *proto.RaidSimRequest {
	ids := map[int32][6]int32{
		181: {16686, 16689, 16688, 16684, 16687, 16682},
		182: {16693, 16695, 16690, 16692, 16694, 16691},
	}[set]
	if ids[0] == 0 || pieces < 0 || pieces > 6 {
		panic("Unreviewed dungeon-set fixture")
	}
	request := kfcWorkloadRequest(100000, 1, 1800)
	player := request.Raid.Parties[0].Players[0]
	player.Equipment = kfcItemEquipment()
	player.Rotation = &proto.APLRotation{Type: proto.APLRotation_TypeAPL}
	for index, slot := range []int{0, 2, 4, 6, 8, 9} {
		if index < pieces {
			player.Equipment.Items[slot] = &proto.ItemSpec{Id: ids[index]}
		}
	}
	request.SimOptions.Interactive, request.SimOptions.IsTest = true, true
	return request
}

func kfcHealingDungeonSetFixture(t *testing.T, set int32, pieces int, talents *proto.PriestTalents) (*core.Simulation, *HealingPriest, *core.Unit) {
	t.Helper()
	request := kfcHealingDungeonSetRequest(set, pieces)
	request.Raid.Parties[0].Players[0].TalentsString = kfcItemTalents(talents)
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	healer := sim.Raid.Parties[0].Players[0].(*HealingPriest)
	positions := map[int32]priest.KFCFriendlyPosition{}
	for _, unit := range sim.Raid.AllUnits {
		positions[unit.UnitIndex] = priest.KFCFriendlyPosition{X: float64(unit.UnitIndex)}
	}
	if err := healer.ConfigureKFCFriendlyPositions(positions); err != nil {
		t.Fatal(err)
	}
	return sim, healer, &sim.Raid.GetFirstTargetDummy().Unit
}

func TestKFCPriestDungeonSetHealingThresholds(t *testing.T) {
	for _, set := range []int32{181, 182} {
		for _, pieces := range []int{0, 2, 3, 4, 5, 6} {
			t.Run(fmt.Sprintf("%d/%d", set, pieces), func(t *testing.T) {
				_, healer, _ := kfcHealingDungeonSetFixture(t, set, pieces, &proto.PriestTalents{})
				gearHealing, gearMP5 := 0.0, 0.0
				for _, item := range healer.Equipment {
					gearHealing += item.Stats[stats.SpellPower] + item.Stats[stats.HealingPower]
					gearMP5 += item.Stats[stats.MP5]
				}
				bonusHealing, bonusMP5 := 0.0, 0.0
				if pieces >= 3 {
					bonusHealing = 18
				}
				if pieces >= 6 {
					bonusMP5 = 8
				}
				kfcPriestNear(t, healer.GetStat(stats.SpellPower)+healer.GetStat(stats.HealingPower)-gearHealing-500, bonusHealing)
				kfcPriestNear(t, healer.GetStat(stats.MP5)-gearMP5, bonusMP5)
				counts := map[int32]int{}
				for _, bonus := range healer.GetActiveSetBonuses() {
					counts[bonus.NumPieces]++
				}
				if counts[4] != 0 {
					t.Fatal("An unsupported four-piece defensive effect was silently enabled")
				}
				aura := healer.GetAura("Sudden Insight")
				if pieces < 5 {
					if aura != nil || counts[5] != 0 {
						t.Fatal("Five-piece mana appeared below the threshold")
					}
				} else if aura == nil || !aura.IsActive() || counts[5] != 1 {
					t.Fatal("Five-piece mana must be registered once")
				}
			})
		}
	}
}

func TestKFCPriestDungeonSetRealHealingManaProcs(t *testing.T) {
	observed := map[int32]int{}
	for _, set := range []int32{181, 182} {
		sim, healer, target := kfcHealingDungeonSetFixture(t, set, 5, &proto.PriestTalents{})
		aura, procs, opportunities := healer.GetAura("Sudden Insight"), 0, 0
		original := aura.OnCastComplete
		aura.OnCastComplete = func(a *core.Aura, s *core.Simulation, spell *core.Spell) {
			if spell.ProcMask.Matches(core.ProcMaskSpellHealing) {
				opportunities++
			}
			before := healer.CurrentMana()
			original(a, s, spell)
			delta := healer.CurrentMana() - before
			if delta != 0 {
				kfcPriestNear(t, delta, 200)
				procs++
			}
		}
		for cast := 0; cast < 500; cast++ {
			healer.AddMana(sim, healer.MaxMana(), healer.NewManaMetrics(core.ActionID{SpellID: 1, Tag: 774}))
			kfcResourceSpend(sim, healer, 1000)
			if !healer.FlashHeal[7].Cast(sim, target) {
				t.Fatal("The real full-rank healing proc control failed to cast")
			}
			kfcPriestAdvance(t, sim, sim.CurrentTime+1500*time.Millisecond)
		}
		if opportunities != 500 || procs < 5 || procs > 50 {
			t.Fatalf("Unexpected five-percent healing behavior: %d opportunities, %d procs", opportunities, procs)
		}
		if healer.FlashHeal[7].SpellMetrics[target.UnitIndex].Casts != 500 {
			t.Fatal("The proc control did not cast 500 real heals")
		}
		observed[set] = procs
	}
	encoded, err := json.Marshal(observed)
	if err != nil {
		t.Fatal(err)
	}
	fmt.Printf("KFC_HEALER_DUNGEON_PROCS %s\n", encoded)
}

func TestKFCPriestDungeonSetParentCastOpportunities(t *testing.T) {
	sim, healer, target := kfcHealingDungeonSetFixture(t, 182, 5, &proto.PriestTalents{Penance: true, BindingHeal: true, PrayerOfMending: true})
	aura := healer.GetAura("Sudden Insight")
	count, original := 0, aura.OnCastComplete
	aura.OnCastComplete = func(a *core.Aura, s *core.Simulation, spell *core.Spell) {
		if spell.ProcMask.Matches(core.ProcMaskSpellHealing) {
			count++
		}
		original(a, s, spell)
	}
	if !healer.Penance.Cast(sim, target) {
		t.Fatal("Penance did not cast")
	}
	kfcPriestAdvance(t, sim, 2*time.Second)
	if count != 1 {
		t.Fatal("Penance bolts received extra mana-proc opportunities")
	}
	if !healer.KFCBindingHeal[6].Cast(sim, target) {
		t.Fatal("Binding Heal did not cast")
	}
	kfcPriestAdvance(t, sim, 3500*time.Millisecond)
	if count != 2 {
		t.Fatal("Binding Heal recipients received extra mana-proc opportunities")
	}
	if !healer.GetSpell(core.ActionID{SpellID: 10961}).Cast(sim, target) {
		t.Fatal("Prayer of Healing did not cast")
	}
	kfcPriestAdvance(t, sim, 6500*time.Millisecond)
	if count != 3 {
		t.Fatal("Prayer recipients received extra mana-proc opportunities")
	}
	if !healer.PrayerOfMending.Cast(sim, target) {
		t.Fatal("Prayer of Mending did not cast")
	}
	kfcDamageTrigger(sim, target, 100)
	kfcPriestAdvance(t, sim, 8*time.Second)
	if count != 4 {
		t.Fatal("A triggered Mending bounce received another mana-proc opportunity")
	}
}

func TestKFCPriestDungeonSetPeriodicExclusionAndReset(t *testing.T) {
	sim, healer, target := kfcHealingDungeonSetFixture(t, 182, 5, &proto.PriestTalents{})
	aura := healer.GetAura("Sudden Insight")
	count, original := 0, aura.OnCastComplete
	aura.OnCastComplete = func(a *core.Aura, s *core.Simulation, spell *core.Spell) { count++; original(a, s, spell) }
	if !healer.Renew[9].Cast(sim, target) {
		t.Fatal("Renew did not cast")
	}
	kfcPriestAdvance(t, sim, 15*time.Second)
	if count != 1 || healer.Renew[9].SpellMetrics[target.UnitIndex].Ticks+healer.Renew[9].SpellMetrics[target.UnitIndex].CritTicks != 5 {
		t.Fatal("Renew ticks received extra mana-proc opportunities")
	}
	sim.Cleanup()
	sim.Reset()
	if !aura.IsActive() {
		t.Fatal("The set trigger did not return after iteration reset")
	}
	count = 0
	if !healer.FlashHeal[7].Cast(sim, target) {
		t.Fatal("The reset healing cast failed")
	}
	kfcPriestAdvance(t, sim, 1500*time.Millisecond)
	if count != 1 {
		t.Fatal("The reset set trigger was missing or duplicated")
	}
}

func kfcHealingFullRaidRequest(t *testing.T) *proto.RaidSimRequest {
	t.Helper()
	var data struct {
		Version    string          `json:"version"`
		Raid       json.RawMessage `json:"raid"`
		Party      json.RawMessage `json:"party"`
		Individual json.RawMessage `json:"individual"`
	}
	if err := json.Unmarshal([]byte(kfcHealingFullRaidDefaultsJSON), &data); err != nil {
		t.Fatal(err)
	}
	if data.Version != "full-v2" {
		t.Fatal("Unreviewed raid frame")
	}
	request := kfcWorkloadRequest(0, 1, 180)
	player := request.Raid.Parties[0].Players[0]
	player.Equipment = kfcItemEquipment()
	player.Equipment.Items[14] = &proto.ItemSpec{Id: 272681}
	player.Rotation = &proto.APLRotation{Type: proto.APLRotation_TypeAPL}
	request.Raid.Buffs = &proto.RaidBuffs{}
	request.Raid.Parties[0].Buffs = &proto.PartyBuffs{}
	player.Buffs = &proto.IndividualBuffs{}
	for _, row := range []struct {
		data    json.RawMessage
		message googleProto.Message
	}{{data.Raid, request.Raid.Buffs}, {data.Party, request.Raid.Parties[0].Buffs}, {data.Individual, player.Buffs}} {
		if err := protojson.Unmarshal(row.data, row.message); err != nil {
			t.Fatal(err)
		}
	}
	request.SimOptions.Interactive, request.SimOptions.IsTest = true, true
	return request
}

func kfcHealingRaidActor(request *proto.RaidSimRequest) (*core.Simulation, *HealingPriest) {
	sim := core.NewSim(request, simsignals.CreateSignals())
	sim.Reset()
	return sim, sim.Raid.Parties[0].Players[0].(*HealingPriest)
}

func TestKFCPriestFullRaidSupportInputsAndAuras(t *testing.T) {
	request := kfcHealingFullRaidRequest(t)
	raid, party, player := request.Raid.Buffs, request.Raid.Parties[0].Buffs, request.Raid.Parties[0].Players[0]
	if !raid.MoonkinAura || !raid.TrueshotAura || !raid.LeaderOfThePack || raid.StrengthOfEarthTotem != proto.TristateEffect_TristateEffectImproved || raid.GraceOfAirTotem != proto.TristateEffect_TristateEffectImproved || raid.ManaSpringTotem != proto.TristateEffect_TristateEffectImproved || !party.WindfuryTotem || !player.Buffs.BlessingOfKings || player.Buffs.BlessingOfWisdom != proto.TristateEffect_TristateEffectImproved {
		t.Fatal("A required raid-wide aura, improved totem or blessing is missing")
	}
	if party.ManaTideTotems != 0 || player.Buffs.Innervates != 0 || player.Buffs.PowerInfusions != 0 {
		t.Fatal("The raid frame invented unlimited external resource cooldowns")
	}
	_, healer := kfcHealingRaidActor(request)
	for _, name := range []string{"Trueshot Aura", "Windfury"} {
		aura := healer.GetAura(name)
		if aura == nil || !aura.IsActive() {
			t.Fatalf("Missing active aura %s", name)
		}
	}
}

func TestKFCPriestFullRaidKingsAndHealingCrit(t *testing.T) {
	full := kfcHealingFullRaidRequest(t)
	_, with := kfcHealingRaidActor(full)
	noKings := googleProto.Clone(full).(*proto.RaidSimRequest)
	noKings.Raid.Parties[0].Players[0].Buffs.BlessingOfKings = false
	_, without := kfcHealingRaidActor(noKings)
	kfcPriestNear(t, with.GetStat(stats.Intellect), without.GetStat(stats.Intellect)*1.1)
	kfcPriestNear(t, with.GetStat(stats.Spirit), without.GetStat(stats.Spirit)*1.1)
	if with.MaxMana() <= without.MaxMana() {
		t.Fatal("Kings did not improve the real mana pool")
	}
	noMoonkin := googleProto.Clone(full).(*proto.RaidSimRequest)
	noMoonkin.Raid.Buffs.MoonkinAura = false
	_, withoutCrit := kfcHealingRaidActor(noMoonkin)
	kfcPriestNear(t, with.FlashHeal[7].HealingCritChance()-withoutCrit.FlashHeal[7].HealingCritChance(), .03)
	encoded, err := json.Marshal(map[string]float64{"intellect": with.GetStat(stats.Intellect), "spirit": with.GetStat(stats.Spirit), "mana": with.MaxMana(), "healingCrit": with.FlashHeal[7].HealingCritChance()})
	if err != nil {
		t.Fatal(err)
	}
	fmt.Printf("KFC_HEALER_RAID_VALUES %s\n", encoded)
}

func TestKFCPriestFullRaidImprovedTotemsAndManaRules(t *testing.T) {
	full := kfcHealingFullRaidRequest(t)
	_, improved := kfcHealingRaidActor(full)
	regular := googleProto.Clone(full).(*proto.RaidSimRequest)
	regular.Raid.Buffs.StrengthOfEarthTotem = proto.TristateEffect_TristateEffectRegular
	regular.Raid.Buffs.GraceOfAirTotem = proto.TristateEffect_TristateEffectRegular
	_, withoutImprovement := kfcHealingRaidActor(regular)
	// Current trait definitions omit Enhancing Totems; do not reapply its old extra 15%.
	kfcPriestNear(t, improved.GetStat(stats.Strength), withoutImprovement.GetStat(stats.Strength))
	kfcPriestNear(t, improved.GetStat(stats.Agility), withoutImprovement.GetStat(stats.Agility))
	noStatsTotems := googleProto.Clone(full).(*proto.RaidSimRequest)
	noStatsTotems.Raid.Buffs.StrengthOfEarthTotem = proto.TristateEffect_TristateEffectMissing
	noStatsTotems.Raid.Buffs.GraceOfAirTotem = proto.TristateEffect_TristateEffectMissing
	_, withoutTotems := kfcHealingRaidActor(noStatsTotems)
	kfcPriestNear(t, improved.GetStat(stats.Strength)-withoutTotems.GetStat(stats.Strength), 53*1.1)
	kfcPriestNear(t, improved.GetStat(stats.Agility)-withoutTotems.GetStat(stats.Agility), 89*1.1)
	noSpring := googleProto.Clone(full).(*proto.RaidSimRequest)
	noSpring.Raid.Buffs.ManaSpringTotem = proto.TristateEffect_TristateEffectMissing
	_, wisdomOnly := kfcHealingRaidActor(noSpring)
	kfcPriestNear(t, improved.GetStat(stats.MP5), wisdomOnly.GetStat(stats.MP5))
	springOnly := googleProto.Clone(full).(*proto.RaidSimRequest)
	springOnly.Raid.Parties[0].Players[0].Buffs.BlessingOfWisdom = proto.TristateEffect_TristateEffectMissing
	_, strongSpring := kfcHealingRaidActor(springOnly)
	springOnly.Raid.Buffs.ManaSpringTotem = proto.TristateEffect_TristateEffectRegular
	_, regularSpring := kfcHealingRaidActor(springOnly)
	kfcPriestNear(t, strongSpring.GetStat(stats.MP5)-regularSpring.GetStat(stats.MP5), 6.25)
	worldBuffs := googleProto.Clone(full).(*proto.RaidSimRequest)
	worldBuffs.Raid.Parties[0].Players[0].Buffs.RallyingCryOfTheDragonslayer = true
	worldBuffs.Raid.Parties[0].Players[0].Buffs.SongflowerSerenade = true
	_, world := kfcHealingRaidActor(worldBuffs)
	kfcPriestNear(t, world.FlashHeal[7].HealingCritChance(), improved.FlashHeal[7].HealingCritChance())
	kfcPriestNear(t, world.MaxMana(), improved.MaxMana())
}

func TestKFCPriestDungeonSetAndRaidExternalInputs(t *testing.T) {
	jobs := map[string]KFCHealingJob{}
	for _, name := range []string{"raidFull", "raidOwn", "devoutFive", "devoutFour"} {
		request := kfcHealingFullRaidRequest(t)
		switch name {
		case "raidOwn":
			request.Raid.Buffs = nil
			request.Raid.Parties[0].Buffs = nil
			request.Raid.Parties[0].Players[0].Buffs = nil
		case "devoutFive", "devoutFour":
			pieces := 5
			if name == "devoutFour" {
				pieces = 4
			}
			request = kfcHealingDungeonSetRequest(182, pieces)
			request.Encounter.Duration = 180
			request.Raid.Parties[0].Players[0].BonusStats.Stats[stats.Mana] = 0
		}
		job := kfcHealingProtocolJob(t, "external-"+name, request, kfcTankWorkload(180), true)
		reply := RunKFCHealingJob(context.Background(), kfcHealingJobJSON(t, job))
		if reply.Status != "complete" || reply.Result == nil || reply.Result.HPS <= 0 {
			t.Fatalf("Set/raid executor failed: %+v", reply.Error)
		}
		jobs[name] = job
	}
	encoded, err := json.Marshal(jobs)
	if err != nil {
		t.Fatal(err)
	}
	fmt.Printf("KFC_HEALER_SET_RAID_INPUTS %s\n", encoded)
}
