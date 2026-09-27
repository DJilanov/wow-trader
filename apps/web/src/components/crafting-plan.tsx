"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  craftingPlanStorageKey,
  createCraftingPlanEntry,
  parseCraftingPlan,
  serializeCraftingPlan,
  summarizeCraftingPlan,
  upsertCraftingPlanEntry,
  type CraftingPlanEntry,
} from "../lib/crafting-plan";
import { formatCopper } from "../lib/format";
import type { SupportedClientProduct } from "../lib/game-versions";

const PLAN_UPDATED_EVENT = "wow-trader:crafting-plan-updated";

interface CraftingPlanContext {
  readonly clientProduct: SupportedClientProduct;
  readonly market: string;
}

export function AddToCraftingPlanButton({
  clientProduct,
  market,
  opportunity,
}: CraftingPlanContext & {
  readonly opportunity: Parameters<typeof createCraftingPlanEntry>[0];
}): React.JSX.Element {
  const [status, setStatus] = useState<"idle" | "added" | "error">("idle");

  return (
    <button
      className="plan-add-button"
      onClick={() => {
        try {
          const key = craftingPlanStorageKey(clientProduct, market);
          const entries = parseCraftingPlan(window.localStorage.getItem(key));
          const entry = createCraftingPlanEntry(opportunity, clientProduct, market);
          window.localStorage.setItem(
            key,
            serializeCraftingPlan(upsertCraftingPlanEntry(entries, entry)),
          );
          window.dispatchEvent(new Event(PLAN_UPDATED_EVENT));
          setStatus("added");
        } catch {
          setStatus("error");
        }
      }}
      type="button"
    >
      {status === "added"
        ? "Added to plan"
        : status === "error"
          ? "Storage unavailable"
          : "Plan " + opportunity.executableCrafts + " crafts"}
    </button>
  );
}

export function CraftingPlanPanel({
  clientProduct,
  market,
}: CraftingPlanContext): React.JSX.Element | null {
  const [entries, setEntries] = useState<readonly CraftingPlanEntry[]>([]);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const storageKey = useMemo(
    () => craftingPlanStorageKey(clientProduct, market),
    [clientProduct, market],
  );
  const reload = useCallback((): void => {
    try {
      setEntries(parseCraftingPlan(window.localStorage.getItem(storageKey)));
    } catch {
      setEntries([]);
    }
  }, [storageKey]);

  useEffect(() => {
    reload();
    window.addEventListener(PLAN_UPDATED_EVENT, reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener(PLAN_UPDATED_EVENT, reload);
      window.removeEventListener("storage", reload);
    };
  }, [reload]);

  const totals = useMemo(() => summarizeCraftingPlan(entries), [entries]);
  if (entries.length === 0) return null;

  const shoppingList = totals.materials
    .map((material) => material.quantity + "× " + material.name)
    .join("\n");

  return (
    <aside className="crafting-plan-dock" aria-label="Saved crafting plan">
      <details>
        <summary>
          <span>
            <strong>Crafting plan</strong>
            <small>
              {entries.length} {entries.length === 1 ? "recipe" : "recipes"} ·{" "}
              {formatCopper(totals.capitalCopper)} capital · +{formatCopper(totals.profitCopper)}{" "}
              quoted profit
            </small>
          </span>
          <span aria-hidden="true">View plan ↑</span>
        </summary>
        <div className="crafting-plan-body">
          <div className="crafting-plan-recipes">
            <h2>Execution order</h2>
            {entries.map((entry) => (
              <article key={entry.id}>
                <div>
                  <strong>
                    {entry.crafts}× {entry.outputLabel}
                  </strong>
                  <small>
                    {entry.professionName} · {entry.routeLabel} · +
                    {formatCopper(entry.profitCopper)} · scan{" "}
                    {new Date(entry.quoteCapturedAt).toLocaleString()}
                  </small>
                </div>
                <button
                  aria-label={"Remove " + entry.outputLabel + " from plan"}
                  onClick={() => {
                    const next = entries.filter((candidate) => candidate.id !== entry.id);
                    window.localStorage.setItem(storageKey, serializeCraftingPlan(next));
                    window.dispatchEvent(new Event(PLAN_UPDATED_EVENT));
                  }}
                  type="button"
                >
                  Remove
                </button>
                {entry.craftSteps.length > 0 ? (
                  <ol>
                    {entry.craftSteps.map((step, index) => (
                      <li key={entry.id + ":" + step.recipeSpellId + ":" + index}>
                        {step.professionName}: craft {step.crafts}× {step.recipeName}
                      </li>
                    ))}
                  </ol>
                ) : null}
              </article>
            ))}
          </div>
          <div className="crafting-plan-shopping">
            <h2>Combined shopping list</h2>
            <ul>
              {totals.materials.map((material) => (
                <li key={material.itemId}>
                  <strong>{material.quantity}×</strong> {material.name}
                </li>
              ))}
            </ul>
            <div className="crafting-plan-actions">
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(shoppingList).then(
                    () => setCopyStatus("copied"),
                    () => setCopyStatus("error"),
                  );
                }}
                type="button"
              >
                {copyStatus === "copied"
                  ? "Copied"
                  : copyStatus === "error"
                    ? "Copy failed"
                    : "Copy shopping list"}
              </button>
              <button
                onClick={() => {
                  window.localStorage.removeItem(storageKey);
                  window.dispatchEvent(new Event(PLAN_UPDATED_EVENT));
                }}
                type="button"
              >
                Clear plan
              </button>
            </div>
            <p>
              Totals combine standalone live quotes. Overlapping purchases, demand, deposits, and
              sale probability are not portfolio-optimized yet.
            </p>
          </div>
        </div>
      </details>
    </aside>
  );
}
