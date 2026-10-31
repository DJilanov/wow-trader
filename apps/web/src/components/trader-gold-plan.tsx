"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import type { GoldPlanView } from "../lib/trader-gold-plan";
import { withHelperBasePath } from "../lib/site-path";
import styles from "./trader-account.module.css";
import { goldPlanViewSchema } from "../lib/trader-gold-plan-view";

export function TraderGoldPlan({
  product,
  initialMarket,
  markets,
}: {
  readonly product: "wow_classic_beta" | "wow_anniversary";
  readonly initialMarket: string;
  readonly markets: readonly { readonly value: string; readonly label: string }[];
}): React.JSX.Element {
  const [result, setResult] = useState<GoldPlanView | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const response = await fetch(withHelperBasePath("/api/trader/gold-plan"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          product,
          market: String(form.get("market")),
          budget: String(form.get("budget")),
          mode: String(form.get("mode")),
          useInventory: form.get("inventory") === "on",
        }),
      });
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? "Please wait a minute before generating another plan."
            : "The plan could not be generated. Check the market and budget, then retry.",
        );
      setResult(goldPlanViewSchema.parse(await response.json()));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Planning is unavailable.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.shell}>
      <header>
        <span className="eyebrow">One budget · all your alts</span>
        <h1>My gold plan</h1>
        <p>
          Combine qualified buying opportunities with recipes your characters know. Each step shares
          the same gold, auction stock and available materials.
        </p>
      </header>
      <form className={styles.form} onSubmit={(event) => void submit(event)} aria-busy={busy}>
        <label>
          Starting budget (gold)
          <input
            name="budget"
            type="number"
            min="0"
            max="999999999"
            step="0.0001"
            defaultValue="100"
            required
          />
        </label>
        <label>
          Auction House
          <select name="market" defaultValue={initialMarket} required>
            {markets.map((market) => (
              <option value={market.value} key={market.value}>
                {market.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Actions
          <select name="mode" defaultValue="both">
            <option value="both">Buy and craft</option>
            <option value="buy">Buy for resale</option>
            <option value="craft">Craft, disenchant or vendor</option>
          </select>
        </label>
        <label className={styles.check}>
          <input type="checkbox" name="inventory" defaultChecked /> Use freshly observed character
          materials
        </label>
        <button type="submit" disabled={busy || markets.length === 0}>
          {busy ? "Calculating your plan…" : "Build my plan"}
        </button>
      </form>
      <p className="muted">
        Connect Companion and open each profession in game to include your known recipes. Inventory
        older than one hour is excluded. Owned materials carry their resale value; future sales
        never fund later purchases in the plan.
      </p>
      <Link href={withHelperBasePath("/forever/trader/account")}>
        Manage characters and connection →
      </Link>
      {error ? <p role="alert">{error}</p> : null}
      {busy ? (
        <p role="status">Checking auction stacks, shared materials and your upfront budget…</p>
      ) : null}
      {result ? (
        <div aria-live="polite">
          <p className="workspace-limitation">{result.message}</p>
          <dl className={styles.facts}>
            <div>
              <dt>Budget</dt>
              <dd>{result.budget}</dd>
            </div>
            <div>
              <dt>Purchase spending</dt>
              <dd>{result.spent}</dd>
            </div>
            <div>
              <dt>Gold left</dt>
              <dd>{result.remaining}</dd>
            </div>
            <div>
              <dt>Owned materials valued</dt>
              <dd>{result.ownedValue}</dd>
            </div>
            <div>
              <dt>Conditional profit before deposits</dt>
              <dd>{result.expectedProfit}</dd>
            </div>
            <div>
              <dt>Matching characters</dt>
              <dd>{result.charactersUsed}</dd>
            </div>
          </dl>
          <ol className={styles.list}>
            {result.actions.map((action, index) => (
              <li key={`${index}:${action.name}`}>
                <article className={styles.panel}>
                  <span className="eyebrow">
                    {action.kind === "buy" ? "Buy for resale" : action.kind.replaceAll("_", " ")}
                  </span>
                  <h2>{action.name}</h2>
                  <p>{action.detail}</p>
                  {action.purchases.length ? (
                    <ul>
                      {action.purchases.map((purchase, i) => (
                        <li key={`${i}:${purchase.itemId}`}>
                          {purchase.stacks} {purchase.stacks === 1 ? "stack" : "stacks"} of{" "}
                          {purchase.stackSize} {purchase.name} · {purchase.price} per auction
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No additional auction purchase is needed for this step.</p>
                  )}
                  {action.ownedInputs.length ? (
                    <p>
                      From existing stock:{" "}
                      {action.ownedInputs.map((row) => `${row.quantity} ${row.name}`).join(", ")}
                    </p>
                  ) : null}
                  <p>
                    Spend {action.spent} · owned material value {action.ownedValue} · conditional
                    profit {action.profit}
                  </p>
                </article>
              </li>
            ))}
          </ol>
          <p className="muted">
            This is a bounded suggested plan using observed listings. Recheck auction availability
            and character stock before acting. Sell-through and unobserved deposits remain unknown.
          </p>
        </div>
      ) : null}
    </section>
  );
}
