import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ForeverEncyclopediaNav } from "../../../../../components/forever-encyclopedia-nav";
import { ForeverWorldState } from "../../../../../components/forever-world-state";
import { getForeverEncounter } from "../../../../../lib/forever-world";
import { createHelperMetadata } from "../../../../../lib/seo";

export const dynamic = "force-dynamic";

interface EncounterPageProps {
  readonly params: Promise<{ readonly encounterId: string }>;
}

export async function generateMetadata({ params }: EncounterPageProps): Promise<Metadata> {
  const { encounterId } = await params;
  const id = parsePositiveId(encounterId);
  const data = id ? await getForeverEncounter(id) : null;
  return data
    ? createHelperMetadata({
        title: `${data.encounter.name} Encounter · WoW Forever`,
        description: `Client encounter data, actor evidence, and clearly labelled item source candidates for ${data.encounter.name} in WoW Forever.`,
        path: `/forever/encyclopedia/encounters/${data.encounter.encounterId}`,
        keywords: [`${data.encounter.name} loot`, `${data.encounter.name} WoW Forever`],
      })
    : createHelperMetadata({
        title: "WoW Forever encounter",
        description: "WoW Forever encounter evidence",
        path: `/forever/encyclopedia/encounters/${encounterId}`,
        noIndex: true,
      });
}

export default async function EncounterPage({
  params,
}: EncounterPageProps): Promise<React.JSX.Element> {
  const { encounterId } = await params;
  const id = parsePositiveId(encounterId);
  if (!id) notFound();
  const data = await getForeverEncounter(id);
  if (!data) notFound();
  return (
    <article className="forever-reference-page forever-world-page">
      <header className="forever-reference-hero forever-world-hero compact">
        <div>
          <Link
            className="helper-back-link"
            href={
              data.map
                ? `/forever/encyclopedia/instances/${data.map.mapId}`
                : "/forever/encyclopedia/instances"
            }
          >
            <span aria-hidden="true">←</span> {data.map?.name ?? "All instances"}
          </Link>
          <span className="eyebrow">Encounter {data.encounter.encounterId}</span>
          <h1>{data.encounter.name}</h1>
          <p>
            Client encounter identity is exact. Criteria-backed creature relationships are shown
            when present; positions and loot stay empty until stronger evidence supplies them.
          </p>
        </div>
        <ForeverWorldState build={data.build} />
      </header>
      <ForeverEncyclopediaNav active="instances" />
      <section className="forever-encounter-evidence-grid">
        <article>
          <span className="eyebrow">Exact client relationship</span>
          <h2>Encounter record</h2>
          <dl>
            <div>
              <dt>Instance map</dt>
              <dd>{data.map?.name ?? `Map ${data.encounter.mapId}`}</dd>
            </div>
            <div>
              <dt>Difficulty</dt>
              <dd>{data.encounter.difficultyId}</dd>
            </div>
            <div>
              <dt>Order index</dt>
              <dd>{data.encounter.orderIndex}</dd>
            </div>
            <div>
              <dt>Connected creature IDs</dt>
              <dd>{data.bosses.length || "None resolved"}</dd>
            </div>
            <div>
              <dt>Fight position</dt>
              <dd>Awaiting observations</dd>
            </div>
          </dl>
        </article>
        <article>
          <span className="eyebrow">Connected actors</span>
          <h2>
            {data.bosses.length > 0 ? `${data.bosses.length} boss identities` : "No actor edge yet"}
          </h2>
          {data.bosses.length > 0 ? (
            <ul className="forever-encounter-actor-list">
              {data.bosses.map((boss) => (
                <li key={boss.creatureId}>
                  <Link href={`/forever/encyclopedia/bosses/${boss.creatureId}`}>{boss.name}</Link>
                  <small>Creature {boss.creatureId} · criteria-backed</small>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              An encounter run can later add observed actors without changing the exact client
              record.
            </p>
          )}
        </article>
      </section>
      <section className="forever-source-hints">
        <div className="forever-section-heading">
          <div>
            <span className="eyebrow">Candidate evidence—not observed loot</span>
            <h2>Possible item source matches</h2>
          </div>
          <p>Exact name matches in appearance source text still require maintainer review.</p>
        </div>
        {data.lootCandidates.length > 0 ? (
          <ul>
            {data.lootCandidates.map((candidate) => (
              <li key={`${candidate.sourceInfoId}:${candidate.targetKind}:${candidate.targetId}`}>
                <span>Item {candidate.itemId ?? "unresolved"}</span>
                <p>{candidate.description}</p>
                <small>source-hint name match · review required</small>
              </li>
            ))}
          </ul>
        ) : (
          <div className="forever-world-empty compact">
            <p>No source candidates match this encounter.</p>
          </div>
        )}
      </section>
      <section className="forever-source-hints">
        <div className="forever-section-heading">
          <div>
            <span className="eyebrow">Unstructured client evidence</span>
            <h2>Matching source hints</h2>
          </div>
          <p>Useful discovery evidence, visibly separated from observed or curated loot.</p>
        </div>
        {data.sourceHints.length > 0 ? (
          <ul>
            {data.sourceHints.map((hint) => (
              <li key={hint.sourceInfoId}>
                <span>Item {hint.itemId ?? "unresolved"}</span>
                <p>{hint.description}</p>
                <small>client_source_hint</small>
              </li>
            ))}
          </ul>
        ) : (
          <div className="forever-world-empty compact">
            <p>No exact name-matched source hints.</p>
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
