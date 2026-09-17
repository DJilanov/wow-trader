import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ForeverEncyclopediaNav } from "../../../../../components/forever-encyclopedia-nav";
import { ForeverMapViewer } from "../../../../../components/forever-map-viewer";
import { ForeverWorldState } from "../../../../../components/forever-world-state";
import { getForeverMapPage } from "../../../../../lib/forever-world";
import { createHelperMetadata } from "../../../../../lib/seo";

export const dynamic = "force-dynamic";

interface ForeverMapPageProps {
  readonly params: Promise<{ readonly uiMapId: string }>;
}

export async function generateMetadata({ params }: ForeverMapPageProps): Promise<Metadata> {
  const { uiMapId } = await params;
  const id = parsePositiveId(uiMapId);
  const data = id ? await getForeverMapPage(id) : null;
  if (!data)
    return createHelperMetadata({
      title: "Forever map",
      description: "WoW Forever map",
      path: `/forever/encyclopedia/maps/${uiMapId}`,
      noIndex: true,
    });
  return createHelperMetadata({
    title: `${data.map.name} Map · WoW Forever`,
    description: `Explore the extracted ${data.map.name} map with client points of interest, flight points, quest coverage, and evidence labels.`,
    path: `/forever/encyclopedia/maps/${data.map.uiMapId}`,
    keywords: [`${data.map.name} map`, "WoW Forever map"],
  });
}

export default async function ForeverMapPage({
  params,
}: ForeverMapPageProps): Promise<React.JSX.Element> {
  const { uiMapId } = await params;
  const id = parsePositiveId(uiMapId);
  if (!id) notFound();
  const data = await getForeverMapPage(id);
  if (!data) notFound();
  return (
    <article className="forever-reference-page forever-world-page">
      <header className="forever-reference-hero forever-world-hero compact">
        <div>
          <Link className="helper-back-link" href="/forever/encyclopedia/maps">
            <span aria-hidden="true">←</span> All maps
          </Link>
          {data.parentMaps.length > 0 ? (
            <nav className="forever-map-breadcrumb" aria-label="Map hierarchy">
              {data.parentMaps.map((parent) => (
                <Link href={`/forever/encyclopedia/maps/${parent.uiMapId}`} key={parent.uiMapId}>
                  {parent.name}
                </Link>
              ))}
            </nav>
          ) : null}
          <span className="eyebrow">UI map {data.map.uiMapId}</span>
          <h1>{data.map.name}</h1>
          <p>
            Native build {data.build.buildNumber} map art with exact client places, flight points,
            and quest regions. Area-only boss relationships are listed separately and never drawn as
            exact pins.
          </p>
        </div>
        <ForeverWorldState build={data.build} />
      </header>
      <ForeverEncyclopediaNav active="maps" />
      {data.layer && data.tiles.length > 0 ? (
        <ForeverMapViewer
          buildNumber={data.build.buildNumber}
          bossRelationships={data.bossRelationships}
          height={data.layer.layerHeight}
          markers={data.markers}
          name={data.map.name}
          tileHeight={data.layer.tileHeight}
          tileWidth={data.layer.tileWidth}
          tiles={data.tiles}
          width={data.layer.layerWidth}
        />
      ) : (
        <section className="forever-world-empty">
          <span className="eyebrow">Honest empty state</span>
          <h2>No native UI-map art is linked</h2>
          <p>
            This map remains searchable while its WDT/WMO fallback renderer is still unverified.
          </p>
        </section>
      )}
      <section className="forever-map-evidence-grid">
        <div>
          <span className="eyebrow">Visible evidence</span>
          <h2>{data.markers.length} mapped records</h2>
          <ul>
            {data.markers.slice(0, 36).map((marker) => (
              <li key={marker.id}>
                <strong>{marker.name}</strong>
                <span>
                  {marker.kind === "taxi"
                    ? "Flight point"
                    : marker.kind === "quest_poi"
                      ? "Quest region"
                      : marker.kind === "boss"
                        ? "Boss"
                        : "Point of interest"}
                </span>
                <small>
                  {marker.points.length > 2 ? "Exact client POI shape" : "Exact client coordinate"}
                </small>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <span className="eyebrow">Coverage</span>
          <h2>What is connected</h2>
          <dl>
            <div>
              <dt>Areas on world map</dt>
              <dd>{data.areas.length}</dd>
            </div>
            <div>
              <dt>Quest POI blobs</dt>
              <dd>{data.questPois.length}</dd>
            </div>
            <div>
              <dt>Map assignment</dt>
              <dd>{data.assignment ? `#${data.assignment.assignmentId}` : "Missing"}</dd>
            </div>
            <div>
              <dt>Boss pins</dt>
              <dd>{data.markers.filter((marker) => marker.kind === "boss").length} points</dd>
            </div>
            <div>
              <dt>Area-level boss links</dt>
              <dd>{data.bossRelationships.length}</dd>
            </div>
          </dl>
        </div>
      </section>
    </article>
  );
}

function parsePositiveId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
