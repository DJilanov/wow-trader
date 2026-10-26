package restoration

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/wowsims/classic/sim/core/proto"
	googleProto "google.golang.org/protobuf/proto"
)

func TestKFCShamanProtectiveTemporaryHealthExpiryDoesNotHealOrResurrect(t *testing.T) {
	sim, resto, units := kfcShamanProtectiveFixture(t, true, 10030)
	p := kfcShamanProtectiveTestPolicy(resto.kfcProtectiveItems.owned)
	p.AdmiralStamina = "additive-reference"
	p.AdmiralHealth = "grant-on-gain-reference"
	p.AdmiralRecipientHealth = "ten-health-per-stamina-reference"
	kfcShamanProtectiveConfigure(t, sim, resto, p)
	if !resto.kfcProtectiveItems.spells[10030].Cast(sim, &resto.Unit) {
		t.Fatal("Admiral use failed")
	}
	units[1].RemoveHealth(sim, units[1].CurrentHealth()-5)
	units[2].RemoveHealth(sim, units[2].CurrentHealth())
	for _, unit := range units[1:3] {
		aura := unit.GetAura(fmt.Sprintf("Shaman Admiral reference %d", resto.UnitIndex))
		if aura == nil {
			t.Fatal("missing actual recipient aura")
		}
		aura.Deactivate(sim)
	}
	if units[1].CurrentHealth() != 1 || units[2].CurrentHealth() != 0 {
		t.Fatal("temporary health expiry killed a living recipient or revived a dead one")
	}
	kfcShamanNear(t, resto.kfcProtectiveItems.externalDeficitByRaidIndex[units[1].Index], -96)
	kfcShamanNear(t, resto.kfcProtectiveItems.externalDeficitByRaidIndex[units[2].Index], -100)
	kfcShamanMeasure("PROTECTIVE_TEMPORARY_HEALTH_FLOOR", []float64{units[1].CurrentHealth(), units[2].CurrentHealth(), resto.kfcProtectiveItems.externalDeficitAdjustment})
	sim.Cleanup()
}

func TestKFCShamanProtectiveMalformedAndUnownedReferencesFailFresh(t *testing.T) {
	sim, resto, _ := kfcShamanProtectiveFixture(t, true, 18340)
	base := kfcShamanProtectiveTestPolicy(resto.kfcProtectiveItems.owned)
	for _, change := range []func(*KFCShamanProtectivePolicy){
		func(p *KFCShamanProtectivePolicy) { p.ID = strings.Repeat("x", 101) },
		func(p *KFCShamanProtectivePolicy) { p.Cooldowns = "unknown" },
		func(p *KFCShamanProtectivePolicy) { p.AdmiralStamina = "disabled-reference" },
		func(p *KFCShamanProtectivePolicy) { p.AdmiralHealth = "grant-on-gain-reference" },
		func(p *KFCShamanProtectivePolicy) { p.HarmBelt = "no-overload-reference" },
		func(p *KFCShamanProtectivePolicy) { p.SelfReflection = "self-ineligible-reference" },
		func(p *KFCShamanProtectivePolicy) { value := true; p.AdaptiveEnemyInMelee = &value },
	} {
		p := base
		change(&p)
		if err := resto.ConfigureKFCShamanProtectiveItems(sim, p); err == nil {
			t.Fatal("invalid owned policy accepted", p)
		}
		if resto.KFCShamanProtectivePolicyEcho() != nil {
			t.Fatal("failed validation changed policy state")
		}
	}
	if err := resto.ConfigureKFCShamanProtectiveItems(nil, base); err == nil {
		t.Fatal("nil simulation accepted")
	}
	kfcShamanProtectiveConfigure(t, sim, resto, base)
	sim.Cleanup()
	kfcShamanMeasure("PROTECTIVE_REJECTED_REFERENCES", 8)
}

