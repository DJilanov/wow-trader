"use client";

import { useId, useState } from "react";
import type { LocalSimulatorBuildReview } from "../lib/forever-simulator-local-reviews";
import { ForeverSimulatorFrame } from "./forever-simulator-frame";

interface ForeverSimulatorReviewedWorkspaceProps {
  readonly src: string;
  readonly title: string;
  readonly builds: readonly LocalSimulatorBuildReview[];
}
interface LoadedBuild {
  readonly id: string;
  readonly href: string;
  readonly revision: number;
}

function buildLabel(build: LocalSimulatorBuildReview): string {
  const variant = build.spec.split("/")[1]?.replaceAll("_", " ") ?? build.spec;
  const name = variant.charAt(0).toUpperCase() + variant.slice(1);
  const faction = build.faction.charAt(0).toUpperCase() + build.faction.slice(1);
  return `${name} · ${faction} · ${build.requiresProvisionalEnchantOptIn ? "Provisional proc enchants" : "Standard enchants"}`;
}

export function ForeverSimulatorReviewedWorkspace({
  src,
  title,
  builds,
}: ForeverSimulatorReviewedWorkspaceProps): React.JSX.Element {
  const selectId = useId();
  const [selectedId, setSelectedId] = useState(builds[0]?.id ?? "");
  const [loadedBuild, setLoadedBuild] = useState<LoadedBuild | null>(null);
  const selected = builds.find((build) => build.id === selectedId) ?? builds[0];

  function loadBuild(): void {
    const href = selected?.href;
    if (!selected || !href) return;
    setLoadedBuild((previous) => ({
      id: selected.id,
      href,
      revision: (previous?.revision ?? 0) + 1,
    }));
  }

  return (
    <>
      {selected ? (
        <section className="simulator-reviewed-builds" aria-label="Reviewed pre-raid builds">
          <div className="simulator-reviewed-heading">
            <div>
              <span className="eyebrow">Local research · Reviewed calculations</span>
              <h2>Simulation-tested pre-raid builds</h2>
            </div>
            <span className="simulator-reviewed-count">
              {builds.length} {builds.length === 1 ? "build" : "builds"} ready
            </span>
          </div>
          <div className="simulator-reviewed-controls">
            <label htmlFor={selectId}>Choose a build</label>
            <select
              id={selectId}
              value={selected.id}
              onChange={(event) => setSelectedId(event.currentTarget.value)}
              aria-describedby={`${selectId}-warning`}
            >
              {builds.map((build) => (
                <option key={build.id} value={build.id}>
                  {buildLabel(build)}
                </option>
              ))}
            </select>
            <button type="button" className="button" onClick={loadBuild} disabled={!selected.href}>
              Load build
            </button>
          </div>
          <p id={`${selectId}-warning`} className="simulator-reviewed-warning">
            Save your current character first. Loading replaces gear, enchants, talents, rotation,
            race, professions, buffs, consumes and encounter settings in this browser.
          </p>
          {selected.referenceDps !== null ? (
            <p className="simulator-reviewed-reference">
              {selected.referenceDps.toFixed(2)} modeled DPS · 400,000 core-feedback measurements ·
              Scenario-specific, not a cross-class ranking.
            </p>
          ) : null}
          {selected.requiresProvisionalEnchantOptIn ? (
            <p className="simulator-reviewed-warning">
              Provisional proc models remain OFF. After loading, open Main Hand → Change enchant and
              explicitly allow provisional proc models before simulating this scenario. Repeat after
              a reload; the build never enables them automatically.
            </p>
          ) : null}
          {selected.warnings.length ? (
            <details className="simulator-reviewed-assumptions" key={selected.id}>
              <summary>Build assumptions and acquisition limits</summary>
              <ul>
                {selected.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <p role="status" className="simulator-reviewed-status">
            {loadedBuild?.id === selected.id
              ? "Reviewed setup selected for the engine below. Loading never starts a simulation."
              : "Choose Load build to apply this setup to the engine below."}
          </p>
        </section>
      ) : null}
      <ForeverSimulatorFrame
        key={`${loadedBuild?.id ?? "saved"}:${loadedBuild?.revision ?? 0}`}
        src={loadedBuild?.href ?? src}
        title={title}
      />
    </>
  );
}
