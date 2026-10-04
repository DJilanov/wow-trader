"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  LevelingChapterMaps,
  LevelingMapPoint,
  LevelingZoneArt,
} from "../lib/leveling-map-data";
import styles from "./leveling-experience.module.css";

interface LevelingZoneMapProps {
  readonly maps: LevelingChapterMaps;
  readonly points: readonly LevelingMapPoint[];
  readonly stepLabel: string;
}
interface ZoneCanvasProps {
  readonly zone: LevelingZoneArt;
  readonly points: readonly LevelingMapPoint[];
  readonly buildNumber: number;
}

function ZoneCanvas({ zone, points, buildNumber }: ZoneCanvasProps): React.JSX.Element {
  const [loaded, setLoaded] = useState<ReadonlySet<number>>(new Set());
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    // Server-rendered SVG images may finish before hydration attaches their load handlers.
    const probes = [
      ...new Set([
        ...zone.tiles.map((tile) => tile.fileDataId),
        ...zone.overlays.flatMap((overlay) => overlay.tiles.map((tile) => tile.fileDataId)),
      ]),
    ].map((fileDataId) => {
      const probe = new Image();
      probe.onload = () => setLoaded((current) => new Set([...current, fileDataId]));
      probe.onerror = () => setFailed(true);
      probe.src = `/api/forever-map-media/${fileDataId}?v=${buildNumber}`;
      return probe;
    });
    return () => {
      for (const probe of probes) {
        probe.onload = null;
        probe.onerror = null;
      }
    };
  }, [zone.tiles, zone.overlays, buildNumber]);
  const imageCount = new Set([
    ...zone.tiles.map((tile) => tile.fileDataId),
    ...zone.overlays.flatMap((overlay) => overlay.tiles.map((tile) => tile.fileDataId)),
  ]).size;
  return (
    <div className={styles.mapArtViewport}>
      {failed ? (
        <p className={styles.notice} role="status">
          Some map tiles could not be loaded. Coordinates below remain available; check the
          extracted map-media directory.
        </p>
      ) : loaded.size < imageCount ? (
        <p className={styles.mapLoading} role="status">
          Loading native zone artwork…
        </p>
      ) : null}
      <svg
        className={styles.zoneCanvas}
        viewBox={`0 0 ${zone.width} ${zone.height}`}
        role="img"
        aria-label={`${zone.name} map with ${points.length} location circles`}
      >
        <title>{`${zone.name} · extracted locations for the selected step`}</title>
        {zone.tiles.map((tile) => (
          <image
            key={`${tile.rowIndex}-${tile.columnIndex}-${tile.fileDataId}`}
            href={`/api/forever-map-media/${tile.fileDataId}?v=${buildNumber}`}
            x={tile.columnIndex * zone.tileWidth}
            y={tile.rowIndex * zone.tileHeight}
            width={zone.tileWidth}
            height={zone.tileHeight}
          />
        ))}
        {zone.overlays.map((overlay) => (
          <g key={overlay.overlayId} data-map-overlay={overlay.overlayId}>
            <defs>
              <clipPath id={`leveling-map-${zone.uiMapId}-${overlay.overlayId}`}>
                <rect
                  x={overlay.offsetX}
                  y={overlay.offsetY}
                  width={overlay.width}
                  height={overlay.height}
                />
              </clipPath>
            </defs>
            <g clipPath={`url(#leveling-map-${zone.uiMapId}-${overlay.overlayId})`}>
              {overlay.tiles.map((tile) => (
                <image
                  key={`${tile.rowIndex}-${tile.columnIndex}-${tile.fileDataId}`}
                  href={`/api/forever-map-media/${tile.fileDataId}?v=${buildNumber}`}
                  x={overlay.offsetX + tile.columnIndex * zone.tileWidth}
                  y={overlay.offsetY + tile.rowIndex * zone.tileHeight}
                  width={tile.width}
                  height={tile.height}
                />
              ))}
            </g>
          </g>
        ))}
        {points.map((point, index) => (
          <g
            key={point.id}
            className={
              point.evidence === "client_quest_poi" ? styles.clientMapPoint : styles.guideMapPoint
            }
          >
            {point.outline.length > 2 && (
              <polygon
                points={point.outline
                  .map((entry) => `${entry.x * zone.width},${entry.y * zone.height}`)
                  .join(" ")}
                className={styles.questMapArea}
              />
            )}
            <circle
              cx={point.x * zone.width}
              cy={point.y * zone.height}
              r={18}
              className={styles.mapPointHalo}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              data-location-id={point.id}
              cx={point.x * zone.width}
              cy={point.y * zone.height}
              r={18}
              vectorEffect="non-scaling-stroke"
            >
              <title>{`${point.evidence === "client_quest_poi" ? `Quest ${point.questId} · client POI centre` : "Extracted guide waypoint"} · ${(point.x * 100).toFixed(1)}, ${(point.y * 100).toFixed(1)}`}</title>
            </circle>
            <text
              x={point.x * zone.width}
              y={point.y * zone.height}
              className={styles.mapPointNumber}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {`${index + 1}`}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function LevelingZoneMap({
  maps,
  points,
  stepLabel,
}: LevelingZoneMapProps): React.JSX.Element {
  const [selectedZone, setSelectedZone] = useState<{
    readonly stepLabel: string;
    readonly uiMapId: number;
  } | null>(null);
  const zone =
    maps.zones.find(
      (entry) => selectedZone?.stepLabel === stepLabel && entry.uiMapId === selectedZone.uiMapId,
    ) ??
    maps.zones.find((entry) => points.some((point) => point.uiMapId === entry.uiMapId)) ??
    maps.zones[0];
  const visible = points.filter((point) => point.uiMapId === zone?.uiMapId);
  return (
    <section id="leveling-zone-map" className={styles.zoneMapPanel} aria-label="Quest location map">
      <div className={styles.mapToolbar}>
        <div>
          <span className="eyebrow">Native zone maps</span>
          <h2>
            <span className={styles.mapHeadingPrefix}>Where to go · </span>
            {stepLabel}
          </h2>
        </div>
        {zone && (
          <label className={styles.mapZoneField}>
            <span className={styles.mapZoneLabel}>Zone map</span>
            <select
              value={zone.uiMapId}
              onChange={(event) =>
                setSelectedZone({ stepLabel, uiMapId: Number(event.target.value) })
              }
            >
              {maps.zones.map((entry) => (
                <option key={entry.uiMapId} value={entry.uiMapId}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {maps.state === "unavailable" ? (
        <p className={styles.notice}>
          Zone maps are unavailable. Configure the extracted world snapshot and map media; the quest
          list and saved progress still work.
        </p>
      ) : !zone ? (
        <p className={styles.notice}>
          No zone locations are mapped for this chapter. We do not invent quest coordinates.
        </p>
      ) : (
        <figure className={styles.zoneMapFigure}>
          {zone.tiles.length && maps.buildNumber !== null ? (
            <ZoneCanvas
              key={`${zone.uiMapId}-${maps.buildNumber}`}
              zone={zone}
              points={visible}
              buildNumber={maps.buildNumber}
            />
          ) : (
            <p className={styles.notice}>
              Native map artwork is not available for {zone.name}. Known coordinates are listed
              below.
            </p>
          )}
          <figcaption className={styles.mapFooter}>
            <details className={styles.mapEvidence}>
              <summary>Map key & evidence</summary>
              <span className={styles.guideLegend}>Gold circles: source guide waypoints.</span>{" "}
              <span className={styles.clientLegend}>
                Blue: client quest POIs; circles mark area centres.
              </span>{" "}
              Circles are visual markers, not measured quest radii.
            </details>
            {maps.buildNumber !== maps.targetBuild && (
              <p className={styles.notice}>
                Background/projection build {maps.buildNumber} · guide build {maps.targetBuild}.
                Different-build quest POIs are excluded; world-coordinate projections need
                current-build verification.
              </p>
            )}
            {visible.length === 0 ? (
              <p className={styles.mapEmpty}>
                No extracted location for this step on {zone.name}. Choose another zone or use “Show
                on map” on a mapped step.
              </p>
            ) : (
              <ul className={styles.mapCoordinates}>
                {visible.map((point, index) => (
                  <li key={point.id}>
                    {index + 1}.{" "}
                    {point.evidence === "client_quest_poi"
                      ? `Quest ${point.questId} POI centre`
                      : "Guide waypoint"}{" "}
                    · {(point.x * 100).toFixed(1)}, {(point.y * 100).toFixed(1)}
                  </li>
                ))}
              </ul>
            )}
            <Link
              className={styles.mapExplorerLink}
              href={`/forever/encyclopedia/maps/${zone.uiMapId}`}
            >
              Open {zone.name} map explorer ↗
            </Link>
          </figcaption>
        </figure>
      )}
      {maps.unmappedPoints > 0 && (
        <p className={styles.footnote}>
          {maps.unmappedPoints} source location(s) could not be safely projected. Original
          coordinates remain in the step details.
        </p>
      )}
    </section>
  );
}
