const checksum = /^[a-f0-9]{64}$/;
const identifier = /^[a-z0-9][a-z0-9.-]{0,149}$/;
const ownedKeys = new Set([
  "itemEffectsPolicy",
  "castSetPolicy",
  "selfSetPolicy",
  "itemHealthRegenTickMs",
  "legacyItemsPolicy",
  "utilityHealingCanCrit",
  "recombobulatorCanCrit",
  "circleChannelScales",
  "itemArea",
  "orbArea",
]);
const scenarioKeys = new Set([
  "id",
  "heartPolicyId",
  "heartPolicyOrder",
  "heartChance",
  "wildheartChance",
  "spellPowerChance",
  "dreadmistCanCrit",
  "selfDamageTriggers",
  "regenerationTickMs",
  "thresholdTiming",
  "devoutProcChance",
  "utilityHealingCanCrit",
  "recombobulatorCanCrit",
  "circleChannelScales",
  "itemArea",
  "briarwoodSpellPower",
  "royalSealHealingPower",
]);
function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function chance(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}
function invalid() {
  throw new Error("The Paladin equipment policy data are invalid or incomplete.");
}

/** Initialize source-bound gear rules once, independently of any numerical worker.
 * @param {object} domain @param {{modelIdentity:string,catalogSha256:string}} expected
 * @returns {{modelIdentity:string,catalogSha256:string,scenarioIds:readonly string[],apply:Function}}
 */
