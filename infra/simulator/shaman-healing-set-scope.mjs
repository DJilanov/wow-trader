import assert from "node:assert/strict";
import { reviewShamanSharedEquipmentSource } from "./shaman-shared-equipment-source.mjs";

const componentRoots = new Map([
  ["181/5/450527", "cast-resource"],
  ["182/5/450576", "cast-resource"],
  ["183/5/450585", "cast-resource"],
  ["185/5/450608", "cast-resource"],
  ["187/5/450626", "elements"],
  ["184/6/21347", "health-regeneration"],
  ["162/4/1291796", "reactive"],
  ["163/6/1293670", "reactive"],
  ["182/4/27778", "reactive"],
]);

const scopedRoots = [
  [142, 2, 18979, "outgoing-attack", 20],
  [142, 3, 23863, "outgoing-attack", 20],
  [141, 3, 9233, "outgoing-attack", 20],
  [181, 4, 27867, "enemy-control", 139944],
  [183, 4, 27780, "enemy-control", 139944],
  [184, 5, 27787, "outgoing-attack", 4],
  [162, 5, 1291807, "outgoing-attack", 4],
  [161, 3, 1292025, "creature-attack-power", null],
  [161, 5, 7534, "ignored-weapon-skill", 0],
  [161, 4, 1292028, "outgoing-attack", 4],
  [163, 3, 18074, "creature-attack-power", null],
  [163, 4, 1293674, "later-melee", 139944],
  [121, 3, 1292546, "snare-root-duration", null],
  [122, 3, 1299737, "outgoing-harmful-spell", 65536],
  [123, 3, 1299740, "outgoing-attack", 4],
  [1, 4, 1301123, "outgoing-attack", 20],
  [1, 2, 1301126, "fear-resistance", null],
  [81, 4, 1302380, "hostile-reflection", -2146784600],
  [81, 2, 1302376, "movement", null],
  [184, 4, 1302698, "control-removal", 139944],
  [185, 4, 1302708, "movement", 139944],
  [186, 5, 450577, "outgoing-attack", 68],
  [186, 4, 1302712, "control-removal", 139944],
  [187, 4, 1302718, "incoming-melee", 40],
];

const key = (setId, pieces, spellId) => `${setId}/${pieces}/${spellId}`;
const sortRows = (rows) =>
  [...rows].sort((a, b) => a.setId - b.setId || a.pieces - b.pieces || a.spellId - b.spellId);

function one(rows, predicate, label) {
  const matches = rows.filter(predicate);
  assert.equal(matches.length, 1, label);
  return matches[0];
}

/** Account for every set source row in the existing stationary healing assignment.
 * This source classification never substitutes for runtime or full-class admission.
 * @param {{evidence:object,certificate:object,workloadSource:string}} input @returns {object}
 */
