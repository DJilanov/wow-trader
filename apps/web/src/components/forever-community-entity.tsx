import Link from "next/link";

import type {
  CommunityReferenceEntityDetail,
  CommunityReferenceLocationGroup,
} from "../lib/community-reference";
import { ForeverEncyclopediaNav } from "./forever-encyclopedia-nav";
import { ForeverMapViewer } from "./forever-map-viewer";

const MAX_RENDERED_COORDINATES = 120;

export function ForeverCommunityEntity({
  entity,
}: {
  readonly entity: CommunityReferenceEntityDetail;
}): React.JSX.Element {
  const kindLabel = entity.kind === "npc" ? "NPC" : "World object";
  const indexPath = `/forever/encyclopedia/${entity.kind}s`;
  return (
    <article className="forever-reference-page forever-world-page community-entity-page">
      <header className="forever-reference-hero forever-world-hero compact">
        <div>
          <Link className="helper-back-link" href={indexPath}>
            <span aria-hidden="true">←</span> {entity.kind === "npc" ? "NPCs" : "Objects"}
          </Link>
          <span className="eyebrow">
            {entity.snapshot.sourceName} · {kindLabel} {entity.id}
          </span>
          <h1>{entity.name}</h1>
          <p>
            {entity.subName ? `${entity.subName}. ` : ""}
            Spawn coordinates and relationships come from a pinned community revision. Live
            observations remain separate and are used only to corroborate or flag conflicts.
          </p>
        </div>
        <div className="build-stamp">
          <span>Catalog build</span>
          <strong>{entity.snapshot.clientVersion}</strong>
          <small>Build {entity.snapshot.buildNumber}</small>
        </div>
      </header>
      <ForeverEncyclopediaNav active="maps" />

      <section className="forever-map-evidence-grid community-entity-summary">
        <div>
          <span className="eyebrow">Identity</span>
          <h2>{evidenceStatusLabel(entity.identityAgreement.status)}</h2>
          <dl>
            <div>
              <dt>Reference name</dt>
              <dd>{entity.name}</dd>
            </div>
            <div>
              <dt>Observed names</dt>
              <dd>{entity.identityAgreement.observedCount}</dd>
            </div>
            <div>
              <dt>Agreements</dt>
              <dd>{entity.identityAgreement.agreeingObservedCount}</dd>
            </div>
            <div>
              <dt>Conflicts</dt>
              <dd>{entity.identityAgreement.conflictingObservedCount}</dd>
            </div>
          </dl>
          {entity.identityAgreement.conflictingNames.length ? (
            <p className="forever-honest-empty">
              Conflicting observed name: {entity.identityAgreement.conflictingNames.join(", ")}.
              This page does not silently choose one source.
            </p>
          ) : null}
        </div>
        <div>
          <span className="eyebrow">Reference facts</span>
          <h2>{kindLabel} profile</h2>
          <dl>
            <div>
              <dt>Level</dt>
              <dd>{levelLabel(entity.minimumLevel, entity.maximumLevel)}</dd>
            </div>
            <div>
              <dt>Rank</dt>
              <dd>{entity.rank ?? "Not supplied"}</dd>
            </div>
            <div>
              <dt>Primary area ID</dt>
              <dd>{entity.zoneId || "Not supplied"}</dd>
            </div>
            <div>
              <dt>Relationships</dt>
              <dd>{entity.relationshipCount.toLocaleString()}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="forever-boss-panel forever-boss-wide-panel">
        <div className="forever-section-heading">
          <div>
            <span className="eyebrow">Published community coordinates</span>
            <h2>Known locations</h2>
          </div>
          <p>
            Coordinates use the Questie area-map percentage system: 0–100 from the top-left of the
            named area map.
          </p>
        </div>
        {entity.rejectedLocationCount ? (
          <p className="forever-honest-empty">
            {entity.rejectedLocationCount.toLocaleString()} malformed or out-of-bounds coordinates
            were rejected instead of being plotted.
          </p>
        ) : null}
        {entity.locations.length ? (
          <div className="community-location-list">
            {entity.locations.map((location) => (
              <CommunityLocation
                entityId={entity.id}
                entityKind={entity.kind}
                entityName={entity.name}
                key={location.areaId}
                location={location}
              />
            ))}
          </div>
        ) : (
          <p className="forever-honest-empty">
            This published entity has no valid spawn coordinates. Absence is not proof that it does
            not exist on the realm.
          </p>
        )}
      </section>

      <section className="forever-boss-panel forever-boss-wide-panel">
        <div className="forever-section-heading">
          <div>
            <span className="eyebrow">Relationship graph</span>
            <h2>Quests, items, and sources</h2>
          </div>
          <p>
            Showing {entity.relationships.length.toLocaleString()} of{" "}
            {entity.relationshipCount.toLocaleString()} published relationships.
          </p>
        </div>
        {entity.relationships.length ? (
          <ul className="forever-evidence-list compact">
            {entity.relationships.map((relationship, index) => {
              const label =
                relationship.relatedName ?? `${relationship.relatedKind} ${relationship.relatedId}`;
              return (
                <li
                  key={`${relationship.direction}:${relationship.relationKind}:${relationship.relatedKind}:${relationship.relatedId}:${index}`}
                >
                  <div>
                    <strong>
                      {relationship.href ? <Link href={relationship.href}>{label}</Link> : label}
                    </strong>
                    <span>
                      {relationship.direction === "incoming" ? "Referenced by: " : "References: "}
                      {relationship.label}
                    </span>
                  </div>
                  <small>
                    {relationship.relatedKind} {relationship.relatedId} · pinned community relation
                  </small>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="forever-honest-empty">No relationship is present in this snapshot.</p>
        )}
      </section>

      {entity.kind === "npc" ? (
        <section className="forever-boss-panel forever-boss-wide-panel">
          <div className="forever-section-heading">
            <div>
              <span className="eyebrow">Exact-build runtime evidence</span>
              <h2>Player observations</h2>
            </div>
            <p>Opt-in sightings corroborate identity without overwriting the reference snapshot.</p>
          </div>
          {entity.observations.length ? (
            <ul className="forever-evidence-list compact">
              {entity.observations.slice(0, 30).map((observation) => (
                <li key={observation.observationId}>
                  <strong>{observation.creatureName ?? `NPC ${entity.id}`}</strong>
                  <span>
                    Level {observation.level ?? "?"}
                    {observation.classification ? ` · ${observation.classification}` : ""}
                  </span>
                  <small>
                    {observation.positionEvidence} · {observation.capturedAt.toLocaleString()}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="forever-honest-empty">
              No player has uploaded a sighting for this exact build yet.
            </p>
          )}
        </section>
      ) : null}

      <aside className="evidence-note">
        {entity.locationSourceName ? (
          <p>
            Coordinates: {entity.locationSourceName}, revision {entity.locationSourceRevision}.
          </p>
        ) : null}
        <strong>Provenance boundary</strong>
        <p>
          {entity.snapshot.sourceName} {entity.snapshot.sourceVersion}, revision{" "}
          {entity.snapshot.sourceRevision}, was published for build {entity.snapshot.buildNumber} on{" "}
          {entity.snapshot.publishedAt.toLocaleDateString()}. Community coordinates are useful
          navigation evidence, not a server-side spawn guarantee.
        </p>
      </aside>
    </article>
  );
}

function CommunityLocation({
  entityId,
  entityKind,
  entityName,
  location,
}: {
  readonly entityId: number;
  readonly entityKind: CommunityReferenceEntityDetail["kind"];
  readonly entityName: string;
  readonly location: CommunityReferenceLocationGroup;
}): React.JSX.Element {
  const sampled = sampleCoordinates(location.locations, MAX_RENDERED_COORDINATES);
  const title = location.areaName ?? `Area ${location.areaId}`;
  const markers = sampled.map((point, index) => ({
    id: `community:${entityKind}:${entityId}:${location.areaId}:${index}`,
    name: entityName,
    description: `${point.xPercent.toFixed(2)}, ${point.yPercent.toFixed(2)} on ${title}`,
    kind: entityKind === "npc" ? ("community_npc" as const) : ("community_object" as const),
    x: point.xPercent / 100,
    y: point.yPercent / 100,
    evidence: "published_community" as const,
    href: null,
    points: [{ x: point.xPercent / 100, y: point.yPercent / 100 }],
  }));
  return (
    <article className="community-location-card">
      <header>
        <div>
          <span className="eyebrow">Area {location.areaId}</span>
          <h3>{title}</h3>
        </div>
        <span>
          {location.locations.length.toLocaleString()} coordinate
          {location.locations.length === 1 ? "" : "s"}
        </span>
      </header>
      {location.map ? (
        <ForeverMapViewer
          bossRelationships={[]}
          buildNumber={location.map.buildNumber}
          height={location.map.height}
          markers={markers}
          name={`${entityName} in ${title}`}
          tileHeight={location.map.tileHeight}
          tileWidth={location.map.tileWidth}
          tiles={location.map.tiles}
          width={location.map.width}
        />
      ) : (
        <CoordinatePlot name={`${entityName} in ${title}`} points={sampled} />
      )}
      <p className="community-location-note">
        {sampled.length === location.locations.length
          ? `Showing all ${sampled.length.toLocaleString()} valid coordinates.`
          : `Showing an evenly spaced sample of ${sampled.length.toLocaleString()} from ${location.locations.length.toLocaleString()} valid coordinates.`}
      </p>
    </article>
  );
}

function CoordinatePlot({
  name,
  points,
}: {
  readonly name: string;
  readonly points: readonly { readonly xPercent: number; readonly yPercent: number }[];
}): React.JSX.Element {
  return (
    <figure className="community-coordinate-plot">
      <svg aria-label={`${name} coordinate plot`} role="img" viewBox="0 0 100 100">
        <rect height="100" width="100" x="0" y="0" />
        {points.map((point, index) => (
          <circle cx={point.xPercent} cy={point.yPercent} key={index} r="0.8">
            <title>
              {point.xPercent.toFixed(2)}, {point.yPercent.toFixed(2)}
            </title>
          </circle>
        ))}
      </svg>
      <figcaption>
        No compatible client map art is linked; positions remain area percentages.
      </figcaption>
    </figure>
  );
}

function sampleCoordinates<T>(values: readonly T[], maximum: number): readonly T[] {
  if (values.length <= maximum) return values;
  return Array.from({ length: maximum }, (_, index) => {
    const sourceIndex = Math.floor((index * (values.length - 1)) / (maximum - 1));
    return values[sourceIndex]!;
  });
}

function evidenceStatusLabel(
  status: CommunityReferenceEntityDetail["identityAgreement"]["status"],
): string {
  if (status === "corroborated") return "Community and live evidence agree";
  if (status === "conflicting") return "Identity conflict requires review";
  return "Published community identity";
}

function levelLabel(minimum: number | null, maximum: number | null): string {
  if (minimum === null && maximum === null) return "Not supplied";
  if (minimum === maximum || maximum === null) return String(minimum);
  if (minimum === null) return String(maximum);
  return `${minimum}–${maximum}`;
}
