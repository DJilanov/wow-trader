"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import {
  constrainMapView,
  fitMapPoints,
  fullMapView,
  zoomMapView,
  type MapView,
} from "../lib/leveling-map-view";
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
  readonly onLocation?: (point: LevelingMapPoint) => void;
}
interface ZoneCanvasProps {
  readonly zone: LevelingZoneArt;
  readonly points: readonly LevelingMapPoint[];
  readonly buildNumber: number;
  readonly onLocation: ((point: LevelingMapPoint) => void) | undefined;
}

function ZoneCanvas({ zone, points, buildNumber, onLocation }: ZoneCanvasProps): React.JSX.Element {
  const [loaded, setLoaded] = useState<ReadonlySet<number>>(new Set());
  const [failed, setFailed] = useState(false);
  const [autoFit, setAutoFit] = useState(true);
  const selectionKey = autoFit ? points.map((point) => point.id).join("|") : "manual";
  const [viewState, setViewState] = useState<{
    readonly key: string;
    readonly view: MapView;
  } | null>(null);
  const view =
    viewState?.key === selectionKey
      ? viewState.view
      : autoFit
        ? fitMapPoints(zone.width, zone.height, points)
        : fullMapView(zone.width, zone.height);
  const drag = useRef<{
    readonly pointerId: number;
    readonly x: number;
    readonly y: number;
    readonly scale: number;
    readonly view: MapView;
  } | null>(null);
  const markerScale = view.width / zone.width;
  function setView(next: MapView): void {
    setViewState({ key: selectionKey, view: constrainMapView(next, zone.width, zone.height) });
  }
  function zoom(factor: number): void {
    setView(zoomMapView(view, zone.width, zone.height, factor));
  }
  function startDrag(event: PointerEvent<SVGSVGElement>): void {
    if (
      event.button !== 0 ||
      (event.target instanceof Element && event.target.closest("[data-map-marker]"))
    )
      return;
    const scale = event.currentTarget.getScreenCTM()?.a;
    if (!scale || drag.current) return;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, scale, view };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function moveDrag(event: PointerEvent<SVGSVGElement>): void {
    const start = drag.current;
    if (!start || start.pointerId !== event.pointerId) return;
    setView({
      ...start.view,
      x: start.view.x - (event.clientX - start.x) / start.scale,
      y: start.view.y - (event.clientY - start.y) / start.scale,
    });
  }
  function endDrag(event: PointerEvent<SVGSVGElement>): void {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function keyboardPan(event: KeyboardEvent<SVGSVGElement>): void {
    if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey)
      return;
    const directions: Readonly<Record<string, readonly [number, number]>> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    setView({
      ...view,
      x: view.x + (direction[0] * view.width) / 10,
      y: view.y + (direction[1] * view.height) / 10,
    });
  }
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
      <div className={styles.mapViewControls} role="group" aria-label="Map controls">
        <button
          type="button"
          aria-label="Zoom in map"
          disabled={markerScale <= 1 / 8}
          onClick={() => zoom(0.75)}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out map"
          disabled={markerScale >= 1}
          onClick={() => zoom(1.5)}
        >
          −
        </button>
        <button
          type="button"
          aria-label="Fit locations"
          disabled={points.length === 0}
          onClick={() => setView(fitMapPoints(zone.width, zone.height, points))}
        >
          <span className={styles.mapControlLong}>Fit locations</span>
          <span className={styles.mapControlShort} aria-hidden="true">
            Fit
          </span>
        </button>
        <button
          type="button"
          aria-label="Full zone"
          onClick={() => setView(fullMapView(zone.width, zone.height))}
        >
          <span className={styles.mapControlLong}>Full zone</span>
          <span className={styles.mapControlShort} aria-hidden="true">
            Zone
          </span>
        </button>
        <label>
          <input
            type="checkbox"
            checked={autoFit}
            onChange={(event) => {
              setAutoFit(event.target.checked);
              setViewState(null);
            }}
          />{" "}
          Auto-fit
        </label>
      </div>
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
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
        role="group"
        tabIndex={0}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onKeyDown={keyboardPan}
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
            data-map-marker={point.id}
            role={onLocation ? "button" : undefined}
            tabIndex={onLocation ? 0 : undefined}
            aria-label={`Map location ${index + 1}: ${point.evidence === "client_quest_poi" ? `quest ${point.questId} POI centre` : "guide waypoint"}, ${(point.x * 100).toFixed(1)}, ${(point.y * 100).toFixed(1)}`}
            onClick={() => onLocation?.(point)}
            onKeyDown={(event) => {
              if (onLocation && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                onLocation(point);
              }
            }}
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
              r={18 * markerScale}
              className={styles.mapPointHalo}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              data-location-id={point.id}
              cx={point.x * zone.width}
              cy={point.y * zone.height}
              r={18 * markerScale}
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
              style={{ fontSize: `${18 * markerScale}px` }}
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
  onLocation,
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
              onLocation={onLocation}
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
