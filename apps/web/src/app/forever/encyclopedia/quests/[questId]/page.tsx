import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ForeverEncyclopediaNav } from "../../../../../components/forever-encyclopedia-nav";
import { ForeverWorldState } from "../../../../../components/forever-world-state";
import {
  getForeverQuest,
  type ForeverQuestRuntimeObservation,
} from "../../../../../lib/forever-world";
import { createHelperMetadata } from "../../../../../lib/seo";

export const dynamic = "force-dynamic";

interface QuestPageProps {
  readonly params: Promise<{ readonly questId: string }>;
}

export async function generateMetadata({ params }: QuestPageProps): Promise<Metadata> {
  const { questId } = await params;
  const id = parsePositiveId(questId);
  const data = id ? await getForeverQuest(id) : null;
  const title =
    data?.observations.find((observation) => observation.title)?.title ?? data?.quest.title ?? null;
  return createHelperMetadata({
    title: `${title ?? `Quest ${questId}`} · WoW Forever`,
    description: title
      ? `Objectives, rewards, quest giver evidence, and build-scoped client facts for ${title} in WoW Forever.`
      : `Build-scoped client and observation evidence for WoW Forever quest ${questId}.`,
    path: `/forever/encyclopedia/quests/${questId}`,
    noIndex: !title,
  });
}

