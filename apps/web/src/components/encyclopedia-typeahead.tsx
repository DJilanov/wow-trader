"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { EncyclopediaSection } from "../lib/encyclopedia";

const SEARCH_DELAY_MS = 250;
const MAX_QUERY_LENGTH = 120;

interface EncyclopediaTypeaheadProps {
  readonly initialQuery: string;
  readonly section: EncyclopediaSection;
}

export function EncyclopediaTypeahead({
  initialQuery,
  section,
}: EncyclopediaTypeaheadProps): React.JSX.Element {
  const router = useRouter();
  const [draft, setDraft] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();
  const hasSynchronized = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const lastNavigation = useRef<string | null>(null);
  const normalizedDraft = normalizeQuery(draft);
  const isUpdating = isPending || normalizedDraft !== initialQuery;

  useEffect(() => {
    if (!hasSynchronized.current) {
      hasSynchronized.current = true;
      const hydratedValue = input.current?.value;
      if (hydratedValue !== undefined && normalizeQuery(hydratedValue) !== initialQuery) {
        setDraft(hydratedValue);
      }
      return;
    }
    if (initialQuery === lastNavigation.current) {
      lastNavigation.current = null;
      return;
    }
    setDraft(initialQuery);
    if (input.current) input.current.value = initialQuery;
  }, [initialQuery]);

  const navigate = useCallback(
    (query: string): void => {
      const normalizedQuery = normalizeQuery(query);
      if (normalizedQuery === initialQuery) return;

      const search = new URLSearchParams();
      if (normalizedQuery) search.set("q", normalizedQuery);
      if (section !== "all") search.set("type", section);
      const suffix = search.toString();

      lastNavigation.current = normalizedQuery;
      startTransition(() => {
        router.replace(suffix ? `/tbc/encyclopedia?${suffix}` : "/tbc/encyclopedia", {
          scroll: false,
        });
      });
    },
    [initialQuery, router, section],
  );

  useEffect(() => {
    if (normalizedDraft === initialQuery) return;
    const timeout = window.setTimeout(() => navigate(draft), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [draft, initialQuery, navigate, normalizedDraft]);

  return (
    <form
      className="encyclopedia-search"
      onSubmit={(event) => {
        event.preventDefault();
        navigate(input.current?.value ?? draft);
      }}
      role="search"
    >
      <label htmlFor="encyclopedia-query">Search the archive</label>
      <div>
        <input
          aria-describedby="encyclopedia-search-help encyclopedia-search-status"
          autoComplete="off"
          autoFocus={false}
          defaultValue={initialQuery}
          id="encyclopedia-query"
          maxLength={MAX_QUERY_LENGTH}
          name="q"
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Arcane Crystal, Transmute Undeath, 17563…"
          ref={input}
          spellCheck={false}
          type="search"
        />
        <div className="encyclopedia-search-actions">
          <span
            aria-live="polite"
            className={isUpdating ? "updating" : undefined}
            id="encyclopedia-search-status"
            role="status"
          >
            <span aria-hidden="true" />
            {isUpdating ? "Updating…" : "Live search"}
          </span>
          {draft ? (
            <button
              onClick={() => {
                if (input.current) input.current.value = "";
                setDraft("");
              }}
              type="button"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>
      <small id="encyclopedia-search-help">
        Results update as you type. Names require 2 characters; exact positive IDs work immediately.
      </small>
    </form>
  );
}

function normalizeQuery(query: string): string {
  return query.trim().slice(0, MAX_QUERY_LENGTH);
}
