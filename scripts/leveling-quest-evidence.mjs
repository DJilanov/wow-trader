import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";

import { DUNGEON_QUESTS, DUNGEON_REFERENCE } from "../packages/leveling/dist/index.js";
import {
  extractQuestReferenceFacts,
  questXpRecordSchema,
  readStagedReference,
} from "../packages/reference-data/dist/index.js";

const DUNGEON_AREA_IDS = {
  "Scarlet Monastery": [796, 6109, 6386, 10008, 10009, 10010],
  "Razorfen Downs": [722],
  Uldaman: [1337, 1517, 10033],
  "Zul'Farrak": [1176, 978],
  Maraudon: [2100, 10000],
  "Temple of Atal'Hakkar - Sunken Temple": [1477, 1417],
  "Blackrock Depths BRD": [1584, 1585],
  "Lower Blackrock Spire - LBRS": [1583, 10003, 10004, 10005, 10006, 10007],
  Stratholme: [2017, 10001],
};

const rawArgs = process.argv.slice(2);
const { values } = parseArgs({
  args: rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs,
  options: {
    plan: { type: "string" },
    questie: { type: "string" },
    staging: { type: "string" },
    output: { type: "string" },
  },
  strict: true,
});

if (!values.plan || !values.questie || !values.staging || !values.output)
  throw new Error(
    "Pass --plan=<evidence queue report> --questie=<selected QuestieDB bundle> --staging=<Wowhead staging> --output=<evidence report>.",
  );

const planInput = await boundedJson(values.plan, 32_000_000);
const questieInput = await boundedJson(values.questie, 32_000_000);
const plan = planInput.value;
const questie = questieInput.value;
if (
  !isRecord(plan) ||
  plan.schema !== "leveling-evidence-crawl-plan.v1" ||
  !Array.isArray(plan.quests)
)
  throw new Error("Unsupported leveling evidence crawl plan");
if (
  !isRecord(questie) ||
  questie.sourceKind !== "questiedb_forever" ||
  !Array.isArray(questie.entities) ||
  !Array.isArray(questie.artifacts)
)
  throw new Error("Unsupported QuestieDB evidence bundle");

const entities = new Map();
for (const entity of questie.entities) {
  if (
    !isRecord(entity) ||
    !["quest", "npc", "item", "object"].includes(entity.kind) ||
    !Number.isSafeInteger(entity.id) ||
    !isRecord(entity.data)
  )
    throw new Error("QuestieDB evidence bundle contains an invalid entity");
  const key = `${entity.kind}:${entity.id}`;
  if (entities.has(key)) throw new Error(`Duplicate QuestieDB entity ${key}`);
  entities.set(key, entity);
}

