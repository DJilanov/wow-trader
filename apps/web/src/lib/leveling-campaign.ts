import {
  CHAPTER_REFERENCES,
  buildCampaignPlan,
  prepareCampaignPlan,
  buildCampaignStarters,
  enrichCampaignStarters,
  questCatalogRewardFacts,
  type CampaignStarterCatalog,
  type CampaignPlan,
  type CampaignRace,
  type CampaignSource,
  type GuideArchiveManifest,
  type ClassSlug,
} from "@wow-trader/leveling";
import { getImportedLevelingChapter, getLevelingArchiveManifest } from "./leveling-archive";
import { getLevelingMaps } from "./leveling-maps";
import type { LevelingChapterMaps } from "./leveling-map-data";
import { getLevelingRewardSnapshot } from "./leveling-quest-xp";
import { getLevelingCombatSnapshot } from "./leveling-combat";
import { getLevelingQuestValidationCoverage } from "./leveling-quest-validation";
import { campaignRewardQuestIds } from "./leveling-reward-inventory";
import { getLevelingQuestCatalog } from "./leveling-quest-catalog";
import { createHash } from "node:crypto";

let cache:
  | {
      readonly manifest: GuideArchiveManifest;
      readonly sources: Promise<readonly CampaignSource[]>;
      readonly plans: Map<string, Promise<CampaignPlan>>;
      readonly starters: Promise<CampaignStarterCatalog>;
      readonly enrichedStarters: Map<string, CampaignStarterCatalog>;
      readonly preparedPlans: Map<string, CampaignPlan>;
    }
  | undefined;

async function loadSources(manifest: GuideArchiveManifest): Promise<readonly CampaignSource[]> {
  const references = CHAPTER_REFERENCES.filter(
    (chapter) =>
      chapter.family === "questing" &&
      chapter.factions.includes("alliance") &&
      manifest.chapters.some((entry) => entry.chapterId === chapter.id),
  );
  const result: CampaignSource[] = [];
  for (let index = 0; index < references.length; index += 8) {
    const batch = await Promise.all(
      references.slice(index, index + 8).map(async (reference): Promise<CampaignSource> => {
        const guide = await getImportedLevelingChapter(reference.id);
        if (!guide) throw new Error(`Authorized campaign source ${reference.id} is unavailable.`);
        return { reference, guide };
      }),
    );
    result.push(...batch);
  }
  return result;
}

export async function getLevelingCampaignExportSources(): Promise<
  readonly CampaignSource[] | null
> {
  const manifest = await getLevelingArchiveManifest();
  if (!manifest || manifest.targetBuild !== 70205) return null;
  return cache?.manifest === manifest ? cache.sources : loadSources(manifest);
}

export async function getLevelingCampaign(
  race: CampaignRace,
  leaderClass: ClassSlug | null = null,
): Promise<CampaignPlan | null> {
  const manifest = await getLevelingArchiveManifest();
  if (!manifest || manifest.targetBuild !== 70205) return null;
  if (cache?.manifest !== manifest) {
    const sources = loadSources(manifest);
    cache = {
      manifest,
      sources,
      plans: new Map(),
      starters: sources.then((value) => buildCampaignStarters(manifest.sourceSha256, value)),
      enrichedStarters: new Map(),
      preparedPlans: new Map(),
    };
  }
  const current = cache;
  const key = `${race}-${leaderClass ?? "general"}`;
  let pending = current.plans.get(key);
  if (!pending) {
    if (current.plans.size >= 6) {
      const oldest = current.plans.keys().next().value;
      if (oldest !== undefined) current.plans.delete(oldest);
    }
    pending = current.sources.then((sources) =>
      buildCampaignPlan(race, manifest.sourceSha256, sources, leaderClass),
    );
    current.plans.set(key, pending);
  }
  try {
    const [plan, sources, starters] = await Promise.all([
      pending,
      current.sources,
      current.starters,
    ]);
    return await withEvidence(
      plan,
      sources,
      starters,
      current.enrichedStarters,
      current.preparedPlans,
    );
  } catch (error: unknown) {
    if (cache === current) cache = undefined;
    throw error;
  }
}

