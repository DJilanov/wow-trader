"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  emptyPremadeProgress,
  recommendCampaignCatchUp,
  type CampaignPlan,
  type PremadeProgress,
} from "@wow-trader/leveling";
import { useLeveling } from "./leveling-provider";
import { campaignChapterPath } from "../lib/leveling-route-plan";
import styles from "./leveling-xp-budget.module.css";

export function LevelingCatchUpSuggestions({
  plan,
  legId,
  progress,
}: {
  readonly plan: CampaignPlan;
  readonly legId: string;
  readonly progress: PremadeProgress;
}): React.JSX.Element | null {
  const { session, setDungeonPlan } = useLeveling();
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const leg = plan.legs.find((entry) => entry.id === legId);
  const choices = useMemo(
    () => recommendCampaignCatchUp(plan, legId, progress),
    [plan, legId, progress],
  );
  if (!leg || leg.kind !== "xp-bridge") return null;
  const selected = progress.selectedBatches?.[legId] ?? [];
  const defaults = plan.defaultCatchUpBatches?.[legId] ?? [];
  const active =
    session?.profile.raceId === plan.race &&
    session.profile.classSlug === plan.leaderClass &&
    session.profile.party.size === 5;
  function addBatch(id: string): void {
    const choice = choices.find((entry) => entry.batchId === id);
    const batch = plan.catchUpBatches?.find((entry) => entry.id === id);
    if (!active || !session || !choice || !batch) return;
    const actionId = `${legId}-${batch.actions[0]!.id}`;
    setDungeonPlan(session.id, (current) => {
      const saved = current.premade ?? emptyPremadeProgress();
      return {
        ...current,
        premade: {
          ...saved,
          selectedBatches: {
            ...saved.selectedBatches,
            [legId]: [...new Set([...(saved.selectedBatches[legId] ?? []), id])],
          },
          campaigns: {
            ...saved.campaigns,
            [plan.release]: {
              completion: {},
              ...saved.campaigns[plan.release],
              selectedActionId: actionId,
            },
          },
        },
      };
    });
    setNotice(
      "Quest batch added to this phase. Check all five players' pickup eligibility in game; no XP or completion has been granted.",
    );
    router.push(campaignChapterPath(plan, legId, actionId));
  }
  function removeBatch(id: string): void {
    if (!active || !session) return;
    const first = plan.actions.find((action) => action.legId === legId);
    if (!first) return;
    setDungeonPlan(session.id, (current) => {
      const saved = current.premade ?? emptyPremadeProgress();
      return {
        ...current,
        premade: {
          ...saved,
          selectedBatches: {
            ...saved.selectedBatches,
            [legId]: (saved.selectedBatches[legId] ?? []).filter((batchId) => batchId !== id),
          },
          campaigns: {
            ...saved.campaigns,
            [plan.release]: {
              completion: {},
              ...saved.campaigns[plan.release],
              selectedActionId: first.id,
            },
          },
        },
      };
    });
    setNotice(
      "Batch removed from this plan. Actual XP, quest states and completed checks have been preserved.",
    );
    router.push(campaignChapterPath(plan, legId, first.id));
  }
  return (
    <details className={styles.budget} data-catchup-options={legId}>
      <summary>Additional shared-kill quests · target {leg.to}</summary>
      <p>
        Quest rewards stay whole for each eligible player; combat planning is only 1/5 of solo kill
        XP. These complete source-backed quest batches exclude collection farms and unclassified
        objectives. Ranked by reward for the XP-lagging players, not an unmeasured XP/hour claim.
      </p>
      {defaults.length > 0 && (
        <p>
          {defaults.length} validated batch(es) are already part of the default route and disappear
          automatically once every player reaches this checkpoint.
        </p>
      )}
      {selected.length > 0 && (
        <p>
          {selected.length} batch(es) already added to the ordered quest list. Previously reported
          quest rewards are never paid twice.
        </p>
      )}
      <ul>
        {selected.map((id) => (
          <li key={id}>
            {plan.catchUpBatches?.find((batch) => batch.id === id)?.title ?? id}
            <button type="button" disabled={!active} onClick={() => removeBatch(id)}>
              Remove from plan
            </button>
          </li>
        ))}
      </ul>
      {!choices.length && (
        <p>
          No additional batch currently has enough reward and eligibility evidence for your party.
          Record fresh bars for all five and refresh reward data. The remaining XP gap is not
          assumed covered.
        </p>
      )}
      <ul className={styles.rewards}>
        {choices.map((choice) => (
          <li key={choice.batchId}>
            <a href={choice.sourceUrl} target="_blank" rel="noopener noreferrer">
              {choice.title}
            </a>
            <small>
              {choice.zone} · {Math.min(...choice.xpByPlayer).toLocaleString("en-US")}–
              {Math.max(...choice.xpByPlayer).toLocaleString("en-US")} quest XP per player ·
              travel/kill time unmeasured
            </small>
            <button type="button" disabled={!active} onClick={() => addBatch(choice.batchId)}>
              Add this quest batch
            </button>
          </li>
        ))}
      </ul>
      {notice && <p role="status">{notice}</p>}
    </details>
  );
}
