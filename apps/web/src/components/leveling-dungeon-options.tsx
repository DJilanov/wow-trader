"use client";

import Link from "next/link";
import {
  DUNGEON_RELEASE,
  DUNGEON_ITINERARIES,
  REDRIDGE_DUNGEON_ALTERNATIVE,
  FOREVER_XP_CURVE,
  chapterDungeonItineraries,
  dungeonXpEndpoint,
  xpToCheckpoint,
  emptyDungeonPlan,
  dungeonAlternativeKey,
  dungeonTripKey,
  getChapterLabel,
  type CharacterProfile,
  type ChapterReference,
  type DungeonRouteOption,
} from "@wow-trader/leveling";
import { useLeveling } from "./leveling-provider";
import { levelingDungeonPath } from "../lib/leveling-experience";
import { LevelingDungeonItinerary } from "./leveling-dungeon-itinerary";
import styles from "./leveling-dungeon-options.module.css";

export function LevelingDungeonOptions({
  chapter,
  profile,
  anchorId,
}: {
  readonly chapter: ChapterReference;
  readonly profile: CharacterProfile;
  readonly anchorId?: string;
}): React.JSX.Element | null {
  const { session } = useLeveling();
  const plan =
    session?.profile.faction === profile.faction && session.profile.raceId === profile.raceId
      ? (session.dungeonPlans[DUNGEON_RELEASE] ?? emptyDungeonPlan())
      : emptyDungeonPlan();
  const options = chapterDungeonItineraries(chapter, profile, plan);
  if (!options.length) return null;
  const label = getChapterLabel(chapter, profile);
  function card(option: DungeonRouteOption, primary: boolean): React.JSX.Element {
    const replacement =
      chapter.id === REDRIDGE_DUNGEON_ALTERNATIVE.chapterId &&
      REDRIDGE_DUNGEON_ALTERNATIVE.visitIds.some((id) => id === option.visit.id);
    const alternativeKey = dungeonAlternativeKey(chapter.id, option.visit.id);
    const reviewedVariant =
      profile.raceId === "human" && profile.classSlug === "warrior" && profile.xpRate === 1;
    const key =
      replacement && (reviewedVariant || plan.trips[alternativeKey]?.alternative)
        ? alternativeKey
        : dungeonTripKey(chapter.id, option.visit.id);
    const savedTrip = plan.trips[key];
    const legacyKey = dungeonTripKey(chapter.id, option.visit.id);
    const legacyTrip = key !== legacyKey ? plan.trips[legacyKey] : undefined;
    const selected = plan.activeTripId === key;
    const definition = DUNGEON_ITINERARIES[option.visit.id]!;
    const reference = option.schedule.state === "reference-only";
    const startLevel =
      profile.level !== null &&
      (savedTrip || (profile.level >= label.minimumLevel && profile.level < label.maximumLevel))
        ? profile.level
        : Math.max(label.minimumLevel, option.schedule.level ?? label.minimumLevel);
    const enteredXp =
      savedTrip?.currentXp ?? Number(plan.scenarios[option.visit.id]?.fields.currentXp ?? "0");
    const currentXp =
      Number.isSafeInteger(enteredXp) &&
      enteredXp >= 0 &&
      enteredXp < (FOREVER_XP_CURVE[startLevel] ?? 0)
        ? enteredXp
        : null;
    const target = replacement ? 20 : Math.min(60, startLevel + 1);
    const needed =
      currentXp === null || savedTrip?.xpNeedsUpdate
        ? null
        : xpToCheckpoint(startLevel, currentXp, target, FOREVER_XP_CURVE);
    const endpoint =
      option.questXp === null || currentXp === null || savedTrip?.xpNeedsUpdate
        ? null
        : dungeonXpEndpoint(startLevel, currentXp, option.questXp);
    const gap =
      needed === null || option.questXp === null ? null : Math.max(0, needed - option.questXp);
    const number = (value: number | null): string =>
      value === null ? "Unknown" : value.toLocaleString();
    return (
      <article
        key={option.visit.id}
        className={styles.card}
        data-dungeon-option={option.visit.id}
        data-availability={option.schedule.state}
        data-active={selected}
        data-primary={primary}
      >
        <span className={styles.eyebrow}>
          {selected
            ? "Selected alternative"
            : reference
              ? "Future / reference plan"
              : `Alternative · ${label.title}`}
          {` · ${option.schedule.level === null ? "Unscheduled" : `level ${option.schedule.level}+`}`}
        </span>
        <h4>{option.visit.name} instead?</h4>
        <p className={styles.fit}>
          {profile.faction === "alliance" ? definition.allianceFit : definition.hordeFit}
        </p>
        <div className={styles.metrics}>
          <div>
            <strong>
              {option.questXp === null && option.knownXp !== null ? "Subtotal " : ""}
              {option.xpKind === "estimated" ? "≈" : ""}
              {number(option.knownXp)}
            </strong>
            <small>
              {option.questIds.length} selected quests · {option.xpKind} XP
            </small>
          </div>
          <div>
            <strong>{number(needed)}</strong>
            <small>XP to level {target} · checkpoint</small>
          </div>
          <div>
            <strong>{number(gap)}</strong>
            <small>XP still needed · kills / other work</small>
          </div>
        </div>
        <p className={styles.forecast}>
          {endpoint
            ? `Quest rewards alone: ≈${startLevel} → ${endpoint.level} + ${endpoint.percent}% of that level.`
            : "A complete XP endpoint needs all reward values."}
        </p>
        <p className={styles.note}>
          Preview starts at level {startLevel} with {number(currentXp)} XP. No kills or prerequisite
          rewards counted here.
          {reference
            ? " Reference values are not a current-build promise."
            : " Estimates are not earned XP or a speed claim."}
        </p>
        {option.schedule.state !== "ready" && (
          <p className={styles.status}>{option.schedule.reasons.join(" ")}</p>
        )}
        {savedTrip?.xpNeedsUpdate && (
          <p className={styles.status}>
            Reward status changed. Refresh actual XP before comparing this plan.
          </p>
        )}
        {replacement && (
          <p className={styles.note}>
            Reviewed 19→20 continuation for Human Warrior, 1× outdoor XP: keep class preparation,
            the later Redridge chain and Cooking. Other variants keep their saved outdoor step.
          </p>
        )}
        <details className={styles.planDetails} data-itinerary-preview>
          <summary>View the plan · pickups → dungeon → hand-ins → continue</summary>
          <LevelingDungeonItinerary option={option} profile={profile} plan={plan} />
        </details>
        <Link
          className={styles.action}
          prefetch={false}
          href={`${levelingDungeonPath(profile, option.visit.id, chapter.id, true)}${selected && savedTrip ? `#trip-${savedTrip.stepId}` : ""}`}
        >
          {selected
            ? "Resume alternative"
            : savedTrip
              ? "Review saved alternative"
              : reference
                ? "Review future plan"
                : "Plan this alternative"}{" "}
          →
        </Link>
        {legacyTrip && (
          <p className={styles.note}>
            <Link
              prefetch={false}
              href={`${levelingDungeonPath(profile, option.visit.id, chapter.id)}#trip-${legacyTrip.stepId}`}
            >
              {plan.activeTripId === legacyKey
                ? "Resume selected optional trip"
                : "Review earlier saved optional trip"}{" "}
              →
            </Link>
          </p>
        )}
      </article>
    );
  }
  return (
    <section
      id={anchorId}
      className={styles.options}
      data-chapter-dungeon-options
      aria-label={`Dungeon alternatives for ${label.title}`}
    >
      <header className={styles.header}>
        <h3>
          Dungeon alternatives <span>{options.length}</span>
        </h3>
        <small>At level or later · full-trip planning</small>
      </header>
      {card(options[0]!, true)}
      {options.length > 1 && (
        <details className={styles.otherPlans} data-other-dungeon-plans>
          <summary>Other dungeon alternatives ({options.length - 1}) · compare the journey</summary>
          <div className={styles.list}>{options.slice(1).map((option) => card(option, false))}</div>
        </details>
      )}
    </section>
  );
}