func TestKFCShamanProtectiveMindtapAndEidolonUseExistingTimer(t *testing.T) {
	for _, row := range []struct {
		first, second int32
		seconds       int
		want          float64
	}{{18371, 18340, 9, 0}, {18371, 18340, 11, 1}, {18340, 18371, 29, 0}, {18340, 18371, 31, 1}} {
		request, frame := kfcShamanEquippedControl(t, "2-4-11", map[int]int32{1: 18340, 12: 18371})
		request.Encounter.Duration = float64(row.seconds)
		frame.Workload.Damage = nil
		frame.Workload.Priorities[0].MinimumMissingHealth = 1000000
		frame.Cooldowns = []KFCShamanEquippedCooldown{{ItemID: row.first, RaidIndex: -1, MaximumUses: 1}, {ItemID: row.second, RaidIndex: -1, MaximumUses: 1}}
		result := kfcShamanEquippedResult(t, request, frame)
		if result.Equipped.CooldownUsesMean[0] != 1 || result.Equipped.CooldownUsesMean[1] != row.want {
			t.Fatal("existing mana-item timer was not shared with Eidolon", row, result.Equipped.CooldownUsesMean)
		}
		kfcShamanMeasure("PROTECTIVE_MINDTAP_TIMER", result.Equipped.CooldownUsesMean)
	}
}

func TestKFCShamanProtectiveHelmetCannotBorrowUnequippedCircle(t *testing.T) {
	request, frame := kfcShamanEquippedControl(t, "2-4-11", map[int]int32{0: 10543})
	frame.Cooldowns = []KFCShamanEquippedCooldown{{ItemID: 11808, RaidIndex: -1, MaximumUses: 1}}
	if _, err := RunKFCShamanEquippedHealingWorkload(context.Background(), request, frame); err == nil {
		t.Fatal("two different helmets were treated as simultaneously equipped")
	}
	kfcShamanMeasure("PROTECTIVE_HELMET_OWNERSHIP", 1)
}

func TestKFCShamanProtectiveActualWireAndNoExplosionHealingCredit(t *testing.T) {
	request, frame := kfcShamanEquippedControl(t, "2-4-11", map[int]int32{0: 11808, 12: 272437})
	value := true
	frame.Effects.Protective.AdaptiveEnemyInMelee = &value
	request.Raid.Parties[0].Players[0].Consumes = &proto.Consumes{DefaultConjured: proto.Conjured_ConjuredDemonicRune}
	frame.Cooldowns = []KFCShamanEquippedCooldown{{ItemID: 272437, RaidIndex: -1, MaximumUses: 1}, {ItemID: 12662, RaidIndex: -1, MaximumUses: 1}, {ItemID: 11808, RaidIndex: -1, MaximumUses: 1}}
	encoded, err := googleProto.Marshal(request)
	if err != nil {
		t.Fatal(err)
	}
	job := KFCShamanEquippedHealingJob{Schema: "kfc-shaman-equipped-job.v1", ID: "protective-transport-control", RequestBase64: base64.StdEncoding.EncodeToString(encoded), Workload: frame, Detail: true}
	payload, err := json.Marshal(job)
	if err != nil {
		t.Fatal(err)
	}
	reply := RunKFCShamanEquippedHealingJob(context.Background(), payload)
	if reply.Status != "complete" || reply.Result == nil || reply.Result.Equipped == nil {
		t.Fatal("actual protective wire failed", reply.Error)
	}
	result := kfcShamanEquippedResult(t, request, frame)
	damage := 0.0
	for _, action := range result.Metrics.Parties[0].Players[0].Actions {
		if action.Id.GetSpellId() == 1291099 {
			for _, target := range action.Targets {
				damage += target.Damage
			}
		}
	}
	if damage <= 0 || result.Assignment.AbsorbedHpsMean != 0 || result.Assignment.SupportHpsMean*request.Encounter.Duration > result.Assignment.DamageDemandMean+1e-7 {
		t.Fatal("actual resource depletion explosion missing or credited as healing", damage, result.Assignment)
	}
	var unknown map[string]interface{}
	if err = json.Unmarshal(payload, &unknown); err != nil {
		t.Fatal(err)
	}
	unknown["workload"].(map[string]interface{})["effects"].(map[string]interface{})["protective"].(map[string]interface{})["unreviewedBehavior"] = true
	invalid, err := json.Marshal(unknown)
	if err != nil {
		t.Fatal(err)
	}
	if rejected := RunKFCShamanEquippedHealingJob(context.Background(), invalid); rejected.Status != "error" || rejected.Error == nil || rejected.Error.Code != "invalid_job" {
		t.Fatal("unknown protective behavior accepted")
	}
	kfcShamanMeasure("PROTECTIVE_WIRE", struct {
		Payload json.RawMessage                  `json:"payload"`
		Reply   KFCShamanEquippedHealingJobReply `json:"reply"`
	}{payload, reply})
}
