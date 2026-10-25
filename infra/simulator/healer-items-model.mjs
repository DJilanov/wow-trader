import assert from "node:assert/strict";

export const priestHealingBlueIds = Object.freeze([
  272562, 272563, 272564, 272565, 272566, 272567, 272568, 272569,
]);
const one = (rows, predicate, label) => {
  const matches = rows.filter(predicate);
  assert.equal(matches.length, 1, `Missing or ambiguous ${label}`);
  return matches[0];
};
const ordered = (values) => [...values].sort((a, b) => a - b);

/** Extract reviewed item payloads; cast-event interpretation and server acquisition stay explicit.
 * @param {object} evidence @returns {object}
 */
export function extractHealerItemRules(evidence) {
  assert.equal(evidence.schema, "kfc-healer-item-client-source.v1");
  assert.equal(evidence.normalized.schema, "forever-client-mechanics.v1");
  assert.equal(evidence.normalized.clientVersion, evidence.source.build.clientVersion);
  assert.equal(evidence.normalized.hotfixSha256, evidence.source.hotfixSha256);
  assert(/^[a-f0-9]{64}$/.test(evidence.source.manifestSha256));
  assert(/^[a-f0-9]{64}$/.test(evidence.source.normalizedSha256));
  const tables = evidence.tables,
    effects = (spell) =>
      tables.SpellEffect.filter((row) => row.SpellID === spell).sort(
        (a, b) => a.EffectIndex - b.EffectIndex,
      ),
    link = one(tables.ItemXItemEffect, (row) => row.ItemID === 19288, "Blue Dragon item link"),
    effect = one(
      tables.ItemEffect,
      (row) => row.id === link.ItemEffectID,
      "Blue Dragon item effect",
    );
  assert.deepEqual(
    [
      effect.id,
      effect.SpellID,
      effect.TriggerType,
      effect.Charges,
      effect.CoolDownMSec,
      effect.CategoryCoolDownMSec,
      effect.SpellCategoryID,
      effect.PlayerConditionID,
      effect.ChrSpecializationID,
    ],
    [101733, 23688, 1, 0, -1, -1, 0, 0, 0],
  );
  const trigger = effects(23688),
    payload = effects(23684);
  assert.equal(trigger.length, 1);
  assert.equal(payload.length, 1);
  const compact = (row) => [
    row.Effect,
    row.EffectAura,
    row.EffectBasePointsF,
    row.EffectMiscValue,
    row.EffectTriggerSpell,
    row.ImplicitTarget,
    row.EffectSpellClassMask,
  ];
  assert.deepEqual(compact(trigger[0]), [6, 42, 100, [0, 0], 23684, [1, 0], [0, 0, 0, 0]]);
  assert.deepEqual(compact(payload[0]), [6, 29, 150, [4, 0], 0, [1, 0], [0, 0, 0, 0]]);
  for (const row of [...trigger, ...payload])
    for (const field of [
      "DifficultyID",
      "Variance",
      "ScalingClass",
      "EffectRealPointsPerLevel",
      "EffectPointsPerResource",
      "Coefficient",
      "BonusCoefficientFromAP",
      "ResourceCoefficient",
      "EffectAuraPeriod",
    ])
      assert.equal(row[field], 0, `Unreviewed Blue Dragon ${field}`);
  assert.equal(trigger[0].EffectBonusCoefficient, 0);
  assert.equal(payload[0].EffectBonusCoefficient, 1);
  const proc = one(tables.SpellAuraOptions, (row) => row.SpellID === 23688, "Blue Dragon proc");
  assert.deepEqual(
    [
      proc.DifficultyID,
      proc.CumulativeAura,
      proc.ProcCategoryRecovery,
      proc.ProcChance,
      proc.ProcCharges,
      proc.SpellProcsPerMinuteID,
      proc.ProcTypeMask,
    ],
    [0, 0, 0, 2, 0, 0, [81920, 0]],
  );
  const misc = one(tables.SpellMisc, (row) => row.SpellID === 23684, "Blue Dragon duration link"),
    duration = one(
      tables.SpellDuration,
      (row) => row.id === misc.DurationIndex,
      "Blue Dragon duration",
    );
  assert.deepEqual(
    [duration.Duration, duration.MaxDuration, duration.DurationPerResource],
    [15000, 15000, 0],
  );
  const set = one(evidence.normalized.sets, (row) => row.id === 549, "Priest blue set");
  assert.equal(set.Name_lang, "Champion's Raiment");
  assert.equal(set.RequiredSkill, 0);
  assert.equal(set.RequiredSkillRank, 0);
  assert.deepEqual(
    ordered(set.ItemID.filter(Boolean)),
    [272562, 272563, 272564, 272565, 272568, 272569],
  );
  assert.deepEqual(
    evidence.normalized.setEffects
      .filter((row) => row.ItemSetID === 549)
      .map((row) => [row.Threshold, row.SpellID])
      .sort((a, b) => a[0] - b[0]),
    [
      [2, 14047],
      [4, 23044],
      [6, 14467],
    ],
  );
  assert.deepEqual(effects(14047).map(compact), [
    [6, 13, 23, [126, 0], 0, [1, 0], [0, 0, 0, 0]],
    [6, 135, 23, [126, 0], 0, [1, 0], [0, 0, 0, 0]],
  ]);
  assert.deepEqual(effects(14467).map(compact), [[6, 29, 20, [2, 0], 0, [1, 0], [0, 0, 0, 0]]]);
  assert.deepEqual(effects(23043).map(compact), [[6, 108, 50, [9, 0], 0, [1, 0], [8192, 0, 0, 0]]]);
  assert.deepEqual(effects(23044).map(compact), [
    [6, 107, 1000, [1, 0], 0, [1, 0], [65536, 0, 0, 0]],
  ]);
  return {
    schema: "kfc-healer-item-rules.v1",
    blueDragon: {
      itemId: 19288,
      triggerSpellId: 23688,
      buffSpellId: 23684,
      spirit: 150,
      durationMs: 15000,
      procChance: 0.02,
      spiritRegenWhileCastingOverride: false,
    },
    priestBlueSet: { id: 549, spellPowerAtTwo: 23, staminaAtSix: 20 },
    assumptions: {
      blueDragonEvents:
        "one proc opportunity on eligible completed spell casts, not each periodic tick, heal recipient or triggered bounce",
      refresh: "refresh one nonstacking stat aura",
      acquisition: "historical provisional deck/PvP access; not live server verification",
      utility: "Mind Flay pushback and Psychic Scream duration are outside these healing workloads",
    },
    classMechanicsAdmission: false,
    publicationAllowed: false,
  };
}

