import Link from "next/link";
import styles from "./forever-dps-ranking-links.module.css";

export function ForeverHealerRankingLinks(): React.JSX.Element {
  return (
    <nav className={styles.links} aria-label="Compare WoW Forever healers">
      <Link href="/forever/tier-list/healers" prefetch={false}>
        <strong>WoW Forever Healer rankings →</strong>
        <span>Tank healing, group healing and burst recovery with current pre-raid builds.</span>
      </Link>
    </nav>
  );
}