async function withEvidence(
  plan: CampaignPlan,
  sources: readonly CampaignSource[],
  starters: CampaignStarterCatalog,
  enrichedStarters: Map<string, CampaignStarterCatalog>,
  preparedPlans: Map<string, CampaignPlan>,
): Promise<CampaignPlan> {
  const [combat, questCatalog] = await Promise.all([
    getLevelingCombatSnapshot(),
    getLevelingQuestCatalog(),
  ]);
  const ids = [
    ...new Set([
      ...campaignRewardQuestIds({ ...plan, starters }, { includeHeldLibrary: true }),
      ...(questCatalog.data?.targetBuild === plan.targetBuild
        ? questCatalog.data.quests.map((quest) => quest.questId)
        : []),
    ]),
  ];
  const snapshot = await getLevelingRewardSnapshot(ids);
  const rewardFacts = questCatalogRewardFacts(
    snapshot.facts,
    questCatalog.data?.targetBuild === plan.targetBuild ? questCatalog.data : null,
  );
  const validation = await getLevelingQuestValidationCoverage(snapshot.clientBuild);
  const factsHash = createHash("sha256").update(JSON.stringify(rewardFacts)).digest("hex");
  const key = `${snapshot.revision}:${factsHash}:${combat.revision}:${questCatalog.revision}`;
  const preparedKey = `${plan.race}:${plan.leaderClass}:${key}:${validation.revision}`;
  const existing = preparedPlans.get(preparedKey);
  if (existing) return existing;
  let partyStarters = enrichedStarters.get(key);
  if (!partyStarters) {
    partyStarters = enrichCampaignStarters(
      starters,
      sources,
      rewardFacts,
      combat.data?.targetBuild === plan.targetBuild
        ? { data: combat.data, revision: combat.revision }
        : null,
      questCatalog.data?.targetBuild === plan.targetBuild ? questCatalog.data : null,
    );
    if (enrichedStarters.size >= 2) enrichedStarters.delete(enrichedStarters.keys().next().value!);
    enrichedStarters.set(key, partyStarters);
  }
  const prepared = prepareCampaignPlan(plan, sources, {
    starters: partyStarters,
    rewardFacts,
    rewardRevision: `${snapshot.revision}:${validation.revision}`,
    rewardBuild: snapshot.clientBuild,
    ...(validation.data
      ? {
          questValidation: {
            data: validation.data,
            runtimeBuild: validation.data.runtimeBuild,
          },
        }
      : {}),
    combat: combat.data ? { data: combat.data, revision: combat.revision } : null,
    questCatalog: questCatalog.data?.targetBuild === plan.targetBuild ? questCatalog.data : null,
    rewardNotice:
      [
        snapshot.notice,
        combat.notice,
        questCatalog.notice,
        validation.notice,
        combat.data && combat.data.targetBuild !== plan.targetBuild
          ? "Combat references belong to a different client build and are excluded."
          : null,
      ]
        .filter(Boolean)
        .join(" ") || null,
  });
  if (preparedPlans.size >= 6) preparedPlans.delete(preparedPlans.keys().next().value!);
  preparedPlans.set(preparedKey, prepared);
  return prepared;
}

export async function getLevelingCampaignMaps(plan: CampaignPlan): Promise<LevelingChapterMaps> {
  const actions = [
    ...plan.actions,
    ...(plan.catchUpBatches ?? []).flatMap((batch) => batch.actions),
  ];
  const maps = await getLevelingMaps(
    actions.map((action) => ({
      id: action.id,
      positions: action.positions,
      quests: action.questChanges.map((change) => ({ questId: change.questId, sourceLine: 0 })),
    })),
    plan.targetBuild,
  );
  const sourceIds = new Set(actions.filter((action) => action.source).map((action) => action.id));
  return {
    ...maps,
    points: maps.points.map((point) =>
      sourceIds.has(point.stepId) ? point : { ...point, evidence: "reference_pickup" as const },
    ),
  };
}