export function reviewShamanHealingSetScope(input) {
  const { evidence, certificate, workloadSource } = input;
  reviewShamanSharedEquipmentSource(evidence);
  assert.equal(certificate.schema, "kfc-shaman-healing-set-scope-source.v1");
  assert.equal(certificate.sourceBuild, 70532);
  assert.equal(
    certificate.references.shared.byteSha256,
    "bbdfa1fa0b846f0b46ffe418a1ca1cdbe99194ad9b7767a3bddf7685f9ac82bf",
  );
  for (const fragment of [
    "0x4 DEAL_MELEE_SWING",
    "0x10 DEAL_MELEE_ABILITY",
    "0x40 DEAL_RANGED_ATTACK",
    "0x4000 DEAL_HELPFUL_SPELL",
    "0x10000 DEAL_HARMFUL_SPELL",
  ])
    assert(certificate.procFlags.includes(fragment), fragment);
  assert(
    certificate.targetDefinitions.includes("TARGET_UNIT_TARGET_ENEMY                    = 6,"),
  );
  for (const fragment of [
    "units[event.RaidIndex] == &healer.Unit",
    "unscheduled enemy behaviors need separate workload admission",
    "player.Rotation = &proto.APLRotation{Type: proto.APLRotation_TypeAPL}",
  ])
    assert(workloadSource.includes(fragment), "Workload scope changed: " + fragment);
  const { tables } = evidence;
  const setIds = [...evidence.setIds].sort((a, b) => a - b);
  assert.equal(certificate.profileMaximums.length, 30);
  assert.equal(new Set(certificate.profileMaximums.map((row) => row.id)).size, 30);
  for (const profile of certificate.profileMaximums) {
    assert.deepEqual(
      profile.sets.map((row) => row.setId).sort((a, b) => a - b),
      setIds,
    );
    assert(
      profile.sets.every(
        (row) => Number.isInteger(row.maximum) && row.maximum >= 0 && row.maximum <= 8,
      ),
    );
  }
  const flat = new Set(certificate.flatRoots.map((row) => key(row.setId, row.pieces, row.spellId)));
  assert.equal(flat.size, 66);
  assert.equal(certificate.flatRoots.length, 66);
  const inactive = new Map(
    scopedRoots.map(([setId, pieces, spellId, kind, mask]) => [
      key(setId, pieces, spellId),
      { kind, mask },
    ]),
  );
  const effects = (id) => tables.SpellEffect.filter((row) => row.SpellID === id);
  const decisions = tables.ItemSetSpell.map((row) => {
    const id = key(row.ItemSetID, row.Threshold, row.SpellID);
    const root = { setId: row.ItemSetID, pieces: row.Threshold, spellId: row.SpellID };
    const maximum = Math.max(
      ...certificate.profileMaximums.map(
        (profile) =>
          one(profile.sets, (entry) => entry.setId === row.ItemSetID, "Set maximum").maximum,
      ),
    );
    if (row.Threshold > maximum)
      return {
        ...root,
        classification: "unreachable-in-declared-domain",
        reason:
          "No legal full-loadout witness in any of the thirty profiles can reach this threshold.",
        retainedInEquipmentDomain: true,
      };
    if (flat.has(id))
      return {
        ...root,
        classification: "reviewed-flat-runtime",
        reason:
          "Source-bound flat stats/casting regeneration have separate native and browser threshold evidence.",
        retainedInEquipmentDomain: true,
      };
    if (componentRoots.has(id))
      return {
        ...root,
        classification: "reviewed-owned-component",
        component: componentRoots.get(id),
        reason:
          "The owned component has separate native/browser evidence; complete equipped-workload binding remains required.",
        retainedInEquipmentDomain: true,
      };
    const decision = inactive.get(id);
    assert(decision, "Unclassified reachable Shaman set source " + id);
    const rows = effects(row.SpellID),
      procs = tables.SpellAuraOptions.filter((entry) => entry.SpellID === row.SpellID);
    assert(rows.length > 0);
    if (decision.mask === null) assert.equal(procs.length, 0);
    else {
      assert.equal(procs.length, 1);
      assert.deepEqual(procs[0].ProcTypeMask, [decision.mask, 0]);
      assert.equal(procs[0].SpellProcsPerMinuteID, 0);
    }
    const children = rows.flatMap((entry) =>
      entry.EffectTriggerSpell ? effects(entry.EffectTriggerSpell) : [],
    );
    let reason;
    switch (decision.kind) {
      case "outgoing-attack":
        assert([4, 20, 68].includes(decision.mask));
        assert(rows.some((entry) => entry.EffectAura === 42));
        reason =
          "Requires an outgoing melee/ranged swing or ability. The healing assignment schedules no hostile attacks or autos.";
        break;
      case "outgoing-harmful-spell":
        assert.equal(decision.mask, 65536);
        reason =
          "Requires a harmful spell hit. The controller only casts helpful healing and admitted maintenance/resource actions.";
        break;
      case "later-melee": {
        assert.equal(children.length, 1);
        assert.equal(children[0].EffectAura, 42);
        const childProc = one(
          tables.SpellAuraOptions,
          (entry) => entry.SpellID === children[0].SpellID,
          "Later melee proc",
        );
        assert.deepEqual(childProc.ProcTypeMask, [20, 0]);
        reason =
          "The incoming trigger only enables damage on later melee attacks; the healing assignment has none.";
        break;
      }
      case "enemy-control":
        assert(children.length > 0);
        assert(
          children.every(
            (entry) =>
              JSON.stringify(entry.ImplicitTarget) === "[6,0]" &&
              [7, 26, 33].includes(entry.EffectAura),
          ),
        );
        reason =
          "Only controls an enemy attacker. External enemy damage to the caster and enemy control interactions are rejected by this workload; friendly self-damage provides no enemy recipient.";
        break;
      case "incoming-melee":
        assert.equal(decision.mask, 40);
        reason =
          "Requires a taken melee swing or ability. This assignment rejects external damage to its caster; admitted self-damage is magical.";
        break;
      case "control-removal":
        assert.equal(children.length, 1);
        assert.deepEqual(
          [children[0].Effect, children[0].EffectAura, children[0].ImplicitTarget],
          [108, 0, [1, 0]],
        );
        assert([7, 11].includes(children[0].EffectMiscValue[0]));
        reason = "Removes a snare/root; the stationary assignment schedules no control effects.";
        break;
      case "movement":
        assert(
          rows.every((entry) => entry.EffectAura === 31) ||
            (children.length === 1 && children[0].EffectAura === 129),
        );
        reason =
          "Movement speed cannot change fixed positions or travel time in this stationary assignment.";
        break;
      case "hostile-reflection":
        assert.equal(children.length, 1);
        assert.equal(children[0].EffectAura, 28);
        assert.equal(
          one(tables.Spell, (entry) => entry.id === children[0].SpellID, "Reflection text")
            .Description_lang,
          "Return next hostile spell to sender.",
        );
        reason =
          "No hostile spell is scheduled on the caster. Friendly self-inflicted damage is not a hostile sender.";
        break;
      case "creature-attack-power":
        assert.deepEqual(
          rows.map((entry) => entry.EffectAura),
          [102, 131],
        );
        reason =
          "Creature-specific attack power cannot improve helpful healing in an assignment without hostile attacks.";
        break;
      case "ignored-weapon-skill":
        assert(rows.every((entry) => entry.EffectAura === 30));
        reason =
          "The owner's campaign rule ignores item weapon-skill bonuses while retaining the gear.";
        break;
      case "snare-root-duration":
        assert(
          rows.every(
            (entry) => entry.EffectAura === 232 && [7, 11].includes(entry.EffectMiscValue[0]),
          ),
        );
        reason = "No root or snare event is present in this assignment.";
        break;
      case "fear-resistance":
        assert(rows.every((entry) => entry.EffectAura === 117 && entry.EffectMiscValue[0] === 5));
        reason = "No fear event is present in this assignment.";
        break;
      default:
        assert.fail("Unreviewed set classification");
    }
    return {
      ...root,
      classification: "inactive-in-declared-assignment",
      kind: decision.kind,
      reason,
      retainedInEquipmentDomain: true,
    };
  });
  assert.equal(decisions.length, 104);
  assert.equal(new Set(decisions.map((row) => key(row.setId, row.pieces, row.spellId))).size, 104);
  const counts = Object.fromEntries(
    [
      "reviewed-flat-runtime",
      "reviewed-owned-component",
      "inactive-in-declared-assignment",
      "unreachable-in-declared-domain",
    ].map((name) => [name, decisions.filter((row) => row.classification === name).length]),
  );
  assert.deepEqual(Object.values(counts), [66, 9, 24, 5]);
  assert.deepEqual(
    sortRows(
      decisions.filter((row) => row.classification === "unreachable-in-declared-domain"),
    ).map((row) => [row.setId, row.pieces]),
    [
      [65, 2],
      [2111, 2],
      [2111, 3],
      [2111, 4],
      [2111, 5],
    ],
  );
  return {
    schema: "kfc-shaman-healing-set-scope.v1",
    sourceBuild: 70532,
    setCount: 33,
    sourceBonusRows: 104,
    thresholdGroups: new Set(decisions.map((row) => `${row.setId}/${row.pieces}`)).size,
    counts,
    decisions: sortRows(decisions),
    unclassifiedRows: 0,
    allCandidateItemsRetained: true,
    restrictions: {
      stationary: true,
      playerOnly: true,
      externalDamageToCaster: false,
      hostileRotation: false,
      autos: false,
      controlEvents: false,
      fullLoadoutAcquisitionRequired: true,
    },
    sourceScopeComplete: true,
    runtimeProofsAndEquippedWorkloadBindingStillRequired: true,
    fullClassAdmission: false,
    startsNewClassClock: false,
    numericalQualification: false,
    publicationAllowed: false,
  };
}