/** Append reviewed current items without altering existing item records or inheriting numerical results.
 * @param {object} parent @param {object} evidence @returns {object}
 */
export function extendPriestHealingItemCatalog(parent, evidence) {
  const rules = extractHealerItemRules(evidence),
    additions = [],
    sources = [],
    before = JSON.stringify(parent),
    historical = evidence.historicalBlueDragon;
  assert.deepEqual(ordered(evidence.priorPriestPvp.map((row) => row.id)), [
    ...priestHealingBlueIds,
  ]);
  assert.equal(historical.id, 19288);
  assert(historical.sources.some((row) => row.quest?.id === 7907));
  assert.match(
    evidence.historicalAcquisition.tokenLine,
    /\[19228\] = \{ 19228, 19288, 0, 19227, 19230, 19231, 19232, 19233, 19234, 19235, 19236 \}/,
  );
  assert.match(evidence.historicalAcquisition.beastSection, /npcID = 10430,/);
  assert.match(evidence.historicalAcquisition.beastSection, /\{ 16, 19227 \}/);
  assert.equal(
    one(evidence.tables.ItemSparse, (row) => row.id === 19228, "Beasts Deck").StartQuestID,
    7907,
  );
  for (const id of [19288, ...priestHealingBlueIds]) {
    assert(!parent.items.some((row) => row.id === id), `Refusing to replace existing item ${id}`);
    const current = one(
        evidence.normalized.items,
        (row) => row.itemId === id,
        `current item ${id}`,
      ),
      sparse = one(evidence.tables.ItemSparse, (row) => row.id === id, `ItemSparse ${id}`);
    assert.deepEqual(current.issues, []);
    assert.equal(current.name, sparse.Display_lang);
    assert.equal(current.classId, 4);
    assert.equal(current.itemLevel, sparse.ItemLevel);
    assert.equal(current.requiredLevel, sparse.RequiredLevel);
    assert.equal(current.inventoryType, sparse.InventoryType);
    assert.equal(current.quality, sparse.OverallQualityID);
    for (const field of ["RequiredAbility", "RequiredSkill", "LimitCategory"])
      assert.equal(sparse[field], 0);
    assert.deepEqual(sparse.AllowableRace, [-1, -1]);
    assert.deepEqual(sparse.SocketType, [0, 0, 0]);
    assert(Number.isFinite(current.armor) && current.armor >= 0);
    let item;
    if (id === 19288) {
      assert.deepEqual(
        [
          current.itemLevel,
          current.quality,
          current.requiredLevel,
          current.inventoryType,
          current.subclassId,
          sparse.MaxCount,
          sparse.AllowableClass,
        ],
        [66, 4, 60, 12, 0, 1, -1],
      );
      assert.deepEqual(current.stats, []);
      assert.equal(current.armor, 0);
      assert.deepEqual(current.effectIds, [101733]);
      item = {
        id,
        name: current.name,
        icon: historical.icon,
        type: 12,
        stats: Array(44).fill(0),
        ilvl: 66,
        quality: 4,
        phase: 1,
        expansion: 1,
        unique: true,
        sources: globalThis.structuredClone(historical.sources),
      };
      sources.push({
        id,
        name: current.name,
        requiredLevel: 60,
        maxCount: 1,
        sources: [{ kind: "classic-pre-raid" }],
        status: "current-client-historical-acquisition",
        acquisition: {
          kind: "historical-darkmoon-beast-deck",
          questId: 7907,
          deckId: 19228,
          aceId: 19227,
          aceDungeonNpcId: 10430,
          currentServerVerified: false,
          remainingCards: "historical world drops; not a raid-only material requirement",
        },
      });
    } else {
      item = globalThis.structuredClone(evidence.priorPriestPvp.find((row) => row.id === id));
      assert.deepEqual(
        [
          current.itemLevel,
          current.quality,
          current.requiredLevel,
          current.subclassId,
          sparse.AllowableClass,
          sparse.MaxCount,
        ],
        [60, 3, 55, 1, 16, 0],
      );
      assert.deepEqual(item.classAllowlist, [5]);
      assert.equal(item.factionRestriction, 2);
      const stats = Array(44).fill(0),
        fields = new Map([
          [5, 3],
          [6, 4],
          [7, 2],
          [45, 5],
        ]);
      for (const stat of current.stats) {
        assert(fields.has(stat.statType) && Number.isFinite(stat.value) && stat.value >= 0);
        stats[fields.get(stat.statType)] += stat.value;
      }
      stats[26] = current.armor;
      assert.deepEqual(item.stats, stats, `Current Priest blue values changed: ${id}`);
      assert.equal(item.setId ?? null, current.setId);
      assert.equal(sparse.ItemSet || null, current.setId);
      assert.deepEqual(current.effectIds, id === 272569 ? [232385] : []);
      sources.push({
        id,
        name: current.name,
        requiredLevel: 55,
        sources: [{ kind: "pvp", faction: "Horde" }],
        status: "current-client-prior-inferred-pvp-access",
        currentServerVerified: false,
      });
    }
    assert(/^[a-z0-9_]+$/i.test(item.icon));
    additions.push(item);
  }
  const db = globalThis.structuredClone(parent);
  db.items.push(...additions);
  for (const item of additions) {
    const icons = db.itemIcons.filter((row) => row.id === item.id);
    assert(icons.length <= 1);
    if (icons.length) assert.equal(icons[0].icon, item.icon);
    else db.itemIcons.push({ id: item.id, name: item.name, icon: item.icon });
  }
  assert.equal(JSON.stringify(parent), before);
  assert.deepEqual(db.items.slice(0, parent.items.length), parent.items);
  return {
    db,
    additions,
    sources,
    rules,
    classMechanicsAdmission: false,
    publicationAllowed: false,
  };
}

