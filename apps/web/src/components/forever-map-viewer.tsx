"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";

interface MapTile {
  readonly tileId: number;
  readonly rowIndex: number;
  readonly columnIndex: number;
  readonly fileDataId: number;
}

interface MapMarker {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: "area_poi" | "boss" | "quest_poi" | "taxi";
  readonly x: number;
  readonly y: number;
  readonly evidence: "exact_client" | "review_required";
  readonly href: string | null;
  readonly points: readonly { readonly x: number; readonly y: number }[];
}

interface BossRelationship {
  readonly creatureId: number;
  readonly name: string;
  readonly evidenceLabel: string;
  readonly requiresReview: boolean;
}

interface ForeverMapViewerProps {
  readonly buildNumber: number;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly tiles: readonly MapTile[];
  readonly markers: readonly MapMarker[];
  readonly bossRelationships: readonly BossRelationship[];
}

interface LayerVisibility {
  readonly bosses: boolean;
  readonly places: boolean;
  readonly quests: boolean;
  readonly taxi: boolean;
}

const defaultLayers: LayerVisibility = { bosses: true, places: true, quests: true, taxi: true };

export function ForeverMapViewer({
  bossRelationships,
  buildNumber,
  height,
  markers,
  name,
  tileHeight,
  tileWidth,
  tiles,
  width,
}: ForeverMapViewerProps): React.JSX.Element {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const groupsRef = useRef<Record<keyof LayerVisibility, LayerGroup> | null>(null);
  const [layers, setLayers] = useState<LayerVisibility>(defaultLayers);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = markers.find((marker) => marker.id === selectedId) ?? null;
  const hasBossPoints = markers.some((marker) => marker.kind === "boss");
  const visibleMarkers = useMemo(
    () =>
      markers.filter((marker) => {
        if (marker.kind === "area_poi" && !layers.places) return false;
        if (marker.kind === "boss" && !layers.bosses) return false;
        if (marker.kind === "taxi" && !layers.taxi) return false;
        if (marker.kind === "quest_poi" && !layers.quests) return false;
        return marker.name.toLocaleLowerCase("en").includes(query.trim().toLocaleLowerCase("en"));
      }),
    [layers, markers, query],
  );

  useEffect(() => {
    const element = mapElementRef.current;
    if (!element || mapRef.current) return;
    let cancelled = false;
    void import("leaflet").then((leaflet) => {
      if (cancelled || mapRef.current || !mapElementRef.current) return;
      const map = leaflet.map(mapElementRef.current, {
        attributionControl: false,
        boxZoom: true,
        crs: leaflet.CRS.Simple,
        doubleClickZoom: true,
        keyboard: true,
        maxZoom: 2.5,
        minZoom: -1.5,
        scrollWheelZoom: true,
        zoomControl: false,
        zoomSnap: 0.25,
      });
      const mapBounds = leaflet.latLngBounds([0, 0], [height, width]);
      map.fitBounds(mapBounds, { animate: false, padding: [8, 8] });
      map.setMaxBounds(mapBounds.pad(0.25));
      for (const tile of tiles) {
        const top = tile.rowIndex * tileHeight;
        const bottom = top + tileHeight;
        const left = tile.columnIndex * tileWidth;
        const right = left + tileWidth;
        leaflet
          .imageOverlay(
            `/api/forever-map-media/${tile.fileDataId}?v=${buildNumber}`,
            [
              [height - bottom, left],
              [height - top, right],
            ],
            { alt: "", className: "forever-leaflet-tile", interactive: false },
          )
          .addTo(map);
      }
      const groups = {
        bosses: leaflet.layerGroup(),
        places: leaflet.layerGroup(),
        quests: leaflet.layerGroup(),
        taxi: leaflet.layerGroup(),
      };
      for (const marker of markers) {
        const group = layerGroupFor(marker.kind, groups);
        const point = leaflet.latLng(height - marker.y * height, marker.x * width);
        if (marker.kind === "quest_poi" && marker.points.length > 2) {
          const polygon = leaflet.polygon(
            marker.points.map((entry) => [height - entry.y * height, entry.x * width]),
            {
              className: "forever-map-quest-region",
              color: "#70a4d2",
              fillColor: "#70a4d2",
              fillOpacity: 0.2,
              weight: 2,
            },
          );
          polygon.bindTooltip(marker.name);
          polygon.on("click", () => setSelectedId(marker.id));
          polygon.addTo(group);
        } else {
          const icon = leaflet.divIcon({
            className: `forever-map-pin ${marker.kind}`,
            html: `<span aria-hidden="true">${markerSymbol(marker.kind)}</span>`,
            iconAnchor: [11, 11],
            iconSize: [22, 22],
          });
          const pin = leaflet.marker(point, { icon, keyboard: true, title: marker.name });
          pin.bindTooltip(marker.name, { direction: "top", offset: [0, -12] });
          pin.on("click", () => setSelectedId(marker.id));
          pin.addTo(group);
        }
      }
      groups.places.addTo(map);
      groups.bosses.addTo(map);
      groups.quests.addTo(map);
      groups.taxi.addTo(map);
      groupsRef.current = groups;
      mapRef.current = map;
      const focus = new URLSearchParams(window.location.search).get("focus");
      if (focus && markers.some((marker) => marker.id === focus)) setSelectedId(focus);
    });
    return () => {
      cancelled = true;
      groupsRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [buildNumber, height, markers, tileHeight, tileWidth, tiles, width]);

  useEffect(() => {
    const map = mapRef.current;
    const groups = groupsRef.current;
    if (!map || !groups) return;
    for (const key of Object.keys(layers) as (keyof LayerVisibility)[]) {
      const visible = layers[key];
      const present = map.hasLayer(groups[key]);
      if (visible && !present) groups[key].addTo(map);
      if (!visible && present) groups[key].removeFrom(map);
    }
  }, [layers]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedId) url.searchParams.set("focus", selectedId);
    else url.searchParams.delete("focus");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [selectedId]);

  const selectMarker = (marker: MapMarker): void => {
    setSelectedId(marker.id);
    const map = mapRef.current;
    if (!map) return;
    map.flyTo([height - marker.y * height, marker.x * width], Math.max(map.getZoom(), 0.5), {
      duration: 0.35,
    });
  };

  const setLayer = (key: keyof LayerVisibility, checked: boolean): void => {
    setLayers((current) => ({ ...current, [key]: checked }));
  };

  const resetView = (): void => {
    mapRef.current?.fitBounds(
      [
        [0, 0],
        [height, width],
      ],
      { animate: true, padding: [8, 8] },
    );
  };

  const openFullscreen = (): void => {
    const container = mapElementRef.current?.closest(".forever-map-explorer");
    if (container instanceof HTMLElement) void container.requestFullscreen();
  };

  return (
    <section className="forever-map-explorer" aria-label={`${name} map explorer`}>
      <div className="forever-map-commandbar">
        <label className="forever-map-search">
          <span className="sr-only">Search visible map features</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search places and mapped quests"
            type="search"
            value={query}
          />
        </label>
        <div className="forever-map-actions" aria-label="Map controls">
          <button aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()} type="button">
            −
          </button>
          <button aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()} type="button">
            +
          </button>
          <button onClick={resetView} type="button">
            Reset
          </button>
          <button onClick={openFullscreen} type="button">
            Full screen
          </button>
        </div>
      </div>
      <div className="forever-map-workspace">
        <div className="forever-map-stage">
          <div
            className="forever-leaflet-map"
            ref={mapElementRef}
            role="application"
            aria-label={`${name} interactive map. Use arrow keys to pan and plus or minus to zoom.`}
          />
          <fieldset className="forever-map-layers">
            <legend>Layers</legend>
            <MapLayerToggle
              checked={layers.places}
              label="Places"
              onChange={(checked) => setLayer("places", checked)}
            />
            {hasBossPoints ? (
              <MapLayerToggle
                checked={layers.bosses}
                label="Boss points"
                onChange={(checked) => setLayer("bosses", checked)}
              />
            ) : null}
            <MapLayerToggle
              checked={layers.taxi}
              label="Flight points"
              onChange={(checked) => setLayer("taxi", checked)}
            />
            <MapLayerToggle
              checked={layers.quests}
              label="Quest evidence"
              onChange={(checked) => setLayer("quests", checked)}
            />
          </fieldset>
        </div>
        <aside className={`forever-map-results ${selected ? "has-selection" : ""}`}>
          {selected ? (
            <div className="forever-map-selection">
              <button onClick={() => setSelectedId(null)} type="button">
                <span aria-hidden="true">←</span> All visible results
              </button>
              <span className={`forever-map-kind ${selected.kind}`}>
                {mapKindLabel(selected.kind)}
              </span>
              <h2>{selected.name}</h2>
              {selected.description ? <p>{selected.description}</p> : null}
              <dl>
                <div>
                  <dt>Evidence</dt>
                  <dd>
                    {selected.evidence === "exact_client"
                      ? "Exact client record"
                      : "Review required"}
                  </dd>
                </div>
                <div>
                  <dt>Precision</dt>
                  <dd>{selected.points.length > 2 ? "Client POI region" : "Exact point"}</dd>
                </div>
                <div>
                  <dt>Build</dt>
                  <dd>{buildNumber}</dd>
                </div>
              </dl>
              {selected.href ? <Link href={selected.href}>Open record →</Link> : null}
            </div>
          ) : (
            <>
              <div className="forever-map-results-heading">
                <div>
                  <span className="eyebrow">Visible evidence</span>
                  <h2>{visibleMarkers.length} results</h2>
                </div>
                <small>Click a result to focus it</small>
              </div>
              <div className="forever-map-result-list">
                {visibleMarkers.length > 0 ? (
                  visibleMarkers.slice(0, 80).map((marker) => (
                    <button key={marker.id} onClick={() => selectMarker(marker)} type="button">
                      <span className={`forever-map-result-icon ${marker.kind}`} aria-hidden="true">
                        {markerSymbol(marker.kind)}
                      </span>
                      <span>
                        <strong>{marker.name}</strong>
                        <small>
                          {mapKindLabel(marker.kind)} ·{" "}
                          {marker.evidence === "exact_client"
                            ? "exact client evidence"
                            : "review required"}
                        </small>
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="forever-map-no-results">No visible features match this search.</p>
                )}
              </div>
              {bossRelationships.length > 0 ? (
                <div className="forever-map-related-bosses">
                  <span className="eyebrow">Related—not pinned</span>
                  <h3>Boss location evidence</h3>
                  <p>These records identify an area relationship, not an exact spawn point.</p>
                  {bossRelationships.map((boss) => (
                    <Link
                      href={`/forever/encyclopedia/bosses/${boss.creatureId}`}
                      key={boss.creatureId}
                    >
                      <strong>{boss.name}</strong>
                      <small>
                        {boss.evidenceLabel} ·{" "}
                        {boss.requiresReview ? "review required" : "exact map link"}
                      </small>
                    </Link>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </aside>
      </div>
      <p className="forever-map-caption">
        Solid markers and quest regions have coordinates. Area-only boss evidence stays in the
        result panel and is never drawn as a point.
      </p>
    </section>
  );
}

function MapLayerToggle({
  checked,
  label,
  onChange,
}: {
  readonly checked: boolean;
  readonly label: string;
  readonly onChange: (checked: boolean) => void;
}): React.JSX.Element {
  return (
    <label>
      <input
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      {label}
    </label>
  );
}

function layerGroupFor(
  kind: MapMarker["kind"],
  groups: Record<keyof LayerVisibility, LayerGroup>,
): LayerGroup {
  if (kind === "area_poi") return groups.places;
  if (kind === "boss") return groups.bosses;
  if (kind === "taxi") return groups.taxi;
  return groups.quests;
}

function mapKindLabel(kind: MapMarker["kind"]): string {
  if (kind === "boss") return "Boss";
  if (kind === "taxi") return "Flight point";
  if (kind === "quest_poi") return "Quest POI";
  return "Place";
}

function markerSymbol(kind: MapMarker["kind"]): string {
  if (kind === "taxi") return "↗";
  if (kind === "quest_poi") return "!";
  if (kind === "boss") return "◆";
  return "•";
}
