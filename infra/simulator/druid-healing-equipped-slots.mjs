import assert from "node:assert/strict";

export const druidEquippedControlIds = Object.freeze([
  22109, 6695, 22112, 1930, 22113, 22108, 22110, 22106, 22111, 22107, 942, 942, 1490, 11819, 1155,
  0, 0,
]);

/** Correct archived control inputs without modifying their frozen source files.
 * @param {{feralheart:string,idols:string}} source
 * @returns {{feralheart:string,idols:string,controls:string}}
 */
export function renderDruidEquippedSlots(source) {
  function once(text, before, after) {
    assert.equal(text.split(before).length, 2, before);
    return text.replace(before, after);
  }
  const feralheart = once(
    source.feralheart,
    "slots := []int{5, 7, 8, 0, 6, 9, 2, 4}",
    "slots := []int{7, 9, 5, 0, 6, 8, 2, 4}",
  );
  const idols = once(
    source.idols,
    "seed := []int32{22109, 6695, 22112, 1930, 22113, 22106, 22111, 22107, 22108, 22110, 942, 942, 1490, 11819, 1155, 0, 0}",
    "seed := kfcDruidEquippedControlIds",
  );
  const controls = `package restoration

import (
 "testing"
 "github.com/wowsims/classic/sim/core"
 "github.com/wowsims/classic/sim/core/proto"
 "github.com/wowsims/classic/sim/core/simsignals"
)

var kfcDruidEquippedControlIds = []int32{${druidEquippedControlIds.join(",")}}

func TestKFCDruidFeralheartRequestSlotTypes(t *testing.T) {
 request := kfcFeralheartRequest(8)
 types := []proto.ItemType{1,2,3,4,5,6,7,8,9,10,11,11,12,12,13,13,14}
 for slot,spec := range request.Raid.Parties[0].Players[0].Equipment.Items {
  if spec.Id != 0 && core.ItemsByID[spec.Id].Type != types[slot] {t.Fatalf("Item %d is in incorrect request slot %d",spec.Id,slot)}
 }
}

func TestKFCDruidFullEquippedRequestSlotsMatchActualActor(t *testing.T) {
 for _,idol := range []int32{22398,249396,272429,279250} {
  request := kfcFeralheartRequest(0)
  player := request.Raid.Parties[0].Players[0]
  player.BonusStats = nil
  for slot,id := range kfcDruidEquippedControlIds {player.Equipment.Items[slot] = &proto.ItemSpec{Id:id}}
  player.Equipment.Items[16].Id = idol
  sim := core.NewSim(request,simsignals.CreateSignals())
  sim.Reset()
  character := sim.Raid.Parties[0].Players[0].GetCharacter()
  for slot,spec := range player.Equipment.Items {
   if character.Equipment[slot].ID != spec.Id {t.Fatalf("Request item %d at slot %d became %d",spec.Id,slot,character.Equipment[slot].ID)}
  }
 }
}
`;
  return { feralheart, idols, controls };
}