/** Replace only the legacy Blue Dragon payload in a derived common source file.
 * @param {string} source @param {object} rules @returns {string}
 */
export function renderBlueDragonItemEffect(source, rules) {
  assert.equal(rules.schema, "kfc-healer-item-rules.v1");
  assert.deepEqual(
    [rules.blueDragon.spirit, rules.blueDragon.procChance, rules.blueDragon.durationMs],
    [150, 0.02, 15000],
  );
  const start = source.indexOf("\t// https://www.wowhead.com/classic/item=19288/"),
    end = source.indexOf("\n\t// https://www.wowhead.com/classic/item=19287/", start);
  assert(start >= 0 && end > start, "Blue Dragon source anchor changed");
  const old = source.slice(start, end);
  assert(
    old.includes("AttachSpiritRegenRateCastingBuff(1)"),
    "Expected the preserved legacy Blue Dragon implementation",
  );
  const replacement = `\t// Current client: successful eligible spell casts can grant 150 Spirit for 15 seconds.
\tcore.NewItemEffect(DarkmoonCardBlueDragon, func(agent core.Agent) {
\t\tcharacter := agent.GetCharacter()
\t\tprocAura := character.NewTemporaryStatsAura("Aura of the Blue Dragon", core.ActionID{SpellID: 23684}, stats.Stats{stats.Spirit: 150}, time.Second*15)
\t\tcore.MakeProcTriggerAura(&character.Unit, core.ProcTrigger{
\t\t\tName: "Aura of the Blue Dragon Trigger",
\t\t\tCallback: core.CallbackOnCastComplete,
\t\t\tProcMask: core.ProcMaskSpellDamage | core.ProcMaskSpellHealing,
\t\t\tProcChance: .02,
\t\t\tHandler: func(sim *core.Simulation, _ *core.Spell, _ *core.SpellResult) { procAura.Activate(sim) },
\t\t})
\t})
`;
  return source.slice(0, start) + replacement + source.slice(end);
}

/** Bind the current set ID; healing workloads do not use its crowd-control utility.
 * @param {string} source @param {object} rules @returns {string}
 */
export function renderPriestHealingSetEffect(source, rules) {
  assert.deepEqual(rules.priestBlueSet, { id: 549, spellPowerAtTwo: 23, staminaAtSix: 20 });
  assert(source.startsWith("package priest\n"));
  assert(!source.includes("ItemSetKfcCurrentPriestPvp"));
  return (
    source +
    `
var ItemSetKfcCurrentPriestPvp = core.NewItemSet(core.ItemSet{
    ID: 549,
    Name: "Champion's Raiment",
    Bonuses: map[int32]core.ApplyEffect{
        2: func(agent core.Agent) { agent.GetCharacter().AddStat(stats.SpellPower, 23) },
        6: func(agent core.Agent) { agent.GetCharacter().AddStat(stats.Stamina, 20) },
    },
})
`
  );
}
