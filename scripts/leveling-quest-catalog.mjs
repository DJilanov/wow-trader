import {
  questCatalogEntrySchema,
  questCreatureKillCount,
  isSharedFundingQuest,
} from "../packages/leveling/dist/index.js";

const slot = (value, index) => (Array.isArray(value) ? value[index - 1] : value?.[String(index)]);
const entries = (value) => (value && typeof value === "object" ? Object.values(value) : []);
const ids = (value) =>
  entries(value).filter((id) => Number.isSafeInteger(id) && id > 0 && id <= 10_000_000);
const positive = (value, maximum = 60) =>
  Number.isInteger(value) && value > 0 && value <= maximum ? value : null;
const present = (value) =>
  value !== null &&
  value !== undefined &&
  value !== 0 &&
  value !== false &&
  value !== "" &&
  (typeof value !== "object" || entries(value).length > 0);

export function catalogEntityPositions(entity, areaMap) {
  const positions = [];
  const spawns = entity?.data.spawns ?? {};
  for (const [area, points] of Object.entries(spawns)) {
    const zone = areaMap.get(Number(area) + (Array.isArray(spawns) ? 1 : 0));
    if (!zone || !Array.isArray(points)) continue;
    for (const point of points) {
      if (!Array.isArray(point) || point.length < 2 || present(point[2])) continue;
      const [x, y] = point;
      if (
        ![x, y].every(
          (number) =>
            typeof number === "number" && Number.isFinite(number) && number >= 0 && number <= 100,
        )
      )
        continue;
      if (
        !positions.some(
          (position) => position.zone === zone && position.x === x && position.y === y,
        )
      )
        positions.push({ zone, x, y });
    }
  }
  return positions.slice(0, 500);
}

export function catalogNpcGiver(entity, areaMap) {
  if (!entity?.name) return null;
  return {
    npcId: entity.id,
    name: entity.name,
    friendlyToAlliance: ["A", "AH"].includes(entity.data.friendlyToFaction),
    positions: catalogEntityPositions(entity, areaMap),
  };
}

export function normalizeCatalogQuest(entity, npcs, areaMap, items = new Map()) {
  if (!entity.name) return null;
  const data = entity.data;
  const providedItemId = positive(data.sourceItemId, 10_000_000);
  const providedItem = providedItemId === null ? null : items.get(providedItemId);
  const unsupportedRequirements = [];
  for (const field of [
    "requiredSkill",
    "requiredMinRep",
    "requiredMaxRep",
    "requiredSourceItems",
    "parentQuest",
    "requiredSpell",
    "requiredSpecialization",
    "requiredMaxLevel",
    "availableUntilCompleted",
    "availableStartingWith",
    "requiredRanks",
    "disabledByQuest",
  ])
    if (present(data[field])) unsupportedRequirements.push(field);
  if ((Number(data.specialFlags ?? 0) & 1) !== 0) unsupportedRequirements.push("repeatable");
  if ((Number(data.questFlags ?? 0) & (0x40 | 0x1000 | 0x8000)) !== 0)
    unsupportedRequirements.push("raid-or-recurring");
  if (present(data.sourceItemId)) unsupportedRequirements.push("provided-item-interaction");
  if (present(data.triggerEnd)) unsupportedRequirements.push("exploration-trigger");
  if (!(typeof data.zoneOrSort === "number" && data.zoneOrSort > 0 && areaMap.has(data.zoneOrSort)))
    unsupportedRequirements.push("non-outdoor-zone");
  const creatures = entries(slot(data.objectives, 1));
  const nonCreature = Array.from({ length: 5 }, (_, index) =>
    slot(data.objectives, index + 2),
  ).some(present);
  const objectiveText = entries(data.objectivesText).filter((text) => typeof text === "string");
  const recipients = ids(slot(data.finishedBy, 1)).flatMap((id) => npcs.get(id)?.name ?? []);
  const plainDelivery = (text) =>
    recipients.some((name) => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return (
        !/\b(kill|slay|collect|gather|use|escort|protect)\b/i.test(text) &&
        new RegExp(
          `^(?:Speak (?:with|to)|Talk to|Return to) ${escaped}(?: about [^.!?]+)?[.!?]?$`,
          "i",
        ).test(text.trim())
      );
    });
  if (
    !creatures.length &&
    !nonCreature &&
    objectiveText.some((text) => text.trim() && !plainDelivery(text))
  )
    unsupportedRequirements.push("unresolved-objective-text");
  const objectives = creatures.flatMap((entry, index) => {
    const npcId = positive(slot(entry, 1), 10_000_000);
    if (npcId === null) return [];
    const npc = npcs.get(npcId);
    const relatedNames = creatures.flatMap((creature) => npcs.get(slot(creature, 1))?.name ?? []);
    return [
      {
        index: index + 1,
        npcId,
        count: npc?.name ? questCreatureKillCount(npc, objectiveText, relatedNames) : null,
        positions: catalogNpcGiver(npc, areaMap)?.positions ?? [],
      },
    ];
  });
  if (objectives.length !== creatures.length)
    unsupportedRequirements.push("invalid-creature-objective");
  const givers = (value) =>
    ids(slot(value, 1)).flatMap((id) => {
      const giver = catalogNpcGiver(npcs.get(id), areaMap);
      return giver ? [giver] : [];
    });
  return questCatalogEntrySchema.parse({
    questId: entity.id,
    title: entity.name,
    minimumLevel: data.requiredLevel === 0 ? 1 : positive(data.requiredLevel),
    questLevel: positive(data.questLevel),
    requiredRaces: data.requiredRaces ?? 0,
    requiredClasses: data.requiredClasses ?? 0,
    ...(providedItem?.name?.trim()
      ? { providedItem: { itemId: providedItemId, name: providedItem.name.trim() } }
      : {}),
    starts: givers(data.startedBy),
    ends: givers(data.finishedBy),
    prerequisites: { allOf: ids(data.preQuestGroup), anyOf: ids(data.preQuestSingle) },
    exclusiveWith: ids(data.exclusiveTo),
    category:
      creatures.length && !nonCreature
        ? "shared-kills"
        : !creatures.length && !nonCreature && !present(data.triggerEnd)
          ? "delivery"
          : "unsupported",
    objectives,
    unsupportedRequirements,
  });
}

