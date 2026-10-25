"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CampaignGuideSection, CampaignPlan } from "@wow-trader/leveling";
import {
  guideBarLabel,
  guideChapterMessage,
  guideGroupBarLabel,
  guideMembers,
} from "../lib/leveling-guide-presentation";
import styles from "./leveling-guide.module.css";

export function LevelingChapterBudget({
  guide,
  compact = false,
}: {
  readonly guide: CampaignGuideSection;
  readonly compact?: boolean;
}): React.JSX.Element {
  const members = guideMembers(guide);
  return (
    <section
      className={`${styles.summary} ${compact ? styles.compact : ""}`}
      aria-label="Chapter plan"
      data-chapter-plan={guide.chapter.id}
    >
      <dl className={styles.metrics}>
        <div>
          <dt>{guide.basis === "saved-update" ? "From your update" : "Expected entry"}</dt>
          <dd>{guideGroupBarLabel(members.map((member) => member.start))}</dd>
        </div>
        <div>
          <dt>{guide.missingCombat ? "Known quest / kill subtotal" : "Expected finish"}</dt>
          <dd>{guideGroupBarLabel(members.map((member) => member.endpoint))}</dd>
        </div>
        {!compact && (
          <div>
            <dt>{guide.targetKind === "entry" ? "Entry requirement" : "Target level"}</dt>
            <dd className={styles.goal}>Level {guide.targetLevel}</dd>
          </div>
        )}
      </dl>
      {!compact && <p>{guideChapterMessage(guide)}</p>}
      {guide.missingCombat && (
        <p>Partial XP estimate: unmeasured kills and unselected quests are not counted.</p>
      )}
    </section>
  );
}

export function LevelingXpBudget({
  guide,
  plan,
}: {
  readonly guide: CampaignGuideSection;
  readonly plan?: CampaignPlan;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const members = guideMembers(guide);
  return (
    <details
      className={styles.details}
      data-xp-budget={guide.chapter.id}
      onToggle={(event): void => setOpen(event.currentTarget.open)}
    >
      <summary>XP breakdown &amp; assumptions</summary>
      {open && (
        <>
          <p>
            {guide.basis === "saved-update"
              ? "Calculated from your last saved level and XP update."
              : "Calculated from the start of your route: level 1 and 0 XP unless you chose another starting level."}{" "}
            XP carries between chapters. These estimates do not change your recorded progress.
          </p>
          {guide.assumedStarterPlayers.length > 0 && (
            <p>
              Unspecified identities use a provisional starter estimate. Set each player's race and
              class in Settings for their own path. Your recorded XP is never copied to teammates.
            </p>
          )}
          {guide.unavailableStarterPlayers.length > 0 && (
            <p>
              Set the remaining players' Alliance race and class in Settings, or record their XP at
              the rendezvous. No level-1 catch-up grind is assumed for a missing starter path.
            </p>
          )}
          {guide.missingCombat && (
            <p>
              Some kill XP is unavailable and is not counted. A lower estimate does not mean you
              need extra grinding.
            </p>
          )}
          <ul
            className={styles.players}
            aria-label={guide.audience === "personal" ? "Your XP estimate" : "Party XP estimates"}
          >
            {members.map((member) => (
              <li key={member.player}>
                <strong>{guide.audience === "personal" ? "You" : `Player ${member.player}`}</strong>
                <p>
                  {guideBarLabel(member.start)} → {guideBarLabel(member.endpoint)}
                </p>
                <p>
                  {(member.referenceQuestXp + member.estimatedQuestXp).toLocaleString("en-US")}{" "}
                  quest XP
                  {" + "}
                  {Math.max(0, member.combatXp - member.estimatedCombatXp).toLocaleString(
                    "en-US",
                  )}{" "}
                  required-kill XP
                  {member.estimatedCombatXp > 0 &&
                    ` + ${member.estimatedCombatXp.toLocaleString("en-US")} additional combat XP planned at checkpoints`}
                </p>
                {member.endpoint === null && member.knownEndpoint && (
                  <p>
                    Last calculable position: {guideBarLabel(member.knownEndpoint)}. Later XP is not
                    claimed.
                  </p>
                )}
                {member.rewards.length > 0 && (
                  <details className={styles.details}>
                    <summary>Quest rewards · {member.rewards.length}</summary>
                    <ol>
                      {member.rewards.map((reward) => (
                        <li key={`${reward.actionId}-${reward.questId}`}>
                          <a
                            href={`https://www.wowhead.com/forever/quest=${reward.questId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {reward.title}
                          </a>
                          {" · "}
                          {reward.xp === null
                            ? "Reward not available yet"
                            : `${reward.xp.toLocaleString("en-US")} XP`}
                          <small>{reward.source}</small>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
                {member.bundleRewards.length > 0 && (
                  <p>
                    Selected dungeon quest slots are included. Slots without confirmed quest IDs use
                    the configured planning estimate, not a confirmed reward.
                  </p>
                )}
              </li>
            ))}
          </ul>
          <details className={styles.details}>
            <summary>How combat estimates work</summary>
            <p>
              Required quest kills count once. Party members split kill XP by level; each eligible
              player keeps their full quest reward. Drops vary, so estimated kill counts are not
              guaranteed.
            </p>
            <p>
              Extra dungeon trash and boss XP is excluded without a sourced clear path. Group Loot
              does not determine whether a quest item is shared or personal. You can adjust the
              outdoor kill-XP multiplier in Settings.
            </p>
          </details>
          {plan && <LevelingRewardStatus plan={plan} />}
        </>
      )}
    </details>
  );
}

export function LevelingRewardStatus({ plan }: { readonly plan: CampaignPlan }): React.JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const ids = new Set(
    plan.actions.flatMap((action) =>
      action.questChanges
        .filter((change) => change.state === "rewarded")
        .map((change) => change.questId),
    ),
  );
  const available =
    plan.rewardFacts?.filter((fact) => ids.has(fact.questId) && fact.status === "available")
      .length ?? 0;
  return (
    <details className={styles.details} data-xp-evidence={available}>
      <summary>
        Quest data · {available}/{ids.size} rewards available
      </summary>
      <p>
        Current Forever rewards are used where available. Historical values and configured dungeon
        bundles are estimates. Missing rewards are not treated as zero.
      </p>
      {plan.rewardNotice && <p>{plan.rewardNotice}</p>}
      <button
        className={styles.button}
        type="button"
        disabled={pending}
        onClick={(): void => startTransition(() => router.refresh())}
      >
        {pending ? "Refreshing…" : "Refresh quest data"}
      </button>
    </details>
  );
}

export function LevelingLibraryStatus({
  plan,
}: {
  readonly plan: CampaignPlan;
}): React.JSX.Element | null {
  if (!plan.library) return null;
  const selected = plan.library.choices.filter((choice) => choice.role !== "held");
  return (
    <details className={styles.details} data-library-quests={selected.length}>
      <summary>Included quests · {selected.length}</summary>
      <p>
        Questing, dungeon pickups and required prerequisite chains are kept in travel order.
        Optional XP work can be skipped when you are already ready for the next stop.
      </p>
    </details>
  );
}
