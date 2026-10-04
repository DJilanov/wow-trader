"use client";

import Link from "next/link";
import {
  getChapterLabel,
  type ChapterReference,
  type CharacterProfile,
} from "@wow-trader/leveling";
import { resolveChapterHandoff } from "../lib/leveling-handoff";
import { levelingChapterPath, levelingDashboardPath } from "../lib/leveling-experience";
import styles from "./leveling-experience.module.css";
import { useLeveling } from "./leveling-provider";

interface HandoffProps {
  readonly chapter: ChapterReference;
  readonly profile: CharacterProfile;
  readonly publishedIds: readonly string[];
  readonly unresolved: number;
  readonly remaining: readonly {
    readonly anchor: string;
    readonly title: string;
    readonly skipped: boolean;
  }[];
}
export function LevelingChapterHandoff({
  chapter,
  profile,
  publishedIds,
  unresolved,
  remaining,
}: HandoffProps): React.JSX.Element {
  const handoff = resolveChapterHandoff(chapter, profile, publishedIds);
  const { session } = useLeveling();
  const editSetup =
    session &&
    session.profile.faction === profile.faction &&
    session.profile.raceId === profile.raceId
      ? `/forever/leveling?stage=style&edit=${encodeURIComponent(session.id)}`
      : "/forever/leveling";
  return (
    <section
      id="chapter-handoff"
      className={styles.chapterHandoff}
      aria-labelledby="handoff-heading"
    >
      <span className="eyebrow">Before leaving this chapter</span>
      <h2 id="handoff-heading">Check your next move.</h2>
      <p>
        {remaining.length === 0
          ? "All resolved, non-optional instructions are marked done."
          : `${remaining.length} non-optional instruction(s) remain unfinished. Skipping does not satisfy a prerequisite.`}
      </p>
      {remaining.length > 0 && (
        <details className={styles.guideDetails}>
          <summary>Review unfinished instructions</summary>
          <ul>
            {remaining.map((entry) => (
              <li key={entry.anchor}>
                <a href={`#${entry.anchor}`}>{entry.title}</a>
                {entry.skipped && " · skipped, not completed"}
              </li>
            ))}
          </ul>
        </details>
      )}
      {unresolved > 0 && (
        <p className={styles.notice}>
          {unresolved} conditional instruction(s) still need review. Choose your class and XP rate,
          and verify game-state checks before relying on the handoff.
        </p>
      )}
      <p>{handoff.message}</p>
      <div className={styles.backupActions}>
        {handoff.targets.map((target) => (
          <Link
            className={styles.button}
            key={target.id}
            href={levelingChapterPath(profile, target.id)}
          >
            Source continuation: {getChapterLabel(target, profile).title} →
          </Link>
        ))}
        <Link href={levelingDashboardPath(profile)}>I'm ahead / behind · choose a bracket</Link>
        <Link href={editSetup}>My group changed · adjust setup</Link>
      </div>
      <small>
        Browser checkmarks are not a quest-log check. Entering another chapter does not complete or
        discard any earlier instruction. Travel directions remain those in the source.
      </small>
    </section>
  );
}
