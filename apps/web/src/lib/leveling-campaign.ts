import {
  CHAPTER_REFERENCES,
  buildCampaignPlan,
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

let cache:
  | {
      readonly manifest: GuideArchiveManifest;
      readonly sources: Promise<readonly CampaignSource[]>;
      readonly plans: Map<string, Promise<CampaignPlan>>;
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

export async function getLevelingCampaign(
  race: CampaignRace,
  leaderClass: ClassSlug | null = null,
): Promise<CampaignPlan | null> {
  const manifest = await getLevelingArchiveManifest();
  if (!manifest || manifest.targetBuild !== 70205) return null;
  if (cache?.manifest !== manifest)
    cache = { manifest, sources: loadSources(manifest), plans: new Map() };
  const current = cache;
  const key = `${race}-${leaderClass ?? "general"}`;
  const existing = current.plans.get(key);
  if (existing) return withRewardSnapshot(await existing);
  if (current.plans.size >= 6) {
    const oldest = current.plans.keys().next().value;
    if (oldest !== undefined) current.plans.delete(oldest);
  }
  const plan = current.sources.then((sources) =>
    buildCampaignPlan(race, manifest.sourceSha256, sources, leaderClass),
  );
  current.plans.set(key, plan);
  try {
    return withRewardSnapshot(await plan);
  } catch (error: unknown) {
    if (cache === current) cache = undefined;
    throw error;
  }
}

async function withRewardSnapshot(plan: CampaignPlan): Promise<CampaignPlan> {
  const ids = [
    ...new Set([
      ...plan.actions.flatMap((action) => action.questChanges.map((change) => change.questId)),
      ...(plan.catchUpBatches ?? []).map((batch) => batch.questId),
      ...(plan.library?.choices ?? []).map((choice) => choice.questId),
    ]),
  ];
  const snapshot = await getLevelingRewardSnapshot(ids);
  return {
    ...plan,
    catchUpBatches: (plan.catchUpBatches ?? []).filter(
      (batch) => batch.objectiveType === "shared-kills" && !batch.conditional,
    ),
    rewardFacts: snapshot.facts,
    rewardRevision: snapshot.revision,
    rewardNotice: snapshot.notice,
  };
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
