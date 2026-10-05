"use client";

import { useState } from "react";
import { levelingRewardPreviewSchema, type LevelingRewardPreview } from "../lib/leveling-rewards";

interface PreviewProps {
  readonly itemId: number;
  readonly name: string;
}
type PreviewState =
  | { readonly kind: "idle" | "loading" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "ready"; readonly item: LevelingRewardPreview };
export function LevelingRewardPreviewCard({ itemId, name }: PreviewProps): React.JSX.Element {
  const [state, setState] = useState<PreviewState>({ kind: "idle" });
  async function load(): Promise<void> {
    if (state.kind === "loading" || state.kind === "ready") return;
    setState({ kind: "loading" });
    try {
      const response = await fetch(`/api/v1/leveling-rewards/${itemId}`, {
        credentials: "same-origin",
        signal: AbortSignal.timeout(15000),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const error =
          body && typeof body === "object" && "error" in body && typeof body.error === "string"
            ? body.error
            : "Item preview unavailable.";
        setState({ kind: "error", message: error });
        return;
      }
      const item = levelingRewardPreviewSchema.parse(body);
      if (item.itemId !== itemId) throw new Error("Reward preview identity mismatch");
      setState({ kind: "ready", item });
    } catch {
      setState({
        kind: "error",
        message: "Could not load current item stats. Retry or open Wowhead; no value is assumed.",
      });
    }
  }
  return (
    <details
      onToggle={(event) => {
        if (event.currentTarget.open) void load();
      }}
    >
      <summary>Item stats: {name}</summary>
      {state.kind === "loading" && <p role="status">Loading published item stats…</p>}
      {state.kind === "error" && (
        <>
          <p role="status">{state.message}</p>
          <button type="button" onClick={() => void load()}>
            Retry item preview
          </button>
        </>
      )}
      {state.kind === "ready" && (
        <div className="wow-tooltip">
          <p className="wow-tooltip-name">{state.item.name}</p>
          <p>{state.item.binding}</p>
          <p>
            {state.item.slot} · Requires level {state.item.requiredLevel}
          </p>
          {state.item.armor !== null && <p>{state.item.armor} Armor</p>}
          {state.item.weaponDps !== null && (
            <p>{state.item.weaponDps.toFixed(1)} damage per second (derived)</p>
          )}
          {state.item.stats.map((stat, index) => (
            <p key={`${index}-${stat}`}>{stat}</p>
          ))}
          <p>
            Vendor value: {(state.item.vendorCopper / 10_000).toFixed(4)}g. Keeping the reward does
            not also earn this cash.
          </p>
          <p className="wow-tooltip-muted">
            Client build {state.item.build}. Item stats are not proof of this quest's current
            rewards or a gear upgrade.
          </p>
        </div>
      )}
    </details>
  );
}
