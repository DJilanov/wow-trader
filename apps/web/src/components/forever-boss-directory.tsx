"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { ForeverBossDirectoryEntry } from "../lib/forever-world";

interface ForeverBossDirectoryProps {
  readonly bosses: readonly ForeverBossDirectoryEntry[];
}

type BossFilter = "all" | "connected" | "new" | "review";

const filters: readonly { readonly key: BossFilter; readonly label: string }[] = [
  { key: "all", label: "All bosses" },
  { key: "new", label: "Forever IDs" },
  { key: "connected", label: "Connected to content" },
  { key: "review", label: "Needs identity review" },
];

export function ForeverBossDirectory({ bosses }: ForeverBossDirectoryProps): React.JSX.Element {
  const [filter, setFilter] = useState<BossFilter>("all");
  const [query, setQuery] = useState("");
  const filteredBosses = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("en");
    return bosses.filter((boss) => {
      if (filter === "new" && boss.creatureId < 200_000) return false;
      if (
        filter === "connected" &&
        boss.encounterNames.length === 0 &&
        boss.locationNames.length === 0
      ) {
        return false;
      }
      if (filter === "review" && boss.namingState !== "ambiguous") return false;
      if (!normalizedQuery) return true;
      return [
        boss.name,
        boss.contextLabel ?? "",
        boss.creatureId.toString(),
        ...boss.encounterNames,
        ...boss.locationNames,
      ]
        .join(" ")
        .toLocaleLowerCase("en")
        .includes(normalizedQuery);
    });
  }, [bosses, filter, query]);

  return (
    <section className="forever-boss-directory" aria-labelledby="forever-boss-directory-heading">
      <div className="forever-section-heading">
        <div>
          <span className="eyebrow">Criteria-backed creature identities</span>
          <h2 id="forever-boss-directory-heading">Boss directory</h2>
        </div>
        <p>
          Names, encounters, spells, and sources retain separate evidence states. An association is
          not presented as an observed spawn or drop.
        </p>
      </div>
      <div className="forever-directory-controls">
        <label>
          <span className="sr-only">Search bosses</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search boss, instance or creature ID"
            type="search"
            value={query}
          />
        </label>
        <div aria-label="Filter bosses" role="group">
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
        {filteredBosses.length} {filteredBosses.length === 1 ? "boss" : "bosses"}
      </p>
      {filteredBosses.length > 0 ? (
        <div className="forever-boss-grid">
          {filteredBosses.map((boss) => (
            <Link href={`/forever/encyclopedia/bosses/${boss.creatureId}`} key={boss.creatureId}>
              <div className="forever-boss-card-heading">
                <span className={`forever-evidence-dot ${boss.namingState}`} aria-hidden="true" />
                <small>Creature {boss.creatureId}</small>
                {boss.creatureId >= 200_000 ? <b>Forever</b> : null}
              </div>
              <strong>{boss.name}</strong>
              <p>
                {boss.contextLabel ??
                  boss.encounterNames[0] ??
                  boss.locationNames[0] ??
                  "Client achievement criteria"}
              </p>
              <span className="forever-boss-card-stats">
                <span>{boss.encounterNames.length} encounters</span>
                <span>{boss.spellCandidateCount} spell leads</span>
                <span>{boss.sourceCandidateCount} item leads</span>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="forever-world-empty compact">
          <h3>No bosses match</h3>
          <p>Try another name, creature ID, or evidence filter.</p>
        </div>
      )}
    </section>
  );
}
