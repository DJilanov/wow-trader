"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { ForeverInstanceDirectoryEntry } from "../lib/forever-world";

interface ForeverInstanceDirectoryProps {
  readonly instances: readonly ForeverInstanceDirectoryEntry[];
}

type InstanceFilter = "all" | "dungeon" | "raid";

export function ForeverInstanceDirectory({
  instances,
}: ForeverInstanceDirectoryProps): React.JSX.Element {
  const [filter, setFilter] = useState<InstanceFilter>("all");
  const [query, setQuery] = useState("");
  const filteredInstances = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("en");
    return instances.filter((instance) => {
      if (filter === "dungeon" && instance.instanceType !== 1) return false;
      if (filter === "raid" && instance.instanceType !== 2) return false;
      if (!normalizedQuery) return true;
      return `${instance.name} ${instance.description} ${instance.mapId}`
        .toLocaleLowerCase("en")
        .includes(normalizedQuery);
    });
  }, [filter, instances, query]);

  return (
    <section aria-labelledby="forever-instance-directory-heading">
      <div className="forever-section-heading">
        <div>
          <span className="eyebrow">One row per playable encounter name</span>
          <h2 id="forever-instance-directory-heading">Instance directory</h2>
        </div>
        <p>Difficulty variants are grouped and remain available as evidence on each instance.</p>
      </div>
      <div className="forever-directory-controls">
        <label>
          <span className="sr-only">Search instances</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search dungeons, raids or map ID"
            type="search"
            value={query}
          />
        </label>
        <div aria-label="Filter instances" role="group">
          {(["all", "dungeon", "raid"] as const).map((key) => (
            <button
              aria-pressed={filter === key}
              key={key}
              onClick={() => setFilter(key)}
              type="button"
            >
              {key === "all" ? "All instances" : key === "dungeon" ? "Dungeons" : "Raids"}
            </button>
          ))}
        </div>
      </div>
      <p className="forever-directory-count" aria-live="polite">
        {filteredInstances.length} {filteredInstances.length === 1 ? "instance" : "instances"}
      </p>
      {filteredInstances.length > 0 ? (
        <div className="forever-instance-directory">
          {filteredInstances.map((instance) => (
            <Link href={`/forever/encyclopedia/instances/${instance.mapId}`} key={instance.mapId}>
              <div>
                <small>
                  Map {instance.mapId} · {instanceTypeLabel(instance.instanceType)} ·{" "}
                  {instance.difficultyCount}{" "}
                  {instance.difficultyCount === 1 ? "difficulty" : "difficulties"}
                </small>
                <strong>{instance.name}</strong>
                <p>{instance.description || "No client instance description is shipped."}</p>
                {instance.bossCount > 0 ? (
                  <em>{instance.bossCount} criteria-backed boss identities</em>
                ) : null}
              </div>
              <span>
                <b>{instance.encounterCount}</b>
                encounters
                {instance.rawEncounterCount > instance.encounterCount ? (
                  <small>{instance.rawEncounterCount} variants</small>
                ) : null}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="forever-world-empty compact">
          <h3>No instances match</h3>
          <p>Try another name, map ID, or content type.</p>
        </div>
      )}
    </section>
  );
}

function instanceTypeLabel(instanceType: number): string {
  if (instanceType === 1) return "Dungeon";
  if (instanceType === 2) return "Raid";
  if (instanceType === 3) return "Battleground";
  if (instanceType === 4) return "Arena";
  return "Instanced content";
}
