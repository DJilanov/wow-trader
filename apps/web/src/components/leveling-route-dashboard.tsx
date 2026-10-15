"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { CampaignPlan } from "@wow-trader/leveling";
import { LevelingDashboard, type LevelingDashboardProps } from "./leveling-dashboard";
import { LevelingCampaignPath } from "./leveling-campaign-path";
import { useLeveling } from "./leveling-provider";
import { levelingPlanDashboardPath, levelingRouteMode } from "../lib/leveling-route-plan";
import styles from "./leveling-experience.module.css";

interface RouteDashboardProps extends LevelingDashboardProps {
  readonly campaign: CampaignPlan | null;
  readonly requestedMode: string | undefined;
}

export function LevelingRouteDashboard({
  campaign,
  requestedMode,
  ...props
}: RouteDashboardProps): React.JSX.Element {
  const { session, loaded } = useLeveling();
  const router = useRouter();
  const matching =
    session?.profile.faction === props.defaultProfile.faction &&
    session.profile.raceId === props.defaultProfile.raceId
      ? session
      : null;
  const profile = matching?.profile ?? props.defaultProfile;
  const mode = levelingRouteMode(requestedMode, props.defaultProfile.faction);
  const needsClass =
    mode === "premade" &&
    campaign !== null &&
    matching !== null &&
    matching.profile.classSlug !== campaign.leaderClass;
  useEffect(() => {
    if (loaded && needsClass)
      router.replace(levelingPlanDashboardPath(profile, "premade"), { scroll: false });
  }, [loaded, needsClass, profile, router]);
  return (
    <>
      {profile.faction === "alliance" && (
        <nav className={styles.profileBar} aria-label="Leveling route edition">
          <span>Quest route</span>
          <Link
            href={levelingPlanDashboardPath(profile, "questing")}
            aria-current={mode === "questing" ? "page" : undefined}
          >
            Solo / small group
          </Link>
          <Link
            href={levelingPlanDashboardPath(profile, "premade")}
            aria-current={mode === "premade" ? "page" : undefined}
          >
            Premade 5 · dungeon questing
          </Link>
        </nav>
      )}
      {mode === "questing" ? (
        <LevelingDashboard {...props} />
      ) : !campaign ? (
        <section>
          <h1>Premade quest route unavailable</h1>
          <p>
            The validated source archive is unavailable. No replacement instructions or rewards are
            invented. You can still select the original outdoor edition above.
          </p>
        </section>
      ) : loaded && needsClass ? (
        <p role="status">Loading your race and class quest route…</p>
      ) : (
        <LevelingCampaignPath plan={campaign} profile={profile} />
      )}
    </>
  );
}
