import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";

import {
  CAMPAIGN_ADDON_COMPILER_REVISION,
  CHAPTER_REFERENCES,
  CAMPAIGN_RACES,
  activeCampaignActions,
  buildCampaignPlan,
  compileCampaignAddon,
  compileCampaignFunding,
  compileCampaignPickupGates,
  emptyPremadeProgress,
  getLevelingRace,
  guideArchiveManifestSchema,
  importedChapterSchema,
  campaignQuestRewardEvidenceSchema,
  mergeQuestRewardEvidence,
  DUNGEON_BUNDLE_REVISION,
  DUNGEON_BUNDLE_XP_SOURCE,
  DEFAULT_DUNGEON_BUNDLE_LEVELS,
} from "../packages/leveling/dist/index.js";
import {
  questXpImportSetSchema,
  readPublishedQuestXp,
  readQuestXpIndex,
} from "../packages/reference-data/dist/index.js";

const MAXIMUM_MANIFEST_BYTES = 4_000_000;
const MAXIMUM_CHAPTER_BYTES = 8_000_000;
const MAXIMUM_IMPORT_BYTES = 8_000_000;
const FIXED_TIMESTAMP = new Date("2026-10-18T00:00:00.000Z");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function bounded(path, maximum) {
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size > maximum)
    throw new Error(`Input is not a bounded regular file: ${path}`);
  return readFile(path, "utf8");
}