const questRows = [];
for (const planned of plan.quests) {
  if (
    !isRecord(planned) ||
    !Number.isSafeInteger(planned.id) ||
    !Array.isArray(planned.evidenceCodes) ||
    planned.evidenceCodes.some((code) => typeof code !== "string")
  )
    throw new Error("Evidence crawl plan contains an invalid quest");
  const id = planned.id;
  const task = { game: "forever", kind: "quest", id };
  const page = await readStagedReference(resolve(values.staging), task);
  const pageFacts = page ? extractQuestReferenceFacts(page) : null;
  const xp = await readQuestXp(resolve(values.staging), id);
  const historical = entities.get(`quest:${id}`) ?? null;
  const curated = DUNGEON_QUESTS.find((quest) => quest.id === id) ?? null;
  const dungeonNames = [
    ...new Set(
      DUNGEON_REFERENCE.associations
        .filter((association) => association.questId === id)
        .map((association) => association.dungeon),
    ),
  ].sort();
  const pickup = inferPickup(historical, entities, dungeonNames);
  const prerequisites = historicalPrerequisites(historical);
  const minimumClaims = [
    ...(pageFacts?.minimumLevel === null || pageFacts?.minimumLevel === undefined
      ? []
      : [{ value: pageFacts.minimumLevel, source: "wowhead-current" }]),
    ...(number(historical?.data.requiredLevel) === null
      ? []
      : [{ value: number(historical.data.requiredLevel), source: "questiedb-historical" }]),
    ...(curated?.minimumLevel === null || curated?.minimumLevel === undefined
      ? []
      : [{ value: curated.minimumLevel, source: "curated-route" }]),
  ];
  const conflicts = [];
  if (
    pageFacts &&
    historical?.name &&
    normalize(pageFacts.name) !== normalize(String(historical.name))
  )
    conflicts.push(`title: Wowhead '${pageFacts.name}' vs QuestieDB '${historical.name}'`);
  if (new Set(minimumClaims.map((claim) => claim.value)).size > 1)
    conflicts.push(
      `minimum-level: ${minimumClaims.map((claim) => `${claim.source}=${claim.value}`).join(", ")}`,
    );
  const pageLifecycleComplete = Boolean(
    pageFacts &&
    pageFacts.minimumLevel !== null &&
    pageFacts.starters.length &&
    pageFacts.finishers.length &&
    pageFacts.objectiveState !== "unknown",
  );
  const statuses = Object.fromEntries(
    planned.evidenceCodes.map((code) => [
      code,
      evidenceStatus(code, { pageFacts, xp, historical, pickup, pageLifecycleComplete, conflicts }),
    ]),
  );
  const statusValues = Object.values(statuses);
  const state = !page
    ? "pending-current-page"
    : conflicts.length
      ? "conflict"
      : statusValues.includes("manual-review")
        ? "manual-review"
        : statusValues.includes("pending-page")
          ? "pending-current-page"
          : "source-ready";
  questRows.push({
    questId: id,
    title: pageFacts?.name ?? historical?.name ?? curated?.title ?? null,
    sourceUrl: planned.sourceUrl,
    evidenceCodes: [...planned.evidenceCodes].sort(),
    state,
    statuses,
    dungeonNames,
    minimumLevel:
      pageFacts?.minimumLevel ??
      number(historical?.data.requiredLevel) ??
      curated?.minimumLevel ??
      null,
    minimumClaims,
    questLevel: pageFacts?.questLevel ?? number(historical?.data.questLevel),
    faction: pageFacts?.side ?? curated?.faction ?? null,
    raceIds: pageFacts?.raceIds ?? [],
    classIds: pageFacts?.classIds ?? [],
    requiredRaceMask: number(historical?.data.requiredRaces),
    requiredClassMask: number(historical?.data.requiredClasses),
    shareable:
      pageFacts?.shareable ??
      (number(historical?.data.questFlags) === null
        ? (curated?.shareable ?? null)
        : (number(historical.data.questFlags) & 8) !== 0),
    pickup,
    objectiveStage: dungeonNames.length ? "inside" : "unknown",
    prerequisites,
    starters: pageFacts?.starters ?? [],
    finishers: pageFacts?.finishers ?? [],
    series: pageFacts?.series ?? [],
    objectives: pageFacts?.objectives ?? stringArray(historical?.data.objectivesText),
    pageLifecycleComplete,
    currentPageCaptured: page !== null,
    currentXpStatus: xp?.status ?? null,
    conflicts,
    sources: {
      wowhead: page
        ? {
            capturedAt: page.capturedAt,
            sourceUrl: page.sourceUrl,
            sourceSha256: page.sourceSha256,
          }
        : null,
      questie: historical
        ? {
            sourceVersion: questie.sourceVersion,
            sourceRevision: questie.sourceRevision,
            bundleChecksum: questie.checksum,
          }
        : null,
      curated: curated?.evidence ?? null,
    },
  });
}

const stateCounts = Object.fromEntries(
  ["source-ready", "pending-current-page", "manual-review", "conflict"].map((state) => [
    state,
    questRows.filter((quest) => quest.state === state).length,
  ]),
);
const statusCounts = {};
for (const quest of questRows)
  for (const status of Object.values(quest.statuses))
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
const output = {
  schema: "campaign-quest-source-evidence.v1",
  targetBuild: plan.targetBuild ?? null,
  planSha256: createHash("sha256").update(planInput.raw).digest("hex"),
  questieSha256: createHash("sha256").update(questieInput.raw).digest("hex"),
  summary: {
    quests: questRows.length,
    currentPages: questRows.filter((quest) => quest.currentPageCaptured).length,
    historicalQuestRows: questRows.filter((quest) => quest.sources.questie).length,
    states: stateCounts,
    issueStatuses: statusCounts,
  },
  quests: questRows.sort((left, right) => left.questId - right.questId),
};
await atomicJsonWrite(values.output, output);
process.stdout.write(`${JSON.stringify({ output: resolve(values.output), ...output.summary })}\n`);

