"use client";

import { useCallback, useId, useState } from "react";
import type { LocalSimulatorBuildReview } from "../lib/forever-simulator-local-reviews";
import { ForeverSimulatorFrame } from "./forever-simulator-frame";
import { withHelperBasePath } from "../lib/site-path";
import { rotationGuidanceText } from "../lib/forever-simulator-rotation-guidance";
import {
  simulatorBuildForPreset,
  simulatorBuildLabel,
} from "../lib/forever-simulator-build-selection";

interface ForeverSimulatorReviewedWorkspaceProps {
  readonly src: string;
  readonly title: string;
  readonly builds: readonly LocalSimulatorBuildReview[];
  readonly initialBuildId?: string | undefined;
}
interface LoadedBuild {
  readonly id: string;
  readonly href: string;
  readonly revision: number;
}

export function ForeverSimulatorReviewedWorkspace({
  src,
  title,
  builds,
  initialBuildId,
}: ForeverSimulatorReviewedWorkspaceProps): React.JSX.Element {
  const selectId = useId();
  const [selectedId, setSelectedId] = useState(initialBuildId ?? builds[0]?.id ?? "");
  const [loadedBuild, setLoadedBuild] = useState<LoadedBuild | null>(null);
  const [enginePreset, setEnginePreset] = useState<string | null>(null);
  const selected = builds.find((build) => build.id === selectedId);
  const selectEnginePreset = useCallback(
    (name: string): void => {
      setSelectedId(simulatorBuildForPreset(builds, name)?.id ?? "");
      setEnginePreset(name);
    },
    [builds],
  );

  const loadBuild = useCallback((): void => {
    const href = selected?.href;
    if (!selected || !href) return;
    setEnginePreset(null);
    setLoadedBuild((previous) => ({
      id: selected.id,
      href,
      revision: (previous?.revision ?? 0) + 1,
    }));
  }, [selected]);

  return (
    <>
      {builds.length ? (
        <section className="simulator-reviewed-builds" aria-label="Reviewed pre-raid builds">
          <div className="simulator-reviewed-heading">
            <div>
              <span className="eyebrow">Reviewed calculations · Pre-raid equipment</span>
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
              value={selectedId}
              onChange={(event) => setSelectedId(event.currentTarget.value)}
              aria-describedby={`${selectId}-warning`}
            >
              {!selected ? (
                <option value="" disabled>
                  Custom / engine preset
                </option>
              ) : null}
              {builds.map((build) => (
                <option key={build.id} value={build.id}>
                  {simulatorBuildLabel(build)}
                </option>
              ))}
            </select>
            <button type="button" className="button" onClick={loadBuild} disabled={!selected?.href}>
              Load build
            </button>
          </div>
          <p id={`${selectId}-warning`} className="simulator-reviewed-warning">
            Save your current character first. Loading replaces gear, enchants, talents, rotation,
            race, professions, buffs, consumes and encounter settings in this browser.
          </p>
          {selected && selected.referenceDps !== null ? (
            <p className="simulator-reviewed-reference">
              {selected.referenceDps.toFixed(2)} modeled DPS ·{" "}
              {(selected.validationIterations ?? 400000).toLocaleString("en-US")} validation fights
              · Scenario-specific, not a cross-class ranking.
            </p>
          ) : null}
          {selected?.requiresProvisionalEnchantOptIn ? (
            <p className="simulator-reviewed-warning">
              Provisional proc models remain OFF. After loading, open Main Hand → Change enchant and
              explicitly allow provisional proc models before simulating this scenario. Repeat after
              a reload; the build never enables them automatically.
            </p>
          ) : null}
          {selected?.rotationGuidance ? (
            <details
              className="simulator-reviewed-assumptions simulator-reviewed-rotation"
              key={`rotation-${selected.id}`}
            >
              <summary>Rotation guide · {selected.rotationGuidance.talents}</summary>
              <p>{rotationGuidanceText(selected.rotationGuidance.scenario)}</p>
              {selected.rotationGuidance.instruction ? (
                <p>{rotationGuidanceText(selected.rotationGuidance.instruction)}</p>
              ) : null}
              <ol>
                {selected.rotationGuidance.priorities.map((priority) => (
                  <li key={priority}>{rotationGuidanceText(priority)}</li>
                ))}
              </ol>
              {selected.rotationGuidance.caveats.map((caveat) => (
                <p key={caveat}>{rotationGuidanceText(caveat)}</p>
              ))}
            </details>
          ) : null}
          {selected?.warnings.length ? (
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
            {enginePreset
              ? `Engine preset selected: ${enginePreset}. Your race, buffs and encounter are unchanged. Load build applies the complete tested scenario.`
              : selected && (loadedBuild?.id === selected.id || initialBuildId === selected.id)
                ? "Reviewed setup selected for the engine below. Loading never starts a simulation."
                : "Choose Load build to apply this setup to the engine below."}
          </p>
        </section>
      ) : null}
      <ForeverSimulatorFrame
        key={`${loadedBuild?.id ?? "saved"}:${loadedBuild?.revision ?? 0}`}
        src={withHelperBasePath(loadedBuild?.href ?? src)}
        title={title}
        onPresetSelected={selectEnginePreset}
        onLoadSelectedBuild={selected?.href ? loadBuild : undefined}
      />
    </>
  );
}