export default async function QuestPage({ params }: QuestPageProps): Promise<React.JSX.Element> {
  const { questId } = await params;
  const id = parsePositiveId(questId);
  if (!id) notFound();
  const data = await getForeverQuest(id);
  if (!data) notFound();
  const titledObservation = data.observations.find((observation) => observation.title);
  const detailObservation = data.observations.find(
    (observation) => observation.questText || observation.objectiveText || observation.progressText,
  );
  const queryObservation = data.observations.find(
    (observation) => observation.evidenceKind === "server_query",
  );
  const rewards = collectRewards(data.observations);
  const questTitle = titledObservation?.title ?? data.quest.title ?? `Quest ${data.quest.questId}`;
  return (
    <article className="forever-reference-page forever-world-page">
      <header className="forever-reference-hero forever-world-hero compact">
        <div>
          <Link className="helper-back-link" href="/forever/encyclopedia/quests">
            <span aria-hidden="true">←</span> Quest index
          </Link>
          <span className="eyebrow">
            {queryObservation?.status === "success"
              ? "server_queryable"
              : data.quest.title
                ? "client_task_present"
                : "client_id_present"}
          </span>
          <h1>{questTitle}</h1>
          <p>
            {titledObservation || data.quest.title
              ? `Quest ${data.quest.questId} is backed by ${titledObservation ? formatEvidence(titledObservation.evidenceKind) : "client task"} evidence from this exact client build.`
              : "This build ships the quest identity. A title, narrative, objectives, and complete rewards will appear only after the server returns them or a player observes the quest in game."}
          </p>
        </div>
        <ForeverWorldState build={data.build} />
      </header>
      <ForeverEncyclopediaNav active="quests" />
      <section className="forever-quest-evidence-grid">
        <article>
          <span className="eyebrow">Static client evidence</span>
          <h2>Identity</h2>
          <dl>
            <div>
              <dt>Quest ID</dt>
              <dd>{data.quest.questId}</dd>
            </div>
            <div>
              <dt>Unique bit flag</dt>
              <dd>{data.quest.uniqueBitFlag}</dd>
            </div>
            <div>
              <dt>UI theme ID</dt>
              <dd>{data.quest.uiQuestDetailsThemeId || "Default"}</dd>
            </div>
            <div>
              <dt>Level range</dt>
              <dd>
                {data.quest.minimumLevel || data.quest.maximumLevel
                  ? `${data.quest.minimumLevel || "Any"}–${data.quest.maximumLevel || "Any"}`
                  : "Not encoded"}
              </dd>
            </div>
            <div>
              <dt>Availability</dt>
              <dd>{questAvailability(data.observations)}</dd>
            </div>
          </dl>
        </article>
        <article>
          <span className="eyebrow">Relationships</span>
          <h2>Map and storyline</h2>
          <dl>
            <div>
              <dt>Quest lines</dt>
              <dd>{data.lines.map((line) => line.name).join(", ") || "None"}</dd>
            </div>
            <div>
              <dt>POI blobs</dt>
              <dd>{data.pois.length}</dd>
            </div>
            <div>
              <dt>Reward observations</dt>
              <dd>{rewards.length || "None yet"}</dd>
            </div>
          </dl>
          {data.pois.map((poi) => (
            <Link
              href={
                poi.uiMapId
                  ? `/forever/encyclopedia/maps/${poi.uiMapId}`
                  : "/forever/encyclopedia/maps"
              }
              key={poi.blobId}
            >
              Map evidence #{poi.blobId} <span aria-hidden="true">→</span>
            </Link>
          ))}
        </article>
      </section>
      {data.objectives.length > 0 ? (
        <section className="forever-boss-panel forever-boss-wide-panel">
          <div className="forever-section-heading">
            <div>
              <span className="eyebrow">Static QuestObjective records</span>
              <h2>Client objectives</h2>
            </div>
            <p>Object type and ID are client facts; availability still requires live evidence.</p>
          </div>
          <ul className="forever-evidence-list compact">
            {data.objectives.map((objective) => (
              <li key={objective.objectiveId}>
                <div>
                  <strong>{objective.description || `Objective ${objective.objectiveId}`}</strong>
                  <span>
                    {objective.amount || 1} required · order {objective.orderIndex + 1}
                  </span>
                </div>
                <small>
                  Type {objective.type} · object {objective.objectId || "not encoded"}
                </small>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {data.observations.length > 0 ? (
        <>
          <section className="forever-boss-panel forever-boss-wide-panel">
            <div className="forever-section-heading">
              <div>
                <span className="eyebrow">Exact build runtime evidence</span>
                <h2>Quest details</h2>
              </div>
              <p>Server queries and player interactions remain separately labeled.</p>
            </div>
            {detailObservation ? (
              <div className="forever-quest-evidence-grid">
                <article>
                  <h3>Story and progress</h3>
                  {detailObservation.questText ? <p>{detailObservation.questText}</p> : null}
                  {detailObservation.progressText ? <p>{detailObservation.progressText}</p> : null}
                  <small>{formatEvidence(detailObservation.evidenceKind)}</small>
                </article>
                <article>
                  <h3>Objective</h3>
                  <p>{detailObservation.objectiveText ?? "No objective text was captured."}</p>
                  <dl>
                    <div>
                      <dt>Level</dt>
                      <dd>{detailObservation.questLevel ?? "Unknown"}</dd>
                    </div>
                    <div>
                      <dt>Suggested group</dt>
                      <dd>{detailObservation.suggestedGroup || "Solo or unspecified"}</dd>
                    </div>
                  </dl>
                </article>
              </div>
            ) : (
              <p className="forever-honest-empty">
                The quest was queried or observed, but no narrative interaction has been captured.
              </p>
            )}
          </section>
          <section className="forever-boss-panel forever-boss-wide-panel">
            <div className="forever-section-heading">
              <div>
                <span className="eyebrow">Observed, not inferred</span>
                <h2>Rewards and sources</h2>
              </div>
              <p>An empty list is an evidence gap, not proof that the quest has no rewards.</p>
            </div>
            {rewards.length > 0 ? (
              <ul className="forever-evidence-list compact">
                {rewards.map((reward) => (
                  <li key={reward.key}>
                    <strong>{reward.label}</strong>
                    <span>{reward.quantity ? `×${reward.quantity}` : "Observed reward"}</span>
                    {reward.itemId ? <small>Forever item ID {reward.itemId}</small> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="forever-honest-empty">No reward has been captured yet.</p>
            )}
            <ul className="forever-evidence-list compact">
              {data.observations
                .filter((observation) => observation.sourceId)
                .map((observation) => (
                  <li key={observation.observationId}>
                    <strong>
                      {observation.sourceName ??
                        `${observation.sourceType ?? "Source"} ${observation.sourceId}`}
                    </strong>
                    <span>{formatEvidence(observation.evidenceKind)}</span>
                    <small>{formatObservedAt(observation.capturedAt)}</small>
                  </li>
                ))}
            </ul>
          </section>
        </>
      ) : (
        <section className="forever-world-empty">
          <span className="eyebrow">Server query required</span>
          <h2>Quest details not observed</h2>
          <p>
            The diagnostics scanner can request this ID in a paced batch. Failure, timeout, and
            success remain separate evidence states so hidden or retired data does not become a
            public quest.
          </p>
        </section>
      )}
    </article>
  );
}

interface QuestRewardView {
  readonly key: string;
  readonly label: string;
  readonly itemId: number | null;
  readonly quantity: number | null;
}

function collectRewards(
  observations: readonly ForeverQuestRuntimeObservation[],
): readonly QuestRewardView[] {
  const rewards: QuestRewardView[] = [];
  for (const observation of observations) {
    if (observation.itemId) {
      rewards.push({
        key: `${observation.observationId}:item`,
        label: `Item ${observation.itemId}`,
        itemId: observation.itemId,
        quantity: observation.quantity,
      });
    }
    if (observation.currencyId) {
      rewards.push({
        key: `${observation.observationId}:currency`,
        label: `Currency ${observation.currencyId}`,
        itemId: null,
        quantity: observation.quantity,
      });
    }
    if (Array.isArray(observation.rewards)) {
      observation.rewards.forEach((reward, index) => {
        if (!isRewardRecord(reward)) return;
        rewards.push({
          key: `${observation.observationId}:reward:${index}`,
          label:
            typeof reward.name === "string"
              ? reward.name
              : `Item ${typeof reward.rewardId === "number" ? reward.rewardId : "reward"}`,
          itemId: typeof reward.rewardId === "number" ? reward.rewardId : null,
          quantity: typeof reward.quantity === "number" ? reward.quantity : null,
        });
      });
    }
  }
  return rewards;
}

function isRewardRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function questAvailability(observations: readonly ForeverQuestRuntimeObservation[]): string {
  if (observations.some((row) => row.evidenceKind === "completed")) return "Completed in game";
  if (observations.some((row) => row.evidenceKind === "accepted")) return "Accepted in game";
  if (observations.some((row) => row.evidenceKind === "gossip_available")) {
    return "Offered in game";
  }
  if (observations.some((row) => row.evidenceKind === "server_query" && row.status === "success")) {
    return "Server queryable";
  }
  return "Not yet proven live";
}

function formatEvidence(value: string): string {
  return value.replaceAll("_", " ");
}

function formatObservedAt(value: Date): string {
  return `${value.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function parsePositiveId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
