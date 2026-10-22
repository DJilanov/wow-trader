import Link from "next/link";
import type { CampaignGuideSection } from "@wow-trader/leveling";
import { guideGroupBarLabel, guideMembers } from "../lib/leveling-guide-presentation";
import styles from "./leveling-guide.module.css";

interface ChapterHandoffProps {
  readonly guide: CampaignGuideSection;
  readonly next: { readonly title: string; readonly href: string } | null;
}

export function LevelingCampaignHandoff({ guide, next }: ChapterHandoffProps): React.JSX.Element {
  const members = guideMembers(guide);
  const completeEstimate = members.every((member) => member.endpoint !== null);
  return (
    <section
      className={styles.handoff}
      aria-label="Chapter result"
      data-chapter-result={guide.chapter.id}
    >
      <span className="eyebrow">After this chapter</span>
      {completeEstimate ? (
        <p>
          Expected finish:{" "}
          <strong>{guideGroupBarLabel(members.map((member) => member.endpoint))}</strong>
        </p>
      ) : (
        <p>
          Follow the tasks above. The finish estimate is incomplete because some XP data is missing.
        </p>
      )}
      {next && (
        <>
          <p>Finish the tasks above, then head to {next.title}.</p>
          <Link href={next.href}>Continue to {next.title} →</Link>
        </>
      )}
    </section>
  );
}