export function createPaladinHealingEquipmentPolicies(domain, expected) {
  if (
    !object(domain) ||
    domain.schema !== "kfc-paladin-equipment-policy-domain.v1" ||
    !checksum.test(domain.modelIdentity) ||
    !checksum.test(domain.catalogSha256) ||
    !object(expected) ||
    domain.modelIdentity !== expected.modelIdentity ||
    domain.catalogSha256 !== expected.catalogSha256 ||
    Object.keys(domain).some(
      (key) => !["schema", "modelIdentity", "catalogSha256", "items", "scenarios"].includes(key),
    ) ||
    !Array.isArray(domain.items) ||
    domain.items.length < 1 ||
    domain.items.length > 5000 ||
    !Array.isArray(domain.scenarios) ||
    domain.scenarios.length !== 28
  )
    invalid();
  const items = new Map();
  for (const item of domain.items) {
    if (
      !object(item) ||
      Object.keys(item).length !== 2 ||
      !Number.isSafeInteger(item.id) ||
      item.id < 1 ||
      !Number.isSafeInteger(item.setId) ||
      item.setId < 0 ||
      items.has(item.id)
    )
      invalid();
    items.set(item.id, item.setId);
  }
  const scenarios = new Map();
  for (const scenario of domain.scenarios) {
    if (
      !object(scenario) ||
      Object.keys(scenario).some((key) => !scenarioKeys.has(key)) ||
      typeof scenario.id !== "string" ||
      !identifier.test(scenario.id) ||
      typeof scenario.heartPolicyId !== "string" ||
      !identifier.test(scenario.heartPolicyId) ||
      !["base", "override"].includes(scenario.heartPolicyOrder) ||
      !["heartChance", "wildheartChance", "spellPowerChance"].every((key) =>
        chance(scenario[key]),
      ) ||
      !["dreadmistCanCrit", "selfDamageTriggers"].every(
        (key) => typeof scenario[key] === "boolean",
      ) ||
      ![2000, 5000].includes(scenario.regenerationTickMs) ||
      (scenario.thresholdTiming !== undefined &&
        !["before-hit", "after-hit"].includes(scenario.thresholdTiming)) ||
      (scenario.devoutProcChance !== undefined && !chance(scenario.devoutProcChance)) ||
      ["utilityHealingCanCrit", "recombobulatorCanCrit", "circleChannelScales"].some(
        (key) => scenario[key] !== undefined && typeof scenario[key] !== "boolean",
      ) ||
      (scenario.itemArea !== undefined && !["haunted", "wasteland"].includes(scenario.itemArea)) ||
      !["briarwoodSpellPower", "royalSealHealingPower"].every(
        (key) => Number.isFinite(scenario[key]) && scenario[key] >= 0 && scenario[key] <= 100,
      ) ||
      scenarios.has(scenario.id)
    )
      invalid();
    scenarios.set(scenario.id, structuredClone(scenario));
  }
  if (!scenarios.has("reference")) invalid();

  function apply(workload, gear, scenarioId) {
    const rules = scenarios.get(scenarioId);
    if (
      !rules ||
      !object(workload) ||
      workload.schema !== "kfc-paladin-healing-workload.v1" ||
      !Array.isArray(workload.cooldowns) ||
      !Array.isArray(gear) ||
      gear.length !== 17 ||
      gear.some(
        (item) =>
          !object(item) ||
          !Number.isSafeInteger(item.id) ||
          item.id < 0 ||
          (item.id !== 0 && !items.has(item.id)),
      )
    )
      throw new Error("Choose a source-bound Paladin scenario and complete catalog equipment.");
    const ids = new Set(gear.map((item) => item.id).filter(Boolean));
    const sets = new Map();
    for (const item of gear) {
      const set = items.get(item.id);
      if (set) sets.set(set, (sets.get(set) ?? 0) + 1);
    }
    const owns = (set, count) => (sets.get(set) ?? 0) >= count;
    const before = {};
    if (ids.has(249473)) {
      const header = { schema: "kfc-paladin-item-effects-policy.v1", id: rules.heartPolicyId };
      before.itemEffectsPolicy =
        rules.heartPolicyOrder === "base"
          ? {
              ...header,
              dormantHeartHealingEvents: "completed-casts",
              dormantHeartProcChance: rules.heartChance,
            }
          : {
              ...header,
              dormantHeartProcChance: rules.heartChance,
              dormantHeartHealingEvents: "completed-casts",
            };
    }
    const cast = {};
    if (owns(185, 5)) cast.wildheartManaChance = rules.wildheartChance;
    if (owns(183, 5)) cast.dreadmistCanCrit = rules.dreadmistCanCrit;
    if (owns(187, 5) || owns(188, 5)) cast.spellPowerChance = rules.spellPowerChance;
    if (Object.keys(cast).length) before.castSetPolicy = cast;
    const self = {};
    const regenerationOwner = owns(184, 6) || owns(189, 6) || owns(1968, 4);
    const thresholdOwner = owns(162, 4) || owns(163, 6);
    if (regenerationOwner) self.regenerationTickMs = rules.regenerationTickMs;
    if (thresholdOwner || owns(182, 4)) self.selfDamageTriggers = rules.selfDamageTriggers;
    if (thresholdOwner && rules.thresholdTiming !== undefined)
      self.thresholdTiming = rules.thresholdTiming;
    if (owns(182, 4) && rules.devoutProcChance !== undefined)
      self.devoutProcChance = rules.devoutProcChance;
    if (Object.keys(self).length) before.selfSetPolicy = self;
    if ([2816, 6320, 6459, 6461, 6910, 7684, 14149, 16731].some((id) => ids.has(id)))
      before.itemHealthRegenTickMs = rules.regenerationTickMs;
    const after = {};
    if ([4262, 8346, 7939].some((id) => ids.has(id)) && rules.utilityHealingCanCrit !== undefined)
      after.utilityHealingCanCrit = rules.utilityHealingCanCrit;
    if ([4381, 18637].some((id) => ids.has(id)) && rules.recombobulatorCanCrit !== undefined)
      after.recombobulatorCanCrit = rules.recombobulatorCanCrit;
    if (ids.has(11808) && rules.circleChannelScales !== undefined)
      after.circleChannelScales = rules.circleChannelScales;
    if ([18472, 20512].some((id) => ids.has(id)) && rules.itemArea !== undefined)
      after.itemArea = rules.itemArea;
    if (ids.has(12930) || ids.has(18472))
      after.legacyItemsPolicy = {
        schema: "kfc-paladin-legacy-item-policy.v1",
        id: scenarioId,
        ...(ids.has(12930) ? { briarwoodSpellPower: rules.briarwoodSpellPower } : {}),
        ...(ids.has(18472) ? { royalSealHealingPower: rules.royalSealHealingPower } : {}),
      };
    // Keep the constructor's field order so exact native-cache identities remain reusable.
    const result = {};
    for (const [key, value] of Object.entries(workload)) {
      if (ownedKeys.has(key)) continue;
      if (key === "cooldowns") Object.assign(result, before);
      result[key] = structuredClone(value);
    }
    return Object.assign(result, after);
  }
  return Object.freeze({
    modelIdentity: domain.modelIdentity,
    catalogSha256: domain.catalogSha256,
    scenarioIds: Object.freeze([...scenarios.keys()]),
    apply,
  });
}
