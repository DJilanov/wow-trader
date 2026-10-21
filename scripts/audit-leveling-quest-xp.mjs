import { readFile, mkdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import process from "node:process";
import { pruneAudits, storageReferences, storageActivity } from "./storage-retention.mjs";
import { writeCampaignAudit } from "./leveling-audit-store.mjs";
import {
  CHAPTER_REFERENCES,
  CAMPAIGN_RACES,
  getLevelingRace,
  buildCampaignPlan,
  guideArchiveManifestSchema,
  importedChapterSchema,
  forecastCampaignXp,
  emptyPremadeProgress,
  recordPremadeXp,
  premadeProgressSchema,
  FOREVER_XP_CURVE,
  CAMPAIGN_XP_REVISION,
  auditCampaignSections,
  campaignCoverageReady,
  campaignPlanningReadiness,
  CAMPAIGN_PLANNING_REVISION,
  campaignOptionalXpReady,
  GROUP_COMBAT_RULE,
  COMBAT_XP_RULE,
  attachCampaignCombat,
  combatDatasetSchema,
  combatManifestSchema,
  compileCampaignFunding,
  compileCampaignPickupGates,
  CAMPAIGN_EVIDENCE_CATALOG,
  campaignEvidenceIssueKey,
  campaignGrindEvidenceSchema,
  campaignQuestRewardEvidenceSchema,
  mergeQuestRewardEvidence,
  DUNGEON_BUNDLE_REVISION,
  DUNGEON_BUNDLE_XP_SOURCE,
  DEFAULT_DUNGEON_BUNDLE_LEVELS,
  campaignQuestValidationEvidenceSchema,
  CAMPAIGN_ADDON_COMPILER_REVISION,
  questValidationCertificate,
  questValidationCoverageSchema,
} from "../packages/leveling/dist/index.js";
import {
  questXpIndexSchema,
  readPublishedQuestXp,
  questXpImportSetSchema,
  atomicJsonWrite,
} from "../packages/reference-data/dist/index.js";

const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
if (
  args.some(
    (argument) =>
      !/^--(?:destination|rewards|progress|combat|grind-evidence|reward-evidence|quest-validation-evidence|runtime-build)=.+/.test(
        argument,
      ) &&
      !/^--reward-import=.+/.test(argument) &&
      argument !== "--require-covered" &&
      argument !== "--require-plannable" &&
      argument !== "--retain-audits" &&
      argument !== "--gzip",
  )
)
  throw new Error(
    "Use --destination=directory --rewards=published-directory [--reward-import=file] [--reward-evidence=file] [--quest-validation-evidence=file (repeatable)] [--combat=combat-directory] [--grind-evidence=file --runtime-build=number] [--progress=party-state.json] [--require-covered] [--require-plannable] [--retain-audits] [--gzip].",
  );
const value = (name) =>
  args.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
const destination = value("destination"),
  rewardsRoot = value("rewards") ?? process.env.WOW_TRADER_REFERENCE_DIRECTORY;
if (!destination || !rewardsRoot)
  throw new Error("Destination and published reward directory are required.");
const root = resolve(process.env.LEVELING_ARCHIVE_ROOT ?? "artifacts/leveling/archive");
const checksum = (raw) => createHash("sha256").update(raw).digest("hex");
async function bounded(path, maximum) {
  if ((await stat(path)).size > maximum) throw new Error("Audit input exceeds its size budget.");
  return readFile(path, "utf8");
}
const manifest = guideArchiveManifestSchema.parse(
  JSON.parse(await readFile(join(root, "manifest.json"), "utf8")),
);
if (manifest.publication !== "authorized")
  throw new Error("Only authorized source archives can be audited.");
const runtimeBuild = value("runtime-build") ? Number(value("runtime-build")) : manifest.targetBuild;
if (!Number.isSafeInteger(runtimeBuild) || runtimeBuild <= 0)
  throw new Error("Runtime build must be a positive integer.");
const sources = [];
for (const entry of manifest.chapters) {
  const reference = CHAPTER_REFERENCES.find((chapter) => chapter.id === entry.chapterId);
  if (!reference || reference.family !== "questing" || !reference.factions.includes("alliance"))
    continue;
  const raw = await readFile(join(root, entry.file), "utf8");
  if (createHash("sha256").update(raw).digest("hex") !== entry.sha256)
    throw new Error("Source checksum mismatch.");
  const guide = importedChapterSchema.parse(JSON.parse(raw));
  if (
    guide.version !== entry.version ||
    guide.targetBuild !== manifest.targetBuild ||
    guide.sourceSha256 !== entry.sourceSha256
  )
    throw new Error("Source manifest mismatch.");
  sources.push({ reference, guide });
}
let combatSnapshot = null;
if (value("combat")) {
  const combatRoot = resolve(value("combat"));
  const combatManifest = combatManifestSchema.parse(
    JSON.parse(await bounded(join(combatRoot, "manifest.json"), 4000)),
  );
  const raw = await bounded(join(combatRoot, combatManifest.file), 16_000_000);
  if (checksum(raw) !== combatManifest.sha256) throw new Error("Combat checksum mismatch.");
  const dataset = combatDatasetSchema.parse(JSON.parse(raw));
  if (
    dataset.targetBuild !== manifest.targetBuild ||
    dataset.targetBuild !== combatManifest.targetBuild
  )
    throw new Error("Combat, rewards and guide builds do not match.");
  combatSnapshot = { manifest: combatManifest, dataset };
}
let grindEvidence = null;
let grindEvidenceSha256 = null;
if (value("grind-evidence")) {
  const raw = await bounded(resolve(value("grind-evidence")), 8_000_000);
  grindEvidence = campaignGrindEvidenceSchema.parse(JSON.parse(raw));
  grindEvidenceSha256 = checksum(raw);
  if (grindEvidence.measurements.some((measurement) => measurement.build !== runtimeBuild))
    throw new Error("Grind evidence and runtime builds do not match.");
}
const rewardIndexRaw = await bounded(
  join(resolve(rewardsRoot), "quest-xp", "index.json"),
  4_000_000,
);
const index = questXpIndexSchema.parse(JSON.parse(rewardIndexRaw));
const rewardIndexSha256 = checksum(rewardIndexRaw);
let facts = [];
const recordHashes = [];
for (const entry of index?.records ?? []) {
  if (entry.game !== "forever") continue;
  const record = await readPublishedQuestXp(resolve(rewardsRoot), entry);
  if (!record) continue;
  facts.push({
    questId: record.id,
    fullXp: record.fullXp,
    questLevel: record.questLevel,
    minimumLevel: record.minimumLevel,
    xpByLevel: record.xpByLevel,
    sourceUrl: record.sourceUrl,
    capturedAt: record.capturedAt,
    status: record.status,
    evidenceKind: "published-forever",
  });
  recordHashes.push(entry.sha256);
}
const historicalRewardIds = [];
let rewardImport = null;
if (value("reward-import")) {
  const path = resolve(value("reward-import"));
  rewardImport = questXpImportSetSchema.parse(JSON.parse(await bounded(path, 8_000_000)));
  if (rewardImport.game !== "forever") throw new Error("Reward import is not for Forever.");
  const byId = new Map(facts.map((fact) => [fact.questId, fact]));
  for (const record of rewardImport.records) {
    if (record.status !== "available") continue;
    const primary = byId.get(record.id);
    if (primary?.status === "available" || primary?.status === "conflict") continue;
    const fallback = {
      questId: record.id,
      fullXp: record.fullXp,
      questLevel: record.questLevel ?? primary?.questLevel ?? null,
      minimumLevel: primary?.minimumLevel ?? record.minimumLevel,
      xpByLevel: record.xpByLevel,
      sourceUrl: `${record.sourceKind}: ${record.sourceRef} · ${record.revision}`,
      capturedAt: record.importedAt,
      status: "available",
      evidenceKind: "historical-reference",
    };
    if (primary) facts[facts.indexOf(primary)] = fallback;
    else facts.push(fallback);
    byId.set(record.id, fallback);
    historicalRewardIds.push(record.id);
  }
}
let observedRewardEvidence = null;
let observedRewardEvidenceSha256 = null;
let observedRewardIds = [];
if (value("reward-evidence")) {
  const raw = await bounded(resolve(value("reward-evidence")), 8_000_000);
  observedRewardEvidence = campaignQuestRewardEvidenceSchema.parse(JSON.parse(raw));
  observedRewardEvidenceSha256 = checksum(raw);
  const merged = mergeQuestRewardEvidence(facts, observedRewardEvidence, runtimeBuild);
  facts = [...merged.facts];
  observedRewardIds = [...merged.observedQuestIds];
}
let base = emptyPremadeProgress();
const questValidationInputs = [];
for (const argument of args.filter((argument) =>
  argument.startsWith("--quest-validation-evidence="),
)) {
  const path = resolve(argument.slice("--quest-validation-evidence=".length));
  const raw = await bounded(path, 8_000_000);
  const evidence = campaignQuestValidationEvidenceSchema.parse(JSON.parse(raw));
  if (evidence.runtimeBuild !== runtimeBuild)
    throw new Error("Quest validation and runtime builds do not match.");
  questValidationInputs.push({ evidence, sha256: checksum(raw) });
}
if (questValidationInputs.length > 20)
  throw new Error("At most 20 quest-validation evidence files may be attached.");
const forecastOptions = {
  ...(grindEvidence ? { grindEvidence } : {}),
  grindRuntimeBuild: runtimeBuild,
  ...(questValidationInputs.length
    ? {
        questValidation: {
          evidences: questValidationInputs.map((input) => input.evidence),
          runtimeBuild,
          compilerRevision: CAMPAIGN_ADDON_COMPILER_REVISION,
        },
      }
    : {}),
};
for (let player = 0; player < base.members.length; player++)
  base = recordPremadeXp(base, player, 1, 0);
if (value("progress"))
  base = premadeProgressSchema.parse(
    JSON.parse(await readFile(resolve(value("progress")), "utf8")),
  );
const projections = [];
for (const race of CAMPAIGN_RACES)
  for (const leaderClass of [null, ...getLevelingRace("alliance", race).classes]) {
    const basePlan = buildCampaignPlan(race, manifest.sourceSha256, sources, leaderClass);
    const evidencedPlan = combatSnapshot
      ? attachCampaignCombat(
          basePlan,
          sources,
          combatSnapshot.dataset,
          combatSnapshot.manifest.sha256,
        )
      : basePlan;
    const plan = compileCampaignFunding(
      compileCampaignPickupGates({
        ...evidencedPlan,
        rewardFacts: facts,
      }),
    );
    const progress = {
      ...base,
      members: base.members.map((member, index) =>
        index === 0 ? { ...member, classSlug: leaderClass } : member,
      ),
    };
    const controlRegressions = [];
    for (const leg of plan.legs.filter(
      (entry) => entry.kind === "xp-bridge" && entry.from < entry.to,
    )) {
      const under = {
        ...progress,
        members: progress.members.map((member) => ({
          ...member,
          level: leg.from,
          currentXp: 0,
          xpNeedsUpdate: false,
          questStates: {},
        })),
      };
      for (const action of plan.actions.filter(
        (entry) => entry.legId === leg.id && entry.questChanges.length,
      ))
        if (campaignOptionalXpReady(plan, under, action)) controlRegressions.push(action.id);
    }
    if (controlRegressions.length)
      throw new Error(`Premature catch-up skip: ${controlRegressions.join(", ")}`);
    const policies = [];
    for (const difficultyPolicy of ["at-level", "experienced-premade"])
      for (const raidGoals of [true, false]) {
        const scenario = { ...progress, difficultyPolicy, raidGoals };
        const chapters = auditCampaignSections(plan, scenario, forecastOptions);
        const sections = forecastCampaignXp(plan, scenario, forecastOptions);
        policies.push({
          difficultyPolicy,
          raidGoals,
          chapters,
          sections,
          planning: campaignPlanningReadiness(chapters, sections),
        });
      }
    projections.push({
      race,
      leaderClass,
      release: plan.release,
      route: {
        actions: plan.actions.length,
        legs: plan.legs.length,
        handInQuestIds: [
          ...new Set(
            plan.actions.flatMap((action) =>
              action.questChanges
                .filter((change) => change.state === "rewarded")
                .map((change) => change.questId),
            ),
          ),
        ],
        xpCheckActions: plan.actions.filter((action) => action.kind === "xp-check").length,
        verifiedDungeonLegs: plan.legs.filter((leg) => leg.kind === "dungeon" && !leg.bundleId)
          .length,
        planningDungeonLegs: plan.legs.filter((leg) => leg.bundleId).length,
      },
      lifecycleExclusions: plan.lifecycleExclusions ?? [],
      library: plan.library ?? null,
      policies,
    });
  }
const chapterStatusCounts = Object.fromEntries(
  ["blocked", "incomplete", "shortfall", "reference-covered"].map((status) => [
    status,
    projections.reduce(
      (total, projection) =>
        total +
        projection.policies.reduce(
          (policyTotal, policy) =>
            policyTotal + policy.chapters.filter((chapter) => chapter.status === status).length,
          0,
        ),
      0,
    ),
  ]),
);
const diagnosticMemberStatusCounts = Object.fromEntries(
  ["covered", "shortfall", "incomplete", "blocked", "no-start", "before-start"].map((status) => [
    status,
    projections.reduce(
      (total, projection) =>
        total +
        projection.policies.reduce(
          (policyTotal, policy) =>
            policyTotal +
            policy.sections.reduce(
              (sectionTotal, section) =>
                sectionTotal + section.members.filter((member) => member.status === status).length,
              0,
            ),
          0,
        ),
      0,
    ),
  ]),
);
const memberStatusCounts = Object.fromEntries(
  ["covered", "shortfall", "incomplete", "blocked", "no-start", "before-start"].map((status) => [
    status,
    projections.reduce(
      (total, projection) =>
        total +
        projection.policies.reduce(
          (policyTotal, policy) =>
            policyTotal +
            policy.sections.reduce((sectionTotal, section) => {
              const chapter = policy.chapters.find(
                (candidate) => candidate.sectionId === section.sectionId,
              );
              const members =
                chapter?.audience === "leader" ? section.members.slice(0, 1) : section.members;
              return sectionTotal + members.filter((member) => member.status === status).length;
            }, 0),
          0,
        ),
      0,
    ),
  ]),
);
const blockerCounts = new Map();
for (const projection of projections)
  for (const policy of projection.policies)
    for (const section of policy.sections)
      for (const member of section.members)
        if (member.blockedReason)
          blockerCounts.set(
            member.blockedReason,
            (blockerCounts.get(member.blockedReason) ?? 0) + 1,
          );
const routeHandIns = [
  ...new Set(projections.flatMap((projection) => projection.route.handInQuestIds)),
].sort((left, right) => left - right);
const availableRewardIds = new Set(
  facts.filter((fact) => fact.status === "available").map((fact) => fact.questId),
);
const observedRewardIdSet = new Set(observedRewardIds);
const remainingHistoricalRewardIds = historicalRewardIds.filter(
  (id) => !observedRewardIdSet.has(id),
);
const historicalRewardIdSet = new Set(remainingHistoricalRewardIds);
const routeHistoricalRewardIds = routeHandIns.filter((id) => historicalRewardIdSet.has(id));
const routePublishedRewardIds = routeHandIns.filter(
  (id) =>
    availableRewardIds.has(id) && !historicalRewardIdSet.has(id) && !observedRewardIdSet.has(id),
);
const routeObservedRewardIds = routeHandIns.filter((id) => observedRewardIdSet.has(id));
const evidenceTasksByKey = new Map();
for (const projection of projections)
  for (const policy of projection.policies)
    for (const chapter of policy.chapters) {
      const members =
        chapter.audience === "leader"
          ? chapter.forecast.members.slice(0, 1)
          : chapter.forecast.members;
      for (const member of members)
        for (const issue of member.issues) {
          const key = campaignEvidenceIssueKey(issue);
          const definition = CAMPAIGN_EVIDENCE_CATALOG[issue.code];
          const current = evidenceTasksByKey.get(key) ?? {
            key,
            code: issue.code,
            domain: issue.domain,
            label: definition.label,
            requiredEvidence: definition.requiredEvidence,
            releaseImpact: definition.releaseImpact,
            resolution: issue.resolution,
            blocksForecast: issue.blocksForecast,
            actionId: issue.actionId,
            questId: issue.questId,
            occurrences: 0,
            editions: new Set(),
            sections: new Set(),
            scenarios: new Set(),
            players: new Set(),
            exampleMessages: new Set(),
          };
          if (
            current.code !== issue.code ||
            current.domain !== issue.domain ||
            current.resolution !== issue.resolution
          )
            throw new Error(`Inconsistent campaign evidence task ${key}.`);
          current.occurrences++;
          current.editions.add(`${projection.race}:${projection.leaderClass ?? "general"}`);
          current.sections.add(chapter.sectionId);
          current.scenarios.add(
            `${policy.difficultyPolicy}:${policy.raidGoals ? "raid-goals" : "no-raid-goals"}`,
          );
          current.players.add(member.player);
          if (current.exampleMessages.size < 5) current.exampleMessages.add(issue.message);
          evidenceTasksByKey.set(key, current);
        }
    }
const evidenceTasks = [...evidenceTasksByKey.values()]
  .map((task) => ({
    ...task,
    editions: [...task.editions].sort(),
    sections: [...task.sections].sort(),
    scenarios: [...task.scenarios].sort(),
    players: [...task.players].sort((left, right) => left - right),
    exampleMessages: [...task.exampleMessages],
  }))
  .sort(
    (left, right) =>
      ({ blocker: 0, validation: 1, measurement: 2 })[left.releaseImpact] -
        { blocker: 0, validation: 1, measurement: 2 }[right.releaseImpact] ||
      left.code.localeCompare(right.code) ||
      left.key.localeCompare(right.key),
  );
const evidenceTaskCounts = Object.fromEntries(
  ["blocker", "validation", "measurement"].map((impact) => [
    impact,
    evidenceTasks.filter((task) => task.releaseImpact === impact).length,
  ]),
);
const evidenceBacklog = {
  schema: "campaign-evidence-backlog.v1",
  calculatorRevision: CAMPAIGN_XP_REVISION,
  archiveSha256: manifest.sourceSha256,
  targetBuild: manifest.targetBuild,
  rewardIndexSha256,
  questValidationEvidenceSha256s: questValidationInputs.map((input) => input.sha256),
  summary: {
    tasks: evidenceTasks.length,
    byReleaseImpact: evidenceTaskCounts,
    byResolution: Object.fromEntries(
      ["offline", "in-game", "offline-or-in-game"].map((resolution) => [
        resolution,
        evidenceTasks.filter((task) => task.resolution === resolution).length,
      ]),
    ),
    affectedEditions: new Set(evidenceTasks.flatMap((task) => task.editions)).size,
    affectedSections: new Set(evidenceTasks.flatMap((task) => task.sections)).size,
  },
  tasks: evidenceTasks,
};
const evidenceBacklogSha256 = checksum(JSON.stringify(evidenceBacklog));
const evidenceBacklogFile = `campaign-evidence-backlog-${evidenceBacklogSha256.slice(0, 16)}.json`;
await mkdir(resolve(destination), { recursive: true });
await atomicJsonWrite(join(resolve(destination), evidenceBacklogFile), evidenceBacklog);
let publicQuestValidation = null;
if (questValidationInputs.length) {
  const certificates = new Map();
  for (const projection of projections)
    for (const policy of projection.policies)
      for (const section of [
        ...policy.sections,
        ...policy.chapters.map((chapter) => chapter.forecast),
      ])
        for (const member of section.members)
          for (const resolution of member.validationResolutions) {
            const certificate = questValidationCertificate(resolution);
            const key = `${certificate.code}:${certificate.questId}:${certificate.contextKey}`;
            if (!certificates.has(key)) certificates.set(key, certificate);
          }
  const coverage = questValidationCoverageSchema.parse({
    schema: "campaign-quest-validation-coverage.v1",
    runtimeBuild,
    compilerRevision: CAMPAIGN_ADDON_COMPILER_REVISION,
    certificates: [...certificates.values()].sort((left, right) =>
      `${left.code}:${left.questId}:${left.contextKey}`.localeCompare(
        `${right.code}:${right.questId}:${right.contextKey}`,
      ),
    ),
  });
  const sha256 = checksum(`${JSON.stringify(coverage)}\n`);
  const path = join(resolve(destination), `quest-validation-coverage-${sha256}.json`);
  await atomicJsonWrite(path, coverage);
  publicQuestValidation = { path, sha256, certificateCount: coverage.certificates.length };
}
const report = {
  schema: "campaign-xp-audit.v8",
  calculatorRevision: CAMPAIGN_XP_REVISION,
  mode: value("progress")
    ? "provided-party-state"
    : "five-players-level-one-with-personal-branches-checkpointed",
  archiveSha256: manifest.sourceSha256,
  curveBuild: 70205,
  curveSha256: createHash("sha256").update(JSON.stringify(FOREVER_XP_CURVE)).digest("hex"),
  rewardIndex: index,
  rewardIndexSha256,
  questValidation: {
    runtimeBuild,
    compilerRevision: CAMPAIGN_ADDON_COMPILER_REVISION,
    evidenceSha256s: questValidationInputs.map((input) => input.sha256),
    publicCoverage: publicQuestValidation,
    observationCount: questValidationInputs.reduce(
      (total, input) => total + input.evidence.observations.length,
      0,
    ),
    status:
      "Reviewed observations clear only matching quest/code, release/compiler, build and covered race/class/party contexts. They never alter gates, XP or saved quest state.",
  },
  recordHashes,
  guaranteedDungeonBundles: {
    revision: DUNGEON_BUNDLE_REVISION,
    defaultQuestLevels: DEFAULT_DUNGEON_BUNDLE_LEVELS,
    xpReference: DUNGEON_BUNDLE_XP_SOURCE,
    overrides: base.guaranteedBundles,
    status:
      "Four owner-confirmed quest slots per faction; unidentified quests contribute labeled planning XP, not observed rewards or executable quest directives.",
  },
  rewardEvidence: {
    publishedForeverFacts: facts.filter(
      (fact) => fact.status === "available" && fact.evidenceKind === "published-forever",
    ).length,
    observedForeverFacts: observedRewardIds.length,
    observedForeverIds: observedRewardIds,
    observedRuntimeBuild: observedRewardEvidence?.runtimeBuild ?? null,
    observedFileSha256: observedRewardEvidenceSha256,
    observerSourceSha256: observedRewardEvidence?.sourceSha256 ?? null,
    historicalEstimateFacts: remainingHistoricalRewardIds.length,
    historicalEstimateIds: remainingHistoricalRewardIds.sort((left, right) => left - right),
    importRevision: rewardImport?.revision ?? null,
    importSha256: rewardImport?.exportSha256 ?? null,
    routeHistoricalEstimateFacts: routeHistoricalRewardIds.length,
    routeHistoricalEstimateIds: routeHistoricalRewardIds,
    routeObservedForeverFacts: routeObservedRewardIds.length,
    routeObservedForeverIds: routeObservedRewardIds,
    status: routeHistoricalRewardIds.length
      ? "Historical addon-database values fill route hand-ins without published numeric Forever XP. They are estimates and cannot certify the route until observed or replaced by Forever-specific evidence."
      : observedRewardIds.length
        ? "Reviewed current-build hand-in observations replace historical fallbacks at their exact observed levels; full XP is used only when an observation is in the known full-reward band."
        : "No historical reward fallback is attached.",
  },
  combat: {
    rule: COMBAT_XP_RULE,
    groupRule: GROUP_COMBAT_RULE,
    creditFraction: 0.2,
    creditFractionScope: "Equal-level reference only; mixed-level shares are level-weighted.",
    sourceStatus: combatSnapshot ? combatSnapshot.dataset.publication : "not-provided",
    revision: combatSnapshot?.manifest.sha256 ?? null,
    providerRevision: combatSnapshot?.dataset.provider.revision ?? null,
    dungeonProfiles: combatSnapshot?.dataset.dungeons.length ?? 0,
    calibratedKillContexts: combatSnapshot?.dataset.killXpEvidence.length ?? 0,
    status: combatSnapshot
      ? combatSnapshot.dataset.publication === "authorized"
        ? "Authorized combat evidence is attached. Formula estimates and unresolved quotas still keep affected sections incomplete."
        : "Private combat references support local planning only and cannot pass the publication coverage gate."
      : "Conservative quest-only lower bound. No combat XP is granted without a validated compatible combat snapshot.",
  },
  grindEvidence: {
    sourceStatus: grindEvidence ? "reviewed" : "not-provided",
    runtimeBuild,
    fileSha256: grindEvidenceSha256,
    observerSourceSha256: grindEvidence?.sourceSha256 ?? null,
    measurements: grindEvidence?.measurements.length ?? 0,
    checkpoints: grindEvidence
      ? [...new Set(grindEvidence.measurements.map((measurement) => measurement.checkpointId))]
          .length
      : 0,
    status: grindEvidence
      ? "Explicitly reviewed grind sessions are attached only to matching build, release, party size, and checkpoints."
      : "No reviewed adaptive-grind measurements are attached.",
  },
  startingBranches:
    "All five players start at level 1. Player 1 follows each projected source branch; Players 2-5 complete their own personal branches and must record fresh actual bars at the shared rendezvous checkpoints. Unmodeled personal-branch XP remains explicit estimated checkpoint XP, never an assumed quest reward.",
  evidenceBacklog: {
    schema: evidenceBacklog.schema,
    file: evidenceBacklogFile,
    sha256: evidenceBacklogSha256,
    ...evidenceBacklog.summary,
  },
  summary: {
    editions: projections.length,
    scenarios: projections.reduce((sum, entry) => sum + entry.policies.length, 0),
    chapterChecks: projections.reduce(
      (sum, entry) =>
        sum + entry.policies.reduce((total, policy) => total + policy.chapters.length, 0),
      0,
    ),
    actionRange: {
      minimum: Math.min(...projections.map((projection) => projection.route.actions)),
      maximum: Math.max(...projections.map((projection) => projection.route.actions)),
    },
    legRange: {
      minimum: Math.min(...projections.map((projection) => projection.route.legs)),
      maximum: Math.max(...projections.map((projection) => projection.route.legs)),
    },
    verifiedDungeonLegs: [
      ...new Set(projections.map((projection) => projection.route.verifiedDungeonLegs)),
    ],
    planningDungeonLegs: [
      ...new Set(projections.map((projection) => projection.route.planningDungeonLegs)),
    ],
    uniqueHandInQuestIds: routeHandIns.length,
    publishedForeverHandInRewardIds: routePublishedRewardIds.length,
    observedForeverHandInRewardIds: routeObservedRewardIds.length,
    observedForeverHandInRewardQuestIds: routeObservedRewardIds,
    historicalHandInRewardIds: routeHistoricalRewardIds.length,
    historicalHandInRewardQuestIds: routeHistoricalRewardIds,
    availableHandInRewardIds: routeHandIns.filter((id) => availableRewardIds.has(id)).length,
    unresolvedHandInRewardIds: routeHandIns.filter((id) => !availableRewardIds.has(id)),
    chapterStatusCounts,
    memberStatusCounts,
    diagnosticAllMemberStatusCounts: diagnosticMemberStatusCounts,
    evidenceTaskCounts,
    blockers: [...blockerCounts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason)),
  },
  projections,
};
const planningReady = projections.every((projection) =>
    projection.policies.every((policy) => policy.planning.ready),
  ),
  routeReady = projections.every((projection) =>
    projection.policies.every((policy) => campaignCoverageReady(policy.chapters, policy.sections)),
  ),
  publicationReady =
    (combatSnapshot === null || combatSnapshot.dataset.publication === "authorized") &&
    routeHistoricalRewardIds.length === 0,
  ready = routeReady && publicationReady;
