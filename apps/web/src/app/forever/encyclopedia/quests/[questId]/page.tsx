import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ForeverEncyclopediaNav } from "../../../../../components/forever-encyclopedia-nav";
import { ForeverWorldState } from "../../../../../components/forever-world-state";
import { getForeverQuest } from "../../../../../lib/forever-world";
import { createHelperMetadata } from "../../../../../lib/seo";

export const dynamic = "force-dynamic";

interface QuestPageProps {
  readonly params: Promise<{ readonly questId: string }>;
}

export async function generateMetadata({ params }: QuestPageProps): Promise<Metadata> {
  const { questId } = await params;
  return createHelperMetadata({
    title: `Quest ${questId} · WoW Forever`,
    description: `Build-scoped client and observation evidence for WoW Forever quest ${questId}.`,
    path: `/forever/encyclopedia/quests/${questId}`,
    noIndex: true,
  });
}

export default async function QuestPage({ params }: QuestPageProps): Promise<React.JSX.Element> {
  const { questId } = await params;
  const id = parsePositiveId(questId);
  if (!id) notFound();
  const data = await getForeverQuest(id);
  if (!data) notFound();
  return (
    <article className="forever-reference-page forever-world-page">
      <header className="forever-reference-hero forever-world-hero compact">
        <div>
          <Link className="helper-back-link" href="/forever/encyclopedia/quests">
            <span aria-hidden="true">←</span> Quest index
          </Link>
          <span className="eyebrow">client_id_present</span>
          <h1>Quest {data.quest.questId}</h1>
          <p>
            This build ships the quest identity. A title, narrative, objectives, and complete
            rewards will appear only after the server returns them or a player observes the quest in
            game.
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
              <dt>Availability</dt>
              <dd>Not yet proven live</dd>
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
              <dd>None yet</dd>
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
      <section className="forever-world-empty">
        <span className="eyebrow">Server query required</span>
        <h2>Quest details not observed</h2>
        <p>
          The diagnostics scanner can request this ID in a paced batch. Failure, timeout, and
          success remain separate evidence states so hidden or retired data does not become a public
          quest.
        </p>
      </section>
    </article>
  );
}

function parsePositiveId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
