import { execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";
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
  CAMPAIGN_XP_REVISION,
  CHAPTER_REFERENCES,
  CAMPAIGN_RACES,
  activeCampaignActions,
  campaignUnmodeledExtras,
  campaignExportSelectionSchema,
  campaignExportProgress,
  restedXpDocumentSetSchema,
  campaignPartyStarterSchema,
  buildCampaignStarters,
  enrichCampaignStarters,
  buildCampaignPlan,
  prepareCampaignPlan,
  compileCampaignAddon,
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
import { readAddonCombatReference } from "./leveling-addon-combat.mjs";
import { verifyCampaignAddonReview } from "./campaign-addon-review-check.mjs";

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
  const flags = new Set(["--raid-goals", "--verify-all", "--verify-party-matrix"]);
  const values = new Map();
  for (const argument of raw[0] === "--" ? raw.slice(1) : raw) {
    if (flags.has(argument)) {
      values.set(argument.slice(2), "true");
      continue;
    }
    const match = /^--([a-z-]+)=(.+)$/.exec(argument);
    if (!match || values.has(match[1]))
      throw new Error(
        "Use --archive=dir --rewards=dir --reward-import=file --runtime-build=number --restedxp-version=vX.Y.Z [--reward-evidence=file] [--combat=dir] [--configuration=file] [--destination=dir --race=race --class=class] [--party-race=race --party-class=class] [--interface=16001] [--version=0.2.0-review.1] [--raid-goals] [--verify-all [--verify-party-matrix]].",
      );
    values.set(match[1], match[2]);
  }
  const known = new Set([
    "archive",
    "rewards",
    "reward-import",
    "reward-evidence",
    "combat",
    "configuration",
    "destination",
    "race",
    "class",
    "party-race",
    "party-class",
    "runtime-build",
    "restedxp-version",
    "interface",
    "version",
    "raid-goals",
    "verify-all",
    "verify-party-matrix",
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
  const verifyPartyMatrix = values.get("verify-party-matrix") === "true";
  if (verifyPartyMatrix && !verifyAll)
    throw new Error("--verify-party-matrix requires --verify-all.");
  if (verifyPartyMatrix && (values.has("party-race") || values.has("party-class")))
    throw new Error("Full party-matrix verification cannot use a fixed member edition.");
  if (!verifyAll)
    for (const required of ["destination", "race", "class"])
      if (!values.has(required)) throw new Error(`Missing --${required}.`);
  const integer = (key, fallback) => {
    const value = Number(values.get(key) ?? fallback);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid --${key}.`);
    return value;
  };
  if (values.has("party-race") !== values.has("party-class"))
    throw new Error("Provide both --party-race and --party-class.");
  return {
    archive: resolve(values.get("archive")),
    rewards: resolve(values.get("rewards")),
    rewardImport: resolve(values.get("reward-import")),
    rewardEvidence: values.has("reward-evidence") ? resolve(values.get("reward-evidence")) : null,
    combat: values.has("combat") ? resolve(values.get("combat")) : null,
    configuration: values.has("configuration") ? resolve(values.get("configuration")) : null,
    destination: values.has("destination") ? resolve(values.get("destination")) : null,
    race: values.get("race"),
    leaderClass: values.get("class"),
    partyStarter: values.has("party-race")
      ? campaignPartyStarterSchema.parse({
          race: values.get("party-race"),
          classSlug: values.get("party-class"),
        })
      : undefined,
    runtimeBuild: integer("runtime-build"),
    interfaceVersion: integer("interface", "16001"),
    restedXpVersion: values.get("restedxp-version"),
    version: values.get("version") ?? "0.2.0-review.1",
    raidGoals: values.get("raid-goals") === "true",
    verifyAll,
    verifyPartyMatrix,
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
      guide.targetBuild !== manifest.targetBuild ||
      guide.version !== entry.version ||
      guide.steps.length !== entry.stepCount
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

async function writePackage(
  destination,
  releaseId,
  artifact,
  manifestBase,
  observerFiles,
  documentsRaw,
) {
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
    await writeFile(join(temporary, "guides.json"), documentsRaw, { flag: "wx", mode: 0o600 });
    const manifest = {
      schema: "kfc-campaign-addon.v1",
      ...manifestBase,
      releaseId,
      files: hashes,
      zip: { file: zipName, size: zip.length, sha256: sha256(zip) },
      documents: {
        file: "guides.json",
        bytes: Buffer.byteLength(documentsRaw),
        sha256: sha256(documentsRaw),
      },
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
      if (JSON.stringify(existing) !== JSON.stringify(manifest))
        throw new Error(`Existing addon manifest differs from the rebuilt release: ${final}`);
      for (const [name, expected] of Object.entries(hashes)) {
        const contents = await bounded(
          join(final, "KFCForeverGuides", name),
          MAXIMUM_CHAPTER_BYTES,
        );
        if (sha256(contents) !== expected)
          throw new Error(`Existing addon file checksum failed: ${name}`);
      }
      const existingDocuments = await bounded(join(final, "guides.json"), 12_000_000);
      if (sha256(existingDocuments) !== manifest.documents.sha256)
        throw new Error("Existing guide document checksum failed.");
      const existingZipPath = join(final, zipName);
      const zipMetadata = await stat(existingZipPath);
      if (!zipMetadata.isFile() || zipMetadata.size !== manifest.zip.size)
        throw new Error("Existing addon ZIP size failed verification.");
      if (sha256(await readFile(existingZipPath)) !== manifest.zip.sha256)
        throw new Error("Existing addon ZIP checksum failed.");
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
  const combat = await readAddonCombatReference(input.combat, manifest.targetBuild);
  const selection = campaignExportSelectionSchema.parse(
    input.configuration
      ? JSON.parse(await bounded(input.configuration, 100000))
      : { raidGoals: input.raidGoals },
  );
  if (input.raidGoals) selection.raidGoals = true;
  const starters = enrichCampaignStarters(
    buildCampaignStarters(manifest.sourceSha256, sources),
    sources,
    rewards.facts,
    combat ? { data: combat.data, revision: combat.revision } : null,
  );
  const combatReference = combat
    ? {
        sha256: combat.revision,
        sourceBuild: combat.data.targetBuild,
        publication: combat.data.publication,
      }
    : null;
  const compileArtifact = (plan, actions, partyStarter = input.partyStarter) => {
    const artifact = compileCampaignAddon(plan, actions, {
      version: input.version,
      runtimeBuild: input.runtimeBuild,
      interfaceVersion: input.interfaceVersion,
      restedXpVersion: input.restedXpVersion,
      nativeSources: sources,
      partyStarter,
    });
    verifyCampaignAddonReview(plan, actions, artifact, {
      runtimeBuild: input.runtimeBuild,
      restedXpVersion: input.restedXpVersion,
      selection,
      partyStarter,
    });
    return artifact;
  };
  const compileEdition = (race, leaderClass) => {
    const base = buildCampaignPlan(race, manifest.sourceSha256, sources, leaderClass);
    const plan = prepareCampaignPlan(base, sources, {
      starters,
      rewardFacts: rewards.facts,
      rewardRevision: rewards.revision,
      rewardBuild: rewards.observedIds.length ? input.runtimeBuild : null,
      combat,
      rewardNotice: `${rewards.observedIds.length} reviewed current-build reward fact(s) are attached; ${rewards.historicalIds.length} historical fallback fact(s) remain estimates. ${combat ? "Combat references fund hypothetical planning only; actual player XP and unverified loot remain held. " : ""}This addon package is an in-game review artifact.`,
    });
    const progress = campaignExportProgress(selection);
    const unmodeled = campaignUnmodeledExtras(plan, progress);
    if (unmodeled.length)
      throw new Error(`Selected optional quests are not modeled: ${unmodeled.join(", ")}.`);
    const actions = activeCampaignActions(plan, progress);
    const artifact = compileArtifact(plan, actions);
    return { plan, actions, artifact };
  };
  if (input.verifyAll) {
    const profiles = CAMPAIGN_RACES.flatMap((race) => {
      const profile = getLevelingRace("alliance", race);
      if (!profile) throw new Error(`Missing Alliance race profile: ${race}`);
      return profile.classes.map((classSlug) => ({ race, classSlug }));
    });
    const editions = profiles.map(({ race, classSlug: leaderClass }, index) => {
      let compiled;
      try {
        compiled = compileEdition(race, leaderClass);
      } catch (error) {
        throw new Error(
          `${race}/${leaderClass}: ${error instanceof Error ? error.message : "edition compilation failed"}`,
        );
      }
      const { plan, actions, artifact } = compiled;
      const partyVariants = input.partyStarter
        ? []
        : (input.verifyPartyMatrix
            ? profiles.map((starter) => ({ label: "full-party-matrix", starter }))
            : [
                { label: "same-edition", starter: profiles[index] },
                { label: "independent-starter", starter: profiles[(index + 1) % profiles.length] },
              ]
          ).map(({ label, starter }) => {
            let variant;
            try {
              variant = compileArtifact(plan, actions, starter);
            } catch (error) {
              throw new Error(
                `${race}/${leaderClass} member ${starter.race}/${starter.classSlug}: ${error instanceof Error ? error.message : "party compilation failed"}`,
              );
            }
            return {
              label,
              starter,
              partyGuides:
                variant.guides.find((guide) => guide.role === "party")?.names.length ?? 0,
              luaSha256: sha256(variant.lua),
            };
          });
      if (input.verifyPartyMatrix)
        process.stderr.write(
          `Verified ${index + 1}/${profiles.length}: ${race}/${leaderClass} with ${partyVariants.length} member editions.\n`,
        );
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
        pickupGateQuestIds: [
          ...new Set(
            actions.flatMap((action) =>
              action.pickupQuestId === undefined ? [] : [action.pickupQuestId],
            ),
          ),
        ].sort((left, right) => left - right),
        luaSha256: sha256(artifact.lua),
        partyVariants,
      };
    });
    const report = {
      mode: "verify-all",
      compilerRevision: CAMPAIGN_ADDON_COMPILER_REVISION,
      calculatorRevision: CAMPAIGN_XP_REVISION,
      reviewVersion: input.version,
      restedXpVersion: input.restedXpVersion,
      sourceArchiveSha256: manifest.sourceSha256,
      rewardRevision: rewards.revision,
      selection,
      fixedPartyStarter: input.partyStarter ?? null,
      editionCount: editions.length,
      fullPartyMatrix: input.verifyPartyMatrix,
      memberPairings: input.partyStarter
        ? editions.length
        : editions.reduce((sum, entry) => sum + entry.partyVariants.length, 0),
      sourceBuild: manifest.targetBuild,
      runtimeBuild: input.runtimeBuild,
      combatReference,
      actionRange: {
        minimum: Math.min(...editions.map((entry) => entry.actions)),
        maximum: Math.max(...editions.map((entry) => entry.actions)),
      },
      handInRange: {
        minimum: Math.min(...editions.map((entry) => entry.handIns)),
        maximum: Math.max(...editions.map((entry) => entry.handIns)),
      },
      editions,
    };
    process.stdout.write(`${JSON.stringify(report)}\n`);
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
  const documentsRaw =
    JSON.stringify(
      restedXpDocumentSetSchema.parse({
        schema: "kfc-restedxp-documents.v1",
        publication: "review",
        compilerRevision: CAMPAIGN_ADDON_COMPILER_REVISION,
        routeRelease: plan.release,
        sourceBuild: plan.targetBuild,
        runtimeBuild: input.runtimeBuild,
        restedXpVersion: input.restedXpVersion,
        nativePolicy: artifact.nativePolicy,
        edition: {
          leader: { race: plan.race, classSlug: plan.leaderClass },
          partyStarter: input.partyStarter,
        },
        selection,
        documents: artifact.documents,
      }),
      null,
      2,
    ) + "\n";
  const semantic = {
    compilerRevision: CAMPAIGN_ADDON_COMPILER_REVISION,
    calculatorRevision: CAMPAIGN_XP_REVISION,
    combatReference,
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
    raidGoals: selection.raidGoals,
    selection,
    nativePolicy: artifact.nativePolicy,
    partyStarter: input.partyStarter ?? null,
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
      documents: sha256(documentsRaw),
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
    documentsRaw,
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
