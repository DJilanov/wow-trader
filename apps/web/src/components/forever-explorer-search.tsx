"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { ForeverSearchEntry } from "../lib/forever-world";

interface ForeverExplorerSearchProps {
  readonly entries: readonly ForeverSearchEntry[];
}

const typeOrder = ["map", "instance", "boss"] as const;

export function ForeverExplorerSearch({ entries }: ForeverExplorerSearchProps): React.JSX.Element {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase("en");
  const results = useMemo(() => {
    if (!normalizedQuery) return [];
    return entries
      .filter((entry) => entry.searchText.toLocaleLowerCase("en").includes(normalizedQuery))
      .sort(
        (left, right) => scoreResult(left, normalizedQuery) - scoreResult(right, normalizedQuery),
      )
      .slice(0, 18);
  }, [entries, normalizedQuery]);

  return (
    <section className="forever-explorer-search" aria-labelledby="forever-explorer-search-heading">
      <div>
        <span className="eyebrow">World Explorer</span>
        <h2 id="forever-explorer-search-heading">Where do you want to go?</h2>
        <p>Search maps, dungeons, raids, bosses, and exact IDs from one place.</p>
      </div>
      <label>
        <span aria-hidden="true">⌕</span>
        <span className="sr-only">Search the Forever World Explorer</span>
        <input
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Try Zephras Isle, City of Dalaran, or creature 250079"
          type="search"
          value={query}
        />
      </label>
      {normalizedQuery ? (
        <div className="forever-explorer-results" aria-live="polite">
          {results.length > 0 ? (
            typeOrder.map((type) => {
              const group = results.filter((entry) => entry.type === type);
              if (group.length === 0) return null;
              return (
                <div key={type}>
                  <h3>{searchTypeLabel(type)}</h3>
                  {group.map((entry) => (
                    <Link href={entry.href} key={entry.id}>
                      <span>{entry.title}</span>
                      <small>{entry.context}</small>
                      <b aria-hidden="true">→</b>
                    </Link>
                  ))}
                </div>
              );
            })
          ) : (
            <p>No maps, instances, or boss identities match “{query.trim()}”.</p>
          )}
        </div>
      ) : (
        <div className="forever-explorer-shortcuts" aria-label="World Explorer shortcuts">
          <Link href="/forever/encyclopedia/maps">Explore maps</Link>
          <Link href="/forever/encyclopedia/instances">Browse instances</Link>
          <Link href="/forever/encyclopedia/bosses">Find bosses</Link>
          <Link href="/forever/encyclopedia/quests">Quest index</Link>
        </div>
      )}
    </section>
  );
}

function scoreResult(entry: ForeverSearchEntry, query: string): number {
  const title = entry.title.toLocaleLowerCase("en");
  if (title === query) return 0;
  if (title.startsWith(query)) return 1;
  if (title.includes(query)) return 2;
  return 3;
}

function searchTypeLabel(type: ForeverSearchEntry["type"]): string {
  if (type === "map") return "Maps";
  if (type === "instance") return "Instances";
  return "Bosses";
}
