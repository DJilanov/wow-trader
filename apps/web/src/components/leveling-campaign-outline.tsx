"use client";

import Link from "next/link";
import {
  PREMADE_STOPS,
  campaignOptionalXpReady,
  campaignSectionPreparationChecks,
  premadeEntryLevel,
  type CampaignAction,
  type CampaignPlan,
  type CampaignSection,
  type PremadeProgress,
} from "@wow-trader/leveling";
import { campaignChapterPath } from "../lib/leveling-route-plan";
import styles from "./leveling-campaign-outline.module.css";

interface ChapterOutlineProps {
  readonly plan: CampaignPlan;
  readonly chapter: CampaignSection;
  readonly actions: readonly CampaignAction[];
  readonly progress: PremadeProgress;
}

export function LevelingCampaignOutline({
  plan,
  chapter,
  actions,
  progress,
}: ChapterOutlineProps): React.JSX.Element {
  return (
    <ol className={styles.areas} aria-label={`Locations in ${chapter.title}`}>
      {chapter.areas.map((area) => (
        <li key={area.id} data-campaign-area={area.id}>
          <span className={styles.location}>{area.title}</span>
          <ul>
            {area.legIds.map((id) => {
              const phase = plan.legs.find((entry) => entry.id === id)!;
              const entries = actions.filter((entry) => entry.legId === id);
              const first = entries[0];
              const ready =
                entries.length > 0 &&
                entries.every((entry) => campaignOptionalXpReady(plan, progress, entry));
              if (!first) return null;
              const label =
                phase.kind === "starter"
                  ? "Personal questing"
                  : phase.kind === "xp-bridge"
                    ? "Catch-up only if XP is needed"
                    : phase.kind === "finish"
                      ? "Record actual level 60"
                      : "Quest chains & pickups";
              const link = (
                <Link href={campaignChapterPath(plan, chapter.id, first.id)}>{label}</Link>
              );
              return (
                <li key={id} data-campaign-activity={id}>
                  {ready ? (
                    <details className={styles.optional} data-campaign-catchup="not-needed">
                      <summary>Extra XP not needed for the current party</summary>
                      {link}
                    </details>
                  ) : (
                    link
                  )}
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ol>
  );
}

export function LevelingDungeonPreparation({
  plan,
  chapter,
  progress,
}: Omit<ChapterOutlineProps, "actions">): React.JSX.Element | null {
  if (chapter.kind !== "zone") return null;
  const stop = PREMADE_STOPS.find((entry) => entry.id === chapter.stopId);
  if (!stop) return null;
  const checks = campaignSectionPreparationChecks(plan, chapter, progress);
  const level = premadeEntryLevel(stop, progress, plan.rewardFacts);
  const readyPlayers = progress.members.filter(
    (member) =>
      member.level !== null &&
      member.currentXp !== null &&
      !member.xpNeedsUpdate &&
      member.level >= level,
  ).length;
  return (
    <details className={styles.preparation} data-campaign-preparation={chapter.id}>
      <summary>
        Before {stop.name}
        <small>
          {checks.length ? `${checks.length} quest checks · ` : ""}entry level {level}
        </small>
      </summary>
      <p>{stop.preparation}</p>
      <ul>
        {checks.map((check) => (
          <li key={check.questId} data-preparation-quest={check.questId}>
            <Link href={campaignChapterPath(plan, check.legId, check.actionId)}>{check.title}</Link>
            <small>
              {check.stage === "rewarded"
                ? "Hand in the prerequisite"
                : "Pick up the dungeon quest"}{" "}
              · {check.reportedPlayers}/{check.requiredPlayers} players reported
            </small>
          </li>
        ))}
        <li>
          Check every player's actual level and XP
          <small>
            {readyPlayers}/5 have fresh bars at level {level} or above
          </small>
        </li>
      </ul>
      <p className={styles.note}>
        This is a readiness checklist, not a separate leveling bracket. Follow the quest chains in
        order; these checks do not complete any steps.
      </p>
      {stop.dataStatus === "missing-quest-data" && (
        <p className={styles.warning}>
          Quest bundle unverified. Meeting the level target does not verify access or quests.
        </p>
      )}
    </details>
  );
}
