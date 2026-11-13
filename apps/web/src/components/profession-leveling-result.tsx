"use client";
import Link from "next/link";
import { useState } from "react";
import { formatCopper } from "../lib/format";
import type { ProfessionLevelingPlan } from "../lib/profession-leveling-types";
import styles from "./profession-leveling.module.css";

export function ProfessionLevelingResult({
  plan,
}: {
  readonly plan: ProfessionLevelingPlan;
}): React.JSX.Element {
  const [copied, setCopied] = useState<"idle" | "done" | "error">("idle");
  return (
    <>
      <section className={styles.result} aria-label="Profession leveling result">
        <span className="eyebrow">
          {plan.status === "complete" ? "Your leveling plan" : "Partial route"}
        </span>
        <h2>
          Skill {plan.from} → {plan.reached}
          {plan.status === "partial" ? ` of ${plan.target}` : ""}
        </h2>
        <div className={styles.totals}>
          <div>
            <span>Estimated net cost</span>
            <strong>{formatCopper(plan.netCopper ?? plan.totalCopper)}</strong>
          </div>
          <div>
            <span>Shopping &amp; learning budget</span>
            <strong>{formatCopper(plan.totalCopper)}</strong>
          </div>
          <div>
            <span>Expected returns</span>
            <strong>{formatCopper(plan.recoveryCopper ?? "0")}</strong>
          </div>
        </div>
        <p className={styles.note}>
          Materials: {formatCopper(plan.materialCopper)} · Recipes &amp; learning:{" "}
          {formatCopper(plan.recipeCopper)}.
          {plan.recoveryMode === "best"
            ? " Disenchant proceeds are estimates after AH cut and your fee."
            : null}
          {plan.recoveryMode === "none"
            ? " Returns are not deducted."
            : " Net cost deducts the returns below; you still need the shopping budget upfront."}
        </p>
        {plan.status === "partial" ? (
          <p className={styles.warning}>
            The planner cannot quote the rest of this route with the available recipes, learning
            prices, stock and search budget. Check unpriced recipes above or try a shorter range.
          </p>
        ) : null}
        {plan.mode === "expected" ? (
          <p>
            Craft counts include estimated yellow/green skill-ups. Results vary; stop at each skill
            checkpoint and recalculate if you need more crafts.
          </p>
        ) : null}
        <details>
          <summary>How this route is priced</summary>
          <p>
            Compares routes within a bounded search; it does not prove a global minimum. Learning
            fees are paid once, already learned recipes cost nothing to unlock, auction stacks are
            bought whole, and stock is shared across the route. Crafted intermediate items are
            reused. Materials already in your bags are not assumed.
          </p>
          <p>
            Yellow/green estimates use (gray skill − current skill) ÷ (gray skill − yellow skill).
            This planning model is not a verified Forever server probability. Orange-only mode
            avoids that estimate. Vendor reagents are currently priced from AH; profession rank
            upgrades, tools, discounts and travel can change your final spend.
          </p>
          <p>
            {plan.excluded} recipes excluded for missing unlock prices or restrictions.
            {plan.searchLimited ? " Search was narrowed to keep calculation bounded." : ""}
          </p>
        </details>
      </section>
      {plan.recoveries?.length ? (
        <section className={styles.result}>
          <h2>Recover value after crafting</h2>
          <p>Keep ingredients for the full route before disposing of these leftover crafts.</p>
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>Crafted item</th>
                  <th>Quantity</th>
                  <th>Method</th>
                  <th>Expected return</th>
                </tr>
              </thead>
              <tbody>
                {plan.recoveries.map((row) => (
                  <tr key={row.itemId}>
                    <td>
                      <Link href={`/forever/encyclopedia/items/${row.itemId}`}>{row.name}</Link>
                      <small>{row.evidence}</small>
                    </td>
                    <td>{row.quantity}</td>
                    <td>
                      {row.method === "disenchant"
                        ? "Disenchant · sell materials"
                        : "Sell to vendor"}
                    </td>
                    <td>{formatCopper(row.valueCopper)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {plan.steps.length ? (
        <section className={styles.result}>
          <h2>Craft in this order</h2>
          <ol className={styles.steps}>
            {plan.steps.map((step, index) => (
              <li key={`${step.recipeId}:${index}`}>
                <strong>
                  {step.from} → {step.to}
                </strong>
                <div>
                  <Link href={`/forever/encyclopedia/recipes/${step.recipeId}`}>
                    {step.recipeName}
                  </Link>
                  <small>
                    {plan.mode === "expected" ? "About " : ""}
                    {step.crafts} crafts{step.learning ? ` · ${step.learning}` : ""}
                  </small>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {plan.shopping.length ? (
        <section className={styles.result}>
          <div className={styles.heading}>
            <h2>Shopping list</h2>
            <button
              type="button"
              onClick={async (): Promise<void> => {
                try {
                  await navigator.clipboard.writeText(
                    plan.shopping
                      .map(
                        (item) =>
                          `${item.purchased} x ${item.name}${item.recipeQuantity ? " (includes recipe purchase)" : ""}`,
                      )
                      .join("\n"),
                  );
                  setCopied("done");
                } catch {
                  setCopied("error");
                }
              }}
            >
              {copied === "done" ? "Copied" : copied === "error" ? "Copy unavailable" : "Copy list"}
            </button>
          </div>
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Needed</th>
                  <th>Buy</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {plan.shopping.map((item) => (
                  <tr key={item.itemId}>
                    <td>
                      <Link href={`/forever/encyclopedia/items/${item.itemId}`}>{item.name}</Link>
                      {item.recipeQuantity ? (
                        <small>Includes {item.recipeQuantity} recipe purchase</small>
                      ) : null}
                    </td>
                    <td>{item.needed}</td>
                    <td>
                      {item.purchased}
                      {item.purchased > item.needed ? (
                        <small>{item.purchased - item.needed} left over</small>
                      ) : null}
                    </td>
                    <td>{formatCopper(item.costCopper)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {BigInt(plan.recipeCopper) > 0n ? (
            <p className={styles.note}>
              Trainer fees are included in the total and listed in the crafting steps; they are not
              AH shopping-list items.
            </p>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