report.routeCoveragePassed = routeReady;
report.publicationEvidencePassed = publicationReady;
report.coverageGatePassed = ready;
report.planningGatePassed = planningReady;
report.planning = {
  revision: CAMPAIGN_PLANNING_REVISION,
  status: !planningReady
    ? "blocked"
    : projections.some((projection) =>
          projection.policies.some((policy) => policy.planning.status === "ready-with-estimates"),
        )
      ? "ready-with-estimates"
      : "ready",
  statusCounts: Object.fromEntries(
    ["ready", "ready-with-estimates", "blocked"].map((status) => [
      status,
      projections.reduce(
        (sum, projection) =>
          sum + projection.policies.filter((policy) => policy.planning.status === status).length,
        0,
      ),
    ]),
  ),
  scope:
    "Continuous known-input planning only. Independent chapter baselines are diagnostics; estimates and omitted unknown combat do not certify live execution or authorize publication.",
  dungeonCombat:
    "A clear profile is optional. Known compatible quest kills count once; extra trash/boss XP without a sourced path and payout is excluded, not assumed zero or added as a bonus.",
};
const artifact = await writeCampaignAudit(destination, report, { gzip: args.includes("--gzip") });
process.stdout.write(
  `${JSON.stringify({ ...artifact, evidenceBacklog: join(resolve(destination), evidenceBacklogFile), evidenceBacklogSha256, ...report.summary, lifecycleExclusions: projections.reduce((sum, entry) => sum + entry.lifecycleExclusions.length, 0), xpFacts: facts.filter((fact) => fact.status === "available").length, observedRewardFacts: observedRewardIds.length, historicalRewardEstimates: remainingHistoricalRewardIds.length, mode: report.mode, planningGatePassed: planningReady, planning: report.planning, publicationEvidencePassed: publicationReady, coverageGatePassed: ready, coverage: ready ? "Offline reference budgets passed; this is not a playtest certification." : "Not certified; inspect the evidence backlog for exact blockers, validation work, and measurements." })}\n`,
);
if (args.includes("--require-covered") && !ready) process.exitCode = 2;
if (args.includes("--require-plannable") && !planningReady) process.exitCode = 2;
if (process.platform === "darwin" && !args.includes("--retain-audits")) {
  try {
    const repository = resolve(import.meta.dirname, "..");
    await pruneAudits(repository, await storageReferences(repository), {
      dryRun: false,
      active: await storageActivity(),
    });
  } catch (error) {
    process.stderr.write(`[audit-retention] ${error.message}\n`);
  }
}
