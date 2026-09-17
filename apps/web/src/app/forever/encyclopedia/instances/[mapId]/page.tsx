import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ForeverEncyclopediaNav } from "../../../../../components/forever-encyclopedia-nav";
import { ForeverWorldState } from "../../../../../components/forever-world-state";
import { foreverInstanceTypeLabel, getForeverInstance } from "../../../../../lib/forever-world";
import { createHelperMetadata } from "../../../../../lib/seo";

export const dynamic = "force-dynamic";

interface ForeverInstancePageProps {
  readonly params: Promise<{ readonly mapId: string }>;
}

export async function generateMetadata({ params }: ForeverInstancePageProps): Promise<Metadata> {
  const { mapId } = await params;
  const id = parsePositiveId(mapId);
  const data = id ? await getForeverInstance(id) : null;
  return data
    ? createHelperMetadata({
        title: `${data.map.name} Bosses and Encounters · WoW Forever`,
        description: `Browse ${data.map.name} encounter order, difficulty variants, boss identities, and clearly labelled source evidence for WoW Forever.`,
        path: `/forever/encyclopedia/instances/${data.map.mapId}`,
        keywords: [`${data.map.name} bosses`, `${data.map.name} loot`],
      })
    : createHelperMetadata({
        title: "WoW Forever instance",
        description: "WoW Forever instance encounters",
        path: `/forever/encyclopedia/instances/${mapId}`,
        noIndex: true,
      });
}

export default async function ForeverInstancePage({
  params,
}: ForeverInstancePageProps): Promise<React.JSX.Element> {
  const { mapId } = await params;
  const id = parsePositiveId(mapId);
  if (!id) notFound();
  const data = await getForeverInstance(id);
  if (!data) notFound();
  return (
    <article className="forever-reference-page forever-world-page">
      <header className="forever-reference-hero forever-world-hero compact">
        <div>
          <Link className="helper-back-link" href="/forever/encyclopedia/instances">
            <span aria-hidden="true">←</span> All dungeons & raids
          </Link>
          <span className="eyebrow">
            {foreverInstanceTypeLabel(data.map.instanceType)} · Map {data.map.mapId}
          </span>
          <h1>{data.map.name}</h1>
          <p>
            {data.map.description ||
              "The client ships no public instance description for this build."}
          </p>
        </div>
        <ForeverWorldState build={data.build} />
      </header>
      <ForeverEncyclopediaNav active="instances" />
      <section className="forever-instance-facts" aria-label="Instance facts">
        <div>
          <span>Encounters</span>
          <strong>{data.encounterGroups.length}</strong>
          <small>{data.encounters.length} difficulty records</small>
        </div>
        <div>
          <span>Players</span>
          <strong>{data.map.maxPlayers || "—"}</strong>
          <small>Client map setting</small>
        </div>
        <div>
          <span>Known boss IDs</span>
          <strong>{data.bosses.length}</strong>
          <small>Criteria-backed identities</small>
        </div>
      </section>
      {data.difficulties.length > 0 ? (
        <section className="forever-difficulty-strip" aria-label="Available client difficulties">
          {data.difficulties.map(({ difficulty, tuning }) => (
            <div key={difficulty.mapDifficultyId}>
              <strong>{difficulty.difficultyName}</strong>
              <span>
                {difficulty.maxPlayers > 0 ? `${difficulty.maxPlayers} players` : "Flexible size"}
                {tuning
                  ? ` · levels ${tuning.minimumLevel}–${tuning.maximumLevel}`
                  : " · level range unavailable"}
              </span>
            </div>
          ))}
        </section>
      ) : null}
      <section className="forever-encounter-list" aria-labelledby="encounter-order-heading">
        <div className="forever-section-heading">
          <div>
            <span className="eyebrow">Client encounter order</span>
            <h2 id="encounter-order-heading">Bosses and encounters</h2>
          </div>
          <p>
            {data.encounterGroups.length} unique encounters; repeated client difficulty rows are
            grouped below.
          </p>
        </div>
        <ol>
          {data.encounterGroups.map((group) => (
            <li key={group.key}>
              <span>{group.orderIndex}</span>
              <div>
                <small>
                  {group.variants.length} client{" "}
                  {group.variants.length === 1 ? "record" : "difficulty records"}
                </small>
                <strong>{group.name}</strong>
                <span className="forever-encounter-variants">
                  {group.variants.map((variant) => (
                    <Link
                      href={`/forever/encyclopedia/encounters/${variant.encounterId}`}
                      key={variant.encounterId}
                    >
                      Difficulty {variant.difficultyId}
                    </Link>
                  ))}
                </span>
              </div>
              <Link
                href={`/forever/encyclopedia/encounters/${group.variants[0]?.encounterId ?? ""}`}
              >
                Evidence <span aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
      {data.bosses.length > 0 ? (
        <section className="forever-instance-bosses">
          <div className="forever-section-heading">
            <div>
              <span className="eyebrow">Achievement criteria bridge</span>
              <h2>Connected creature identities</h2>
            </div>
            <p>These are exact creature IDs with an evidence-backed instance or encounter edge.</p>
          </div>
          <div className="forever-instance-boss-grid">
            {data.bosses.map((boss) => (
              <Link href={`/forever/encyclopedia/bosses/${boss.creatureId}`} key={boss.creatureId}>
                <small>Creature {boss.creatureId}</small>
                <strong>{boss.name}</strong>
                <span>{boss.contextLabel ?? boss.encounterNames.join(" · ")}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
      <section className="forever-source-hints">
        <div className="forever-section-heading">
          <div>
            <span className="eyebrow">Name-matched appearance provenance</span>
            <h2>Possible item source matches</h2>
          </div>
          <p>
            Candidates help discovery but do not prove that the item drops here, is available, or
            has any particular drop rate.
          </p>
        </div>
        {data.lootCandidates.length > 0 ? (
          <ul>
            {data.lootCandidates.slice(0, 80).map((candidate) => (
              <li key={`${candidate.sourceInfoId}:${candidate.targetKind}:${candidate.targetId}`}>
                <span>Item {candidate.itemId ?? "unresolved"}</span>
                <p>{candidate.description}</p>
                <small>source-hint name match · review required</small>
              </li>
            ))}
          </ul>
        ) : (
          <div className="forever-world-empty compact">
            <h3>No item source candidates</h3>
            <p>No client source text passed the instance matching rules.</p>
          </div>
        )}
      </section>
      <section className="forever-source-hints">
        <div className="forever-section-heading">
          <div>
            <span className="eyebrow">Legacy unstructured discovery</span>
            <h2>Additional source text</h2>
          </div>
          <p>
            These strings can suggest an item source, but do not prove availability or drop rate.
          </p>
        </div>
        {data.sourceHints.length > 0 ? (
          <ul>
            {data.sourceHints.slice(0, 60).map((hint) => (
              <li key={hint.sourceInfoId}>
                <span>Item {hint.itemId ?? "unresolved"}</span>
                <p>{hint.description}</p>
                <small>client_source_hint · review required</small>
              </li>
            ))}
          </ul>
        ) : (
          <div className="forever-world-empty compact">
            <h3>No matching source hints</h3>
            <p>Observed encounter loot will appear only after the in-game event is verified.</p>
          </div>
        )}
      </section>
    </article>
  );
}

function parsePositiveId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
