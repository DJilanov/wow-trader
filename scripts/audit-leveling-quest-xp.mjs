import { readFile, mkdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import process from "node:process";
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
  campaignOptionalXpReady,
  GROUP_COMBAT_RULE,
  attachCampaignCombat,
  combatDatasetSchema,
  combatManifestSchema,
  compileCampaignFunding,
  compileCampaignPickupGates,
} from "../packages/leveling/dist/index.js";
import {
  readQuestXpIndex,
  readPublishedQuestXp,
  questXpImportSetSchema,
  atomicJsonWrite,
} from "../packages/reference-data/dist/index.js";

const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
if (
  args.some(
    (argument) =>
      !/^--(?:destination|rewards|progress|combat)=.+/.test(argument) &&
      !/^--reward-import=.+/.test(argument) &&
      argument !== "--require-covered",
  )
)
  throw new Error(
    "Use --destination=directory --rewards=published-directory [--reward-import=file] [--combat=combat-directory] [--progress=party-state.json] [--require-covered].",
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
const index = await readQuestXpIndex(resolve(rewardsRoot));
const facts = [],
  recordHashes = [];
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
let base = emptyPremadeProgress();
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
        policies.push({
          difficultyPolicy,
          raidGoals,
          chapters: auditCampaignSections(plan, scenario),
          sections: forecastCampaignXp(plan, scenario),
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
        verifiedDungeonLegs: plan.legs.filter((leg) => leg.kind === "dungeon").length,
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
const historicalRewardIdSet = new Set(historicalRewardIds);
const routeHistoricalRewardIds = routeHandIns.filter((id) => historicalRewardIdSet.has(id));
const routePublishedRewardIds = routeHandIns.filter(
  (id) => availableRewardIds.has(id) && !historicalRewardIdSet.has(id),
);
const report = {
  schema: "campaign-xp-audit.v5",
  calculatorRevision: CAMPAIGN_XP_REVISION,
  mode: value("progress")
    ? "provided-party-state"
    : "five-players-level-one-with-personal-branches-checkpointed",
  archiveSha256: manifest.sourceSha256,
  curveBuild: 70205,
  curveSha256: createHash("sha256").update(JSON.stringify(FOREVER_XP_CURVE)).digest("hex"),
  rewardIndex: index,
  recordHashes,
  rewardEvidence: {
    publishedForeverFacts: facts.filter(
      (fact) => fact.status === "available" && fact.evidenceKind !== "historical-reference",
    ).length,
    historicalEstimateFacts: historicalRewardIds.length,
    historicalEstimateIds: historicalRewardIds.sort((left, right) => left - right),
    importRevision: rewardImport?.revision ?? null,
    importSha256: rewardImport?.exportSha256 ?? null,
    routeHistoricalEstimateFacts: routeHistoricalRewardIds.length,
    routeHistoricalEstimateIds: routeHistoricalRewardIds,
    status: routeHistoricalRewardIds.length
      ? "Historical addon-database values fill route hand-ins without published numeric Forever XP. They are estimates and cannot certify the route until observed or replaced by Forever-specific evidence."
      : "No historical reward fallback is attached.",
  },
  combat: {
    rule: GROUP_COMBAT_RULE,
    creditFraction: 0.2,
    sourceStatus: combatSnapshot ? combatSnapshot.dataset.publication : "not-provided",
    revision: combatSnapshot?.manifest.sha256 ?? null,
    providerRevision: combatSnapshot?.dataset.provider.revision ?? null,
    dungeonProfiles: combatSnapshot?.dataset.dungeons.length ?? 0,
    calibratedKillContexts: combatSnapshot?.dataset.killXpEvidence.length ?? 0,
    status: combatSnapshot
      ? combatSnapshot.dataset.publication === "authorized"
        ? "Authorized combat evidence is attached. Formula estimates and unresolved quotas still keep affected sections incomplete."
        : "Private combat references are attached for local diagnosis only and cannot pass the publication coverage gate."
      : "Conservative quest-only lower bound. No combat XP is granted without a validated compatible combat snapshot.",
  },
  startingBranches:
    "All five players start at level 1. Player 1 follows each projected source branch; Players 2-5 complete their own personal branches and must record fresh actual bars at the shared rendezvous checkpoints. Unmodeled personal-branch XP remains explicit estimated checkpoint XP, never an assumed quest reward.",
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
    uniqueHandInQuestIds: routeHandIns.length,
    publishedForeverHandInRewardIds: routePublishedRewardIds.length,
    historicalHandInRewardIds: routeHistoricalRewardIds.length,
    historicalHandInRewardQuestIds: routeHistoricalRewardIds,
    availableHandInRewardIds: routeHandIns.filter((id) => availableRewardIds.has(id)).length,
    unresolvedHandInRewardIds: routeHandIns.filter((id) => !availableRewardIds.has(id)),
    chapterStatusCounts,
    memberStatusCounts,
    diagnosticAllMemberStatusCounts: diagnosticMemberStatusCounts,
    blockers: [...blockerCounts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason)),
  },
  projections,
};
const routeReady = projections.every((projection) =>
    projection.policies.every((policy) => campaignCoverageReady(policy.chapters, policy.sections)),
  ),
  publicationReady =
    (combatSnapshot === null || combatSnapshot.dataset.publication === "authorized") &&
    routeHistoricalRewardIds.length === 0,
  ready = routeReady && publicationReady;
report.routeCoveragePassed = routeReady;
report.publicationEvidencePassed = publicationReady;
report.coverageGatePassed = ready;
const hash = createHash("sha256").update(JSON.stringify(report)).digest("hex");
await mkdir(resolve(destination), { recursive: true });
const path = join(resolve(destination), `campaign-xp-audit-${hash.slice(0, 16)}.json`);
await atomicJsonWrite(path, report);
process.stdout.write(
  `${JSON.stringify({ path, sha256: hash, ...report.summary, lifecycleExclusions: projections.reduce((sum, entry) => sum + entry.lifecycleExclusions.length, 0), xpFacts: facts.filter((fact) => fact.status === "available").length, historicalRewardEstimates: historicalRewardIds.length, mode: report.mode, coverageGatePassed: ready, coverage: ready ? "Offline reference budgets passed; this is not a playtest certification." : "Not certified; inspect each checkpoint's blockers, unknowns, estimates and deficits." })}\n`,
);
if (args.includes("--require-covered") && !ready) process.exitCode = 2;
