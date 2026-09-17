"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { ForeverMapDirectoryEntry } from "../lib/forever-world";

interface ForeverMapDirectoryProps {
  readonly buildNumber: number;
  readonly maps: readonly ForeverMapDirectoryEntry[];
}

type MapFilter = "all" | "eastern-kingdoms" | "kalimdor" | "new" | "special";

const filters: readonly { readonly key: MapFilter; readonly label: string }[] = [
  { key: "all", label: "All maps" },
  { key: "new", label: "New areas" },
  { key: "kalimdor", label: "Kalimdor" },
  { key: "eastern-kingdoms", label: "Eastern Kingdoms" },
  { key: "special", label: "Instances & special" },
];

export function ForeverMapDirectory({
  buildNumber,
  maps,
}: ForeverMapDirectoryProps): React.JSX.Element {
  const [filter, setFilter] = useState<MapFilter>("all");
  const [query, setQuery] = useState("");
  const playerFacingMaps = useMemo(() => maps.filter((map) => map.system === 0), [maps]);
  const filteredMaps = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("en");
    return playerFacingMaps
      .filter((map) => matchesFilter(map, filter))
      .filter((map) => {
        if (!normalizedQuery) return true;
        return `${map.name} ${map.parentName ?? ""} ${map.uiMapId}`
          .toLocaleLowerCase("en")
          .includes(normalizedQuery);
      })
      .sort(
        (left, right) =>
          Number(right.featured) - Number(left.featured) || left.name.localeCompare(right.name),
      );
  }, [filter, playerFacingMaps, query]);

  const featuredMaps = filteredMaps.filter((map) => map.featured);
  const directoryMaps = filteredMaps.filter((map) => !map.featured);

  return (
    <section className="forever-map-directory" aria-labelledby="forever-map-directory-heading">
      <div className="forever-section-heading">
        <div>
          <span className="eyebrow">Continents, zones and special maps</span>
          <h2 id="forever-map-directory-heading">Explore the world</h2>
        </div>
        <p>
          Search player-facing client maps. Alternate internal map systems stay hidden from this
          directory.
        </p>
      </div>
      <div className="forever-directory-controls">
        <label>
          <span className="sr-only">Search maps</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search maps, zones or map ID"
            type="search"
            value={query}
          />
        </label>
        <div aria-label="Filter maps" role="group">
          {filters.map((entry) => (
            <button
              aria-pressed={filter === entry.key}
              key={entry.key}
              onClick={() => setFilter(entry.key)}
              type="button"
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>
      <p className="forever-directory-count" aria-live="polite">
        {filteredMaps.length} {filteredMaps.length === 1 ? "map" : "maps"}
      </p>
      {featuredMaps.length > 0 ? (
        <div className="forever-map-directory-group">
          <div className="forever-map-directory-title">
            <span className="eyebrow">Forever discoveries</span>
            <h3>New and featured maps</h3>
          </div>
          <div className="forever-map-preview-grid featured">
            {featuredMaps.map((map) => (
              <MapCard buildNumber={buildNumber} map={map} key={map.uiMapId} />
            ))}
          </div>
        </div>
      ) : null}
      {directoryMaps.length > 0 ? (
        <div className="forever-map-directory-group">
          <div className="forever-map-directory-title">
            <span className="eyebrow">Client map archive</span>
            <h3>{featuredMaps.length > 0 ? "More maps" : "Maps"}</h3>
          </div>
          <div className="forever-map-preview-grid">
            {directoryMaps.map((map) => (
              <MapCard buildNumber={buildNumber} map={map} key={map.uiMapId} />
            ))}
          </div>
        </div>
      ) : null}
      {filteredMaps.length === 0 ? (
        <div className="forever-world-empty compact">
          <h3>No maps match</h3>
          <p>Try another name or select a different region.</p>
        </div>
      ) : null}
    </section>
  );
}

function MapCard({
  buildNumber,
  map,
}: {
  readonly buildNumber: number;
  readonly map: ForeverMapDirectoryEntry;
}): React.JSX.Element {
  const style = map.previewFileDataId
    ? ({
        "--forever-map-preview": `url("/api/forever-map-media/${map.previewFileDataId}?v=${buildNumber}")`,
      } as React.CSSProperties)
    : undefined;
  return (
    <Link
      className={map.hasArt ? "has-art" : "no-art"}
      href={`/forever/encyclopedia/maps/${map.uiMapId}`}
      style={style}
    >
      <span className="forever-map-preview-art" aria-hidden="true" />
      <span className="forever-map-preview-content">
        <small>{map.parentName ?? `UI map ${map.uiMapId}`}</small>
        <strong>{map.name}</strong>
        <span>
          {map.markerCount > 0 ? `${map.markerCount} locations` : "No mapped locations"}
          {map.questCount > 0 ? ` · ${map.questCount} quests` : ""}
        </span>
      </span>
      <b aria-hidden="true">→</b>
    </Link>
  );
}

function matchesFilter(map: ForeverMapDirectoryEntry, filter: MapFilter): boolean {
  if (filter === "all") return true;
  if (filter === "new") return map.featured;
  const hierarchy = `${map.name} ${map.parentName ?? ""}`.toLocaleLowerCase("en");
  if (filter === "kalimdor") return hierarchy.includes("kalimdor");
  if (filter === "eastern-kingdoms") return hierarchy.includes("eastern kingdoms");
  return !hierarchy.includes("kalimdor") && !hierarchy.includes("eastern kingdoms");
}