function evidenceStatus(code, evidence) {
  if (code === "reward-historical-estimate" || code === "reward-unresolved")
    return evidence.xp?.status === "available" ? "resolved" : "pending-page";
  if (code === "pickup-level-conflict")
    return evidence.pageFacts?.minimumLevel === null || !evidence.pageFacts
      ? "pending-page"
      : "source-ready";
  if (code === "quest-lifecycle-unverified") {
    if (!evidence.pageFacts) return "pending-page";
    if (!evidence.pageLifecycleComplete || evidence.pickup.stage === "unknown")
      return "manual-review";
    return evidence.historical ? "source-ready" : "manual-review";
  }
  if (code === "personal-eligibility-unverified")
    return evidence.pageFacts?.side ? "source-ready" : "pending-page";
  if (code === "source-gate-conflict")
    return evidence.pageFacts && (evidence.historical || evidence.pageFacts.series.length)
      ? "manual-review"
      : "pending-page";
  return "manual-review";
}

function inferPickup(quest, entitiesByKey, dungeonNames) {
  if (!quest) return { stage: "unknown", givers: [] };
  const dungeonAreas = new Set(dungeonNames.flatMap((name) => DUNGEON_AREA_IDS[name] ?? []));
  const givers = [];
  for (const [index, group] of positionalEntries(quest.data.startedBy)) {
    const kind = ["npc", "object", "item"][index];
    if (!kind || !Array.isArray(group)) continue;
    for (const id of group) {
      if (!Number.isSafeInteger(id) || id <= 0) continue;
      const entity = entitiesByKey.get(`${kind}:${id}`);
      const areaIds = isRecord(entity?.data.spawns)
        ? Object.keys(entity.data.spawns).map(Number).filter(Number.isSafeInteger)
        : [];
      givers.push({ kind, id, name: entity?.name ?? null, areaIds });
    }
  }
  return {
    stage: givers.some((giver) => giver.areaIds.some((id) => dungeonAreas.has(id)))
      ? "inside"
      : givers.some((giver) => giver.areaIds.length)
        ? "before"
        : "unknown",
    givers,
  };
}

function historicalPrerequisites(quest) {
  if (!quest) return { allOf: [], anyOf: [], parentQuestId: null, requiredItemIds: [] };
  return {
    allOf: numericArray(quest.data.preQuestGroup),
    anyOf: numericArray(quest.data.preQuestSingle),
    parentQuestId: number(quest.data.parentQuest),
    requiredItemIds: numericArray(quest.data.requiredSourceItems),
  };
}

function positionalEntries(value) {
  if (Array.isArray(value)) return value.map((entry, index) => [index, entry]);
  if (!isRecord(value)) return [];
  return Object.entries(value)
    .filter(([key]) => /^[1-9]\d*$/.test(key))
    .map(([key, entry]) => [Number(key) - 1, entry])
    .sort(([left], [right]) => left - right);
}

function numericArray(value) {
  return Array.isArray(value)
    ? value.filter((entry) => Number.isSafeInteger(entry) && entry > 0)
    : [];
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
}

function number(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function normalize(value) {
  return value
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function readQuestXp(root, id) {
  const path = resolve(root, `forever-quest-${id}.xp.json`);
  try {
    if ((await stat(path)).size > 300_000) throw new Error("Quest XP record exceeds size budget");
    const record = questXpRecordSchema.parse(JSON.parse(await readFile(path, "utf8")));
    if (record.game !== "forever" || record.id !== id)
      throw new Error("Quest XP identity mismatch");
    return record;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function boundedJson(path, maximum) {
  const absolute = resolve(path);
  if ((await stat(absolute)).size > maximum) throw new Error(`Input exceeds size budget: ${path}`);
  const raw = await readFile(absolute, "utf8");
  return { raw, value: JSON.parse(raw) };
}

async function atomicJsonWrite(path, value) {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, { flag: "wx", mode: 0o600 });
  await rename(temporary, absolute);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
