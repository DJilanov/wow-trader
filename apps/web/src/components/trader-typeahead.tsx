"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const SEARCH_DELAY_MS = 400;
const MAX_QUERY_LENGTH = 120;

interface MarketOption {
  readonly label: string;
  readonly value: string;
}

interface TraderTypeaheadProps {
  readonly initialMarket: string;
  readonly initialQuery: string;
  readonly markets: readonly MarketOption[];
}

interface NavigationState {
  readonly market: string;
  readonly query: string;
}

export function TraderTypeahead({
  initialMarket,
  initialQuery,
  markets,
}: TraderTypeaheadProps): React.JSX.Element {
  const router = useRouter();
  const [draftMarket, setDraftMarket] = useState(initialMarket);
  const [draftQuery, setDraftQuery] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();
  const hasSynchronized = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const lastNavigation = useRef<NavigationState | null>(null);
  const normalizedQuery = normalizeQuery(draftQuery);
  const isUpdating = isPending || normalizedQuery !== initialQuery || draftMarket !== initialMarket;

  useEffect(() => {
    if (!hasSynchronized.current) {
      hasSynchronized.current = true;
      const hydratedValue = input.current?.value;
      if (hydratedValue !== undefined && normalizeQuery(hydratedValue) !== initialQuery) {
        setDraftQuery(hydratedValue);
      }
      return;
    }
    const navigation = lastNavigation.current;
    if (navigation?.query === initialQuery && navigation.market === initialMarket) {
      lastNavigation.current = null;
      return;
    }
    setDraftQuery(initialQuery);
    if (input.current) input.current.value = initialQuery;
    setDraftMarket(initialMarket);
  }, [initialMarket, initialQuery]);

  const navigate = useCallback(
    (query: string, market: string): void => {
      const nextState: NavigationState = { query: normalizeQuery(query), market };
      if (nextState.query === initialQuery && nextState.market === initialMarket) return;

      const search = new URLSearchParams(window.location.search);
      if (nextState.query) search.set("q", nextState.query);
      else search.delete("q");
      if (nextState.market) search.set("market", nextState.market);
      else search.delete("market");

      lastNavigation.current = nextState;
      startTransition(() => {
        const suffix = search.toString();
        router.replace(suffix ? `/tbc/trader?${suffix}` : "/tbc/trader", { scroll: false });
      });
    },
    [initialMarket, initialQuery, router],
  );

  useEffect(() => {
    if (normalizedQuery === initialQuery) return;
    const timeout = window.setTimeout(() => navigate(draftQuery, draftMarket), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [draftMarket, draftQuery, initialQuery, navigate, normalizedQuery]);

  return (
    <form
      className="workspace-search"
      onSubmit={(event) => {
        event.preventDefault();
        navigate(input.current?.value ?? draftQuery, draftMarket);
      }}
      role="search"
    >
      <label className="search-field" htmlFor="workspace-query">
        <span>Product name</span>
        <input
          aria-describedby="workspace-search-status"
          autoComplete="off"
          defaultValue={initialQuery}
          id="workspace-query"
          maxLength={MAX_QUERY_LENGTH}
          name="q"
          onChange={(event) => setDraftQuery(event.target.value)}
          placeholder="Search Arcanite Bar, Runic Leather Bracers…"
          ref={input}
          spellCheck={false}
          type="search"
        />
      </label>
      <label className="market-field" htmlFor="workspace-market">
        <span>Market</span>
        <select
          id="workspace-market"
          name="market"
          onChange={(event) => {
            const market = event.target.value;
            setDraftMarket(market);
            navigate(input.current?.value ?? draftQuery, market);
          }}
          value={draftMarket}
        >
          {markets.length === 0 ? <option value="">No scans available</option> : null}
          {markets.map((market) => (
            <option key={market.value} value={market.value}>
              {market.label}
            </option>
          ))}
        </select>
      </label>
      <div className="workspace-search-actions">
        <span
          aria-live="polite"
          className={isUpdating ? "updating" : undefined}
          id="workspace-search-status"
          role="status"
        >
          <span aria-hidden="true" />
          {isUpdating ? "Updating…" : "Live search"}
        </span>
        {draftQuery ? (
          <button
            onClick={() => {
              if (input.current) input.current.value = "";
              setDraftQuery("");
            }}
            type="button"
          >
            Clear
          </button>
        ) : null}
      </div>
    </form>
  );
}

function normalizeQuery(query: string): string {
  return query.trim().slice(0, MAX_QUERY_LENGTH);
}