export function isSharedCatalogQuest(quest) {
  return isSharedFundingQuest(quest);
}

export function applyCatalogSourceConstraints(quests, chapters) {
  const requirements = new Map();
  const record = (id) => {
    let value = requirements.get(id);
    if (!value) {
      value = {
        parents: new Set(),
        explicitParents: new Set(),
        independentPickup: false,
        usablePickup: false,
        heldPickup: false,
        hasObjectives: false,
      };
      requirements.set(id, value);
    }
    return value;
  };
  for (const chapter of chapters)
    for (const step of chapter.steps) {
      let previousReturn = null;
      for (const directive of step.directives) {
        const id = directive.questId;
        if (id === null) continue;
        if (directive.tag === ".turnin") previousReturn = id;
        if (directive.tag === ".complete") record(id).hasObjectives = true;
        if (directive.tag !== ".accept") continue;
        const value = record(id);
        const held = step.condition.trim() === "skip" || directive.condition.trim() === "skip";
        if (held) value.heldPickup = true;
        else value.usablePickup = true;
        if (previousReturn !== null && previousReturn !== id) value.parents.add(previousReturn);
        // A preceding hand-in can be visit order; an unconditional standalone pickup
        // corroborates the provider's empty prerequisite list. Explicit gates remain held.
        if (
          !held &&
          previousReturn === null &&
          !step.condition.trim() &&
          !directive.condition.trim() &&
          !step.directives.some((check) =>
            [
              ".isOnQuest",
              ".isNotOnQuest",
              ".isQuestComplete",
              ".isQuestNotComplete",
              ".isQuestTurnedIn",
              ".isQuestAvailable",
              ".minlevel",
              ".maxlevel",
            ].includes(check.tag),
          )
        )
          value.independentPickup = true;
        for (const check of step.directives) {
          if (check.tag !== ".isQuestTurnedIn") continue;
          const parent = Number(check.arguments.split(",")[0]);
          if (Number.isSafeInteger(parent) && parent > 0 && parent !== id)
            value.explicitParents.add(parent);
        }
      }
    }
  return quests.map((quest) => {
    const source = requirements.get(quest.questId);
    if (!source) return quest;
    return {
      ...quest,
      unsupportedRequirements: [
        ...new Set([
          ...quest.unsupportedRequirements,
          ...((source.explicitParents.size || (source.parents.size && !source.independentPickup)) &&
          !quest.prerequisites.allOf.length &&
          !quest.prerequisites.anyOf.length
            ? ["unresolved-source-prerequisite"]
            : []),
          ...(source.heldPickup && !source.usablePickup ? ["source-held-pickup"] : []),
          ...(source.hasObjectives && quest.category === "delivery"
            ? ["source-completion-objective"]
            : []),
        ]),
      ],
    };
  });
}

export function applyCatalogKillQuotaClaims(quests, claims, held = new Map()) {
  const conflicts = [];
  const reconciled = quests.map((quest) => {
    let conflict = false;
    const objectives = quest.objectives.map((objective) => {
      const key = `${quest.questId}:${objective.index}`;
      const values = claims.get(key);
      const reasons = held.get(key) ?? [];
      if (
        reasons.length ||
        (values?.size > 0 &&
          (values.size > 1 || (objective.count !== null && !values.has(objective.count))))
      ) {
        conflict = true;
        conflicts.push({
          questId: quest.questId,
          objectiveIndex: objective.index,
          counts: [
            ...new Set([
              ...(objective.count === null ? [] : [objective.count]),
              ...(values?.keys() ?? []),
            ]),
          ].sort((left, right) => left - right),
          reasons: reasons.length ? [...reasons] : ["Required kill counts disagree."],
        });
        return { ...objective, count: null };
      }
      return objective.count === null && values?.size === 1
        ? { ...objective, count: [...values.keys()][0] }
        : objective;
    });
    return {
      ...quest,
      objectives,
      unsupportedRequirements: [
        ...new Set([
          ...quest.unsupportedRequirements,
          ...(conflict ? ["kill-quota-conflict"] : []),
        ]),
      ],
    };
  });
  return { quests: reconciled, conflicts };
}
