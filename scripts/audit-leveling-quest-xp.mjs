import { readFile, mkdir } from "node:fs/promises";
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
} from "../packages/leveling/dist/index.js";
import {
  readQuestXpIndex,
  readPublishedQuestXp,
  atomicJsonWrite,
} from "../packages/reference-data/dist/index.js";

const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
if (
  args.some(
    (argument) =>
      !/^--(?:destination|rewards|progress)=.+/.test(argument) && argument !== "--require-covered",
  )
)
  throw new Error(
    "Use --destination=directory --rewards=published-directory [--progress=party-state.json] [--require-covered].",
  );
const value = (name) =>
  args.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
const destination = value("destination"),
  rewardsRoot = value("rewards") ?? process.env.WOW_TRADER_REFERENCE_DIRECTORY;
if (!destination || !rewardsRoot)
  throw new Error("Destination and published reward directory are required.");
const root = resolve(process.env.LEVELING_ARCHIVE_ROOT ?? "artifacts/leveling/archive");
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
let base = recordPremadeXp(emptyPremadeProgress(), 0, 1, 0);
if (value("progress"))
  base = premadeProgressSchema.parse(
    JSON.parse(await readFile(resolve(value("progress")), "utf8")),
  );
const projections = [];
for (const race of CAMPAIGN_RACES)
  for (const leaderClass of [null, ...getLevelingRace("alliance", race).classes]) {
    const plan = {
      ...buildCampaignPlan(race, manifest.sourceSha256, sources, leaderClass),
      rewardFacts: facts,
    };
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
      library: plan.library ?? null,
      policies,
    });
  }
const report = {
  schema: "campaign-xp-audit.v2",
  calculatorRevision: CAMPAIGN_XP_REVISION,
  mode: value("progress") ? "provided-party-state" : "player-one-level-one-quest-only-scenario",
  archiveSha256: manifest.sourceSha256,
  curveBuild: 70205,
  curveSha256: createHash("sha256").update(JSON.stringify(FOREVER_XP_CURVE)).digest("hex"),
  rewardIndex: index,
  recordHashes,
  combat: {
    rule: GROUP_COMBAT_RULE,
    creditFraction: 0.2,
    status:
      "Conservative five-player planning assumption, not a calibrated server formula. No combat XP is granted without a compatible solo kill value and unique kill count.",
  },
  startingBranches:
    "Player 1 uses each projected race/class. Other players need their own starting bars/history.",
  projections,
};
const ready = projections.every((projection) =>
  projection.policies.every((policy) => campaignCoverageReady(policy.chapters, policy.sections)),
);
report.coverageGatePassed = ready;
const hash = createHash("sha256").update(JSON.stringify(report)).digest("hex");
await mkdir(resolve(destination), { recursive: true });
const path = join(resolve(destination), `campaign-xp-audit-${hash.slice(0, 16)}.json`);
await atomicJsonWrite(path, report);
process.stdout.write(
  `${JSON.stringify({ path, sha256: hash, editions: projections.length, scenarios: projections.reduce((sum, entry) => sum + entry.policies.length, 0), chapterChecks: projections.reduce((sum, entry) => sum + entry.policies.reduce((total, policy) => total + policy.chapters.length, 0), 0), xpFacts: facts.filter((fact) => fact.status === "available").length, mode: report.mode, coverageGatePassed: ready, coverage: ready ? "Offline reference budgets passed; this is not a playtest certification." : "Not certified; inspect each checkpoint's blockers, unknowns, estimates and deficits." })}\n`,
);
if (args.includes("--require-covered") && !ready) process.exitCode = 2;
