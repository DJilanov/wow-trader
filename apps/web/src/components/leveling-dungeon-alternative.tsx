"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  DUNGEON_RELEASE,
  DUNGEON_XP_CALIBRATION,
  emptyDungeonPlan,
  emptyDungeonReplacement,
  offersThanesReplacement,
  estimateThanesReplacement,
  getChapterLabel,
  getDungeonQuest,
  type CharacterProfile,
  type ChapterReference,
  type DungeonReplacementPlan,
  type DungeonCarryover,
} from "@wow-trader/leveling";
import { useLeveling } from "./leveling-provider";
import { levelingChapterPath } from "../lib/leveling-experience";
import styles from "./leveling-dungeon-alternative.module.css";
import { LevelingDungeonPreparation } from "./leveling-dungeon-preparation";

interface AlternativeProps {
  readonly chapter: ChapterReference;
  readonly profile: CharacterProfile;
  readonly sourceAvailable: boolean;
  readonly carryover?: readonly DungeonCarryover[] | undefined;
  readonly compact?: boolean;
}
export function LevelingDungeonAlternative({
  chapter,
  profile,
  sourceAvailable,
  carryover,
  compact = false,
}: AlternativeProps): React.JSX.Element | null {
  const { session, loaded, setDungeonPlan, saveCharacter } = useLeveling();
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const preparationDetails = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const reveal = (): void => {
      if (window.location.hash === "#dungeon-alternative-preparation" && preparationDetails.current)
        preparationDetails.current.open = true;
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);
  const matching =
    session?.profile.faction === profile.faction && session.profile.raceId === profile.raceId
      ? session
      : null;
  const plan = matching?.dungeonPlans[DUNGEON_RELEASE] ?? emptyDungeonPlan();
  const replacement = plan.replacements[chapter.id] ?? emptyDungeonReplacement();
  if (!offersThanesReplacement(chapter, profile)) return null;
  const estimate = estimateThanesReplacement(profile, plan);
  const futurePreview = estimate.coverage === "too-early";
  const comparison = futurePreview
    ? estimateThanesReplacement(
        { ...profile, level: 15 },
        {
          ...plan,
          replacements: {
            ...plan.replacements,
            [chapter.id]: { ...replacement, currentXp: 0, killXp: 0 },
          },
        },
      )
    : estimate;
  const label = getChapterLabel(chapter, profile);
  const forecast = replacement.xpForecast;
  const coveragePercent =
    comparison.questXp !== null && comparison.neededXp !== null && comparison.neededXp > 0
      ? Math.min(100, Math.round((100 * comparison.questXp) / comparison.neededXp))
      : null;
  function update(change: Partial<DungeonReplacementPlan>): void {
    if (!matching) return;
    setDungeonPlan(matching.id, (current) => ({
      ...current,
      replacements: {
        ...current.replacements,
        [chapter.id]: {
          ...(current.replacements[chapter.id] ?? emptyDungeonReplacement()),
          ...change,
        },
      },
    }));
  }
  const number = (xp: number | null): string => (xp === null ? "Unknown" : xp.toLocaleString());
  return (
    <section
      className={styles.card}
      data-dungeon-alternative="thanes"
      aria-label="Hall of Thanes alternative"
      data-compact={compact}
    >
      <span className={styles.eyebrow}>
        {compact ? "Selected dungeon route" : `Dungeon alternative · ${label.title}`}
      </span>
      <h3>{compact ? "Hall of Thanes · XP summary" : "Hall of Thanes instead?"}</h3>
      {!compact && (
        <>
          <p>
            Replace the level-15 XP work with one dungeon trip. Keep any quest chains needed for
            your next Darkshore chapter.
          </p>
          {coveragePercent !== null && !replacement.xpNeedsUpdate && (
            <div className={styles.xpCoverage}>
              <progress
                value={coveragePercent}
                max={100}
                aria-label="Estimated remaining quest XP coverage"
              />
              <span>≈{coveragePercent}% of remaining XP covered by quests · kills separate</span>
            </div>
          )}
        </>
      )}
      <div className={styles.metrics}>
        <div className={styles.metric}>
          <strong>≈{number(comparison.questXp)}</strong>
          <small>{compact ? "remaining estimated quest XP" : "quest XP · estimated"}</small>
        </div>
        <div className={styles.metric}>
          <strong>{replacement.xpNeedsUpdate ? "Refresh XP" : number(comparison.neededXp)}</strong>
          <small>XP needed to reach 16</small>
        </div>
        <div className={styles.metric}>
          <strong>{replacement.xpNeedsUpdate ? "Refresh XP" : number(comparison.gapXp)}</strong>
          <small>XP still needed · kills / other work</small>
        </div>
      </div>
      {forecast && (
        <p className={styles.note}>
          Original route forecast: ≈{number(forecast.questXp)} quest XP /{" "}
          {number(forecast.neededXp)} XP to the checkpoint at level {forecast.level}. Reported
          hand-ins reduce remaining rewards, not this original forecast.
        </p>
      )}
      {replacement.xpNeedsUpdate && (
        <p className={styles.warning} role="status">
          Quest reward status changed. Update your actual level and XP before using the remaining
          coverage estimate. No estimated reward has been credited as earned XP.
        </p>
      )}
      {!replacement.xpNeedsUpdate && (
        <>
          <p className={styles.status}>
            {estimate.coverage === "too-early"
              ? "Keep the earlier outdoor steps. This alternative starts at level 15."
              : estimate.coverage === "already-ahead"
                ? "You already reached this bracket's target. Thanes is optional for gear, not required XP."
                : estimate.coverage === "covers"
                  ? "Estimated XP covers the level-16 checkpoint. Confirm your actual level after hand-ins."
                  : estimate.coverage === "needs-kills"
                    ? `The ${estimate.questIds.length}-quest bundle needs another ${number(estimate.gapXp)} XP to cover the checkpoint.`
                    : "Check your XP progress before comparing this branch."}
          </p>
          <p className={styles.note}>
            {futurePreview
              ? "Future preview: start at level 15 with zero XP; earlier outdoor steps remain. "
              : estimate.assumedLevel
                ? "Preview assumes level 15. "
                : ""}
            {estimate.assumedProgress ? "Assumes zero current XP. " : ""}
            {futurePreview || replacement.killXp === null
              ? "No kill XP is counted yet. "
              : "Kill XP is your per-player estimate. "}
            {estimate.savedMinutes === null
              ? "XP coverage is not a speed claim; total trip time is not compared yet."
              : estimate.savedMinutes > 0
                ? `With your time assumptions: approximately ${Math.round(estimate.savedMinutes)} minutes saved.`
                : `With your time assumptions: approximately ${Math.round(-estimate.savedMinutes)} minutes longer.`}
          </p>
        </>
      )}
      {!compact && carryover && (
        <details
          id="dungeon-alternative-preparation"
          className={styles.preparationDetails}
          ref={preparationDetails}
        >
          <summary>{carryover.length} outdoor quest preparations · review before entry</summary>
          {(!profile.classSlug || profile.xpRate === null) && (
            <p className={styles.warning}>
              Choose your class and known outdoor XP rate in Settings to resolve the preparation
              variant.
            </p>
          )}
          <LevelingDungeonPreparation
            quests={carryover}
            reviewed={replacement.carryover}
            enabled={loaded && Boolean(matching)}
            outdoorHref={`${levelingChapterPath(profile, chapter.id)}?outdoor=1`}
            onChange={(value) => update({ carryover: value })}
          />
          <p className={styles.note}>
            Rejoin Darkshore 16–19 after reaching actual level 16 and reviewing these quests.
            Earlier outdoor work is not replaced.
          </p>
        </details>
      )}
      <div className={styles.actions}>
        {!compact && (
          <>
            <button
              className={styles.primary}
              type="button"
              disabled={
                !loaded ||
                !sourceAvailable ||
                !matching ||
                estimate.coverage === "too-early" ||
                estimate.coverage === "unknown"
              }
              onClick={() => {
                if (!carryover && !replacement.active) {
                  router.push(
                    `${levelingChapterPath(profile, chapter.id)}?outdoor=1#dungeon-alternative-preparation`,
                  );
                  return;
                }
                update({
                  active: true,
                  xpForecast: replacement.xpForecast ?? {
                    level: estimate.level,
                    questXp: estimate.questXp,
                    neededXp: estimate.neededXp,
                  },
                });
                router.push(
                  `${levelingChapterPath(profile, chapter.id)}#dungeon-${replacement.stepId ?? "prepare"}`,
                );
              }}
            >
              {replacement.active
                ? "Continue dungeon route"
                : carryover
                  ? "Use dungeon route"
                  : "Review preparation"}
            </button>
          </>
        )}
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? "Hide plan" : "View plan"}
        </button>
        {!compact && replacement.active && (
          <button
            type="button"
            onClick={() => {
              update({ active: false });
              router.push(`${levelingChapterPath(profile, chapter.id)}?outdoor=1`);
            }}
          >
            Keep questing
          </button>
        )}
      </div>
      {!matching && loaded && (
        <p className={styles.note}>
          <button type="button" onClick={() => saveCharacter(profile)}>
            Save character to choose this route
          </button>
        </p>
      )}
      {!sourceAvailable && (
        <p className={styles.warning}>
          The matching source chapter is unavailable. This comparison cannot change your route.
        </p>
      )}
      {expanded && (
        <div>
          <div className={styles.fields}>
            <label>
              Current level
              <input
                type="number"
                min="1"
                max="60"
                disabled={!loaded}
                value={profile.level ?? ""}
                onChange={(event) => {
                  const value = event.target.value === "" ? null : Number(event.target.value);
                  if (value === null || (Number.isInteger(value) && value >= 1 && value <= 60))
                    saveCharacter({ ...profile, level: value }, matching?.id);
                }}
              />
            </label>
            <label>
              Current XP into this level
              <input
                type="number"
                min="0"
                max="1000000"
                value={replacement.currentXp ?? ""}
                disabled={!matching}
                onChange={(event) => {
                  const value = event.target.value === "" ? null : Number(event.target.value);
                  if (
                    value === null ||
                    (Number.isInteger(value) && value >= 0 && value <= 1_000_000)
                  )
                    update({ currentXp: value });
                }}
              />
            </label>
            <label>
              Estimated dungeon kill XP · per player
              <input
                type="number"
                min="0"
                max="1000000"
                disabled={!matching}
                value={replacement.killXp ?? ""}
                onChange={(event) => {
                  const value = event.target.value === "" ? null : Number(event.target.value);
                  if (
                    value === null ||
                    (Number.isInteger(value) && value >= 0 && value <= 1_000_000)
                  )
                    update({ killXp: value });
                }}
              />
            </label>
          </div>
          <ul>
            {comparison.questIds.map((id) => (
              <li key={id}>
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href={`https://www.wowhead.com/forever/quest=${id}`}
                >
                  {getDungeonQuest(id)!.title}
                </a>
                {plan.questStates[String(id)] === "rewarded" ? " · already rewarded; excluded" : ""}
              </li>
            ))}
          </ul>
          <p className={styles.note}>
            Treaty is a conditional extra: up to ≈{number(estimate.fullBundleXp)} quest XP for the
            full first-time bundle. Reach level 16 before picking it up inside; later town hand-ins
            cannot unlock it.
          </p>
          {estimate.reasons.map((reason) => (
            <p key={reason} className={styles.warning}>
              {reason}
            </p>
          ))}
          <details>
            <summary>Compare total trip time</summary>
            <p className={styles.note}>
              Include pickups, group wait, clear, all hand-ins, retained chain work and return
              travel once. No times are invented.
            </p>
            <div className={styles.fields}>
              {(
                [
                  ["tripMinutes", "Total dungeon branch minutes"],
                  ["outdoorMinutes", "Remaining outdoor branch minutes"],
                ] as const
              ).map(([key, title]) => (
                <label key={key}>
                  {title}
                  <input
                    type="number"
                    min="0"
                    max="10000"
                    disabled={!matching}
                    value={replacement[key] ?? ""}
                    onChange={(event) => {
                      const value = event.target.value === "" ? null : Number(event.target.value);
                      if (
                        value === null ||
                        (Number.isFinite(value) && value >= 0 && value <= 10_000)
                      )
                        update({ [key]: value });
                    }}
                  />
                </label>
              ))}
            </div>
          </details>
          <p className={styles.note}>
            Estimate: baseline dungeon quest XP ×{" "}
            {(DUNGEON_XP_CALIBRATION.reportedXp / DUNGEON_XP_CALIBRATION.baselineXp).toFixed(3)}.
            Based on the{" "}
            <a href={DUNGEON_XP_CALIBRATION.source} target="_blank" rel="noopener noreferrer">
              6,200-XP Crest report at level 20
            </a>
            . Not a universal verified bonus. Outdoor prerequisites and kills are not multiplied;
            the build-70205 client curve is not runtime-confirmed.
          </p>
          <Link href={`${levelingChapterPath(profile, chapter.id)}?outdoor=1`}>
            Read the outdoor route →
          </Link>
        </div>
      )}
    </section>
  );
}