function parseArguments(raw) {
  const flags = new Set(["--raid-goals", "--verify-all"]);
  const values = new Map();
  for (const argument of raw[0] === "--" ? raw.slice(1) : raw) {
    if (flags.has(argument)) {
      values.set(argument.slice(2), "true");
      continue;
    }
    const match = /^--([a-z-]+)=(.+)$/.exec(argument);
    if (!match || values.has(match[1]))
      throw new Error(
        "Use --archive=dir --rewards=dir --reward-import=file --runtime-build=number --restedxp-version=vX.Y.Z [--reward-evidence=file] [--destination=dir --race=race --class=class] [--interface=16001] [--version=0.2.0-review.1] [--raid-goals] [--verify-all].",
      );
    values.set(match[1], match[2]);
  }
  const known = new Set([
    "archive",
    "rewards",
    "reward-import",
    "reward-evidence",
    "destination",
    "race",
    "class",
    "runtime-build",
    "restedxp-version",
    "interface",
    "version",
    "raid-goals",
    "verify-all",
  ]);
  const unknown = [...values.keys()].find((key) => !known.has(key));
  if (unknown) throw new Error(`Unknown option --${unknown}.`);
  for (const required of [
    "archive",
    "rewards",
    "reward-import",
    "runtime-build",
    "restedxp-version",
  ])
    if (!values.has(required)) throw new Error(`Missing --${required}.`);
  const verifyAll = values.get("verify-all") === "true";
  if (!verifyAll)
    for (const required of ["destination", "race", "class"])
      if (!values.has(required)) throw new Error(`Missing --${required}.`);
  const integer = (key, fallback) => {
    const value = Number(values.get(key) ?? fallback);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid --${key}.`);
    return value;
  };
  return {
    archive: resolve(values.get("archive")),
    rewards: resolve(values.get("rewards")),
    rewardImport: resolve(values.get("reward-import")),
    rewardEvidence: values.has("reward-evidence") ? resolve(values.get("reward-evidence")) : null,
    destination: values.has("destination") ? resolve(values.get("destination")) : null,
    race: values.get("race"),
    leaderClass: values.get("class"),
    runtimeBuild: integer("runtime-build"),
    interfaceVersion: integer("interface", "16001"),
    restedXpVersion: values.get("restedxp-version"),
    version: values.get("version") ?? "0.2.0-review.1",
    raidGoals: values.get("raid-goals") === "true",
    verifyAll,
  };
}

async function loadSources(root) {
  const manifestRaw = await bounded(join(root, "manifest.json"), MAXIMUM_MANIFEST_BYTES);
  const manifest = guideArchiveManifestSchema.parse(JSON.parse(manifestRaw));
  if (manifest.publication !== "authorized") throw new Error("Guide archive is not authorized.");
  const references = new Map(CHAPTER_REFERENCES.map((entry) => [entry.id, entry]));
  const sources = [];
  for (const entry of manifest.chapters) {
    const reference = references.get(entry.chapterId);
    if (!reference || reference.family !== "questing" || !reference.factions.includes("alliance"))
      continue;
    const raw = await bounded(join(root, entry.file), MAXIMUM_CHAPTER_BYTES);
    if (sha256(raw) !== entry.sha256)
      throw new Error(`Guide chapter checksum mismatch: ${entry.chapterId}`);
    const guide = importedChapterSchema.parse(JSON.parse(raw));
    if (
      guide.chapterId !== entry.chapterId ||
      guide.sourceSha256 !== entry.sourceSha256 ||
      guide.targetBuild !== manifest.targetBuild
    )
      throw new Error(`Guide chapter identity mismatch: ${entry.chapterId}`);
    sources.push({ reference, guide });
  }
  return { manifest, sources };
}

async function loadRewardFacts(root, importPath, evidencePath, runtimeBuild) {
  const index = await readQuestXpIndex(root);
  if (!index) throw new Error("Published quest XP index is unavailable.");
  const facts = [];
  for (const entry of index.records) {
    if (entry.game !== "forever") continue;
    const record = await readPublishedQuestXp(root, entry);
    if (!record) throw new Error(`Published reward checksum failed for quest ${entry.id}.`);
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
  }
  const importRaw = await bounded(importPath, MAXIMUM_IMPORT_BYTES);
  const imported = questXpImportSetSchema.parse(JSON.parse(importRaw));
  if (imported.game !== "forever") throw new Error("Historical reward import is not for Forever.");
  const byId = new Map(facts.map((fact) => [fact.questId, fact]));
  const historicalIds = [];
  for (const record of imported.records) {
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
    historicalIds.push(record.id);
  }
  let observed = null;
  let observedSha256 = null;
  let observedIds = [];
  if (evidencePath) {
    const evidenceRaw = await bounded(evidencePath, MAXIMUM_IMPORT_BYTES);
    observed = campaignQuestRewardEvidenceSchema.parse(JSON.parse(evidenceRaw));
    observedSha256 = sha256(evidenceRaw);
    const merged = mergeQuestRewardEvidence(facts, observed, runtimeBuild);
    facts.splice(0, facts.length, ...merged.facts);
    observedIds = [...merged.observedQuestIds];
  }
  const observedIdSet = new Set(observedIds);
  const remainingHistoricalIds = historicalIds.filter((id) => !observedIdSet.has(id));
  return {
    facts,
    historicalIds: remainingHistoricalIds,
    observedIds,
    observedSha256,
    observedSourceSha256: observed?.sourceSha256 ?? null,
    revision: `quest-xp-${sha256(`${JSON.stringify(index)}:${imported.exportSha256}:${imported.revision}:${observedSha256 ?? "no-observations"}`).slice(0, 24)}`,
    index,
    imported,
  };
}

async function loadObserverFiles() {
  const [observer, grindObserver, questObserver] = await Promise.all([
    readFile(resolve(import.meta.dirname, "../apps/addon/KFCForeverGuides/Observer.lua"), "utf8"),
    readFile(
      resolve(import.meta.dirname, "../apps/addon/KFCForeverGuides/GrindObserver.lua"),
      "utf8",
    ),
    readFile(
      resolve(import.meta.dirname, "../apps/addon/KFCForeverGuides/QuestObserver.lua"),
      "utf8",
    ),
  ]);
  return {
    "Observer.lua": observer,
    "GrindObserver.lua": grindObserver,
    "QuestObserver.lua": questObserver,
  };
}

async function writePackage(destination, releaseId, artifact, manifestBase, observerFiles) {
  await mkdir(destination, { recursive: true });
  const temporary = await mkdtemp(join(destination, ".campaign-addon-"));
  try {
    const addon = join(temporary, "KFCForeverGuides");
    await mkdir(addon);
    const files = {
      "Guides.lua": artifact.lua,
      "KFCForeverGuides.toc": artifact.toc,
      ...observerFiles,
      "README.txt": artifact.readme,
    };
    const hashes = {};
    for (const [name, contents] of Object.entries(files)) {
      const path = join(addon, name);
      await writeFile(path, contents, { mode: 0o644 });
      await chmod(path, 0o644);
      await utimes(path, FIXED_TIMESTAMP, FIXED_TIMESTAMP);
      hashes[name] = sha256(contents);
    }
    const zipName = `${releaseId}.zip`;
    execFileSync(
      "zip",
      [
        "-X",
        "-q",
        zipName,
        ...Object.keys(files)
          .sort()
          .map((name) => `KFCForeverGuides/${name}`),
      ],
      { cwd: temporary, env: { ...process.env, TZ: "UTC" } },
    );
    const zip = await readFile(join(temporary, zipName));
    const manifest = {
      schema: "kfc-campaign-addon.v1",
      ...manifestBase,
      releaseId,
      files: hashes,
      zip: { file: zipName, size: zip.length, sha256: sha256(zip) },
    };
    await writeFile(join(temporary, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, {
      mode: 0o600,
    });
    const final = join(destination, releaseId);
    try {
      await rename(temporary, final);
      return { directory: final, manifest, reused: false };
    } catch (error) {
      if (!(
        error instanceof Error &&
        "code" in error &&
        ["EEXIST", "ENOTEMPTY"].includes(String(error.code))
      ))
        throw error;
      const existing = JSON.parse(
        await bounded(join(final, "manifest.json"), MAXIMUM_MANIFEST_BYTES),
      );
      if (existing.semanticSha256 !== manifest.semanticSha256)
        throw new Error(`Existing addon release has different contents: ${final}`);
      return { directory: final, manifest: existing, reused: true };
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function main() {
  const input = parseArguments(process.argv.slice(2));
  const [{ manifest, sources }, rewards] = await Promise.all([
    loadSources(input.archive),
    loadRewardFacts(input.rewards, input.rewardImport, input.rewardEvidence, input.runtimeBuild),
  ]);
  const compileEdition = (race, leaderClass) => {
    const base = buildCampaignPlan(race, manifest.sourceSha256, sources, leaderClass);
    const plan = compileCampaignFunding(
      compileCampaignPickupGates({
        ...base,
        rewardFacts: rewards.facts,
        rewardRevision: rewards.revision,
        rewardBuild: rewards.observedIds.length ? input.runtimeBuild : null,
        rewardNotice: `${rewards.observedIds.length} reviewed current-build reward fact(s) are attached; ${rewards.historicalIds.length} historical fallback fact(s) remain estimates. This addon package is an in-game review artifact.`,
      }),
    );
    const progress = { ...emptyPremadeProgress(), raidGoals: input.raidGoals };
    const actions = activeCampaignActions(plan, progress);
    const artifact = compileCampaignAddon(plan, actions, {
      version: input.version,
      runtimeBuild: input.runtimeBuild,
      interfaceVersion: input.interfaceVersion,
      restedXpVersion: input.restedXpVersion,
    });
    return { plan, actions, artifact };
  };
  if (input.verifyAll) {
    const editions = CAMPAIGN_RACES.flatMap((race) => {
      const profile = getLevelingRace("alliance", race);
      if (!profile) throw new Error(`Missing Alliance race profile: ${race}`);
      return profile.classes.map((leaderClass) => {
        let compiled;
        try {
          compiled = compileEdition(race, leaderClass);
        } catch (error) {
          throw new Error(
            `${race}/${leaderClass}: ${error instanceof Error ? error.message : "edition compilation failed"}`,
          );
        }
        const { plan, actions, artifact } = compiled;
        return {
          race,
          leaderClass,
          release: plan.release,
          actions: actions.length,
          handIns: new Set(
            actions.flatMap((action) =>
              action.questChanges
                .filter((change) => change.state === "rewarded")
                .map((change) => change.questId),
            ),
          ).size,
          leaderGuides: artifact.guides.find((guide) => guide.role === "leader")?.names.length ?? 0,
          partyGuides: artifact.guides.find((guide) => guide.role === "party")?.names.length ?? 0,
          luaSha256: sha256(artifact.lua),
        };
      });
    });
    process.stdout.write(
      `${JSON.stringify({ mode: "verify-all", editionCount: editions.length, sourceBuild: manifest.targetBuild, runtimeBuild: input.runtimeBuild, actionRange: { minimum: Math.min(...editions.map((entry) => entry.actions)), maximum: Math.max(...editions.map((entry) => entry.actions)) }, handInRange: { minimum: Math.min(...editions.map((entry) => entry.handIns)), maximum: Math.max(...editions.map((entry) => entry.handIns)) }, editions })}\n`,
    );
    return;
  }
  const race = getLevelingRace("alliance", input.race);
  if (!race) throw new Error(`Unsupported Alliance race: ${input.race}`);
  if (!race.classes.includes(input.leaderClass))
    throw new Error(`${input.leaderClass} is not available to ${race.name}.`);
  const { plan, actions, artifact } = compileEdition(input.race, input.leaderClass);
  const routeHandIns = new Set(
    actions.flatMap((action) =>
      action.questChanges
        .filter((change) => change.state === "rewarded")
        .map((change) => change.questId),
    ),
  );
  const historicalRouteIds = rewards.historicalIds
    .filter((id) => routeHandIns.has(id))
    .sort((left, right) => left - right);
  const observerFiles = await loadObserverFiles();
  const semantic = {
    compilerRevision: CAMPAIGN_ADDON_COMPILER_REVISION,
    guaranteedDungeonBundles: {
      revision: DUNGEON_BUNDLE_REVISION,
      defaultQuestLevels: DEFAULT_DUNGEON_BUNDLE_LEVELS,
      xpReference: DUNGEON_BUNDLE_XP_SOURCE,
    },
    state: "review",
    version: input.version,
    campaignRelease: plan.release,
    executionRevision: plan.executionRevision ?? null,
    sourceArchiveSha256: manifest.sourceSha256,
    sourceBuild: plan.targetBuild,
    runtimeBuild: input.runtimeBuild,
    restedXpVersion: input.restedXpVersion,
    interfaceVersion: input.interfaceVersion,
    race: plan.race,
    leaderClass: plan.leaderClass,
    raidGoals: input.raidGoals,
    rewardRevision: rewards.revision,
    rewardIndexPublishedAt: rewards.index.publishedAt,
    rewardImportRevision: rewards.imported.revision,
    rewardImportSha256: rewards.imported.exportSha256,
    rewardEvidenceSha256: rewards.observedSha256,
    rewardObserverSourceSha256: rewards.observedSourceSha256,
    observedRewardIds: rewards.observedIds,
    historicalRouteIds,
    guideSummaries: artifact.guides,
    actionIds: actions.map((action) => action.id),
    artifactSha256: {
      toc: sha256(artifact.toc),
      lua: sha256(artifact.lua),
      readme: sha256(artifact.readme),
      observer: sha256(observerFiles["Observer.lua"]),
      grindObserver: sha256(observerFiles["GrindObserver.lua"]),
      questObserver: sha256(observerFiles["QuestObserver.lua"]),
    },
  };
  const semanticSha256 = sha256(JSON.stringify(semantic));
  const releaseId = `kfc-premade5-${plan.race}-${plan.leaderClass}-${semanticSha256.slice(0, 16)}`;
  const result = await writePackage(
    input.destination,
    releaseId,
    artifact,
    {
      ...semantic,
      semanticSha256,
      actionCount: actions.length,
      handInQuestCount: routeHandIns.size,
      leaderGuideCount: artifact.guides.find((guide) => guide.role === "leader")?.names.length ?? 0,
      partyGuideCount: artifact.guides.find((guide) => guide.role === "party")?.names.length ?? 0,
    },
    observerFiles,
  );
  process.stdout.write(
    `${JSON.stringify({ directory: result.directory, releaseId, reused: result.reused, semanticSha256, zip: result.manifest.zip, actionCount: actions.length, handInQuestCount: routeHandIns.size, historicalRouteIds, sourceBuild: plan.targetBuild, runtimeBuild: input.runtimeBuild, state: "review" })}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Campaign addon build failed."}\n`,
  );
  process.exitCode = 1;
});
